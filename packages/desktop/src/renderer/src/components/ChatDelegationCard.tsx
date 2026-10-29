import { useEffect, useState } from 'react'
import { agentCallOpen, type AgentCall } from '@antumi/protocol'
import { openAgentCall, showAgentCalls } from '../agent-calls'
import { useJustFinished } from '../chat-motion'
import { workedFor } from '../chat-tools'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { ChatCopyRegion } from './ChatCopyRegion'
import { useChatSurface } from './chat-surface'
import { useConversationPane } from './conversation-pane'
import { AgentIcon, ChatIcon, CheckIcon, ClockIcon, CloseIcon, ForkIcon, WarningIcon } from './icons'
import { Spinner } from './Spinner'
import './chat-delegation.css'

// What a queued call waits for; one from a core that does not say is simply queued.
const QUEUED_HINT = {
  parent: 'AgentProfiles.waitingForParent',
  writer: 'AgentProfiles.waitingForWriter',
  capacity: 'AgentProfiles.waitingForCapacity',
  unknown: 'AgentProfiles.waitingToStart'
} as const

function DelegationTime({ call }: { call: AgentCall }) {
  const open = agentCallOpen(call)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open])
  return <span className="chat-delegation-time" aria-live="off">{workedFor(Math.max(0, (open ? now : call.updatedAt) - call.createdAt))}</span>
}

// One member's card in a fan-out: who, what it was asked, how it stands. The caller and the line to
// it are the fan-out's (ChatDelegationGroup), and so is when it went out; the rest of the record,
// the full instruction and result, is in the inspector, so the card keeps its height.
export function ChatDelegationCard({ call, fresh = false }: { call: AgentCall; fresh?: boolean }) {
  const surface = useChatSurface()
  const pane = useConversationPane()
  const [cancelling, setCancelling] = useState(false)
  const focused = useCore((state) => state.agentCallFocus === call.id && (surface.inspector === 'task' ? state.inspectorOpen : state.conversationInspectorOpen))
  const active = call.state === 'running' || call.state === 'starting'
  const open = agentCallOpen(call)
  const finished = useJustFinished(open) && call.state === 'completed'
  const status = t(`AgentProfiles.${call.state}`)
  const inspect = () => { pane?.focus(); showAgentCalls(surface.inspector, call.id) }
  const cancel = async () => {
    if (cancelling) return
    setCancelling(true)
    await perform((rpc) => rpc.call('agentCalls.cancel', { id: call.parentId, callId: call.id }))
    setCancelling(false)
  }
  return <ChatCopyRegion text={[call.profile.name, call.instruction, call.result, call.error].filter(Boolean).join('\n\n')}>
    <article className="chat-delegation" data-state={call.state} data-returned={call.delivered || undefined} data-active={active || undefined} data-fresh={fresh || undefined} data-finished={finished || undefined} data-focused={focused || undefined} data-call-id={call.id} aria-label={t('AgentProfiles.cardLabel', { name: call.profile.name })}>
      <header className="chat-delegation-header"><span className="chat-delegation-heading"><ForkIcon />{t('AgentProfiles.delegatedAgent')}</span><span className="chat-delegation-state" role="status">{active ? <Spinner label={status} /> : call.state === 'completed' ? <CheckIcon /> : call.state === 'awaiting' || call.state === 'failed' ? <WarningIcon /> : call.state === 'cancelled' ? <CloseIcon /> : <ClockIcon />}<span>{status}</span></span></header>
      <div className="chat-delegation-recipient"><span className="chat-delegation-avatar" data-line-end=""><AgentIcon agent={call.profile.agent} /></span><strong>{call.profile.name}</strong></div>
      <p className="chat-delegation-goal" title={call.instruction}>{call.instruction.split('\n').filter((line) => line.trim()).slice(0, 2).join(' · ')}</p>
      {call.error ? <p className="chat-delegation-error">{call.error}</p> : call.result ? <div className="chat-delegation-preview">{call.state === 'completed' ? <CheckIcon /> : <ChatIcon />}<p>{call.result}</p></div> : <p className="chat-delegation-hint">{call.state === 'queued' ? t(QUEUED_HINT[call.waiting ?? 'unknown']) : call.state === 'awaiting' ? t('AgentProfiles.needsAttention') : call.state === 'starting' ? t('AgentProfiles.startingHint') : open ? t('AgentProfiles.workingHint') : t('AgentProfiles.noResult')}</p>}
      <footer className="chat-delegation-footer"><span className="chat-delegation-meta"><DelegationTime call={call} /></span><div className="chat-delegation-actions"><button type="button" className="link-button chat-delegation-details-link" aria-pressed={focused} onClick={inspect}>{t('AgentProfiles.details')}</button>{call.state === 'awaiting' && <button type="button" className="link-button" onClick={() => void openAgentCall(call)}>{t('AgentProfiles.handleRequest')}</button>}{open && <button type="button" className="link-button" disabled={cancelling} onClick={() => void cancel()}>{t('AgentProfiles.cancelCall')}</button>}</div></footer>
    </article>
  </ChatCopyRegion>
}
