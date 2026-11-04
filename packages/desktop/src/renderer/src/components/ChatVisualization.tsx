import { useEffect, useMemo, useRef, useState } from 'react'
import type { VisualizationReference } from '@antumi/protocol'
import { useCore } from '../core-store'
import { getLocale, t } from '../i18n'
import { askConfirm } from '../confirm-dialog'
import { VisualizationMessage, visualizationState, type VisualizationPanel } from '../visualization-bridge'
import { RefreshIcon } from './icons'
import './chat-visualization.css'

export type VisualizationScope = { conversationId: string; stageId: string }

function restored(key: string): unknown {
  try { return visualizationState(JSON.parse(localStorage.getItem(key) ?? 'null')) } catch { return null }
}

export function ChatVisualization({ scope, reference }: { scope: VisualizationScope; reference: VisualizationReference }) {
  const rpc = useCore((s) => s.rpc)
  const frame = useRef<HTMLIFrameElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [generation, setGeneration] = useState(0)
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [height, setHeight] = useState(280)
  const [panels, setPanels] = useState<VisualizationPanel[]>([])
  const [controls, setControls] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [awake, setAwake] = useState(false)
  const bridge = useMemo(() => crypto.randomUUID(), [scope.conversationId, scope.stageId, reference.path, generation])
  const key = `antumi.visualization:${scope.conversationId}:${scope.stageId}:${reference.path}`
  const supported = Boolean(rpc?.features.includes('inline-visualizations') && window.antumi?.visualizationCreate)
  const title = reference.title ?? reference.path.split(/[\\/]/).at(-1) ?? t('ChatVisualization.title')
  useEffect(() => {
    if (!rpc || !supported || !container.current) return
    let canceled = false
    let pageUrl: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    setSrc(null); setError(null); setPanels([])
    void rpc.call('visualizations.read', { ...scope, path: reference.path }).then(async (file) => {
      if (canceled || !container.current) return
      if (!file) { setError(t('ChatVisualization.unavailable')); return }
      const { visualizationDocument, visualizationTheme } = await import('../visualization-document')
      if (canceled || !container.current) return
      const document = visualizationDocument(file.contents, bridge, visualizationTheme(container.current), restored(key))
      const url = await window.antumi?.visualizationCreate?.(document)
      if (typeof url !== 'string' || !/^antumi-visualization:\/\/document\/[a-f0-9-]+$/.test(url)) throw new Error('Visualization host unavailable')
      if (canceled) { void window.antumi?.visualizationRemove?.(url); return }
      pageUrl = url
      setSrc(url)
      timer = setTimeout(() => { if (!canceled) setError(t('ChatVisualization.timeout')) }, 30_000)
    }).catch(() => { if (!canceled) setError(t('ChatVisualization.unavailable')) })
    const post = (data: object) => frame.current?.contentWindow?.postMessage({ antumiVisualization: bridge, ...data }, '*')
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow) return
      // Bound untrusted state before the recursive JSON schema sees it.
      try { if (JSON.stringify(event.data).length > 32_768) return } catch { return }
      const parsed = VisualizationMessage.safeParse(event.data)
      if (!parsed.success || parsed.data.antumiVisualization !== bridge) return
      const message = parsed.data
      if (message.kind === 'ready') { clearTimeout(timer); return }
      if (message.kind === 'height') { setHeight(Math.max(120, Math.ceil(message.height))); return }
      if (message.kind === 'controls') { setPanels(message.panels); return }
      if (message.kind === 'error') { clearTimeout(timer); setError(t('ChatVisualization.runtimeError')); return }
      if (message.kind === 'display') { setExpanded(message.mode === 'fullscreen'); post({ kind: 'response', id: message.id, result: { mode: message.mode } }); return }
      if (message.kind === 'state') {
        const state = visualizationState(message.state)
        if (message.state !== null && state === null) { post({ kind: 'response', id: message.id, error: 'Invalid visualization state' }); return }
        try {
          localStorage.setItem(key, JSON.stringify(state))
          post({ kind: 'response', id: message.id, result: {} })
        } catch { post({ kind: 'response', id: message.id, error: 'Visualization state could not be saved' }) }
        return
      }
      if (message.kind === 'followup') void (async () => {
        const accepted = await askConfirm({ message: `${t('ChatVisualization.sendPrompt')}\n\n${message.prompt}`, confirm: t('ChatComposer.send') })
        if (canceled) return
        if (!accepted) { post({ kind: 'response', id: message.id, error: 'Follow-up canceled' }); return }
        try {
          await rpc.call('conversations.send', { id: scope.conversationId, text: message.prompt })
          if (!canceled) post({ kind: 'response', id: message.id, result: {} })
        } catch { if (!canceled) post({ kind: 'response', id: message.id, error: 'Follow-up could not be sent' }) }
      })()
    }
    window.addEventListener('message', onMessage)
    const updateTheme = () => { void import('../visualization-document').then(({ visualizationTheme }) => { if (!canceled && container.current) post({ kind: 'theme', theme: visualizationTheme(container.current) }) }) }
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'style'] })
    const appearance = window.matchMedia('(prefers-color-scheme: dark)')
    appearance.addEventListener('change', updateTheme)
    return () => { canceled = true; clearTimeout(timer); window.removeEventListener('message', onMessage); observer.disconnect(); appearance.removeEventListener('change', updateTheme); if (pageUrl) void window.antumi?.visualizationRemove?.(pageUrl) }
  }, [rpc, supported, scope.conversationId, scope.stageId, reference.path, generation, bridge, key, getLocale()])
  const change = (panel: string, control: string, value: string | number | boolean) => frame.current?.contentWindow?.postMessage({ antumiVisualization: bridge, kind: 'control', panel, control, value }, '*')
  return <div ref={container} className="chat-visualization" data-wide={reference.mode === 'wide' || undefined} data-expanded={expanded || undefined} onPointerEnter={() => setAwake(true)}>
    <div className="chat-preview-head">
      <span className="chat-preview-title">{title}</span>
      <span className="chat-preview-actions">
        {panels.length > 0 && <button type="button" className="link-button" aria-expanded={controls} onClick={() => setControls(!controls)}>{t('ChatVisualization.adjust')}</button>}
        <button type="button" className="link-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t('ChatVisualization.collapse') : t('ChatVisualization.expand')}</button>
        <button type="button" className="tool-button" aria-label={t('ChatPreviewCard.reload')} onClick={() => setGeneration((n) => n + 1)}><RefreshIcon /></button>
      </span>
    </div>
    {!supported ? <p className="chat-preview-note muted">{t('ChatVisualization.upgrade')}</p> : <>
      {error && <div className="chat-preview-note muted" role="status">{error}</div>}
      {!src && !error && <p className="chat-preview-note muted">{t('ChatPreviewCard.preparingPreview')}</p>}
      {src && <iframe ref={frame} key={generation} title={title} className="chat-visualization-frame" src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ height: Math.min(expanded ? 10_000 : 800, height) }} inert={!awake} />}
      {controls && panels.length > 0 && <div className="chat-visualization-controls">
        {panels.map((panel) => <fieldset key={panel.id}><legend>{panel.label || title}</legend>{panel.controls.map((control) => <label key={control.id}>
          <span>{control.label}{control.type === 'range' && <span className="chat-visualization-control-value" aria-hidden="true">{String(control.value)}{control.unit}</span>}</span>
          {control.type === 'select' ? <select className="input" value={String(control.value)} onChange={(event) => change(panel.id, control.id, event.target.value)}>{control.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : control.type === 'toggle' ? <input type="checkbox" checked={control.value === true} onChange={(event) => change(panel.id, control.id, event.target.checked)} />
              : <input className={control.type === 'color' ? 'input' : undefined} type={control.type} value={String(control.value)} min={control.type === 'range' ? control.min : undefined} max={control.type === 'range' ? control.max : undefined} step={control.type === 'range' ? control.step ?? 1 : undefined} onChange={(event) => change(panel.id, control.id, control.type === 'range' ? Number(event.target.value) : event.target.value)} />}
        </label>)}</fieldset>)}
      </div>}
    </>}
  </div>
}
