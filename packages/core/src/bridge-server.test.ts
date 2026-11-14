import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { BridgeLink, type BridgeLinkState } from './bridge-link'
import { bridgePhoneUrl } from './bridge-protocol'
import { BridgeServer, type BridgeRecord } from './bridge-server'
import { until } from './fake-connection'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'
const SECRET = 'a'.repeat(43)

describe('the bridge', () => {
  const stops: (() => unknown)[] = []
  afterEach(async () => {
    for (const stop of stops.splice(0).reverse()) await stop()
  })

  async function bridge(records?: Record<string, BridgeRecord>) {
    const saved: Record<string, BridgeRecord>[] = []
    const server = new BridgeServer({ port: 0, host: '127.0.0.1', records, persist: (next) => saved.push(next) })
    const port = await server.start()
    stops.push(() => server.stop())
    return { address: `127.0.0.1:${port}`, saved }
  }

  // A computer that answers each message its phone sends with the same message.
  function computer(address: string, secret = SECRET) {
    const states: BridgeLinkState[] = []
    const link = new BridgeLink({
      address, id: ID, secret,
      onSocket: (socket) => socket.on('message', (data, binary) => socket.send(data, { binary })),
      onState: (state) => states.push(state)
    })
    link.start()
    stops.push(() => link.stop())
    return states
  }

  function phone(address: string) {
    const socket = new WebSocket(bridgePhoneUrl(address, ID))
    const received: string[] = []
    // Closing one the bridge refused reports that it never opened.
    socket.on('error', () => {})
    socket.on('message', (data, binary) => received.push(`${binary ? 'bin' : 'text'}:${data.toString()}`))
    stops.push(() => socket.close())
    return { socket, received }
  }

  it('carries a phone\'s messages to its computer and back, as text or binary, those sent early included', async () => {
    const { address, saved } = await bridge()
    const states = computer(address)
    await until(() => states.at(-1)?.state === 'connected' || undefined)
    // The computer is known from its first hello on.
    expect(Object.keys(saved.at(-1) ?? {})).toEqual([ID])
    const { socket, received } = phone(address)
    // Sent before the computer has opened its side.
    socket.on('open', () => {
      socket.send('opening')
      socket.send(Buffer.from('handshake'))
    })
    await until(() => received.length === 2 || undefined)
    expect(received).toEqual(['text:opening', 'bin:handshake'])
    socket.send('later')
    await until(() => received.length === 3 || undefined)
    expect(received[2]).toBe('text:later')
  })

  it('turns away another secret for a computer it knows', async () => {
    const { address } = await bridge({ [ID]: { hash: 'nUfKrGHVZfNf3RmR9mMWZ8/rQlXNmMMb0iDA6i8C7bY=', seenAt: Date.now() } })
    const states = computer(address)
    await until(() => states.find((state) => state.state === 'failed') ?? undefined)
    expect(states.find((state) => state.state === 'failed')?.error).toBe('wrong-secret')
  })

  it('refuses a phone before its socket opens while its computer is away', async () => {
    const { address } = await bridge()
    const { socket } = phone(address)
    const status = await new Promise<number>((resolve) => {
      socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
      socket.on('open', () => resolve(101))
    })
    expect(status).toBe(404)
  })
})
