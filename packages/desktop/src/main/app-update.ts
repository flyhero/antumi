import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { compareVersions, isVersion, type UpdateState } from '../shared/app-update'

// Releases as GitHub's REST API lists them; only what picking one needs.
const Asset = z.object({ name: z.string().regex(/^[^/\\]+$/), browser_download_url: z.string().url(), size: z.number(), digest: z.string().nullish() })
const Release = z.object({
  tag_name: z.string(),
  body: z.string().nullish(),
  html_url: z.string().url(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(Asset)
})
export type Release = z.infer<typeof Release>
export type ReleaseAsset = z.infer<typeof Asset>

export const RELEASES_REPO = 'flyhero/antumi'
const NOTES_LIMIT = 20_000
const CHECK_EVERY = 6 * 60 * 60 * 1000
const FIRST_CHECK = 10_000
const RETRY_AFTER = 10 * 60_000
const FEED_TAG = /<link\b[^>]*\bhref="[^"]*\/releases\/tag\/([^"]+)"/g
const CHECKSUM_LINE = /^([0-9a-f]{64})\s+\*?(\S+)$/

// The newest published release above the running version, a pre-release only when the user takes
// them. A skipped version is still found, so the settings page can say it is there.
export function newestRelease(releases: readonly Release[], current: string, prerelease: boolean): Release | null {
  let best: Release | null = null
  for (const release of releases) {
    if (release.draft || (release.prerelease && !prerelease) || !isVersion(release.tag_name)) continue
    if (compareVersions(release.tag_name, current) <= 0) continue
    if (!best || compareVersions(release.tag_name, best.tag_name) > 0) best = release
  }
  return best
}

// How the app came onto a Linux machine: the AppImage replaces itself, a deb is only offered.
export type LinuxPackage = 'AppImage' | 'deb'

// The installer built for this machine: the dmg for this Mac's architecture, the Windows setup,
// on Linux the package the app came as, named with Linux's names for the architecture.
export function installerFor(release: Release, platform: NodeJS.Platform, arch: string, linuxPackage: LinuxPackage = 'AppImage'): ReleaseAsset | null {
  const suffix = platform === 'darwin' ? `-${arch}.dmg`
    : platform === 'win32' ? `-${arch}.exe`
      : platform === 'linux' ? (linuxPackage === 'deb' ? `-${arch === 'x64' ? 'amd64' : arch}.deb` : `-${arch === 'x64' ? 'x86_64' : arch}.AppImage`)
        : null
  return suffix ? (release.assets.find((asset) => asset.name.endsWith(suffix)) ?? null) : null
}

export function versionOf(release: Release): string {
  return release.tag_name.replace(/^v/, '')
}

// An install refused because the daemon still runs these sessions.
export class InstallBlocked extends Error {
  constructor(readonly blockers: UpdateState['blockers']) {
    super('agents-running')
  }
}

const Preferences = z.object({ automatic: z.boolean().catch(true), prerelease: z.boolean().catch(false), skipped: z.string().nullable().catch(null) })
type Preferences = z.infer<typeof Preferences>

export type UpdaterOptions = {
  current: string
  platform: NodeJS.Platform
  arch: string
  linuxPackage?: LinuxPackage
  // GitHub's API, or a stand-in serving the same shape (ANTUMI_UPDATE_API, for trying an update).
  api: string
  // GitHub's site, read when the API refuses; github.com unless a test stands in for it.
  site?: string
  preferencesFile: string
  downloads: string
  fetch: (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>
  // Why the app cannot replace itself here, or null when it can.
  installBlocked: () => Promise<string | null>
  // Puts the app from the downloaded installer in place of this one and restarts into it.
  install: (installer: string, version: string) => Promise<void>
  publish: (state: UpdateState) => void
}

// Downloads updates in the background; applies a verified pending download on the next launch.
export class AppUpdater {
  private state: UpdateState
  private release: Release | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private firstCheck: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private stopped = false
  private automaticRun: Promise<void> | null = null
  private retryAt = 0
  private saving: Promise<void> = Promise.resolve()
  private checking: Promise<void> | null = null
  private installing: Promise<void> | null = null
  private downloaded: string | null = null
  private downloadedAsset: string | null = null

  constructor(private readonly options: UpdaterOptions) {
    this.state = { current: options.current, status: 'idle', latest: null, canInstall: false, progress: null, error: null, blockers: [], checkedAt: null, prerelease: false, skipped: null, automatic: true }
  }

  // True when installation took over startup and will relaunch the application.
  async start(): Promise<boolean> {
    this.stopped = false
    const preferences = await this.preferences()
    if (this.stopped) return false
    this.set(preferences)
    await this.restorePending()
    if (this.state.status === 'ready' && this.canDownloadAutomatically()) {
      await this.install()
      if (this.current().status === 'installing') return true
    }
    if (this.stopped) return false
    this.firstCheck = setTimeout(() => void this.check(), FIRST_CHECK)
    this.firstCheck.unref?.()
    this.retryTimer = setInterval(() => void this.runAutomatic(), RETRY_AFTER)
    this.retryTimer.unref?.()
    this.timer = setInterval(() => void this.check(), CHECK_EVERY)
    this.timer.unref?.()
    return false
  }

  stop(): void {
    this.stopped = true
    if (this.firstCheck) clearTimeout(this.firstCheck)
    if (this.retryTimer) clearInterval(this.retryTimer)
    this.firstCheck = null
    this.retryTimer = null
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  current(): UpdateState {
    return this.state
  }

  check(): Promise<void> {
    if (this.automaticRun) return this.automaticRun
    if (this.busy()) return Promise.resolve()
    this.checking ??= this.fetchNewest().then(() => this.runAutomatic()).finally(() => { this.checking = null })
    return this.checking
  }

  async setPrerelease(prerelease: boolean): Promise<void> {
    await this.savePreferences({ prerelease })
    this.set({ prerelease })
    await this.check()
  }

  async setAutomatic(automatic: boolean): Promise<void> {
    await this.savePreferences({ automatic })
    this.set({ automatic })
    if (automatic) void this.check()
  }

  async skip(version: string | null): Promise<void> {
    await this.savePreferences({ skipped: version })
    this.set({ skipped: version })
  }

  install(): Promise<void> {
    this.installing ??= this.installNow().finally(() => { this.installing = null })
    return this.installing
  }

  private async installNow(): Promise<void> {
    if (this.automaticRun) await this.automaticRun
    const release = this.release
    const asset = release && installerFor(release, this.options.platform, this.options.arch, this.options.linuxPackage)
    if (!release || !asset || this.busy() || this.state.status === 'checking' || !this.state.canInstall) return
    try {
      const file = await this.downloadRelease(release, asset)
      this.set({ status: 'installing', progress: null, error: null, blockers: [] })
      await this.options.install(file, versionOf(release))
    } catch (error) {
      this.failed(error)
    }
  }

  private canDownloadAutomatically(): boolean {
    const release = this.release
    const asset = release && installerFor(release, this.options.platform, this.options.arch, this.options.linuxPackage)
    return !this.stopped && this.state.automatic && this.state.canInstall
      && Boolean(release && versionOf(release) !== this.state.skipped && (!release.prerelease || this.state.prerelease))
      && Boolean(asset?.digest?.match(/^sha256:[0-9a-f]{64}$/))
  }

  private runAutomatic(): Promise<void> {
    if (this.automaticRun) return this.automaticRun
    const release = this.release
    const asset = release && installerFor(release, this.options.platform, this.options.arch, this.options.linuxPackage)
    if (!release || !asset || !this.canDownloadAutomatically() || this.hasDownload(asset) || this.busy()
      || this.state.status === 'checking' || Date.now() < this.retryAt) return Promise.resolve()
    this.automaticRun = this.downloadRelease(release, asset).then(() => {
      this.set({ status: 'ready', progress: null, error: null, blockers: [] })
    }).catch((error: unknown) => {
      this.retryAt = Date.now() + RETRY_AFTER
      this.failed(error)
    }).finally(() => { this.automaticRun = null })
    return this.automaticRun
  }

  private async downloadRelease(release: Release, asset: ReleaseAsset): Promise<string> {
    const file = join(this.options.downloads, asset.name)
    if (!this.hasDownload(asset)) {
      this.set({ status: 'downloading', progress: 0, error: null, blockers: [] })
      await this.download(asset, file)
      // A complete, verified installer survives quitting; partial files are never marked pending.
      if (asset.digest?.match(/^sha256:[0-9a-f]{64}$/)) {
        const temporary = `${this.pendingFile}.tmp`
        await writeFile(temporary, JSON.stringify(release))
        await rename(temporary, this.pendingFile)
      }
      this.downloaded = file
      this.downloadedAsset = JSON.stringify(asset)
    }
    return file
  }

  private get pendingFile(): string {
    return join(this.options.downloads, 'pending.json')
  }

  private async restorePending(): Promise<void> {
    const text = await readFile(this.pendingFile, 'utf8').catch(() => null)
    if (!text) return
    try {
      const release = Release.parse(JSON.parse(text))
      if (!isVersion(release.tag_name) || compareVersions(release.tag_name, this.options.current) <= 0) {
        await rm(this.pendingFile, { force: true })
        const applied = installerFor(release, this.options.platform, this.options.arch, this.options.linuxPackage)
        if (applied) await rm(join(this.options.downloads, applied.name), { force: true })
        return
      }
      const asset = installerFor(release, this.options.platform, this.options.arch, this.options.linuxPackage)
      if (!asset?.digest?.match(/^sha256:[0-9a-f]{64}$/) || release.draft || (release.prerelease && !this.state.prerelease)) return
      this.offer(release, asset, await this.options.installBlocked() === null)
      const file = join(this.options.downloads, asset.name)
      const hash = createHash('sha256')
      let size = 0
      try {
        for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length }
      } catch { throw new Error('download-failed') }
      if (asset.size > 0 && size !== asset.size) throw new Error('incomplete')
      if (`sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('digest-mismatch')
      this.downloaded = file
      this.downloadedAsset = JSON.stringify(asset)
      this.set({ status: 'ready' })
    } catch (error) {
      await rm(this.pendingFile, { force: true }).catch(() => {})
      if (this.release) this.failed(error)
    }
  }

  private failed(error: unknown): void {
    this.set({ status: 'error', progress: null, error: error instanceof Error ? error.message : String(error), blockers: error instanceof InstallBlocked ? error.blockers : [] })
  }

  private hasDownload(asset: ReleaseAsset): boolean {
    return this.downloaded === join(this.options.downloads, asset.name) && this.downloadedAsset === JSON.stringify(asset)
  }

  private busy(): boolean {
    return this.state.status === 'downloading' || this.state.status === 'installing'
  }

  private offer(release: Release, asset: ReleaseAsset | null, canInstall: boolean): void {
    this.release = release
    this.set({
      status: asset && this.hasDownload(asset) ? 'ready' : 'available',
      canInstall,
      latest: { version: versionOf(release), notes: (release.body ?? '').slice(0, NOTES_LIMIT), page: release.html_url, download: asset?.browser_download_url ?? null }
    })
  }

  private async fetchNewest(): Promise<void> {
    this.set({ status: 'checking', error: null })
    try {
      const { releases, feed } = await this.releases()
      const newest = newestRelease(releases, this.options.current, this.state.prerelease)
      const release = newest && feed ? await this.withChecksums(newest) : newest
      if (release) {
        const asset = installerFor(release, this.options.platform, this.options.arch, this.options.linuxPackage)
        this.offer(release, asset, asset !== null && await this.options.installBlocked() === null)
        this.set({ checkedAt: Date.now() })
      } else {
        this.release = null
        this.set({ status: 'none', latest: null, canInstall: false, checkedAt: Date.now() })
      }
    } catch (error) {
      // A verified pending installer remains usable even when the network is unavailable.
      const asset = this.release && installerFor(this.release, this.options.platform, this.options.arch, this.options.linuxPackage)
      this.set({ status: asset && this.hasDownload(asset) ? 'ready' : this.release ? 'available' : 'error', checkedAt: Date.now(), error: error instanceof Error ? error.message : String(error) })
    }
  }

  private get site(): string {
    return this.options.site ?? 'https://github.com'
  }

  // The API answers 403 or 429 once an address has spent its hourly allowance, as a VPN shared by
  // many soon does; the site's Atom feed is not counted against it, so the check goes on there.
  private async releases(): Promise<{ releases: Release[]; feed: boolean }> {
    const headers = { 'user-agent': `Antumi/${this.options.current}` }
    const response = await this.options.fetch(`${this.options.api}/repos/${RELEASES_REPO}/releases?per_page=20`, { headers: { ...headers, accept: 'application/vnd.github+json' } })
    if (response.ok) {
      const releases = z.array(z.unknown()).parse(await response.json()).flatMap((entry) => {
        const parsed = Release.safeParse(entry)
        return parsed.success ? [parsed.data] : []
      })
      return { releases, feed: false }
    }
    const refused = `GitHub ${response.status}`
    if (response.status !== 403 && response.status !== 429) throw new Error(refused)
    const feed = await this.options.fetch(`${this.site}/${RELEASES_REPO}/releases.atom`, { headers })
    if (!feed.ok) throw new Error(refused)
    // The feed has neither assets nor a pre-release flag; the release workflow marks a version
    // with a pre-release part as one, and assets come from its checksums once one is picked.
    const tags = [...(await feed.text()).matchAll(FEED_TAG)].map((match) => decodeURIComponent(match[1] ?? ''))
    return {
      feed: true,
      releases: tags.map((tag) => ({ tag_name: tag, body: '', html_url: `${this.site}/${RELEASES_REPO}/releases/tag/${tag}`, draft: false, prerelease: tag.includes('-'), assets: [] }))
    }
  }

  // A release read from the feed gets the installers its SHA256SUMS lists, each with that digest,
  // so they are verified as the API's would be. Without the file (releases before it, or no way to
  // reach it) it has none: the user is sent to the release page rather than run an unchecked one.
  private async withChecksums(release: Release): Promise<Release> {
    const base = `${this.site}/${RELEASES_REPO}/releases/download/${encodeURIComponent(release.tag_name)}`
    try {
      const response = await this.options.fetch(`${base}/SHA256SUMS`, { headers: { 'user-agent': `Antumi/${this.options.current}` } })
      if (!response.ok) return release
      const assets = (await response.text()).split(/\r?\n/).flatMap((line) => {
        const match = CHECKSUM_LINE.exec(line.trim())
        return match?.[1] && match[2] ? [{ name: match[2], browser_download_url: `${base}/${encodeURIComponent(match[2])}`, size: 0, digest: `sha256:${match[1]}` }] : []
      })
      return { ...release, assets }
    } catch {
      return release
    }
  }

  private async download(asset: ReleaseAsset, file: string): Promise<void> {
    this.downloaded = null
    this.downloadedAsset = null
    await mkdir(dirname(file), { recursive: true })
    await rm(file, { force: true })
    const response = await this.options.fetch(asset.browser_download_url, { headers: { 'user-agent': `Antumi/${this.options.current}` } })
    if (!response.ok || !response.body) throw new Error('download-failed')
    const hash = createHash('sha256')
    const out = createWriteStream(file)
    let received = 0
    let shown = 0
    try {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        received += value.byteLength
        if (!out.write(value)) await new Promise((resolve) => out.once('drain', resolve))
        const progress = asset.size > 0 ? Math.min(1, received / asset.size) : 0
        if (progress - shown >= 0.01) {
          shown = progress
          this.set({ progress })
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())))
    }
    if (asset.size > 0 && received !== asset.size) throw new Error('incomplete')
    const expected = asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : null
    if (expected && hash.digest('hex') !== expected) throw new Error('digest-mismatch')
  }

  private set(change: Partial<UpdateState>): void {
    this.state = { ...this.state, ...change }
    this.options.publish(this.state)
  }

  private async preferences(): Promise<Preferences> {
    const text = await readFile(this.options.preferencesFile, 'utf8').catch(() => '{}')
    try {
      return Preferences.parse(JSON.parse(text))
    } catch {
      return { prerelease: false, skipped: null, automatic: true }
    }
  }

  private savePreferences(change: Partial<Preferences>): Promise<void> {
    const save = this.saving.catch(() => {}).then(async () => {
      const next = { ...(await this.preferences()), ...change }
      await mkdir(dirname(this.options.preferencesFile), { recursive: true })
      const temporary = `${this.options.preferencesFile}.tmp`
      await writeFile(temporary, JSON.stringify(next, null, 2))
      await rename(temporary, this.options.preferencesFile)
    })
    this.saving = save
    return save
  }
}
