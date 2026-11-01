import { mkdir, readdir, readFile, lstat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fromBuffer } from 'yauzl'
import { prerelease, rcompare, satisfies, valid, validRange } from 'semver'
import { PluginManifest, type PluginInstallSource } from '@antumi/protocol'
import { z } from 'zod'
import { networkFailure } from './network-failure'
import { pluginEnvironment } from './plugin-process'

const MAX_BYTES = 32 * 1024 * 1024
const MAX_FILES = 2048

export function packagePath(root: string, name: string): string {
  if (!name || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some((part) => part === '..' || part === '.' || /[. ]$/.test(part))) throw new Error('插件包包含不安全的路径')
  const resolved = path.resolve(root, name)
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('插件路径越界')
  return resolved
}

function allowedFile(name: string): boolean {
  return /\.(?:m?js|cjs|json|md|txt|map)$/i.test(name) || /^(?:LICENSE|NOTICE)$/i.test(path.basename(name))
}

export async function readManifest(root: string, antumiVersion: string): Promise<PluginManifest> {
  const file = path.join(root, 'manifest.json')
  const info = await lstat(file)
  if (!info.isFile() || info.size > 128 * 1024) throw new Error('插件 manifest 无效或过大')
  const manifest = PluginManifest.parse(JSON.parse(await readFile(file, 'utf8')))
  // Beta hosts use the same plugin contract; semver otherwise excludes them from stable ranges.
  if (!valid(manifest.version) || !validRange(manifest.engines.antumi) || !satisfies(antumiVersion, manifest.engines.antumi, { includePrerelease: true })) throw new Error('插件版本无效或不兼容当前 Antumi')
  if (new Set(manifest.contributes.sources.map((source) => source.id)).size !== manifest.contributes.sources.length) throw new Error('插件重复声明了来源')
  for (const source of manifest.contributes.sources) {
    if (new Set(source.settings.map((field) => field.key)).size !== source.settings.length) throw new Error('插件重复声明了设置字段')
  }
  pluginEnvironment(manifest.env, {})
  if (!/\.(?:mjs|cjs|js)$/.test(manifest.entry.main)) throw new Error('插件入口必须是 JavaScript')
  const main = packagePath(root, manifest.entry.main)
  if (!(await lstat(main)).isFile()) throw new Error('找不到插件入口')
  return manifest
}

export async function copyPlugin(from: string, to: string): Promise<void> {
  let bytes = 0
  let count = 0
  const seen = new Set<string>()
  const walk = async (folder: string, prefix: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`
      if (++count > MAX_FILES || seen.has(name.toLowerCase())) throw new Error('插件文件过多或重名')
      seen.add(name.toLowerCase())
      const target = packagePath(to, name)
      const source = path.join(folder, entry.name)
      const info = await lstat(source)
      if (info.isDirectory()) {
        await mkdir(target, { recursive: true, mode: 0o700 })
        await walk(source, `${name}/`)
      } else if (info.isFile() && allowedFile(name)) {
        bytes += info.size
        if (bytes > MAX_BYTES) throw new Error('插件包过大')
        const data = await readFile(source)
        if (data.length !== info.size) throw new Error('复制时插件文件发生改变，请重试')
        await writeFile(target, data, { flag: 'wx', mode: 0o600 })
      } else throw new Error('插件仅支持纯 JS 包，不接受符号链接或二进制文件')
    }
  }
  if (!(await lstat(from)).isDirectory()) throw new Error('插件目录无效')
  await walk(from, '')
}

export async function extractPlugin(data: Buffer, root: string): Promise<void> {
  if (data.length > MAX_BYTES) throw new Error('插件压缩包过大')
  await new Promise<void>((resolve, reject) => {
    fromBuffer(data, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(error ?? new Error('ZIP 无效')); return }
      let total = 0
      let count = 0
      const seen = new Set<string>()
      const fail = (error: unknown) => { zip.close(); reject(error) }
      zip.on('error', fail)
      zip.on('end', resolve)
      zip.on('entry', (entry) => {
        void (async () => {
          if (++count > MAX_FILES) throw new Error('插件文件过多')
          const name = entry.fileName.replace(/\/$/, '')
          const target = packagePath(root, name)
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000
          if (mode && mode !== 0o100000 && mode !== 0o040000) throw new Error('ZIP 不允许符号链接或特殊文件')
          if (seen.has(name.toLowerCase())) throw new Error('ZIP 包含重名文件')
          seen.add(name.toLowerCase())
          if (entry.fileName.endsWith('/')) await mkdir(target, { recursive: true, mode: 0o700 })
          else {
            if (!allowedFile(name)) throw new Error('插件仅支持纯 JS 包')
            total += entry.uncompressedSize
            if (total > MAX_BYTES) throw new Error('插件解压后过大')
            await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
            const contents = await new Promise<Buffer>((done, failed) => {
              zip.openReadStream(entry, (error, stream) => {
                if (error || !stream) { failed(error ?? new Error('ZIP 读取失败')); return }
                const chunks: Buffer[] = []
                let size = 0
                stream.on('data', (chunk: Buffer) => {
                  size += chunk.length
                  if (size > entry.uncompressedSize || size > MAX_BYTES) stream.destroy(new Error('ZIP 文件过大'))
                  else chunks.push(chunk)
                })
                stream.on('error', failed)
                stream.on('end', () => done(Buffer.concat(chunks)))
              })
            })
            await writeFile(target, contents, { flag: 'wx', mode: 0o600 })
          }
          zip.readEntry()
        })().catch(fail)
      })
      zip.readEntry()
    })
  })
}

const Release = z.object({ tag_name: z.string(), draft: z.boolean().optional(), prerelease: z.boolean().optional(), assets: z.array(z.object({ name: z.string(), browser_download_url: z.string().url() })) })
type Release = z.infer<typeof Release>
type GitHubSource = Extract<PluginInstallSource, { kind: 'github' }>
const NO_RELEASE = '该仓库还没有可安装的 GitHub Release，请在发布 ZIP 后重试'
const RELEASE_PAGE_LIMIT = 10

function releaseVersion(tag: string, prefix: string): string | null {
  if (!tag.startsWith(prefix)) return null
  const version = valid(tag.slice(prefix.length))
  return version && !prerelease(version) ? version : null
}

async function prefixedRelease(source: GitHubSource, prefix: string): Promise<Release> {
  const found: { version: string; release: Release }[] = []
  for (let page = 1; page <= RELEASE_PAGE_LIMIT; page++) {
    const url = `https://api.github.com/repos/${source.repository}/releases?per_page=100&page=${page}`
    const response = await request(url, { headers: { Accept: 'application/vnd.github+json' } })
    if (response.status === 403 || response.status === 429) return prefixedReleaseFromSite(source, prefix)
    if (response.status === 404) throw new Error(NO_RELEASE)
    const releases = z.array(Release).parse(JSON.parse((await read(url, response)).toString('utf8')))
    for (const release of releases) {
      const version = releaseVersion(release.tag_name, prefix)
      if (version && !release.draft && !release.prerelease) found.push({ version, release })
    }
    if (releases.length < 100) {
      const latest = found.sort((a, b) => rcompare(a.version, b.version))[0]
      if (!latest) throw new Error(NO_RELEASE)
      return latest.release
    }
  }
  throw new Error('仓库发布记录过多，请指定插件的 Release 标签')
}

async function prefixedReleaseFromSite(source: GitHubSource, prefix: string): Promise<Release> {
  const found = new Map<string, string>()
  for (let page = 1; page <= RELEASE_PAGE_LIMIT; page++) {
    const url = `https://github.com/${source.repository}/releases?page=${page}`
    const response = await request(url)
    if (response.status === 404) throw new Error(NO_RELEASE)
    const html = (await read(url, response)).toString('utf8')
    const tagPath = `/${source.repository}/releases/tag/`
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const href = match[1]
      if (!href?.startsWith(tagPath)) continue
      const tag = decodeURIComponent(href.slice(tagPath.length))
      const version = releaseVersion(tag, prefix)
      if (version) found.set(tag, version)
    }
    if (!/<a\b[^>]*\brel="next"[^>]*>/i.test(html)) {
      const latest = [...found].sort((a, b) => rcompare(a[1], b[1]))[0]
      if (!latest) throw new Error(NO_RELEASE)
      return releaseFromSite({ ...source, tag: latest[0] })
    }
  }
  throw new Error('仓库发布记录过多，请指定插件的 Release 标签')
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, headers: { 'User-Agent': 'Antumi', ...init.headers }, signal: AbortSignal.timeout(60_000) })
  } catch (error) {
    throw networkFailure(url, error)
  }
}

async function read(url: string, response: Response): Promise<Buffer> {
  if (!response.ok) throw new Error(`下载插件失败：HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('插件下载过大')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for await (const chunk of response.body ?? []) {
      size += chunk.length
      if (size > MAX_BYTES) break
      chunks.push(chunk)
    }
  } catch (error) {
    throw networkFailure(url, error)
  }
  if (size > MAX_BYTES) throw new Error('插件下载过大')
  return Buffer.concat(chunks)
}

async function releaseOf(source: GitHubSource): Promise<Release> {
  if (!source.tag && source.tagPrefix) return prefixedRelease(source, source.tagPrefix)
  const endpoint = source.tag ? `tags/${encodeURIComponent(source.tag)}` : 'latest'
  const url = `https://api.github.com/repos/${source.repository}/releases/${endpoint}`
  const response = await request(url, { headers: { Accept: 'application/vnd.github+json' } })
  // The API allows 60 requests an hour per address, which a VPN shared by many soon spends; the
  // site's release pages are not counted against it.
  if (response.status === 403 || response.status === 429) return releaseFromSite(source)
  if (response.status === 404) throw new Error(NO_RELEASE)
  return Release.parse(JSON.parse((await read(url, response)).toString('utf8')))
}

// The release as its pages show it: latest answers with a redirect to its tag, and the tag's asset
// list links each download.
async function releaseFromSite(source: GitHubSource): Promise<Release> {
  let tag = source.tag
  if (!tag) {
    const latest = await request(`https://github.com/${source.repository}/releases/latest`, { redirect: 'manual' })
    await latest.body?.cancel()
    const location = latest.headers.get('location')
    const named = location ? /\/releases\/tag\/([^/?#]+)$/.exec(new URL(location, 'https://github.com').pathname)?.[1] : undefined
    if (!named) throw new Error(NO_RELEASE)
    tag = decodeURIComponent(named)
  }
  const url = `https://github.com/${source.repository}/releases/expanded_assets/${encodeURIComponent(tag)}`
  const response = await request(url)
  if (response.status === 404) throw new Error(NO_RELEASE)
  const prefix = `/${source.repository}/releases/download/`.toLowerCase()
  const links = new Set([...(await read(url, response)).toString('utf8').matchAll(/href="([^"]+)"/g)].flatMap((match) => match[1]?.toLowerCase().startsWith(prefix) ? [match[1]] : []))
  return { tag_name: tag, assets: [...links].map((href) => ({ name: decodeURIComponent(href.slice(href.lastIndexOf('/') + 1)), browser_download_url: `https://github.com${href}` })) }
}

export async function stagePlugin(source: PluginInstallSource, target: string): Promise<void> {
  if (source.kind === 'local') {
    const info = await lstat(source.path)
    if (info.isDirectory()) await copyPlugin(source.path, target)
    else if (info.isFile() && info.size <= MAX_BYTES && /\.zip$/i.test(source.path)) await extractPlugin(await readFile(source.path), target)
    else throw new Error('请选择插件目录或 ZIP 文件')
    return
  }
  const release = await releaseOf(source)
  const assets = release.assets.filter((asset) => source.asset ? asset.name === source.asset : /\.zip$/i.test(asset.name))
  if (assets.length !== 1 || !assets[0]) throw new Error('Release 必须有一个插件 ZIP，或指定附件名称')
  const asset = assets[0]
  const url = new URL(asset.browser_download_url)
  if (url.protocol !== 'https:' || url.host !== 'github.com' || !url.pathname.toLowerCase().startsWith(`/${source.repository}/releases/download/`.toLowerCase())) throw new Error('Release 下载地址不属于指定仓库')
  await extractPlugin(await read(url.href, await request(url.href)), target)
}
