import { localized, t } from './i18n'
import { isScheduleOpen, type RequestedTarget, type ScheduledRun, type Task, type UnattendedMode } from '@antumi/protocol'
import type { Notice } from './attention'
import { perform } from './core-store'
import { dayAndTime, reasonText } from './labels'

export const UNATTENDED_LABEL: Record<UnattendedMode, string> = localized(() => ({ acceptEdits: t('ChatPlan.acceptEditsAutomatically'), bypass: t('ChatPlan.allowEverything') }))

// The hour a night run defaults to: late enough that the day's work is over.
const NIGHT_HOUR = 1

export function createSchedule(target: RequestedTarget, notBefore: number | null): Promise<ScheduledRun | null> {
  return perform((rpc) => rpc.call('schedules.create', { target, notBefore }))
}

export function rescheduleRun(id: string, notBefore: number | null): Promise<ScheduledRun | null> {
  return perform((rpc) => rpc.call('schedules.update', { id, notBefore }))
}

export function cancelSchedule(id: string): Promise<ScheduledRun | null> {
  return perform((rpc) => rpc.call('schedules.cancel', { id }))
}

export function runScheduleNow(id: string): Promise<ScheduledRun | null> {
  return perform((rpc) => rpc.call('schedules.runNow', { id }))
}

export function reorderSchedules(ids: readonly string[]): void {
  void perform((rpc) => rpc.call('schedules.reorder', { ids: [...ids] }))
}

export function clearSchedules(): void {
  void perform((rpc) => rpc.call('schedules.clear', {}))
}

// The next NIGHT_HOUR o'clock after now, in local time.
export function nextNight(now: number): number {
  const at = new Date(now)
  at.setHours(NIGHT_HOUR, 0, 0, 0)
  if (at.getTime() <= now) at.setDate(at.getDate() + 1)
  return at.getTime()
}

const pad = (value: number) => String(value).padStart(2, '0')

// For <input type="datetime-local">, which reads and writes local time without a zone.
export function toLocalInput(ms: number): string {
  const at = new Date(ms)
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

// A date and time without an offset is read as local time.
export function fromLocalInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

// "02:00" today, "明天 02:00", or the date further out.
export function scheduleTime(ms: number, now: number): string {
  const at = new Date(ms)
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const days = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return clock
  if (days === 1) return t('schedules.tomorrow', { clock: clock })
  return dayAndTime(ms)
}

// Where a run stands, in a few words.
export function scheduleState(run: ScheduledRun, now: number, tasks?: Readonly<Record<string, Task>>): string {
  switch (run.status) {
    case 'waiting':
      if (waitingForRunDependencies(run, tasks)) return t('TaskBoard.waitingForDependencies')
      if (run.notBefore !== null && run.notBefore > now) return t('schedules.startAfter', { value1: scheduleTime(run.notBefore, now) })
      if (run.resetsAt !== null && run.resetsAt > now) return t('schedules.waitingForQuotaReset', { value1: scheduleTime(run.resetsAt, now) })
      if (run.attempts > 0) return t('schedules.couldNotStartRetryingLater', { value1: reasonText(run.error ?? '', run.error ?? '') })
      if (run.heldBy) return t('schedules.waitingBehind', { value1: run.heldBy })
      return run.notBefore === null ? t('schedules.startWhenQuotaResets') : t('schedules.startingSoonSchedulesForTheSameAgentRun')
    case 'starting':
      return t('OverviewView.starting')
    case 'started':
      return t('schedules.started', { value1: scheduleTime(run.settledAt ?? now, now) })
    case 'failed':
      return t('routines.couldNotStart', { value1: reasonText(run.error ?? '', run.error ?? t('DiscussionView.unknownReason')) })
    case 'cancelled':
      return run.error ? t('routines.cancelled', { value1: reasonText(run.error, run.error) }) : t('ChatRequestCards.cancelled')
  }
}

export function waitingForRunDependencies(run: Pick<ScheduledRun, 'target'>, tasks?: Readonly<Record<string, Task>>): boolean {
  const { target } = run
  if (target.kind !== 'task' || !target.afterDependencies) return false
  const task = tasks?.[target.taskId]
  return !task || task.dependsOn.some((id) => tasks?.[id]?.status !== 'done')
}

export function openRuns(runs: readonly ScheduledRun[]): ScheduledRun[] {
  return runs.filter(isScheduleOpen)
}

// The open runs the user scheduled themselves, as the queue shows them; a routine's open run
// shows under its routine.
export function openQueueRuns(runs: readonly ScheduledRun[]): ScheduledRun[] {
  return openRuns(runs).filter((run) => run.target.kind !== 'routine')
}

export function openRunForTask(runs: readonly ScheduledRun[], taskId: string): ScheduledRun | undefined {
  return openRuns(runs).find((run) => run.target.kind === 'task' && run.target.taskId === taskId)
}

// The runs the user scheduled in a conversation; a resume core scheduled shows on its limit's card.
export function openRunsForConversation(runs: readonly ScheduledRun[], conversationId: string): ScheduledRun[] {
  return openRuns(runs).filter((run) => run.target.kind === 'conversation' && run.target.conversationId === conversationId)
}

// What a run does when it starts, in a few words.
export function runAction(run: Pick<ScheduledRun, 'target'>): string {
  const { target } = run
  if (target.kind === 'task') return target.afterDependencies ? t('schedules.executeAfterDependencies') : t('schedules.executeTask')
  if (target.kind === 'routine') return t('schedules.openAConversationWithInstructions')
  if (target.kind === 'resume') return t('schedules.resumeFromInterruptionAfterQuotaResets')
  const pictures = target.images?.length ? t('ChatComposer.images', { value1: target.images.length }) : ''
  if (target.text) return `${target.resumes ? t('schedules.resumeAndSend') : t('schedules.send')}${target.text}${pictures ? t('schedules.with', { pictures: pictures }) : ''}`
  if (pictures) return `${target.resumes ? t('schedules.resumeAndSend_2646') : t('schedules.send_2647')} ${pictures}`
  return target.resumes ? t('schedules.resumeFromInterruption') : t('schedules.approvePlanOrStartImplementation')
}

export const TARGET_LABEL: Record<ScheduledRun['target']['kind'], string> = localized(() => ({ task: t('GitInspector.task'), conversation: t('BrowserPanel.conversation'), resume: t('schedules.resume'), routine: t('OverviewView.routines') }))

// The runs that failed since the last list: told of, as nobody may have been there to see.
export function scheduleNoticesBetween(prev: readonly ScheduledRun[], next: readonly ScheduledRun[]): Notice[] {
  const before = new Map(prev.map((run) => [run.id, run.status]))
  return next.flatMap((run) => {
    const was = before.get(run.id)
    if (run.status !== 'failed' || was === undefined || was === 'failed') return []
    // A routine's runs are told of through the routine (routineNoticesBetween).
    if (run.target.kind === 'routine') return []
    const target = run.target.kind === 'task'
      ? { kind: 'task' as const, id: run.target.taskId }
      : { kind: 'conversation' as const, id: run.target.conversationId }
    const what = run.target.kind === 'resume' ? t('schedules.couldNotResumeAfterQuotaReset') : t('schedules.scheduleFailedToStart')
    return [{ title: run.title, body: `${what}：${reasonText(run.error ?? '', run.error ?? t('DiscussionView.unknownReason'))}`, target }]
  })
}
