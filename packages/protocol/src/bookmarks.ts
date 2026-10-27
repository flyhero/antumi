import { z } from 'zod'
import { antumiToolName } from './chat'

export const MAX_BOOKMARKS = 5000

// Only web pages: a bookmarklet (javascript:) or a browser's own page would run or mean nothing here.
export const BookmarkUrl = z.string().trim().max(4096).refine((url) => /^https?:\/\/[^/\s]/i.test(url), { message: 'not an http(s) URL' })

// A page the user keeps for the built-in browser, which the agent can also look up by name.
export const BookmarkFields = z.object({
  // Empty: the address names it.
  title: z.string().trim().max(500),
  url: BookmarkUrl,
  // Where it sat in the browser it came from ("Bookmarks bar / Work"); null when added here.
  folder: z.string().trim().min(1).max(500).nullable()
})
export type BookmarkFields = z.infer<typeof BookmarkFields>
export const Bookmark = BookmarkFields.extend({ id: z.string().uuid(), createdAt: z.number() })
export type Bookmark = z.infer<typeof Bookmark>

export const BookmarkImport = z.object({ added: z.number().int(), skipped: z.number().int() })
export type BookmarkImport = z.infer<typeof BookmarkImport>

// The agent's look into the user's bookmarks, read-only.
export const BROWSER_BOOKMARKS_TOOL = 'browser_bookmarks'
export function isBrowserBookmarksTool(name: string): boolean {
  return antumiToolName(name) === BROWSER_BOOKMARKS_TOOL
}

// Bookmarks whose title, address or folder hold every word of the query, case aside.
export function matchBookmarks<T extends BookmarkFields>(bookmarks: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...bookmarks]
  return bookmarks.filter((bookmark) => {
    const text = `${bookmark.title} ${bookmark.url} ${bookmark.folder ?? ''}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}
