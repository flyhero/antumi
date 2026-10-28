import { describe, expect, it } from 'vitest'
import { ChatReference, chatReferencesIn, validChatReferences } from './chat-reference'

const reference = { start: 2, end: 10, target: { kind: 'file', path: '/repo/a.ts', relative: 'a.ts' } } as const

describe('chat reference offsets', () => {
  it('keeps only whole, nonoverlapping references inside the message', () => {
    expect(validChatReferences('a a.ts path', [reference, { ...reference, start: 4, end: 8 }, { ...reference, start: 11, end: 12 }])).toEqual([reference])
    expect(ChatReference.safeParse({ ...reference, end: 1 }).success).toBe(false)
  })

  it('rebases references in a quoted body and drops those cut by a slice', () => {
    expect(chatReferencesIn('a a.ts path', 'a.ts path', [reference])).toEqual([{ ...reference, start: 0, end: 8 }])
    expect(chatReferencesIn('a a.ts path', 'path', [reference])).toEqual([])
    expect(chatReferencesIn('a a.ts path', '', [reference])).toEqual([])
  })
})
