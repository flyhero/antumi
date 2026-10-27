import { z } from 'zod'

const PREFIX = 'antumi://conversation/'
const Id = z.string().uuid()

export function conversationReferenceUrl(id: string): string {
  return `${PREFIX}${id}`
}

export function conversationReferenceId(url: string): string | null {
  if (!url.startsWith(PREFIX)) return null
  const id = Id.safeParse(url.slice(PREFIX.length))
  return id.success ? id.data.toLowerCase() : null
}

export function conversationReference(id: string, title: string): string {
  const label = (title.replace(/\s+/g, ' ').trim() || id).replace(/[\\[\]<>*_]/g, '\\$&')
  return `[${label}](${conversationReferenceUrl(id)})`
}

export type ConversationReferencePart = { kind: 'text'; text: string } | { kind: 'conversation'; id: string; title: string }

// User messages keep literal text; only this app-owned link shape becomes a reference.
export function conversationReferenceParts(text: string): ConversationReferencePart[] {
  const parts: ConversationReferencePart[] = []
  const links = /\[((?:\\.|[^\]\\\r\n])*)\]\((antumi:\/\/conversation\/[^)\s]+)\)/g
  let at = 0
  for (const match of text.matchAll(links)) {
    const id = conversationReferenceId(match[2] ?? '')
    if (!id) continue
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) })
    const title = (match[1] ?? '').replace(/\\([\\[\]<>*_])/g, '$1')
    parts.push({ kind: 'conversation', id, title: title || id })
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) })
  return parts
}
