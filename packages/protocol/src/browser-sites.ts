import { z } from 'zod'

// The answer to the browser's site question that allows the site in every conversation from then
// on, by its exact host name; offered beside allowing it once or for the conversation.
export const ALLOW_SITE_ALWAYS = 'allowAlways'

// A site the user allowed the agents' browser to open without asking, and when.
export const BrowserSite = z.object({
  host: z.string().min(1).max(253),
  allowedAt: z.number()
})
export type BrowserSite = z.infer<typeof BrowserSite>
