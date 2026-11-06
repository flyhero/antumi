import { describe, expect, it } from 'vitest'
import { commentPage, commentState } from './comment-pagination'
import type { SourceComment } from '../../protocol/src/source-comments'

const comment = (id: string, createdAt = 1000): SourceComment => ({ id, author: 'Ann', createdAt, updatedAt: null, url: 'https://example.test/issue', markdown: id, truncated: false })

describe('source comment pagination', () => {
  it('keeps all identities at a baseline boundary while showing the latest twenty', () => {
    const state = commentState(Array.from({ length: 150 }, (_, id) => comment(String(id))))
    expect(state.comments).toHaveLength(20)
    expect(state.checkpoint.ids).toHaveLength(150)
    expect(commentPage([comment('later')], { checkpoint: state.checkpoint, continuation: null }).comments.map((comment) => comment.id)).toEqual(['later'])
  })
  it('freezes the upper boundary across pages without losing a same-time arrival', () => {
    const comments = Array.from({ length: 125 }, (_, id) => comment(`c-${String(id).padStart(3, '0')}`))
    const checkpoint = { createdAt: 0, ids: [] }
    const first = commentPage(comments, { checkpoint, continuation: null })
    expect(first.comments).toHaveLength(100)
    const second = commentPage([...comments, comment('z-arrived')], { checkpoint, continuation: first.continuation })
    expect(second.comments).toHaveLength(25)
    expect(second.continuation).toBeNull()
    expect(commentPage([...comments, comment('z-arrived')], { checkpoint: second.checkpoint, continuation: null }).comments.map((comment) => comment.id)).toEqual(['z-arrived'])
  })
  it('does not treat edits or duplicates as a new comment', () => {
    const baseline = commentState([comment('one')])
    expect(commentPage([comment('one'), { ...comment('one'), markdown: 'edited' }], { checkpoint: baseline.checkpoint, continuation: null }).comments).toEqual([])
  })
})
