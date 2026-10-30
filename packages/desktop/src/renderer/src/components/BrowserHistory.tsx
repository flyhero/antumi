import { t } from '../i18n'
import { useEffect, useState } from 'react'
import type { BrowserHistoryEntry } from '@antumi/protocol'
import { perform, useBrowserHistorySupported, useCore } from '../core-store'
import { focusBrowserTab, useConversationNames } from '../browser-state'
import { useOccludesBrowser } from '../browser-occlusion'
import { agoText } from '../labels'
import { GlobeIcon } from './icons'
import { setPreference, usePreferences } from '../preferences'

// Cards the empty panel shows, and rows the address bar suggests.
const FREQUENT = 12
export const ADDRESS_SUGGESTIONS = 6
// The colours a site's letter is drawn in when it has no icon (--graph-1 … --graph-6).
const SITE_COLOURS = 6

type Order = 'recent' | 'frequent'

function siteOf(url: string): { origin: string; host: string } | null {
  try {
    const { origin, hostname } = new URL(url)
    return { origin, host: hostname.replace(/^www\./, '') }
  } catch {
    return null
  }
}

function hostOf(url: string): string {
  return siteOf(url)?.host ?? url
}

// What the history holds for a query, asked again whenever core says it changed; null until the
// first answer, and while not wanted. Agents' pages come too once the user asked for them.
export function useBrowserHistory(query: string, limit: number, wanted = true, order: Order = 'recent'): BrowserHistoryEntry[] | null {
  const supported = useBrowserHistorySupported()
  const agents = usePreferences((s) => s.browserHistoryAgents)
  const rpc = useCore((s) => s.rpc)
  const version = useCore((s) => s.browserHistoryVersion)
  const [entries, setEntries] = useState<BrowserHistoryEntry[] | null>(null)
  useEffect(() => {
    if (!supported || !rpc || !wanted) {
      setEntries(null)
      return
    }
    let current = true
    // Quietly: a search failing as the user types is no news to show them.
    rpc.call('browserHistory.search', { query, agents, order, limit }).then((found) => current && setEntries(found), () => {})
    return () => {
      current = false
    }
  }, [supported, rpc, version, query, agents, order, limit, wanted])
  return entries
}

async function openInNewTab(url: string): Promise<void> {
  const opened = await perform((rpc) => rpc.call('browser.newTab', { url }))
  if (opened) focusBrowserTab(opened.id)
}

function forget({ url, conversationId }: BrowserHistoryEntry): void {
  void perform((rpc) => rpc.call('browserHistory.delete', { url, conversationId }))
}

const keyOf = (entry: BrowserHistoryEntry) => `${entry.conversationId ?? ''} ${entry.url}`

// The site's own icon, as browsers find it when a page names none; a letter in one of the
// graph colours, the same for a site each time, where it has none or it does not load, and a
// globe for an address with no name to take a letter from.
function SiteIcon({ url }: { url: string }) {
  const site = siteOf(url)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [site?.origin])
  if (site && !failed) return <img className="browser-site-icon" src={`${site.origin}/favicon.ico`} alt="" onError={() => setFailed(true)} />
  const host = site?.host ?? url
  if (!/^\p{L}/u.test(host)) return <span className="browser-site-icon" data-globe><GlobeIcon /></span>
  let hash = 0
  for (const char of host) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return <span className="browser-site-icon" data-letter data-graph={(hash % SITE_COLOURS) + 1}>{(host[0] ?? '?').toUpperCase()}</span>
}

function Opener({ conversationId }: { conversationId: string | null }) {
  const opener = useConversationNames()(conversationId)
  return opener ? <span className="browser-tab-owner">{opener}</span> : null
}

// The pages visited most, as cards, for the panel with no tab open: one opens in a new tab of the
// user's own. A search narrows them, most visited still first.
export function FrequentPages() {
  const [query, setQuery] = useState('')
  const [clearing, setClearing] = useState(false)
  const agents = usePreferences((s) => s.browserHistoryAgents)
  const entries = useBrowserHistory(query.trim(), FREQUENT, true, 'frequent')
  // Nothing to show before anything was visited, nor from a core that keeps no history; the
  // switch stays once on, as the agents' pages may be all there is.
  if (entries === null || (entries.length === 0 && !query.trim() && !agents)) return null
  return (
    <section className="browser-history" aria-label={t('BrowserHistory.frequentPages')}>
      <div className="browser-history-header">
        <strong>{t('BrowserHistory.frequentPages')}</strong>
        <label className="browser-history-agents">
          <input type="checkbox" checked={agents} onChange={(event) => setPreference('browserHistoryAgents', event.target.checked)} />
          {t('BrowserHistory.includeAgents')}
        </label>
        {clearing ? (
          <span>
            <button type="button" className="link-button browser-history-confirm" onClick={() => { setClearing(false); void perform((rpc) => rpc.call('browserHistory.clear', {})) }}>{t('BrowserHistory.confirmClear')}</button>
            <button type="button" className="link-button" onClick={() => setClearing(false)}>{t('BrowserHistory.cancel')}</button>
          </span>
        ) : (
          <button type="button" className="link-button" onClick={() => setClearing(true)}>{t('BrowserHistory.clearHistory')}</button>
        )}
      </div>
      <input
        className="input browser-history-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && entries[0]) {
            event.preventDefault()
            void openInNewTab(entries[0].url)
          }
        }}
        placeholder={t('BrowserHistory.searchHistory')}
        aria-label={t('BrowserHistory.searchHistory')}
      />
      {entries.length > 0 ? (
        <ul className="browser-site-grid">
          {entries.map((entry) => {
            const title = entry.title || hostOf(entry.url)
            return (
              <li key={keyOf(entry)} className="browser-site">
                <button type="button" className="browser-site-card" title={entry.url} onClick={() => void openInNewTab(entry.url)}>
                  <span className="browser-site-head">
                    <SiteIcon url={entry.url} />
                    <span className="browser-site-host">{hostOf(entry.url)}</span>
                  </span>
                  <span className="browser-site-title">{title}</span>
                  <span className="browser-site-foot">
                    <Opener conversationId={entry.conversationId} />
                    <span>{t('BrowserHistory.visits', { count: entry.visits })} · {agoText(entry.visitedAt)}</span>
                  </span>
                </button>
                <button type="button" className="icon-button browser-site-forget" aria-label={t('BrowserHistory.deleteEntry', { title })} title={t('BrowserHistory.deleteEntry', { title })} onClick={() => forget(entry)}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="menu-note">{query.trim() ? t('BrowserHistory.noMatchingPages') : t('BrowserHistory.noPagesYet')}</p>
      )}
    </section>
  )
}

// Pages from the history that match what is typed in the address bar, under it. The page's view
// is taken down while they show, as nothing drawn here can cover it.
export function AddressSuggestions({ entries, picked, onPick }: { entries: BrowserHistoryEntry[]; picked: number; onPick: (entry: BrowserHistoryEntry) => void }) {
  useOccludesBrowser()
  return (
    <ul className="menu menu-list browser-suggestions" role="listbox" aria-label={t('BrowserHistory.suggestions')}>
      {entries.map((entry, index) => (
        <li key={keyOf(entry)} role="option" aria-selected={index === picked}>
          <button
            type="button"
            tabIndex={-1}
            className="menu-item browser-history-item"
            data-picked={index === picked ? '' : undefined}
            // Before the address bar blurs, which would close the list under the click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(entry)}
          >
            <SiteIcon url={entry.url} />
            <span className="browser-bookmark-text">
              <span className="menu-item-title"><Opener conversationId={entry.conversationId} />{entry.title || hostOf(entry.url)}</span>
              <span className="browser-bookmark-where">{entry.url}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
