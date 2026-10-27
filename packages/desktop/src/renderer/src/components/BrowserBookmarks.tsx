import { t } from '../i18n'
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { matchBookmarks, type Bookmark, type BookmarkFields, type BrowserTab } from '@antumi/protocol'
import { addBookmark, deleteBookmark, importBookmarks, perform, useBookmarksSupported, useCore } from '../core-store'
import { bookmarkSources, canImportBookmarks, pickBookmarksFile, readBookmarks, type BookmarkSource } from '../desktop-bridge'
import { focusBrowserTab } from '../browser-state'
import { hasPrimaryModifier } from '../shortcut-keys'
import { BookmarkIcon, DownloadIcon, StarIcon } from './icons'
import { Popover } from './Popover'

// Rows shown at once; a search narrows the rest.
const SHOWN = 200

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

// The star in the address bar: fills when the page is kept, and a click keeps or lets it go.
export function BookmarkStar({ tab }: { tab: BrowserTab }) {
  const supported = useBookmarksSupported()
  const kept = useCore((s) => s.bookmarks.find((bookmark) => bookmark.url === tab.url))
  if (!supported || !/^https?:\/\//i.test(tab.url)) return null
  const label = kept ? t('BrowserBookmarks.removeBookmark') : t('BrowserBookmarks.bookmarkThisPage')
  return (
    <button
      type="button"
      className="tool-button browser-bookmark-star"
      data-kept={kept ? '' : undefined}
      aria-pressed={Boolean(kept)}
      aria-label={label}
      data-tooltip={label}
      onClick={() => (kept ? deleteBookmark(kept.id) : addBookmark({ title: tab.title, url: tab.url, folder: null }))}
    >
      <StarIcon />
    </button>
  )
}

// Moves the focus along the bookmark rows, from the search box into the list and back.
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const menu = event.currentTarget.closest('.browser-bookmarks')
  const rows = [...(menu?.querySelectorAll<HTMLElement>('.browser-bookmark-item') ?? [])]
  if (rows.length === 0) return
  event.preventDefault()
  const next = rows.findIndex((row) => row === document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1)
  if (next < 0) menu?.querySelector<HTMLElement>('.menu-search')?.focus()
  else rows[Math.min(next, rows.length - 1)]?.focus()
}

function BookmarkRow({ bookmark, onOpen }: { bookmark: Bookmark; onOpen: (event: MouseEvent) => void }) {
  const title = bookmark.title || hostOf(bookmark.url)
  return (
    <li className="menu-row browser-bookmark-row">
      <button type="button" className="menu-item browser-bookmark-item" title={bookmark.url} onClick={onOpen} onKeyDown={moveFocus}>
        <span className="browser-bookmark-text">
          <span className="menu-item-title">{title}</span>
          <span className="browser-bookmark-where">{bookmark.folder ? `${bookmark.folder} · ${hostOf(bookmark.url)}` : hostOf(bookmark.url)}</span>
        </span>
      </button>
      <button type="button" className="icon-button" aria-label={t('BrowserBookmarks.deleteBookmark', { title })} title={t('BrowserBookmarks.deleteBookmark', { title })} onClick={() => deleteBookmark(bookmark.id)}>
        ×
      </button>
    </li>
  )
}

type Imported = { added: number; skipped: number } | { error: string }

// Other browsers' bookmarks on this machine, and an exported page, brought in at a click.
function ImportView({ onBack }: { onBack: () => void }) {
  const [sources, setSources] = useState<BookmarkSource[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Imported | null>(null)
  useEffect(() => {
    void bookmarkSources().then(setSources)
  }, [])
  const bring = async (read: () => Promise<BookmarkFields[] | null>) => {
    setBusy(true)
    setOutcome(null)
    try {
      const found = await read()
      if (found === null) return
      const result = await importBookmarks(found)
      if (result) setOutcome(result)
    } catch {
      setOutcome({ error: t('BrowserBookmarks.couldNotReadBookmarks') })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="browser-bookmarks">
      <div className="menu-label">{t('BrowserBookmarks.importBookmarks')}</div>
      {sources === null && <p className="menu-note">{t('BrowserBookmarks.lookingForBrowsers')}</p>}
      {sources?.length === 0 && <p className="menu-note">{t('BrowserBookmarks.noBrowserBookmarksFound')}</p>}
      <ul className="menu-list">
        {sources?.map((source) => (
          <li key={source.id} className="menu-row">
            <button type="button" className="menu-item" disabled={busy} onClick={() => void bring(() => readBookmarks(source.id))}>
              <span className="menu-item-title">{source.browser}</span>
              <span className="menu-item-path">{t('BrowserBookmarks.profileCount', { profile: source.profile, count: source.count })}</span>
            </button>
          </li>
        ))}
        <li className="menu-row">
          <button type="button" className="menu-item" disabled={busy} onClick={() => void bring(pickBookmarksFile)}>
            <span className="menu-item-title">{t('BrowserBookmarks.fromHtmlFile')}</span>
            <span className="menu-item-path">{t('BrowserBookmarks.safariFirefoxExport')}</span>
          </button>
        </li>
      </ul>
      {outcome && (
        <p className="menu-note" role="status">
          {'error' in outcome ? outcome.error : t('BrowserBookmarks.importedCount', { added: outcome.added, skipped: outcome.skipped })}
        </p>
      )}
      <div className="menu-separator" />
      <button type="button" className="menu-item" onClick={onBack}>{t('BrowserBookmarks.backToBookmarks')}</button>
    </div>
  )
}

function BookmarksMenu({ tab, onClose }: { tab: BrowserTab; onClose: () => void }) {
  const bookmarks = useCore((s) => s.bookmarks)
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(() => bookmarks.length === 0 && canImportBookmarks())
  const found = useMemo(() => matchBookmarks(bookmarks, query), [bookmarks, query])

  // In the tab on show; with the primary key held, in a new tab of the user's own.
  const open = async (bookmark: Bookmark, newTab: boolean) => {
    onClose()
    if (!newTab) {
      void perform((rpc) => rpc.call('browser.userNavigate', { tabId: tab.id, to: { url: bookmark.url } }))
      return
    }
    const opened = await perform((rpc) => rpc.call('browser.newTab', { url: bookmark.url }))
    if (opened) focusBrowserTab(opened.id)
  }

  return (
    <Popover label={t('BrowserBookmarks.bookmarks')} onClose={onClose} align="end">
      {importing ? (
        <ImportView onBack={() => setImporting(false)} />
      ) : (
        <div className="browser-bookmarks">
          <input
            className="input menu-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Inside the address bar's form: Enter here never submits it.
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                if (found[0]) void open(found[0], hasPrimaryModifier(event))
              } else {
                moveFocus(event)
              }
            }}
            placeholder={t('BrowserBookmarks.searchBookmarks')}
            aria-label={t('BrowserBookmarks.searchBookmarks')}
            autoFocus
          />
          {found.length > 0 && (
            <ul className="menu-list browser-bookmark-list">
              {found.slice(0, SHOWN).map((bookmark) => (
                <BookmarkRow key={bookmark.id} bookmark={bookmark} onOpen={(event) => void open(bookmark, hasPrimaryModifier(event))} />
              ))}
            </ul>
          )}
          {found.length > SHOWN && <p className="menu-note">{t('BrowserBookmarks.moreBookmarks', { count: found.length - SHOWN })}</p>}
          {found.length === 0 && <p className="menu-note">{query.trim() ? t('BrowserBookmarks.noMatchingBookmarks') : t('BrowserBookmarks.noBookmarksYet')}</p>}
          {canImportBookmarks() && (
            <>
              <div className="menu-separator" />
              <button type="button" className="menu-item" onClick={() => setImporting(true)}><DownloadIcon />{t('BrowserBookmarks.importFromOtherBrowsers')}</button>
            </>
          )}
        </div>
      )}
    </Popover>
  )
}

// The address bar's bookmarks: the list to open from, and the import.
export function BookmarksButton({ tab }: { tab: BrowserTab }) {
  const supported = useBookmarksSupported()
  const [open, setOpen] = useState(false)
  if (!supported) return null
  return (
    <span className="menu-anchor">
      <button
        type="button"
        className="tool-button"
        aria-label={t('BrowserBookmarks.bookmarks')}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip={open ? undefined : t('BrowserBookmarks.bookmarks')}
        onClick={() => setOpen(!open)}
      >
        <BookmarkIcon />
      </button>
      {open && <BookmarksMenu tab={tab} onClose={() => setOpen(false)} />}
    </span>
  )
}
