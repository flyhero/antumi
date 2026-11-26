import { describe, expect, it } from 'vitest'
import type { ChatImage, ChatReference } from '@antumi/protocol'
import { appendComposerInsertion, insertIntoComposer, takeComposerInsertions } from './composer-insertions'

const reference: ChatReference = { start: 0, end: 4, target: { kind: 'file', path: '/repo/a.ts', relative: 'a.ts' } }
const image: ChatImage = { id: `${'a'.repeat(64)}.png`, width: 4, height: 3 }

describe('composer insertions', () => {
  it('restores a message after the current draft and preserves both sets of references', () => {
    const draft = { text: 'a.ts draft', mentions: [reference] }
    const insertion = { text: 'a.ts retry', images: [image], references: [reference] }
    expect(appendComposerInsertion(draft, insertion)).toEqual({
      text: 'a.ts draft\n\na.ts retry',
      mentions: [reference, { ...reference, start: 12, end: 16 }]
    })
    expect(appendComposerInsertion({ text: '', mentions: [] }, insertion)).toEqual({ text: insertion.text, mentions: [reference] })
    expect(draft).toEqual({ text: 'a.ts draft', mentions: [reference] })
  })

  it('keeps restored text, images and references in the intended conversation until taken', () => {
    const insertion = { text: 'a.ts retry', images: [image], references: [reference] }
    insertIntoComposer('failed-conversation', insertion)
    expect(takeComposerInsertions('other-conversation')).toEqual([])
    expect(takeComposerInsertions('failed-conversation')).toEqual([insertion])
    expect(takeComposerInsertions('failed-conversation')).toEqual([])
  })
})
