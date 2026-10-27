import { describe, expect, it } from 'vitest'
import { conversationReference, conversationReferenceId, conversationReferenceParts, conversationReferenceUrl } from './conversation-reference'

const id = 'aaaaaaaa-0000-4000-8000-000000000001'

describe('conversation references', () => {
  it('round-trips titles without letting Markdown or newlines break out of the label', () => {
    for (const title of ['鉴权方案 / API', 'a [b](https://example.com) \\ c', '*bold* <tag> _name_', '🙂 中文']) {
      const reference = conversationReference(id, title)
      expect(conversationReferenceParts(`参考 ${reference} 继续`)).toEqual([
        { kind: 'text', text: '参考 ' }, { kind: 'conversation', id, title }, { kind: 'text', text: ' 继续' }
      ])
    }
    expect(conversationReferenceParts(conversationReference(id, '方案\n说明'))).toEqual([{ kind: 'conversation', id, title: '方案 说明' }])
    expect(conversationReferenceParts(conversationReference(id, ''))).toEqual([{ kind: 'conversation', id, title: id }])
  })

  it('recognizes only exact conversation URLs and preserves everything else literally', () => {
    expect(conversationReferenceId(conversationReferenceUrl(id))).toBe(id)
    expect(conversationReferenceId(conversationReferenceUrl(id.toUpperCase()))).toBe(id)
    for (const url of ['antumi://conversation/not-an-id', `${conversationReferenceUrl(id)}/extra`, `${conversationReferenceUrl(id)}?other=1`, 'https://example.com', 'javascript:alert(1)']) {
      expect(conversationReferenceId(url)).toBeNull()
      const text = `**literal** [说明](${url})`
      expect(conversationReferenceParts(text)).toEqual([{ kind: 'text', text }])
    }
    expect(conversationReferenceParts('')).toEqual([])
  })

  it('keeps repeated titles tied to each distinct id', () => {
    const other = 'bbbbbbbb-0000-4000-8000-000000000002'
    expect(conversationReferenceParts(conversationReference(id, '方案') + conversationReference(other, '方案'))).toEqual([
      { kind: 'conversation', id, title: '方案' }, { kind: 'conversation', id: other, title: '方案' }
    ])
  })
})
