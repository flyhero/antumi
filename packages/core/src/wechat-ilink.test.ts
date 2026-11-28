import { describe, expect, it, vi } from 'vitest'
import { IlinkApi, officialIlinkOrigin } from './wechat-ilink'

const origin = 'https://ilinkai.weixin.qq.com'
const account = { bot: 'bot', owner: 'owner', token: 'token', origin }

describe('iLink protocol', () => {
  it('uses the documented self-bind and PIN requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ qrcode: 'ticket', qrcode_img_content: 'qr' }))
      .mockResolvedValueOnce(Response.json({ status: 'scaned' }))
    const api = new IlinkApi(fetch)
    expect(await api.run({ type: 'qr' })).toEqual({ type: 'qr', value: { qrcode: 'ticket', qrcode_img_content: 'qr' } })
    expect(String(fetch.mock.calls[0]?.[0])).toBe(origin + '/ilink/bot/get_bot_qrcode?bot_type=3')
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: '{"local_token_list":[]}', redirect: 'error' })
    expect(await api.run({ type: 'scan', origin, ticket: 'test ticket', pin: '123456' })).toEqual({ type: 'scan', value: { status: 'scaned' } })
    expect(String(fetch.mock.calls[1]?.[0])).toBe(origin + '/ilink/bot/get_qrcode_status?qrcode=test+ticket&verify_code=123456')
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).has('Authorization')).toBe(false)
  })

  it('preserves distinct uint64 IDs and discards malformed messages', async () => {
    const raw = '{"ret":0,"get_updates_buf":"cursor","msgs":[{"message_id":18446744073709551614},{"message_id":18446744073709551615},{"message_id":"wrong"}]}'
    const api = new IlinkApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(raw)))
    expect(await api.run({ type: 'poll', account, cursor: '', timeout: 40_000 })).toMatchObject({
      type: 'poll', value: { cursor: 'cursor', messages: [{ message_id: '18446744073709551614' }, { message_id: '18446744073709551615' }] }
    })
  })

  it('uses the authorized recipient and context and distinguishes delivery failures', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ ret: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ errcode: -14 }))
      .mockResolvedValueOnce(Response.json({}))
    const api = new IlinkApi(fetch)
    const send = () => api.run({ type: 'send', account, context: 'context', id: 'stable', text: 'hello' })
    expect(await send()).toEqual({ type: 'send' })
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer token')
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      msg: { to_user_id: 'owner', client_id: 'stable', context_token: 'context', item_list: [{ text_item: { text: 'hello' } }] }
    })
    expect(await send()).toEqual({ type: 'error', code: 'limited' })
    expect(await send()).toEqual({ type: 'error', code: 'auth' })
    expect(await send()).toEqual({ type: 'error', code: 'protocol' })
  })

  it('permits only Tencent iLink origins and handles idle long polls', async () => {
    for (const value of ['http://ilinkai.weixin.qq.com', 'https://example.org', 'ilinkai.weixin.qq.com.example.org', 'https://name@ilinkai.weixin.qq.com', origin + '/unexpected']) {
      expect(() => officialIlinkOrigin(value)).toThrow()
    }
    expect(officialIlinkOrigin('ilinkai.weixin.qq.com')).toBe(origin)
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
    const api = new IlinkApi(fetch)
    expect(await api.run({ type: 'poll', account, cursor: 'old', timeout: 40_000 })).toEqual({ type: 'poll', value: { messages: [] } })
  })
})
