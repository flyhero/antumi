import type { IncomingMessage } from 'node:http'
import { isIPv4 } from 'node:net'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import {
  MOBILE_PROTOCOL_VERSION,
  MobileHello,
  MobileOpening,
  PROTOCOL_VERSION,
  base64Url,
  mobilePrologue,
  type MobileAccess,
  type MobileControl,
  type MobileHello as Hello
} from '@antumi/protocol'
import { MobileLink, NoiseError, NoiseHandshake, mobileDeviceId, pairingConfirmationCode, type NoiseKeyPair } from '@antumi/protocol/mobile'

// The phone link's listener (docs/MOBILE.md): it owns the port phones reach, runs the Noise
// handshake and pairing, and carries each paired phone's JSON-RPC to core over a loopback
// connection of its own, which core then holds to what that device may do. It decides nothing
// about access itself; core does.

export const MAX_ONLINE_DEVICES = 8
export const MAX_DEVICE_CONNECTIONS = 2
export const MAX_PENDING_REQUESTS = 16
const HANDSHAKE_TIMEOUT_MS = 10_000
const FAILURES_PER_MINUTE = 10
const SEND_HIGH_WATER = 4 * 1024 * 1024

export type GatewayDevice = { id: string; publicKey: string; access: MobileAccess }
export type GatewayPairing = { id: string; psk: string; expiresAt: number }
export type PairingAnswer = { deviceId: string; access: MobileAccess } | { rejected: string }

export type GatewayOptions = {
  port: number
  staticKey: NoiseKeyPair
  // ws://127.0.0.1:<port>/?token=… for core.
  coreUrl: string
  computerName: string
  // A completed pairing handshake, for core to confirm with the user.
  onPairing(pairing: { pairingId: string; publicKey: string; hello: Hello; code: string }): void
  onSeen?(deviceId: string): void
  // Bound for tests; any interface otherwise.
  host?: string
  now?: () => number
}

// Loopback, the private ranges, CGNAT (Tailscale's 100.64/10), link-local and IPv6 ULA. A filter
// on where a socket comes from, not who it is: that is the pairing key's to say.
export function isPrivateAddress(raw: string | undefined): boolean {
  if (!raw) return false
  const address = raw.toLowerCase().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '').replace(/%.*$/, '')
  if (isIPv4(address)) {
    const [a = 0, b = 0] = address.split('.').map(Number)
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
  }
  if (address === '::1') return true
  const first = parseInt(address.split(':')[0] || '0', 16)
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

type Session = {
  socket: WebSocket
  link: MobileLink | null
  deviceId: string | null
  core: WebSocket | null
  pending: Set<number | string>
  close(reason: Extract<MobileControl, { type: 'closing' }>['reason']): void
}

export class Gateway {
  private server: WebSocketServer | null = null
  private devices = new Map<string, GatewayDevice>()
  private pairing: (GatewayPairing & { used: boolean }) | null = null
  private readonly waiting = new Map<string, (answer: PairingAnswer) => void>()
  private readonly sessions = new Set<Session>()
  private readonly failures = new Map<string, number[]>()
  private timer: NodeJS.Timeout | null = null
  private hosts: string[] = []
  private readonly now: () => number

  constructor(private readonly options: GatewayOptions) {
    this.now = options.now ?? Date.now
  }

  async start(): Promise<number> {
    const listen = (host: string) => new Promise<WebSocketServer>((resolve, reject) => {
      const server = new WebSocketServer({ host, port: this.options.port, maxPayload: 66 * 1024 })
      server.once('listening', () => resolve(server))
      server.once('error', reject)
    })
    try {
      this.server = await listen(this.options.host ?? '::')
    } catch (error) {
      // A machine without IPv6 cannot bind ::; IPv4 alone then.
      if (this.options.host || !(error instanceof Error && 'code' in error && error.code === 'EAFNOSUPPORT')) throw error
      this.server = await listen('0.0.0.0')
    }
    this.server.on('connection', (socket, request) => this.accept(socket, request))
    this.timer = setInterval(() => this.sweep(), 5_000)
    this.timer.unref()
    const address = this.server.address()
    return typeof address === 'object' && address !== null ? address.port : this.options.port
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.sessions.forEach((session) => session.close('shutdown'))
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()))
    this.server = null
  }

  setDevices(devices: readonly GatewayDevice[]): void {
    this.devices = new Map(devices.map((device) => [device.publicKey, device]))
    // A device gone from the list, or whose access changed, starts over.
    for (const session of this.sessions) {
      if (!session.deviceId) continue
      const device = [...this.devices.values()].find((each) => each.id === session.deviceId)
      if (!device) session.close('revoked')
    }
  }

  setPairing(pairing: GatewayPairing | null): void {
    this.pairing = pairing ? { ...pairing, used: false } : null
  }

  answerPairing(pairingId: string, answer: PairingAnswer): void {
    this.waiting.get(pairingId)?.(answer)
    this.waiting.delete(pairingId)
  }

  setHosts(hosts: readonly string[]): void {
    this.hosts = [...hosts]
  }

  revoke(deviceId: string): void {
    for (const session of this.sessions) if (session.deviceId === deviceId) session.close('revoked')
  }

  online(): string[] {
    return [...new Set([...this.sessions].flatMap((session) => (session.deviceId && session.core ? [session.deviceId] : [])))]
  }

  private failed(address: string): void {
    const recent = (this.failures.get(address) ?? []).filter((at) => this.now() - at < 60_000)
    recent.push(this.now())
    this.failures.set(address, recent)
  }

  private blocked(address: string): boolean {
    return (this.failures.get(address) ?? []).filter((at) => this.now() - at < 60_000).length >= FAILURES_PER_MINUTE
  }

  private sweep(): void {
    for (const session of this.sessions) if (session.link?.stale()) session.close('error')
    for (const [address, times] of this.failures) {
      if (times.every((at) => this.now() - at >= 60_000)) this.failures.delete(address)
    }
  }

  private accept(socket: WebSocket, request: IncomingMessage): void {
    const address = request.socket.remoteAddress ?? ''
    if (!isPrivateAddress(address) || this.blocked(address)) {
      socket.terminate()
      return
    }
    let closed = false
    const session: Session = {
      socket,
      link: null,
      deviceId: null,
      core: null,
      pending: new Set(),
      close: (reason) => {
        if (closed) return
        closed = true
        if (session.link) {
          try {
            session.link.send(JSON.stringify({ mobile: { type: 'closing', reason } }))
          } catch {
            // Closing anyway.
          }
        }
        session.core?.close()
        socket.close()
      }
    }
    this.sessions.add(session)
    socket.on('close', () => {
      closed = true
      this.sessions.delete(session)
      session.core?.close()
    })
    socket.on('error', () => socket.terminate())
    void this.handshake(session, address).catch(() => {
      this.failed(address)
      session.close('error')
    })
  }

  private async handshake(session: Session, address: string): Promise<void> {
    const { socket } = session
    // The opening is text; everything after it binary.
    type Message = { bytes: Uint8Array; isBinary: boolean }
    const incoming: Message[] = []
    const waiters: ((message: Message | null) => void)[] = []
    const onMessage = (data: RawData, isBinary: boolean) => {
      const message = { bytes: toBytes(data), isBinary }
      const waiter = waiters.shift()
      if (waiter) waiter(message)
      else incoming.push(message)
    }
    socket.on('message', onMessage)
    socket.once('close', () => waiters.splice(0).forEach((waiter) => waiter(null)))
    const deadline = this.now() + HANDSHAKE_TIMEOUT_MS
    const next = (): Promise<Message> => {
      const ready = incoming.shift()
      if (ready) return Promise.resolve(ready)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('handshake timed out')), Math.max(0, deadline - this.now()))
        waiters.push((message) => {
          clearTimeout(timer)
          if (message === null) reject(new Error('closed'))
          else resolve(message)
        })
      })
    }
    const binary = async (): Promise<Uint8Array> => {
      const message = await next()
      if (!message.isBinary) throw new NoiseError('expected a binary message')
      return message.bytes
    }

    const first = await next()
    if (first.isBinary) throw new Error('expected the opening')
    const opening = MobileOpening.parse(JSON.parse(new TextDecoder().decode(first.bytes)))
    if (opening.v !== MOBILE_PROTOCOL_VERSION) throw new Error('unsupported version')
    const pairing = opening.mode === 'pair' ? this.pairing : null
    if (opening.mode === 'pair' && (!pairing || pairing.used || pairing.id !== opening.pairing || pairing.expiresAt <= this.now())) {
      throw new Error('no such pairing')
    }
    const handshake = new NoiseHandshake({
      pattern: pairing ? 'XXpsk3' : 'XX',
      initiator: false,
      prologue: mobilePrologue(opening),
      staticKey: this.options.staticKey,
      ...(pairing ? { psk: base64Url.decode(pairing.psk) } : {})
    })
    handshake.readMessage(await binary())
    socket.send(handshake.writeMessage())
    // A failed psk fails here, which also keeps the code for whoever holds the real one.
    const hello = MobileHello.parse(JSON.parse(new TextDecoder().decode(handshake.readMessage(await binary()))))
    const remote = handshake.remoteStatic
    if (!remote) throw new NoiseError('no remote key')
    const publicKey = base64Url.encode(remote)
    const link = new MobileLink({ send: (data) => socket.send(data), close: () => socket.close() }, handshake.split(), this.now)
    session.link = link
    socket.off('message', onMessage)
    // What came in early belongs to the link now.
    const early = incoming.splice(0).filter((message) => message.isBinary).map((message) => message.bytes)

    let device: { id: string; access: MobileAccess }
    if (pairing) {
      // Taken at once: one code, one phone, whatever the user answers.
      pairing.used = true
      const code = pairingConfirmationCode(handshake.handshakeHash)
      link.send(JSON.stringify({ mobile: { type: 'pairing', state: 'confirming', code } }))
      const answer = await new Promise<PairingAnswer>((resolve) => {
        this.waiting.set(pairing.id, resolve)
        socket.once('close', () => resolve({ rejected: 'closed' }))
        this.options.onPairing({ pairingId: pairing.id, publicKey, hello, code })
      })
      if ('rejected' in answer) {
        link.send(JSON.stringify({ mobile: { type: 'pairing', state: 'rejected', reason: answer.rejected } }))
        socket.close()
        return
      }
      if (answer.deviceId !== mobileDeviceId(remote)) throw new Error('device id mismatch')
      device = { id: answer.deviceId, access: answer.access }
    } else {
      const known = this.devices.get(publicKey)
      if (!known) {
        this.failed(address)
        link.send(JSON.stringify({ mobile: { type: 'closing', reason: 'revoked' } }))
        socket.close()
        return
      }
      device = { id: known.id, access: known.access }
    }

    const others = [...this.sessions].filter((other) => other !== session && other.deviceId === device.id)
    if (others.length >= MAX_DEVICE_CONNECTIONS) others[0]!.close('replaced')
    const onlineDevices = new Set([...this.sessions].flatMap((other) => (other.deviceId && other !== session ? [other.deviceId] : [])))
    if (!onlineDevices.has(device.id) && onlineDevices.size >= MAX_ONLINE_DEVICES) {
      session.close('error')
      return
    }
    session.deviceId = device.id
    await this.bridge(session, link, device, early)
  }

  // One loopback connection to core per phone connection, declared as that device's.
  private async bridge(session: Session, link: MobileLink, device: { id: string; access: MobileAccess }, early: Uint8Array[]): Promise<void> {
    const core = new WebSocket(this.options.coreUrl, { maxPayload: 16 * 1024 * 1024 })
    session.core = core
    await new Promise<void>((resolve, reject) => {
      core.once('open', () => resolve())
      core.once('error', reject)
    })
    const hello = await new Promise<{ serverVersion: string; features: string[]; home?: { path: string; windows: boolean } }>((resolve, reject) => {
      core.once('message', (data) => {
        try {
          const frame = JSON.parse(data.toString())
          if (frame.error) reject(new Error(frame.error.message))
          else resolve(frame.result)
        } catch (error) {
          reject(error)
        }
      })
      core.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'system.hello', params: { protocolVersion: PROTOCOL_VERSION, client: { kind: 'mobile', deviceId: device.id } } }))
    })
    this.options.onSeen?.(device.id)
    link.send(JSON.stringify({
      mobile: {
        type: 'welcome', deviceId: device.id, access: device.access, computer: this.options.computerName,
        serverVersion: hello.serverVersion, features: hello.features ?? [], ...(hello.home ? { home: hello.home } : {}), hosts: this.hosts
      }
    }))

    const toPhone = (text: string) => {
      try {
        const frame = JSON.parse(text)
        if (frame && typeof frame === 'object' && 'id' in frame) session.pending.delete(frame.id)
      } catch {
        // Not JSON-RPC: core never sends that; drop it.
        return
      }
      link.send(text)
      // A phone that reads slowly holds core back rather than the gateway's memory.
      if (session.socket.bufferedAmount > SEND_HIGH_WATER) {
        core.pause()
        const wait = setInterval(() => {
          if (session.socket.readyState !== WebSocket.OPEN || session.socket.bufferedAmount < SEND_HIGH_WATER / 2) {
            clearInterval(wait)
            core.resume()
          }
        }, 50)
      }
    }
    core.on('message', (data) => toPhone(data.toString()))
    core.on('close', () => session.close('shutdown'))
    core.on('error', () => core.terminate())

    const fromPhone = (data: Uint8Array) => {
      let text: string | null
      try {
        text = link.receive(data)
      } catch {
        session.close('error')
        return
      }
      if (text === null) return
      let frame: { id?: unknown; method?: unknown }
      try {
        frame = JSON.parse(text)
      } catch {
        session.close('error')
        return
      }
      const id = frame.id
      if (typeof id === 'number' || typeof id === 'string') {
        if (session.pending.size >= MAX_PENDING_REQUESTS) {
          link.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'too many requests at once', data: { reason: 'mobile-busy' } } }))
          return
        }
        session.pending.add(id)
      }
      core.send(text)
    }
    session.socket.on('message', (data, isBinary) => {
      if (isBinary) fromPhone(toBytes(data))
      else session.close('error')
    })
    early.forEach(fromPhone)
  }
}

function toBytes(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(data)
}

