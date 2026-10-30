import { localized, t, tr } from '../i18n'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BrowserTab, BrowserViewport } from '@antumi/protocol'
import { ALL_TABS, openUserBrowserTab, selectBrowserTab, useBrowserTabs, useConversationNames, useWatchAllBrowser } from '../browser-state'
import { perform, useCore } from '../core-store'
import { canShowNativeBrowser, onBrowserFocused, reportBrowserBounds, showNativeBrowserTab } from '../desktop-bridge'
import { BookmarksButton, BookmarkStar } from './BrowserBookmarks'
import { ChatPicker } from './ChatPicker'
import { ArrowLeftIcon, ArrowRightIcon, CameraIcon, CloseIcon, GlobeIcon, PlusIcon, RefreshIcon } from './icons'
import { Spinner } from './Spinner'
import { BrowserCaptureButton, BrowserDeveloperButton, BrowserShareButton } from './BrowserActions'
import { BrowserDownloadsButton, useBrowserDownloads } from './BrowserDownloads'
import { ADDRESS_SUGGESTIONS, AddressSuggestions, FrequentPages, useBrowserHistory } from './BrowserHistory'

// The hostname a tab shows in its strip, or what it has while it has no page.
function tabName(tab: BrowserTab): string {
  if (tab.title) return tab.title
  if (!tab.url || tab.url === 'about:blank') return t('BrowserPanel.newTab')
  try {
    return new URL(tab.url).hostname || tab.url
  } catch {
    return tab.url
  }
}

// The tabs as pills in the panel's top bar, the one shown filled in, each with its close, and a
// plus for a tab of the user's own after them. The pills share the width and shrink as tabs come,
// so the plus stays in reach however many there are.
export function BrowserTabStrip() {
  const ownerName = useConversationNames()
  const { tabs, selectedId } = useBrowserTabs((s) => s[ALL_TABS]) ?? { tabs: [], selectedId: null }
  const strip = useRef<HTMLDivElement>(null)
  // The shown tab is scrolled into the strip when there are more than fit.
  useEffect(() => {
    if (!selectedId) return
    strip.current?.querySelector<HTMLElement>(`[data-tab-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId, tabs.length])
  return (
    <div className="browser-tab-strip">
    <div className="browser-tabs" role="tablist" aria-label={t('chatTools.tabs')} ref={strip}>
      {tabs.map((each) => (
        <div key={each.id} className="browser-tab" data-tab-id={each.id} data-active={each.id === selectedId || undefined} data-loading={each.loading || undefined}>
          <button type="button" role="tab" aria-selected={each.id === selectedId} title={each.url} onClick={() => selectBrowserTab(ALL_TABS, each.id)}>
            <span className="browser-tab-icon" aria-hidden="true"><GlobeIcon /></span>
            {ownerName(each.conversationId) && <span className="browser-tab-owner">{ownerName(each.conversationId)}</span>}
            <span className="browser-tab-name">{tabName(each)}</span>
          </button>
          <button type="button" className="browser-tab-close" aria-label={t('BrowserPanel.closeTab', { value1: tabName(each) })} onClick={() => void perform((rpc) => rpc.call('browser.closeTab', { tabId: each.id }))}>
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
    <button type="button" className="tool-button browser-tab-add" aria-label={t('BrowserPanel.newTab')} data-tooltip={t('BrowserPanel.newTab')} onClick={() => void openUserBrowserTab()}><PlusIcon /></button>
    </div>
  )
}

// What is happening on the tab, in a word, for the line under the page.
function tabState(tab: BrowserTab, focused: boolean): string {
  if (tab.debugging) return t('BrowserActions.debugging')
  if (tab.userDriving) return t('BrowserPanel.youAreInControl')
  if (tab.agentActing) return t('BrowserPanel.agentIsInControl')
  if (tab.loading) return t('BrowserPanel.loadingPage')
  return focused ? t('BrowserPanel.keyboardInputGoesToThePage') : t('BrowserPanel.watching')
}

// The sizes a page can be held at from the panel, besides following it. A size the agent chose
// that is none of these is offered as it is.
const PRESETS: ReadonlyArray<{ label: string; viewport: BrowserViewport }> = localized(() => ([
  { label: t('BrowserPanel.phone390844'), viewport: { width: 390, height: 844 } },
  { label: t('BrowserPanel.tablet7681024'), viewport: { width: 768, height: 1024 } },
  { label: t('BrowserPanel.desktop1280800'), viewport: { width: 1280, height: 800 } },
  { label: t('BrowserPanel.wide19201080'), viewport: { width: 1920, height: 1080 } }
]))
const FOLLOW = 'panel'
const keyOf = (viewport: BrowserViewport | null) => (viewport ? `${viewport.width}x${viewport.height}` : FOLLOW)

function ViewportPicker({ tab }: { tab: BrowserTab }) {
  const current = keyOf(tab.viewport)
  const options = [
    { value: FOLLOW, label: t('BrowserPanel.matchPanel'), description: t('BrowserPanel.pageMatchesPanelSize') },
    ...PRESETS.map((preset) => ({ value: keyOf(preset.viewport), label: preset.label })),
    ...(tab.viewport && !PRESETS.some((preset) => keyOf(preset.viewport) === current) ? [{ value: current, label: `${tab.viewport.width}×${tab.viewport.height}`, description: t('BrowserPanel.setByAgent') }] : [])
  ]
  const choose = (value: string) => {
    const match = /^(\d+)x(\d+)$/.exec(value)
    const viewport = match ? { width: Number(match[1]), height: Number(match[2]) } : null
    void perform((rpc) => rpc.call('browser.userViewport', { tabId: tab.id, viewport }))
  }
  return <ChatPicker label={t('BrowserPanel.pageSize')} value={current} placeholder={t('BrowserPanel.matchPanel')} options={options} onChange={choose} align="end" placement="below" disabled={tab.debugging} />
}

// How long the per-frame watch keeps measuring after the rectangle last moved, so a drag or a
// slide stays glued across the frames where nothing happens to change.
const SETTLE_MS = 400
// What can move the stage without resizing it: a drag on a separator, a scroll, a panel sliding,
// and (watched apart, below) any change to the page's elements. Each only wakes the watch; what
// actually moved is read off the rectangle.
const WAKE_EVENTS = ['resize', 'scroll', 'pointerdown', 'pointerup', 'transitionstart', 'transitionend', 'animationstart', 'animationend'] as const

// Where the page goes: the tab's native view, placed by main over this rectangle and kept there
// as the panel moves. The events that move it (a separator dragged, the sidebar folding, the panel
// sliding in) are too many to place by hand, so each only starts a per-frame watch that follows the
// rectangle until it settles and then stops: standing still costs no frames, which matters because
// a panel left open otherwise holds the compositor awake for as long as it is on screen. Only a
// change is reported. A tab held at a size stands centred here, framed, as main places it.
function NativeStage({ tab }: { tab: BrowserTab }) {
  const stage = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null)
  const held = tab.viewport
  useLayoutEffect(() => {
    const element = stage.current
    if (!element || !canShowNativeBrowser()) return
    showNativeBrowserTab(tab.id)
    let last = ''
    let handle = 0
    let until = 0
    const measure = () => {
      const rect = element.getBoundingClientRect()
      const key = `${rect.x},${rect.y},${rect.width},${rect.height}`
      if (key === last) return false
      last = key
      reportBrowserBounds(rect)
      if (held) {
        const scale = Math.min(1, rect.width / held.width, rect.height / held.height)
        setFrame({ width: Math.round(held.width * scale), height: Math.round(held.height * scale) })
      }
      return true
    }
    const tick = () => {
      if (measure()) until = performance.now() + SETTLE_MS
      handle = performance.now() < until ? requestAnimationFrame(tick) : 0
    }
    const wake = () => {
      until = performance.now() + SETTLE_MS
      if (!handle) handle = requestAnimationFrame(tick)
    }
    measure()
    const observer = new ResizeObserver(wake)
    observer.observe(element)
    observer.observe(document.documentElement)
    // A panel shown beside the stage by a key, with no transition, moves it without resizing it.
    const changes = new MutationObserver(wake)
    changes.observe(document.body, { subtree: true, childList: true, attributes: true })
    for (const name of WAKE_EVENTS) window.addEventListener(name, wake, { capture: true, passive: true })
    return () => {
      if (handle) cancelAnimationFrame(handle)
      observer.disconnect()
      changes.disconnect()
      for (const name of WAKE_EVENTS) window.removeEventListener(name, wake, { capture: true })
      showNativeBrowserTab(null)
    }
  }, [tab.id, held])
  return (
    <div ref={stage} className="browser-stage" data-held={held ? '' : undefined}>
      {!canShowNativeBrowser() && <span className="browser-stage-note">{t('BrowserPanel.pagesAreDisplayedInTheAntumiApp')}</span>}
      {held && frame && <div className="browser-stage-frame" style={{ width: frame.width, height: frame.height }} />}
    </div>
  )
}

// Every tab there is, the agents' and the user's own: the one chosen shown with the address and
// the usual buttons, and a word on who is driving. The strip of tabs is the panel's top bar.
export function BrowserPanel() {
  const status = useCore((s) => s.browser)
  const collaboration = useCore((state) => state.rpc?.features.includes('browser-collaboration') ?? false)
  const { tabs, selectedId } = useWatchAllBrowser()
  const downloads = useBrowserDownloads()
  const tab = tabs.find((each) => each.id === selectedId) ?? null
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const [focusedTab, setFocusedTab] = useState<string | null>(null)
  useEffect(() => {
    if (!editing) setAddress(tab?.url ?? '')
  }, [tab?.url, editing])
  useEffect(() => onBrowserFocused((tabId, focused) => setFocusedTab((was) => (focused ? tabId : was === tabId ? null : was))), [])
  // What is typed, once it differs from the page, is looked up in the history; Esc puts the list away until the next keystroke.
  const [picked, setPicked] = useState(-1)
  const [dismissed, setDismissed] = useState(false)
  const typed = editing && !dismissed && address.trim() !== '' && address !== tab?.url
  const suggestions = useBrowserHistory(address.trim(), ADDRESS_SUGGESTIONS, typed) ?? []
  const suggesting = typed && suggestions.length > 0

  const navigate = (url: string) => {
    if (!tab) return
    setEditing(false)
    setAddress(url)
    void perform((rpc) => rpc.call('browser.userNavigate', { tabId: tab.id, to: { url } }))
  }
  const go = (event: FormEvent) => {
    event.preventDefault()
    const chosen = suggesting ? suggestions[picked] : undefined
    if (chosen) navigate(chosen.url)
    else if (address.trim()) navigate(address.trim())
  }
  const suggestionKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggesting) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setPicked((was) => Math.max(-1, Math.min(suggestions.length - 1, was + step)))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDismissed(true)
    }
  }
  const history = (step: 'back' | 'forward' | 'reload') => {
    if (tab) void perform((rpc) => rpc.call('browser.userNavigate', { tabId: tab.id, to: { history: step } }))
  }

  if (status && status.state !== 'ready' && tabs.length === 0) {
    return (
      <div className="browser-empty">
        {status.state === 'app-closed' && <p>{status.message ?? t('BrowserPanel.theBrowserRunsInTheAntumiAppCore')}</p>}
        {status.state === 'starting' && <p>{tr('BrowserPanel.isConnectingToTheBrowser', { value1: <Spinner label={t('BrowserPanel.connecting')} /> })}</p>}
        {status.state === 'error' && <p className="browser-error">{tr('BrowserPanel.browserError', { value1: status.message ?? t('BrowserPanel.unknownError') })}</p>}
      </div>
    )
  }
  const focused = tab !== null && focusedTab === tab.id
  return (
    <div className="browser-panel">
      {tab ? (
        <>
          <form className="browser-address" onSubmit={go}>
            <button type="button" className="tool-button" disabled={tab.debugging} aria-label={t('BrowserPanel.back')} data-tooltip={t('BrowserPanel.back')} onClick={() => history('back')}><ArrowLeftIcon /></button>
            <button type="button" className="tool-button" disabled={tab.debugging} aria-label={t('BrowserPanel.forward')} data-tooltip={t('BrowserPanel.forward')} onClick={() => history('forward')}><ArrowRightIcon /></button>
            <button type="button" className="tool-button" disabled={tab.debugging} aria-label={t('BrowserPanel.reload')} data-tooltip={t('BrowserPanel.reload')} onClick={() => history('reload')}><RefreshIcon /></button>
            <div className="browser-url-field">
              <input
                className="input browser-url mono"
                disabled={tab.debugging}
                value={address}
                aria-label={t('BrowserPanel.address')}
                aria-autocomplete="list"
                aria-expanded={suggesting}
                spellCheck={false}
                // Selected whole on focus, as a browser's own address bar is: typing replaces it.
                onFocus={(event) => {
                  setEditing(true)
                  event.currentTarget.select()
                }}
                onBlur={() => setEditing(false)}
                onKeyDown={suggestionKeys}
                onChange={(event) => {
                  setDismissed(false)
                  setPicked(-1)
                  setAddress(event.target.value)
                }}
              />
              {suggesting && <AddressSuggestions entries={suggestions} picked={picked} onPick={(entry) => navigate(entry.url)} />}
            </div>
            <BookmarkStar tab={tab} />
            <BookmarksButton tab={tab} />
            <BrowserDownloadsButton downloads={downloads} />
            <div className="browser-page-actions">
            <ViewportPicker tab={tab} />
            {collaboration ? <><BrowserCaptureButton key={`capture:${tab.id}`} tab={tab} /><BrowserShareButton key={`share:${tab.id}`} tab={tab} /><BrowserDeveloperButton key={`developer:${tab.id}`} tab={tab} /></> : <button
              type="button"
              className="tool-button"
              aria-label={t('BrowserPanel.attachScreenshotToChat')}
              data-tooltip={t('BrowserPanel.saveScreenshotAsImage')}
              onClick={() => void perform((rpc) => rpc.call('browser.userScreenshot', { tabId: tab.id }))}
            >
              <CameraIcon />
            </button>}
            </div>
          </form>
          <NativeStage key={tab.id} tab={tab} />
          <div className="browser-status">
            <span>{tabState(tab, focused)}</span>
            {tab.userDriving && (
              <button type="button" className="link-button" onClick={() => void perform((rpc) => rpc.call('browser.handBack', { tabId: tab.id }))}>{t('BrowserPanel.returnControlToAgent')}</button>
            )}
            <span className="chat-dock-spacer" />
            {focused && <span className="muted">{t('BrowserPanel.escToReturnToAppShiftEscTo')}</span>}
          </div>
        </>
      ) : (
        <div className="browser-empty">
          {/* Downloads outlive the tabs that made them, so the list stays reachable, but only once there is one. */}
          {downloads.length > 0 && <div className="browser-empty-actions"><BrowserDownloadsButton downloads={downloads} /></div>}
          <p>{t('BrowserPanel.noTabsOpenYet')}</p>
          <button type="button" className="button" onClick={() => void openUserBrowserTab()}>{t('BrowserPanel.newTab')}</button>
          <FrequentPages />
        </div>
      )}
    </div>
  )
}
