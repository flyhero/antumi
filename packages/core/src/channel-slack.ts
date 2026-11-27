import { WebSocket } from 'ws'
import { z } from 'zod'
import { ATTACHMENT_CHUNK_BYTES, MAX_ATTACHMENT_BYTES } from '@antumi/protocol'
import type { ChannelConnector, ConnectorEmit, Delivered } from './channel-connector'
import type { ChannelDelivery, ChannelEventImage, GatewayChannel } from './channel-gateway-ipc'

// Slack over Socket Mode: the connection is opened from here, so nothing listens for Slack and
// core stays on loopback. Spoken directly (two Web API calls to open, JSON envelopes over a
// WebSocket, each acknowledged by its id), which keeps the gateway free of a vendor SDK.

export type SlackOptions = {
  // The Web API's base, and the hosts a file may be fetched from: the bot token goes to no other.
  api?: string
  fileHosts?: readonly string[]
  retryMs?: readonly number[]
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const PING_MS = 30_000
const FETCH_TIMEOUT_MS = 30_000
const CALL_TIMEOUT_MS = 15_000
// An event core never accepted is forgotten, and Slack sends it again.
const UNACCEPTED_MS = 30_000
const KNOWN_FILES = 500
// The token is wrong or gone: trying again changes nothing until the user gives another.
const FATAL = new Set(['invalid_auth', 'not_authed', 'account_inactive', 'token_revoked', 'token_expired', 'missing_scope', 'not_allowed_token_type', 'invalid_token'])

const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).loose()
const AuthTest = Reply.extend({ team_id: z.string().optional(), team: z.string().optional(), user_id: z.string().optional() })
const Opened = Reply.extend({ url: z.string().optional() })
const Posted = Reply.extend({ ts: z.string().optional() })

const SlackFile = z.object({ id: z.string(), name: z.string().optional(), mimetype: z.string().optional(), size: z.number().optional(), url_private: z.string().optional() }).loose()
const SlackEvent = z.object({
  type: z.string(),
  subtype: z.string().optional(),
  channel_type: z.string().optional(),
  user: z.string().optional(),
  bot_id: z.string().optional(),
  text: z.string().optional(),
  ts: z.string().optional(),
  thread_ts: z.string().optional(),
  channel: z.string().optional(),
  team: z.string().optional(),
  user_team: z.string().optional(),
  files: z.array(SlackFile).optional()
}).loose()
const Envelope = z.object({
  type: z.string(),
  envelope_id: z.string().optional(),
  payload: z.object({ event_id: z.string().optional(), team_id: z.string().optional(), event: SlackEvent.optional() }).loose().optional()
}).loose()

// What a person typed, out of what Slack sends: its escapes undone, its own links and mentions
// written plainly, and the mention of the bot itself, which only called it, taken out.
export function slackText(text: string, botUserId: string | null): string {
  return text
    .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_all, id: string) => (id === botUserId ? '' : `@${id}`))
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, '#$1')
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, '@$1')
    .replace(/<((?:https?|mailto):[^|>]+)\|([^>]*)>/g, '$2 ($1)')
    .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    .replace(/[ \t]+/g, ' ').trim()
}

export function slackConnector(channel: GatewayChannel, emit: ConnectorEmit, options: SlackOptions = {}): ChannelConnector {
  const api = options.api ?? 'https://slack.com/api'
  const fileHosts = options.fileHosts ?? ['files.slack.com']
  const retryMs = options.retryMs ?? RETRY_MS
  const { appToken = '', botToken = '' } = channel.credentials
  let stopped = false
  let socket: WebSocket | null = null
  let attempts = 0
  let retry: NodeJS.Timeout | null = null
  let ping: NodeJS.Timeout | null = null
  let botUserId: string | null = null
  let team: { id: string; name: string | null } | null = null
  const unaccepted = new Map<string, { envelopeId: string; socket: WebSocket; at: number }>()
  const files = new Map<string, string>()

  const state = (next: 'connecting' | 'connected' | 'failed', error: string | null = null) =>
    emit({ type: 'state', channelId: channel.id, state: next, error, ...(team ? { tenant: team.id, tenantName: team.name, botUserId } : {}) })

  async function call<T extends z.ZodType>(method: string, token: string, body: Record<string, unknown>, shape: T): Promise<{ reply: z.infer<T> | null; retryAfterMs: number | null }> {
    const response = await fetch(`${api}/${method}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
    })
    if (response.status === 429) return { reply: null, retryAfterMs: (Number(response.headers.get('retry-after')) || 1) * 1000 }
    const parsed = shape.safeParse(await response.json().catch(() => null))
    return { reply: parsed.success ? parsed.data : null, retryAfterMs: null }
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
      const who = await call('auth.test', botToken, {}, AuthTest)
      if (who.reply && !who.reply.ok && FATAL.has(who.reply.error ?? '')) return state('failed', `bot token: ${who.reply.error}`)
      if (!who.reply?.ok || !who.reply.team_id || !who.reply.user_id) return again()
      team = { id: who.reply.team_id, name: who.reply.team ?? null }
      botUserId = who.reply.user_id
      const opened = await call('apps.connections.open', appToken, {}, Opened)
      if (opened.reply && !opened.reply.ok && FATAL.has(opened.reply.error ?? '')) return state('failed', `app token: ${opened.reply.error}`)
      if (!opened.reply?.ok || !opened.reply.url) return again()
      if (stopped) return
      listen(new WebSocket(opened.reply.url))
    } catch {
      again()
    }
  }

  function listen(ws: WebSocket): void {
    socket = ws
    let alive = true
    ws.on('pong', () => { alive = true })
    ws.on('open', () => {
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
      let parsed: z.infer<typeof Envelope>
      try { parsed = Envelope.parse(JSON.parse(String(raw))) } catch { return }
      if (parsed.type === 'hello') {
        attempts = 0
        return state('connected')
      }
      // Slack is about to drop this connection: open the next one now.
      if (parsed.type === 'disconnect') return ws.close()
      if (!parsed.envelope_id) return
      const acknowledge = () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ envelope_id: parsed.envelope_id })) }
      const event = parsed.type === 'events_api' ? toEvent(parsed.payload) : null
      // Nothing for core in it (an edit, a join, a command): taken here.
      if (!event) return acknowledge()
      unaccepted.set(event.eventKey, { envelopeId: parsed.envelope_id, socket: ws, at: Date.now() })
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

  function toEvent(payload: z.infer<typeof Envelope>['payload']) {
    const event = payload?.event
    if (!event || !payload.event_id || !event.channel || !event.ts) return null
    const mention = event.type === 'app_mention'
    const direct = event.type === 'message' && event.channel_type === 'im'
    if (!mention && !direct) return null
    // An edit or a deletion is no question; a message with files is one.
    if (event.subtype && event.subtype !== 'file_share') return null
    if (!event.user) return null
    const images: ChannelEventImage[] = []
    let otherFiles = 0
    for (const file of event.files ?? []) {
      if (!file.mimetype?.startsWith('image/') || !file.url_private) {
        otherFiles += 1
        continue
      }
      images.push({ ref: file.id, name: (file.name ?? file.id).slice(0, 300), mime: file.mimetype, bytes: file.size ?? 0 })
      files.set(file.id, file.url_private)
      if (files.size > KNOWN_FILES) files.delete(files.keys().next().value ?? '')
    }
    return {
      channelId: channel.id,
      eventKey: payload.event_id,
      kind: mention ? 'mention' as const : 'direct' as const,
      // Whose workspace the writer is of: in a shared channel, not always the bot's.
      tenant: event.user_team ?? event.team ?? payload.team_id ?? '',
      place: event.channel,
      thread: event.thread_ts && event.thread_ts !== event.ts ? event.thread_ts : null,
      messageId: event.ts,
      user: event.user,
      ignorable: Boolean(event.bot_id) || event.user === botUserId,
      text: slackText(event.text ?? '', botUserId).slice(0, 40_000),
      images,
      otherFiles
    }
  }

  async function picture(ref: string): Promise<Buffer> {
    const address = files.get(ref)
    if (!address) throw new Error('file no longer known')
    const url = new URL(address)
    if (!fileHosts.includes(url.host)) throw new Error('file is not on the platform')
    // Never followed: a redirect is Slack's sign-in page, or somewhere the token must not go.
    const response = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` }, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (response.status !== 200) throw new Error(`http ${response.status}`)
    if (!(response.headers.get('content-type') ?? '').startsWith('image/')) throw new Error('not an image')
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
      if (waiting && waiting.socket.readyState === WebSocket.OPEN) waiting.socket.send(JSON.stringify({ envelope_id: waiting.envelopeId }))
    },
    async deliver(job: ChannelDelivery): Promise<Delivered> {
      if (job.op === 'card' || job.op === 'update') return { ok: false, platformId: null, retryAfterMs: null, error: 'unsupported' }
      try {
        const { reply, retryAfterMs } = job.op === 'react'
          ? await call('reactions.add', botToken, { channel: job.place, timestamp: job.target, name: job.emoji }, Posted)
          : await call('chat.postMessage', botToken, { channel: job.place, text: `${job.mention ? `<@${job.mention}> ` : ''}${job.text ?? ''}`, ...(job.thread ? { thread_ts: job.thread } : {}), mrkdwn: true, unfurl_links: false, unfurl_media: false }, Posted)
        if (retryAfterMs !== null) return { ok: false, platformId: null, retryAfterMs, error: 'ratelimited' }
        if (reply?.ok || reply?.error === 'already_reacted') return { ok: true, platformId: reply.ts ?? null, retryAfterMs: null, error: null }
        return { ok: false, platformId: null, retryAfterMs: null, error: reply?.error ?? 'bad reply' }
      } catch (error) {
        return { ok: false, platformId: null, retryAfterMs: null, error: error instanceof Error ? error.message : 'failed' }
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
