import { z } from 'zod'
import type { ChatItem } from '@antumi/protocol'

// The calls whose results core sent back in this message, by its id: one, or those back together.
export function agentResultCallIds(item: Pick<ChatItem, 'kind' | 'id'>): string[] {
  const ids = item.kind === 'user' ? /^u:agent-result:([0-9a-f-]{36}(?:,[0-9a-f-]{36})*)$/.exec(item.id)?.[1] : undefined
  return ids ? ids.split(',') : []
}

const Delivered = z.object({
  callId: z.string(), name: z.string(), state: z.string(), result: z.string().nullish(), error: z.string().nullish()
})
export type DeliveredResult = z.infer<typeof Delivered>
const Delivery = z.union([Delivered.transform((one) => [one]), z.array(Delivered)])

// What the main agent was given, read back from the message: core writes the results as one line
// of JSON, an object or a list of them, under its preamble (and any note before that).
export function deliveredResults(text: string): DeliveredResult[] {
  for (const line of text.split('\n')) {
    if (!line.startsWith('{') && !line.startsWith('[')) continue
    try {
      const parsed = Delivery.safeParse(JSON.parse(line))
      if (parsed.success) return parsed.data
    } catch { /* Not the results' line. */ }
  }
  return []
}
