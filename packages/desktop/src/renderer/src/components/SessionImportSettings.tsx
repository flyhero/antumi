import { useEffect, useId, useMemo, useState } from 'react'
import { isAgentKind, type AgentKind, type Conversation, type ExternalSession } from '@antumi/protocol'
import { t } from '../i18n'
import { perform, selectConversation, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { timeAgo } from '../conversation-state'
import { AgentIcon, ChevronRightIcon, RefreshIcon } from './icons'
import { projectName } from './ProjectPicker'
import { useExternalSessions } from '../external-sessions'
import { Toggle } from './SettingsControls'
import { ChatPicker } from './ChatPicker'

const keyOf = (session: ExternalSession) => `${session.agent}:${session.sessionId}`
const selectable = (session: ExternalSession) => session.problem === null && session.status !== 'imported'

// Each source's history becomes a conversation in the folder it ran in.
export function SessionImportSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const [sessions, setSessions] = useState<ExternalSession[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [warnings, setWarnings] = useState<Array<{ agent: AgentKind; message: string }>>([])
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [agent, setAgent] = useState<'all' | AgentKind>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [hideImported, setHideImported] = useState(true)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<Conversation[] | null>(null)
  const hideLabel = useId()

  const load = async () => {
    setLoading(true)
    const found = await perform((rpc) => rpc.call('sessionImports.list', {}))
    setLoading(false)
    if (found) {
      setSessions(found.sessions)
      setWarnings(found.warnings ?? [])
      // What the guide and the overview offer to go on with must not offer what came in here.
      useExternalSessions.setState({ sessions: found.sessions })
    }
  }
  useEffect(() => { if (connected) void load() }, [connected])

  const agents = useMemo(() => [...new Set((sessions ?? []).map((session) => session.agent))], [sessions])
  const needle = query.trim().toLowerCase()
  const visible = (sessions ?? []).filter((session) => (agent === 'all' || session.agent === agent)
    && (!hideImported || session.status !== 'imported')
    && (!needle || [session.title, session.firstPrompt, session.cwd].some((text) => text.toLowerCase().includes(needle))))
  // By folder, the folder with the latest session first.
  const byCwd = new Map<string, ExternalSession[]>()
  for (const session of visible) {
    const members = byCwd.get(session.cwd)
    if (members) members.push(session)
    else byCwd.set(session.cwd, [session])
  }
  const groups = [...byCwd]
  const picked = (sessions ?? []).filter((session) => chosen.has(keyOf(session)) && selectable(session))
  const isExpanded = (cwd: string) => expanded.get(cwd) ?? Boolean(needle)
  const visibleKeys = new Set(visible.map(keyOf))
  const hiddenPicked = picked.filter((session) => !visibleKeys.has(keyOf(session))).length
  const expandAll = (open: boolean) => setExpanded((current) => {
    const next = new Map(current)
    groups.forEach(([cwd]) => next.set(cwd, open))
    return next
  })

  const toggle = (keys: readonly string[], on: boolean) => setChosen((current) => {
    const next = new Set(current)
    keys.forEach((key) => (on ? next.add(key) : next.delete(key)))
    return next
  })

  const submit = async () => {
    if (!picked.length || busy) return
    setBusy(true)
    const completed = new Set<string>()
    const conversations: Conversation[] = []
    try {
      // A folder may exceed the RPC's 100-session limit; keep failed batches selected for retry.
      for (let offset = 0; offset < picked.length; offset += 100) {
        const batch = picked.slice(offset, offset + 100)
        const result = await perform((rpc) => rpc.call('sessionImports.import', { sessions: batch.map(({ agent: kind, sessionId }) => ({ agent: kind, sessionId })) }))
        if (!result) break
        conversations.push(...result.conversations)
        batch.forEach((session) => completed.add(keyOf(session)))
      }
    } finally {
      if (completed.size > 0) {
        setImported(conversations)
        setChosen((current) => new Set([...current].filter((key) => !completed.has(key))))
        await load()
      }
      setBusy(false)
    }
  }

  if (!connected) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  return (
    <>
      <p className="settings-note">{t('SessionImportSettings.note')}</p>
      {warnings.map((warning, index) => <p key={`${warning.agent}:${index}`} className="settings-note" role="status">{agentLabel(warning.agent)}：{warning.message}</p>)}
      <div className="session-import-toolbar">
        {agents.length > 1 && <ChatPicker label={t('SessionImportSettings.agentFilter')} value={agent}
          placeholder={t('SessionImportSettings.allAgents')} size="large" placement="below"
          onChange={(value) => { if (value === 'all' || isAgentKind(value)) setAgent(value) }}
          options={[{ value: 'all', label: t('SessionImportSettings.allAgents') }, ...agents.map((kind) => ({ value: kind, label: agentLabel(kind), icon: <AgentIcon agent={kind} /> }))]} />}
        <input className="input session-import-search" value={query} onChange={(event) => { setQuery(event.target.value); setExpanded(new Map()) }}
          placeholder={t('SessionImportSettings.search')} aria-label={t('SessionImportSettings.search')} />
        <span id={hideLabel} className="session-import-hide">
          {t('SessionImportSettings.hideImported')}
          <Toggle labelId={hideLabel} checked={hideImported} onChange={setHideImported} />
        </span>
        <button type="button" className="icon-button" disabled={loading} onClick={() => void load()} title={t('SessionImportSettings.rescan')} aria-label={t('SessionImportSettings.rescan')}><RefreshIcon /></button>
      </div>
      {groups.length > 0 && (
        <div className="session-import-list-actions">
          <span className="session-import-summary">{t('SessionImportSettings.summary', { folders: groups.length, count: visible.length })}</span>
          <button type="button" className="button ghost" disabled={groups.every(([cwd]) => isExpanded(cwd))} onClick={() => expandAll(true)}>{t('SessionImportSettings.expandAll')}</button>
          <button type="button" className="button ghost" disabled={groups.every(([cwd]) => !isExpanded(cwd))} onClick={() => expandAll(false)}>{t('SessionImportSettings.collapseAll')}</button>
        </div>
      )}
      {imported && imported.length > 0 && (
        <p className="settings-note">
          {t('SessionImportSettings.imported', { count: imported.length })}
          <button type="button" className="button" onClick={() => selectConversation(imported[0]!.id)}>{t('SessionImportSettings.open')}</button>
        </p>
      )}
      {sessions === null ? <p className="settings-empty">{t('SessionImportSettings.scanning')}</p>
        : visible.length === 0 ? <p className="settings-empty">{sessions.length ? t('SessionImportSettings.noneMatch') : t('SessionImportSettings.none')}</p>
          : groups.map(([cwd, members]) => (
            <SessionImportGroup key={cwd} cwd={cwd} members={members} chosen={chosen} busy={busy} expanded={isExpanded(cwd)} toggle={toggle}
              onExpand={() => setExpanded((current) => new Map(current).set(cwd, !isExpanded(cwd)))} />
          ))}
      <div className="session-import-actions">
        <span className="session-import-summary" aria-live="polite">
          {t('SessionImportSettings.selectedCount', { count: picked.length })}
          {hiddenPicked > 0 && <span> · {t('SessionImportSettings.hiddenSelected', { count: hiddenPicked })}</span>}
        </span>
        {picked.length > 0 && <button type="button" className="button ghost" disabled={busy} onClick={() => setChosen(new Set())}>{t('SessionImportSettings.clearSelection')}</button>}
        <button type="button" className="button primary" disabled={!picked.length || busy} onClick={() => void submit()}>
          {busy ? t('SessionImportSettings.importing') : t('SessionImportSettings.importSelected', { count: picked.length })}
        </button>
      </div>
    </>
  )
}

export function SessionImportGroup({ cwd, members, chosen, busy, expanded, toggle, onExpand }: {
  cwd: string
  members: ExternalSession[]
  chosen: ReadonlySet<string>
  busy: boolean
  expanded: boolean
  toggle: (keys: readonly string[], on: boolean) => void
  onExpand: () => void
}) {
  const listId = useId()
  const available = members.filter(selectable).map(keyOf)
  const selected = available.filter((key) => chosen.has(key)).length
  const all = available.length > 0 && selected === available.length
  return (
    <section className="session-import-group">
      <div className="session-import-folder">
        <input type="checkbox" checked={all} disabled={!available.length || busy} onChange={(event) => toggle(available, event.target.checked)}
          ref={(input) => { if (input) input.indeterminate = selected > 0 && !all }}
          aria-label={t('SessionImportSettings.selectFolder', { value1: projectName(cwd) })} />
        <button type="button" className="session-import-folder-toggle" aria-expanded={expanded} aria-controls={listId} onClick={onExpand}>
          <ChevronRightIcon />
          <span className="settings-project-name">{projectName(cwd)}</span>
          <span className="settings-project-path mono" title={cwd}>{cwd}</span>
          <span className="session-import-count">{t('SessionImportSettings.sessionCount', { count: members.length })}</span>
          {selected > 0 && <span className="session-import-selected">{t('SessionImportSettings.selectedCount', { count: selected })}</span>}
        </button>
      </div>
      <ul id={listId} className="settings-project-list" hidden={!expanded}>
        {expanded && members.map((session) => {
          const key = keyOf(session)
          return (
            <li key={key} className="settings-project session-import-row">
              <input type="checkbox" checked={chosen.has(key) && selectable(session)} disabled={!selectable(session) || busy}
                onChange={(event) => toggle([key], event.target.checked)} aria-label={t('SessionImportSettings.select', { value1: session.title })} />
              <span className="session-import-agent" title={agentLabel(session.agent)}><AgentIcon agent={session.agent} /></span>
              <span className="session-import-title" title={session.firstPrompt}>{session.title}</span>
              {session.source && <span className="session-import-badge">{t(session.source === 'desktop' ? 'SessionImportSettings.desktop' : 'SessionImportSettings.cli')}</span>}
              {session.continuation === 'handoff' && <span className="session-import-badge" title={t('SessionImportSettings.handoffHint')}>{t('SessionImportSettings.handoff')}</span>}
              {session.problem === 'missing-cwd' && <span className="session-import-badge">{t('SessionImportSettings.missingFolder')}</span>}
              {session.status === 'imported' && <span className="session-import-badge">{t('SessionImportSettings.statusImported')}</span>}
              {session.status === 'updated' && <span className="session-import-badge updated">{t('SessionImportSettings.statusUpdated')}</span>}
              <span className="muted session-import-time">{timeAgo(session.updatedAt, Date.now())}</span>
              {session.conversationId && (
                <button type="button" className="button ghost" onClick={() => selectConversation(session.conversationId)}>{t('SessionImportSettings.open')}</button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
