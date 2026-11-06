import { z } from 'zod'
import { CommentCheckpoint, SourceComment, type SourceCommentOptions, type SourceCommentPage, type SourceCommentState } from '../../protocol/src/source-comments.js'

const compare = (a: SourceComment, b: SourceComment) => a.createdAt - b.createdAt || a.id.localeCompare(b.id, 'en')
const newer = (comment: SourceComment, checkpoint: CommentCheckpoint) => comment.createdAt > checkpoint.createdAt || (comment.createdAt === checkpoint.createdAt && !checkpoint.ids.includes(comment.id))
const Cursor = z.object({ upper: CommentCheckpoint, after: z.object({ createdAt: z.number(), id: z.string() }) })

function ordered(values: readonly SourceComment[]): SourceComment[] {
  return [...new Map(values.map((value) => { const comment = SourceComment.parse(value); return [comment.id, comment] })).values()].sort(compare)
}

function boundary(values: readonly SourceComment[], previous: CommentCheckpoint = { createdAt: 0, ids: [] }): CommentCheckpoint {
  const createdAt = Math.max(previous.createdAt, ...values.map((comment) => comment.createdAt))
  return { createdAt, ids: [...new Set([...(previous.createdAt === createdAt ? previous.ids : []), ...values.filter((comment) => comment.createdAt === createdAt).map((comment) => comment.id)])].sort() }
}

export function commentState(values: readonly SourceComment[]): SourceCommentState {
  const comments = ordered(values)
  return { comments: comments.slice(-20), checkpoint: boundary(comments) }
}

// Freeze the upper boundary across pages so a later arrival belongs to the next sync.
export function commentPage(values: readonly SourceComment[], options: SourceCommentOptions): SourceCommentPage {
  const all = ordered(values)
  const cursor = options.continuation ? Cursor.parse(JSON.parse(options.continuation)) : null
  const upper = cursor?.upper ?? boundary(all, options.checkpoint)
  const eligible = all.filter((comment) => newer(comment, options.checkpoint)
    && (comment.createdAt < upper.createdAt || (comment.createdAt === upper.createdAt && upper.ids.includes(comment.id)))
    && (!cursor || compare(comment, { ...comment, ...cursor.after }) > 0))
  const comments = eligible.slice(0, 100)
  const last = comments.at(-1)
  return { comments, checkpoint: upper, continuation: eligible.length > comments.length && last
    ? JSON.stringify({ upper, after: { createdAt: last.createdAt, id: last.id } }) : null }
}
