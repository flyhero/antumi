import { execFile } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import semver from 'semver'
import type { AgentCliStatus, AgentKind, Environment } from '@antumi/protocol'
import { planLaunch } from '@antumi/protocol/node'
import { adapterOf } from './agents'
import { stripAnsi } from './ansi-text'

export type CliCommand = { command: string; args: string[] }
export type CliTarget = {
  path: string
  identity: string
  version: string | null
  channel: AgentCliStatus['channel']
  command: CliCommand | null
  latestUrl: string | null
  tagPrefix?: string
}
export type CliTargetHost = {
  platform: NodeJS.Platform
  home: string
  run(command: CliCommand): Promise<string>
  canonical(file: string): Promise<string>
  read(file: string): Promise<string>
}
const execute = promisify(execFile)
export const cliTargetHost: CliTargetHost = {
  platform: process.platform, home: os.homedir(),
  canonical: realpath,
  read: (file) => readFile(file, 'utf8'),
  async run(command) {
    const launch = planLaunch(command.command, command.args, os.homedir(), { ...process.env, OPENCODE_DISABLE_AUTOUPDATE: '1', PI_OFFLINE: '1' })
    const pending = execute(launch.file, launch.args, { env: launch.env, timeout: 5000, maxBuffer: 256 * 1024, windowsHide: true })
    // Read-only probes have no input. Some Windows launchers wait for EOF before exiting.
    pending.child.stdin?.end()
    const result = await pending
    return stripAnsi(`${result.stdout}\n${result.stderr}`).trim()
  }
}
const Package = z.object({ name: z.string(), bin: z.union([z.string(), z.record(z.string(), z.string())]) })
const BrewInfo = z.object({
  casks: z.array(z.object({ version: z.string(), installed: z.union([z.string(), z.array(z.string())]).nullable().optional() })).optional(),
  formulae: z.array(z.object({ versions: z.object({ stable: z.string().nullable() }), installed: z.array(z.unknown()) })).optional()
})
// The upgrade a user can paste into their own terminal; a path with spaces stays one argument.
export function cliCommandText({ command, args }: CliCommand): string {
  return [command, ...args].map((part) => /[\s"']/.test(part) ? `"${part}"` : part).join(' ')
}
export function cliVersion(text: string): string | null {
  return /\b\d{4}\.\d{2}\.\d{2}(?:-[\w.-]+)?\b/.exec(text)?.[0] ?? /\b\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?\b/.exec(text)?.[0] ?? null
}
export function compareCliVersions(a: string, b: string): number | null {
  const date = /^\d{4}\.\d{2}\.\d{2}/
  if (date.test(a) || date.test(b)) {
    if (!date.test(a) || !date.test(b)) return null
    if (a === b) return 0
    const left = a.slice(0, 10), right = b.slice(0, 10)
    return left === right ? null : left < right ? -1 : 1
  }
  return semver.valid(a) && semver.valid(b) ? semver.compare(a, b) : null
}
export function inside(candidate: string, parent: string, platform: NodeJS.Platform): boolean {
  const paths = platform === 'win32' ? path.win32 : path.posix
  const relative = paths.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative))
}
export function desktopCli(file: string, platform: NodeJS.Platform): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase()
  return platform === 'darwin' ? /\.app\/contents\//.test(normalized) : platform === 'win32' && /\/(?:windowsapps|(?:chatgpt|codex)(?: desktop)?\/(?:app\/)?resources)\//.test(normalized)
}

export async function resolveCliTarget(agent: AgentKind, environment: Environment, host: CliTargetHost = cliTargetHost): Promise<CliTarget | null> {
  const check = environment.checks.find((entry) => entry.tool === agent)
  const selected = check?.path
  if (!selected) return null
  const paths = host.platform === 'win32' ? path.win32 : path.posix
  const canonical = await host.canonical(selected).catch(() => selected)
  const version = cliVersion(await host.run({ command: selected, args: ['--version'] }).catch(() => ''))
  const base = { path: selected, version }
  const target = (channel: CliTarget['channel'], command: CliCommand | null, latestUrl: string | null, tagPrefix?: string): CliTarget => ({ ...base, channel, command, latestUrl, tagPrefix, identity: JSON.stringify({ selected, canonical, channel, command }) })
  if (check.requiresStandaloneCli || desktopCli(selected, host.platform) || desktopCli(canonical, host.platform)) return target('desktop', null, null)
  const maintenance = adapterOf(agent).maintenance
  const packageName = maintenance?.packageName
  if (packageName) {
    const proofs: CliTarget[] = []
    for (const manager of ['npm', 'pnpm', 'bun'] as const) {
      try {
        const output = await host.run({ command: manager, args: manager === 'bun' ? ['pm', 'bin', '-g'] : ['root', '-g'] })
        const root = output.split(/\r?\n/).map((line) => line.trim()).find((line) => paths.isAbsolute(line))
        if (!root) continue
        const packageRoot = manager === 'bun' ? paths.resolve(root, '..', 'install/global/node_modules', packageName) : paths.join(root, packageName)
        const pkg = Package.parse(JSON.parse(await host.read(paths.join(packageRoot, 'package.json'))))
        if (pkg.name !== packageName) continue
        const realRoot = await host.canonical(packageRoot)
        const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin)
        const realBins = await Promise.all(bins.map((bin) => host.canonical(paths.resolve(packageRoot, bin)).catch(() => '')))
        let owned = inside(canonical, realRoot, host.platform) && realBins.includes(canonical)
        if (!owned && host.platform === 'win32') {
          // The launch resolver accepts only known shim generators, never arbitrary batch code.
          const { launchFile, nodeLaunchHost } = await import('@antumi/protocol/node')
          try {
            const launch = launchFile(selected, [], process.env, { ...nodeLaunchHost, platform: host.platform })
            owned = (await Promise.all(launch.args.map((arg) => host.canonical(arg).catch(() => '')))).some((arg) => Boolean(arg) && inside(arg, realRoot, host.platform) && realBins.includes(arg))
          } catch { /* Unknown shim stays manual. */ }
        }
        if (!owned) continue
        const args = manager === 'pnpm' ? ['add', '-g'] : ['install', '-g']
        if (manager === 'bun') args.splice(0, args.length, 'add', '-g')
        proofs.push(target(manager, { command: manager, args: [...args, `${packageName}@latest`, ...(maintenance?.packageArgs ?? [])] }, `https://registry.npmjs.org/${packageName}/latest`))
      } catch { /* Another manager may own this executable. */ }
    }
    if (proofs.length === 1) return proofs[0] ?? null
    if (proofs.length > 1) return target('unknown', null, null)
  }
  const brew = maintenance?.brew
  if (brew && host.platform !== 'win32') {
    try {
      const prefix = await host.run({ command: 'brew', args: ['--prefix', ...(brew.cask ? ['--cask'] : []), brew.name] })
      const root = await host.canonical(prefix.trim())
      if (inside(canonical, root, host.platform)) {
        const json = BrewInfo.parse(JSON.parse(await host.run({ command: 'brew', args: ['info', '--json=v2', ...(brew.cask ? ['--cask'] : ['--formula']), brew.name] })))
        if (brew.cask ? Boolean(json.casks?.[0]?.installed) : Boolean(json.formulae?.[0]?.installed.length)) {
          return target('homebrew', { command: 'brew', args: ['upgrade', brew.cask ? '--cask' : '--formula', brew.name] }, `https://formulae.brew.sh/api/${brew.cask ? 'cask' : 'formula'}/${brew.name}.json`)
        }
      }
    } catch { /* No proven Homebrew installation. */ }
  }
  const native = maintenance?.native
  if (native?.roots[host.platform]?.some((root) => inside(canonical, paths.join(host.home, root), host.platform))) {
    // Old CLIs may interpret unknown commands as prompts. Help is the read-only capability probe.
    const help = await host.run({ command: selected, args: ['--help'] }).catch(() => '')
    const subcommand = native.args[0]
    if (subcommand && new RegExp(`^\\s*${subcommand}(?:[\\s|,]|$)`, 'm').test(help)) {
      return target('native', { command: selected, args: [...native.args] }, native.latestUrl ?? null, native.tagPrefix)
    }
  }
  return target('unknown', null, null)
}

const Latest = z.object({ version: z.string().optional(), tag_name: z.string().optional(), versions: z.object({ stable: z.string().nullable() }).optional() })
export async function latestCliVersion(target: CliTarget, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!target.latestUrl) return null
  const response = await fetchImpl(target.latestUrl, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json', 'User-Agent': 'Antumi-CLI-Maintenance' } })
  if (!response.ok) throw new Error('agent-cli-network')
  const json = Latest.parse(await response.json())
  return cliVersion(json.version ?? json.versions?.stable ?? json.tag_name?.replace(target.tagPrefix ?? /^v/, '') ?? '')
}
