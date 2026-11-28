import { z } from 'zod'
import { canReuseConversation, type Conversation } from './conversation'

export function canBindWechatConversation(conversation: Conversation): boolean {
  return canReuseConversation(conversation) && conversation.archivedAt == null && !conversation.autoInvestigationId
}

export const WechatRemoteStatus = z.object({
  state: z.enum(['off', 'pairing', 'pin', 'confirm', 'connecting', 'waiting', 'ready', 'reauth', 'error']),
  paired: z.boolean(),
  enabled: z.boolean(),
  conversationId: z.string().nullable(),
  pairing: z.object({ id: z.string(), qr: z.string().nullable() }).nullable(),
  error: z.enum(['network', 'protocol', 'expired', 'already-bound', 'limited', 'rejected']).nullable()
})
export type WechatRemoteStatus = z.infer<typeof WechatRemoteStatus>
