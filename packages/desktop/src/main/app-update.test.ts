import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compareVersions, type UpdateState } from '../shared/app-update'
import { AppUpdater, InstallBlocked, installerFor, newestRelease, type Release, type UpdaterOptions } from './app-update'

const release = (tag: string, change: Partial<Release> = {}): Release => ({
  tag_name: tag,
  body: `notes for ${tag}`,
  html_url: `https://github.com/flyhero/antumi/releases/tag/${tag}`,
  draft: false,
  prerelease: tag.includes('-'),
  assets: [
    { name: `Antumi-${tag.slice(1)}-macos-arm64.dmg`, browser_download_url: `https://example.com/${tag}.dmg`, size: 4, digest: null },
    { name: `Antumi-${tag.slice(1)}-windows-x64.exe`, browser_download_url: `https://example.com/${tag}.exe`, size: 4, digest: null },
    { name: `Antumi-${tag.slice(1)}-linux-x86_64.AppImage`, browser_download_url: `https://example.com/${tag}.AppImage`, size: 4, digest: null },
    { name: `Antumi-${tag.slice(1)}-linux-amd64.deb`, browser_download_url: `https://example.com/${tag}.deb`, size: 4, digest: null }
  ],
  ...change
})

describe('compareVersions', () => {
  it('orders releases, pre-releases before their release, and numeric parts by value', () => {
    const sorted = ['0.19.10', '0.19.2', '0.19.2-beta.10', '0.19.2-beta.2', '0.20.0', '0.19.2-alpha', 'v0.19.1']
      .sort(compareVersions)
    expect(sorted).toEqual(['v0.19.1', '0.19.2-alpha', '0.19.2-beta.2', '0.19.2-beta.10', '0.19.2', '0.19.10', '0.20.0'])
  })
})

describe('newestRelease', () => {
  const releases = [release('v0.19.3'), release('v0.19.6-beta.1'), release('v0.19.5'), release('v0.19.7', { draft: true }), release('nightly')]

  it('offers the newest published release above the running one', () => {
    expect(newestRelease(releases, '0.19.4', false)?.tag_name).toBe('v0.19.5')
    expect(newestRelease(releases, '0.19.5', false)).toBeNull()
  })

  it('counts pre-releases only for a user who takes them', () => {
    expect(newestRelease(releases, '0.19.4', true)?.tag_name).toBe('v0.19.6-beta.1')
  })
})

describe('installerFor', () => {
  it('finds the installers of releases named before the system was in the name', () => {
    const old = release('v0.21.2', { assets: ['Antumi-0.21.2-arm64.dmg', 'Antumi-Setup-0.21.2-x64.exe', 'Antumi-0.21.2-x86_64.AppImage', 'Antumi-0.21.2-amd64.deb']
      .map((name) => ({ name, browser_download_url: `https://example.com/${name}`, size: 4, digest: null })) })
    expect(installerFor(old, 'darwin', 'arm64')?.name).toBe('Antumi-0.21.2-arm64.dmg')
    expect(installerFor(old, 'win32', 'x64')?.name).toBe('Antumi-Setup-0.21.2-x64.exe')
    expect(installerFor(old, 'linux', 'x64')?.name).toBe('Antumi-0.21.2-x86_64.AppImage')
    expect(installerFor(old, 'linux', 'x64', 'deb')?.name).toBe('Antumi-0.21.2-amd64.deb')
  })

  it('picks the dmg for this Mac, the setup for Windows and the package Linux runs from', () => {
    expect(installerFor(release('v1.0.0'), 'darwin', 'arm64')?.name).toBe('Antumi-1.0.0-macos-arm64.dmg')
    expect(installerFor(release('v1.0.0'), 'darwin', 'x64')).toBeNull()
    expect(installerFor(release('v1.0.0'), 'win32', 'x64')?.name).toBe('Antumi-1.0.0-windows-x64.exe')
    expect(installerFor(release('v1.0.0'), 'linux', 'x64')?.name).toBe('Antumi-1.0.0-linux-x86_64.AppImage')
    expect(installerFor(release('v1.0.0'), 'linux', 'x64', 'deb')?.name).toBe('Antumi-1.0.0-linux-amd64.deb')
    expect(installerFor(release('v1.0.0'), 'linux', 'arm64')).toBeNull()
    expect(installerFor(release('v1.0.0'), 'freebsd', 'x64')).toBeNull()
  })
})

describe('AppUpdater', () => {
  const dirs: string[] = []
  const instances: AppUpdater[] = []
  afterEach(() => { vi.useRealTimers(); for (const instance of instances.splice(0)) instance.stop(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

  // apiStatus: what the API answers instead of the releases; feed and sums: the site's Atom feed
  // and a release's SHA256SUMS, absent when not given.
  function updater(releases: Release[], installer: Uint8Array, change: { blocked?: string | null; refuse?: number; busy?: UpdateState['blockers']; apiStatus?: number; feed?: string; sums?: string; onDownload?: () => Promise<void>; onInstall?: () => Promise<void> } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'antumi-update-test-'))
    dirs.push(dir)
    const states: UpdateState[] = []
    const installed: { file: string; version: string }[] = []
    let downloads = 0
    let refusals = change.refuse ?? 0
    const options: UpdaterOptions = {
      current: '0.19.4',
      platform: 'darwin',
      arch: 'arm64',
      api: 'https://api.example.com',
      site: 'https://site.example.com',
      preferencesFile: join(dir, 'update.json'),
      downloads: join(dir, 'downloads'),
      fetch: async (url) => {
        if (url.startsWith('https://api.example.com/')) return change.apiStatus ? new Response('', { status: change.apiStatus }) : Response.json(releases)
        if (url === 'https://site.example.com/flyhero/antumi/releases.atom') return change.feed === undefined ? new Response('', { status: 404 }) : new Response(change.feed)
        if (url.endsWith('/SHA256SUMS')) return change.sums === undefined ? new Response('', { status: 404 }) : new Response(change.sums)
        downloads++
        await change.onDownload?.()
        return new Response(installer)
      },
      installBlocked: async () => change.blocked ?? null,
      install: async (file, version) => {
        if (refusals-- > 0) throw change.busy ? new InstallBlocked(change.busy) : new Error('agents-running')
        await change.onInstall?.()
        installed.push({ file, version })
      },
      publish: (state) => states.push(state)
    }
    const instance = new AppUpdater(options)
    instances.push(instance)
    const restart = (next: Partial<UpdaterOptions> = {}) => {
      instance.stop()
      const restarted = new AppUpdater({ ...options, ...next })
      instances.push(restarted)
      return restarted
    }
    return { instance, restart, dir, states, installed, downloads: () => downloads }
  }

  it('says a newer version is there, and that it can install it in place', async () => {
    const { instance } = updater([release('v0.19.5')], new Uint8Array(4))
    await instance.check()
    expect(instance.current()).toMatchObject({
      status: 'available',
      canInstall: true,
      latest: { version: '0.19.5', notes: 'notes for v0.19.5', download: 'https://example.com/v0.19.5.dmg' }
    })
  })

  it('installs a download that matches its digest, with progress on the way', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const { instance, states, installed } = updater([release('v0.19.5', { assets: [{ name: 'Antumi-0.19.5-arm64.dmg', browser_download_url: 'https://example.com/a.dmg', size: 4, digest }] })], bytes)
    await instance.check()
    await instance.install()
    expect(installed).toHaveLength(1)
    expect(installed[0]?.version).toBe('0.19.5')
    expect([...readFileSync(installed[0]?.file ?? '')]).toEqual([1, 2, 3, 4])
    expect(states.map((state) => state.status)).toContain('downloading')
    expect(instance.current().status).toBe('installing')
  })

  it('refuses a download that does not match what GitHub says of it', async () => {
    const digest = `sha256:${'0'.repeat(64)}`
    const { instance, installed } = updater([release('v0.19.5', { assets: [{ name: 'Antumi-0.19.5-arm64.dmg', browser_download_url: 'https://example.com/a.dmg', size: 4, digest }] })], new Uint8Array(4))
    await instance.check()
    await instance.install()
    expect(installed).toEqual([])
    expect(instance.current()).toMatchObject({ status: 'error', error: 'digest-mismatch' })
  })

  it('leaves installing to the user where the app cannot replace itself', async () => {
    const { instance, installed } = updater([release('v0.19.5')], new Uint8Array(4), { blocked: 'read-only' })
    await instance.check()
    await instance.install()
    expect(instance.current().canInstall).toBe(false)
    expect(installed).toEqual([])
  })

  it('remembers a skipped version and the pre-release choice', async () => {
    const { instance } = updater([release('v0.19.5'), release('v0.19.6-beta.1')], new Uint8Array(4))
    await instance.skip('0.19.5')
    await instance.setPrerelease(true)
    expect(instance.current()).toMatchObject({ skipped: '0.19.5', prerelease: true, latest: { version: '0.19.6-beta.1' } })
  })

  const feed = (...tags: string[]) => `<feed><link rel="alternate" href="https://github.com/flyhero/antumi/releases"/>${tags.map((tag) => `<entry><link rel="alternate" type="text/html" href="https://github.com/flyhero/antumi/releases/tag/${tag}"/></entry>`).join('')}</feed>`

  it('reads the feed when the API refuses, and installs what the release checksums vouch for', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const sums = `${createHash('sha256').update(bytes).digest('hex')}  Antumi-0.19.5-arm64.dmg\n${'0'.repeat(64)}  Antumi-Setup-0.19.5-x64.exe\n`
    const { instance, installed } = updater([], bytes, { apiStatus: 403, feed: feed('v0.19.6-beta.1', 'v0.19.5', 'v0.19.3'), sums })
    await instance.check()
    expect(instance.current()).toMatchObject({
      status: 'ready',
      canInstall: true,
      error: null,
      latest: { version: '0.19.5', page: 'https://site.example.com/flyhero/antumi/releases/tag/v0.19.5', download: 'https://site.example.com/flyhero/antumi/releases/download/v0.19.5/Antumi-0.19.5-arm64.dmg' }
    })
    await instance.install()
    expect(installed).toHaveLength(1)
  })

  it('refuses a feed download its checksum does not match', async () => {
    const sums = `${'0'.repeat(64)}  Antumi-0.19.5-arm64.dmg\n`
    const { instance, installed } = updater([], new Uint8Array(4), { apiStatus: 429, feed: feed('v0.19.5'), sums })
    await instance.check()
    await instance.install()
    expect(installed).toEqual([])
    expect(instance.current()).toMatchObject({ status: 'error', error: 'digest-mismatch' })
  })

  it('sends the user to the release page for a feed release without checksums', async () => {
    const { instance } = updater([], new Uint8Array(4), { apiStatus: 403, feed: feed('v0.19.5') })
    await instance.check()
    expect(instance.current()).toMatchObject({ status: 'available', canInstall: false, latest: { version: '0.19.5', download: null } })
  })

  it('reports the API refusal when the feed fails too, and other API errors as they are', async () => {
    const limited = updater([], new Uint8Array(4), { apiStatus: 403 })
    await limited.instance.check()
    expect(limited.instance.current()).toMatchObject({ status: 'error', error: 'GitHub 403' })
    const broken = updater([], new Uint8Array(4), { apiStatus: 500, feed: feed('v0.19.5') })
    await broken.instance.check()
    expect(broken.instance.current()).toMatchObject({ status: 'error', error: 'GitHub 500' })
  })

  it('names the sessions that kept an install from running, and forgets them on the retry', async () => {
    const { instance } = updater([release('v0.19.5')], new Uint8Array(4), { refuse: 1, busy: [{ sessionId: 'shell' }, { sessionId: 'chat', agent: 'codex' }] })
    await instance.check()
    await instance.install()
    expect(instance.current()).toMatchObject({ status: 'error', error: 'agents-running', blockers: [{ sessionId: 'shell' }, { sessionId: 'chat', agent: 'codex' }] })
    await instance.install()
    expect(instance.current()).toMatchObject({ status: 'installing', blockers: [] })
  })

  it('retries an install that was refused without downloading again', async () => {
    const { instance, installed, downloads } = updater([release('v0.19.5')], new Uint8Array(4), { refuse: 1 })
    await instance.check()
    await instance.install()
    expect(instance.current()).toMatchObject({ status: 'error', error: 'agents-running' })
    await instance.install()
    expect(installed).toHaveLength(1)
    expect(downloads()).toBe(1)
  })

  const bytes = new Uint8Array([1, 2, 3, 4])
  const verifiedRelease = () => release('v0.19.5', { assets: [{
    name: 'Antumi-0.19.5-arm64.dmg', browser_download_url: 'https://example.com/a.dmg', size: bytes.length,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  }] })

  it('downloads by default and never interrupts the current application to install', async () => {
    const { instance, installed, downloads } = updater([verifiedRelease()], bytes)
    vi.useFakeTimers()
    await instance.start()
    expect(instance.current().automatic).toBe(true)
    await instance.check()
    expect(instance.current()).toMatchObject({ status: 'ready', automatic: true, error: null })
    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000)
    expect(downloads()).toBe(1)
    expect(installed).toHaveLength(0)
  })

  it('keeps the installer across launches and applies it before any network check', async () => {
    const { instance, installed, downloads, restart, dir } = updater([verifiedRelease()], bytes)
    await instance.check()
    expect(existsSync(join(dir, 'downloads', 'pending.json'))).toBe(true)
    const offline = vi.fn(async () => { throw new Error('offline') })
    const next = restart({ fetch: offline })
    expect(await next.start()).toBe(true)
    expect(offline).not.toHaveBeenCalled()
    expect(downloads()).toBe(1)
    expect(installed).toHaveLength(1)
    expect(next.current().status).toBe('installing')
  })

  it('preserves an explicit opt-out and leaves an existing download available for manual installation', async () => {
    const { instance, installed, restart, dir } = updater([verifiedRelease()], bytes)
    await instance.check()
    await instance.setAutomatic(false)
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(next.current()).toMatchObject({ automatic: false, status: 'ready' })
    expect(JSON.parse(readFileSync(join(dir, 'update.json'), 'utf8')).automatic).toBe(false)
    expect(installed).toHaveLength(0)
    await next.install()
    expect(installed).toHaveLength(1)
  })

  it('does not download automatically while disabled', async () => {
    const { instance, installed, downloads, restart } = updater([verifiedRelease()], bytes)
    await instance.setAutomatic(false)
    await instance.check()
    expect(downloads()).toBe(0)
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(next.current().automatic).toBe(false)
    expect(installed).toHaveLength(0)
  })

  it('finishes a download without scheduling installation when disabled during download', async () => {
    let downloaded!: () => void
    let resume!: () => void
    const started = new Promise<void>((resolve) => { downloaded = resolve })
    const wait = new Promise<void>((resolve) => { resume = resolve })
    const { instance, installed, restart } = updater([verifiedRelease()], bytes, { onDownload: async () => { downloaded(); await wait } })
    const checking = instance.check()
    await started
    await instance.setAutomatic(false)
    resume()
    await checking
    expect(installed).toHaveLength(0)
    expect(instance.current()).toMatchObject({ automatic: false, status: 'ready' })
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(installed).toHaveLength(0)
  })

  it('does not apply a skipped downloaded version on the next launch', async () => {
    const { instance, installed, restart } = updater([verifiedRelease()], bytes)
    await instance.check()
    await instance.skip('0.19.5')
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(installed).toHaveLength(0)
    expect(next.current()).toMatchObject({ status: 'ready', skipped: '0.19.5' })
  })

  it('does not apply an already downloaded pre-release after pre-releases are disabled', async () => {
    const beta = { ...verifiedRelease(), tag_name: 'v0.19.6-beta.1', prerelease: true }
    const { instance, installed, restart } = updater([beta], bytes)
    await instance.setPrerelease(true)
    expect(instance.current().status).toBe('ready')
    await instance.setPrerelease(false)
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(installed).toHaveLength(0)
  })

  it('never automatically downloads skipped or unverifiable releases, or an app it cannot replace', async () => {
    for (const mode of ['skipped', 'unverified', 'blocked'] as const) {
      const { instance, downloads, installed } = updater([mode === 'unverified' ? release('v0.19.5') : verifiedRelease()], bytes, { blocked: mode === 'blocked' ? 'read-only' : null })
      if (mode === 'skipped') await instance.skip('0.19.5')
      await instance.check()
      expect(downloads(), mode).toBe(0)
      expect(installed, mode).toHaveLength(0)
    }
  })

  it.each(['corrupted', 'missing'] as const)('does not install a %s cached installer', async (mode) => {
    const { instance, installed, restart, dir } = updater([verifiedRelease()], bytes)
    await instance.check()
    const file = join(dir, 'downloads', 'Antumi-0.19.5-arm64.dmg')
    if (mode === 'corrupted') writeFileSync(file, new Uint8Array([9, 9, 9, 9]))
    else rmSync(file)
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(installed).toHaveLength(0)
    expect(next.current()).toMatchObject({ status: 'error', error: mode === 'corrupted' ? 'digest-mismatch' : 'download-failed' })
    expect(existsSync(join(dir, 'downloads', 'pending.json'))).toBe(false)
    await next.check()
    expect(next.current().status).toBe('ready')
  })

  it('ignores an interrupted download without a pending record', async () => {
    const { installed, restart, dir } = updater([verifiedRelease()], bytes)
    writeFileSync(join(dir, 'unfinished.dmg'), bytes.slice(0, 1))
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(installed).toHaveLength(0)
    expect(next.current().latest).toBeNull()
  })

  it('clears the pending record when the installed version has caught up', async () => {
    const { instance, installed, restart, dir } = updater([verifiedRelease()], bytes)
    await instance.check()
    const next = restart({ current: '0.19.5' })
    expect(await next.start()).toBe(false)
    expect(installed).toHaveLength(0)
    expect(existsSync(join(dir, 'downloads', 'pending.json'))).toBe(false)
  })

  it('opens the current application with the reason if a pending install is blocked by live sessions', async () => {
    const { instance, installed, restart, downloads } = updater([verifiedRelease()], bytes, { refuse: 1, busy: [{ sessionId: 'shell' }] })
    await instance.check()
    const next = restart()
    expect(await next.start()).toBe(false)
    expect(next.current()).toMatchObject({ status: 'error', error: 'agents-running', blockers: [{ sessionId: 'shell' }] })
    expect(installed).toHaveLength(0)
    await next.install()
    expect(installed).toHaveLength(1)
    expect(downloads()).toBe(1)
  })

  it('backs off failed automatic downloads but leaves manual retry available', async () => {
    const { instance, downloads, installed } = updater([verifiedRelease()], new Uint8Array(4))
    await instance.check()
    expect(instance.current()).toMatchObject({ status: 'error', error: 'digest-mismatch' })
    await instance.check()
    expect(downloads()).toBe(1)
    await instance.install()
    expect(downloads()).toBe(2)
    expect(installed).toHaveLength(0)
  })

  it('serializes simultaneous preference writes without losing choices', async () => {
    const { instance, dir } = updater([], bytes)
    await Promise.all([instance.skip('0.19.5'), instance.setPrerelease(true), instance.setAutomatic(false)])
    await instance.check()
    expect(JSON.parse(readFileSync(join(dir, 'update.json'), 'utf8'))).toEqual({ prerelease: true, skipped: '0.19.5', automatic: false })
  })

  it('cancels startup and repeating checks when stopped', async () => {
    const { instance, states } = updater([], bytes)
    vi.useFakeTimers()
    await instance.start()
    instance.stop()
    await vi.advanceTimersByTimeAsync(7 * 60 * 60_000)
    expect(states.map((state) => state.status)).toEqual(['idle'])
  })

  it('retains a single downloaded installer when a manual install overlaps background downloading', async () => {
    let downloaded!: () => void
    let resume!: () => void
    const started = new Promise<void>((resolve) => { downloaded = resolve })
    const wait = new Promise<void>((resolve) => { resume = resolve })
    const { instance, installed, downloads } = updater([verifiedRelease()], bytes, { onDownload: async () => { downloaded(); await wait } })
    const checking = instance.check()
    await started
    const manual = instance.install()
    resume()
    await Promise.all([checking, manual])
    expect(installed).toHaveLength(1)
    expect(downloads()).toBe(1)
  })

  it('coalesces repeated clicks on a downloaded update into one install', async () => {
    const { instance, installed, downloads } = updater([verifiedRelease()], bytes)
    await instance.check()
    await Promise.all([instance.install(), instance.install()])
    expect(installed).toHaveLength(1)
    expect(downloads()).toBe(1)
  })

})
