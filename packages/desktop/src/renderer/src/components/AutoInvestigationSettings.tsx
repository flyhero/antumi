import { useEffect, useId, useRef, useState } from 'react'
import { AgentKind, AutoInvestigationConfig, agentDescriptor, type AutoInvestigationInfo, type AutoInvestigationRun, type ChatCatalog } from '@antumi/protocol'
import { t, getLocale } from '../i18n'
import { perform, selectConversation, useCore } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { useOccludesBrowser } from '../browser-occlusion'
import { agentLabel } from '../labels'
import { AgentModelPicker } from './AgentModelPicker'
import { ChatPicker } from './ChatPicker'
import { ProjectPicker } from './ProjectPicker'
import { ProviderPicker } from './ProviderPicker'
import { Toggle } from './SettingsControls'
import { CloseIcon } from './icons'

const REASONS = {
  'daily-limit': 'AutoInvestigation.dailyLimitReached', 'agent-capacity': 'AutoInvestigation.capacity',
  'agent-unavailable': 'AutoInvestigation.agentUnavailable', 'model-provider-unavailable': 'AutoInvestigation.providerUnavailable',
  'quota-exhausted': 'AutoInvestigation.quota', 'delivery-uncertain': 'AutoInvestigation.uncertain',
  'storage-failed': 'AutoInvestigation.storageFailed', 'user-input': 'AutoInvestigation.userInput',
  'already-handled': 'AutoInvestigation.alreadyHandled', 'conversation-deleted': 'AutoInvestigation.deleted',
  'agent-exited': 'AutoInvestigation.exited'
} as const
export function autoInvestigationReason(reason: string | null, message: string | null = null): string | null {
  if (!reason) return null
  const key = Object.entries(REASONS).find(([code]) => code === reason)?.[1]
  return key ? t(key) : message || t('AutoInvestigation.checkSettings')
}
export const autoInvestigationStatus = (status: AutoInvestigationRun['status']) => t(`AutoInvestigation.${status}`)

export function AutoInvestigationSummary({ info }: { info: AutoInvestigationInfo }) {
  const { config, summary } = info
  if (!config.enabled) return null
  const reason = autoInvestigationReason(summary.reason, summary.message)
  return <div className="auto-investigation-summary" role="status">
    <span>{t('AutoInvestigation.today', { count: summary.today, limit: config.dailyLimit, queued: summary.queued })}</span>
    {!summary.baselineReady && <span>{t('AutoInvestigation.baseline')}</span>}
    {reason && <span>{reason}{summary.reason === 'daily-limit' ? ` · ${new Date(summary.resetsAt).toLocaleString(getLocale())}` : ''}</span>}
    {summary.possiblyTruncated && <span>{t('AutoInvestigation.truncated')}</span>}
  </div>
}

export function AutoInvestigationHistory({ provider, instance, onClose }: { provider: string; instance: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const rpc = useCore((s) => s.rpc)
  const [items, setItems] = useState<AutoInvestigationRun[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const loading = useRef(false)
  const updates = useRef(new Map<string, AutoInvestigationRun>())
  useOccludesBrowser()
  const load = async (more = false) => {
    if (!rpc || loading.current) return
    loading.current = true
    const current = generation.current
    setBusy(true); setError(null)
    try {
      const result = await rpc.call('sources.autoInvestigations', { provider, instance, ...(more && cursor ? { cursor } : {}) })
      if (current !== generation.current) return
      const fresh = result.items.map((item) => updates.current.get(item.id) ?? item)
      setItems((known) => more ? [...known, ...fresh.filter((item) => !known.some((old) => old.id === item.id))] : fresh)
      setCursor(result.nextCursor)
    } catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { if (current === generation.current) { loading.current = false; setBusy(false) } }
  }
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    void load()
    const unsubscribe = rpc?.on('sources.autoInvestigationChanged', (event) => {
      if (event.provider !== provider || event.instance !== instance || !event.run) return
      const run = event.run
      updates.current.set(run.id, run)
      setItems((known) => known.map((item) => item.id === run.id ? run : item))
    })
    return () => { generation.current += 1; loading.current = false; unsubscribe?.(); element?.close() }
  }, [rpc, provider, instance])
  const act = async (item: AutoInvestigationRun, retry: boolean) => {
    const result = await perform((client) => retry ? client.call('sources.retryAutoInvestigation', { id: item.id }) : client.call('sources.cancelAutoInvestigation', { id: item.id }))
    if (result) setItems((known) => known.map((entry) => entry.id === result.id ? result : entry))
  }
  return <dialog ref={dialog} className="auto-investigation-history" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header className="auto-investigation-history-header"><h3>{t('AutoInvestigation.history')}</h3><div className="toolbar"><button type="button" className="button ghost" disabled={busy} onClick={() => void load()}>{t('AutoInvestigation.refresh')}</button><button type="button" className="tool-button" aria-label={t('AutoInvestigation.close')} onClick={onClose}><CloseIcon /></button></div></header>
    <div className="auto-investigation-history-body">
      {error && <p role="alert">{error} <button type="button" className="link-button" onClick={() => void load()}>{t('AutoInvestigation.retry')}</button></p>}
      {items.length === 0 && !busy && !error && <p className="muted">{t('AutoInvestigation.empty')}</p>}
      {items.map((item) => <article key={item.id} className="auto-investigation-record">
        <div><a href={item.url} target="_blank" rel="noreferrer">{item.key}</a><span className="muted">{autoInvestigationStatus(item.status)}</span><time className="muted">{new Date(item.createdAt).toLocaleString(getLocale())}</time></div>
        <strong>{item.title}</strong>
        {item.reason && <p className="muted">{autoInvestigationReason(item.reason, item.message)}</p>}
        <div className="toolbar">
          {item.conversationId && item.reason !== 'conversation-deleted' && <button type="button" className="button" onClick={() => { onClose(); selectConversation(item.conversationId!) }}>{t('AutoInvestigation.openConversation')}</button>}
          {item.canRetry && <button type="button" className="button" onClick={() => void act(item, true)}>{t('AutoInvestigation.retry')}</button>}
          {['queued', 'retry-wait'].includes(item.status) && <button type="button" className="button ghost" onClick={() => void act(item, false)}>{t('AutoInvestigation.cancel')}</button>}
        </div>
      </article>)}
      {busy && <p className="muted" role="status">{t('AutoInvestigation.loading')}</p>}
      {cursor && <button type="button" className="button" disabled={busy} onClick={() => void load(true)}>{t('AutoInvestigation.more')}</button>}
    </div>
  </dialog>
}

export function AutoInvestigationSettings({ provider, instance, info, connected }: { provider: string; instance: string; info: AutoInvestigationInfo | undefined; connected: boolean }) {
  const id = useId()
  const rpc = useCore((s) => s.rpc)
  const installed = useInstalledAgents().filter((agent) => agentDescriptor(agent).capabilities.readOnly !== false)
  const saved = info?.config ?? AutoInvestigationConfig.parse({})
  const [draft, setDraft] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const [catalog, setCatalog] = useState<ChatCatalog | null>()
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const savedKey = JSON.stringify(saved)
  const lastSaved = useRef(savedKey)
  useEffect(() => {
    if (lastSaved.current !== savedKey) { lastSaved.current = savedKey; setDraft(saved) }
  }, [savedKey])
  useEffect(() => {
    if (!rpc || !draft.agent) { setCatalog(null); return }
    let live = true
    setCatalog(undefined)
    rpc.call('conversations.chatCatalog', { agent: draft.agent, ...(draft.modelProvider ? { modelProvider: draft.modelProvider } : {}) })
      .then((value) => { if (live) setCatalog(value) }, () => { if (live) setCatalog(null) })
    return () => { live = false }
  }, [rpc, draft.agent, draft.modelProvider])
  if (!rpc?.features.includes('source-auto-investigation')) return null
  const save = async () => {
    setBusy(true)
    const result = await perform((client) => client.call('sources.saveAutoInvestigation', { provider, instance, config: draft }))
    if (result) {
      const next = result.instances.find((entry) => entry.instance === instance)?.autoInvestigation?.config
      if (next) setDraft(next)
    }
    setBusy(false)
  }
  return <section className="auto-investigation-settings">
    <div className="auto-investigation-heading"><Toggle labelId={id} checked={draft.enabled} disabled={busy} onChange={(enabled) => setDraft((known) => ({ ...known, enabled, agent: known.agent ?? installed[0] ?? null }))} /><span id={id} className="settings-field-label">{t('AutoInvestigation.title')}</span></div>
    <p className="settings-field-hint">{t('AutoInvestigation.hint')}</p>
    {draft.enabled && <>
      <div className="settings-field"><span className="settings-field-label">{t('AutoInvestigation.projects')}</span><ProjectPicker projects={draft.projectPaths.map((path) => ({ path, worktreePath: null }))} onChange={(projectPaths) => setDraft((known) => ({ ...known, projectPaths }))} locked={busy} /></div>
      <div className="auto-investigation-options">
        <ChatPicker size="field" label="Agent" placeholder={t('AutoInvestigation.chooseAgent')} value={draft.agent ?? ''} options={[...new Set([...installed, ...(draft.agent ? [draft.agent] : [])])].map((agent) => ({ value: agent, label: agentLabel(agent), description: agentDescriptor(agent, getLocale()).modes[agentDescriptor(agent).discussionMode]?.label }))} disabled={busy} onChange={(value) => {
          const next = AgentKind.safeParse(value)
          if (next.success) setDraft((known) => ({ ...known, agent: next.data, model: undefined, effort: undefined, modelProvider: undefined }))
        }} />
        {draft.agent && <ProviderPicker size="field" agent={draft.agent} value={draft.modelProvider ?? null} disabled={busy} onChange={(value) => setDraft((known) => ({ ...known, modelProvider: value ?? undefined, model: undefined, effort: undefined }))} />}
        <AgentModelPicker size="field" catalog={catalog} choice={{ model: draft.model, effort: draft.effort }} disabled={busy} onChange={(choice) => setDraft((known) => ({ ...known, model: choice.model, effort: choice.effort }))} />
      </div>
      <p className="settings-field-hint">{t('AutoInvestigation.modeHint')}</p>
      <div className="settings-field"><label className="settings-field-label" htmlFor={`${id}-note`}>{t('AutoInvestigation.note')}</label><textarea id={`${id}-note`} className="input settings-textarea" rows={3} maxLength={100000} value={draft.note} onChange={(event) => setDraft((known) => ({ ...known, note: event.target.value }))} /></div>
      <div className="settings-field"><label className="settings-field-label" htmlFor={`${id}-limit`}>{t('AutoInvestigation.limit')}</label><input id={`${id}-limit`} className="input auto-investigation-limit" type="number" min={1} max={100} value={draft.dailyLimit} onChange={(event) => { const value = Number(event.target.value); setDraft((known) => ({ ...known, dailyLimit: value })) }} /></div>
      {!connected && <p className="settings-field-hint">{t('AutoInvestigation.connectionHint')}</p>}
    </>}
    {info && <AutoInvestigationSummary info={info} />}
    <div className="settings-form-footer"><button type="button" className="button ghost" onClick={() => setHistory(true)}>{t('AutoInvestigation.history')}</button><button type="button" className="button" disabled={busy || !dirty || !Number.isInteger(draft.dailyLimit) || draft.dailyLimit < 1 || draft.dailyLimit > 100 || (draft.enabled && (!draft.agent || !draft.projectPaths.length))} onClick={() => void save()}>{busy ? t('AutoInvestigation.saving') : t('AutoInvestigation.save')}</button></div>
    {history && <AutoInvestigationHistory provider={provider} instance={instance} onClose={() => setHistory(false)} />}
  </section>
}
