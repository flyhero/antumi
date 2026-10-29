import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserCaptureMode, BrowserTab } from '@antumi/protocol'
import { browserContextText, browserConversationChoices, browserConversationTarget, sendBrowserContextToComposer } from '../browser-context'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { CheckIcon, CodeIcon, LinkIcon, QuoteIcon } from './icons'
import { Popover } from './Popover'
import { Spinner } from './Spinner'
import { BrowserDiagnostics } from './BrowserDiagnostics'
import './browser-actions.css'

export function BrowserCaptureButton({ tab }: { tab: BrowserTab }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<BrowserCaptureMode | null>(null)
  const [done, setDone] = useState(false)
  const active = useRef(false)
  const close = useCallback(() => setOpen(false), [])
  const cancel = useCallback(() => { void perform((rpc) => rpc.call('browser.cancelCapture', { tabId: tab.id })) }, [tab.id])
  useEffect(() => {
    if (!busy) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [busy, cancel])
  useEffect(() => () => { if (active.current) cancel() }, [cancel])
  useEffect(() => { if (done) { const timer = setTimeout(() => setDone(false), 1800); return () => clearTimeout(timer) } }, [done])
  const capture = async (mode: BrowserCaptureMode) => {
    close(); setBusy(mode); active.current = true
    const swatch = document.createElement('span')
    swatch.style.color = 'var(--accent)'; document.body.append(swatch)
    const accent = getComputedStyle(swatch).color; swatch.remove()
    try {
      const context = await perform((rpc) => rpc.call('browser.capture', { tabId: tab.id, mode, accent }))
      if (!context) { if (mode === 'selection') useCore.setState({ error: t('BrowserActions.noSelection') }); return }
      setDone(sendBrowserContextToComposer(tab, browserContextText(context, tab.id), context.image ? [context.image] : []))
    } finally { active.current = false; setBusy(null) }
  }
  return <>
    <span className="menu-anchor">
      <button type="button" className="tool-button" disabled={Boolean(busy) || tab.agentActing || tab.debugging} aria-label={t('BrowserActions.sendToChat')} data-tooltip={done ? t('BrowserActions.added') : t('BrowserActions.sendToChat')} aria-haspopup="dialog" aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen(!open)}>{done ? <CheckIcon /> : busy ? <Spinner label={t('BrowserActions.capturing')} /> : <QuoteIcon />}</button>
      {open && <Popover label={t('BrowserActions.sendToChat')} onClose={close} align="end">
        <div className="menu-label">{t('BrowserActions.addContextHint')}</div>
        <button type="button" className="menu-item" onClick={() => void capture('page')}>{t('BrowserActions.capturePage')}</button>
        <button type="button" className="menu-item" onClick={() => void capture('region')}>{t('BrowserActions.captureRegion')}</button>
        <button type="button" className="menu-item" onClick={() => void capture('selection')}>{t('BrowserActions.captureSelection')}</button>
        <button type="button" className="menu-item" onClick={() => void capture('element')}>{t('BrowserActions.captureElement')}</button>
      </Popover>}
      {done && <span className="visually-hidden" role="status">{t('BrowserActions.added')}</span>}
    </span>
    {(busy === 'element' || busy === 'region') && <div className="browser-capture-status" role="status"><span>{t(busy === 'element' ? 'BrowserActions.pickElementHint' : 'BrowserActions.pickRegionHint')}</span><button type="button" className="button ghost" onClick={cancel}>{t('ChatCommandSettings.cancel')}</button></div>}
  </>
}

export function BrowserShareButton({ tab }: { tab: BrowserTab }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const conversations = useCore((state) => state.conversations)
  const tasks = useCore((state) => state.tasks)
  const current = useCore((state) => browserConversationTarget(state, tab))
  const [target, setTarget] = useState(current ?? '')
  const [busy, setBusy] = useState(false)
  if (!tab.userOwned) return null
  const shared = tab.conversationId !== null
  const change = async (id: string | null) => {
    setBusy(true)
    const changed = await perform((rpc) => rpc.call('browser.shareTab', { tabId: tab.id, conversationId: id }))
    setBusy(false)
    if (changed) close()
  }
  return <span className="menu-anchor">
    <button type="button" className="tool-button browser-share-button" data-shared={shared || undefined} aria-pressed={shared} aria-label={t(shared ? 'BrowserActions.shared' : 'BrowserActions.share')} data-tooltip={shared ? t('BrowserActions.sharedWith', { name: conversations[tab.conversationId ?? '']?.title ?? t('BrowserPanel.conversation') }) : t('BrowserActions.share')} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setTarget(current ?? ''); setOpen(!open) }}><LinkIcon /></button>
    {open && <Popover label={t('BrowserActions.share')} onClose={close} align="end">
      <div className="browser-share-menu">
        <p className="menu-note">{t('BrowserActions.shareHint')}</p>
        <label className="squad-field">{t('BrowserPanel.conversation')}<select className="input" value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>
          <option value="">{t('BrowserActions.chooseConversation')}</option>
          {browserConversationChoices({ ...useCore.getState(), conversations, tasks }).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <div className="browser-dialog-actions">
          {shared && <button type="button" className="button" disabled={busy || tab.agentActing} onClick={() => void change(null)}>{t('BrowserActions.stopSharing')}</button>}
          <button type="button" className="button primary" disabled={!target || busy || tab.agentActing || target === tab.conversationId} onClick={() => void change(target)}>{t('BrowserActions.shareConfirm')}</button>
        </div>
      </div>
    </Popover>}
  </span>
}

export function BrowserDeveloperButton({ tab }: { tab: BrowserTab }) {
  const [open, setOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return <span className="menu-anchor">
    <button type="button" className="tool-button" aria-label={t('BrowserActions.developerTools')} data-tooltip={t('BrowserActions.developerTools')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><CodeIcon /></button>
    {open && <Popover label={t('BrowserActions.developerTools')} onClose={close} align="end">
      <button type="button" className="menu-item" onClick={() => { close(); setDiagnostics(true) }}>{t('BrowserActions.diagnostics')}</button>
      <button type="button" className="menu-item" disabled={tab.agentActing} onClick={() => { close(); void perform((rpc) => rpc.call('browser.devtools', { tabId: tab.id })) }}>{t(tab.debugging ? 'BrowserActions.closeDevtools' : 'BrowserActions.openDevtools')}</button>
    </Popover>}
    {diagnostics && <BrowserDiagnostics tab={tab} onClose={() => setDiagnostics(false)} />}
  </span>
}
