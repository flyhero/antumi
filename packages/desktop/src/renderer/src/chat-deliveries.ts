import { create } from 'zustand'
import { z } from 'zod'
import { ChatImage, ChatReference, RpcError, type ChatItem } from '@antumi/protocol'
import { t } from './i18n'
import { reasonText } from './labels'

const Delivery = z.object({
  ref: z.string().uuid(),
  text: z.string(),
  images: z.array(ChatImage),
  references: z.array(ChatReference).optional(),
  stageId: z.string(),
  at: z.number(),
  steer: z.boolean().optional(),
  phase: z.enum(['sending', 'sent', 'failed']),
  error: z.string().nullable(),
  uncertain: z.boolean().optional(),
  acknowledged: z.boolean().optional()
})
export type ChatDelivery = z.infer<typeof Delivery>
const Deliveries = z.record(z.string(), z.array(Delivery))
const STORAGE_KEY = 'antumi.chat-deliveries'
export const NO_DELIVERIES: readonly ChatDelivery[] = []

export function restoredChatDeliveries(raw: string | null): Record<string, ChatDelivery[]> {
  try {
    const parsed = Deliveries.safeParse(JSON.parse(raw ?? '{}'))
    if (!parsed.success) return {}
    return Object.fromEntries(Object.entries(parsed.data).map(([id, messages]) => [id, messages.map((message): ChatDelivery => message.acknowledged ? { ...message, phase: 'sent', error: null } : message.phase === 'sent' ? message : {
      ...message, phase: 'failed', error: message.error ?? t('initialMessages.sendIsUnfinishedTryAgain')
    })]))
  } catch { return {} }
}

function load(): Record<string, ChatDelivery[]> {
  try { return restoredChatDeliveries(localStorage.getItem(STORAGE_KEY)) } catch { return {} }
}

export const useChatDeliveries = create<Record<string, ChatDelivery[]>>()(load)
useChatDeliveries.subscribe((messages) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch { /* Keep the in-memory copy. */ }
})

export function keepChatDelivery(id: string, message: Omit<ChatDelivery, 'phase' | 'error'>): void {
  useChatDeliveries.setState((state) => ({ [id]: [...(state[id] ?? []), { ...message, phase: 'sending', error: null }] }))
}

export function discardChatDelivery(id: string, ref: string): void {
  useChatDeliveries.setState((state) => ({ [id]: (state[id] ?? []).filter((message) => message.ref !== ref || message.phase !== 'failed') }))
}

function update(id: string, ref: string, change: Partial<Pick<ChatDelivery, 'phase' | 'error' | 'uncertain' | 'acknowledged'>>): void {
  useChatDeliveries.setState((state) => ({ [id]: (state[id] ?? []).map((message) => message.ref === ref ? { ...message, ...change } : message) }))
}

function clearAcknowledged(id: string, ref: string): boolean {
  const messages = useChatDeliveries.getState()[id] ?? []
  if (!messages.some((message) => message.ref === ref && message.acknowledged)) return false
  useChatDeliveries.setState({ [id]: messages.filter((message) => message.ref !== ref) })
  return true
}

// A notification can precede the send result; keep its status until that result is known.
export function acknowledgeChatDeliveries(id: string, items: readonly ChatItem[]): void {
  const messages = useChatDeliveries.getState()[id]
  if (!messages) return
  const delivered = new Set(items.flatMap((item) => item.kind === 'user' ? [item.id] : item.kind === 'state' ? item.queue.map((entry) => `u:${entry.ref}`) : []))
  const receipts = new Set(items.flatMap((item) => item.kind === 'user' && item.delivery === 'submitted' ? [item.id] : []))
  const remaining = messages.filter((message) => message.phase === 'sending' || !(receipts.has(`u:${message.ref}`) || (message.phase === 'sent' && delivered.has(`u:${message.ref}`))))
    .map((message) => !message.acknowledged && receipts.has(`u:${message.ref}`) ? { ...message, acknowledged: true } : message)
  if (remaining.length !== messages.length || remaining.some((message, index) => message !== messages[index])) useChatDeliveries.setState({ [id]: remaining })
}

const deliveries = new Map<string, Promise<void>>()
export function deliverChatMessage(id: string, ref: string, send: (message: ChatDelivery) => Promise<void>): Promise<void> {
  const pending = deliveries.get(ref)
  if (pending) return pending
  const message = useChatDeliveries.getState()[id]?.find((entry) => entry.ref === ref)
  if (!message) return Promise.resolve()
  update(id, ref, { phase: 'sending', error: null })
  const delivery = Promise.resolve().then(() => send(message)).then(() => {
    if (clearAcknowledged(id, ref)) return
    update(id, ref, { phase: 'sent', error: null })
  }, (error: unknown) => {
    if (clearAcknowledged(id, ref)) return
    const detail = error instanceof RpcError && error.reason ? reasonText(error.reason, error.message)
      : error instanceof Error ? error.message : String(error)
    update(id, ref, { phase: 'failed', error: detail, uncertain: error instanceof RpcError && error.reason === 'delivery-uncertain' })
  }).finally(() => deliveries.delete(ref))
  deliveries.set(ref, delivery)
  return delivery
}

// Local bubbles and core's records share an id, so confirmation replaces rather than appends.
export function withChatDeliveries(items: readonly ChatItem[], messages: readonly ChatDelivery[]): readonly ChatItem[] {
  if (!messages.length) return items
  const present = new Set(items.filter((item) => item.kind === 'user').map((item) => item.id))
  const result = [...items]
  for (const message of messages) {
    if (present.has(`u:${message.ref}`)) continue
    const item: ChatItem = {
      kind: 'user', id: `u:${message.ref}`, stageId: message.stageId, revision: 0, at: message.at,
      text: message.text, images: message.images, references: message.references, steer: message.steer
    }
    const next = result.findIndex((entry) => entry.kind === 'user' && entry.at > message.at)
    if (next < 0) result.push(item)
    else result.splice(next, 0, item)
  }
  return result
}
