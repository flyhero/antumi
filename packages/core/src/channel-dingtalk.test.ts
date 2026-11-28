import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ChannelConnector } from './channel-connector'
import { dingtalkConnector, dingtalkContent } from './channel-dingtalk'
import type { ChannelDelivery, ChannelGatewayToCore } from './channel-gateway-ipc'
import { until } from './fake-connection'
import { pngBytes } from './image-fixtures'

// The DingTalk connector against a DingTalk that is an HTTP and WebSocket server here, speaking
// Stream mode's JSON frames.

type Call = { path: string; token: string; body: Record<string, unknown> }

const CHANNEL = '55555555-5555-4555-8555-555555555555'
const TOPIC = '/v1.0/im/bot/messages/get'

function fakeDingtalk() {
  const calls: Call[] = []
  const frames: Record<string, unknown>[] = []
  const sockets = new Set<WebSocket>()
  const png = Buffer.from(pngBytes(8, 8))
  const state = { webhookLimited: 0, webhookFails: 0, webhookUnconfirmed: false }
  const read = (request: IncomingMessage) => new Promise<string>((resolve) => {
    let body = ''
    request.on('data', (chunk) => { body += String(chunk) })
    request.on('end', () => resolve(body))
  })
  const http: Server = createServer((request, response) => {
    const json = (value: unknown, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(value))
    }
    void read(request).then((raw) => {
      const path = request.url ?? ''
      if (path === '/files/pic.png') {
        response.writeHead(200, { 'content-type': 'image/png', 'content-length': String(png.byteLength) })
        return response.end(png)
      }
      const body: Record<string, unknown> = raw ? JSON.parse(raw) : {}
      const token = String(request.headers['x-acs-dingtalk-access-token'] ?? '')
      calls.push({ path, token, body })
      if (path === '/v1.0/gateway/connections/open') {
        if (body.clientSecret !== 'good') return json({ code: 'InvalidAuthentication', message: 'clientSecret is invalid' }, 401)
        return json({ endpoint: `ws://127.0.0.1:${address().port}/connect`, ticket: 'tk+1' })
      }
      if (path === '/v1.0/oauth2/accessToken') return json({ accessToken: 'at-1', expireIn: 7200 })
      if (path.startsWith('/robot/send')) {
        if (state.webhookUnconfirmed) return json({ unexpected: true })
        if (state.webhookLimited > 0) { state.webhookLimited -= 1; return json({ errcode: 130101, errmsg: 'send too fast' }) }
        if (state.webhookFails > 0) { state.webhookFails -= 1; return json({ errcode: 300001, errmsg: 'session expired' }) }
        return json({ errcode: 0, errmsg: 'ok' })
      }
      if (token !== 'at-1') return json({ code: 'InvalidAuthentication', message: 'no token' }, 401)
      if (path === '/v1.0/robot/groupMessages/send' || path === '/v1.0/robot/oToMessages/batchSend') return json({ processQueryKey: `pq${calls.length}` })
      if (path === '/v1.0/robot/messageFiles/download') return json(body.downloadCode === 'code-1' ? { downloadUrl: `http://127.0.0.1:${address().port}/files/pic.png` } : { code: 'unknownDownloadCode', message: 'unknown' }, body.downloadCode === 'code-1' ? 200 : 400)
      return json({ code: 'NotFound', message: path }, 404)
    })
  })
  const wss = new WebSocketServer({ server: http, path: '/connect' })
  const tickets: string[] = []
  wss.on('connection', (socket, request) => {
    tickets.push(new URL(request.url ?? '/', 'ws://x').searchParams.get('ticket') ?? '')
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('message', (raw) => frames.push(JSON.parse(String(raw))))
  })
  const address = () => http.address() as AddressInfo
  let sent = 0
  const sendFrame = (frame: unknown) => { for (const socket of sockets) socket.send(JSON.stringify(frame)) }
  return {
    calls, frames, state, tickets,
    listen: () => new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise<void>((resolve) => { for (const socket of sockets) socket.terminate(); wss.close(); http.close(() => resolve()) }),
    api: () => `http://127.0.0.1:${address().port}`,
    host: () => `127.0.0.1:${address().port}`,
    connected: () => sockets.size,
    drop: () => { for (const socket of sockets) socket.terminate() },
    sendFrame,
    // A robot message as DingTalk pushes it; the frame's messageId, to match its acknowledgement.
    send(message: Record<string, unknown>, topic = TOPIC): string {
      sent += 1
      const messageId = `frame-${sent}`
      sendFrame({ specVersion: '1.0', type: 'CALLBACK', headers: { topic, messageId, contentType: 'application/json', time: '1' }, data: JSON.stringify(message) })
      return messageId
    },
    acks: () => frames.filter((frame) => frame.code === 200 && (frame.headers as { messageId?: string } | undefined)?.messageId?.startsWith('frame-'))
  }
}

describe('the DingTalk connector', () => {
  let dingtalk: ReturnType<typeof fakeDingtalk>
  let emitted: ChannelGatewayToCore[]
  let connector: ChannelConnector
  const open = (appSecret = 'good') => {
    connector = dingtalkConnector({ id: CHANNEL, platform: 'dingtalk', credentials: { appId: 'dingapp1', appSecret } }, (message) => emitted.push(message), { api: dingtalk.api(), webhookHosts: [dingtalk.host()], retryMs: [30] })
  }
  const events = () => emitted.flatMap((message) => (message.type === 'event' ? [message] : []))
  const states = () => emitted.flatMap((message) => (message.type === 'state' ? [message] : []))
  const when = (holds: () => boolean, timeoutMs = 3000) => until(() => (holds() ? true : undefined), timeoutMs)
  const webhook = () => `http://${dingtalk.host()}/robot/send?session=s1`
  const message = (fields: Record<string, unknown> = {}) => ({
    conversationId: 'cidGroup==', conversationType: '2', msgId: 'msg1', senderStaffId: 'staff1', senderCorpId: 'corp1', chatbotCorpId: 'corp1',
    isInAtList: true, sessionWebhook: webhook(), sessionWebhookExpiredTime: Date.now() + 60 * 60_000, robotCode: 'dingapp1', msgtype: 'text', text: { content: '  where is login?' },
    ...fields
  })
  const delivery = (fields: Partial<ChannelDelivery>): ChannelDelivery =>
    ({ outboxId: '66666666-6666-4666-8666-666666666666', channelId: CHANNEL, op: 'post', place: 'cidGroup==', thread: 'msg1', target: null, text: 'hi', emoji: null, ...fields })
  const posted = () => dingtalk.calls.filter((call) => call.path.startsWith('/robot/send') || call.path.startsWith('/v1.0/robot/groupMessages') || call.path.startsWith('/v1.0/robot/oToMessages'))

  beforeEach(async () => {
    dingtalk = fakeDingtalk()
    await dingtalk.listen()
    emitted = []
    open()
    await when(() => dingtalk.connected() === 1 && states().at(-1)?.state === 'connected')
  })

  afterEach(async () => {
    connector.stop()
    await dingtalk.close()
  })

  it('opens Stream mode with the app\'s credentials for robot messages only, and answers a ping', async () => {
    expect(dingtalk.calls[0]).toMatchObject({ path: '/v1.0/gateway/connections/open', body: { clientId: 'dingapp1', clientSecret: 'good', subscriptions: [{ type: 'CALLBACK', topic: TOPIC }] } })
    expect(dingtalk.tickets).toEqual(['tk+1'])
    dingtalk.sendFrame({ specVersion: '1.0', type: 'SYSTEM', headers: { topic: 'ping', messageId: 'p1' }, data: '{"opaque":"x"}' })
    await when(() => dingtalk.frames.length === 1)
    expect(dingtalk.frames[0]).toEqual({ code: 200, headers: { topic: 'ping', messageId: 'p1' }, message: 'OK', data: '{"opaque":"x"}' })
  })

  it('hands core a mention, learning the organisation first, and acknowledges it only once core has it', async () => {
    const frame = dingtalk.send(message())
    await when(() => events().length === 1)
    expect(states().at(-1)).toMatchObject({ state: 'connected', tenant: 'corp1' })
    expect(emitted.findIndex((each) => each.type === 'state' && each.tenant === 'corp1')).toBeLessThan(emitted.findIndex((each) => each.type === 'event'))
    expect(events()[0]).toEqual({
      type: 'event', channelId: CHANNEL, eventKey: 'msg1', kind: 'mention', tenant: 'corp1', place: 'cidGroup==', thread: null, messageId: 'msg1',
      user: 'staff1', ignorable: false, text: 'where is login?', images: [], otherFiles: 0
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(dingtalk.acks()).toEqual([])
    connector.accepted('msg1')
    await when(() => dingtalk.acks().length === 1)
    expect(dingtalk.acks()[0]).toEqual({ code: 200, headers: { contentType: 'application/json', messageId: frame }, message: 'OK', data: '{"response":null}' })
  })

  it('takes a one-to-one chat, and leaves a message not for it, from no staff member or of another topic with a plain acknowledgement', async () => {
    dingtalk.send(message({ msgId: 'msg2', conversationId: 'cidDm==', conversationType: '1', senderCorpId: undefined, isInAtList: undefined }))
    dingtalk.send(message({ msgId: 'msg3', isInAtList: false }))
    dingtalk.send(message({ msgId: 'msg4', senderStaffId: undefined }))
    dingtalk.send(message({ msgId: 'msg5' }), '/v1.0/card/instances/callback')
    dingtalk.send(message({ msgId: 'msg6', senderCorpId: undefined }))
    await when(() => events().length === 2 && dingtalk.acks().length === 3)
    expect(events().map(({ eventKey, kind, tenant, place }) => ({ eventKey, kind, tenant, place }))).toEqual([
      { eventKey: 'msg2', kind: 'direct', tenant: 'corp1', place: 'cidDm==' },
      // A group that does not say whose the writer is: an external one, which matches no organisation.
      { eventKey: 'msg6', kind: 'mention', tenant: 'external', place: 'cidGroup==' }
    ])
  })

  it('answers a group through its webhook, mentioning the asker in the first piece only', async () => {
    dingtalk.send(message())
    await when(() => events().length === 1)
    expect(await connector.deliver(delivery({ text: '## 在 auth.ts\n第一段' }))).toMatchObject({ ok: true })
    expect(await connector.deliver(delivery({ text: '第二段' }))).toMatchObject({ ok: true })
    expect(posted().map(({ path, body }) => ({ path, body }))).toEqual([
      { path: '/robot/send?session=s1', body: { msgtype: 'markdown', markdown: { title: '在 auth.ts', text: '## 在 auth.ts\n第一段\n\n@staff1' }, at: { atUserIds: ['staff1'], isAtAll: false } } },
      { path: '/robot/send?session=s1', body: { msgtype: 'markdown', markdown: { title: '第二段', text: '第二段' } } }
    ])
  })

  it('answers through the robot message API once the webhook has run out, or will not take it', async () => {
    dingtalk.send(message({ sessionWebhookExpiredTime: Date.now() - 1 }))
    dingtalk.send(message({ msgId: 'msg2', conversationId: 'cidDm==', conversationType: '1', sessionWebhook: 'https://evil.example/robot/send' }))
    await when(() => events().length === 2)
    expect(await connector.deliver(delivery({ text: 'group' }))).toMatchObject({ ok: true })
    expect(await connector.deliver(delivery({ place: 'cidDm==', thread: null, text: 'direct' }))).toMatchObject({ ok: true })
    dingtalk.send(message({ msgId: 'msg7' }))
    await when(() => events().length === 3)
    dingtalk.state.webhookFails = 1
    expect(await connector.deliver(delivery({ thread: 'msg7', text: 'fallback' }))).toMatchObject({ ok: true })
    expect(posted().map(({ path, token, body }) => ({ path, token, body }))).toEqual([
      { path: '/v1.0/robot/groupMessages/send', token: 'at-1', body: { robotCode: 'dingapp1', openConversationId: 'cidGroup==', msgKey: 'sampleMarkdown', msgParam: JSON.stringify({ title: 'group', text: 'group' }) } },
      { path: '/v1.0/robot/oToMessages/batchSend', token: 'at-1', body: { robotCode: 'dingapp1', userIds: ['staff1'], msgKey: 'sampleMarkdown', msgParam: JSON.stringify({ title: 'direct', text: 'direct' }) } },
      expect.objectContaining({ path: '/robot/send?session=s1' }),
      expect.objectContaining({ path: '/v1.0/robot/groupMessages/send', body: expect.objectContaining({ msgParam: JSON.stringify({ title: 'fallback', text: 'fallback' }) }) })
    ])
    expect(dingtalk.calls.filter((call) => call.path === '/v1.0/oauth2/accessToken')).toEqual([{ path: '/v1.0/oauth2/accessToken', token: '', body: { appKey: 'dingapp1', appSecret: 'good' } }])
  })

  it('mentions whom core names in a group, and reaches a direct chat\'s asker it no longer remembers by that name', async () => {
    dingtalk.send(message())
    await when(() => events().length === 1)
    expect(await connector.deliver(delivery({ text: '已完成', mention: 'staff9' }))).toMatchObject({ ok: true })
    expect(await connector.deliver(delivery({ place: 'cidDm==', thread: null, text: '已开始', mention: 'staff2' }))).toMatchObject({ ok: true })
    expect(await connector.deliver(delivery({ place: 'cidDm==', thread: null, text: '没人' }))).toMatchObject({ ok: false, failure: 'permanent', error: 'channel-delivery-refused' })
    expect(posted().map(({ path, body }) => ({ path, body }))).toEqual([
      { path: '/robot/send?session=s1', body: { msgtype: 'markdown', markdown: { title: '已完成', text: '已完成\n\n@staff9' }, at: { atUserIds: ['staff9'], isAtAll: false } } },
      { path: '/v1.0/robot/oToMessages/batchSend', body: { robotCode: 'dingapp1', userIds: ['staff2'], msgKey: 'sampleMarkdown', msgParam: JSON.stringify({ title: '已开始', text: '已开始' }) } }
    ])
  })

  it('does not fall back to the robot API if the webhook reply is unrecognizable', async () => {
    dingtalk.send(message())
    await when(() => events().length === 1)
    dingtalk.state.webhookUnconfirmed = true
    expect(await connector.deliver(delivery({}))).toMatchObject({ ok: false, failure: 'unknown' })
    expect(dingtalk.calls.some((call) => call.path === '/v1.0/robot/groupMessages/send')).toBe(false)
  })

  it('waits when the webhook says it is posted to too fast', async () => {
    dingtalk.send(message())
    await when(() => events().length === 1)
    dingtalk.state.webhookLimited = 1
    expect(await connector.deliver(delivery({}))).toEqual({ ok: false, platformId: null, retryAfterMs: 3000, error: 'channel-delivery-rate-limited', failure: 'retry' })
  })

  it('fetches a picture of a question it was handed by its download code, and nothing it was not', async () => {
    dingtalk.send(message({ msgtype: 'picture', content: { downloadCode: 'code-1', pictureDownloadCode: 'p' } }))
    await when(() => events().length === 1)
    const [image] = events()[0]?.images ?? []
    expect(image).toMatchObject({ mime: 'image/png', bytes: 0 })
    expect(image?.ref).toMatch(/^pic-[0-9a-f]{24}$/)
    await connector.fetch('77777777-7777-4777-8777-777777777777', [image?.ref ?? '', 'pic-unknown'])
    const images = emitted.flatMap((each) => (each.type === 'image' ? [each] : []))
    expect(images.map(({ done, error }) => ({ done, error }))).toEqual([{ done: true, error: null }, { done: true, error: 'file no longer known' }])
    expect(Buffer.from(images[0]?.data ?? '', 'base64').subarray(1, 4).toString()).toBe('PNG')
    expect(dingtalk.calls.find((call) => call.path === '/v1.0/robot/messageFiles/download')).toEqual({ path: '/v1.0/robot/messageFiles/download', token: 'at-1', body: { downloadCode: 'code-1', robotCode: 'dingapp1' } })
  })

  it('opens the connection again when it drops or DingTalk says it will', async () => {
    dingtalk.drop()
    await when(() => dingtalk.connected() === 0)
    await when(() => dingtalk.connected() === 1)
    dingtalk.sendFrame({ specVersion: '1.0', type: 'SYSTEM', headers: { topic: 'disconnect', messageId: 'd1' }, data: '' })
    await when(() => dingtalk.tickets.length === 3 && dingtalk.connected() === 1)
    dingtalk.send(message())
    await when(() => events().length === 1)
  })

  it('says wrong credentials are wrong and does not keep trying them', async () => {
    connector.stop()
    emitted = []
    open('bad')
    await when(() => states().at(-1)?.state === 'failed')
    expect(states().at(-1)).toMatchObject({ error: 'Client ID / Client Secret: clientSecret is invalid' })
    const tries = dingtalk.calls.length
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(dingtalk.calls).toHaveLength(tries)
  })
})

describe('what a person wrote on DingTalk', () => {
  it('reads text, pictures and rich text, and counts the rest as other files', () => {
    expect(dingtalkContent({ msgtype: 'text', text: { content: '  ask   about it ' } })).toEqual({ text: 'ask about it', images: [], otherFiles: 0 })
    expect(dingtalkContent({ msgtype: 'picture', content: { downloadCode: 'c1' } })).toEqual({ text: '', images: ['c1'], otherFiles: 0 })
    expect(dingtalkContent({ msgtype: 'richText', content: { richText: [{ text: '这个报错\n' }, { type: 'picture', downloadCode: 'c2' }, { text: '怎么回事' }] } })).toEqual({ text: '这个报错\n怎么回事', images: ['c2'], otherFiles: 0 })
    expect(dingtalkContent({ msgtype: 'file', content: { downloadCode: 'c3' } })).toEqual({ text: '', images: [], otherFiles: 1 })
  })
})
