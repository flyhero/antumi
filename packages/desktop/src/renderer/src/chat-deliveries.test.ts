import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcError, type ChatImage, type ChatItem, type ChatReference } from '@antumi/protocol'
import { acknowledgeChatDeliveries, deliverChatMessage, discardChatDelivery, keepChatDelivery, restoredChatDeliveries, useChatDeliveries, withChatDeliveries } from './chat-deliveries'

const id = 'conversation'
const ref = '11111111-1111-4111-8111-111111111111'
const image: ChatImage = { id: `${'a'.repeat(64)}.png`, width: 4, height: 3 }
const references: ChatReference[] = [{ start: 0, end: 4, target: { kind: 'file', path: '/repo/a.ts', relative: 'a.ts' } }]
const message = { ref, text: 'a.ts 修复', images: [image], references, stageId: 'pending', at: 100 }
const confirmed: ChatItem = { kind: 'user', id: `u:${ref}`, stageId: 'real', revision: 1, at: 120, text: message.text, images: [image], references }
const current = () => useChatDeliveries.getState()[id] ?? []

beforeEach(() => useChatDeliveries.setState({}, true))

describe('chat delivery', () => {
  it('shows a local message immediately, with its images and references, while delivery waits', async () => {
    keepChatDelivery(id, message)
    const pending = Promise.withResolvers<void>()
    const send = vi.fn(() => pending.promise)
    const delivery = deliverChatMessage(id, ref, send)
    expect(current()[0]?.phase).toBe('sending')
    expect(withChatDeliveries([], current())).toMatchObject([{ kind: 'user', id: `u:${ref}`, images: [image], references }])
    pending.resolve()
    await delivery
  })

  it('reconciles a notification before the reply without losing pending or failed status', async () => {
    keepChatDelivery(id, message)
    const pending = Promise.withResolvers<void>()
    const delivery = deliverChatMessage(id, ref, () => pending.promise)
    acknowledgeChatDeliveries(id, [confirmed])
    expect(current()[0]?.phase).toBe('sending')
    expect(withChatDeliveries([confirmed], current())).toEqual([confirmed])
    pending.reject(new Error('connection lost'))
    await delivery
    expect(current()[0]).toMatchObject({ phase: 'failed', error: 'connection lost', images: [image], references })
    acknowledgeChatDeliveries(id, [confirmed])
    expect(current()).toHaveLength(1)
  })

  it('keeps the bubble after the reply until its notification arrives', async () => {
    keepChatDelivery(id, message)
    await deliverChatMessage(id, ref, async () => {})
    acknowledgeChatDeliveries(id, [])
    expect(withChatDeliveries([], current())).toHaveLength(1)
    acknowledgeChatDeliveries(id, [confirmed])
    expect(current()).toEqual([])
    expect(withChatDeliveries([confirmed], current())).toEqual([confirmed])
  })

  it('clears a failed delivery when a later stage confirms the same message', async () => {
    keepChatDelivery(id, message)
    await deliverChatMessage(id, ref, async () => { throw new Error('offline') })
    acknowledgeChatDeliveries(id, [{ ...confirmed, delivery: 'undelivered' }])
    expect(current()[0]?.phase).toBe('failed')
    acknowledgeChatDeliveries(id, [{ ...confirmed, stageId: 'reconnected', delivery: 'submitted' }])
    expect(current()).toEqual([])
  })

  it('keeps an agent confirmation if the pending send reply is lost', async () => {
    keepChatDelivery(id, message)
    const pending = Promise.withResolvers<void>()
    const delivery = deliverChatMessage(id, ref, () => pending.promise)
    acknowledgeChatDeliveries(id, [{ ...confirmed, delivery: 'submitted' }])
    expect(current()[0]).toMatchObject({ phase: 'sending', acknowledged: true })
    const restored = restoredChatDeliveries(JSON.stringify(useChatDeliveries.getState()))
    expect(restored[id]?.[0]).toMatchObject({ phase: 'sent', error: null })
    pending.reject(new Error('connection lost'))
    await delivery
    expect(current()).toEqual([])
  })

  it('preserves uncertain messages and their attachments across a reload', async () => {
    keepChatDelivery(id, message)
    await deliverChatMessage(id, ref, async () => { throw new RpcError('lost reply', -32000, 'delivery-uncertain') })
    expect(current()[0]).toMatchObject({ ...message, phase: 'failed', uncertain: true })
    const restored = restoredChatDeliveries(JSON.stringify(useChatDeliveries.getState()))
    expect(restored[id]?.[0]).toMatchObject({ ...message, phase: 'failed', uncertain: true })
  })

  it('lets a user remove a failed local record without affecting pending messages or another conversation', async () => {
    keepChatDelivery(id, message)
    keepChatDelivery('other', message)
    discardChatDelivery(id, ref)
    expect(current()).toHaveLength(1)
    await deliverChatMessage(id, ref, async () => { throw new RpcError('lost reply', -32000, 'delivery-uncertain') })
    discardChatDelivery(id, ref)
    expect(current()).toEqual([])
    expect(useChatDeliveries.getState().other).toHaveLength(1)
    expect(restoredChatDeliveries(JSON.stringify(useChatDeliveries.getState()))[id]).toEqual([])
  })

  it('retries the same snapshot once, without adding a bubble or touching a new draft', async () => {
    keepChatDelivery(id, message)
    await deliverChatMessage(id, ref, async () => { throw new Error('offline') })
    const pending = Promise.withResolvers<void>()
    const send = vi.fn(() => pending.promise)
    const retry = deliverChatMessage(id, ref, send)
    expect(deliverChatMessage(id, ref, send)).toBe(retry)
    expect(current()).toHaveLength(1)
    expect(current()[0]).toMatchObject({ ref, phase: 'sending', error: null })
    await Promise.resolve()
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(message))
    pending.resolve()
    await retry
    acknowledgeChatDeliveries(id, [confirmed])
    expect(current()).toEqual([])
  })

  it('keeps an earlier failed message above later confirmed messages', () => {
    keepChatDelivery(id, message)
    const later = { ...confirmed, id: 'u:later', at: 150 }
    expect(withChatDeliveries([later], current()).map((item) => item.id)).toEqual([`u:${ref}`, 'u:later'])
  })

  it('restores interrupted delivery for manual retry and waits for confirmed history', async () => {
    keepChatDelivery(id, message)
    const restored = restoredChatDeliveries(JSON.stringify(useChatDeliveries.getState()))
    expect(restored[id]?.[0]).toMatchObject({ ...message, phase: 'failed' })
    await deliverChatMessage(id, ref, async () => {})
    expect(restoredChatDeliveries(JSON.stringify(useChatDeliveries.getState()))[id]?.[0]?.phase).toBe('sent')
    expect(restoredChatDeliveries('{')).toEqual({})
    expect(restoredChatDeliveries(JSON.stringify({ [id]: [{ text: 'bad' }] }))).toEqual({})
  })
})
