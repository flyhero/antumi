import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backendToStart, daemonPresence, daemonToStart, retireOldDaemon, runningCore, stopBackendForInstall } from './backend-lifecycle'
import { writeCoreEndpoint } from './core-endpoint'
import { antumiPaths } from './paths'

const APP = '2.0.0'
const OLD = '1.0.0'
const NEWER = '2.1.0-beta.1'

let home = ''
const cleanup: (() => unknown)[] = []
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'antumi-lifecycle-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  for (const each of cleanup.splice(0).reverse()) await each()
  vi.restoreAllMocks()
  await rm(home, { recursive: true, force: true })
})

// A process of its own to stand for a daemon's or core's, so one can be seen to end.
async function child(ignoreTerm = false): Promise<{ proc: ChildProcess; pid: number }> {
  const script = `${ignoreTerm ? "process.on('SIGTERM', () => {});" : ''}setInterval(() => {}, 1000);process.stdout.write('ready')`
  const proc = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] })
  cleanup.push(() => proc.kill('SIGKILL'))
  if (proc.pid === undefined || !proc.stdout) throw new Error('child did not start')
  await once(proc.stdout, 'data')
  return { proc, pid: proc.pid }
}

async function gone(proc: ChildProcess): Promise<boolean> {
  if (proc.exitCode !== null || proc.signalCode !== null) return true
  const exited = once(proc, 'exit').then(() => true)
  const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500))
  return Promise.race([exited, late])
}

type FakeDaemon = {
  version: string
  pid?: number
  // Sessions it still runs; with none it leaves when asked to retire.
  live?: number
  blockers?: { sessionId: string; agent?: 'claude' }[]
  knowsRetire?: boolean
  onRetire?: () => void
}

// Speaks the daemon's wire (daemon-protocol.ts): a JSON line per request, the reply with its id,
// and events in between.
async function fakeDaemon(fake: FakeDaemon): Promise<{ asked: string[] }> {
  const asked: string[] = []
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    let buffered = ''
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString()
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        const { id, method } = JSON.parse(line)
        asked.push(method)
        socket.write(`${JSON.stringify({ event: 'exit', sessionId: 'other', exitCode: 0 })}\n`)
        const reply = (body: object) => socket.write(`${JSON.stringify({ id, ...body })}\n`)
        if (method === 'info') reply({ result: { version: fake.version, ...(fake.pid === undefined ? {} : { pid: fake.pid }) } })
        else if (method === 'retire' && fake.knowsRetire !== false) {
          const live = fake.live ?? 0
          reply({ result: live === 0 ? { retired: true, live } : { retired: false, live, ...(fake.blockers ? { blockers: fake.blockers } : {}) } })
          if (live === 0) {
            server.close()
            for (const each of sockets) each.end()
            fake.onRetire?.()
          }
        } else reply({ error: 'unknown-method' })
      }
    })
  })
  server.listen(antumiPaths(home).daemonSocket)
  await once(server, 'listening')
  cleanup.push(() => new Promise((resolve) => {
    for (const each of sockets) each.destroy()
    server.close(() => resolve(undefined))
  }))
  return { asked }
}

// A core.json naming a port that answers, or with listening false one where nothing does.
async function fakeCore(version: string | undefined, pid: number, listening = true): Promise<void> {
  const server = net.createServer((socket) => socket.destroy())
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  if (listening) cleanup.push(() => new Promise((resolve) => server.close(resolve)))
  else await new Promise((resolve) => server.close(resolve))
  await writeCoreEndpoint({ port: address.port, token: 't', pid, protocolVersion: 1, ...(version === undefined ? {} : { version }) }, home)
}

// A socket file no daemon listens on any more, as one killed outright leaves it.
async function staleSocket(): Promise<void> {
  const socketPath = antumiPaths(home).daemonSocket
  const script = `require('node:net').createServer().listen(${JSON.stringify(socketPath)}, () => process.stdout.write('ready'))`
  const proc = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] })
  if (!proc.stdout) throw new Error('child did not start')
  await once(proc.stdout, 'data')
  proc.kill('SIGKILL')
  await once(proc, 'exit')
  cleanup.push(() => rm(socketPath, { force: true }))
}

const asRoot = process.getuid?.() === 0

describe.skipIf(process.platform === 'win32')('backend lifecycle', () => {
  describe('runningCore', () => {
    it('is null without a core.json', async () => {
      expect(await runningCore(home)).toBeNull()
    })

    it('is the endpoint when its port answers', async () => {
      await fakeCore(APP, process.pid)
      expect(await runningCore(home)).toMatchObject({ pid: process.pid, version: APP })
    })

    it('is null when the file names a port nothing listens on', async () => {
      await fakeCore(APP, process.pid, false)
      expect(await runningCore(home)).toBeNull()
    })
  })

  describe('daemonPresence', () => {
    it('is there when a daemon accepts', async () => {
      await fakeDaemon({ version: APP })
      expect(await daemonPresence(home)).toBe('there')
    })

    it('is gone when nothing listens on the socket', async () => {
      await staleSocket()
      expect(await daemonPresence(home)).toBe('gone')
    })

    it('is gone without a socket file', async () => {
      expect(await daemonPresence(home)).toBe('gone')
    })

    it.skipIf(asRoot)('is unknown when the socket cannot be reached for another reason', async () => {
      await fakeDaemon({ version: APP })
      await chmod(antumiPaths(home).daemonSocket, 0o000)
      expect(await daemonPresence(home)).toBe('unknown')
    })
  })

  describe('retireOldDaemon', () => {
    it('leaves a daemon of the same version alone', async () => {
      const daemon = await fakeDaemon({ version: APP, pid: 101 })
      expect(await retireOldDaemon(APP, home)).toBe(false)
      expect(daemon.asked).toEqual(['info'])
      expect(await daemonPresence(home)).toBe('there')
    })

    it('retires an older idle daemon and waits until it is gone', async () => {
      const daemon = await fakeDaemon({ version: OLD, pid: 102 })
      expect(await retireOldDaemon(APP, home)).toBe(true)
      expect(daemon.asked).toEqual(['info', 'retire'])
      expect(await daemonPresence(home)).toBe('gone')
    })

    it('keeps an older daemon that still runs something, and says so once', async () => {
      await fakeDaemon({ version: OLD, pid: 103, live: 2 })
      expect(await retireOldDaemon(APP, home)).toBe(false)
      expect(await retireOldDaemon(APP, home)).toBe(false)
      expect(await daemonPresence(home)).toBe('there')
      const said = vi.mocked(console.log).mock.calls.filter(([line]) => String(line).includes('still runs 2 sessions'))
      expect(said).toHaveLength(1)
    })

    it('is false without a daemon', async () => {
      expect(await retireOldDaemon(APP, home)).toBe(false)
    })

    it('replaces a newer daemon here, and keeps it on a server', async () => {
      const daemon = await fakeDaemon({ version: NEWER, pid: 104 })
      expect(await retireOldDaemon(APP, home, { keepNewer: true })).toBe(false)
      expect(daemon.asked).toEqual(['info'])
      expect(await retireOldDaemon(APP, home)).toBe(true)
    })
  })

  describe('daemonToStart', () => {
    it('is true once an older daemon left', async () => {
      await fakeDaemon({ version: OLD, pid: 401 })
      expect(await daemonToStart(APP, home)).toBe(true)
    })

    it('is true when no daemon serves the socket any more, as after a crash', async () => {
      await staleSocket()
      expect(await daemonToStart(APP, home)).toBe(true)
    })

    it('is false while a daemon of this version runs, or an older one still runs something', async () => {
      await fakeDaemon({ version: OLD, pid: 402, live: 1 })
      expect(await daemonToStart(APP, home)).toBe(false)
    })

    it.skipIf(asRoot)('is false when the socket cannot be shown to be gone', async () => {
      await fakeDaemon({ version: APP })
      await chmod(antumiPaths(home).daemonSocket, 0o000)
      expect(await daemonToStart(APP, home)).toBe(false)
    })
  })

  describe('backendToStart', () => {
    it('starts both when nothing runs', async () => {
      expect(await backendToStart(APP, home)).toEqual(['daemon', 'core'])
    })

    it('starts nothing when daemon and core are of this version', async () => {
      await fakeDaemon({ version: APP, pid: 201 })
      await fakeCore(APP, process.pid)
      expect(await backendToStart(APP, home)).toEqual([])
    })

    it('starts only the daemon when the core is current and no daemon runs', async () => {
      const core = await child()
      await fakeCore(APP, core.pid)
      expect(await backendToStart(APP, home)).toEqual(['daemon'])
      expect(await gone(core.proc)).toBe(false)
    })

    it('starts nothing when the core is current and an older daemon is busy', async () => {
      await fakeDaemon({ version: OLD, pid: 202, live: 1 })
      await fakeCore(APP, process.pid)
      expect(await backendToStart(APP, home)).toEqual([])
      expect(await daemonPresence(home)).toBe('there')
    })

    it('starts only the daemon when an older one left and the core is current', async () => {
      const core = await child()
      await fakeDaemon({ version: OLD, pid: 203 })
      await fakeCore(APP, core.pid)
      expect(await backendToStart(APP, home)).toEqual(['daemon'])
      expect(await gone(core.proc)).toBe(false)
    })

    it('retires an older core and starts both', async () => {
      const core = await child()
      await fakeDaemon({ version: APP, pid: 204 })
      await fakeCore(OLD, core.pid)
      expect(await backendToStart(APP, home)).toEqual(['daemon', 'core'])
      expect(await gone(core.proc)).toBe(true)
    })

    it('on a server, keeps a newer daemon and core and starts nothing, but still replaces older ones', async () => {
      const core = await child()
      const daemon = await fakeDaemon({ version: NEWER, pid: 205 })
      await fakeCore(NEWER, core.pid)
      expect(await backendToStart(APP, home, { keepNewer: true })).toEqual([])
      expect(daemon.asked).toEqual(['info'])
      expect(await gone(core.proc)).toBe(false)
    })

    it('on a server, replaces an older core as anywhere', async () => {
      const core = await child()
      await fakeDaemon({ version: APP, pid: 206 })
      await fakeCore(OLD, core.pid)
      expect(await backendToStart(APP, home, { keepNewer: true })).toEqual(['daemon', 'core'])
      expect(await gone(core.proc)).toBe(true)
    })

    it('takes an unversioned core for an older one', async () => {
      const core = await child()
      await fakeCore(undefined, core.pid)
      expect(await backendToStart(APP, home)).toEqual(['daemon', 'core'])
      expect(await gone(core.proc)).toBe(true)
    })

    it('signals no process for a core.json whose port nothing answers', async () => {
      const core = await child()
      await fakeCore(OLD, core.pid, false)
      expect(await backendToStart(APP, home)).toEqual(['daemon', 'core'])
      expect(await gone(core.proc)).toBe(false)
    })
  })

  describe('stopBackendForInstall', () => {
    it('is stopped when nothing runs', async () => {
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: true })
    })

    it('stops an idle daemon and the core, once both are seen gone', async () => {
      const daemonProcess = await child()
      const core = await child()
      await fakeDaemon({ version: APP, pid: daemonProcess.pid, onRetire: () => daemonProcess.proc.kill('SIGKILL') })
      await fakeCore(APP, core.pid)
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: true })
      expect(await gone(daemonProcess.proc)).toBe(true)
      expect(await gone(core.proc)).toBe(true)
    })

    it('waits on the socket for a daemon that gives no pid', async () => {
      await fakeDaemon({ version: APP })
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: true })
      expect(await daemonPresence(home)).toBe('gone')
    })

    it('returns the sessions a busy daemon still runs, and leaves the core', async () => {
      const core = await child()
      await fakeDaemon({ version: APP, pid: 301, live: 1, blockers: [{ sessionId: 's1', agent: 'claude' }] })
      await fakeCore(APP, core.pid)
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: false, blockers: [{ sessionId: 's1', agent: 'claude' }] })
      expect(await gone(core.proc)).toBe(false)
    })

    it('returns no sessions for an older busy daemon that does not name them', async () => {
      await fakeDaemon({ version: OLD, pid: 302, live: 3 })
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: false, blockers: [] })
    })

    it('cannot tell for a daemon that does not know retire', async () => {
      await fakeDaemon({ version: OLD, pid: 303, knowsRetire: false })
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: false, blockers: null })
    })

    it.skipIf(asRoot)('cannot tell when the daemon socket is neither there nor gone', async () => {
      await fakeDaemon({ version: APP })
      await chmod(antumiPaths(home).daemonSocket, 0o000)
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: false, blockers: null })
    })

    it('cannot tell when the core outlives the wait', async () => {
      const core = await child(true)
      await fakeCore(APP, core.pid)
      expect(await stopBackendForInstall(APP, home)).toEqual({ stopped: false, blockers: null })
      expect(await gone(core.proc)).toBe(false)
    }, 20_000)
  })
})
