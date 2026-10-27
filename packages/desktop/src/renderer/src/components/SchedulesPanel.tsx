import { t, tr } from '../i18n'
import { useCallback, useState } from 'react'
import type { ScheduledRun } from '@antumi/protocol'
import { selectConversation, selectTask, setAwakeMode, showView, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { cancelSchedule, clearSchedules, openQueueRuns, reorderSchedules, rescheduleRun, runAction, runScheduleNow, scheduleState, TARGET_LABEL, UNATTENDED_LABEL, waitingForRunDependencies } from '../schedules'
import { AgentIcon, ArrowDownIcon, ArrowUpIcon, ClockIcon, CloseIcon, PlayIcon } from './icons'
import { AgentsPageHeader } from './AgentsPageHeader'
import { SchedulePicker, SettingsLink } from './SchedulePicker'

// A task's chat is reached through its task, which the list of free conversations does not hold.
function openTarget(run: ScheduledRun): void {
  const { target } = run
  if (target.kind === 'task') {
    selectTask(target.taskId)
    return
  }
  // A routine's run has a conversation only once it has started.
  const conversationId = target.kind === 'routine' ? run.conversationId : target.conversationId
  if (!conversationId) return
  const { conversations, tasks } = useCore.getState()
  const owner = Object.values(tasks).find((task) => task.conversationId === conversationId)
  if (owner) {
    selectTask(owner.id)
    showView('chat')
  } else if (conversations[conversationId]) {
    selectConversation(conversationId)
  }
}

function Reschedule({ run }: { run: ScheduledRun }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <span className="menu-anchor">
      <button type="button" className="tool-button" aria-label={t('SchedulesPanel.changeTime')} data-tooltip={t('SchedulesPanel.changeTime')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ClockIcon />
      </button>
      {open && (
        <SchedulePicker
          title={t('OverviewView.changeScheduledTime')}
          initial={run.notBefore}
          submitLabel={t('FileEditor.save')}
          onSchedule={async (notBefore) => (await rescheduleRun(run.id, notBefore)) !== null}
          onClose={close}
        />
      )}
    </span>
  )
}

// Who runs it, by the agent's mark; its name is on hover and for a screen reader.
function ScheduleAgent({ run }: { run: ScheduledRun }) {
  return <span className="schedule-agent" role="img" aria-label={agentLabel(run.agent)} title={agentLabel(run.agent)}><AgentIcon agent={run.agent} /></span>
}

function OpenRow({ run, index, count, now, onMove }: { run: ScheduledRun; index: number; count: number; now: number; onMove: (from: number, to: number) => void }) {
  const waiting = run.status === 'waiting'
  const tasks = useCore((state) => state.tasks)
  const waitingDependencies = waitingForRunDependencies(run, tasks)
  return (
    <li className="schedule-row">
      <span className="schedule-index">{index + 1}</span>
      <span className="schedule-main">
        <button type="button" className="schedule-title" onClick={() => openTarget(run)}>{run.title}</button>
        <span className="schedule-meta" title={runAction(run)}><ScheduleAgent run={run} />{TARGET_LABEL[run.target.kind]} · {runAction(run)}</span>
      </span>
      <span className="schedule-state">{scheduleState(run, now, tasks)}</span>
      <span className="schedule-actions">
        <button type="button" className="tool-button" aria-label={t('SchedulesPanel.moveEarlier')} data-tooltip={t('SchedulesPanel.moveEarlier')} disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUpIcon /></button>
        <button type="button" className="tool-button" aria-label={t('SchedulesPanel.moveLater')} data-tooltip={t('SchedulesPanel.moveLater')} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}><ArrowDownIcon /></button>
        {waiting && run.target.kind !== 'resume' && !(run.target.kind === 'task' && run.target.afterDependencies) && <Reschedule run={run} />}
        {waiting && (
          <button
            type="button"
            className="tool-button"
            aria-label={t('SchedulesPanel.startNow')}
            data-tooltip={waitingDependencies ? t('TaskBoard.waitingForDependencies') : t('SchedulesPanel.startNowIgnoringTimeAndQuota')}
            disabled={waitingDependencies}
            onClick={() => void runScheduleNow(run.id)}
          >
            <PlayIcon />
          </button>
        )}
        {waiting && (
          <button type="button" className="tool-button" aria-label={t('ChatDock.cancelSchedule')} data-tooltip={t('ChatDock.cancelSchedule')} onClick={() => void cancelSchedule(run.id)}>
            <CloseIcon />
          </button>
        )}
      </span>
    </li>
  )
}

function SettledRow({ run, now }: { run: ScheduledRun; now: number }) {
  return (
    <li className="schedule-row" data-status={run.status}>
      <span className="schedule-index" />
      <span className="schedule-main">
        <button type="button" className="schedule-title" onClick={() => openTarget(run)}>{run.title}</button>
        <span className="schedule-meta" title={runAction(run)}><ScheduleAgent run={run} />{TARGET_LABEL[run.target.kind]} · {runAction(run)}</span>
      </span>
      <span className="schedule-state" data-warn={run.status === 'failed' || undefined}>{scheduleState(run, now)}</span>
      <span className="schedule-actions" />
    </li>
  )
}

// The 预约 tab of the routines' page: every run scheduled to start once later, in the order they
// go, then what became of the recent ones.
export function SchedulesPanel() {
  const runs = useCore((s) => s.schedules)
  const mode = useCore((s) => s.chatSettings?.unattendedMode ?? 'acceptEdits')
  const awake = useCore((s) => s.awake)
  // A routine's runs are the routine's to show (RoutinesView), not the queue's.
  const open = openQueueRuns(runs)
  const settled = runs.filter((run) => !open.includes(run) && run.target.kind !== 'routine')
  const now = Date.now()
  const move = (from: number, to: number) => {
    const ids = open.map((run) => run.id)
    const [moved] = ids.splice(from, 1)
    if (moved === undefined) return
    ids.splice(to, 0, moved)
    reorderSchedules(ids)
  }
  return (
    <>
      <AgentsPageHeader title={t('OverviewView.schedules')} description={tr('SchedulesPanel.runASpecifiedTaskOrConversationOnceStarts', { value1: UNATTENDED_LABEL[mode], value2: <SettingsLink /> })} />
      {awake?.mode === 'off' && open.length > 0 && (
        <p className="routines-notice" role="note">{tr('SchedulesPanel.keepComputerAwakeIsOffSchedulesWillNot', { value1: <button type="button" className="link-button" onClick={() => void setAwakeMode('auto')}>{t('SchedulesPanel.keepAwakeWhenSchedulesArePending')}</button> })}</p>
      )}
      <section className="worktree-group" aria-label={t('SchedulesPanel.waiting')}>
        <h3 className="worktree-group-title">{tr('SchedulesPanel.waiting_1507', { value1: open.length })}</h3>
        {open.length === 0
          ? <p className="worktrees-empty muted">{t('SchedulesPanel.noWaitingSchedulesUseTheClockIconIn')}</p>
          : <ul className="worktree-list">{open.map((run, index) => <OpenRow key={run.id} run={run} index={index} count={open.length} now={now} onMove={move} />)}</ul>}
      </section>
      {settled.length > 0 && (
        <section className="worktree-group" aria-label={t('SchedulesPanel.recent')}>
          <h3 className="worktree-group-title">{tr('SchedulesPanel.recent_1510', { value1: settled.length, value2: <button type="button" className="link-button" onClick={clearSchedules}>{t('SchedulesPanel.clearHistory')}</button> })}</h3>
          <ul className="worktree-list">{settled.map((run) => <SettledRow key={run.id} run={run} now={now} />)}</ul>
        </section>
      )}
    </>
  )
}
