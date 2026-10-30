import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { BrowserConsole, BrowserNetworkDetail, BrowserTab } from '@antumi/protocol'
import { useOccludesBrowser } from '../browser-occlusion'
import { sendBrowserContextToComposer } from '../browser-context'
import { useCore } from '../core-store'
import { t } from '../i18n'
import { CloseIcon, RefreshIcon } from './icons'

const BODY_NOTES = { unavailable: 'BrowserActions.bodyUnavailable', binary: 'BrowserActions.bodyBinary', large: 'BrowserActions.bodyLarge', pending: 'BrowserActions.bodyPending', truncated: 'BrowserActions.bodyTruncated' } as const

export function BrowserDiagnostics({ tab, onClose }: { tab: BrowserTab; onClose(): void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [view, setView] = useState<'network' | 'console'>('network')
  const [data, setData] = useState<BrowserConsole | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<BrowserNetworkDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailVersion, setDetailVersion] = useState(0)
  const fetching = useRef(false)
  const alive = useRef(true)
  const refresh = useCallback(async () => {
    const rpc = useCore.getState().rpc
    if (!rpc || fetching.current) return
    fetching.current = true
    try {
      const next = await rpc.call('browser.userConsole', { tabId: tab.id })
      if (alive.current) { setData(next); setError(null) }
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { fetching.current = false }
  }, [tab.id])
  useEffect(() => {
    alive.current = true
    dialog.current?.showModal()
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => { alive.current = false; clearInterval(timer); dialog.current?.close() }
  }, [refresh])
  useEffect(() => {
    setDetail(null)
    setLoading(false)
    if (!selected) return
    const rpc = useCore.getState().rpc
    if (!rpc) return
    let current = true
    setLoading(true)
    void rpc.call('browser.userConsole', { tabId: tab.id, requestId: selected }).then(
      (value) => { if (current) { setDetail(value.request ?? null); setError(null) } },
      (error: unknown) => { if (current) setError(error instanceof Error ? error.message : String(error)) }
    ).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [selected, tab.id, detailVersion])
  const request = data?.network?.find((request) => request.id === selected)
  const consoleText = [...(data?.errors ?? []).map((text) => `[error] ${text}`), ...(data?.messages ?? []).map((entry) => `[${entry.level}] ${entry.text}`), ...(data?.failedRequests ?? []).map((entry) => `${entry.method} ${entry.url} — ${entry.failure}`)].join('\n')
  const send = async () => {
    const text = view === 'console' ? consoleText.slice(-16000) : request && detail ? `${request.method} ${request.url}\nHTTP ${request.status ?? '—'} ${request.statusText}\n\n${JSON.stringify(detail, null, 2).slice(0, 24000)}` : ''
    if (!text) return
    if (await sendBrowserContextToComposer(tab, `${t(view === 'console' ? 'BrowserActions.console' : 'BrowserActions.network')} · ${tab.title}\n${tab.url}\n\n${text}`)) {
      dialog.current?.close()
      onClose()
    }
  }
  return <dialog ref={dialog} className="modal browser-diagnostics-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal-body">
      <header className="modal-header"><h2 id={titleId}>{t('BrowserActions.diagnostics')}</h2><button type="button" className="icon-button" aria-label={t('BackdropPicker.close')} onClick={onClose}><CloseIcon /></button></header>
      <p className="browser-diagnostics-page muted">{tab.title || tab.url}</p>
      <div className="browser-diagnostics-toolbar">
        <div className="browser-diagnostics-tabs" role="group" aria-label={t('BrowserActions.diagnostics')}><button type="button" className="button ghost" aria-pressed={view === 'network'} onClick={() => setView('network')}>{t('BrowserActions.network')} · {data?.network?.length ?? 0}</button><button type="button" className="button ghost" aria-pressed={view === 'console'} onClick={() => setView('console')}>{t('BrowserActions.console')} · {(data?.messages.length ?? 0) + (data?.errors.length ?? 0)}</button></div>
        <button type="button" className="tool-button" aria-label={t('BrowserPanel.reload')} data-tooltip={t('BrowserPanel.reload')} onClick={() => { void refresh(); setDetailVersion((value) => value + 1) }}><RefreshIcon /></button>
      </div>
      {error && <p className="modal-error" role="alert">{error}</p>}
      {view === 'network' ? <div className="browser-network-content">
        <div className="browser-network-list">
          {data?.network?.length ? <table><thead><tr><th>{t('BrowserActions.status')}</th><th>{t('BrowserActions.method')}</th><th>URL</th><th>{t('BrowserActions.duration')}</th></tr></thead><tbody>{[...data.network].reverse().map((item) => <tr key={item.id} data-selected={selected === item.id || undefined} data-failed={(item.status ?? 0) >= 400 || Boolean(item.failure) || undefined}><td>{item.status ?? (item.failure ? '×' : '…')}</td><td>{item.method}</td><td><button type="button" className="browser-network-url" title={item.url} onClick={() => setSelected(item.id)}>{item.url}</button></td><td>{item.durationMs === null ? '—' : `${item.durationMs} ms`}</td></tr>)}</tbody></table> : <p className="menu-note">{t('BrowserActions.noNetwork')}</p>}
        </div>
        <section className="browser-network-detail" aria-label={t('BrowserActions.requestDetails')}>
          {!selected ? <p className="menu-note">{t('BrowserActions.chooseRequest')}</p> : loading ? <p className="menu-note">{t('BrowserActions.loadingDetails')}</p> : detail && <>
            <h3>{t('BrowserActions.requestHeaders')}</h3><pre>{JSON.stringify(detail.requestHeaders, null, 2)}</pre>
            {detail.requestBody && <><h3>{t('BrowserActions.requestBody')}</h3><pre>{detail.requestBody}</pre></>}
            <h3>{t('BrowserActions.responseHeaders')}</h3><pre>{JSON.stringify(detail.responseHeaders, null, 2)}</pre>
            <h3>{t('BrowserActions.responseBody')}</h3><pre>{detail.responseBody ?? '—'}</pre>
            {detail.bodyNote && <p className="menu-note">{t(BODY_NOTES[detail.bodyNote])}</p>}
          </>}
        </section>
      </div> : <pre className="browser-console-output">{consoleText || t('BrowserActions.noConsole')}</pre>}
      <footer className="browser-dialog-actions"><span className="muted">{t('BrowserActions.diagnosticsHint')}</span><button type="button" className="button primary" disabled={view === 'console' ? !consoleText : !detail || !request || loading} onClick={send}>{t('BrowserActions.sendToChat')}</button></footer>
    </div>
  </dialog>
}
