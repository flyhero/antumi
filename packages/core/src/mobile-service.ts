import { execFile, fork, type ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { hostname, networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MOBILE_PROTOCOL_VERSION,
  base64Url,
  conversationAlert,
  conversationWaiting,
  encodePairingCode,
  type Conversation,
  type ConversationAlert,
  type MobileAccess,
  type MobileGatewayState,
  type MobilePairing,
  type MobilePlatform,
  type MobileRelaySetup,
  type MobileStatus
} from '@antumi/protocol'
import { generateKeyPair, keyPairFromPrivate, mobileDeviceId, type NoiseKeyPair } from '@antumi/protocol/mobile'
import { GatewayToCore, type CoreToGateway } from './gateway-ipc'
import { isPrivateAddress } from './gateway'
import { MobileRelay, type RelayDeps } from './mobile-relay'
import type { MobileSettings, MobileStore } from './mobile-store'
import { Rejection } from './rejection'
import type { Connection } from './rpc-server'

// The phone link's control side (docs/MOBILE.md): settings, the computer's key, pairing, paired
// devices, and the gateway child that owns the port. Core decides who may do what; the gateway
// only carries phones' requests to it.

const PAIRING_MS = 5 * 60_000
const CONFIRM_MS = 2 * 60_000
const RESTART_DELAYS_MS = [1_000, 5_000, 30_000, 60_000]
const PUSH_GAP_MS = 30_000

export type GatewayLink = { send(message: CoreToGateway): void; stop(): void }
export type GatewayLauncher = (onMessage: (message: GatewayToCore) => void, onExit: () => void) => GatewayLink

// From source, through the workspace's tsx, as mcp-command does; packaged, the gateway.mjs bundled
// beside core.mjs, on the same binary as plain Node.
export const forkGateway: GatewayLauncher = (onMessage, onExit) => {
  const fromSource = import.meta.url.endsWith('.ts')
  const script = fileURLToPath(new URL(fromSource ? './gateway-main.ts' : './gateway.mjs', import.meta.url))
  const execArgv = fromSource ? ['--import', fileURLToPath(new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url))] : []
  const child: ChildProcess = fork(script, [], {
    execArgv,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }
  })
  child.on('message', (raw) => {
    const message = GatewayToCore.safeParse(raw)
    if (message.success) onMessage(message.data)
  })
  child.once('exit', onExit)
  return {
    send: (message) => {
      if (child.connected) child.send(message)
    },
    stop: () => child.kill('SIGTERM')
  }
}

type OpenPairing = {
  id: string
  psk: string
  expiresAt: number
  uri: string
  request: { name: string; platform: MobilePlatform; code: string; publicKey: string } | null
  timer: NodeJS.Timeout
}

export type MobileServiceOptions = {
  // Where the computer's key lives (<home>/mobile).
  dir: string
  connections: () => Iterable<Connection>
  changed: (status: MobileStatus) => void
  launch?: GatewayLauncher
  now?: () => number
  computerName?: string
  // Interfaces' private addresses, and Tailscale's name for this computer if it has one.
  addresses?: () => Promise<string[]>
  post?: (url: string, body: string) => Promise<void>
  relay?: Partial<RelayDeps>
}

export class MobileService {
  private settings: MobileSettings
  private state: MobileGatewayState = 'off'
  private error: string | null = null
  private link: GatewayLink | null = null
  private stopping = false
  private attempts = 0
  private restartTimer: NodeJS.Timeout | null = null
  private key: NoiseKeyPair | null = null
  private pairing: OpenPairing | null = null
  private coreUrl: string | null = null
  private known: string[] = []
  private readonly now: () => number
  private readonly seen = new Map<string, Conversation>()
  private readonly pushed = new Map<string, number>()
  private readonly relay: MobileRelay

  constructor(private readonly store: MobileStore, private readonly options: MobileServiceOptions) {
    this.settings = store.settings()
    this.now = options.now ?? Date.now
    this.relay = new MobileRelay({ dir: options.dir, changed: () => this.notify(), now: this.now, ...(options.relay ? { deps: options.relay } : {}) })
  }

  // Once core's own server is up: the gateway connects to it for each phone.
  async start(coreUrl: string): Promise<void> {
    this.coreUrl = coreUrl
    void this.refreshAddresses()
    if (this.settings.enabled) await this.launch()
  }

  stop(): void {
    this.stopping = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.closePairing('shutdown')
    this.link?.stop()
    this.link = null
    this.relay.stop()
  }

  status(): MobileStatus {
    const online = new Set([...this.options.connections()].flatMap((connection) => (connection.mobile ? [connection.mobile.deviceId] : [])))
    const pairing: MobilePairing | null = this.pairing
      ? { id: this.pairing.id, uri: this.pairing.uri, expiresAt: this.pairing.expiresAt, request: this.pairing.request ? { name: this.pairing.request.name, platform: this.pairing.request.platform, code: this.pairing.request.code } : null }
      : null
    return {
      enabled: this.settings.enabled,
      port: this.settings.port,
      state: this.state,
      error: this.error,
      addresses: this.hosts(),
      pairing,
      devices: this.store.devices().map(({ publicKey: _key, ...device }) => ({ ...device, online: online.has(device.id) })),
      pushUrl: this.settings.pushUrl,
      extraHosts: this.settings.extraHosts,
      relay: this.relay.status()
    }
  }

  async setEnabled(enabled: boolean): Promise<MobileStatus> {
    this.save({ ...this.settings, enabled })
    if (enabled) await this.launch()
    else this.shutdown()
    return this.notify()
  }

  async setPort(port: number): Promise<MobileStatus> {
    this.save({ ...this.settings, port })
    if (this.settings.enabled) {
      this.shutdown()
      await this.launch()
    }
    return this.notify()
  }

  setPushUrl(url: string | null): MobileStatus {
    this.save({ ...this.settings, pushUrl: url })
    return this.notify()
  }

  setExtraHosts(hosts: readonly string[]): MobileStatus {
    this.save({ ...this.settings, extraHosts: [...new Set(hosts)] })
    this.link?.send({ type: 'hosts', hosts: this.hosts() })
    return this.notify()
  }

  async setRelay(server: string, port: number, bandwidth: number | null = null): Promise<MobileStatus> {
    await this.relay.configure(server, port, bandwidth)
    if (this.link) {
      this.relay.stop()
      this.relay.start(this.settings.port)
    }
    this.link?.send({ type: 'hosts', hosts: this.hosts() })
    return this.notify()
  }

  async removeRelay(): Promise<MobileStatus> {
    await this.relay.remove()
    this.link?.send({ type: 'hosts', hosts: this.hosts() })
    return this.notify()
  }

  relaySetup(): MobileRelaySetup {
    const setup = this.relay.setup()
    if (!setup) throw new Rejection('mobile-relay-unset', 'set up the relay first')
    return setup
  }

  async beginPairing(): Promise<MobilePairing> {
    if (this.state !== 'running' || !this.key) throw new Rejection('mobile-not-running', 'turn on phone access first')
    this.closePairing('replaced')
    await this.refreshAddresses()
    const id = randomUUID()
    const psk = base64Url.encode(randomBytes(32))
    const expiresAt = this.now() + PAIRING_MS
    const uri = encodePairingCode({
      v: MOBILE_PROTOCOL_VERSION, name: this.computerName(), key: base64Url.encode(this.key.publicKey),
      pairing: id, psk, port: this.settings.port, hosts: this.hosts()
    })
    const timer = setTimeout(() => this.closePairing('expired'), PAIRING_MS)
    timer.unref()
    this.pairing = { id, psk, expiresAt, uri, request: null, timer }
    this.link?.send({ type: 'pairing', pairing: { id, psk, expiresAt } })
    this.notify()
    return { id, uri, expiresAt, request: null }
  }

  cancelPairing(): MobileStatus {
    this.closePairing('cancelled')
    return this.notify()
  }

  confirmPairing(pairingId: string, access: MobileAccess | null): MobileStatus {
    const pairing = this.pairing
    if (!pairing || pairing.id !== pairingId || !pairing.request) throw new Rejection('mobile-pairing-gone', 'this pairing is no longer open')
    const { request } = pairing
    if (access) {
      const deviceId = mobileDeviceId(base64Url.decode(request.publicKey))
      this.store.add({ id: deviceId, name: request.name, platform: request.platform, publicKey: request.publicKey, access, pairedAt: this.now() })
      this.sendDevices()
      this.link?.send({ type: 'answer', pairingId, answer: { deviceId, access } })
      clearTimeout(pairing.timer)
      this.pairing = null
      this.link?.send({ type: 'pairing', pairing: null })
    } else {
      this.closePairing('refused')
    }
    return this.notify()
  }

  setAccess(deviceId: string, access: MobileAccess): MobileStatus {
    if (!this.store.setAccess(deviceId, access)) throw new Rejection('mobile-device-unknown', `no device ${deviceId}`)
    for (const connection of this.options.connections()) {
      if (connection.mobile?.deviceId === deviceId) connection.mobile.access = access
    }
    this.sendDevices()
    return this.notify()
  }

  revoke(deviceId: string): MobileStatus {
    if (!this.store.remove(deviceId)) throw new Rejection('mobile-device-unknown', `no device ${deviceId}`)
    this.link?.send({ type: 'revoke', deviceId })
    this.sendDevices()
    for (const connection of this.options.connections()) {
      if (connection.mobile?.deviceId === deviceId) connection.close?.()
    }
    return this.notify()
  }

  // system.hello from the gateway, for one phone: from here on core holds the connection to what
  // that device may do. A device revoked meanwhile is refused, and the gateway closes the link.
  authorize(connection: Connection, deviceId: string): void {
    const device = this.store.device(deviceId)
    if (!device) throw new Rejection('mobile-device-unknown', `no device ${deviceId}`)
    connection.mobile = { deviceId, access: device.access }
    this.store.seen(deviceId, this.now())
    connection.onClose(() => {
      this.store.seen(deviceId, this.now())
      this.notify()
    })
    this.notify()
  }

  // Every conversation change: a push for what the desktop would tell of, when a push address is
  // set. First call per conversation only records it; at start, those already waiting are told of.
  conversationChanged(conversation: Conversation, inSquad: (taskId: string) => boolean): void {
    const before = this.seen.get(conversation.id)
    this.seen.set(conversation.id, conversation)
    const alert = conversationAlert(before, conversation, inSquad)
    if (alert) this.push(conversation, alert)
  }

  seed(conversations: readonly Conversation[]): void {
    for (const conversation of conversations) {
      this.seen.set(conversation.id, conversation)
      if (conversationWaiting(conversation)) this.push(conversation, 'waiting')
    }
  }

  conversationDeleted(id: string): void {
    this.seen.delete(id)
  }

  private push(conversation: Conversation, alert: ConversationAlert): void {
    const url = this.settings.pushUrl
    if (!url) return
    const key = `${conversation.id}:${alert}:${conversation.chat?.request?.requestId ?? ''}`
    const last = this.pushed.get(key)
    if (last !== undefined && this.now() - last < PUSH_GAP_MS) return
    this.pushed.set(key, this.now())
    if (this.pushed.size > 500) this.pushed.delete(this.pushed.keys().next().value!)
    // Only that something happened: an ntfy topic may be read by its server, so no titles or text.
    const body = alert === 'waiting' ? '有会话在等你确认或回答' : alert === 'crashed' ? '有会话的 Agent 意外退出了' : alert === 'finishedAsking' ? '有会话本轮结束，并留了一个问题' : '有会话本轮结束了'
    const post = this.options.post ?? defaultPost
    void post(url, body).catch((error: unknown) => console.error('[antumi-core] phone push failed:', error instanceof Error ? error.message : error))
  }

  private save(settings: MobileSettings): void {
    this.settings = settings
    this.store.saveSettings(settings)
  }

  private notify(): MobileStatus {
    const status = this.status()
    this.options.changed(status)
    return status
  }

  private computerName(): string {
    return this.options.computerName ?? hostname().replace(/\.local$/, '')
  }

  // What phones are told to try, at most 16: the interfaces' addresses, then the relay's and the
  // user's own, which keep their place however many the interfaces have.
  private hosts(): string[] {
    const relay = this.relay.address()
    const added = [...new Set([...(relay ? [relay] : []), ...this.settings.extraHosts])]
    const own = this.known.filter((host) => !added.includes(host)).slice(0, Math.max(0, 16 - added.length))
    return [...own, ...added].slice(0, 16)
  }

  private async refreshAddresses(): Promise<void> {
    try {
      this.known = await (this.options.addresses ?? localAddresses)()
      this.link?.send({ type: 'hosts', hosts: this.hosts() })
    } catch {
      // Keep what was known.
    }
  }

  private async loadKey(): Promise<NoiseKeyPair> {
    if (this.key) return this.key
    await mkdir(this.options.dir, { recursive: true, mode: 0o700 })
    const file = path.join(this.options.dir, 'key.json')
    try {
      const saved: unknown = JSON.parse(await readFile(file, 'utf8'))
      if (typeof saved === 'object' && saved !== null && 'privateKey' in saved && typeof saved.privateKey === 'string') {
        this.key = keyPairFromPrivate(base64Url.decode(saved.privateKey))
        return this.key
      }
    } catch {
      // None yet: made below. A key that cannot be read is replaced, and phones pair again.
    }
    const key = generateKeyPair()
    await writeFile(file, JSON.stringify({ privateKey: base64Url.encode(key.privateKey) }), { mode: 0o600 })
    await chmod(file, 0o600)
    this.key = key
    return key
  }

  private async launch(): Promise<void> {
    if (this.link || !this.coreUrl) return
    const key = await this.loadKey()
    this.stopping = false
    this.state = 'starting'
    this.error = null
    const launcher = this.options.launch ?? forkGateway
    let link: GatewayLink | null = null
    link = launcher((message) => this.onGateway(message), () => {
      if (this.link !== link) return
      this.link = null
      this.closePairing('shutdown')
      if (this.stopping || !this.settings.enabled) {
        this.state = 'off'
      } else if (this.state !== 'failed' || this.error !== 'port-in-use') {
        // It went away by itself: try again, more slowly each time.
        this.state = 'starting'
        const delay = RESTART_DELAYS_MS[Math.min(this.attempts, RESTART_DELAYS_MS.length - 1)]!
        this.attempts += 1
        this.restartTimer = setTimeout(() => void this.launch(), delay)
        this.restartTimer.unref()
      }
      this.notify()
    })
    this.link = link
    link.send({ type: 'start', config: { port: this.settings.port, privateKey: base64Url.encode(key.privateKey), coreUrl: this.coreUrl, computerName: this.computerName() } })
    this.sendDevices()
    link.send({ type: 'hosts', hosts: this.hosts() })
    this.relay.start(this.settings.port)
    this.notify()
  }

  private shutdown(): void {
    this.stopping = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.closePairing('shutdown')
    this.link?.stop()
    this.link = null
    this.relay.stop()
    this.state = 'off'
    this.error = null
  }

  private onGateway(message: GatewayToCore): void {
    if (message.type === 'listening') {
      this.state = 'running'
      this.error = null
      this.attempts = 0
    } else if (message.type === 'failed') {
      this.state = 'failed'
      this.error = message.reason === 'port-in-use' ? 'port-in-use' : message.message
    } else {
      this.paired(message)
      return
    }
    this.notify()
  }

  // A phone completed the handshake with the open pairing's code: the user confirms on this
  // computer, comparing the code both screens show. The code is spent whatever they answer.
  private paired(message: Extract<GatewayToCore, { type: 'paired' }>): void {
    const pairing = this.pairing
    if (!pairing || pairing.id !== message.pairingId || pairing.request || pairing.expiresAt <= this.now()) {
      this.link?.send({ type: 'answer', pairingId: message.pairingId, answer: { rejected: 'expired' } })
      return
    }
    pairing.request = { name: message.hello.name, platform: message.hello.platform, code: message.code, publicKey: message.publicKey }
    clearTimeout(pairing.timer)
    pairing.timer = setTimeout(() => this.closePairing('timeout'), CONFIRM_MS)
    pairing.timer.unref()
    this.link?.send({ type: 'pairing', pairing: null })
    this.notify()
  }

  private closePairing(reason: string): void {
    const pairing = this.pairing
    if (!pairing) return
    clearTimeout(pairing.timer)
    this.pairing = null
    if (pairing.request) this.link?.send({ type: 'answer', pairingId: pairing.id, answer: { rejected: reason } })
    this.link?.send({ type: 'pairing', pairing: null })
    if (reason === 'expired' || reason === 'timeout') this.notify()
  }

  private sendDevices(): void {
    this.link?.send({ type: 'devices', devices: this.store.devices().map(({ id, publicKey, access }) => ({ id, publicKey, access })) })
  }
}

async function defaultPost(url: string, body: string): Promise<void> {
  const response = await fetch(url, { method: 'POST', body, headers: { Title: 'Antumi', Tags: 'antumi' }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

// This machine's private IPv4 addresses, Wi-Fi and Ethernet before the rest, then Tailscale's DNS
// name for it, which keeps working when the addresses change.
export async function localAddresses(): Promise<string[]> {
  const found: { address: string; rank: number }[] = []
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== 'IPv4' || !isPrivateAddress(entry.address) || entry.address.startsWith('169.254.')) continue
      const tailscale = entry.address.startsWith('100.')
      found.push({ address: entry.address, rank: tailscale ? 2 : /^(en|eth|wl|wi)/i.test(name) ? 0 : 1 })
    }
  }
  const addresses = found.sort((a, b) => a.rank - b.rank).map((each) => each.address)
  const name = await tailscaleName()
  return [...new Set(name ? [...addresses, name] : addresses)]
}

function tailscaleName(): Promise<string | null> {
  const candidates = process.platform === 'darwin' ? ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'] : ['tailscale']
  const attempt = (index: number): Promise<string | null> => {
    const command = candidates[index]
    if (!command) return Promise.resolve(null)
    return new Promise((resolve) => {
      execFile(command, ['status', '--json'], { timeout: 2_000, windowsHide: true }, (error, stdout) => {
        if (error) {
          resolve(attempt(index + 1))
          return
        }
        try {
          const status: unknown = JSON.parse(stdout)
          const self = typeof status === 'object' && status !== null && 'Self' in status ? status.Self : null
          const dns = typeof self === 'object' && self !== null && 'DNSName' in self && typeof self.DNSName === 'string' ? self.DNSName.replace(/\.$/, '') : ''
          resolve(dns || null)
        } catch {
          resolve(null)
        }
      })
    })
  }
  return attempt(0)
}
