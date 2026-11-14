import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { bridgeHelloSecret, isBridgeId, isBridgeStream, type BridgeControl } from './bridge-protocol'

// The bridge, run on the user's own server (bridge-server-main.ts, docs/MOBILE.md). It pairs a
// phone's socket with one its computer opens for it and passes messages across unchanged; it holds
// no key of the phone link and cannot read what passes. A computer proves itself with the secret it
// gave the first time its id was seen.

export type BridgeRecord = { hash: string; seenAt: number }

export type BridgeServerOptions = {
  port: number
  host?: string
  // Computers seen before, by id; `persist` is told when that changes.
  records?: Record<string, BridgeRecord>
  persist?: (records: Record<string, BridgeRecord>) => void
  now?: () => number
  limits?: Partial<typeof LIMITS>
}

const LIMITS = {
  // Each phone link carries one Noise message, at most 64 KiB, per WebSocket message.
  maxPayload: 70 * 1024,
  streamsPerComputer: 8,
  // How long a phone waits for its computer to answer.
  answerMs: 10_000,
  // What a phone may send before its computer answers: its opening and first handshake message.
  heldMessages: 8,
  connectionsPerMinute: 60,
  computers: 10_000,
  // Past this much queued toward a slow side, the faster side is paused.
  highWater: 1024 * 1024
}
const HELLO_MS = 5_000
const PING_MS = 30_000

type Waiting = { id: string; phone: WebSocket; held: { data: RawData; binary: boolean }[]; timer: NodeJS.Timeout }

export class BridgeServer {
  private readonly http: Server
  private readonly sockets: WebSocketServer
  private readonly records: Map<string, BridgeRecord>
  private readonly computers = new Map<string, WebSocket>()
  private readonly waiting = new Map<string, Waiting>()
  private readonly streams = new Map<string, number>()
  private readonly hits = new Map<string, number[]>()
  private readonly limits: typeof LIMITS
  private readonly now: () => number
  private pinger: NodeJS.Timeout | null = null
  // Sockets that answered the last ping; one that did not by the next is gone.
  private readonly alive = new WeakSet<WebSocket>()

  constructor(private readonly options: BridgeServerOptions) {
    this.limits = { ...LIMITS, ...options.limits }
    this.now = options.now ?? Date.now
    this.records = new Map(Object.entries(options.records ?? {}))
    this.sockets = new WebSocketServer({ noServer: true, maxPayload: this.limits.maxPayload })
    this.http = createServer((request, response) => {
      response.writeHead(request.url === '/' ? 200 : 404, { 'content-type': 'text/plain' })
      response.end(request.url === '/' ? 'Antumi bridge\n' : 'Not found\n')
    })
    this.http.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => this.upgrade(request, socket, head))
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http.once('error', reject)
      this.http.listen(this.options.port, this.options.host, () => {
        const address = this.http.address()
        this.pinger = setInterval(() => this.ping(), PING_MS)
        this.pinger.unref()
        resolve(typeof address === 'object' && address ? address.port : this.options.port)
      })
    })
  }

  stop(): Promise<void> {
    if (this.pinger) clearInterval(this.pinger)
    this.sockets.clients.forEach((socket) => socket.terminate())
    return new Promise((resolve) => this.http.close(() => resolve()))
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const from = request.socket.remoteAddress ?? ''
    const refuse = (status: number) => {
      socket.end(`HTTP/1.1 ${status} ${status === 404 ? 'Not Found' : 'Too Many Requests'}\r\nConnection: close\r\n\r\n`)
    }
    if (this.limited(from)) return refuse(429)
    const [version, kind, id, stream] = new URL(request.url ?? '/', 'http://bridge').pathname.split('/').filter(Boolean)
    if (version !== 'v1' || !isBridgeId(id)) return refuse(404)
    const accept = (then: (socket: WebSocket) => void) => this.sockets.handleUpgrade(request, socket, head, (ws) => {
      this.alive.add(ws)
      ws.on('pong', () => this.alive.add(ws))
      then(ws)
    })
    if (kind === 'computer') return accept((ws) => this.computer(ws, id))
    if (kind === 'phone') {
      // Turned away before the socket opens, so a phone trying several addresses moves on at once.
      if (!this.computers.has(id)) return refuse(404)
      if ((this.streams.get(id) ?? 0) >= this.limits.streamsPerComputer) return refuse(429)
      return accept((ws) => this.phone(ws, id, from))
    }
    if (kind === 'accept' && isBridgeStream(stream) && this.waiting.get(stream)?.id === id) {
      return accept((ws) => this.answer(ws, id, stream))
    }
    refuse(404)
  }

  private limited(from: string): boolean {
    const recent = (this.hits.get(from) ?? []).filter((at) => this.now() - at < 60_000)
    recent.push(this.now())
    this.hits.set(from, recent)
    if (this.hits.size > 10_000) {
      for (const [address, times] of this.hits) if (times.every((at) => this.now() - at >= 60_000)) this.hits.delete(address)
    }
    return recent.length > this.limits.connectionsPerMinute
  }

  // The first message on a computer's socket proves it is that computer.
  private hello(ws: WebSocket, id: string, then: () => void): void {
    const timer = setTimeout(() => ws.close(4401, 'no hello'), HELLO_MS)
    ws.once('message', (data) => {
      clearTimeout(timer)
      const secret = bridgeHelloSecret(rawText(data))
      if (!secret) {
        ws.close(4400, 'bad hello')
        return
      }
      const hash = createHash('sha256').update(secret).digest()
      const record = this.records.get(id)
      if (!record) {
        if (this.records.size >= this.limits.computers) {
          ws.close(4429, 'full')
          return
        }
        this.records.set(id, { hash: hash.toString('base64'), seenAt: this.now() })
        this.save()
      } else if (!timingSafeEqual(Buffer.from(record.hash, 'base64'), hash)) {
        ws.close(4401, 'wrong secret')
        return
      } else if (this.now() - record.seenAt > 86_400_000) {
        record.seenAt = this.now()
        this.save()
      }
      then()
    })
  }

  private computer(ws: WebSocket, id: string): void {
    this.hello(ws, id, () => {
      this.computers.get(id)?.close(4000, 'replaced')
      this.computers.set(id, ws)
      ws.send(JSON.stringify({ type: 'ready' } satisfies BridgeControl))
      ws.on('close', () => {
        if (this.computers.get(id) === ws) this.computers.delete(id)
      })
    })
    ws.on('error', () => ws.terminate())
  }

  private phone(ws: WebSocket, id: string, from: string): void {
    const control = this.computers.get(id)
    if (!control) {
      ws.close(4404, 'computer offline')
      return
    }
    // base64url by hand: servers' Node may predate the encoding.
    const stream = randomBytes(12).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    const waiting: Waiting = {
      id,
      phone: ws,
      held: [],
      timer: setTimeout(() => {
        this.waiting.delete(stream)
        ws.close(4408, 'computer did not answer')
      }, this.limits.answerMs)
    }
    this.waiting.set(stream, waiting)
    ws.on('message', (data, binary) => {
      if (!this.waiting.has(stream)) return
      waiting.held.push({ data, binary })
      if (waiting.held.length > this.limits.heldMessages) ws.close(4413, 'too much before the computer answered')
    })
    ws.on('close', () => {
      if (this.waiting.get(stream) !== waiting) return
      clearTimeout(waiting.timer)
      this.waiting.delete(stream)
    })
    ws.on('error', () => ws.terminate())
    control.send(JSON.stringify({ type: 'incoming', stream, from } satisfies BridgeControl))
  }

  private answer(ws: WebSocket, id: string, stream: string): void {
    this.hello(ws, id, () => {
      const waiting = this.waiting.get(stream)
      if (!waiting || waiting.id !== id) {
        ws.close(4404, 'phone gone')
        return
      }
      clearTimeout(waiting.timer)
      this.waiting.delete(stream)
      this.streams.set(id, (this.streams.get(id) ?? 0) + 1)
      const { phone } = waiting
      phone.removeAllListeners('message')
      this.carry(phone, ws)
      this.carry(ws, phone)
      for (const { data, binary } of waiting.held) ws.send(data, { binary })
      let ended = false
      const end = (code: number, reason: Buffer) => {
        if (ended) return
        ended = true
        this.streams.set(id, Math.max(0, (this.streams.get(id) ?? 1) - 1))
        const passed = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000
        phone.close(passed, reason.toString().slice(0, 120))
        ws.close(passed, reason.toString().slice(0, 120))
      }
      phone.on('close', end)
      ws.on('close', end)
    })
    ws.on('error', () => ws.terminate())
  }

  // From one side to the other, pausing the sender while the receiver falls behind.
  private carry(from: WebSocket, to: WebSocket): void {
    from.on('message', (data, binary) => {
      if (to.readyState !== WebSocket.OPEN) return
      to.send(data, { binary })
      if (to.bufferedAmount > this.limits.highWater) {
        from.pause()
        const check = setInterval(() => {
          if (to.readyState !== WebSocket.OPEN || to.bufferedAmount < this.limits.highWater / 4) {
            clearInterval(check)
            from.resume()
          }
        }, 50)
      }
    })
  }

  private ping(): void {
    for (const socket of this.sockets.clients) {
      if (!this.alive.has(socket)) {
        socket.terminate()
        continue
      }
      this.alive.delete(socket)
      if (socket.readyState === WebSocket.OPEN) socket.ping()
    }
  }

  private save(): void {
    this.options.persist?.(Object.fromEntries(this.records))
  }
}

function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString('utf8')
}
