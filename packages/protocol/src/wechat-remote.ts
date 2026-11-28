import { z } from 'zod'
import { canReuseConversation, type Conversation } from './conversation'

export function canBindWechatConversation(conversation: Conversation): boolean {
  return canReuseConversation(conversation) && conversation.archivedAt == null && !conversation.autoInvestigationId
}

export const WECHAT_MAX_CONVERSATIONS = 12

export const WechatRemoteNotification = z.enum(['completed', 'failed', 'requests'])
export type WechatRemoteNotification = z.infer<typeof WechatRemoteNotification>
export const WechatRemoteNotifications = z.object({
  completed: z.boolean().default(true),
  failed: z.boolean().default(true),
  requests: z.boolean().default(true)
})
export type WechatRemoteNotifications = z.infer<typeof WechatRemoteNotifications>

export const WechatRemoteStatus = z.object({
  state: z.enum(['off', 'pairing', 'pin', 'confirm', 'connecting', 'waiting', 'ready', 'reauth', 'error']),
  paired: z.boolean(),
  enabled: z.boolean(),
  conversationId: z.string().nullable(),
  authorizedConversationIds: z.array(z.string().uuid()).optional(),
  notifications: WechatRemoteNotifications.optional(),
  pairing: z.object({ id: z.string(), qr: z.string().nullable() }).nullable(),
  error: z.enum(['network', 'protocol', 'expired', 'already-bound', 'limited', 'rejected']).nullable()
})
export type WechatRemoteStatus = z.infer<typeof WechatRemoteStatus>
