import { createHash } from 'node:crypto'
import { WebSocket } from 'ws'
import { z } from 'zod'
import { ATTACHMENT_CHUNK_BYTES, MAX_ATTACHMENT_BYTES } from '@antumi/protocol'
import { deliveryFailed, httpRefused, type ChannelConnector, type ConnectorEmit, type Delivered } from './channel-connector'
import type { ChannelDelivery, ChannelEventImage, GatewayChannel } from './channel-gateway-ipc'

// DingTalk over Stream mode: the connection is opened from here, so nothing listens for DingTalk
// and core stays on loopback. Spoken directly, as Slack and Feishu are (the frames follow its
// dingtalk-stream SDK): one call for the socket's address, then JSON frames, each robot message
// acknowledged by its messageId. An answer goes back through the chat's sessionWebhook, which can
// mention the asker; once that has run out, through the robot message API.

export type DingtalkOptions = {
  // The open platform's base: the credentials and the token go to no other.
  api?: string
  // Where a sessionWebhook may point; one elsewhere is not posted to.
  webhookHosts?: readonly string[]
  retryMs?: readonly number[]
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const PING_MS = 30_000
const FETCH_TIMEOUT_MS = 30_000
const CALL_TIMEOUT_MS = 15_000
// An event core never accepted is forgotten, and DingTalk sends it again after a minute.
const UNACCEPTED_MS = 30_000
const KNOWN = 500
const TOKEN_MARGIN_MS = 5 * 60_000
// A sessionWebhook this close to running out is not trusted to take a post.
const WEBHOOK_MARGIN_MS = 10_000
const TOPIC = '/v1.0/im/bot/messages/get'
// A robot posting more than twenty a minute to one chat.
const WEBHOOK_LIMITED = new Set([130101])

const Downstream = z.object({
  type: z.string(),
  headers: z.object({ topic: z.string().optional(), messageId: z.string().optional() }).loose(),
  data: z.string().optional()
}).loose()
const Opened = z.object({ endpoint: z.string().optional(), ticket: z.string().optional(), code: z.string().optional(), message: z.string().optional() }).loose()
const TokenReply = z.object({ accessToken: z.string().optional(), expireIn: z.number().optional(), code: z.string().optional(), message: z.string().optional() }).loose()
const WebhookReply = z.object({ errcode: z.number(), errmsg: z.string().optional() }).loose()
const ApiReply = z.object({ processQueryKey: z.string().optional(), code: z.string().optional(), message: z.string().optional() }).loose()
const Download = z.object({ downloadUrl: z.string().optional(), code: z.string().optional(), message: z.string().optional() }).loose()

const RobotMessage = z.object({
  msgId: z.string().min(1),
  conversationId: z.string().min(1),
  // 1: one to one · 2: a group
  conversationType: z.string(),
  senderStaffId: z.string().optional(),
  senderCorpId: z.string().optional(),
  chatbotCorpId: z.string().optional(),
  isInAtList: z.boolean().optional(),
  sessionWebhook: z.string().optional(),
  sessionWebhookExpiredTime: z.number().optional(),
  robotCode: z.string().optional(),
  msgtype: z.string(),
  text: z.object({ content: z.string() }).loose().optional(),
  content: z.unknown().optional()
}).loose()
type RobotMessage = z.infer<typeof RobotMessage>

const Picture = z.object({ downloadCode: z.string().min(1) }).loose()
const RichText = z.object({ richText: z.array(z.object({ text: z.string().optional(), type: z.string().optional(), downloadCode: z.string().optional() }).loose()) }).loose()

// What a person wrote, out of a robot message: its words (the robot's own mention is already out)
// and the download codes of its pictures.
export function dingtalkContent(message: Pick<RobotMessage, 'msgtype' | 'text' | 'content'>): { text: string; images: string[]; otherFiles: number } {
  if (message.msgtype === 'text') return { text: (message.text?.content ?? '').replace(/[ \t]+/g, ' ').trim(), images: [], otherFiles: 0 }
  if (message.msgtype === 'picture') {
    const picture = Picture.safeParse(message.content)
    return picture.success ? { text: '', images: [picture.data.downloadCode], otherFiles: 0 } : { text: '', images: [], otherFiles: 1 }
  }
  if (message.msgtype !== 'richText') return { text: '', images: [], otherFiles: 1 }
  const rich = RichText.safeParse(message.content)
  if (!rich.success) return { text: '', images: [], otherFiles: 1 }
  const images = rich.data.richText.flatMap((part) => (part.type === 'picture' && part.downloadCode ? [part.downloadCode] : []))
  const text = rich.data.richText.map((part) => part.text ?? '').join('').replace(/\n{3,}/g, '\n\n').trim()
  return { text, images, otherFiles: 0 }
}

// Where a question came from, kept to answer it: the chat's webhook while it lasts, and what the
// message API needs once it has not.
type Origin = { group: boolean; staffId: string; robotCode: string | null; webhook: string | null; expiresAt: number }

export function dingtalkConnector(channel: GatewayChannel, emit: ConnectorEmit, options: DingtalkOptions = {}): ChannelConnector {
  const api = options.api ?? 'https://api.dingtalk.com'
  const webhookHosts = options.webhookHosts ?? ['oapi.dingtalk.com', 'api.dingtalk.com']
  const retryMs = options.retryMs ?? RETRY_MS
  const { appId = '', appSecret = '' } = channel.credentials
  let stopped = false
  let socket: WebSocket | null = null
  let attempts = 0
  let retry: NodeJS.Timeout | null = null
  let ping: NodeJS.Timeout | null = null
  // The organisation the robot is in, as its messages first say.
  let tenant: string | null = null
  let token: { value: string; until: number } | null = null
  const unaccepted = new Map<string, { acknowledge: (() => void)[]; at: number }>()
  // By message id (a group's question) and by chat (a one-to-one chat's latest).
  const origins = new Map<string, Origin>()
  const pictures = new Map<string, { downloadCode: string; robotCode: string | null }>()
  // Questions whose asker an answer has mentioned already: only its first piece does.
  const mentioned = new Map<string, true>()

  const state = (next: 'connecting' | 'connected' | 'failed', error: string | null = null) =>
    emit({ type: 'state', channelId: channel.id, state: next, error, ...(tenant ? { tenant, tenantName: null, botUserId: null } : {}) })

  const remember = <T>(map: Map<string, T>, key: string, value: T) => {
    map.delete(key)
    map.set(key, value)
    if (map.size > KNOWN) map.delete(map.keys().next().value ?? '')
  }

  async function post<T extends z.ZodType>(url: string, body: unknown, shape: T, headers: Record<string, string> = {}): Promise<{ status: number; reply: z.infer<T> | null; retryAfterMs: number | null }> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
    })
    const parsed = shape.safeParse(await response.json().catch(() => null))
    return { status: response.status, reply: parsed.success ? parsed.data : null, retryAfterMs: response.status === 429 ? (Number(response.headers.get('retry-after')) || 1) * 1000 : null }
  }

  async function accessToken(): Promise<string> {
    if (token && token.until > Date.now()) return token.value
    const { reply } = await post(`${api}/v1.0/oauth2/accessToken`, { appKey: appId, appSecret }, TokenReply)
    if (!reply?.accessToken) throw new Error(`token: ${reply?.message ?? reply?.code ?? 'no reply'}`)
    token = { value: reply.accessToken, until: Date.now() + (reply.expireIn ?? 7200) * 1000 - TOKEN_MARGIN_MS }
    return token.value
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
      const opened = await post(`${api}/v1.0/gateway/connections/open`, { clientId: appId, clientSecret: appSecret, ua: 'antumi', subscriptions: [{ type: 'CALLBACK', topic: TOPIC }] }, Opened)
      // Refused outright (a wrong id or secret): trying again changes nothing until the user gives another.
      if (opened.status >= 400 && opened.status < 500 && opened.status !== 429) return state('failed', `Client ID / Client Secret: ${opened.reply?.message ?? opened.reply?.code ?? `http ${opened.status}`}`)
      const { endpoint, ticket } = opened.reply ?? {}
      if (!endpoint || !ticket) return again()
      if (stopped) return
      listen(new WebSocket(`${endpoint}?ticket=${encodeURIComponent(ticket)}`))
    } catch {
      again()
    }
  }

  function listen(ws: WebSocket): void {
    socket = ws
    let alive = true
    const send = (frame: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame)) }
    ws.on('pong', () => { alive = true })
    ws.on('open', () => {
      attempts = 0
      state('connected')
      ping = setInterval(() => {
        // A socket that stopped answering is dead, whatever it says of itself.
        if (!alive) return ws.terminate()
        alive = false
        ws.ping()
        const stale = Date.now() - UNACCEPTED_MS
        for (const [key, waiting] of unaccepted) if (waiting.at < stale) unaccepted.delete(key)
      }, PING_MS)
    })
    ws.on('message', (raw) => {
      alive = true
      let frame: z.infer<typeof Downstream>
      try { frame = Downstream.parse(JSON.parse(String(raw))) } catch { return }
      const { topic, messageId } = frame.headers
      if (frame.type === 'SYSTEM') {
        if (topic === 'ping') return send({ code: 200, headers: frame.headers, message: 'OK', data: frame.data })
        // DingTalk is about to drop this connection: open the next one now.
        if (topic === 'disconnect') ws.close()
        return
      }
      if (!messageId) return
      const acknowledge = () => send({ code: 200, headers: { contentType: 'application/json', messageId }, message: 'OK', data: JSON.stringify(frame.type === 'EVENT' ? { status: 'SUCCESS' } : { response: null }) })
      let body: unknown = null
      try { body = JSON.parse(frame.data ?? '') } catch {}
      const event = frame.type === 'CALLBACK' && topic === TOPIC ? toEvent(body) : null
      // Nothing for core in it (another topic, a message not for the robot): taken here.
      if (!event) return acknowledge()
      const waiting = unaccepted.get(event.eventKey)
      if (waiting) waiting.acknowledge.push(acknowledge)
      else unaccepted.set(event.eventKey, { acknowledge: [acknowledge], at: Date.now() })
      emit({ type: 'event', ...event })
    })
    ws.on('error', () => {})
    ws.on('close', () => {
      if (ping) clearInterval(ping)
      ping = null
      if (socket === ws) socket = null
      if (!stopped) again()
    })
  }

  function toEvent(body: unknown) {
    const parsed = RobotMessage.safeParse(body)
    if (!parsed.success) return null
    const message = parsed.data
    const direct = message.conversationType === '1'
    const mention = message.conversationType === '2' && message.isInAtList !== false
    const user = message.senderStaffId
    // Someone of no organisation the robot knows (an external contact) has no staff id.
    if ((!direct && !mention) || !user) return null
    if (message.chatbotCorpId && message.chatbotCorpId !== tenant) {
      tenant = message.chatbotCorpId
      state('connected')
    }
    const origin: Origin = { group: !direct, staffId: user, robotCode: message.robotCode ?? null, webhook: message.sessionWebhook ?? null, expiresAt: message.sessionWebhookExpiredTime ?? 0 }
    remember(origins, message.msgId, origin)
    remember(origins, message.conversationId, origin)
    const content = dingtalkContent(message)
    const images: ChannelEventImage[] = content.images.map((downloadCode) => {
      // A download code runs to hundreds of characters; core gets a short name for it.
      const ref = `pic-${createHash('sha256').update(downloadCode).digest('hex').slice(0, 24)}`
      remember(pictures, ref, { downloadCode, robotCode: message.robotCode ?? null })
      // DingTalk does not say what kind of picture; the bytes do once fetched, and core reads them.
      return { ref, name: ref, mime: 'image/png', bytes: 0 }
    })
    return {
      channelId: channel.id,
      eventKey: message.msgId,
      kind: direct ? 'direct' as const : 'mention' as const,
      // A one-to-one chat with an internal robot is only ever its own organisation's; a group says
      // whose the writer is only when it is internal, so an external group's writer matches nothing.
      tenant: message.senderCorpId || (direct ? message.chatbotCorpId : undefined) || 'external',
      place: message.conversationId,
      // A robot cannot answer in a thread: every answer is a message of its own in the chat.
      thread: null,
      messageId: message.msgId,
      user,
      ignorable: false,
      text: content.text.slice(0, 40_000),
      images,
      otherFiles: content.otherFiles
    }
  }

  // Through the chat's webhook, mentioning the asker in a group: null where it cannot be used.
  async function throughWebhook(job: ChannelDelivery, origin: Origin, title: string, text: string): Promise<Delivered | null> {
    if (!origin.webhook || origin.expiresAt < Date.now() + WEBHOOK_MARGIN_MS) return null
    let host: string
    try { host = new URL(origin.webhook).host } catch { return null }
    if (!webhookHosts.includes(host)) return null
    // In a group: whom core names, or else the asker on an answer's first piece. A direct chat needs none.
    const mention = !origin.group ? null : job.mention ?? (job.thread !== null && !mentioned.has(job.thread) ? origin.staffId : null)
    const body = { msgtype: 'markdown', markdown: { title, text: mention ? `${text}\n\n@${mention}` : text }, ...(mention ? { at: { atUserIds: [mention], isAtAll: false } } : {}) }
    const { status, reply, retryAfterMs } = await post(origin.webhook, body, WebhookReply)
    if (retryAfterMs !== null || (reply && WEBHOOK_LIMITED.has(reply.errcode))) return deliveryFailed('retry', 'channel-delivery-rate-limited', retryAfterMs ?? 3000)
    if (httpRefused(status) || (status < 500 && status !== 408 && reply && reply.errcode !== 0)) return null
    if (reply?.errcode !== 0 || status >= 500 || status === 408) return deliveryFailed('unknown', 'channel-delivery-unconfirmed')
    if (mention && !job.mention && job.thread) remember(mentioned, job.thread, true)
    return { ok: true, platformId: null, retryAfterMs: null, error: null }
  }

  async function throughApi(job: ChannelDelivery, origin: Origin | undefined, title: string, text: string): Promise<Delivered> {
    const group = origin?.group ?? job.thread !== null
    // A direct chat's asker, once the message that said who it was is forgotten, is the one core names.
    const staffId = origin?.staffId ?? job.mention ?? null
    if (!group && !staffId) return deliveryFailed('permanent', 'channel-delivery-refused')
    const robotCode = origin?.robotCode ?? appId
    const msgParam = JSON.stringify({ title, text })
    const body = group
      ? { robotCode, openConversationId: job.place, msgKey: 'sampleMarkdown', msgParam }
      : { robotCode, userIds: [staffId ?? ''], msgKey: 'sampleMarkdown', msgParam }
    const { status, reply, retryAfterMs } = await post(`${api}/v1.0/robot/${group ? 'groupMessages/send' : 'oToMessages/batchSend'}`, body, ApiReply, { 'x-acs-dingtalk-access-token': await accessToken() })
    if (retryAfterMs !== null) return deliveryFailed('retry', 'channel-delivery-rate-limited', retryAfterMs)
    if (status === 200 && reply?.processQueryKey) return { ok: true, platformId: reply.processQueryKey, retryAfterMs: null, error: null }
    if (httpRefused(status) || (status < 500 && status !== 408 && reply?.code)) return deliveryFailed('permanent', 'channel-delivery-refused')
    return deliveryFailed('unknown', 'channel-delivery-unconfirmed')
  }

  async function picture(ref: string): Promise<Buffer> {
    const known = pictures.get(ref)
    if (!known) throw new Error('file no longer known')
    const { reply } = await post(`${api}/v1.0/robot/messageFiles/download`, { downloadCode: known.downloadCode, robotCode: known.robotCode ?? appId }, Download, { 'x-acs-dingtalk-access-token': await accessToken() })
    if (!reply?.downloadUrl) throw new Error(`refused: ${reply?.message ?? reply?.code ?? 'no reply'}`)
    // A signed link of DingTalk's own, which needs no token: none is sent to it.
    const response = await fetch(reply.downloadUrl, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (response.status !== 200) throw new Error(`http ${response.status}`)
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
      if (job.op !== 'post') return deliveryFailed('permanent', 'channel-delivery-refused')
      try {
        const text = job.text ?? ''
        // What a notification shows of it: its first words.
        const title = text.split('\n').map((line) => line.replace(/[#>*_`[\]]/g, '').trim()).find(Boolean)?.slice(0, 40) ?? '回答'
        const origin = (job.thread ? origins.get(job.thread) : undefined) ?? origins.get(job.place)
        return (origin ? await throughWebhook(job, origin, title, text) : null) ?? await throughApi(job, origin, title, text)
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
    stop() {
      stopped = true
      if (retry) clearTimeout(retry)
      if (ping) clearInterval(ping)
      socket?.close()
      socket = null
    }
  }
}
