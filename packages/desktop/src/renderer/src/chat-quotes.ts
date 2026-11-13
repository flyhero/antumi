import { create } from 'zustand'

// A passage of the agent's reply the user quotes in their next message, with what they say about
// it. source is the entry it came from, to find it again; null when it is not known. anchor ties a
// comment on a diff to the lines it marks there (DiffComments); it lives only here, never in the
// message.
export type QuoteAnchor = { diff: string; rows: readonly string[] }
export type ChatQuote = { id: string; source: string | null; text: string; note: string; anchor?: QuoteAnchor }

// The passages waiting in each chat's input, in the order they were picked.
const useQuoteStore = create<Record<string, readonly ChatQuote[]>>()(() => ({}))

let nextId = 0

export function useQuotes(conversationId: string): readonly ChatQuote[] {
  return useQuoteStore((s) => s[conversationId] ?? NONE)
}

const NONE: readonly ChatQuote[] = []

function update(conversationId: string, change: (quotes: readonly ChatQuote[]) => readonly ChatQuote[]): void {
  useQuoteStore.setState((s) => ({ [conversationId]: change(s[conversationId] ?? NONE) }))
}

// The new quote's id, to tie it to anything shown for it.
export function addQuote(conversationId: string, source: string | null, text: string, note = '', anchor?: QuoteAnchor): string | null {
  const clean = text.trim()
  if (!clean) return null
  const id = `q${++nextId}`
  update(conversationId, (quotes) => [...quotes, { id, source, text: clean, note: note.trim(), ...(anchor ? { anchor } : {}) }])
  return id
}

export function setQuoteNote(conversationId: string, id: string, note: string): void {
  update(conversationId, (quotes) => quotes.map((quote) => (quote.id === id ? { ...quote, note } : quote)))
}

export function removeQuote(conversationId: string, id: string): void {
  update(conversationId, (quotes) => quotes.filter((quote) => quote.id !== id))
}

export function setQuotes(conversationId: string, quotes: readonly Omit<ChatQuote, 'id'>[]): void {
  update(conversationId, () => quotes.map((quote) => ({ ...quote, id: `q${++nextId}` })))
}

// The message form, shared with the phone, which shows quotes as the chat here does.
export { composeMessage, parseQuotes, withoutQuoteMarkers } from '@antumi/protocol'

// The limit Claude's answer to a plan takes, and how much of each passage goes into it.
export const FEEDBACK_LIMIT = 2000
const PASSAGE_LIMIT = 400

// Feedback on a plan, sent back with it to keep planning: each passage quoted, cut short where it is
// long, then what the user says about it, then the rest of what they wrote. No markers: it goes
// back as the answer to the plan, not as a message the chat shows.
export function composeFeedback(quotes: readonly Pick<ChatQuote, 'text' | 'note'>[], body: string): string {
  const blocks = quotes.map((quote) => {
    const text = quote.text.trim()
    const passage = text.length > PASSAGE_LIMIT ? `${text.slice(0, PASSAGE_LIMIT)}…` : text
    const note = quote.note.replace(/\s*\n\s*/g, ' ').trim()
    return [passage.split('\n').map((line) => (line.trim() ? `> ${line}` : '>')).join('\n'), ...(note ? ['', note] : [])].join('\n')
  })
  const message = [...blocks, body.trim()].filter(Boolean).join('\n\n')
  return message.length > FEEDBACK_LIMIT ? `${message.slice(0, FEEDBACK_LIMIT - 1)}…` : message
}
