import { t } from './i18n'
import { create } from 'zustand'
import { z } from 'zod'
import { ChatReference, ChatImage, RpcError, type ChatItem, type RpcConnection } from '@antumi/protocol'
import { reasonText } from './labels'

const InitialMessage = z.object({
  ref: z.string().uuid(),
  text: z.string(),
  images: z.array(ChatImage),
  references: z.array(ChatReference).optional(),
  at: z.number(),
  phase: z.enum(['starting', 'sending', 'failed']),
  error: z.string().nullable()
})
export type InitialMessage = z.infer<typeof InitialMessage>
const Messages = z.record(z.string(), InitialMessage)
const STORAGE_KEY = 'antumi.initial-messages'

// A reload leaves delivery uncertain; keep the same ref for an explicit retry.
export function restoredInitialMessages(raw: string | null): Record<string, InitialMessage> {
  try {
    const parsed = Messages.safeParse(JSON.parse(raw ?? '{}'))
    if (!parsed.success) return {}
    return Object.fromEntries(Object.entries(parsed.data).map(([id, message]) => [id, {
      ...message, phase: 'failed' as const, error: message.error ?? t('initialMessages.sendIsUnfinishedTryAgain')
    }]))
  } catch { return {} }
}

function load(): Record<string, InitialMessage> {
  try { return restoredInitialMessages(localStorage.getItem(STORAGE_KEY)) } catch { return {} }
}

export const useInitialMessages = create<Record<string, InitialMessage>>()(load)
useInitialMessages.subscribe((messages) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch { /* Keep the in-memory copy. */ }
})

export function keepInitialMessage(id: string, text: string, images: readonly ChatImage[], references?: ChatReference[]): void {
  useInitialMessages.setState({ [id]: { ref: crypto.randomUUID(), text, images: [...images], at: Date.now(), ...(references?.length ? { references } : {}), phase: 'starting', error: null } })
}

function discard(id: string): void {
  useInitialMessages.setState((messages) => {
    const { [id]: _removed, ...rest } = messages
    return rest
  }, true)
}

export function acknowledgeInitialMessage(id: string, items: readonly ChatItem[]): void {
  const message = useInitialMessages.getState()[id]
  if (message && items.some((item) => item.kind === 'user' && item.id === `u:${message.ref}`)) discard(id)
}

// Delivery belongs to the message, so leaving its page cannot start it again.
const deliveries = new Map<string, Promise<void>>()
export function sendInitialMessage(id: string, rpc: RpcConnection): Promise<void> {
  const pending = deliveries.get(id)
  if (pending) return pending
  const message = useInitialMessages.getState()[id]
  if (!message) return Promise.resolve()
  useInitialMessages.setState({ [id]: { ...message, phase: 'starting', error: null } })
  const delivery = (async () => {
    try {
      await rpc.call('conversations.continue', { id })
      if (!useInitialMessages.getState()[id]) return
      useInitialMessages.setState({ [id]: { ...message, phase: 'sending', error: null } })
      await rpc.call('conversations.send', { id, text: message.text, images: message.images.map((image) => image.id), ref: message.ref, ...(rpc.features.includes('chat-references') ? { references: message.references } : {}) })
      discard(id)
    } catch (error) {
      if (!useInitialMessages.getState()[id]) return
      const detail = error instanceof RpcError && error.reason ? reasonText(error.reason, error.message) : error instanceof Error ? error.message : String(error)
      useInitialMessages.setState({ [id]: { ...message, phase: 'failed', error: detail } })
    }
  })().finally(() => deliveries.delete(id))
  deliveries.set(id, delivery)
  return delivery
}
