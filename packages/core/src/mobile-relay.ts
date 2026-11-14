import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { MobileRelay as MobileRelayStatus, MobileRelaySetup, MobileRelayState } from '@antumi/protocol'
import { RELAY_COMPUTER_ADDRESS, computerTunnelConfig, phoneTunnelConfig, relayKeys, relayServerScript, type RelayConfig } from './relay-config'
import { WireproxyUnavailable, freeLoopbackPort, lastHandshake, launchWireproxy, obtainWireproxy, type WireproxyProcess } from './wireproxy'

// The relay through the user's own server (docs/MOBILE.md): its keys, kept beside the computer's
// phone key, and wireproxy, run while phone access is on, the way the gateway is.

const Key = z.object({ privateKey: z.string(), publicKey: z.string() })
const StoredRelay = z.object({ server: z.string(), port: z.number().int(), bandwidth: z.number().nullable().optional(), keys: z.object({ server: Key, computer: Key, phone: Key }) })

// WireGuard renews a handshake every two minutes while keepalives flow: one this recent means the
// tunnel to the server is up.
const FRESH_MS = 3 * 60_000
const PROBE_MS = 5_000
const RESTART_DELAYS_MS = [1_000, 5_000, 30_000, 60_000]

export type RelayDeps = {
  // The program's path; `downloading` is called before it has to be fetched.
  obtain: (downloading: () => void) => Promise<string>
  launch: (program: string, configPath: string, healthPort: number, onExit: (output: string) => void) => WireproxyProcess
  probe: (healthPort: number) => Promise<number | null>
  port: () => Promise<number>
}

export type MobileRelayOptions = {
  // <home>/mobile: relay.json with the keys, the tunnel's configuration, and bin/ with the program.
  dir: string
  changed: () => void
  now?: () => number
  deps?: Partial<RelayDeps>
}

export class MobileRelay {
  private config: RelayConfig | null
  private state: MobileRelayState = 'off'
  private error: string | null = null
  private handshakeAt: number | null = null
  private gatewayPort: number | null = null
  private process: WireproxyProcess | null = null
  private probeTimer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private attempts = 0
  // Bumped whenever the tunnel is torn down, so what an older start was waiting on is dropped.
  private run = 0
  private readonly deps: RelayDeps
  private readonly now: () => number

  constructor(private readonly options: MobileRelayOptions) {
    this.config = this.load()
    this.now = options.now ?? Date.now
    const bin = path.join(options.dir, 'bin')
    this.deps = {
      obtain: (downloading) => obtainWireproxy(bin, { downloading }),
      launch: launchWireproxy,
      probe: lastHandshake,
      port: freeLoopbackPort,
      ...options.deps
    }
  }

  status(): MobileRelayStatus | null {
    if (!this.config) return null
    return { server: this.config.server, port: this.config.port, address: RELAY_COMPUTER_ADDRESS, state: this.state, error: this.error, handshakeAt: this.handshakeAt, bandwidth: this.config.bandwidth ?? null }
  }

  // Where phones reach this computer through the tunnel, once it is set up.
  address(): string | null {
    return this.config ? RELAY_COMPUTER_ADDRESS : null
  }

  setup(): MobileRelaySetup | null {
    return this.config ? { serverScript: relayServerScript(this.config), phoneConfig: phoneTunnelConfig(this.config) } : null
  }

  // Keeps the keys a server change does not need to change, so the phone's tunnel only needs its new
  // endpoint and the server script runs as before.
  async configure(server: string, port: number, bandwidth: number | null = null): Promise<void> {
    this.config = { server, port, bandwidth, keys: this.config?.keys ?? relayKeys() }
    await mkdir(this.options.dir, { recursive: true, mode: 0o700 })
    await writeFile(this.file(), JSON.stringify(this.config), { mode: 0o600 })
  }

  async remove(): Promise<void> {
    this.stop()
    this.config = null
    await rm(this.file(), { force: true })
    await rm(this.tunnelFile(), { force: true })
  }

  // While phone access is on: the tunnel hands what arrives for this computer to the gateway's port.
  // Already running for that port, it carries on.
  start(gatewayPort: number): void {
    if (this.gatewayPort === gatewayPort && this.state !== 'off') return
    this.gatewayPort = gatewayPort
    this.halt()
    this.attempts = 0
    void this.begin()
  }

  stop(): void {
    this.gatewayPort = null
    this.halt()
    this.state = 'off'
    this.error = null
    this.handshakeAt = null
  }

  private halt(): void {
    this.run += 1
    if (this.probeTimer) clearInterval(this.probeTimer)
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.probeTimer = null
    this.restartTimer = null
    this.process?.stop()
    this.process = null
  }

  private async begin(): Promise<void> {
    const run = this.run
    const config = this.config
    const gatewayPort = this.gatewayPort
    if (!config || gatewayPort === null) return
    let program: string
    let healthPort: number
    try {
      program = await this.deps.obtain(() => {
        if (run !== this.run) return
        this.state = 'downloading'
        this.error = null
        this.options.changed()
      })
      healthPort = await this.deps.port()
      await writeFile(this.tunnelFile(), computerTunnelConfig(config, gatewayPort), { mode: 0o600 })
    } catch (error) {
      if (run !== this.run) return
      if (!(error instanceof WireproxyUnavailable)) console.error('[antumi-core] phone relay could not start:', error)
      else console.error(`[antumi-core] phone relay: ${error.message}`)
      this.state = 'failed'
      this.error = error instanceof WireproxyUnavailable ? error.reason : error instanceof Error ? error.message : String(error)
      this.options.changed()
      return
    }
    if (run !== this.run) return
    this.state = 'waiting'
    this.error = null
    this.handshakeAt = null
    this.options.changed()
    this.process = this.deps.launch(program, this.tunnelFile(), healthPort, (output) => {
      if (run !== this.run) return
      this.process = null
      if (this.probeTimer) clearInterval(this.probeTimer)
      this.probeTimer = null
      this.state = 'failed'
      this.error = output || 'exited'
      this.options.changed()
      // It went away by itself: try again, more slowly each time.
      const delay = RESTART_DELAYS_MS[Math.min(this.attempts, RESTART_DELAYS_MS.length - 1)]!
      this.attempts += 1
      this.restartTimer = setTimeout(() => void this.begin(), delay)
      this.restartTimer.unref()
    })
    this.probeTimer = setInterval(() => void this.probe(run, healthPort), PROBE_MS)
    this.probeTimer.unref()
  }

  private async probe(run: number, healthPort: number): Promise<void> {
    const at = await this.deps.probe(healthPort)
    if (run !== this.run || !this.process) return
    const fresh = at !== null && this.now() - at < FRESH_MS
    if (fresh) this.attempts = 0
    const state: MobileRelayState = fresh ? 'connected' : 'waiting'
    if (state === this.state && at === this.handshakeAt) return
    this.state = state
    this.handshakeAt = at
    this.options.changed()
  }

  private load(): RelayConfig | null {
    try {
      const parsed = StoredRelay.safeParse(JSON.parse(readFileSync(this.file(), 'utf8')))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private file(): string {
    return path.join(this.options.dir, 'relay.json')
  }

  private tunnelFile(): string {
    return path.join(this.options.dir, 'relay-wireproxy.conf')
  }
}
