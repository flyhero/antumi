import { useEffect } from 'react'
import { create } from 'zustand'
import type { ChatImage, ChatReference } from '@antumi/protocol'
import type { MentionedText } from './chat-mentions'

export type ComposerInsertion = { text: string; images: readonly ChatImage[]; references?: ChatReference[] }

export function appendComposerInsertion(current: MentionedText, insertion: ComposerInsertion): MentionedText {
  const prefix = current.text ? `${current.text}\n\n` : ''
  return { text: prefix + insertion.text, mentions: [...current.mentions, ...(insertion.references ?? []).map((reference) => ({ ...reference, start: reference.start + prefix.length, end: reference.end + prefix.length }))] }
}
const EMPTY: readonly ComposerInsertion[] = []
const useInsertions = create<Record<string, readonly ComposerInsertion[]>>(() => ({}))
const keyOf = (id: string | null) => id === null ? 'new-conversation' : `conversation:${id}`

export function insertIntoComposer(id: string | null, insertion: ComposerInsertion): void {
  const key = keyOf(id)
  useInsertions.setState((state) => ({ [key]: [...(state[key] ?? []), insertion] }))
}

export function takeComposerInsertions(id: string | null): readonly ComposerInsertion[] {
  const key = keyOf(id)
  const pending = useInsertions.getState()[key] ?? EMPTY
  if (pending.length) useInsertions.setState({ [key]: EMPTY })
  return pending
}

// Append to the live input; never replace what the user has typed or automatically send it.
export function useComposerInsertions(id: string | null, receive: (insertion: ComposerInsertion) => void): void {
  const pending = useInsertions((state) => state[keyOf(id)] ?? EMPTY)
  useEffect(() => {
    if (!pending.length) return
    for (const insertion of takeComposerInsertions(id)) receive(insertion)
  }, [id, pending, receive])
}
