import { z } from 'zod'

const WebUrl = z.string().max(4000).refine((value) => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
})
export const SourceComment = z.object({
  id: z.string().min(1).max(500), author: z.string().max(500),
  createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative().nullable(),
  url: WebUrl, markdown: z.string().max(50_000), truncated: z.boolean().default(false)
})
export type SourceComment = z.infer<typeof SourceComment>
// Include every identity at the boundary: trackers commonly round timestamps to a second.
export const CommentCheckpoint = z.object({ createdAt: z.number().int().nonnegative(), ids: z.array(z.string().min(1).max(500)).max(10_000) })
export type CommentCheckpoint = z.infer<typeof CommentCheckpoint>
export const SourceCommentState = z.object({ comments: z.array(SourceComment).max(10_000), checkpoint: CommentCheckpoint })
export type SourceCommentState = z.infer<typeof SourceCommentState>
export const SourceCommentPage = z.object({ comments: z.array(SourceComment).max(100), continuation: z.string().max(200_000).nullable(), checkpoint: CommentCheckpoint })
export type SourceCommentPage = z.infer<typeof SourceCommentPage>
export const SourceCommentOptions = z.object({ checkpoint: CommentCheckpoint, continuation: z.string().max(200_000).nullable() })
export type SourceCommentOptions = z.infer<typeof SourceCommentOptions>

export const SourceUpdateTarget = z.object({ kind: z.enum(['conversation', 'task']), id: z.string().min(1).max(200) })
export type SourceUpdateTarget = z.infer<typeof SourceUpdateTarget>
export const SourceDeliveryState = z.enum(['prepared', 'queued', 'held', 'submitted', 'cancelled', 'failed', 'uncertain'])
export const SourceDelivery = z.object({
  id: z.string().uuid(), requestId: z.string().uuid(), target: SourceUpdateTarget,
  generation: z.string().optional(),
  conversationId: z.string(), ref: z.string(), commentIds: z.array(z.string()),
  text: z.string(), state: SourceDeliveryState, error: z.string().nullable(), createdAt: z.number()
})
export type SourceDelivery = z.infer<typeof SourceDelivery>
export const SourceDeliveryInfo = SourceDelivery.omit({ text: true })
export type SourceDeliveryInfo = z.infer<typeof SourceDeliveryInfo>
export const SourceUpdateSummary = z.object({
  revision: z.string(),
  target: SourceUpdateTarget, watching: z.boolean(), active: z.boolean(), supported: z.boolean(),
  unread: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), through: z.number().int().nonnegative(),
  refreshedAt: z.number().nullable(), refreshing: z.boolean(), problem: z.string().nullable(),
  sendBlocker: z.string().nullable()
})
export type SourceUpdateSummary = z.infer<typeof SourceUpdateSummary>
export const SourceUpdates = z.object({
  summary: SourceUpdateSummary,
  comments: z.array(SourceComment.extend({ sequence: z.number(), pending: z.boolean() })),
  next: z.number().nullable(), deliveries: z.array(SourceDeliveryInfo)
})
export type SourceUpdates = z.infer<typeof SourceUpdates>
