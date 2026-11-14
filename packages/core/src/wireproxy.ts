import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { get } from 'node:http'
import { createServer } from 'node:net'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

// wireproxy (github.com/windtf/wireproxy, ISC): a WireGuard client in userspace, with no network
// interface and no administrator rights. Fetched the first time the relay is set up, at a pinned
// version whose archives must match the hashes below.

const VERSION = 'v1.1.3'
const ASSETS: Record<string, { name: string; sha256: string }> = {
  'darwin-arm64': { name: 'wireproxy_darwin_arm64.tar.gz', sha256: '28d34342c48c309b628d9c06ab4efc05b82fba49821f360605c02139c02547a5' },
  'darwin-x64': { name: 'wireproxy_darwin_amd64.tar.gz', sha256: '5d89742a0f381d9508d3ad828a0d300dceee24fa49015427eaff42a23f7a50bd' },
  'linux-x64': { name: 'wireproxy_linux_amd64.tar.gz', sha256: 'e88c1d090740373fc606c1bafd81d9a5eadc642cce5667616e20e9d7a444f51c' },
  'linux-arm64': { name: 'wireproxy_linux_arm64.tar.gz', sha256: '370e00bd2167960d1ecd1c3c1439715bbaa94a0a110a2040468670c9af6021b6' },
  'win32-x64': { name: 'wireproxy_windows_amd64.tar.gz', sha256: 'bce041ea9fe0f8a3351301dcbe29cdf6a523bb25cf9c62f17ebb5699a8051d0f' },
  // Windows on Arm runs the x64 build.
  'win32-arm64': { name: 'wireproxy_windows_amd64.tar.gz', sha256: 'bce041ea9fe0f8a3351301dcbe29cdf6a523bb25cf9c62f17ebb5699a8051d0f' }
}

export class WireproxyUnavailable extends Error {
  constructor(readonly reason: 'unsupported-platform' | 'download-failed', message: string) {
    super(message)
    this.name = 'WireproxyUnavailable'
  }
}

type Download = (url: string) => Promise<Uint8Array>

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

// One file out of a tar archive: 512-byte headers, each followed by its file padded to 512.
export function tarEntry(archive: Uint8Array, wanted: string): Uint8Array | null {
  const text = (start: number, length: number) => Buffer.from(archive.subarray(start, start + length)).toString('utf8').replace(/\0.*$/s, '')
  let offset = 0
  while (offset + 512 <= archive.length) {
    const name = text(offset, 100)
    if (!name) return null
    const prefix = text(offset + 345, 155)
    const size = parseInt(text(offset + 124, 12).trim() || '0', 8)
    const full = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '')
    if (full === wanted) return archive.slice(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return null
}

// The program's path, fetched and checked if it is not there yet.
export async function obtainWireproxy(dir: string, options: { platform?: NodeJS.Platform; arch?: string; download?: Download; downloading?: () => void } = {}): Promise<string> {
  const platform = options.platform ?? process.platform
  const asset = ASSETS[`${platform}-${options.arch ?? process.arch}`]
  if (!asset) throw new WireproxyUnavailable('unsupported-platform', `no wireproxy for ${platform} ${options.arch ?? process.arch}`)
  const executable = platform === 'win32' ? 'wireproxy.exe' : 'wireproxy'
  const target = path.join(dir, `wireproxy-${VERSION}${platform === 'win32' ? '.exe' : ''}`)
  if (await stat(target).then((info) => info.size > 0, () => false)) return target
  options.downloading?.()
  let archive: Uint8Array
  try {
    archive = await (options.download ?? download)(`https://github.com/windtf/wireproxy/releases/download/${VERSION}/${asset.name}`)
  } catch (error) {
    throw new WireproxyUnavailable('download-failed', error instanceof Error ? error.message : String(error))
  }
  const hash = createHash('sha256').update(archive).digest('hex')
  if (hash !== asset.sha256) throw new WireproxyUnavailable('download-failed', `${asset.name} does not match its known hash`)
  const program = tarEntry(gunzipSync(archive), executable)
  if (!program) throw new WireproxyUnavailable('download-failed', `${asset.name} holds no ${executable}`)
  await mkdir(dir, { recursive: true })
  // Written aside and moved in, so a half-written file is never taken for the program.
  const partial = `${target}.partial`
  await writeFile(partial, program)
  await chmod(partial, 0o755)
  await rename(partial, target)
  return target
}

export type WireproxyProcess = { stop(): void }

// Runs it with its health endpoint on `healthPort`; `onExit` hears its last words on stderr.
export function launchWireproxy(program: string, configPath: string, healthPort: number, onExit: (output: string) => void): WireproxyProcess {
  const child = spawn(program, ['-c', configPath, '-i', `127.0.0.1:${healthPort}`, '-s'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  let output = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    output = (output + chunk.toString('utf8')).slice(-2_000)
  })
  child.once('error', (error) => {
    output = error.message
  })
  child.once('close', () => onExit(output.trim()))
  return { stop: () => child.kill() }
}

export function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

// When the tunnel last completed a handshake, from the health endpoint; null for never or no answer.
// Plain http, not fetch: fetch goes through the system proxy, which may not exempt loopback.
export function lastHandshake(healthPort: number): Promise<number | null> {
  return new Promise((resolve) => {
    const request = get({ host: '127.0.0.1', port: healthPort, path: '/metrics', timeout: 2_000 }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => (body += chunk))
      response.on('end', () => {
        const seconds = Math.max(0, ...[...body.matchAll(/^last_handshake_time_sec=(\d+)$/gm)].map((match) => Number(match[1])))
        resolve(seconds > 0 ? seconds * 1000 : null)
      })
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(null))
  })
}
