import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import type { ChannelConnector } from './channel-connector'
import type { ChannelDelivery, ChannelGatewayToCore } from './channel-gateway-ipc'
import { channelMessages } from './channel-output'
import { publicMediaAddress } from './channel-wecom-media'
import { wecomConnector } from './channel-wecom'

const id = '72cf9ac7-96d0-4f04-b160-7c9cdd94a380'
const frame = z.object({ cmd: z.string(), headers: z.object({ req_id: z.string() }), body: z.unknown() })
const job: ChannelDelivery = {
  outboxId: '44ecf43f-50b9-4015-b572-1eefa9eeca7a', channelId: id, op: 'post', place: 'room',
  thread: null, target: null, text: '正在处理…', emoji: null
}

describe('WeCom long connection', () => {
  let server: WebSocketServer
  let connector: ChannelConnector
  let socket: WebSocket
  let emitted: ChannelGatewayToCore[]
  let received: Array<z.infer<typeof frame>>
  let auth: number | null
  let nextAck: number | null
  let now: number
  let url: string

  beforeEach(async () => {
    emitted = []
    received = []
    auth = 0
    nextAck = 0
    now = 100_000
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no test socket')
    url = `ws://127.0.0.1:${address.port}`
    server.on('connection', (ws) => {
      socket = ws
      ws.on('message', (raw) => {
        const request = frame.parse(JSON.parse(raw.toString()))
        received.push(request)
        const errcode = request.cmd === 'aibot_subscribe' ? auth : nextAck
        if (request.cmd !== 'aibot_subscribe') nextAck = 0
        if (errcode !== null) ws.send(JSON.stringify({ headers: request.headers, errcode }))
      })
    })
  })

  afterEach(async () => {
    connector?.stop()
    for (const client of server.clients) client.terminate()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  function start() {
    connector = wecomConnector({ id, platform: 'wecom', credentials: { botId: 'bot', secret: 'secret' } }, (entry) => emitted.push(entry), { wsUrl: url, now: () => now })
  }

  const authenticated = () => vi.waitFor(() => expect(emitted).toContainEqual(expect.objectContaining({ state: 'connected', tenant: 'wecom:bot' })))
  const reply = (reqId: string, phase: NonNullable<ChannelDelivery['wecom']>['phase']): ChannelDelivery =>
    ({ ...job, wecom: { reqId, phase, tenant: 'wecom:bot', receivedAt: now, direct: false, user: 'T1' } })

  it('validates the authenticated robot and routes independent message callbacks', async () => {
    auth = null
    start()
    await vi.waitFor(() => expect(received[0]).toMatchObject({ cmd: 'aibot_subscribe', body: { bot_id: 'bot', secret: 'secret' } }))
    expect(emitted).not.toContainEqual(expect.objectContaining({ state: 'connected' }))
    socket.send(JSON.stringify({ headers: received[0]?.headers, errcode: 0 }))
    await authenticated()
    const callback = (aibotid: string, request: string) => ({
      cmd: 'aibot_msg_callback', headers: { req_id: request }, body: {
        aibotid, msgid: request, chattype: 'group', chatid: 'room', from: { userid: 'T1' },
        msgtype: 'mixed', mixed: { msg_item: [{ msgtype: 'text', text: { content: '请看截图' } }, { msgtype: 'image', image: { url: 'https://example.com/image', aeskey: 'key' } }] }
      }
    })
    socket.send(JSON.stringify(callback('other-bot', 'ignored')))
    socket.send(JSON.stringify(callback('bot', 'question')))
    await vi.waitFor(() => expect(emitted.filter((entry) => entry.type === 'event')).toEqual([expect.objectContaining({
      kind: 'mention', place: 'room', user: 'T1', text: '请看截图', wecom: { reqId: 'question', tenant: 'wecom:bot', receivedAt: now, user: 'T1', direct: false },
      images: [expect.objectContaining({ ref: expect.any(String), mime: null })]
    })]))
    expect(JSON.stringify(emitted)).not.toContain('example.com')
  })

  it('finishes the right stream and falls back only after a definite expiry', async () => {
    start()
    await authenticated()
    expect(await connector.deliver(reply('question-a', 'progress'))).toMatchObject({ ok: true })
    expect(await connector.deliver(reply('question-b', 'progress'))).toMatchObject({ ok: true })
    expect(await connector.deliver({ ...reply('question-a', 'final'), text: '回答 A' })).toMatchObject({ ok: true })
    expect(received.slice(1).map((entry) => entry.headers.req_id)).toEqual(['question-a', 'question-b', 'question-a'])
    const stream = z.object({ stream: z.object({ id: z.string(), finish: z.boolean() }) })
    const opening = stream.parse(received[1]?.body).stream
    expect(stream.parse(received[3]?.body).stream).toEqual({ id: opening.id, finish: true })
    nextAck = 846608
    expect(await connector.deliver({ ...reply('question-b', 'final'), text: '回答 B' })).toMatchObject({ ok: true })
    expect(received.at(-1)).toMatchObject({ cmd: 'aibot_send_msg', body: { chatid: 'room', chat_type: 2, markdown: { content: '回答 B' } } })
  })

  it('marks a reply whose receipt is lost as unknown without sending a second copy', async () => {
    start()
    await authenticated()
    await connector.deliver(reply('question-a', 'progress'))
    nextAck = null
    const result = connector.deliver(reply('question-a', 'final'))
    await vi.waitFor(() => expect(received).toHaveLength(3))
    socket.terminate()
    expect(await result).toMatchObject({ ok: false, failure: 'unknown' })
    expect(received).toHaveLength(3)
  })

  it('stops on bad credentials and when another connection takes the bot', async () => {
    auth = 40001
    start()
    await vi.waitFor(() => expect(emitted).toContainEqual(expect.objectContaining({ state: 'failed', error: 'wecom-invalid-credentials' })))
    connector.stop()
    auth = 0
    start()
    await authenticated()
    socket.send(JSON.stringify({ cmd: 'aibot_event_callback', headers: { req_id: 'kicked' }, body: { msgtype: 'event', event: { eventtype: 'disconnected_event' } } }))
    await vi.waitFor(() => expect(emitted).toContainEqual(expect.objectContaining({ state: 'failed', error: 'wecom-connection-replaced' })))
  })
})

it('rejects non-public network addresses for media downloads', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254', '198.18.0.1', '::1', '::ffff:127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::']) {
    expect(publicMediaAddress(ip), ip).toBe(false)
  }
  for (const ip of ['8.8.8.8', '2606:4700:4700::1111']) expect(publicMediaAddress(ip), ip).toBe(true)
})

it('limits WeCom Markdown pieces by bytes and keeps code fences and Unicode intact', () => {
  const output = channelMessages('wecom', '@all ![image](https://example.com)\n\n```ts\n' + '早😀'.repeat(1300) + '\n```', { home: '', roots: [], hide: [] })
  expect(output.messages.length).toBeGreaterThan(1)
  for (const piece of output.messages) {
    expect(Buffer.byteLength(piece)).toBeLessThanOrEqual(4000)
    expect((piece.match(/```/g) ?? []).length % 2).toBe(0)
    expect(Buffer.from(piece).toString()).toBe(piece)
  }
  expect(output.messages[0]).not.toContain('@all')
  expect(output.messages[0]).not.toContain('![')
})
