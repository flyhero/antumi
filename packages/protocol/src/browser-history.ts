import { z } from 'zod'

// Pages kept no longer than this, and no more of them than this.
export const BROWSER_HISTORY_DAYS = 90
export const MAX_BROWSER_HISTORY = 10_000
export const MAX_BROWSER_HISTORY_RESULTS = 200

// A page the browser went to, one per address and who took it there: its latest title and visit.
export const BrowserHistoryEntry = z.object({
  url: z.string().max(4096),
  // The conversation whose agent opened it, or null for the user.
  conversationId: z.string().uuid().nullable(),
  title: z.string().max(500),
  visitedAt: z.number(),
  visits: z.number().int()
})
export type BrowserHistoryEntry = z.infer<typeof BrowserHistoryEntry>

// Pages whose title or address hold every word of the query, case aside; with none, every page.
// Only the user's own unless agents' are asked for; latest first, or the most visited.
export const BrowserHistorySearch = z.object({
  query: z.string().max(500).default(''),
  agents: z.boolean().default(false),
  order: z.enum(['recent', 'frequent']).default('recent'),
  limit: z.number().int().min(1).max(MAX_BROWSER_HISTORY_RESULTS).default(50)
})
