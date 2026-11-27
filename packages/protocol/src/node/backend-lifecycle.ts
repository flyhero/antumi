import net from 'node:net'
import { z } from 'zod'
import type { AgentKind } from '../agent'
import type { CoreEndpoint } from '../rpc'
import { readCoreEndpoint } from './core-endpoint'
import { daemonSchemas } from './daemon-protocol'
import { antumiPaths } from './paths'
import { compareVersions } from '../version-order'

// How an app treats a backend of another build. One app per home (this machine, a WSL distro)
// replaces any. A server several computers reach keeps one newer than the asking app: replacing
// it would have two apps of different versions take turns at it (docs/REMOTE.md 版本).
export type ReplaceRule = { keepNewer?: boolean }

// Whether the app of `version` replaces what runs at `running`.
function replaces(running: string | undefined, version: string, rule: ReplaceRule): boolean {
  if (running === version) return false
  return !rule.keepNewer || running === undefined || compareVersions(running, version) < 0
}

// The rules for replacing a running daemon and core with an app's own, on plain Node: the desktop
// app runs them on this machine, and backend-control inside a WSL distro.

function reachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const settle = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(800, () => settle(false))
    socket.once('connect', () => settle(true))
    socket.once('error', () => settle(false))
  })
}

// The core serving this home, if one answers on its port.
export async function runningCore(home?: string): Promise<CoreEndpoint | null> {
  const endpoint = await readCoreEndpoint(home)
  return endpoint !== null && (await reachable(endpoint.port)) ? endpoint : null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const DaemonReply = z.object({ id: z.unknown(), result: z.record(z.string(), z.unknown()).optional() })

function parsedLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

// One request to the daemon over its socket, as core speaks to it: a JSON line out, the line
// with the same id back. Null when no daemon answers, or this one does not know the method.
function daemonCall(method: 'info' | 'retire', home?: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const socket = net.connect(antumiPaths(home).daemonSocket)
    let buffered = ''
    const settle = (value: Record<string, unknown> | null) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(2000, () => settle(null))
    socket.once('error', () => settle(null))
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: 1, method, params: {} })}\n`))
    socket.on('data', (chunk) => {
      buffered += chunk.toString('utf8')
      for (const line of buffered.split('\n').slice(0, -1)) {
        // Daemon events share the socket; only the reply to this request settles it.
        const reply = DaemonReply.safeParse(parsedLine(line))
        if (reply.success && reply.data.id === 1) settle(reply.data.result ?? null)
      }
      buffered = buffered.slice(buffered.lastIndexOf('\n') + 1)
    })
  })
}

function daemonReachable(home?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(antumiPaths(home).daemonSocket)
    socket.setTimeout(800, () => { socket.destroy(); resolve(false) })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

// A daemon from another build is replaced only when it runs nothing (an agent, a terminal shell):
// it decides that itself, so nothing starts between asking and leaving. One that still runs
// something stays, and is asked again later (replaceOldDaemon); one from before info and retire
// stays until it ends (a restart of the computer). True when it left.
let reportedBusy: unknown = null
export async function retireOldDaemon(version: string, home?: string, rule: ReplaceRule = {}): Promise<boolean> {
  const info = await daemonCall('info', home)
  if (!info || !replaces(typeof info.version === 'string' ? info.version : undefined, version, rule)) return false
  const answer = await daemonCall('retire', home)
  if (answer?.retired !== true) {
    // Asked every few minutes: say so once per daemon, not each time.
    if (reportedBusy !== info.pid) console.log(`[antumi] daemon ${String(info.version)} still runs ${String(answer?.live ?? '?')} sessions; keeping it until they end`)
    reportedBusy = info.pid
    return false
  }
  console.log(`[antumi] daemon ${String(info.version)} is older than this app (${version}); replacing it`)
  const until = Date.now() + 10_000
  while (Date.now() < until && (await daemonReachable(home))) await sleep(200)
  return true
}

// Asks an older core to leave, and waits for it to: it closes its server and removes its endpoint
// file on SIGTERM. Sessions live in the daemon, so the agents it served run on; the new core takes
// them up again. True once its process is gone.
async function retireCore(endpoint: CoreEndpoint, version: string): Promise<boolean> {
  console.log(`[antumi] core ${endpoint.version ?? '(unversioned)'} is older than this app (${version}); replacing it`)
  try {
    process.kill(endpoint.pid, 'SIGTERM')
  } catch {
    return !alive(endpoint.pid)
  }
  return exited(endpoint.pid)
}

// Whether a process still exists: only ESRCH says it does not (EPERM is one of someone else's).
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
  }
}

async function exited(pid: number, ms = 10_000): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until && alive(pid)) await sleep(200)
  return !alive(pid)
}

// Whether an app of this version starts a daemon: an older one left, or none runs at all (it
// crashed, or was killed). Core waits for one and reconnects by itself, but only an app starts it.
export async function daemonToStart(version: string, home?: string, rule: ReplaceRule = {}): Promise<boolean> {
  return (await retireOldDaemon(version, home, rule)) || (await daemonPresence(home)) === 'gone'
}

// Which of daemon and core to start for an app of this version, after asking any older one to leave.
export async function backendToStart(version: string, home?: string, rule: ReplaceRule = {}): Promise<('daemon' | 'core')[]> {
  const daemon = await daemonToStart(version, home, rule)
  const running = await runningCore(home)
  // A core of this build stays, and a newer one where the rule keeps it: it reconnects to a new
  // daemon by itself.
  if (running !== null && !replaces(running.version, version, rule)) return daemon ? ['daemon'] : []
  if (running) await retireCore(running, version)
  return ['daemon', 'core']
}

// Whether a daemon serves the socket. Only a refused connection or no socket at all proves none
// does; a timeout or any other error proves nothing.
export function daemonPresence(home?: string): Promise<'there' | 'gone' | 'unknown'> {
  return new Promise((resolve) => {
    const socket = net.connect(antumiPaths(home).daemonSocket)
    const settle = (presence: 'there' | 'gone' | 'unknown') => {
      socket.destroy()
      resolve(presence)
    }
    socket.setTimeout(2000, () => settle('unknown'))
    socket.once('connect', () => settle('there'))
    socket.once('error', (error) => settle('code' in error && (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') ? 'gone' : 'unknown'))
  })
}

export type InstallBlocker = { sessionId: string; agent?: AgentKind }
// stopped false: blockers are the sessions the daemon still runs, or null when daemon or core
// could not be shown to have stopped (no answer, or still there after the wait).
export type BackendStop = { stopped: true } | { stopped: false; blockers: InstallBlocker[] | null }

// Before an installer replaces the app's files, which Windows will not do while daemon and core
// run from them (and the NSIS installer ends every Antumi.exe it finds): the daemon leaves only if
// it runs nothing (it decides, as for retireOldDaemon), then core goes. Running agents are never
// stopped for an update; which sessions run comes back instead. Nothing counts as stopped until
// its process is seen gone.
export async function stopBackendForInstall(version: string, home?: string): Promise<BackendStop> {
  const presence = await daemonPresence(home)
  if (presence === 'unknown') return { stopped: false, blockers: null }
  if (presence === 'there') {
    const info = await daemonCall('info', home)
    const answer = daemonSchemas.retire.result.safeParse(await daemonCall('retire', home))
    if (!answer.success) return { stopped: false, blockers: null }
    if (!answer.data.retired) return { stopped: false, blockers: answer.data.blockers ?? [] }
    const pid = typeof info?.pid === 'number' ? info.pid : null
    const gone = pid === null ? await daemonGone(home) : await exited(pid)
    if (!gone) return { stopped: false, blockers: null }
  }
  const core = await runningCore(home)
  if (core && !(await retireCore(core, version))) return { stopped: false, blockers: null }
  return { stopped: true }
}

async function daemonGone(home?: string): Promise<boolean> {
  const until = Date.now() + 10_000
  while (Date.now() < until) {
    if ((await daemonPresence(home)) === 'gone') return true
    await sleep(200)
  }
  return false
}
