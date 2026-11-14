import { WebSocket } from 'ws'
import { bridgeControl, bridgePaths, bridgeUrl } from './bridge-protocol'

// The gateway's side of the bridge (docs/MOBILE.md): a control socket kept open to it, and for each
// phone it announces, a socket opened for that phone, handed to the gateway like one a phone opened
// on the port. The phone link runs over it unchanged.

export type BridgeLinkState = { state: 'connecting' | 'connected' | 'failed'; error: string | null }

export type BridgeLinkOptions = {
  address: string
  id: string
  secret: string
  // A phone's socket, open and with the bridge's hello sent; `from` is the phone's address.
  onSocket(socket: WebSocket, from: string): void
  onState(state: BridgeLinkState): void
}

const RETRY_MS = [1_000, 5_000, 15_000, 30_000, 60_000]
const PING_MS = 25_000

export class BridgeLink {
  private control: WebSocket | null = null
  private retry: NodeJS.Timeout | null = null
  private pinger: NodeJS.Timeout | null = null
  private attempts = 0
  private stopped = false

  constructor(private readonly options: BridgeLinkOptions) {}

  start(): void {
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.retry) clearTimeout(this.retry)
    if (this.pinger) clearInterval(this.pinger)
    this.control?.close()
    this.control = null
  }

  private connect(): void {
    const { address, id, secret } = this.options
    this.options.onState({ state: 'connecting', error: null })
    const control = new WebSocket(`${bridgeUrl(address)}${bridgePaths.computer(id)}`, { handshakeTimeout: 10_000 })
    this.control = control
    let alive = true
    let reason: string | null = null
    control.on('open', () => {
      control.send(JSON.stringify({ secret }))
      this.pinger = setInterval(() => {
        // No pong since the last ping: the way to the bridge is gone, though no close said so.
        if (!alive) control.terminate()
        alive = false
        control.ping()
      }, PING_MS)
      this.pinger.unref()
    })
    control.on('pong', () => (alive = true))
    control.on('message', (data) => {
      const message = bridgeControl(data.toString())
      if (!message) return
      if (message.type === 'ready') {
        this.attempts = 0
        this.options.onState({ state: 'connected', error: null })
      } else {
        this.answer(message.stream, message.from)
      }
    })
    control.on('unexpected-response', (_request, response) => {
      reason = `HTTP ${response.statusCode}`
      control.terminate()
    })
    control.on('error', (error) => {
      reason = reason ?? error.message
    })
    control.on('close', (code, why) => {
      if (this.pinger) clearInterval(this.pinger)
      if (this.control !== control || this.stopped) return
      this.control = null
      this.options.onState({ state: 'failed', error: code === 4401 ? 'wrong-secret' : why.toString() || reason || `closed ${code}` })
      const delay = RETRY_MS[Math.min(this.attempts, RETRY_MS.length - 1)]!
      this.attempts += 1
      this.retry = setTimeout(() => this.connect(), delay)
      this.retry.unref()
    })
  }

  private answer(stream: string, from: string): void {
    const { address, id, secret } = this.options
    const socket = new WebSocket(`${bridgeUrl(address)}${bridgePaths.accept(id, stream)}`, { handshakeTimeout: 10_000, maxPayload: 66 * 1024 })
    socket.on('error', () => socket.terminate())
    socket.once('open', () => {
      socket.send(JSON.stringify({ secret }))
      this.options.onSocket(socket, from)
    })
  }
}
