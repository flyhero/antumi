import { useEffect, useRef, useState } from 'react'
import { squadCallOpen, type SquadCall } from '@antumi/protocol'
import { perform, selectTask, useCore } from '../core-store'
import { useTeamCalls } from '../team-calls'
import { t } from '../i18n'
import { SquadIcon } from './icons'
import { Spinner } from './Spinner'
import './agent-calls.css'
import './chat-delegation.css'

const STATE = {
  queued: 'TeamCalls.queued', starting: 'TeamCalls.starting', running: 'TeamCalls.running', awaiting: 'TeamCalls.awaiting',
  paused: 'TeamCalls.paused', review: 'TeamCalls.review', failed: 'TeamCalls.failed', cancelled: 'TeamCalls.cancelled'
} as const

export function TeamCallCard({ call, detail = false }: { call: SquadCall; detail?: boolean }) {
  const [cancelling, setCancelling] = useState(false)
  const focused = useCore((state) => state.agentCallFocus === call.id)
  const record = useRef<HTMLElement>(null)
  useEffect(() => { if (detail && focused) record.current?.scrollIntoView({ block: 'nearest' }) }, [detail, focused])
  const taskExists = useCore((state) => Boolean(state.tasks[call.taskId]))
  const cancel = async () => {
    setCancelling(true)
    await perform((rpc) => rpc.call('squadCalls.cancel', { id: call.parentId, callId: call.id }))
    setCancelling(false)
  }
  const actions = <>
    <button type="button" className="link-button" disabled={!taskExists} onClick={() => selectTask(call.taskId)}>{t('TeamCalls.openTask')}</button>
    {squadCallOpen(call) && <button type="button" className="link-button" disabled={cancelling} onClick={() => void cancel()}>{t('AgentProfiles.cancelCall')}</button>}
  </>
  if (!detail) return <article className="chat-delegation" data-team-call-id={call.id} data-state={call.state}>
    <header className="chat-delegation-header"><span>{t('TeamCalls.title')}</span><span className="chat-delegation-state" role="status">{(call.state === 'running' || call.state === 'starting') && <Spinner label={t(STATE[call.state])} />}{t(STATE[call.state])}</span></header>
    <div className="chat-delegation-recipient"><span className="chat-delegation-avatar"><SquadIcon /></span><strong>{call.squad.name}</strong></div>
    <p className="chat-delegation-goal" title={call.instruction}>{call.instruction}</p>
    {call.error && <p className="chat-delegation-error">{call.error}</p>}
    {call.result && <div className="chat-delegation-preview"><SquadIcon /><p>{call.result}</p></div>}
    <footer className="chat-delegation-footer"><div className="chat-delegation-actions">{actions}</div></footer>
  </article>
  return <article ref={record} className="delegation-record" data-focused={focused || undefined} data-team-call-id={call.id}>
    <div className="delegation-record-head"><SquadIcon /><strong>{call.squad.name}</strong><span className="delegation-status" data-state={call.state}>{t(STATE[call.state])}</span></div>
    <details className="delegation-instruction"><summary>{call.instruction}</summary><p>{call.instruction}</p></details>
    {detail && call.result && <details className="delegation-result" open={focused || undefined}><summary>{t('AgentProfiles.result')}</summary><p>{call.result}</p></details>}
    {call.error && <p className="modal-error" role="status">{call.error}</p>}
    <footer className="delegation-record-actions">{actions}</footer>
  </article>
}

export function TeamCalls({ conversationId }: { conversationId: string }) {
  const { calls, error } = useTeamCalls(conversationId)
  if (!calls?.length && !error) return null
  return <section className="delegation-history"><h3>{t('TeamCalls.title')}</h3>
    {error && <p className="modal-error">{error}</p>}
    <ol className="delegation-list">{[...(calls ?? [])].sort((a, b) => b.createdAt - a.createdAt).map((call) => <li className="delegation-item" key={call.id}><TeamCallCard call={call} detail /></li>)}</ol>
  </section>
}
