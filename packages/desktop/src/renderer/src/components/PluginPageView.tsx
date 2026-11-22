import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_PLUGIN_PAGE_PARAMS, PLUGIN_PAGE_SCHEME, PluginPageFrameMessage, pluginPageState, type PluginPageHostMessage } from '@antumi/protocol'
import { leavePluginPage, useCore } from '../core-store'
import { getLocale, t, useLocale } from '../i18n'
import { usePreferences } from '../preferences'
import { useChatTypeface } from '../chat-typeface'
import { findPluginPage, pluginPageLabel, pluginPageStateKey, type PluginPageRef } from '../plugin-pages'
import { pluginPageFiles } from '../plugin-page-files'
import { snapshotPluginPageTheme } from '../plugin-page-theme'
import { openWebPage } from '../browser-state'
import { runShortcutChord } from '../panel-shortcuts'
import './plugin-page.css'

// The frame's script alone decides how often it asks: a page gone wrong must not open a tab or
// run a shortcut on every message. Human clicks and key presses are never this close together.
const OPEN_SPACING_MS = 300
const KEY_SPACING_MS = 150
// A call a hidden page makes waits until it is shown, but not past the SDK's own 60 s timeout:
// sent after the page gave up on it, a write would land with nobody told.
const HOLD_MS = 50_000

function webAddress(url: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(url).protocol) } catch { return false }
}

function restored(key: string): unknown {
  try { return pluginPageState(JSON.parse(localStorage.getItem(key) ?? 'null')) } catch { return null }
}

type Outgoing<M = PluginPageHostMessage> = M extends unknown ? Omit<M, 'antumiPluginPage'> : never
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 2000)
// The largest message a page may send: a call's params, with room for the rest of it.
const MAX_FRAME_MESSAGE = MAX_PLUGIN_PAGE_PARAMS + 1024

// A hidden page (one left, kept loaded) is told so, and may neither open a link, run a shortcut,
// leave nor reach its backend until it is shown again.
export function PluginPageView({ plugin, page, visible = true }: PluginPageRef & { visible?: boolean }) {
  const rpc = useCore((s) => s.rpc)
  const version = useCore((s) => findPluginPage(s.plugins, { plugin, page })?.version ?? null)
  const info = useCore((s) => findPluginPage(s.plugins, { plugin, page })?.info ?? null)
  const locale = useLocale((s) => s.locale)
  const label = info ? pluginPageLabel(info, locale) : page
  const typeface = useChatTypeface()
  const width = usePreferences((s) => s.chatWidth)
  const reading = usePreferences((s) => `${s.chatFont}\0${s.chatFontFamily}\0${s.chatCjkFontFamily}\0${s.chatFontSize}`)
  const container = useRef<HTMLElement>(null)
  const typefaceProbe = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const sendTheme = useRef<(() => void) | null>(null)
  const shown = useRef(visible)
  shown.current = visible
  const sendVisibility = useRef<(() => void) | null>(null)
  const [generation, setGeneration] = useState(0)
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Fresh for every frame: what the frame says is believed only with it.
  const token = useMemo(() => crypto.randomUUID(), [plugin, page, version, generation])
  const supported = Boolean(window.antumi?.pluginPageCreate)

  useEffect(() => {
    if (!rpc || !version || !supported) return
    const ref = { plugin, page }
    const stateKey = pluginPageStateKey(ref)
    let canceled = false
    let ready = false
    let pageUrl: string | null = null
    let opened = 0
    let keyed = 0
    setSrc(null); setError(null)
    void pluginPageFiles(rpc, ref, version).then(async (files) => {
      if (canceled) return
      const url = await window.antumi?.pluginPageCreate?.(files)
      if (typeof url !== 'string' || !url.startsWith(`${PLUGIN_PAGE_SCHEME}://`)) throw new Error('Plugin page host unavailable')
      if (canceled) { void window.antumi?.pluginPageRemove?.(url); return }
      pageUrl = url
      setSrc(url)
    }).catch((failure: unknown) => { if (!canceled) setError(reason(failure)) })

    const post = (message: Outgoing) => frame.current?.contentWindow?.postMessage({ antumiPluginPage: token, ...message }, '*')
    const theme = () => container.current && typefaceProbe.current ? snapshotPluginPageTheme(container.current, typefaceProbe.current) : null
    sendTheme.current = () => {
      const current = ready ? theme() : null
      if (current) post({ kind: 'theme', theme: current })
    }
    type Call = Extract<PluginPageFrameMessage, { kind: 'call' }>
    const held: Array<{ message: Call; at: number }> = []
    const call = (message: Call) => {
      // The page shows its own failures; the app's error toast stays out of it.
      const connection = useCore.getState().rpc
      if (!connection) { post({ kind: 'response', id: message.id, error: t('coreStore.notConnectedToAntumiCore') }); return }
      connection.call('plugins.pageCall', { id: plugin, page, method: message.method, params: message.params }).then(
        (answer) => { if (!canceled) post({ kind: 'response', id: message.id, result: answer.result }) },
        (failure: unknown) => { if (!canceled) post({ kind: 'response', id: message.id, error: reason(failure) }) }
      )
    }
    sendVisibility.current = () => {
      if (ready) post({ kind: 'visibility', visible: shown.current })
      if (!shown.current) return
      const now = Date.now()
      for (const { message, at } of held.splice(0)) {
        if (now - at < HOLD_MS) call(message)
        else post({ kind: 'response', id: message.id, error: t('PluginPage.heldInBackground') })
      }
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow) return
      // Bound what the frame sends before the recursive JSON schemas see it.
      try { if (JSON.stringify(event.data).length > MAX_FRAME_MESSAGE) return } catch { return }
      const parsed = PluginPageFrameMessage.safeParse(event.data)
      if (!parsed.success || parsed.data.antumiPluginPage !== token) return
      const message = parsed.data
      if (message.kind === 'ready') {
        const current = theme()
        if (!current) return
        ready = true
        post({ kind: 'init', theme: current, state: restored(stateKey), locale: getLocale() })
        if (!shown.current) post({ kind: 'visibility', visible: false })
      } else if (message.kind === 'call') {
        if (shown.current) call(message)
        else held.push({ message, at: Date.now() })
      } else if (!shown.current) {
        // Hidden, it is not the page the user is looking at: what it asks of the app waits for nothing.
      } else if (message.kind === 'open') {
        const now = Date.now()
        if (!webAddress(message.url) || now - opened < OPEN_SPACING_MS) return
        opened = now
        void openWebPage(message.url)
      } else if (message.kind === 'state') {
        const state = pluginPageState(message.value)
        if (message.value !== null && state === null) return
        try { localStorage.setItem(stateKey, JSON.stringify(state)) } catch { /* full storage: the page starts afresh next time */ }
      } else if (message.kind === 'key') {
        const now = Date.now()
        if (now - keyed < KEY_SPACING_MS) return
        keyed = now
        runShortcutChord({ key: message.key, code: message.code, metaKey: message.meta, ctrlKey: message.ctrl, altKey: message.alt, shiftKey: message.shift })
      } else if (message.kind === 'leave') {
        leavePluginPage()
      }
    }
    window.addEventListener('message', onMessage)
    const observer = new MutationObserver(() => sendTheme.current?.())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-backdrop', 'style'] })
    const appearance = window.matchMedia('(prefers-color-scheme: dark)')
    const onAppearance = () => sendTheme.current?.()
    appearance.addEventListener('change', onAppearance)
    return () => {
      canceled = true
      sendTheme.current = null
      sendVisibility.current = null
      window.removeEventListener('message', onMessage)
      observer.disconnect()
      appearance.removeEventListener('change', onAppearance)
      if (pageUrl) void window.antumi?.pluginPageRemove?.(pageUrl)
    }
  }, [rpc, plugin, page, version, generation, token, supported])

  // The chat's typeface lives in the preferences, drawn onto the probe: send it once it is.
  useEffect(() => { sendTheme.current?.() }, [reading, width])
  useEffect(() => { sendVisibility.current?.() }, [visible])

  return <section ref={container} className="plugin-page" aria-label={label} hidden={!visible}>
    <div ref={typefaceProbe} className="chat-view plugin-page-typeface" data-width={width} {...typeface} aria-hidden="true" />
    {!supported ? <div className="detail-empty"><div className="detail-empty-body">{t('PluginPage.unavailable')}</div></div>
      : error ? <div className="detail-empty" role="alert"><div className="detail-empty-body">
        <span>{t('PluginPage.failed', { message: error })}</span>
        <button type="button" className="button" onClick={() => setGeneration((n) => n + 1)}>{t('PluginPage.retry')}</button>
      </div></div>
      : !src ? <div className="detail-empty" role="status"><div className="detail-empty-body">{t('PluginPage.loading')}</div></div>
      // A reload is a new frame (key), never a new src: main stops a plugin frame from navigating.
      : <iframe key={token} ref={frame} className="plugin-page-frame" title={label} src={`${src}#${token}`} sandbox="allow-scripts" referrerPolicy="no-referrer" />}
  </section>
}
