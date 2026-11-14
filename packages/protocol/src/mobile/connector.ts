import { ChatItem } from '../chat'
import { createRpcClient, type RpcClient } from '../client'
import { MOBILE_PROTOCOL_VERSION, MobileControl, mobilePrologue, type MobileHello, type MobileOpening } from '../mobile'
import { MobileLink, pairingConfirmationCode } from './link'
import { NoiseError, NoiseHandshake, type NoiseKeyPair } from './noise'

// The phone's side of the link: race the addresses the computer gave, run the handshake, pin the
// computer's key, then speak JSON-RPC over the encrypted link like any core client.

export type MobileWelcome = Extract<MobileControl, { type: 'welcome' }>

export type MobileConnection = RpcClient & {
  welcome: MobileWelcome
  url: string
  close(): void
  // Why the link ended: a closing reason from the gateway, or 'lost'.
  closed: Promise<string>
}

export type MobileConnectOptions = {
  urls: readonly string[]
  mode: 'pair' | 'connect'
  staticKey: NoiseKeyPair
  // The computer's public key, from the pairing code; a gateway with another key is not it.
  computerKey: Uint8Array
  pairing?: { id: string; psk: Uint8Array }
  hello: MobileHello
  // Pairing only: the code to show while the user confirms on the computer.
  onPairingCode?: (code: string) => void
  // What a chat item this app cannot read becomes, rather than vanishing from the conversation.
  unsupportedItemText?: string
  connectTimeoutMs?: number
  // How long a pairing waits for the user's answer on the computer.
  confirmTimeoutMs?: number
  WebSocketImpl?: typeof WebSocket
}

export class MobileConnectError extends Error {
  constructor(message: string, readonly reason: 'unreachable' | 'rejected' | 'wrong-computer' | 'protocol' | 'timeout') {
    super(message)
    this.name = 'MobileConnectError'
  }
}

type Incoming = { next(timeoutMs: number): Promise<Uint8Array | string> }

function queue(socket: WebSocket, closed: Promise<void>): Incoming & { push(data: Uint8Array | string): void } {
  const waiting: ((value: Uint8Array | string | Error) => void)[] = []
  const held: (Uint8Array | string)[] = []
  let ended = false
  void closed.then(() => {
    ended = true
    waiting.splice(0).forEach((resolve) => resolve(new MobileConnectError('connection closed', 'unreachable')))
  })
  return {
    push(data) {
      const resolve = waiting.shift()
      if (resolve) resolve(data)
      else held.push(data)
    },
    next(timeoutMs) {
      const ready = held.shift()
      if (ready !== undefined) return Promise.resolve(ready)
      if (ended) return Promise.reject(new MobileConnectError('connection closed', 'unreachable'))
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.splice(waiting.indexOf(settle), 1)
          socket.close()
          reject(new MobileConnectError('no answer in time', 'timeout'))
        }, timeoutMs)
        const settle = (value: Uint8Array | string | Error) => {
          clearTimeout(timer)
          if (value instanceof Error) reject(value)
          else resolve(value)
        }
        waiting.push(settle)
      })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function binary(data: Uint8Array | string): Uint8Array {
  if (typeof data === 'string') throw new MobileConnectError('expected a binary message', 'protocol')
  return data
}

function sameKey(a: Uint8Array | null, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

// An item a newer core describes in a way this app cannot read turns into a notice in its place.
export function withUnsupportedItems(text: string, placeholder: string): string {
  let frame: unknown
  try {
    frame = JSON.parse(text)
  } catch {
    return text
  }
  if (!isRecord(frame)) return text
  const replace = (items: unknown): unknown => Array.isArray(items)
    ? items.map((item) => {
      if (ChatItem.safeParse(item).success || !isRecord(item)) return item
      const { id, stageId, revision, at } = item
      if (typeof id !== 'string' || typeof stageId !== 'string') return item
      return { id, stageId, revision: typeof revision === 'number' ? revision : 0, at: typeof at === 'number' ? at : 0, kind: 'notice', level: 'info', text: placeholder }
    })
    : items
  const { result, params } = frame
  if (isRecord(result) && Array.isArray(result.items) && 'before' in result) {
    return JSON.stringify({ ...frame, result: { ...result, items: replace(result.items) } })
  }
  if (frame.method === 'conversations.chatItems' && isRecord(params)) {
    return JSON.stringify({ ...frame, params: { ...params, items: replace(params.items) } })
  }
  return text
}

// How long an address has to itself before the next one is tried alongside it.
const HEAD_START_MS = 300
const OPEN = 1

type Opened = { url: string; socket: WebSocket }

// The first of the urls whose socket opens. Each has a head start before the next joins in, so a
// near address wins at once while one that never answers holds the others up only briefly.
function firstOpen(urls: readonly string[], options: MobileConnectOptions): Promise<Opened | null> {
  const Impl = options.WebSocketImpl ?? WebSocket
  const timeout = options.connectTimeoutMs ?? 5000
  return new Promise((resolve) => {
    const trying = new Set<WebSocket>()
    const timers = new Set<ReturnType<typeof setTimeout>>()
    let next = 0
    let done = false
    const finish = (winner: Opened | null) => {
      done = true
      timers.forEach(clearTimeout)
      for (const socket of trying) {
        if (socket === winner?.socket) continue
        socket.onopen = socket.onclose = socket.onerror = null
        socket.close()
      }
      resolve(winner)
    }
    const start = () => {
      if (done) return
      const url = urls[next++]
      if (url === undefined) {
        if (trying.size === 0) finish(null)
        return
      }
      const socket = new Impl(url)
      socket.binaryType = 'arraybuffer'
      trying.add(socket)
      const giveUp = setTimeout(() => socket.close(), timeout)
      timers.add(giveUp)
      socket.onopen = () => {
        if (!done) finish({ url, socket })
      }
      socket.onerror = () => socket.close()
      socket.onclose = () => {
        clearTimeout(giveUp)
        trying.delete(socket)
        // One that fails gives its turn to the next at once.
        start()
      }
      timers.add(setTimeout(start, HEAD_START_MS))
    }
    start()
  })
}

async function secure({ url, socket }: Opened, options: MobileConnectOptions): Promise<MobileConnection> {
  let markClosed: () => void = () => {}
  const closed = new Promise<void>((resolve) => (markClosed = resolve))
  const incoming = queue(socket, closed)
  let link: MobileLink | null = null
  let afterWelcome: ((text: string) => void) | null = null
  socket.onclose = () => markClosed()
  socket.onerror = () => socket.close()
  socket.onmessage = (event: MessageEvent) => {
    const data: unknown = event.data
    const message = typeof data === 'string' ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null
    if (message === null) {
      socket.close()
      return
    }
    if (!afterWelcome || !link) {
      incoming.push(message)
      return
    }
    let text: string | null
    try {
      text = link.receive(binary(message))
    } catch {
      // Out of order, forged or too big: the link cannot go on.
      socket.close()
      return
    }
    // A listener's own error is not the link's.
    if (text !== null) {
      try {
        afterWelcome(text)
      } catch (error) {
        console.error('[antumi-mobile] a message handler failed:', error)
      }
    }
  }
  const timeout = options.connectTimeoutMs ?? 5000

  try {
    // Gone again while the others were being closed.
    if (socket.readyState !== OPEN) throw new MobileConnectError(`cannot reach ${url}`, 'unreachable')
    const opening: MobileOpening = { antumi: 'mobile', v: MOBILE_PROTOCOL_VERSION, mode: options.mode, ...(options.pairing ? { pairing: options.pairing.id } : {}) }
    socket.send(JSON.stringify(opening))
    const handshake = new NoiseHandshake({
      pattern: options.mode === 'pair' ? 'XXpsk3' : 'XX',
      initiator: true,
      prologue: mobilePrologue(opening),
      staticKey: options.staticKey,
      ...(options.pairing ? { psk: options.pairing.psk } : {})
    })
    socket.send(new Uint8Array(handshake.writeMessage()))
    handshake.readMessage(binary(await incoming.next(timeout)))
    if (!sameKey(handshake.remoteStatic, options.computerKey)) throw new MobileConnectError('this is not the paired computer', 'wrong-computer')
    socket.send(new Uint8Array(handshake.writeMessage(new TextEncoder().encode(JSON.stringify(options.hello)))))
    const secured = new MobileLink({ send: (data) => socket.send(new Uint8Array(data)), close: () => socket.close() }, handshake.split())
    link = secured
    if (options.mode === 'pair') options.onPairingCode?.(pairingConfirmationCode(handshake.handshakeHash))

    const waitFor = options.mode === 'pair' ? options.confirmTimeoutMs ?? 180_000 : timeout
    let welcome: MobileWelcome | null = null
    while (!welcome) {
      const text = secured.receive(binary(await incoming.next(waitFor)))
      if (text === null) continue
      const control = MobileControl.safeParse(JSON.parse(text).mobile)
      if (!control.success) throw new MobileConnectError('unexpected message before welcome', 'protocol')
      if (control.data.type === 'welcome') welcome = control.data
      else if (control.data.type === 'pairing' && control.data.state === 'rejected') throw new MobileConnectError(control.data.reason, 'rejected')
      else if (control.data.type === 'closing') throw new MobileConnectError(control.data.reason, control.data.reason === 'revoked' ? 'rejected' : 'unreachable')
    }

    const placeholder = options.unsupportedItemText ?? 'Open this on the computer to see it.'
    const client = createRpcClient((frame) => secured.send(frame))
    let reason = 'lost'
    afterWelcome = (text) => {
      const control = (() => {
        try {
          return MobileControl.safeParse(JSON.parse(text).mobile)
        } catch {
          return null
        }
      })()
      if (control?.success) {
        if (control.data.type === 'closing') reason = control.data.reason
        return
      }
      client.receive(withUnsupportedItems(text, placeholder))
    }
    const ended = closed.then(() => {
      client.failAll(new Error('connection closed'))
      return reason
    })
    return { ...client, welcome, url, close: () => socket.close(), closed: ended }
  } catch (error) {
    socket.close()
    if (error instanceof MobileConnectError) throw error
    if (error instanceof NoiseError) throw new MobileConnectError(error.message, 'protocol')
    throw error
  }
}

// The first address that answers as the paired computer, the handshake run on that one alone. A
// refusal or a wrong computer stops at once; an address whose handshake fails gives way to the rest.
export async function connectMobile(options: MobileConnectOptions): Promise<MobileConnection> {
  let left = [...options.urls]
  let last: unknown = new MobileConnectError('no address to try', 'unreachable')
  while (left.length > 0) {
    const opened = await firstOpen(left, options)
    if (!opened) {
      last = new MobileConnectError(`cannot reach ${left.join(', ')}`, 'unreachable')
      break
    }
    left = left.filter((url) => url !== opened.url)
    try {
      return await secure(opened, options)
    } catch (error) {
      last = error
      if (error instanceof MobileConnectError && (error.reason === 'rejected' || error.reason === 'wrong-computer')) throw error
    }
  }
  throw last
}
