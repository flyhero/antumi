import { useEffect, useId, useState } from 'react'
import { agentCallOpen, type AgentCall } from '@antumi/protocol'
import { openAgentCall, showAgentCalls } from '../agent-calls'
import { useJustFinished } from '../chat-motion'
import { workedFor } from '../chat-tools'
import { perform } from '../core-store'
import { t } from '../i18n'
import { chatDayAndTime } from '../labels'
import { ChatCopyRegion } from './ChatCopyRegion'
import { ChatMarkdown } from './ChatMarkdown'
import { useChatSurface } from './chat-surface'
import { useConversationPane } from './conversation-pane'
import { AgentIcon, ChatIcon, CheckIcon, ChevronDownIcon, ClockIcon, CloseIcon, ForkIcon, WarningIcon } from './icons'
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

export function ChatDelegationCard({ call, fresh = false }: { call: AgentCall; fresh?: boolean }) {
  const surface = useChatSurface()
  const pane = useConversationPane()
  const panel = useId()
  const [expanded, setExpanded] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const active = call.state === 'running' || call.state === 'starting'
  const open = agentCallOpen(call)
  const finished = useJustFinished(open) && call.state === 'completed'
  const status = t(`AgentProfiles.${call.state}`)
  const inspect = () => { pane?.focus(); showAgentCalls(surface.inspector) }
  const cancel = async () => {
    if (cancelling) return
    setCancelling(true)
    await perform((rpc) => rpc.call('agentCalls.cancel', { id: call.parentId, callId: call.id }))
    setCancelling(false)
  }
  return <ChatCopyRegion text={[call.profile.name, call.instruction, call.result, call.error].filter(Boolean).join('\n\n')}>
    <article className="chat-delegation" data-state={call.state} data-returned={call.delivered || undefined} data-active={active || undefined} data-fresh={fresh || undefined} data-finished={finished || undefined} data-call-id={call.id} aria-label={t('AgentProfiles.cardLabel', { name: call.profile.name })}>
      <header className="chat-delegation-header"><span className="chat-delegation-heading"><ForkIcon />{t('AgentProfiles.delegate')}</span><span className="chat-delegation-state" role="status">{active ? <Spinner label={status} /> : call.state === 'completed' ? <CheckIcon /> : call.state === 'awaiting' || call.state === 'failed' ? <WarningIcon /> : call.state === 'cancelled' ? <CloseIcon /> : <ClockIcon />}<span>{status}</span></span></header>
      <div className="chat-delegation-route">
        <div className="chat-delegation-origin"><span className="chat-delegation-avatar"><ChatIcon /></span><span>{t('AgentProfiles.mainConversation')}</span></div>
        <div className="chat-delegation-bridge" aria-hidden="true"><svg viewBox="0 0 100 24" preserveAspectRatio="none"><path className="chat-delegation-track" d="M2 12H98" /><path className="chat-delegation-packet" d="M2 12H98" /><path className="chat-delegation-arrow" d="m92 8 6 4-6 4" /></svg><span className="chat-delegation-route-label">{call.delivered ? t('AgentProfiles.returned') : call.state === 'completed' ? t('AgentProfiles.pendingReturn') : t('AgentProfiles.assigned')}</span></div>
        <div className="chat-delegation-recipient"><span className="chat-delegation-avatar"><AgentIcon agent={call.profile.agent} /></span><strong>{call.profile.name}</strong></div>
      </div>
      <p className="chat-delegation-goal" title={call.instruction}>{call.instruction.split('\n').filter((line) => line.trim()).slice(0, 2).join(' · ')}</p>
      {call.error ? <p className="chat-delegation-error">{call.error}</p> : call.result ? <div className="chat-delegation-preview">{call.state === 'completed' ? <CheckIcon /> : <ChatIcon />}<p>{call.result}</p></div> : <p className="chat-delegation-hint">{call.state === 'queued' ? t(QUEUED_HINT[call.waiting ?? 'unknown']) : call.state === 'awaiting' ? t('AgentProfiles.needsAttention') : call.state === 'starting' ? t('AgentProfiles.startingHint') : open ? t('AgentProfiles.workingHint') : t('AgentProfiles.noResult')}</p>}
      <footer className="chat-delegation-footer"><span className="chat-delegation-meta"><time dateTime={new Date(call.createdAt).toISOString()}>{chatDayAndTime(call.createdAt)}</time><span aria-hidden="true">·</span><DelegationTime call={call} /></span><div className="chat-delegation-actions"><button type="button" className="link-button chat-delegation-expand" aria-expanded={expanded} aria-controls={expanded ? panel : undefined} onClick={() => setExpanded(!expanded)}>{t('AgentProfiles.details')}<ChevronDownIcon /></button><button type="button" className="link-button" onClick={inspect}>{t('AgentProfiles.history')}</button>{call.state !== 'queued' && call.state !== 'starting' && <button type="button" className="link-button" onClick={() => void openAgentCall(call)}>{call.state === 'awaiting' ? t('AgentProfiles.handleRequest') : t('AgentProfiles.openConversation')}</button>}{open && <button type="button" className="link-button" disabled={cancelling} onClick={() => void cancel()}>{t('AgentProfiles.cancelCall')}</button>}</div></footer>
      {expanded && <div className="chat-delegation-details" id={panel}><section><h4>{t('AgentProfiles.instruction')}</h4><div className="chat-delegation-instruction">{call.instruction}</div></section>{call.result && <section><h4>{t('AgentProfiles.result')}</h4><ChatMarkdown text={call.result} /></section>}</div>}
    </article>
  </ChatCopyRegion>
}
