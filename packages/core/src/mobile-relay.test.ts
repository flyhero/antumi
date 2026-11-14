import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileRelay, type RelayDeps } from './mobile-relay'
import { WireproxyUnavailable } from './wireproxy'

describe('MobileRelay', () => {
  let dir: string
  let launched: { program: string; configPath: string; exit: (output: string) => void; stopped: boolean }[]
  let handshake: number | null
  let changes: number
  let now: number
  let deps: RelayDeps

  const relay = (overrides: Partial<RelayDeps> = {}) => new MobileRelay({ dir, changed: () => changes++, now: () => now, deps: { ...deps, ...overrides } })
  const settle = () => new Promise((resolve) => setImmediate(resolve))

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-relay-'))
    launched = []
    handshake = null
    changes = 0
    now = 1_000_000
    deps = {
      obtain: async () => '/bin/wireproxy',
      launch: (program, configPath, _healthPort, onExit) => {
        const entry = { program, configPath, exit: onExit, stopped: false }
        launched.push(entry)
        return { stop: () => (entry.stopped = true) }
      },
      probe: async () => handshake,
      port: async () => 40000
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('is nothing until set up, then keeps its keys across a change of server and forgets them when removed', async () => {
    const first = relay()
    expect(first.status()).toBeNull()
    expect(first.address()).toBeNull()
    await first.configure('8.159.153.95', 51820)
    expect(first.status()).toMatchObject({ server: '8.159.153.95', port: 51820, address: '10.77.0.2', state: 'off' })
    expect(statSync(path.join(dir, 'relay.json')).mode & 0o777).toBe(0o600)
    const before = first.setup()!
    await first.configure('relay.example.com', 41820, 3)
    expect(first.status()?.bandwidth).toBe(3)
    const after = first.setup()!
    expect(after.serverScript).toContain('htb rate 2790kbit')
    expect(after.phoneConfig).toContain('Endpoint = relay.example.com:41820')
    // Same keys: only the endpoint and the port changed.
    expect(after.phoneConfig.match(/PrivateKey = (.+)/)?.[1]).toBe(before.phoneConfig.match(/PrivateKey = (.+)/)?.[1])
    // Kept across a restart of core.
    expect(relay().setup()).toEqual(after)
    await first.remove()
    expect(first.status()).toBeNull()
    expect(existsSync(path.join(dir, 'relay.json'))).toBe(false)
    expect(relay().status()).toBeNull()
  })

  it('runs the tunnel to the gateway\'s port, and says when it reaches the server', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    const tunnel = relay()
    await tunnel.configure('8.159.153.95', 51820)
    tunnel.start(7820)
    await vi.waitFor(() => expect(launched).toHaveLength(1))
    expect(tunnel.status()?.state).toBe('waiting')
    const config = readFileSync(launched[0]!.configPath, 'utf8')
    expect(config).toContain('ListenPort = 7820')
    expect(statSync(launched[0]!.configPath).mode & 0o777).toBe(0o600)

    handshake = now - 10_000
    await vi.advanceTimersByTimeAsync(5_000)
    expect(tunnel.status()).toMatchObject({ state: 'connected', handshakeAt: now - 10_000 })

    // Going stale: no handshake for minutes.
    now += 10 * 60_000
    await vi.advanceTimersByTimeAsync(5_000)
    expect(tunnel.status()?.state).toBe('waiting')

    // Starting again for the same port leaves it running.
    tunnel.start(7820)
    expect(launched).toHaveLength(1)
    tunnel.stop()
    expect(launched[0]!.stopped).toBe(true)
    expect(tunnel.status()?.state).toBe('off')
  })

  it('starts it again, more slowly each time, when it exits by itself', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    const tunnel = relay()
    await tunnel.configure('8.159.153.95', 51820)
    tunnel.start(7820)
    await vi.waitFor(() => expect(launched).toHaveLength(1))
    launched[0]!.exit('bad config')
    expect(tunnel.status()).toMatchObject({ state: 'failed', error: 'bad config' })
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(launched).toHaveLength(2))
    launched[1]!.exit('')
    expect(tunnel.status()).toMatchObject({ state: 'failed', error: 'exited' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(launched).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(4_000)
    await vi.waitFor(() => expect(launched).toHaveLength(3))
    // A stopped tunnel's exit is not a failure.
    tunnel.stop()
    launched[2]!.exit('killed')
    expect(tunnel.status()?.state).toBe('off')
  })

  it('says why when the program cannot be had, and that it is downloading meanwhile', async () => {
    let finish: () => void = () => {}
    const tunnel = relay({
      obtain: (downloading) => {
        downloading()
        return new Promise((_resolve, reject) => (finish = () => reject(new WireproxyUnavailable('download-failed', 'HTTP 404'))))
      }
    })
    await tunnel.configure('8.159.153.95', 51820)
    tunnel.start(7820)
    await settle()
    expect(tunnel.status()?.state).toBe('downloading')
    finish()
    await settle()
    expect(tunnel.status()).toMatchObject({ state: 'failed', error: 'download-failed' })
    expect(launched).toHaveLength(0)
    expect(changes).toBeGreaterThan(0)
  })
})
