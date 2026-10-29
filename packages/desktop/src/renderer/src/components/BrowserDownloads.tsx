import { useCallback, useEffect, useState } from 'react'
import type { BrowserDownload } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { Popover } from './Popover'
import { DownloadIcon } from './icons'
import './browser-downloads.css'

export function useBrowserDownloads(): BrowserDownload[] {
  const rpc = useCore((state) => state.rpc)
  const [downloads, setDownloads] = useState<BrowserDownload[]>([])
  useEffect(() => {
    setDownloads([])
    if (!rpc?.features.includes('browser-file-transfers')) return
    let live = true
    const off = rpc.on('browser.downloadsChanged', ({ downloads }) => { if (live) setDownloads(downloads) })
    void rpc.call('browser.downloads', {}).then((downloads) => { if (live) setDownloads(downloads) }).catch(() => {})
    return () => { live = false; off() }
  }, [rpc])
  return downloads
}

// Exact enough to watch a download move: bytes under a kilobyte, a decimal while the number is small.
export function downloadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const [value, unit] = bytes < 1024 ** 2 ? [bytes / 1024, 'KB'] : bytes < 1024 ** 3 ? [bytes / 1024 ** 2, 'MB'] : [bytes / 1024 ** 3, 'GB']
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`
}

function DownloadRow({ download }: { download: BrowserDownload }) {
  const [busy, setBusy] = useState(false)
  const active = download.finishedAt === null
  const percentage = download.totalBytes > 0 ? Math.min(100, Math.floor(download.receivedBytes / download.totalBytes * 100)) : null
  const action = async (action: 'open' | 'reveal' | 'cancel') => {
    setBusy(true)
    try { await perform((rpc) => rpc.call('browser.downloadAction', { id: download.id, action })) }
    finally { setBusy(false) }
  }
  const state = download.paused ? t('BrowserDownloads.paused') : download.state === 'completed' ? t('BrowserDownloads.completed') : download.state === 'cancelled' ? t('BrowserDownloads.cancelled') : download.state === 'interrupted' ? t('BrowserDownloads.interrupted') : t('BrowserDownloads.downloading')
  return <li className="browser-download-row">
    <div className="browser-download-heading"><span className="browser-download-name" title={download.path || download.filename}>{download.filename}</span><span className="muted">{state}</span></div>
    <div className="browser-download-meta"><span>{downloadSize(download.receivedBytes)}{download.totalBytes > 0 ? ` / ${downloadSize(download.totalBytes)}` : ''}{active && percentage !== null ? ` · ${percentage}%` : ''}</span>
      {active ? <button type="button" className="link-button" disabled={busy} onClick={() => void action('cancel')}>{t('ChatCommandSettings.cancel')}</button>
        : download.state === 'completed' && <><button type="button" className="link-button" disabled={busy} onClick={() => void action('open')}>{t('ChatBrowserCard.open')}</button><button type="button" className="link-button" disabled={busy} onClick={() => void action('reveal')}>{t('BrowserDownloads.reveal')}</button></>}
    </div>
    {active && <progress className="browser-download-progress" aria-label={t('BrowserDownloads.progress', { name: download.filename })} max={download.totalBytes || undefined} value={download.totalBytes > 0 ? download.receivedBytes : undefined} />}
  </li>
}

export function BrowserDownloadsButton({ downloads }: { downloads: BrowserDownload[] }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const supported = useCore((state) => state.rpc?.features.includes('browser-file-transfers'))
  const active = downloads.filter((download) => download.finishedAt === null).length
  if (!supported) return null
  return <span className="menu-anchor">
    <button type="button" className="tool-button browser-downloads-button" aria-label={t('BrowserDownloads.title')} data-tooltip={t('BrowserDownloads.title')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><DownloadIcon />{active > 0 && <span className="browser-download-count">{active}</span>}</button>
    {open && <Popover label={t('BrowserDownloads.title')} onClose={close} align="end"><div className="browser-downloads">
      <div className="browser-downloads-header"><strong>{t('BrowserDownloads.title')}</strong><span className="muted">{t('BrowserDownloads.session')}</span></div>
      {downloads.length ? <ul className="browser-download-list">{downloads.map((download) => <DownloadRow key={download.id} download={download} />)}</ul> : <p className="menu-note">{t('BrowserDownloads.empty')}</p>}
    </div></Popover>}
  </span>
}
