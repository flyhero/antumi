import { z } from 'zod'

export const ChatReferenceTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file'), path: z.string(), relative: z.string().nullable() }),
  z.object({ kind: z.literal('directory'), path: z.string(), relative: z.string().nullable() }),
  z.object({ kind: z.literal('project'), path: z.string(), relative: z.string().nullable() }),
  z.object({ kind: z.literal('conversation'), id: z.string().uuid(), title: z.string() }),
  z.object({ kind: z.literal('agent'), id: z.string().uuid(), name: z.string() })
])
export type ChatReferenceTarget = z.infer<typeof ChatReferenceTarget>

// Offsets refer to the text sent to the agent, before the client draws its short names.
export const ChatReference = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  target: ChatReferenceTarget
}).refine((reference) => reference.start < reference.end)
export type ChatReference = z.infer<typeof ChatReference>

export function validChatReferences(text: string, references: readonly ChatReference[] = []): ChatReference[] {
  let end = 0
  return [...references].sort((a, b) => a.start - b.start).filter((reference) => {
    if (reference.start < end || reference.end > text.length || reference.start >= reference.end) return false
    end = reference.end
    return true
  })
}

// Quotes and handoff notes wrap the user's text; only references wholly inside a slice survive.
export function chatReferencesIn(text: string, slice: string, references: readonly ChatReference[] = []): ChatReference[] {
  const offset = text.lastIndexOf(slice)
  if (!slice || offset < 0) return []
  return validChatReferences(text, references).filter((reference) => reference.start >= offset && reference.end <= offset + slice.length)
    .map((reference) => ({ ...reference, start: reference.start - offset, end: reference.end - offset }))
}

export function chatReferencesFor(text: string, message: string, references: readonly ChatReference[] = []): ChatReference[] {
  const trimmed = text.trim()
  const offset = message.lastIndexOf(trimmed)
  if (!trimmed || offset < 0) return []
  return chatReferencesIn(text, trimmed, references).map((reference) => ({ ...reference, start: reference.start + offset, end: reference.end + offset }))
}
