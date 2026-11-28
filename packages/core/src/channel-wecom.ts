import { createHash, randomUUID } from 'node:crypto'
import { WSClient, type SendMarkdownMsgBody } from '@wecom/aibot-node-sdk'
import { ATTACHMENT_CHUNK_BYTES, MAX_CHANNEL_IMAGES, type ChannelState } from '@antumi/protocol'
import { z } from 'zod'
import { deliveryFailed as failure, type ChannelConnector, type ConnectorEmit, type Delivered } from './channel-connector'
import type { ChannelDelivery, ChannelEventImage, GatewayChannel } from './channel-gateway-ipc'
import { fetchWecomPicture } from './channel-wecom-media'

const MEDIA_MS = 5 * 60_000
const STREAM_MS = 9 * 60_000
const HOUR_MS = 60 * 60_000
const REF = z.string().trim().min(1).max(200)
const text = z.object({ content: z.string() })
const image = z.object({ url: z.string().max(8192), aeskey: z.string().min(1).max(100) })
const callback = z.object({
  headers: z.object({ req_id: z.string().min(1).max(500) }),
  body: z.object({
    aibotid: REF, msgid: REF, chattype: z.enum(['single', 'group']), chatid: REF.optional(),
    from: z.object({ userid: REF }), msgtype: z.string(), text: text.optional(), image: image.optional(),
    mixed: z.object({ msg_item: z.array(z.object({ msgtype: z.string(), text: text.optional(), image: image.optional() })).max(32) }).optional()
  })
})
const ack = z.object({ errcode: z.number() })
const limitErrors = new Set([45009, 45033])
const expiredStream = new Set([846605, 846608])
const silent = () => {}
const sent: Delivered = { ok: true, platformId: null, retryAfterMs: null, error: null }

export function wecomConnector(channel: GatewayChannel, emit: ConnectorEmit, options: { wsUrl?: string; now?: () => number } = {}): ChannelConnector {
  const { botId = '', secret = '' } = channel.credentials
  const tenant = `wecom:${botId}`
  const now = options.now ?? Date.now
  const client = new WSClient({
    botId, secret, wsUrl: options.wsUrl ?? 'wss://openws.work.weixin.qq.com',
    maxReconnectAttempts: -1, maxAuthFailureAttempts: 0,
    wsOptions: { maxPayload: 256 * 1024, handshakeTimeout: 10_000 },
    logger: { debug: silent, info: silent, warn: silent, error: silent }
  })
  let connected = false
  let closed = false
  let terminal = false
  let authTimer: NodeJS.Timeout | undefined
  const stopFetch = new AbortController()
  const pictures = new Map<string, z.infer<typeof image> & { expires: number }>()
  const streams = new Map<string, number>()
  const writes = new Map<string, number[]>()
  const state = (next: ChannelState, error: string | null = null) => emit({
    type: 'state', channelId: channel.id, state: next, error,
    ...(next === 'connected' ? { tenant, botUserId: botId } : {})
  })

  function failed(reason: string) {
    if (closed || terminal) return
    terminal = true
    connected = false
    clearTimeout(authTimer)
    state('failed', reason)
  }

  function prune() {
    const at = now()
    for (const [ref, photo] of pictures) if (photo.expires <= at) pictures.delete(ref)
    for (const [reqId, opened] of streams) if (opened + STREAM_MS <= at) streams.delete(reqId)
    for (const [place, times] of writes) if ((times.at(-1) ?? 0) + HOUR_MS <= at) writes.delete(place)
  }

  const cleanup = setInterval(prune, 60_000)
  cleanup.unref()
  client.on('connected', () => {
    clearTimeout(authTimer)
    authTimer = setTimeout(() => {
      failed('wecom-auth-timeout')
      client.disconnect()
    }, 12_000)
    authTimer.unref()
  })
  client.on('authenticated', () => {
    clearTimeout(authTimer)
    if (closed || terminal) return
    connected = true
    state('connected')
  })
  client.on('event.disconnected_event', () => failed('wecom-connection-replaced'))
  client.on('disconnected', () => {
    clearTimeout(authTimer)
    connected = false
    if (!closed && !terminal) state('connecting')
  })
  client.on('error', (error) => {
    if (/^Authentication failed:/.test(error.message)) failed('wecom-invalid-credentials')
  })
  client.on('message', (frame) => {
    if (!connected || closed) return
    const parsed = callback.safeParse(frame)
    if (!parsed.success) return
    const { body, headers } = parsed.data
    if (body.aibotid !== botId || body.from.userid === botId) return
    const direct = body.chattype === 'single'
    const user = body.from.userid
    const place = direct ? user : body.chatid
    if (!place) return
    prune()
    const receivedAt = now()
    const images: ChannelEventImage[] = []
    const words: string[] = []
    let otherFiles = 0
    const parts = body.msgtype === 'mixed' ? body.mixed?.msg_item ?? [] : [body]
    for (const part of parts) {
      if (part.msgtype === 'text' && part.text) words.push(part.text.content)
      else if (part.msgtype === 'image' && part.image) {
        const ref = randomUUID()
        if (images.length < MAX_CHANNEL_IMAGES) {
          if (pictures.size >= 2000) {
            const oldest = pictures.keys().next().value
            if (oldest !== undefined) pictures.delete(oldest)
          }
          pictures.set(ref, { ...part.image, expires: receivedAt + MEDIA_MS })
        }
        images.push({ ref, name: 'image', mime: null, bytes: null })
      } else otherFiles += 1
    }
    emit({ type: 'event', channelId: channel.id, eventKey: body.msgid, kind: direct ? 'direct' : 'mention',
      tenant, place, thread: null, messageId: body.msgid, user, ignorable: false,
      text: words.join('\n').slice(0, 40_000), images, otherFiles,
      wecom: { reqId: headers.req_id, tenant, receivedAt, user, direct } })
  })

  if (botId && secret) client.connect()
  else failed('wecom-invalid-credentials')

  async function send(place: string, write: () => Promise<unknown>): Promise<Delivered> {
    if (!connected || closed) return failure('retry', 'wecom-offline')
    const at = now()
    const times = (writes.get(place) ?? []).filter((time) => time > at - HOUR_MS)
    const oldest = times[0]
    if (times.length >= 1000 && oldest !== undefined) return failure('retry', 'wecom-rate-limit', oldest + HOUR_MS - at)
    writes.set(place, [...times, at])
    try {
      const result = ack.safeParse(await write())
      return result.success && result.data.errcode === 0 ? sent : failure('unknown', 'wecom-unconfirmed')
    } catch (error) {
      const result = ack.safeParse(error)
      if (!result.success) return failure('unknown', 'wecom-unconfirmed')
      const code = result.data.errcode
      if (limitErrors.has(code)) return failure('retry', 'wecom-rate-limit', 30_000)
      return failure('permanent', expiredStream.has(code) ? 'wecom-stream-expired' : 'wecom-rejected')
    }
  }

  return {
    accepted() { /* WeCom has no separate inbound receipt. */ },
    async deliver(job: ChannelDelivery) {
      const reply = job.wecom
      if (job.op !== 'post' || !reply || reply.tenant !== tenant || !job.text) return failure('permanent', 'wecom-invalid-delivery')
      const message = job.text
      const streamId = createHash('sha256').update(reply.reqId).digest('hex').slice(0, 32)
      const frame = { headers: { req_id: reply.reqId } }
      const stream = (finish: boolean) => send(job.place, () => client.replyStream(frame, streamId, message, finish))
      const markdown: SendMarkdownMsgBody & { chat_type: 1 | 2 } = {
        chat_type: reply.direct ? 1 : 2, msgtype: 'markdown', markdown: { content: message }
      }
      const ordinary = () => send(job.place, () => client.sendMessage(job.place, markdown))
      const age = now() - reply.receivedAt
      if ((reply.direct && job.place !== reply.user) || age < -30_000) return failure('permanent', 'wecom-invalid-delivery')
      if (reply.phase === 'progress') {
        if (age >= STREAM_MS) return failure('permanent', 'wecom-stream-expired')
        const opened = now()
        const result = await stream(false)
        if (result.ok) streams.set(reply.reqId, opened)
        return result
      }
      if (reply.phase === 'notice' || reply.phase === 'denial') {
        if (age >= STREAM_MS) return reply.phase === 'denial' ? failure('permanent', 'wecom-stream-expired') : ordinary()
        const result = await stream(true)
        return result.error === 'wecom-stream-expired' && reply.phase !== 'denial' ? ordinary() : result
      }
      const opened = streams.get(reply.reqId)
      if (reply.phase !== 'final' || opened === undefined || now() - opened >= STREAM_MS) return ordinary()
      const result = await stream(true)
      if (result.ok || result.failure !== 'retry') streams.delete(reply.reqId)
      return result.error === 'wecom-stream-expired' ? ordinary() : result
    },
    async fetch(requestId, refs) {
      await Promise.all(refs.map(async (ref) => {
        const picture = pictures.get(ref)
        pictures.delete(ref)
        try {
          if (!picture || picture.expires <= now()) throw new Error('expired image')
          const bytes = await fetchWecomPicture(picture.url, picture.aeskey, stopFetch.signal)
          for (let offset = 0; offset < bytes.length; offset += ATTACHMENT_CHUNK_BYTES) {
            const end = offset + ATTACHMENT_CHUNK_BYTES
            emit({ type: 'image', requestId, ref, data: bytes.subarray(offset, end).toString('base64'), done: end >= bytes.length, error: null })
          }
        } catch {
          emit({ type: 'image', requestId, ref, data: '', done: true, error: 'wecom-image-unavailable' })
        }
      }))
    },
    stop() {
      closed = true
      connected = false
      clearTimeout(authTimer)
      clearInterval(cleanup)
      stopFetch.abort()
      pictures.clear()
      streams.clear()
      writes.clear()
      client.disconnect()
    }
  }
}
