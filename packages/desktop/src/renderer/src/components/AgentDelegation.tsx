import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type { ChatItem, Conversation, DelegationTarget } from '@antumi/protocol'
import { showAgentCalls, useAgentCalls, useAgentCallsSupported } from '../agent-calls'
import { useOccludesBrowser } from '../browser-occlusion'
import { useDisclosure } from '../chat-disclosure'
import { useCore } from '../core-store'
import { agentResultCallIds, deliveredResults } from '../delegation-delivery'
import { usePreferences } from '../preferences'
import { t } from '../i18n'
import { agentLabel } from '../labels'
import { useNow } from '../usage-format'
import { delegationQuotaText } from './AgentQuota'
import { ChatCopyRegion } from './ChatCopyRegion'
import { ChatMarkdown } from './ChatMarkdown'
import { ChatPicker } from './ChatPicker'
import { useChatSurface } from './chat-surface'
import { useConversationPane } from './conversation-pane'
import { AgentIcon, ChevronRightIcon, CloseIcon, SquadIcon } from './icons'
import './agent-calls.css'

function DelegationDialog({ conversation, onClose, onHistory }: { conversation: Conversation; onClose(): void; onHistory(): void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const rpc = useCore((state) => state.rpc)
  const profiles = useCore((state) => state.agentProfiles)
  const [targets, setTargets] = useState<DelegationTarget[]>([])
  const disabledAgents = usePreferences((state) => state.disabledAgents)
  const display = usePreferences((state) => state.usageDisplay)
  const now = useNow(60_000)
  const [develop, setDevelop] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [goal, setGoal] = useState('')
  const [context, setContext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(crypto.randomUUID())
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useEffect(() => {
    if (!rpc) return
    let current = true
    // An older core knows only profiles, and nothing of their quota.
    const found: Promise<DelegationTarget[]> = rpc.features.includes('direct-agent-calls') ? rpc.call('agentCalls.targets', { id: conversation.id })
      : rpc.call('agentProfiles.available', { id: conversation.id }).then((items) => items.map((item) => ({ profileId: item.id, name: item.name, description: item.description,
        agent: item.agent, capability: item.capability, readOnly: true, quota: { state: 'unknown', window: null, stale: false } })))
    void found.then((items) => {
      if (current) { setTargets(items); setLoading(false) }
    }).catch((reason: unknown) => { if (current) { setError(String(reason)); setLoading(false) } })
    return () => { current = false }
  }, [rpc, conversation.id, profiles])
  const offered = targets.filter((item) => !disabledAgents.includes(item.agent))
  // A profile by its id, an agent called as it is by `agent:<kind>`.
  const valueOf = (item: DelegationTarget) => item.profileId ?? `agent:${item.agent}`
  const selected = offered.find((item) => valueOf(item) === profileId && item.quota.state !== 'exhausted')
  const direct = selected?.profileId === null ? selected : null
  const edits = direct ? develop || !direct.readOnly : false
  const dispatch = async () => {
    if (!rpc || busy || !selected || !goal.trim() || conversation.archivedAt != null) return
    setBusy(true)
    setError(null)
    try {
      const target = selected.profileId ? { profileId: selected.profileId } : { agent: selected.agent, capability: edits ? 'develop' as const : 'readOnly' as const }
      await rpc.call('agentCalls.dispatch', { id: conversation.id, ...target, instruction: [goal.trim(), context.trim()].filter(Boolean).join('\n\n'), ref: requestRef.current })
      onHistory()
      onClose()
    } catch (reason) { setError(String(reason)); setBusy(false) }
  }
  return <dialog ref={dialog} className="modal delegation-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void dispatch() }}>
      <header className="modal-header"><h2 id={titleId}>{t('AgentProfiles.delegate')}</h2><button type="button" className="icon-button modal-close" aria-label={t('BackdropPicker.close')} disabled={busy} onClick={onClose}><CloseIcon /></button></header>
      <p className="delegation-hint muted">{t('AgentProfiles.dispatchHint')}</p>
      <div className="delegation-field"><span>{t('AgentProfiles.role')}</span><ChatPicker label={t('AgentProfiles.role')} value={profileId} placeholder={t('AgentProfiles.chooseRole')} size="field" placement="below" disabled={busy || loading} options={offered.map((item) => ({ value: valueOf(item), label: item.name, disabled: item.quota.state === 'exhausted', icon: <AgentIcon agent={item.agent} />,
        description: [item.profileId ? item.description || agentLabel(item.agent) : t('AgentProfiles.engine'), delegationQuotaText(item.quota, display, now)].filter(Boolean).join(' · ') }))}
        onChange={(value) => { setProfileId(value); requestRef.current = crypto.randomUUID() }} /></div>
      {!loading && !offered.length && <p className="muted">{t('AgentProfiles.noAvailable')}</p>}
      {direct && <label className="delegation-check"><input type="checkbox" checked={edits} disabled={busy || !direct.readOnly} onChange={(event) => { setDevelop(event.target.checked); requestRef.current = crypto.randomUUID() }} />{t('AgentProfiles.allowEdits')}</label>}
      <label className="delegation-field">{t('AgentProfiles.goal')}<textarea className="input" autoFocus required rows={3} maxLength={10000} placeholder={t('AgentProfiles.goalPlaceholder')} value={goal} disabled={busy} onChange={(event) => { setGoal(event.target.value); requestRef.current = crypto.randomUUID() }} /></label>
      <label className="delegation-field">{t('AgentProfiles.context')}<textarea className="input" rows={2} maxLength={9998} placeholder={t('AgentProfiles.contextPlaceholder')} value={context} disabled={busy} onChange={(event) => { setContext(event.target.value); requestRef.current = crypto.randomUUID() }} /></label>
      {error && <p className="modal-error" role="alert">{error}</p>}
      <footer className="modal-footer"><button type="button" className="link-button delegation-history" disabled={busy} onClick={() => { onHistory(); onClose() }}>{t('AgentProfiles.history')}</button><button type="button" className="button ghost" disabled={busy} onClick={onClose}>{t('ChatCommandSettings.cancel')}</button><button type="submit" className="button primary" disabled={busy || !selected || !goal.trim() || conversation.archivedAt != null}>{busy ? t('AgentProfiles.starting') : t('AgentProfiles.dispatch')}</button></footer>
    </form>
  </dialog>
}

export function AgentDelegation({ conversation }: { conversation: Conversation }) {
  const supported = useAgentCallsSupported(conversation)
  const [open, setOpen] = useState(false)
  const surface = useChatSurface()
  const pane = useConversationPane()
  if (!supported) return null
  const history = () => {
    pane?.focus()
    showAgentCalls(surface.inspector)
  }
  const working = conversation.delegation?.open ?? 0
  return <>
    <button type="button" className="tool-button delegation-button" aria-label={t('AgentProfiles.delegate')} aria-haspopup="dialog" aria-expanded={open} data-tooltip={t('AgentProfiles.delegate')} disabled={conversation.archivedAt != null} onClick={() => setOpen(true)}><SquadIcon /><span>{t('AgentProfiles.dispatch')}</span>{working > 0 && <span className="delegation-count" aria-label={`${t('AgentProfiles.running')} ${working}`}>{working}</span>}</button>
    {open && <DelegationDialog key={conversation.id} conversation={conversation} onClose={() => setOpen(false)} onHistory={history} />}
  </>
}

const ENDED = { completed: 'AgentProfiles.completed', failed: 'AgentProfiles.failed', cancelled: 'AgentProfiles.cancelled' } as const
const endedText = (state: string) => state === 'completed' || state === 'failed' || state === 'cancelled' ? t(ENDED[state]) : state

// Results back in the main conversation: one row for the message they came in, saying whose and
// how each ended, opening on what the main agent was given. Each one's details open its call in
// the inspector.
export function AgentDelegationResult({ conversationId, item }: { conversationId: string; item: Extract<ChatItem, { kind: 'user' }> }) {
  const surface = useChatSurface()
  const pane = useConversationPane()
  const [open, setOpen] = useDisclosure(`delivery:${item.id}`)
  const calls = useAgentCalls(conversationId).calls
  const delivered = deliveredResults(item.text)
  const results = agentResultCallIds(item).flatMap((id) => {
    const given = delivered.find((each) => each.callId === id)
    const call = calls?.find((each) => each.id === id)
    const name = given?.name ?? call?.profile.name
    return name ? [{ id, name, agent: call?.profile.agent ?? null, state: given?.state ?? call?.state ?? '', result: given?.result ?? null, error: given?.error ?? null }] : []
  })
  const show = (callId: string | null) => { pane?.focus(); showAgentCalls(surface.inspector, callId) }
  if (!results.length) {
    return <div className="delegation-delivery-plain"><SquadIcon /><span>{t('AgentProfiles.resultReturned')}</span><button type="button" className="link-button" onClick={() => show(null)}>{t('AgentProfiles.history')}</button></div>
  }
  return <div className="chat-tool-line delegation-delivery" data-open={open || undefined}>
    <button type="button" className="chat-tool-row" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="chat-tool-icon" aria-hidden="true"><SquadIcon /></span>
      <span className="chat-tool-name">{results.length > 1 ? t('AgentProfiles.resultsReceived', { count: results.length }) : t('AgentProfiles.resultReceived')}</span>
      <span className="chat-tool-summary">{results.map((each, index) => <Fragment key={each.id}>
        {index > 0 && ' · '}
        <span className="delegation-delivery-agent"><AgentIcon agent={each.agent} />{each.name} <span className="delegation-delivery-state" data-state={each.state}>{endedText(each.state)}</span></span>
      </Fragment>)}</span>
      <span className="chat-tool-chevron" aria-hidden="true"><ChevronRightIcon /></span>
    </button>
    {open && <div className="delegation-delivery-body">{results.map((each) => <section key={each.id} className="delegation-delivery-result">
      <header>
        <AgentIcon agent={each.agent} />
        <strong>{each.name}</strong>
        <span className="delegation-delivery-state" data-state={each.state}>{endedText(each.state)}</span>
        <button type="button" className="link-button" onClick={() => show(each.id)}>{t('AgentProfiles.details')}</button>
      </header>
      {each.result
        ? <ChatCopyRegion text={each.result}><div className="chat-subagent-result"><ChatMarkdown text={each.result} /></div></ChatCopyRegion>
        : <div className="chat-subagent-text">{each.error ?? t('AgentProfiles.noResult')}</div>}
    </section>)}</div>}
  </div>
}
