import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { envValue } from '@antumi/protocol/node'
import type { LinuxEnv, LinuxResult } from '../linux-backend/linux-target'
import { planWslLaunch } from './wsl-launch'

export type { LinuxEnv }

// What running wsl.exe reads of the machine; tests stand in a Windows one on any OS.
export type WslHost = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  isFile(file: string): boolean
  spawn(file: string, args: string[], options: SpawnOptions): ChildProcess
}

export const nodeWslHost: WslHost = {
  platform: process.platform,
  env: process.env,
  isFile(file) {
    try {
      return statSync(file).isFile()
    } catch {
      return false
    }
  },
  spawn: (file, args, options) => spawn(file, args, options)
}

// Null `code` when wsl.exe never ran, was killed, or ended on a signal. The Linux env is set by
// `env` inside the distro rather than through WSLENV.
export type WslResult = LinuxResult

export type WslRunOptions = {
  // Written to stdin, then stdin ends: how secrets and long scripts go in, never through argv.
  input?: string | Uint8Array
  timeoutMs?: number
  env?: LinuxEnv
  host?: WslHost
}

export type WslSpawnOptions = {
  env?: LinuxEnv
  host?: WslHost
}

const DEFAULT_TIMEOUT_MS = 15_000
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function systemRoot(host: WslHost): string {
  return envValue(host.env, 'SystemRoot', 'win32') ?? 'C:\\Windows'
}

// The absolute wsl.exe, never one found on PATH or in the cwd; null off Windows or without WSL.
export function wslExecutable(host: WslHost = nodeWslHost): string | null {
  if (host.platform !== 'win32') return null
  const file = path.win32.join(systemRoot(host), 'System32', 'wsl.exe')
  return host.isFile(file) ? file : null
}

// `--exec` hands each argument to the program as it is; `--` would expand `$name` in them.
export function distroArgs(distro: string | null, argv: readonly string[], env: LinuxEnv = {}): string[] {
  if (argv.length === 0 || !argv[0]) throw new Error('wsl-empty-command')
  if (distro !== null && (!distro || distro.startsWith('-'))) throw new Error('wsl-bad-distro')
  const assignments = Object.entries(env).map(([key, value]) => {
    if (!ENV_NAME.test(key)) throw new Error('wsl-bad-env-name')
    return `${key}=${value}`
  })
  const target = distro === null ? [] : ['-d', distro]
  const command = assignments.length > 0 ? ['/usr/bin/env', ...assignments, ...argv] : [...argv]
  return [...target, '--exec', ...command]
}

// The Windows env wsl.exe gets: the app's own, with WSL_UTF8 set once whatever its spelling.
function childEnv(host: WslHost): NodeJS.ProcessEnv {
  const kept = Object.entries(host.env).filter(([key]) => key.toUpperCase() !== 'WSL_UTF8')
  return { ...Object.fromEntries(kept), WSL_UTF8: '1' }
}

// A cwd that surely exists: an inherited one may be gone, or be a UNC path wsl.exe cannot map.
function baseOptions(host: WslHost): SpawnOptions {
  return { cwd: systemRoot(host), env: childEnv(host), windowsHide: true }
}

const utf8 = new TextDecoder('utf-8', { fatal: true })
const utf16 = new TextDecoder('utf-16le')

// wsl.exe answers in UTF-16LE when it ignores WSL_UTF8 (older inbox builds, and `--list` on some),
// while what the Linux side prints passes through as UTF-8: tell them apart rather than assume.
export function decodeWslOutput(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return utf16.decode(bytes.subarray(2))
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3))
  const even = bytes.length % 2 === 0
  // UTF-8 text holds no zero byte, while ASCII in UTF-16LE is every other one.
  if (even && bytes.includes(0)) return utf16.decode(bytes)
  try {
    return utf8.decode(bytes)
  } catch {
    return even ? utf16.decode(bytes) : new TextDecoder().decode(bytes)
  }
}

// wsl.exe's own commands (`--list`): same executable, cwd and env as everything else.
export function runWsl(args: readonly string[], options: Omit<WslRunOptions, 'env'> = {}): Promise<WslResult> {
  const host = options.host ?? nodeWslHost
  const file = wslExecutable(host)
  if (!file) return Promise.resolve({ code: null, stdout: '', stderr: 'wsl.exe not found', timedOut: false })
  return runWindows(file, args, options)
}

function runWindows(file: string, args: readonly string[], options: Omit<WslRunOptions, 'env'>, launcher = false): Promise<WslResult> {
  const host = options.host ?? nodeWslHost
  return new Promise((resolve) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    let settled = false
    const settle = (code: number | null, timedOut: boolean, note = '') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const stderr = decodeWslOutput(Buffer.concat(err))
      resolve({ code, stdout: decodeWslOutput(Buffer.concat(out)), stderr: note ? `${stderr}${stderr ? '\n' : ''}${note}` : stderr, timedOut })
    }
    let child: ChildProcess
    try {
      child = host.spawn(file, [...args], { ...baseOptions(host), stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: String(error), timedOut: false })
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      settle(null, true)
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', (error) => settle(null, false, String(error)))
    child.on('close', (code) => settle(code, false))
    if (launcher) child.on('exit', (code) => {
      if (code !== 0) return
      // wsl.exe inherits these pipes: `close` would wait for the backend, not the launcher.
      child.stdin?.destroy()
      child.stdout?.destroy()
      child.stderr?.destroy()
      settle(0, false)
    })
    // A program that exits without reading its input must not surface as an EPIPE crash.
    child.stdin?.on('error', () => {})
    child.stdin?.end(options.input)
  })
}

// A program in the distro (the default one for null), run to its end. Resolves on any exit code.
export async function runInDistro(distro: string | null, argv: readonly string[], options: WslRunOptions = {}): Promise<WslResult> {
  const { env, ...rest } = options
  return runWsl(distroArgs(distro, argv, env), rest)
}

// A piped, binary-clean child for the tunnel. Backend launches go through launchInDistro.
export function spawnInDistro(distro: string | null, argv: readonly string[], options: WslSpawnOptions = {}): ChildProcess {
  const host = options.host ?? nodeWslHost
  const file = wslExecutable(host)
  if (!file) throw new Error('wsl-not-found')
  const args = distroArgs(distro, argv, options.env)
  return host.spawn(file, args, { ...baseOptions(host), stdio: ['pipe', 'pipe', 'pipe'] })
}

// Wait only for the hidden launcher, not the Linux program. Its stdio is unused: the backend
// redirects output inside the distro, while wsl.exe stays to keep the distro running.
export async function launchInDistro(distro: string | null, argv: readonly string[], options: WslSpawnOptions = {}): Promise<void> {
  const host = options.host ?? nodeWslHost
  const file = wslExecutable(host)
  if (!file) throw new Error('wsl-not-found')
  const launch = planWslLaunch(file, distroArgs(distro, argv, options.env), systemRoot(host))
  if (!host.isFile(launch.file)) throw new Error('wsl-launcher-not-found')
  const result = await runWindows(launch.file, launch.args, { host, input: launch.input }, true)
  if (result.code !== 0) throw new Error(`wsl-launch: ${result.timedOut ? 'timed out' : result.stderr.trim() || 'launcher failed'}`)
}
