import { localized, t, tr } from '../i18n'
import { useState } from 'react'
import type { SquadRun, SquadWork } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { clockText, memberProgress, orderedWorks, workHeadline, type MemberProgress, type MemberState } from '../squad-progress'
import { durationText } from '../stat-format'
import { useNow } from '../usage-format'
import { ChatMarkdown } from './ChatMarkdown'
import { AgentIcon } from './icons'
import { Spinner } from './Spinner'

// Ended work the panel shows before the rest folds away.
const RECENT_ENDED = 3

const RUN_STATE: Record<SquadRun['state'], string> = localized(() => ({ running: t('SquadWorkPanel.developing'), review: t('SquadWorkPanel.awaitingReview'), paused: t('SquadWorkPanel.paused'), cancelled: t('SquadWorkPanel.ended') }))
const MEMBER_STATE: Record<MemberState, string> = localized(() => ({ awaiting: t('ChatWorking.waitingForYourAnswer'), running: t('SquadWorkPanel.working'), starting: t('SquadWorkPanel.preparing'), queued: t('SquadWorkPanel.queued'), idle: t('SquadWorkPanel.idle') }))

// A state as the panel says it, one way everywhere: only what runs moves.
function StateMark({ state, since, now }: { state: MemberState | SquadWork['state'] | 'retried'; since?: number | null; now: number }) {
  switch (state) {
    case 'running':
    case 'starting':
      return <span className="squad-state" data-state="running"><Spinner />{since ? <span className="squad-clock">{clockText(now - since)}</span> : state === 'starting' ? t('SquadWorkPanel.preparing') : t('SquadWorkPanel.working')}</span>
    case 'awaiting':
      return <span className="squad-state" data-state="awaiting">{tr('SquadWorkPanel.waitingForYourAnswer', { value1: <span className="squad-dot" /> })}</span>
    case 'queued':
      return <span className="squad-state" data-state="queued">{tr('SquadWorkPanel.queued_1859', { value1: <span className="squad-dot" /> })}</span>
    case 'completed':
      return <span className="squad-state" data-state="done">{t('SquadWorkPanel.done')}</span>
    case 'failed':
      return <span className="squad-state" data-state="failed">{t('SquadWorkPanel.failed')}</span>
    case 'cancelled':
      return <span className="squad-state" data-state="idle">{t('ConversationList.stopped')}</span>
    case 'retried':
      return <span className="squad-state" data-state="idle">{t('SquadWorkPanel.retried')}</span>
    case 'idle':
      return <span className="squad-state" data-state="idle">{t('SquadWorkPanel.idle')}</span>
  }
}

function MemberRow({ progress, now, onConversation }: { progress: MemberProgress; now: number; onConversation(id: string): void }) {
  const { member, leader, state, detail, conversationId, since } = progress
  const open = conversationId
  return (
    <li>
      <button type="button" className="squad-member" data-state={state} disabled={!open} title={open ? t('SquadWorkPanel.openSConversation', { value1: member.name }) : undefined} onClick={() => { if (open) onConversation(open) }}>
        <AgentIcon agent={member.agent} />
        <span className="squad-member-name"><strong>{member.name}</strong>{leader && <span className="muted">{t('SquadWorkPanel.leader')}</span>}</span>
        <span className="squad-member-state" data-state={state}>
          {state === 'running' || state === 'starting' ? <><Spinner />{MEMBER_STATE[state]}</> : state === 'idle' ? MEMBER_STATE.idle : <><span className="squad-dot" />{MEMBER_STATE[state]}</>}
        </span>
        {(detail || since) && (
          <span className="squad-member-detail">
            {detail && <span className="squad-member-doing">{detail}</span>}
            {since && (state === 'running' || state === 'starting') && <span className="squad-clock">{clockText(now - since)}</span>}
          </span>
        )}
      </button>
    </li>
  )
}

function WorkRow({ run, work, live, now, onConversation }: { run: SquadRun; work: SquadWork; live: boolean; now: number; onConversation(id: string): void }) {
  const [open, setOpen] = useState(false)
  const member = run.squad.members.find((each) => each.id === work.memberId)
  const retried = run.works.some((each) => each.retryOf === work.id)
  const retry = live && (work.state === 'failed' || work.state === 'cancelled') && !retried
  const conversationId = work.state !== 'starting' ? work.conversationId : null
  const ended = work.state === 'completed' || work.state === 'failed' || work.state === 'cancelled'
  const actions = (
    <>
      {conversationId && <button type="button" className="button ghost" onClick={() => onConversation(conversationId)}>{t('SourceInboxView.viewConversation')}</button>}
      {retry && <button type="button" className="button ghost" onClick={() => void perform((rpc) => rpc.call('squads.retry', { id: run.id, workId: work.id }))}>{t('ChatContextMenu.retry')}</button>}
    </>
  )
  return (
    <li className="squad-work" data-open={open || undefined}>
      <div className="squad-work-row">
        <button type="button" className="squad-work-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {member && <AgentIcon agent={member.agent} />}
          <span className="squad-work-text"><span className="muted">{member?.name}</span>{workHeadline(work.instruction)}</span>
        </button>
        <span className="squad-work-status">
          <StateMark state={retried ? 'retried' : work.state} since={work.state === 'running' || work.state === 'starting' ? work.updatedAt : null} now={now} />
          {ended && work.state === 'completed' && <span className="squad-clock">{durationText(work.updatedAt - work.createdAt)}</span>}
        </span>
        {(conversationId || retry) && <span className="squad-work-actions">{actions}</span>}
      </div>
      {open && (
        <div className="squad-work-detail">
          <h4>{t('ChatSubagents.instructions')}</h4>
          <p className="squad-work-instruction">{work.instruction}</p>
          {work.error && <p className="modal-error">{work.error}</p>}
          {work.result && <><h4>{t('ChatSubagents.result')}</h4><div className="squad-work-result"><ChatMarkdown text={work.result} /></div></>}
          {(conversationId || retry) && <div className="squad-work-detail-actions">{actions}</div>}
        </div>
      )}
    </li>
  )
}

function RunSection({ run, current, now, onConversation }: { run: SquadRun; current: boolean; now: number; onConversation(id: string): void }) {
  const conversations = useCore((state) => state.conversations)
  const [showAll, setShowAll] = useState(false)
  const live = current && (run.state === 'running' || run.state === 'paused')
  const members = memberProgress(run, conversations)
  const { open, ended } = orderedWorks(run.works)
  const shown = showAll ? ended : ended.slice(0, RECENT_ENDED)
  const working = members.filter((member) => member.state === 'running' || member.state === 'starting' || member.state === 'awaiting').length
  const queued = members.filter((member) => member.state === 'queued').length
  const done = run.works.filter((work) => work.state === 'completed').length
  const summary = [working && t('SquadWorkPanel.working_1865', { working: working }), queued && t('SquadWorkPanel.queued_1866', { queued: queued }), done && t('SquadWorkPanel.completed', { done: done })].filter(Boolean).join(' · ')
  return (
    <section className="squad-run">
      <header className="squad-run-heading">
        <strong>{run.squad.name}</strong>
        <span className="muted">{current ? RUN_STATE[run.state] : t('SquadWorkPanel.pastRuns')}{summary && ` · ${summary}`}</span>
        {live && <button type="button" className="button ghost" onClick={() => void perform((rpc) => rpc.call('squads.control', { id: run.id, action: run.state === 'paused' ? 'resume' : 'stop' }))}>{run.state === 'paused' ? t('SquadWorkPanel.resumeSquad') : t('SquadWorkPanel.stopSquad')}</button>}
      </header>
      {current && (
        <ul className="squad-members" aria-label={t('DiscussionDraft.members')}>
          {members.map((progress) => <MemberRow key={progress.member.id} progress={progress} now={now} onConversation={onConversation} />)}
        </ul>
      )}
      {run.works.length > 0 && (
        <div className="squad-works">
          <h3 className="squad-works-heading"><span>{t('SquadWorkPanel.work')}</span><span className="muted">{[open.length && t('SquadWorkPanel.inProgress', { value1: open.length }), ended.length && t('SquadWorkPanel.ended_1873', { value1: ended.length })].filter(Boolean).join(' · ')}</span></h3>
          <ul>
            {[...open, ...shown].map((work) => <WorkRow key={work.id} run={run} work={work} live={live} now={now} onConversation={onConversation} />)}
          </ul>
          {ended.length > RECENT_ENDED && <button type="button" className="squad-works-more" onClick={() => setShowAll(!showAll)}>{showAll ? t('ChatPlan.collapse') : t('SquadWorkPanel.earlierEntries', { value1: ended.length - RECENT_ENDED })}</button>}
        </div>
      )}
      {run.summary && <details open={current}><summary>{t('SquadWorkPanel.deliverySummary')}</summary><ChatMarkdown text={run.summary} /></details>}
    </section>
  )
}

// A task's squad at work: who works now and at what, then each piece of work a line of its own,
// opened in place for its instruction and result; the whole of it is in the member's conversation.
export function SquadWorkPanel({ runs, onConversation }: { runs: readonly SquadRun[]; onConversation(id: string): void }) {
  const now = useNow(1000)
  if (!runs.length) return <p className="muted">{t('SquadWorkPanel.noSquadRunHistoryYet')}</p>
  return (
    <div className="squad-work-panel">
      {runs.map((run, index) => <RunSection key={run.id} run={run} current={index === 0} now={now} onConversation={onConversation} />)}
    </div>
  )
}
