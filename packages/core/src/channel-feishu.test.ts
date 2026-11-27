import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ChannelConnector } from './channel-connector'
import { feishuConnector, feishuContent, larkConnector } from './channel-feishu'
import { FRAME_CONTROL, FRAME_DATA, decodeFrame, encodeFrame, frameHeader, type FeishuFrame } from './channel-feishu-frame'
import type { ChannelDelivery, ChannelGatewayToCore } from './channel-gateway-ipc'
import { until } from './fake-connection'
import { pngBytes } from './image-fixtures'

// The Feishu connector against a Feishu that is an HTTP and WebSocket server here, speaking the
// long connection's protobuf frames.

type Call = { method: string; path: string; token: string; body: Record<string, unknown>; mcp?: { tat: string; allowed: string } }

const CHANNEL = '22222222-2222-4222-8222-222222222222'
// Past 2^53, so an acknowledgement that went through a number would come back wrong.
const BIG_SEQ = 2n ** 63n + 5n

function fakeFeishu() {
  const calls: Call[] = []
  const frames: FeishuFrame[] = []
  const sockets = new Set<WebSocket>()
  const png = Buffer.from(pngBytes(8, 8))
  const state = { limited: 0, staleOnce: false, tokens: 0, mcpStale: false }
  const read = (request: IncomingMessage) => new Promise<string>((resolve) => {
    let body = ''
    request.on('data', (chunk) => { body += String(chunk) })
    request.on('end', () => resolve(body))
  })
  const http: Server = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace('Bearer ', '')
    const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'content-type': 'application/json', ...headers })
      response.end(JSON.stringify(value))
    }
    void read(request).then((raw) => {
      const path = request.url ?? ''
      const body: Record<string, unknown> = raw ? JSON.parse(raw) : {}
      if (path === '/mcp') {
        const tat = String(request.headers['x-lark-mcp-tat'] ?? '')
        calls.push({ method: request.method ?? '', path, token, body, mcp: { tat, allowed: String(request.headers['x-lark-mcp-allowed-tools'] ?? '') } })
        if (state.mcpStale && tat === 't-1') { state.mcpStale = false; return json({ jsonrpc: '2.0', id: body.id, error: { code: -32003, message: 'token expired' } }, 401) }
        if (body.method === 'tools/list') return json({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'fetch-doc', description: '读', inputSchema: { type: 'object' } }] } })
        return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify({ doc_id: 'doxA', doc_url: 'https://acme.feishu.cn/docx/doxA' }) }] } })
      }
      calls.push({ method: request.method ?? '', path, token, body })
      if (path === '/open-apis/auth/v3/tenant_access_token/internal') {
        if (body.app_secret !== 'good') return json({ code: 10014, msg: 'app secret invalid' })
        state.tokens += 1
        return json({ code: 0, tenant_access_token: `t-${state.tokens}`, expire: 7200 })
      }
      if (path === '/callback/ws/endpoint') return json({ code: 0, data: { URL: `ws://127.0.0.1:${address().port}/ws?device_id=d1&service_id=7`, ClientConfig: { PingInterval: 120 } } })
      if (!token.startsWith('t-')) return json({ code: 99991663, msg: 'invalid token' })
      if (state.staleOnce && token === 't-1') { state.staleOnce = false; return json({ code: 99991663, msg: 'token expired' }) }
      if (path === '/open-apis/bot/v3/info') return json({ code: 0, bot: { app_name: '答疑', open_id: 'ou_bot' } })
      if (path === '/open-apis/tenant/v2/tenant/query') return json({ code: 0, data: { tenant: { name: 'Acme', tenant_key: 'tk1' } } })
      if (path.startsWith('/open-apis/im/v1/messages/om_1/resources/')) {
        if (!path.endsWith('/img_1?type=image')) return json({ code: 234003, msg: 'file not in message' })
        response.writeHead(200, { 'content-type': 'image/png', 'content-length': String(png.byteLength) })
        return response.end(png)
      }
      if (path.startsWith('/open-apis/drive/v1/permissions/')) return json({ code: 0, data: { member: { member_type: 'openid' } } })
      if (path.startsWith('/open-apis/im/v1/messages')) {
        if (state.limited > 0) { state.limited -= 1; return json({ code: 230020, msg: 'frequency limit' }, 400, { 'x-ogw-ratelimit-reset': '2' }) }
        return json({ code: 0, data: { message_id: `om_sent${calls.length}` } })
      }
      return json({ code: 404, msg: 'unknown' })
    })
  })
  const wss = new WebSocketServer({ server: http, path: '/ws' })
  wss.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('message', (raw: Buffer) => frames.push(decodeFrame(new Uint8Array(raw))))
  })
  const address = () => http.address() as AddressInfo
  let sent = 0
  const frame = (payload: Buffer, headers: Record<string, string>): FeishuFrame => {
    sent += 1
    return { seqId: BIG_SEQ + BigInt(sent), logId: 9n, service: 7, method: FRAME_DATA, headers: Object.entries({ type: 'event', trace_id: 'tr', ...headers }).map(([key, value]) => ({ key, value })), payload }
  }
  return {
    calls, frames, state,
    listen: () => new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise<void>((resolve) => { for (const socket of sockets) socket.terminate(); wss.close(); http.close(() => resolve()) }),
    api: () => `http://127.0.0.1:${address().port}`,
    connected: () => sockets.size,
    drop: () => { for (const socket of sockets) socket.terminate() },
    // An event as Feishu sends it, in as many frames as asked; the frames sent, to match acknowledgements.
    send(event: Record<string, unknown>, parts = 1): FeishuFrame[] {
      const payload = Buffer.from(JSON.stringify(event))
      const size = Math.ceil(payload.byteLength / parts)
      const id = `frame-${sent + 1}`
      const out = Array.from({ length: parts }, (_, seq) => frame(payload.subarray(seq * size, (seq + 1) * size), { message_id: id, sum: String(parts), seq: String(seq) }))
      for (const each of out) for (const socket of sockets) socket.send(encodeFrame(each))
      return out
    },
    acks: () => frames.filter((each) => each.method === FRAME_DATA),
    sentMessages: () => calls.filter((call) => call.path.startsWith('/open-apis/im/v1/messages') && !call.path.includes('/resources/'))
  }
}

const received = (message: Record<string, unknown>, sender: Record<string, unknown> = {}) => ({
  schema: '2.0',
  header: { event_id: 'ev1', event_type: 'im.message.receive_v1', tenant_key: 'tk1', app_id: 'cli_1' },
  event: {
    sender: { sender_id: { open_id: 'ou_1' }, sender_type: 'user', tenant_key: 'tk1', ...sender },
    message: { message_id: 'om_1', chat_id: 'oc_1', chat_type: 'group', message_type: 'text', content: JSON.stringify({ text: '@_user_1 where is login?' }), mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' }, name: '答疑' }], ...message }
  }
})

const delivery = (fields: Partial<ChannelDelivery>): ChannelDelivery =>
  ({ outboxId: '33333333-3333-4333-8333-333333333333', channelId: CHANNEL, op: 'post', place: 'oc_1', thread: null, target: null, text: 'hi', emoji: null, ...fields })

describe('the Feishu connector', () => {
  let feishu: ReturnType<typeof fakeFeishu>
  let emitted: ChannelGatewayToCore[]
  let connector: ChannelConnector
  const open = (appSecret = 'good') => { connector = feishuConnector({ id: CHANNEL, platform: 'feishu', credentials: { appId: 'cli_1', appSecret } }, (message) => emitted.push(message), { api: feishu.api(), mcp: `${feishu.api()}/mcp`, retryMs: [30], clickAnswerMs: 300 }) }
  const events = () => emitted.flatMap((message) => (message.type === 'event' ? [message] : []))
  const actions = () => emitted.flatMap((message) => (message.type === 'action' ? [message] : []))
  const answerOf = (frame: { payload?: Uint8Array } | undefined) => {
    const body = JSON.parse(Buffer.from(frame?.payload ?? []).toString())
    return { code: body.code, data: body.data ? JSON.parse(Buffer.from(body.data, 'base64').toString()) : undefined }
  }
  // A click on a card's button as Feishu sends it over the long connection (card.action.trigger, schema 2.0).
  const click = (event: Record<string, unknown> = {}) => ({
    schema: '2.0',
    header: { event_id: 'evc1', event_type: 'card.action.trigger', tenant_key: 'tk1', app_id: 'cli_1' },
    event: {
      operator: { open_id: 'ou_owner', tenant_key: 'tk1' }, token: 'c-update', host: 'im_message',
      action: { tag: 'button', value: { t: 'tok1' }, form_value: { reason: '颜色不对', count: 3 } },
      context: { open_message_id: 'om_card', open_chat_id: 'oc_1' },
      ...event
    }
  })
  const states = () => emitted.flatMap((message) => (message.type === 'state' ? [message] : []))
  const when = (holds: () => boolean, timeoutMs = 3000) => until(() => (holds() ? true : undefined), timeoutMs)

  beforeEach(async () => {
    feishu = fakeFeishu()
    await feishu.listen()
    emitted = []
    open()
    await when(() => feishu.connected() === 1 && states().at(-1)?.state === 'connected')
  })

  afterEach(async () => {
    connector.stop()
    await feishu.close()
  })

  it('connects with the app\'s credentials, learns the company and the bot, and pings', async () => {
    expect(states().at(-1)).toEqual({ type: 'state', channelId: CHANNEL, state: 'connected', error: null, tenant: 'tk1', tenantName: 'Acme', botUserId: 'ou_bot' })
    expect(feishu.calls.map((call) => call.path)).toEqual(['/open-apis/auth/v3/tenant_access_token/internal', '/open-apis/bot/v3/info', '/open-apis/tenant/v2/tenant/query', '/callback/ws/endpoint'])
    expect(feishu.calls[3]?.body).toEqual({ AppID: 'cli_1', AppSecret: 'good' })
    await when(() => feishu.frames.some((frame) => frame.method === FRAME_CONTROL))
    const ping = feishu.frames.find((frame) => frame.method === FRAME_CONTROL)
    expect(ping && { service: ping.service, type: frameHeader(ping, 'type') }).toEqual({ service: 7, type: 'ping' })
  })

  it('hands core a mention and acknowledges its frame only once core has it', async () => {
    const [frame] = feishu.send(received({}))
    await when(() => events().length === 1)
    expect(events()[0]).toEqual({
      type: 'event', channelId: CHANNEL, eventKey: 'om_1', kind: 'mention', tenant: 'tk1', place: 'oc_1', thread: null, messageId: 'om_1',
      user: 'ou_1', ignorable: false, text: 'where is login?', images: [], otherFiles: 0
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(feishu.acks()).toEqual([])
    connector.accepted('om_1')
    await when(() => feishu.acks().length === 1)
    const ack = feishu.acks()[0]
    expect(ack?.seqId).toBe(frame?.seqId)
    expect(ack?.logId).toBe(9n)
    expect(ack && frameHeader(ack, 'biz_rt')).toBeDefined()
    expect(JSON.parse(Buffer.from(ack?.payload ?? []).toString())).toEqual({ code: 200 })
  })

  it('acknowledges both copies of an event delivered twice before core took it', async () => {
    feishu.send(received({}))
    feishu.send(received({}))
    await when(() => events().length === 2)
    connector.accepted('om_1')
    await when(() => feishu.acks().length === 2)
  })

  it('takes a direct message, a topic and a bot\'s message, and leaves a group message not for it with a plain acknowledgement', async () => {
    feishu.send(received({ message_id: 'om_2', chat_id: 'oc_dm', chat_type: 'p2p', content: JSON.stringify({ text: 'hello  there' }), mentions: [] }))
    feishu.send(received({ message_id: 'om_3', root_id: 'om_root', thread_id: 'omt_1' }))
    feishu.send(received({ message_id: 'om_4', root_id: 'om_quoted' }))
    feishu.send(received({ message_id: 'om_5' }, { sender_type: 'app' }))
    feishu.send(received({ message_id: 'om_6', mentions: [{ key: '@_user_1', id: { open_id: 'ou_other' }, name: 'Bob' }] }))
    feishu.send({ schema: '2.0', header: { event_type: 'im.chat.member.bot.added_v1' }, event: {} })
    await when(() => events().length === 4 && feishu.acks().length === 2)
    expect(events().map(({ eventKey, kind, place, thread, ignorable, text }) => ({ eventKey, kind, place, thread, ignorable, text }))).toEqual([
      { eventKey: 'om_2', kind: 'direct', place: 'oc_dm', thread: null, ignorable: false, text: 'hello there' },
      { eventKey: 'om_3', kind: 'mention', place: 'oc_1', thread: 'om_root', ignorable: false, text: 'where is login?' },
      { eventKey: 'om_4', kind: 'mention', place: 'oc_1', thread: null, ignorable: false, text: 'where is login?' },
      { eventKey: 'om_5', kind: 'mention', place: 'oc_1', thread: null, ignorable: true, text: 'where is login?' }
    ])
  })

  it('puts together an event that came in pieces', async () => {
    feishu.send(received({ content: JSON.stringify({ text: `@_user_1 ${'长'.repeat(3000)}` }) }), 3)
    await when(() => events().length === 1)
    expect(events()[0]?.text).toBe('长'.repeat(3000))
  })

  it('posts Markdown as rich text, under the question in a topic, and once however often it is sent', async () => {
    const posted = [
      await connector.deliver(delivery({ thread: 'om_1', text: '**yes**' })),
      await connector.deliver(delivery({ text: 'top' })),
      await connector.deliver(delivery({ op: 'react', target: 'om_1', text: null, emoji: 'eyes' }))
    ]
    expect(posted.map((each) => each.ok)).toEqual([true, true, true])
    expect(feishu.sentMessages().map(({ path, token, body }) => ({ path, token, body }))).toEqual([
      { path: '/open-apis/im/v1/messages/om_1/reply', token: 't-1', body: { msg_type: 'post', content: JSON.stringify({ zh_cn: { content: [[{ tag: 'md', text: '**yes**' }]] } }), reply_in_thread: true, uuid: '33333333-3333-4333-8333-333333333333' } },
      { path: '/open-apis/im/v1/messages?receive_id_type=chat_id', token: 't-1', body: { receive_id: 'oc_1', msg_type: 'post', content: JSON.stringify({ zh_cn: { content: [[{ tag: 'md', text: 'top' }]] } }), uuid: '33333333-3333-4333-8333-333333333333' } },
      { path: '/open-apis/im/v1/messages/om_1/reactions', token: 't-1', body: { reaction_type: { emoji_type: 'OnIt' } } }
    ])
  })

  it('puts a user core names in a paragraph of its own before the text', async () => {
    expect(await connector.deliver(delivery({ thread: 'om_1', text: '已完成', mention: 'ou_asker' }))).toMatchObject({ ok: true })
    expect(feishu.sentMessages().at(-1)?.body).toMatchObject({ content: JSON.stringify({ zh_cn: { content: [[{ tag: 'at', user_id: 'ou_asker' }], [{ tag: 'md', text: '已完成' }]] } }) })
  })

  it('hands core a click on a card and answers it in the acknowledgement once core has', async () => {
    const [frame] = feishu.send(click())
    await when(() => actions().length === 1)
    expect(actions()[0]).toEqual({ type: 'action', channelId: CHANNEL, eventKey: 'card:evc1', tenant: 'tk1', user: 'ou_owner', place: 'oc_1', messageId: 'om_card', token: 'tok1', form: { reason: '颜色不对' } })
    expect(events()).toEqual([])
    expect(feishu.acks()).toEqual([])
    connector.reply?.('card:evc1', { kind: 'success', text: '已开始执行。' })
    await when(() => feishu.acks().length === 1)
    expect(feishu.acks()[0]?.seqId).toBe(frame?.seqId)
    expect(answerOf(feishu.acks()[0])).toEqual({ code: 200, data: { toast: { type: 'success', content: '已开始执行。' } } })
  })

  it('answers a click for core when core has said nothing in time, and leaves a click with no token alone', async () => {
    feishu.send(click())
    await when(() => feishu.acks().length === 1, 2000)
    expect(answerOf(feishu.acks()[0])).toEqual({ code: 200, data: { toast: { type: 'info', content: '已收到，正在处理。' } } })
    connector.reply?.('card:evc1', { kind: 'success', text: 'late' })
    feishu.send(click({ action: { tag: 'button', value: {} } }))
    await when(() => feishu.acks().length === 2)
    expect(answerOf(feishu.acks()[1])).toEqual({ code: 200, data: undefined })
    expect(actions()).toHaveLength(1)
  })

  it('posts a card under a message or to someone directly, and draws it again where it is', async () => {
    const card = { schema: '2.0', config: { update_multi: true } }
    expect(await connector.deliver(delivery({ op: 'card', thread: 'om_1', text: null, card }))).toMatchObject({ ok: true })
    expect(await connector.deliver(delivery({ op: 'card', place: 'user:ou_owner', recipient: 'ou_owner', text: null, card }))).toMatchObject({ ok: true })
    expect(await connector.deliver(delivery({ op: 'update', target: 'om_card', text: null, card: { ...card, header: {} } }))).toMatchObject({ ok: true })
    expect(feishu.sentMessages().map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'POST', path: '/open-apis/im/v1/messages/om_1/reply', body: { msg_type: 'interactive', content: JSON.stringify(card), reply_in_thread: true, uuid: '33333333-3333-4333-8333-333333333333' } },
      { method: 'POST', path: '/open-apis/im/v1/messages?receive_id_type=open_id', body: { receive_id: 'ou_owner', msg_type: 'interactive', content: JSON.stringify(card), uuid: '33333333-3333-4333-8333-333333333333' } },
      { method: 'PATCH', path: '/open-apis/im/v1/messages/om_card', body: { content: JSON.stringify({ ...card, header: {} }) } }
    ])
  })

  it('calls the hosted MCP as the bot for the tools core names, with a fresh token once when it says so', async () => {
    feishu.state.mcpStale = true
    const answer = await connector.mcp?.({ channelId: CHANNEL, method: 'tools/call', allowed: ['fetch-doc', 'create-doc'], tool: 'create-doc', arguments: { title: '方案' } })
    expect(answer).toEqual({ ok: true, result: { content: [{ type: 'text', text: JSON.stringify({ doc_id: 'doxA', doc_url: 'https://acme.feishu.cn/docx/doxA' }) }] }, error: null })
    const calls = feishu.calls.filter((call) => call.path === '/mcp')
    expect(calls.map((call) => call.mcp)).toEqual([{ tat: 't-1', allowed: 'fetch-doc,create-doc' }, { tat: 't-2', allowed: 'fetch-doc,create-doc' }])
    expect(calls[1]?.body).toMatchObject({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'create-doc', arguments: { title: '方案' } } })
    expect(calls.every((call) => call.token === '')).toBe(true)
    expect(await connector.mcp?.({ channelId: CHANNEL, method: 'tools/list', allowed: ['fetch-doc'], tool: null })).toMatchObject({ ok: true, result: { tools: [{ name: 'fetch-doc' }] } })
  })

  it('lets a user open a document the bot made, as the bot and with no notice', async () => {
    expect(await connector.grant?.({ channelId: CHANNEL, token: 'doxA', docType: 'docx', user: 'ou_1', perm: 'edit' })).toEqual({ ok: true, error: null })
    expect(feishu.calls.at(-1)).toMatchObject({ method: 'POST', path: '/open-apis/drive/v1/permissions/doxA/members?type=docx&need_notification=false', token: 't-1', body: { member_type: 'openid', member_id: 'ou_1', perm: 'edit', type: 'user' } })
  })

  it('waits as long as Feishu says when told to slow down', async () => {
    feishu.state.limited = 1
    expect(await connector.deliver(delivery({}))).toEqual({ ok: false, platformId: null, retryAfterMs: 2000, error: 'ratelimited' })
  })

  it('takes a fresh token once when Feishu says the one it had is stale', async () => {
    feishu.state.staleOnce = true
    expect(await connector.deliver(delivery({}))).toMatchObject({ ok: true })
    expect(feishu.sentMessages().map((call) => call.token)).toEqual(['t-1', 't-2'])
  })

  it('fetches a picture of a question it was handed, and nothing it was not', async () => {
    feishu.send(received({ chat_type: 'p2p', message_type: 'image', content: JSON.stringify({ image_key: 'img_1' }), mentions: [] }))
    await when(() => events().length === 1)
    expect(events()[0]?.images).toEqual([{ ref: 'img_1', name: 'img_1', mime: 'image/png', bytes: 0 }])
    await connector.fetch('44444444-4444-4444-8444-444444444444', ['img_1', 'img_unknown'])
    const images = emitted.flatMap((message) => (message.type === 'image' ? [message] : []))
    expect(images.map(({ ref, done, error }) => ({ ref, done, error }))).toEqual([{ ref: 'img_1', done: true, error: null }, { ref: 'img_unknown', done: true, error: 'file no longer known' }])
    expect(Buffer.from(images[0]?.data ?? '', 'base64').subarray(1, 4).toString()).toBe('PNG')
  })

  it('opens the connection again when it drops', async () => {
    feishu.drop()
    await when(() => feishu.connected() === 0)
    await when(() => feishu.connected() === 1)
    feishu.send(received({}))
    await when(() => events().length === 1)
  })

  it('says wrong credentials are wrong and does not keep trying them', async () => {
    connector.stop()
    emitted = []
    open('bad')
    await when(() => states().at(-1)?.state === 'failed')
    expect(states().at(-1)).toMatchObject({ error: 'App ID / App Secret: app secret invalid' })
    const tries = feishu.calls.length
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(feishu.calls).toHaveLength(tries)
  })
})

describe('the Lark connector', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('takes its token from Lark\'s open platform and no other', async () => {
    const urls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ code: 10003, msg: 'invalid param' }), { headers: { 'content-type': 'application/json' } })
    })
    const states: ChannelGatewayToCore[] = []
    const connector = larkConnector({ id: CHANNEL, platform: 'lark', credentials: { appId: 'cli_1', appSecret: 'bad' } }, (message) => states.push(message))
    await until(() => states.some((message) => message.type === 'state' && message.state === 'failed') || undefined)
    connector.stop()
    expect(urls).toEqual(['https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal'])
  })
})

describe('what a person wrote on Feishu', () => {
  const mentions = [{ key: '@_user_1', id: { open_id: 'ou_bot' }, name: '答疑' }, { key: '@_user_10', id: { open_id: 'ou_9' }, name: 'Bob' }]

  it('reads a text message, mentions by name and the bot\'s own taken out', () => {
    expect(feishuContent('text', JSON.stringify({ text: '@_user_1 ask @_user_10  about it' }), mentions, 'ou_bot')).toEqual({ text: 'ask @Bob about it', images: [], otherFiles: 0 })
  })

  it('reads rich text with its links, code and pictures, sent under a language or not', () => {
    const post = {
      title: '报错',
      content: [
        [{ tag: 'at', user_id: '@_user_1' }, { tag: 'text', text: ' 看下 ' }, { tag: 'a', text: '这个', href: 'https://example.com' }],
        [{ tag: 'img', image_key: 'img_a' }],
        [{ tag: 'code_block', language: 'ts', text: 'const a = 1' }],
        [{ tag: 'media', file_key: 'file_1' }]
      ]
    }
    const read = { text: '报错\n 看下 这个 (https://example.com)\n\n```ts\nconst a = 1\n```', images: ['img_a'], otherFiles: 1 }
    expect(feishuContent('post', JSON.stringify(post), mentions, 'ou_bot')).toEqual(read)
    expect(feishuContent('post', JSON.stringify({ zh_cn: post }), mentions, 'ou_bot')).toEqual(read)
  })

  it('counts what is neither words nor a picture as another file', () => {
    expect(feishuContent('file', JSON.stringify({ file_key: 'f' }), [], null)).toEqual({ text: '', images: [], otherFiles: 1 })
    expect(feishuContent('image', JSON.stringify({ image_key: 'img_b' }), [], null)).toEqual({ text: '', images: ['img_b'], otherFiles: 0 })
  })
})

describe('a long connection frame', () => {
  it('comes back as it went, a uint64 past 2^53 and a negative int32 too', () => {
    const frame: FeishuFrame = { seqId: BIG_SEQ, logId: 2n ** 64n - 1n, service: -3, method: FRAME_DATA, headers: [{ key: 'type', value: 'event' }, { key: '名', value: '值' }], payloadEncoding: '', payloadType: 'json', payload: new Uint8Array([1, 2, 3]), logIdNew: 'x' }
    expect(decodeFrame(encodeFrame(frame))).toEqual(frame)
  })
})
