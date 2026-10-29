import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { BookmarkUrl, MAX_BOOKMARKS, type BookmarkFields } from '@antumi/protocol'
import { browserDataRoot, CHROMIUM_BROWSERS, validBrowserProfileDir, type BrowserPlaces } from './browser-profiles'

// A browser profile on this machine whose bookmarks can be brought in.
export type BookmarkSource = { id: string; browser: string; profile: string; count: number }

// A bookmarks file is a few MB at most; anything far bigger is not one.
const MAX_FILE_BYTES = 64 * 1024 * 1024

export type BookmarkPlaces = BrowserPlaces

const LocalState = z.object({ profile: z.object({ info_cache: z.record(z.string(), z.object({ name: z.string().catch('') }).catch({ name: '' })) }) })

// The profiles a browser has, by folder and the name the user gave each; Default where it says nothing.
async function profilesOf(userData: string): Promise<Array<{ dir: string; name: string }>> {
  const raw = await readFile(path.join(userData, 'Local State'), 'utf8').catch(() => null)
  const parsed = raw === null ? null : LocalState.safeParse(safeJson(raw))
  if (!parsed?.success) return [{ dir: 'Default', name: 'Default' }]
  return Object.entries(parsed.data.profile.info_cache).map(([dir, info]) => ({ dir, name: info.name || dir }))
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readSmall(file: string): Promise<string | null> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return null
  return readFile(file, 'utf8').catch(() => null)
}

function locate(id: string, places: BookmarkPlaces): { file: string; browser: string } | null {
  const [browserId, profileDir] = id.split('/', 2)
  const browser = CHROMIUM_BROWSERS.find((each) => each.id === browserId)
  const dir = browser?.dirs[places.platform]
  const root = browserDataRoot(places)
  // The profile is a folder name from Local State, never a path of its own.
  if (!browser || !dir || !root || !profileDir || !validBrowserProfileDir(profileDir)) return null
  return { file: path.join(root, dir, profileDir, 'Bookmarks'), browser: browser.name }
}

// The profiles on this machine that have bookmarks, browser by browser.
export async function findBookmarkSources(places: BookmarkPlaces): Promise<BookmarkSource[]> {
  const root = browserDataRoot(places)
  if (!root) return []
  const found = await Promise.all(CHROMIUM_BROWSERS.map(async (browser) => {
    const dir = browser.dirs[places.platform]
    if (!dir) return []
    const userData = path.join(root, dir)
    const profiles = await profilesOf(userData)
    const sources = await Promise.all(profiles.map(async ({ dir: profileDir, name }) => {
      const raw = await readSmall(path.join(userData, profileDir, 'Bookmarks'))
      const count = raw === null ? 0 : chromiumBookmarks(safeJson(raw)).length
      return count > 0 ? [{ id: `${browser.id}/${profileDir}`, browser: browser.name, profile: name, count }] : []
    }))
    return sources.flat()
  }))
  return found.flat()
}

// The bookmarks of one source findBookmarkSources gave.
export async function readBookmarkSource(id: string, places: BookmarkPlaces): Promise<BookmarkFields[]> {
  const located = locate(id, places)
  const raw = located ? await readSmall(located.file) : null
  if (raw === null) throw new Error('bookmarks-unreadable')
  return chromiumBookmarks(safeJson(raw))
}

const ChromiumNode = z.object({
  type: z.string(),
  name: z.string().catch(''),
  url: z.string().optional(),
  children: z.array(z.unknown()).optional()
})
const ChromiumFile = z.object({ roots: z.record(z.string(), z.unknown()) })

// A Chromium "Bookmarks" file's pages, each with the folders it sits in ("Bookmarks bar / Work").
// What is not a web page (a bookmarklet, chrome://) is left out.
export function chromiumBookmarks(file: unknown): BookmarkFields[] {
  const parsed = ChromiumFile.safeParse(file)
  if (!parsed.success) return []
  const found: BookmarkFields[] = []
  const walk = (raw: unknown, folders: string[]) => {
    const node = ChromiumNode.safeParse(raw)
    if (!node.success || found.length >= MAX_BOOKMARKS) return
    const { type, name, url, children } = node.data
    if (type === 'url' && url !== undefined) {
      const bookmark = page(name, url, folders)
      if (bookmark) found.push(bookmark)
    } else if (type === 'folder') {
      for (const child of children ?? []) walk(child, name ? [...folders, name] : folders)
    }
  }
  for (const root of Object.values(parsed.data.roots)) walk(root, [])
  return found
}

function page(title: string, url: string, folders: string[]): BookmarkFields | null {
  const checked = BookmarkUrl.safeParse(url)
  if (!checked.success) return null
  const folder = folders.join(' / ').trim().slice(0, 500)
  return { title: title.trim().slice(0, 500), url: checked.data, folder: folder || null }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (entity[0] === '#') {
        const code = entity[1] === 'x' || entity[1] === 'X' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1))
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
      }
      return ENTITIES[entity.toLowerCase()] ?? whole
    })
    .trim()
}

// An exported bookmarks page (the Netscape format every browser writes: Safari, Firefox, Chrome):
// <H3> names the folder whose <DL> follows, <A HREF> is a page.
export function htmlBookmarks(html: string): BookmarkFields[] {
  const found: BookmarkFields[] = []
  const folders: string[] = []
  let heading: string | null = null
  const tokens = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>|<dl\b[^>]*>|<\/dl\s*>/gi
  for (const [whole, folder, attributes, title] of html.matchAll(tokens)) {
    if (found.length >= MAX_BOOKMARKS) break
    if (folder !== undefined) {
      heading = decodeHtml(folder)
    } else if (attributes !== undefined) {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes)
      const url = decodeHtml(href?.[1] ?? href?.[2] ?? '')
      const bookmark = page(decodeHtml(title ?? ''), url, folders.filter(Boolean))
      if (bookmark) found.push(bookmark)
    } else if (/^<dl/i.test(whole)) {
      // The outermost list has no heading of its own: the file's title is not a folder.
      folders.push(heading ?? '')
      heading = null
    } else {
      folders.pop()
    }
  }
  return found
}
