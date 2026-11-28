import { randomBytes } from 'node:crypto'
import { z } from 'zod'

const ORIGIN = 'https://ilinkai.weixin.qq.com'
const COMPATIBILITY_VERSION = '3.0.0'
const MAX_RESPONSE = 8 * 1024 * 1024

export function officialIlinkOrigin(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !/^ilinkai(?:-[a-z0-9-]+)?\.weixin\.qq\.com$/.test(url.hostname)) throw new IlinkError('protocol')
  return url.origin
}

const Identity = z.string().min(1).max(512)
export const IlinkAccount = z.object({ bot: Identity, owner: Identity, token: z.string().min(1).max(4096), origin: z.string().max(256) })
export type IlinkAccount = z.infer<typeof IlinkAccount>

const Message = z.object({
  message_id: z.string().regex(/^\d{1,20}$/).optional(),
  from_user_id: Identity.optional(),
  group_id: z.string().max(512).optional(),
  message_type: z.number().optional(),
  message_state: z.number().optional(),
  create_time_ms: z.number().int().optional(),
  delete_time_ms: z.number().optional(),
  context_token: z.string().min(1).max(16_384).optional(),
  item_list: z.array(z.object({ type: z.number(), text_item: z.object({ text: z.string().max(32_768) }).optional() })).max(64).optional()
})
export type IlinkMessage = z.infer<typeof Message>

const ErrorCode = z.enum(['network', 'protocol', 'auth', 'limited', 'rejected'])
export class IlinkError extends Error {
  constructor(readonly code: z.infer<typeof ErrorCode>) { super(code) }
}

export const IlinkCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('qr') }),
  z.object({ type: z.literal('scan'), origin: z.string(), ticket: z.string(), pin: z.string().optional() }),
  z.object({ type: z.literal('poll'), account: IlinkAccount, cursor: z.string(), timeout: z.number() }),
  z.object({ type: z.literal('send'), account: IlinkAccount, context: z.string(), id: z.string(), text: z.string() })
])
export type IlinkCommand = z.infer<typeof IlinkCommand>

const Codes = z.object({ ret: z.number().optional(), errcode: z.number().optional() })
const QR = z.object({ qrcode: z.string().min(1).max(4096), qrcode_img_content: z.string().min(1).max(2048) })
const Scan = z.object({
  status: z.string().max(128), redirect_host: z.string().optional(), bot_token: z.string().optional(),
  ilink_bot_id: z.string().optional(), ilink_user_id: z.string().optional(), baseurl: z.string().optional()
})
const Updates = z.object({
  cursor: z.string().max(1_048_576).optional(), timeout: z.number().optional(), messages: z.array(Message).max(2000)
})
export const IlinkResult = z.discriminatedUnion('type', [
  z.object({ type: z.literal('qr'), value: QR }),
  z.object({ type: z.literal('scan'), value: Scan }),
  z.object({ type: z.literal('poll'), value: Updates }),
  z.object({ type: z.literal('send') }),
  z.object({ type: z.literal('error'), code: ErrorCode })
])
export type IlinkResult = z.infer<typeof IlinkResult>

function checkCodes(raw: unknown): void {
  const { ret, errcode } = Codes.parse(raw)
  if (ret === -14 || errcode === -14) throw new IlinkError('auth')
  if (ret || errcode) throw new IlinkError('rejected')
}

export class IlinkApi {
  constructor(private readonly request: typeof fetch = fetch) {}

  async run(command: IlinkCommand): Promise<IlinkResult> {
    try {
      if (command.type === 'qr') {
        const raw = await this.json(new URL('/ilink/bot/get_bot_qrcode?bot_type=3', ORIGIN), 15_000, { local_token_list: [] })
        return { type: 'qr', value: QR.parse(raw) }
      }
      if (command.type === 'scan') {
        const url = new URL('/ilink/bot/get_qrcode_status', officialIlinkOrigin(command.origin))
        url.searchParams.set('qrcode', command.ticket)
        if (command.pin) url.searchParams.set('verify_code', command.pin)
        return { type: 'scan', value: Scan.parse(await this.json(url, 37_000)) }
      }
      const base_info = { channel_version: `${COMPATIBILITY_VERSION}/antumi`, bot_agent: 'Antumi' }
      const { origin, token, owner } = command.account
      if (command.type === 'poll') {
        const url = new URL('/ilink/bot/getupdates', officialIlinkOrigin(origin))
        const raw = await this.json(url, command.timeout, { get_updates_buf: command.cursor, base_info }, token)
        checkCodes(raw)
        const value = z.object({
          get_updates_buf: z.string().max(1_048_576).optional(), longpolling_timeout_ms: z.number().optional(),
          msgs: z.array(z.unknown()).max(2000).optional()
        }).parse(raw)
        const messages = (value.msgs ?? []).flatMap((item) => {
          const parsed = Message.safeParse(item)
          return parsed.success ? [parsed.data] : []
        })
        return { type: 'poll', value: { cursor: value.get_updates_buf, timeout: value.longpolling_timeout_ms, messages } }
      }
      const url = new URL('/ilink/bot/sendmessage', officialIlinkOrigin(origin))
      const raw = await this.json(url, 15_000, {
        msg: {
          from_user_id: '', to_user_id: owner, client_id: command.id, message_type: 2, message_state: 2,
          context_token: command.context, item_list: [{ type: 1, text_item: { text: command.text } }]
        },
        base_info
      }, token)
      checkCodes(raw)
      return { type: 'send' }
    } catch (error) {
      if (command.type === 'poll' && error instanceof Error && error.name === 'TimeoutError') return { type: 'poll', value: { messages: [] } }
      return { type: 'error', code: error instanceof IlinkError ? error.code : error instanceof z.ZodError || error instanceof SyntaxError ? 'protocol' : 'network' }
    }
  }

  private async json(url: URL, timeout: number, body?: object, token?: string): Promise<unknown> {
    const headers = new Headers({ 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': String(0x030000) })
    if (body) {
      headers.set('Content-Type', 'application/json')
      headers.set('AuthorizationType', 'ilink_bot_token')
      headers.set('X-WECHAT-UIN', Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64'))
    }
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await this.request(url, {
      method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers, redirect: 'error', signal: AbortSignal.timeout(timeout)
    })
    if (token && (response.status === 401 || response.status === 403)) throw new IlinkError('auth')
    if (response.status === 429) throw new IlinkError('limited')
    if (!response.ok) throw new IlinkError(response.status >= 500 ? 'network' : 'rejected')
    const raw = await response.text()
    if (raw.length > MAX_RESPONSE) throw new IlinkError('protocol')
    // Preserve IDs sent as JSON uint64 numbers before they can round to the same Number.
    return JSON.parse(raw, (key: string, value: unknown, context?: { source?: string }) => {
      if (key === 'message_id' && typeof value === 'number') return context?.source ?? (Number.isSafeInteger(value) ? String(value) : undefined)
      return value
    })
  }
}
