import { WebSocket } from 'ws'
import { z } from 'zod'
import { ATTACHMENT_CHUNK_BYTES, MAX_ATTACHMENT_BYTES } from '@antumi/protocol'
import { deliveryFailed, httpRefused, type ChannelConnector, type ConnectorEmit, type Delivered } from './channel-connector'
import { FRAME_CONTROL, FRAME_DATA, decodeFrame, encodeFrame, frameHeader, type FeishuFrame } from './channel-feishu-frame'
import type { ChannelAction, ChannelDelivery, ChannelEventImage, GatewayChannel, PlatformAnswer, PlatformGrant, PlatformMcpCall } from './channel-gateway-ipc'

// Feishu over its long connection (长连接, for 企业自建应用 only): the connection is opened from
// here, so nothing listens for Feishu and core stays on loopback. Spoken directly, as Slack is: a
// tenant token, an endpoint to ask for the socket's address, protobuf frames on it, each event
// acknowledged by sending its frame back.

export type FeishuOptions = {
  // The open platform's base: the token goes to no other.
  api?: string
  // The hosted MCP the bot's tools are reached through: the tenant token goes to no other.
  mcp?: string
  retryMs?: readonly number[]
  clickAnswerMs?: number
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const PING_MS = 120_000
const FETCH_TIMEOUT_MS = 30_000
const CALL_TIMEOUT_MS = 15_000
// An event core never accepted is forgotten, and Feishu sends it again.
const UNACCEPTED_MS = 30_000
// Feishu waits 3 seconds for a click's answer: what core has not said by then is said for it.
const CLICK_ANSWER_MS = 2_500
// Core gives up on a tool at a minute; the request ends before that, and a reply too large to be an
// answer is not read through.
const MCP_TIMEOUT_MS = 55_000
const MCP_MAX_BYTES = 4 * 1024 * 1024
// The hosted MCP's word for a token it does not take, besides HTTP 401.
const MCP_BAD_TOKEN = new Set([-32003, -32010, -32011])
const McpReply = z.object({ result: z.unknown().optional(), error: z.object({ code: z.number(), message: z.string().optional() }).loose().optional() }).loose()
const KNOWN_FILES = 500
// A token is taken again this long before Feishu says it ends.
const TOKEN_MARGIN_MS = 5 * 60_000
// The tenant token is stale or wrong: one fresh one is tried before giving up on a call.
const STALE_TOKEN = new Set([99991661, 99991663, 99991664, 99991668])
const RATE_LIMITED = new Set([230020, 99991400])
// The endpoint is busy: asked again, where any other refusal (wrong secret, too many connections) is not.
const ENDPOINT_BUSY = new Set([1, 1000040343])
// What core's emoji are called on Feishu, which has no 👀: OnIt reads as the same "looking at it".
const EMOJI: Record<string, string> = { eyes: 'OnIt' }

const Reply = z.object({ code: z.number(), msg: z.string().optional() }).loose()
const TokenReply = Reply.extend({ tenant_access_token: z.string().optional(), expire: z.number().optional() })
const BotReply = Reply.extend({ bot: z.object({ app_name: z.string().optional(), open_id: z.string().optional() }).loose().optional() })
const TenantReply = Reply.extend({ data: z.object({ tenant: z.object({ name: z.string().optional(), tenant_key: z.string().optional() }).loose().optional() }).loose().optional() })
const EndpointReply = Reply.extend({ data: z.object({ URL: z.string().optional(), ClientConfig: z.object({ PingInterval: z.number().optional() }).loose().nullish() }).loose().nullish() })
const Sent = Reply.extend({ data: z.object({ message_id: z.string().optional() }).loose().optional() })
const Pong = z.object({ PingInterval: z.number().optional() }).loose()

// A click on a card's button (card.action.trigger, schema 2.0), as it comes over the long connection.
const Click = z.object({
  header: z.object({ event_type: z.literal('card.action.trigger'), event_id: z.string().min(1), tenant_key: z.string().optional() }).loose(),
  event: z.object({
    operator: z.object({ open_id: z.string().min(1), tenant_key: z.string().optional() }).loose(),
    action: z.object({ value: z.object({ t: z.string().min(1).max(200) }).loose(), form_value: z.record(z.string(), z.unknown()).optional() }).loose(),
    context: z.object({ open_message_id: z.string().min(1), open_chat_id: z.string().min(1) }).loose().optional(),
    open_message_id: z.string().optional(),
    open_chat_id: z.string().optional()
  }).loose()
}).loose()

const Mention = z.object({ key: z.string(), id: z.object({ open_id: z.string().optional() }).loose().optional(), name: z.string().optional() }).loose()
type Mention = z.infer<typeof Mention>
const Received = z.object({
  header: z.object({ event_type: z.string(), tenant_key: z.string().optional() }).loose(),
  event: z.object({
    sender: z.object({ sender_id: z.object({ open_id: z.string().optional() }).loose().optional(), sender_type: z.string().optional(), tenant_key: z.string().optional() }).loose().optional(),
    message: z.object({
      message_id: z.string().min(1),
      root_id: z.string().optional(),
      thread_id: z.string().optional(),
      chat_id: z.string().min(1),
      chat_type: z.string(),
      message_type: z.string(),
      content: z.string(),
      mentions: z.array(Mention).optional()
    }).loose()
  }).loose()
}).loose()

const PostNode = z.object({ tag: z.string(), text: z.string().optional(), href: z.string().optional(), user_id: z.string().optional(), user_name: z.string().optional(), image_key: z.string().optional(), language: z.string().optional() }).loose()
const PostBody = z.object({ title: z.string().optional(), content: z.array(z.array(PostNode)) }).loose()

const parse = (raw: string): unknown => {
  try { return JSON.parse(raw) } catch { return null }
}

// What a person wrote, out of a message as Feishu sends it: a mention written as the name it
// shows, the bot's own mention, which only called it, taken out, and the pictures in it apart.
export function feishuContent(type: string, content: string, mentions: readonly Mention[], botOpenId: string | null): { text: string; images: string[]; otherFiles: number } {
  // Longest first, so @_user_1 is not taken out of @_user_10.
  const keys = [...mentions].sort((a, b) => b.key.length - a.key.length)
  const named = (key: string) => {
    const mention = mentions.find((each) => each.key === key)
    if (!mention) return key
    return mention.id?.open_id && mention.id.open_id === botOpenId ? '' : `@${mention.name ?? key}`
  }
  const unmention = (text: string) => keys.reduce((out, mention) => out.split(mention.key).join(named(mention.key)), text)
  const body = parse(content)
  if (type === 'text') {
    const text = z.object({ text: z.string() }).loose().safeParse(body)
    return { text: unmention(text.success ? text.data.text : '').replace(/[ \t]+/g, ' ').trim(), images: [], otherFiles: 0 }
  }
  if (type === 'image') {
    const image = z.object({ image_key: z.string().min(1) }).loose().safeParse(body)
    return image.success ? { text: '', images: [image.data.image_key], otherFiles: 0 } : { text: '', images: [], otherFiles: 1 }
  }
  if (type !== 'post') return { text: '', images: [], otherFiles: 1 }
  // As sent it is under a language; as received, usually not.
  const wrapped = z.record(z.string(), PostBody).safeParse(body)
  const post = PostBody.safeParse(body).data ?? (wrapped.success ? Object.values(wrapped.data)[0] : undefined)
  if (!post) return { text: '', images: [], otherFiles: 1 }
  const images: string[] = []
  let otherFiles = 0
  const lines = post.content.map((paragraph) => paragraph.map((node) => {
    switch (node.tag) {
      case 'text': case 'md': return unmention(node.text ?? '')
      case 'a': return node.href && node.href !== node.text ? `${node.text ?? ''} (${node.href})` : node.text ?? ''
      case 'at': return node.user_id ? named(node.user_id) : ''
      case 'code_block': return `\n\`\`\`${node.language ?? ''}\n${node.text ?? ''}\n\`\`\`\n`
      case 'hr': return '---'
      case 'img':
        if (node.image_key) images.push(node.image_key)
        return ''
      case 'media':
        otherFiles += 1
        return ''
      default: return ''
    }
  }).join(''))
  const text = [post.title ?? '', ...lines].join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text, images, otherFiles }
}

// Lark, Feishu outside China, speaks the same on its own domain.
export function larkConnector(channel: GatewayChannel, emit: ConnectorEmit): ChannelConnector {
  return feishuConnector(channel, emit, { api: 'https://open.larksuite.com', mcp: 'https://mcp.larksuite.com/mcp' })
}

export function feishuConnector(channel: GatewayChannel, emit: ConnectorEmit, options: FeishuOptions = {}): ChannelConnector {
  const api = options.api ?? 'https://open.feishu.cn'
  const mcpUrl = options.mcp ?? 'https://mcp.feishu.cn/mcp'
  const retryMs = options.retryMs ?? RETRY_MS
  const clickAnswerMs = options.clickAnswerMs ?? CLICK_ANSWER_MS
  const { appId = '', appSecret = '' } = channel.credentials
  // With the app granted every group message: what is said in a topic without a mention goes to
  // core too, which decides whether it is for the bot. Outside topics it is never handed on.
  const followUps = channel.options?.followUps === true
  let stopped = false
  let socket: WebSocket | null = null
  let attempts = 0
  let retry: NodeJS.Timeout | null = null
  let ping: NodeJS.Timeout | null = null
  let pingMs = PING_MS
  let service = 0
  let botOpenId: string | null = null
  let tenant: { id: string; name: string | null } | null = null
  let token: { value: string; until: number } | null = null
  // An event Feishu delivered again before core took the first: each copy is acknowledged.
  const unaccepted = new Map<string, { acknowledge: (() => void)[]; at: number }>()
  // Clicks handed to core and not yet answered: each copy Feishu sent is answered once core is.
  const clicks = new Map<string, { answer: ((body: Record<string, unknown>) => void)[]; timer: NodeJS.Timeout }>()
  const pieces = new Map<string, { parts: (Uint8Array | undefined)[]; at: number }>()
  const files = new Map<string, string>()

  const state = (next: 'connecting' | 'connected' | 'failed', error: string | null = null) =>
    emit({ type: 'state', channelId: channel.id, state: next, error, ...(tenant ? { tenant: tenant.id, tenantName: tenant.name, botUserId: botOpenId } : {}) })

  async function request<T extends z.ZodType>(method: 'GET' | 'POST' | 'PATCH', path: string, body: Record<string, unknown> | null, shape: T, auth: string | null): Promise<{ status: number; reply: z.infer<T> | null; code: number | null; retryAfterMs: number | null }> {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
    })
    const json: unknown = await response.json().catch(() => null)
    const parsed = shape.safeParse(json)
    const code = Reply.safeParse(json).data?.code ?? null
    const limited = response.status === 429 || (code !== null && RATE_LIMITED.has(code))
    return { status: response.status, reply: parsed.success ? parsed.data : null, code, retryAfterMs: limited ? (Number(response.headers.get('x-ogw-ratelimit-reset')) || 1) * 1000 : null }
  }

  // null where Feishu could not be asked; error where it said the app's credentials are wrong.
  async function tenantToken(): Promise<{ value: string } | { error: string } | null> {
    if (token && token.until > Date.now()) return token
    const { reply } = await request('POST', '/open-apis/auth/v3/tenant_access_token/internal', { app_id: appId, app_secret: appSecret }, TokenReply, null)
    if (!reply) return null
    if (reply.code !== 0 || !reply.tenant_access_token) return { error: `App ID / App Secret: ${reply.msg ?? reply.code}` }
    token = { value: reply.tenant_access_token, until: Date.now() + (reply.expire ?? 7200) * 1000 - TOKEN_MARGIN_MS }
    return token
  }

  // A call as the app, with one fresh token where Feishu says the one it had is no longer good.
  async function call<T extends z.ZodType>(method: 'GET' | 'POST' | 'PATCH', path: string, body: Record<string, unknown> | null, shape: T) {
    for (let tries = 0; ; tries += 1) {
      const auth = await tenantToken()
      if (!auth || 'error' in auth) return { status: 0, reply: null, code: null, retryAfterMs: null, error: auth?.error ?? null }
      const answer = await request(method, path, body, shape, auth.value)
      if (answer.code !== null && STALE_TOKEN.has(answer.code) && tries === 0) {
        token = null
        continue
      }
      return { ...answer, error: null }
    }
  }

  function again(): void {
    if (stopped) return
    state('connecting')
    const delay = retryMs[Math.min(attempts, retryMs.length - 1)] ?? 30_000
    attempts += 1
    retry = setTimeout(() => void connect(), delay)
  }

  async function connect(): Promise<void> {
    if (stopped) return
    try {
      const bot = await call('GET', '/open-apis/bot/v3/info', null, BotReply)
      if (bot.error) return state('failed', bot.error)
      if (bot.reply && bot.reply.code !== 0) return state('failed', `bot: ${bot.reply.msg ?? bot.reply.code}`)
      if (!bot.reply?.bot?.open_id) return again()
      botOpenId = bot.reply.bot.open_id
      // Its key is what tells this company's people from another's in a shared chat.
      const company = await call('GET', '/open-apis/tenant/v2/tenant/query', null, TenantReply)
      if (company.reply && company.reply.code !== 0) return state('failed', `tenant: ${company.reply.msg ?? company.reply.code}`)
      const found = company.reply?.data?.tenant
      if (!found?.tenant_key) return again()
      tenant = { id: found.tenant_key, name: found.name ?? bot.reply.bot.app_name ?? null }
      const { reply } = await request('POST', '/callback/ws/endpoint', { AppID: appId, AppSecret: appSecret }, EndpointReply, null)
      if (reply && reply.code !== 0 && !ENDPOINT_BUSY.has(reply.code)) return state('failed', `connection: ${reply.msg ?? reply.code}`)
      const url = reply?.data?.URL
      if (reply?.code !== 0 || !url) return again()
      pingMs = (reply.data?.ClientConfig?.PingInterval ?? PING_MS / 1000) * 1000
      service = Number(new URL(url).searchParams.get('service_id') ?? 0)
      if (stopped) return
      listen(new WebSocket(url))
    } catch {
      again()
    }
  }

  function send(ws: WebSocket, frame: FeishuFrame): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeFrame(frame))
  }

  function listen(ws: WebSocket): void {
    socket = ws
    let alive = true
    const tick = () => {
      // A socket that stopped answering is dead, whatever it says of itself.
      if (!alive) return ws.terminate()
      alive = false
      send(ws, { seqId: 0n, logId: 0n, service, method: FRAME_CONTROL, headers: [{ key: 'type', value: 'ping' }] })
      const stale = Date.now() - UNACCEPTED_MS
      for (const [key, waiting] of unaccepted) if (waiting.at < stale) unaccepted.delete(key)
      for (const [key, waiting] of pieces) if (waiting.at < stale) pieces.delete(key)
      ping = setTimeout(tick, pingMs)
    }
    ws.on('open', () => {
      attempts = 0
      state('connected')
      tick()
    })
    ws.on('message', (raw) => {
      alive = true
      let frame: FeishuFrame
      try { frame = decodeFrame(Array.isArray(raw) ? Buffer.concat(raw) : new Uint8Array(raw)) } catch { return }
      const type = frameHeader(frame, 'type')
      if (frame.method === FRAME_CONTROL) {
        if (type !== 'pong' || !frame.payload) return
        const pong = Pong.safeParse(parse(Buffer.from(frame.payload).toString('utf8')))
        if (pong.success && pong.data.PingInterval) pingMs = pong.data.PingInterval * 1000
        return
      }
      if (frame.method !== FRAME_DATA || type !== 'event') return
      const whole = merge(frame)
      if (!whole) return
      const acknowledge = () => send(ws, { ...frame, headers: [...frame.headers, { key: 'biz_rt', value: '0' }], payload: Buffer.from(JSON.stringify({ code: 200 })) })
      const payload = parse(whole)
      const click = toClick(payload)
      if (click) {
        // The answer rides on the acknowledgement, base64 JSON as the official SDK sends it.
        const answer = (body: Record<string, unknown>) => send(ws, { ...frame, headers: [...frame.headers, { key: 'biz_rt', value: '0' }], payload: Buffer.from(JSON.stringify({ code: 200, data: Buffer.from(JSON.stringify(body)).toString('base64') })) })
        const waiting = clicks.get(click.eventKey)
        if (waiting) return void waiting.answer.push(answer)
        const timer = setTimeout(() => answerClick(click.eventKey, { toast: { type: 'info', content: '已收到，正在处理。' } }), clickAnswerMs)
        clicks.set(click.eventKey, { answer: [answer], timer })
        return emit({ type: 'action', ...click })
      }
      const event = toEvent(payload)
      // Nothing for core in it (another event, a message not for the bot): taken here.
      if (!event) return acknowledge()
      const waiting = unaccepted.get(event.eventKey)
      if (waiting) waiting.acknowledge.push(acknowledge)
      else unaccepted.set(event.eventKey, { acknowledge: [acknowledge], at: Date.now() })
      emit({ type: 'event', ...event })
    })
    ws.on('error', () => {})
    ws.on('close', () => {
      if (ping) clearTimeout(ping)
      ping = null
      if (socket === ws) socket = null
      if (!stopped) again()
    })
  }

  // A large event comes in several frames under one id; null until the last is in.
  function merge(frame: FeishuFrame): string | null {
    const sum = Number(frameHeader(frame, 'sum') ?? 1)
    const seq = Number(frameHeader(frame, 'seq') ?? 0)
    const payload = frame.payload ?? new Uint8Array()
    if (!Number.isInteger(sum) || !Number.isInteger(seq) || sum < 1 || sum > 100 || seq < 0 || seq >= sum) return null
    if (sum === 1) return Buffer.from(payload).toString('utf8')
    const id = frameHeader(frame, 'message_id') ?? ''
    const known = pieces.get(id) ?? { parts: new Array<Uint8Array | undefined>(sum).fill(undefined), at: Date.now() }
    if (known.parts.length !== sum) return null
    known.parts[seq] = payload
    pieces.set(id, known)
    if (known.parts.some((part) => part === undefined)) return null
    pieces.delete(id)
    return Buffer.concat(known.parts.flatMap((part) => (part ? [part] : []))).toString('utf8')
  }

  // One JSON-RPC request to the hosted MCP as the bot, offering only the tools core named; one
  // fresh token where it says the one it had is no longer good.
  async function mcp(call: PlatformMcpCall): Promise<PlatformAnswer> {
    for (let tries = 0; ; tries += 1) {
      const auth = await tenantToken()
      if (!auth || 'error' in auth) return { ok: false, error: auth?.error ?? 'no token' }
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lark-MCP-TAT': auth.value, 'X-Lark-MCP-Allowed-Tools': call.allowed.join(',') },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: call.method, params: call.method === 'tools/call' ? { name: call.tool, arguments: call.arguments ?? {} } : {} }),
        redirect: 'manual',
        signal: AbortSignal.timeout(MCP_TIMEOUT_MS)
      })
      if (Number(response.headers.get('content-length') ?? 0) > MCP_MAX_BYTES) return { ok: false, error: 'too large' }
      const text = await response.text()
      if (Buffer.byteLength(text) > MCP_MAX_BYTES) return { ok: false, error: 'too large' }
      const reply = McpReply.safeParse(parse(text))
      const code = reply.success ? reply.data.error?.code : undefined
      if ((response.status === 401 || (code !== undefined && MCP_BAD_TOKEN.has(code))) && tries === 0) {
        token = null
        continue
      }
      if (!reply.success) return { ok: false, error: `http ${response.status}` }
      if (reply.data.error) return { ok: false, error: `${reply.data.error.code}: ${reply.data.error.message ?? ''}`.slice(0, 2000) }
      return { ok: true, result: reply.data.result, error: null }
    }
  }

  // Lets a user open a document the bot made, as the bot. Feishu sends no notice for an app's grant.
  async function grant(request: PlatformGrant): Promise<PlatformAnswer> {
    const path = `/open-apis/drive/v1/permissions/${encodeURIComponent(request.token)}/members?type=${encodeURIComponent(request.docType)}&need_notification=false`
    const answer = await call('POST', path, { member_type: 'openid', member_id: request.user, perm: request.perm, type: 'user' }, Reply)
    if (answer.reply?.code === 0) return { ok: true, error: null }
    return { ok: false, error: answer.error ?? (answer.reply ? `${answer.reply.code}: ${answer.reply.msg ?? ''}` : answer.status ? `http ${answer.status}` : 'no token') }
  }

  function answerClick(eventKey: string, body: Record<string, unknown>): void {
    const waiting = clicks.get(eventKey)
    if (!waiting) return
    clearTimeout(waiting.timer)
    clicks.delete(eventKey)
    for (const answer of waiting.answer) answer(body)
  }

  function toClick(payload: unknown): ChannelAction | null {
    const parsed = Click.safeParse(payload)
    if (!parsed.success) return null
    const { header, event } = parsed.data
    const messageId = event.context?.open_message_id ?? event.open_message_id
    const place = event.context?.open_chat_id ?? event.open_chat_id
    const tenantKey = event.operator.tenant_key || header.tenant_key
    if (!messageId || !place || !tenantKey) return null
    // Only what was typed into the card's form, as text.
    const form = Object.fromEntries(Object.entries(event.action.form_value ?? {}).flatMap(([key, value]) => (typeof value === 'string' ? [[key.slice(0, 100), value.slice(0, 2000)]] : [])))
    return { channelId: channel.id, eventKey: `card:${header.event_id}`, tenant: tenantKey, user: event.operator.open_id, place, messageId, token: event.action.value.t, form }
  }

  function toEvent(payload: unknown) {
    const parsed = Received.safeParse(payload)
    if (!parsed.success || parsed.data.header.event_type !== 'im.message.receive_v1') return null
    const { header, event: { sender, message } } = parsed.data
    const user = sender?.sender_id?.open_id
    const mentions = message.mentions ?? []
    const direct = message.chat_type === 'p2p'
    const mention = !direct && mentions.some((each) => each.id?.open_id === botOpenId)
    const thread = message.thread_id && message.root_id && message.root_id !== message.message_id ? message.root_id : null
    const followUp = followUps && !direct && !mention && thread !== null && sender?.sender_type === 'user'
    if ((!direct && !mention && !followUp) || !user) return null
    const tenantKey = sender?.tenant_key || header.tenant_key
    if (!tenantKey) return null
    const content = feishuContent(message.message_type, message.content, mentions, botOpenId)
    const images: ChannelEventImage[] = content.images.map((key) => {
      files.set(key, message.message_id)
      if (files.size > KNOWN_FILES) files.delete(files.keys().next().value ?? '')
      // Feishu does not say what kind of picture; the bytes do once fetched, and core reads them.
      return { ref: key, name: key.slice(0, 300), mime: 'image/png', bytes: 0 }
    })
    return {
      channelId: channel.id,
      eventKey: message.message_id,
      kind: direct ? 'direct' as const : mention ? 'mention' as const : 'followUp' as const,
      tenant: tenantKey,
      place: message.chat_id,
      // In a topic, the message it started from, which a reply goes under; a quoted reply is no topic.
      thread,
      messageId: message.message_id,
      user,
      ignorable: sender?.sender_type !== 'user',
      text: content.text.slice(0, 40_000),
      images,
      otherFiles: content.otherFiles
    }
  }

  async function picture(ref: string): Promise<Buffer> {
    const messageId = files.get(ref)
    if (!messageId) throw new Error('file no longer known')
    const auth = await tenantToken()
    if (!auth || 'error' in auth) throw new Error(auth?.error ?? 'no token')
    const url = `${api}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(ref)}?type=image`
    const response = await fetch(url, { headers: { Authorization: `Bearer ${auth.value}` }, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (response.status !== 200) throw new Error(`http ${response.status}`)
    // A refusal comes as JSON with a 200 of its own.
    if ((response.headers.get('content-type') ?? '').includes('json')) throw new Error(`refused: ${(await response.text()).slice(0, 200)}`)
    if (Number(response.headers.get('content-length') ?? 0) > MAX_ATTACHMENT_BYTES) throw new Error('too large')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('too large')
    return bytes
  }

  void connect()

  return {
    accepted(eventKey) {
      const waiting = unaccepted.get(eventKey)
      unaccepted.delete(eventKey)
      for (const acknowledge of waiting?.acknowledge ?? []) acknowledge()
    },
    async deliver(job: ChannelDelivery): Promise<Delivered> {
      try {
        // The outbox row's id: Feishu posts one message per uuid however often it is sent.
        // An md node is a paragraph of its own, so a mention goes in the one before it.
        const card = job.op === 'card' || job.op === 'update'
        const content = card ? JSON.stringify(job.card ?? {}) : JSON.stringify({ zh_cn: { content: [...(job.mention ? [[{ tag: 'at', user_id: job.mention }]] : []), [{ tag: 'md', text: job.text ?? '' }]] } })
        const type = card ? 'interactive' : 'post'
        const answer = job.op === 'react'
          ? await call('POST', `/open-apis/im/v1/messages/${encodeURIComponent(job.target ?? '')}/reactions`, { reaction_type: { emoji_type: EMOJI[job.emoji ?? ''] ?? job.emoji ?? '' } }, Sent)
          : job.op === 'update'
            ? await call('PATCH', `/open-apis/im/v1/messages/${encodeURIComponent(job.target ?? '')}`, { content }, Sent)
            : job.recipient
              ? await call('POST', '/open-apis/im/v1/messages?receive_id_type=open_id', { receive_id: job.recipient, msg_type: type, content, uuid: job.outboxId }, Sent)
              : job.thread
                ? await call('POST', `/open-apis/im/v1/messages/${encodeURIComponent(job.thread)}/reply`, { msg_type: type, content, reply_in_thread: true, uuid: job.outboxId }, Sent)
                : await call('POST', '/open-apis/im/v1/messages?receive_id_type=chat_id', { receive_id: job.place, msg_type: type, content, uuid: job.outboxId }, Sent)
        if (answer.retryAfterMs !== null) return deliveryFailed('retry', 'channel-delivery-rate-limited', answer.retryAfterMs)
        if (answer.reply?.code === 0) return { ok: true, platformId: answer.reply.data?.message_id ?? (job.op === 'update' ? job.target : null), retryAfterMs: null, error: null }
        if (answer.status === 0 && !answer.error) return deliveryFailed('retry', 'channel-delivery-no-token')
        if (answer.error || (answer.status < 500 && answer.status !== 408 && answer.code !== null && answer.code !== 0) || httpRefused(answer.status)) {
          return deliveryFailed('permanent', 'channel-delivery-refused')
        }
        return deliveryFailed('unknown', 'channel-delivery-unconfirmed')
      } catch {
        return deliveryFailed('unknown', 'channel-delivery-unconfirmed')
      }
    },
    async fetch(requestId, refs) {
      for (const ref of refs) {
        try {
          const bytes = await picture(ref)
          for (let offset = 0; offset < bytes.byteLength || offset === 0; offset += ATTACHMENT_CHUNK_BYTES) {
            const end = offset + ATTACHMENT_CHUNK_BYTES
            emit({ type: 'image', requestId, ref, data: bytes.subarray(offset, end).toString('base64'), done: end >= bytes.byteLength, error: null })
          }
        } catch (error) {
          emit({ type: 'image', requestId, ref, data: '', done: true, error: error instanceof Error ? error.message : 'failed' })
        }
      }
    },
    reply(eventKey, toast) {
      answerClick(eventKey, { toast: { type: toast.kind, content: toast.text } })
    },
    mcp: (request) => mcp(request).catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : 'failed' })),
    grant: (request) => grant(request).catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : 'failed' })),
    stop() {
      stopped = true
      if (retry) clearTimeout(retry)
      if (ping) clearTimeout(ping)
      for (const { timer } of clicks.values()) clearTimeout(timer)
      clicks.clear()
      socket?.close()
      socket = null
    }
  }
}
