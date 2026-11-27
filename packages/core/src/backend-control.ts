import { existsSync } from 'node:fs'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CoreEndpoint } from '@antumi/protocol'
import { backendToStart, daemonToStart, runningCore } from '@antumi/protocol/node'

// The daemon depends on node-pty, core does not: a specifier held in a variable is one TypeScript
// does not resolve and esbuild leaves alone, so at run time it is found in the node_modules beside
// the bundle, as the daemon's own import is.
const NODE_PTY = 'node-pty'

export type BackendControlAnswer =
  | { start: ('daemon' | 'core')[] }
  // With no endpoint yet, whether the core beside this program runs: still loading, or gone.
  | { endpoint: CoreEndpoint } | { endpoint: null; coreRunning: boolean }
  | { node: string; arch: string; pty: true | string }

export type BackendControlOptions = {
  home?: string
  loadPty?: () => Promise<unknown>
  // Why node-pty's Linux binding itself does not load; null when it does or is not there.
  bindingError?: () => string | null
  coreRunning?: () => Promise<boolean>
}

export const BACKEND_CONTROL_USAGE = 'usage: backend-control prepare <version> [--keep-newer] | replace-daemon <version> [--keep-newer] | endpoint | check'

// One command of backend-control (backend-control-main.ts): the answer to print, or why the
// arguments make no command.
export async function backendControl(args: string[], options: BackendControlOptions = {}): Promise<{ answer: BackendControlAnswer } | { usage: string }> {
  const [command, ...given] = args
  // On a server several computers reach, a newer backend than the asking app's stays.
  const keepNewer = (command === 'prepare' || command === 'replace-daemon') && given.at(-1) === '--keep-newer'
  const rest = keepNewer ? given.slice(0, -1) : given
  const rule = { keepNewer }
  if (command === 'prepare' && rest.length === 1 && rest[0]) return { answer: { start: await backendToStart(rest[0], options.home, rule) } }
  // As replaceOldDaemon in the desktop app: a daemon to start once an older one left, or none runs.
  if (command === 'replace-daemon' && rest.length === 1 && rest[0]) return { answer: { start: (await daemonToStart(rest[0], options.home, rule)) ? ['daemon'] : [] } }
  if (command === 'endpoint' && rest.length === 0) {
    const endpoint = await runningCore(options.home)
    return { answer: endpoint ? { endpoint } : { endpoint: null, coreRunning: await (options.coreRunning ?? coreBesideRuns)() } }
  }
  if (command === 'check' && rest.length === 0) return { answer: { node: process.version, arch: process.arch, pty: await ptyLoads(options.loadPty, options.bindingError) } }
  return { usage: BACKEND_CONTROL_USAGE }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function ptyLoads(load: () => Promise<unknown> = () => import(NODE_PTY), bindingError: () => string | null = linuxBindingError): Promise<true | string> {
  try {
    await load()
    return true
  } catch (error) {
    // node-pty tries each place its binding may be and keeps only the last error, a prebuild
    // folder Linux never has: the binding's own error says why it did not load, a glibc too old.
    return bindingError() ?? message(error)
  }
}

function linuxBindingError(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const binding = path.join(path.dirname(require.resolve(`${NODE_PTY}/package.json`)), 'build/Release/pty.node')
    if (!existsSync(binding)) return null
    require(binding)
    return null
  } catch (error) {
    return message(error)
  }
}

// Core writes its endpoint only once it has loaded everything, which a cold machine takes its time
// over: a core.mjs of this backend's folder in some process's arguments is one on its way. Linux
// only, as /proc is; the shell that execs it counts too.
const coreBesideRuns = () => coreRuns(path.join(path.dirname(fileURLToPath(import.meta.url)), 'core.mjs'))

export async function coreRuns(coreFile: string, proc = '/proc'): Promise<boolean> {
  const core = await realpath(coreFile).catch(() => null)
  if (!core) return false
  for (const pid of await readdir(proc).catch(() => [])) {
    if (!/^\d+$/.test(pid)) continue
    const args = (await readFile(path.join(proc, pid, 'cmdline'), 'utf8').catch(() => '')).split('\0')
    for (const arg of args) {
      if (path.isAbsolute(arg) && path.basename(arg) === 'core.mjs' && (await realpath(arg).catch(() => null)) === core) return true
    }
  }
  return false
}
