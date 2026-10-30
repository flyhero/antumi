import { t, tr } from '../i18n'
import { useHelper, useHelperSupported } from '../helper-conversations'
import { useAgentCalls, useAgentCallsSupported } from '../agent-calls'
import { useCallback, useState, type ReactElement } from 'react'
import {
  agentDescriptor,
  checkCancel,
  checkMove,
  checkScheduleTask,
  checkStart,
  checkStartMode,
  checkSubmit,
  isFinished,
  manualMoves,
  shortTaskId,
  startKind,
  type ChatPermissionMode,
  type ChatTurnActivity,
  type Task,
  type TaskStatus
} from '@antumi/protocol'
import { openChatWhileStarting, perform, selectTask, setInspectorOpen, setSchedulesOpen, showTaskChanges, showView, updateTask, useChatOptionsSupported, useCore, useSchedulesSupported, useTaskCancelSupported, useTaskLaunchSupported, useTaskRedoInPlace, useWireLogShown, useWorktreesSupported, type TaskView } from '../core-store'
import { resolveModel, useAgentCatalog } from '../agent-models'
import { reasonText, STATUS_HINT, STATUS_LABEL } from '../labels'
import { waitingOn } from '../task-waiting'
import { AgentPicker } from './AgentPicker'
import { confirmQuota, modelText } from './AgentQuota'
import { providerFor } from '../model-provider-choice'
import { useProjectCheckRunning } from './ProjectRunNotice'
import { OtherProjectsHint } from './OtherProjectsHint'
import { PickerItem } from './ChatPicker'
import { effortLabel, modeLabel, modeOptions } from './ChatOptionsBar'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { ChatIcon, CheckIcon, ChevronDownIcon, ClockIcon, CloseIcon, CopyIcon, DocumentIcon, FolderRemoveIcon, HandoffIcon, InspectorIcon, MoreIcon, PencilIcon, PlayIcon, ReopenIcon, SubmitIcon, TrashIcon } from './icons'
import { Popover } from './Popover'
import { cleanWithConfirm } from './WorktreeManager'
import { TaskExecutorPicker } from './TaskExecutorPicker'
import { SchedulePicker } from './SchedulePicker'
import { StatusIcon } from './StatusIcon'
import { useTaskHandoff, type TaskHandoff } from './TaskHandoff'
import { launchOptions, TaskModelPicker, useEditsInPlace, useTaskLaunch, type TaskLaunch } from './TaskLaunch'
import { createSchedule, openRunForTask, scheduleState } from '../schedules'
import { useOpenTodoCount, useTodosShown } from '../conversation-todos'
import { askConfirm } from '../confirm-dialog'

function blockerText(blocker: string, waitingOn: readonly Task[]): string {
  if (blocker === 'blocked' && waitingOn.length > 0) {
    return t('TaskActions.waitingFor', { value1: waitingOn.map((dependency) => `「${dependency.title}」${dependency.status === 'review' ? t('TaskActions.acceptReview') : t('ChatSubagents.done')}`).join('、') })
  }
  return reasonText(blocker, blocker)
}

type MoveAction = { label: string; Icon: () => ReactElement; primary: boolean }

// Manual moves only ever close a task; continuing and redoing have their own buttons.
// Closing a task under review is accepting its result, the step that frees its dependents.
function moveAction(from: TaskStatus, to: TaskStatus): MoveAction | null {
  if (to !== 'done') return null
  return from === 'review' ? { label: t('TaskActions.accept'), Icon: CheckIcon, primary: true } : { label: t('TaskActions.markDone'), Icon: CheckIcon, primary: false }
}

async function moveTask(taskId: string, status: TaskStatus): Promise<void> {
  await perform((rpc) => rpc.call('tasks.move', { id: taskId, status }))
}

function moveBlocker(task: Task, status: TaskStatus): string | null {
  const blocker = checkMove(task, status)
  return blocker && reasonText(blocker, blocker)
}

// Looks disabled while blocked but still answers a click with the reason:
// a dead button that never says why is the confusing kind.
// `labelled` says what it does in words, for a row in the page rather than a header of icons.
function LaunchButton({
  label,
  className,
  Icon,
  reason,
  launch,
  labelled = false,
  tooltip
}: {
  label: string
  className?: string
  Icon: () => ReactElement
  reason: string | null
  launch: () => Promise<void>
  labelled?: boolean
  // What a labelled button says on hover beyond its label.
  tooltip?: string
}) {
  const [explaining, setExplaining] = useState(false)
  const [starting, setStarting] = useState(false)
  const close = useCallback(() => setExplaining(false), [])
  const blocked = reason !== null

  return (
    <span className="menu-anchor">
      <button
        type="button"
        className={`${labelled ? 'button' : 'tool-button'} launch-button ${className ?? ''}`}
        aria-label={label}
        aria-disabled={blocked}
        aria-busy={starting}
        aria-haspopup={blocked ? 'dialog' : undefined}
        aria-expanded={blocked ? explaining : undefined}
        data-tooltip={reason ? t('TaskActions.cannotYet', { label: label, reason: reason }) : labelled ? tooltip : label}
        data-tooltip-align={labelled ? 'start' : undefined}
        onClick={async () => {
          if (blocked) {
            setExplaining((open) => !open)
          } else if (!starting) {
            setStarting(true)
            await launch()
            setStarting(false)
          }
        }}
      >
        <Icon />
        {labelled && label}
      </button>
      {explaining && reason && (
        <Popover label={t('TaskActions.cannotYet_1957', { label: label })} onClose={close}>
          <p className="menu-note">{tr('TaskActions.cannotYet', { label: label, reason: reason })}</p>
        </Popover>
      )}
    </span>
  )
}

// Hand the pane to the task's chat, as long as the user is still on this task.
function showChatFor(taskId: string): void {
  if (useCore.getState().selectedId === taskId) {
    showView('chat')
  }
}

function bypassOption(bypassable: boolean): { allowBypass?: boolean } {
  return bypassable ? { allowBypass: true } : {}
}

// A task's agent with its quota used up would stall at once; the user decides. One on a model
// provider spends the provider's plan instead.
async function quotaAllows(taskId: string): Promise<boolean> {
  const task = useCore.getState().tasks[taskId]
  return !task?.agent || onProvider(task) || confirmQuota(task.agent)
}

function onProvider(task: Task): boolean {
  const conversation = task.conversationId ? useCore.getState().conversations[task.conversationId] : undefined
  return conversation ? conversation.route?.reason === 'served' : Boolean(task.launch.modelProvider)
}

// Both the toolbar and context menu open the same launch configuration.
async function startTask(taskId: string): Promise<void> {
  useCore.setState({ taskLaunchId: taskId })
}

async function submitTask(taskId: string): Promise<void> {
  if (await perform((rpc) => rpc.call('tasks.submit', { id: taskId }))) {
    showTaskChanges()
  }
}

// What a chat task's agent is doing, for the rule that it is not handed in mid-turn.
export function useChatTurn(task: Task) {
  return useCore((s) => {
    const conversation = task.conversationId ? s.conversations[task.conversationId] : undefined
    return conversation?.sessionId ? (conversation.chat?.turn ?? null) : null
  })
}

// The one step a task's card on the board offers, under the toolbar's rules: what moves the task
// on from where it stands, or the chat where its agent waits for an answer.
export type CardAction = { label: string; reason: string | null; run: () => void }

export function cardAction(task: Task, dependencies: readonly Task[], turn: ChatTurnActivity | null): CardAction | null {
  switch (task.status) {
    case 'pending': {
      const blocker = checkStart(task, dependencies)
      if (blocker === 'planning') return { label: t('TaskActions.viewPlanning'), reason: null, run: () => selectTask(task.id) }
      return {
        label: startKind(dependencies) === 'plan' ? t('SquadLaunchDialog.startPlanning') : t('TaskActions.startExecution'),
        reason: blocker && blockerText(blocker, unfinished(dependencies)),
        run: () => void startTask(task.id)
      }
    }
    case 'running': {
      if (turn === 'awaiting') return { label: t('TaskActions.answer'), reason: null, run: () => selectTask(task.id) }
      const blocker = checkSubmit(task, turn)
      return { label: t('TaskActions.submitForReview'), reason: blocker && reasonText(blocker, blocker), run: () => void submitTask(task.id) }
    }
    case 'review':
      return { label: t('TaskActions.accept'), reason: moveBlocker(task, 'done'), run: () => void moveTask(task.id, 'done') }
    default:
      return null
  }
}

// Deleting stops a live agent, so it asks first. Worktrees stay on disk either way.
async function deleteTask(task: Task): Promise<void> {
  if (await askConfirm({ message: t('TaskActions.deleteTaskExistingWorktreesAreKept', { value1: task.title, value2: task.status === 'running' ? t('TaskActions.theRunningAgentWillBeStopped') : '' }), confirm: t('ChatCommandSettings.delete'), danger: true })) {
    await perform((rpc) => rpc.call('tasks.delete', { id: task.id }))
  }
}

// Cancelling stops the agent and keeps the rest, so it asks first, saying what stays.
async function cancelTask(task: Task): Promise<void> {
  const stops = task.status === 'running' ? t('TaskActions.agentWillStop') : ''
  if (await askConfirm({ message: t('TaskActions.cancelTaskChatHistoryAndWorktreesAreKept', { value1: task.title, stops: stops }), confirm: t('TaskActions.cancelTask'), cancel: t('ConfirmDialog.back') })) {
    await perform((rpc) => rpc.call('tasks.cancel', { id: task.id }))
  }
}

export function reopenTask(task: Task): Promise<Task | null> {
  return perform((rpc) => rpc.call('tasks.reopen', { id: task.id }))
}

// What the task menus offer for giving a task up or bringing it back, where core takes them.
function useCancelling(task: Task): { label: string; Icon: () => ReactElement; run: () => void } | null {
  const supported = useTaskCancelSupported()
  const tasks = useCore((s) => s.tasks)
  if (!supported) return null
  if (task.status === 'abandoned') {
    // One abandoned for a redo, before redoing kept the task, has its successor carrying on.
    if (Object.values(tasks).some((other) => other.derivedFrom === task.id)) return null
    return { label: t('TaskActions.reopen'), Icon: ReopenIcon, run: () => void reopenTask(task) }
  }
  return checkCancel(task) === null ? { label: t('TaskActions.cancelTask'), Icon: CloseIcon, run: () => void cancelTask(task) } : null
}

function copyTaskId(taskId: string): void {
  void navigator.clipboard.writeText(taskId).catch(() => {})
}

function unfinished(dependencies: readonly Task[]): Task[] {
  return dependencies.filter((dependency) => dependency.status !== 'done')
}

// Redoing gives up this attempt, so it asks first, and takes the reason along to the next one.
// An older core redoes it as a new task, which is then the one to show.
function RedoButton({ task, labelled }: { task: Task; labelled: boolean }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const inPlace = useTaskRedoInPlace()
  const close = useCallback(() => setOpen(false), [])
  const redo = async () => {
    setBusy(true)
    const redone = await perform((rpc) => rpc.call('tasks.redo', { id: task.id, reason: reason.trim() || undefined }))
    setBusy(false)
    if (redone) {
      close()
      setReason('')
      selectTask(redone.id)
    }
  }
  const kept = task.repos.flatMap((repo) => (repo.branch ? [`${repo.branch}-try${task.attempts.length + 1}`] : []))
  return (
    <span className="menu-anchor">
      <button
        type="button"
        className={labelled ? 'button' : 'tool-button'}
        aria-label={t('TaskActions.redo')}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip={inPlace ? t('TaskActions.redoFromScratchSaveThisAttemptSChanges') : t('TaskActions.discardThisResultAndCreateASuccessorTask')}
        data-tooltip-align={labelled ? 'start' : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <ReopenIcon />
        {labelled && t('TaskActions.redo')}
      </button>
      {open && (
        <Popover label={t('TaskActions.redoTask')} onClose={close}>
          <div className="note-form">
            <p className="note-form-title">{t('TaskActions.redoFromScratch')}</p>
            {inPlace ? (
              <p className="menu-note">{tr('TaskActions.agentStopsThisAttemptSChangesIncludingUncommitted', { value1: kept.length > 0 ? kept.join('、') : '…-try' })}</p>
            ) : (
              <p className="menu-note">{t('TaskActions.createATaskInheritingTheTitleDetailsProjects')}</p>
            )}
            <textarea
              className="input note-form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('TaskActions.whyRedoOptionalSharedWithTheNextAgent')}
              maxLength={500}
              rows={3}
            />
            <div className="note-form-actions">
              <button type="button" className="button ghost" onClick={close}>{t('TaskActions.back')}</button>
              <button type="button" className="button primary" disabled={busy} onClick={() => void redo()}>
                {busy ? t('TaskActions.redoing') : t('TaskActions.redo')}
              </button>
            </div>
          </div>
        </Popover>
      )}
    </span>
  )
}

// While a task can only plan and already has a chat, return to it instead of launching again.
function StartButton({ task, dependencies, labelled }: { task: Task; dependencies: readonly Task[]; labelled: boolean }) {
  const starting = useCore((s) => s.startingTasks.includes(task.id))
  const blocker = checkStart(task, dependencies)
  if (blocker === 'planning') {
    return labelled ? (
      <button type="button" className="button primary" onClick={() => showView('chat')}>{tr('TaskActions.planningViewConversation', { value1: <ChatIcon /> })}</button>
    ) : (
      <button type="button" className="tool-button run-button" aria-pressed="true" aria-label={t('TaskActions.planningViewConversation_1979')} data-tooltip={t('TaskActions.planningViewConversation_1979')} onClick={() => showView('chat')}>
        <ChatIcon />
      </button>
    )
  }
  const plan = startKind(dependencies) === 'plan'
  return (
    <LaunchButton
      label={plan ? t('SquadLaunchDialog.startPlanning') : t('TaskActions.startExecution')}
      className={labelled ? 'primary' : 'run-button'}
      Icon={plan ? ChatIcon : PlayIcon}
      reason={starting ? t('SettingsPage.starting') : blocker && blockerText(blocker, unfinished(dependencies))}
      launch={() => startTask(task.id)}
      labelled={labelled}
    />
  )
}

// Carrying the task out later, unattended: once its time comes and its agent has quota again.
// Once scheduled, the button says when and leads to the page of scheduled runs.
function ScheduleButton({ task, dependencies, labelled }: { task: Task; dependencies: readonly Task[]; labelled: boolean }) {
  const supported = useSchedulesSupported() && (task.agent === null || agentDescriptor(task.agent).capabilities.unattended)
  const scheduled = useCore((s) => openRunForTask(s.schedules, task.id))
  const tasks = useCore((s) => s.tasks)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  // A scheduled run takes the task's model and effort (its mode is the unattended one).
  const launchSupported = useTaskLaunchSupported()
  const providers = useCore((s) => s.modelProviders)
  const conversationProvider = useCore((s) => (task.conversationId ? s.conversations[task.conversationId]?.modelProvider : undefined))
  const catalog = useAgentCatalog(task.agent, open && launchSupported, providerFor(providers, conversationProvider ?? task.launch.modelProvider, task.agent))
  const { model, effort } = resolveModel(catalog, { model: task.launch.model ?? undefined, effort: task.launch.effort ?? undefined })
  const runsIn = model ? t('TaskActions.use', { value1: model.label, value2: effort ? ` · ${effortLabel(effort)}` : '' }) : ''
  if (!supported) return null
  if (scheduled) {
    const state = scheduleState(scheduled, Date.now(), tasks)
    return labelled ? (
      <button type="button" className="button task-scheduled" data-tooltip={t('TaskActions.viewScheduledExecution')} data-tooltip-align="start" onClick={() => setSchedulesOpen(true)}>{tr('TaskActions.scheduled', { value1: <ClockIcon />, state: state })}</button>
    ) : (
      <button type="button" className="tool-button task-scheduled" aria-pressed="true" aria-label={t('TaskActions.scheduled_1983', { state: state })} data-tooltip={t('TaskActions.scheduled_1983', { state: state })} onClick={() => setSchedulesOpen(true)}>
        <ClockIcon />
      </button>
    )
  }
  const blocker = checkScheduleTask(task, dependencies)
  const reason = blocker && blockerText(blocker === 'dependencies-unfinished' ? 'blocked' : blocker, unfinished(dependencies))
  return (
    <span className="menu-anchor">
      <button
        type="button"
        className={labelled ? 'button launch-button' : 'tool-button'}
        aria-label={t('TaskActions.scheduleExecution')}
        aria-disabled={reason !== null}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip={reason ? t('TaskActions.cannotScheduleYet', { reason: reason }) : t('TaskActions.scheduleExecutionWhenQuotaResetsOrAtA')}
        data-tooltip-align={labelled ? 'start' : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <ClockIcon />
        {labelled && t('SchedulePicker.schedule')}
      </button>
      {open && (reason ? (
        <Popover label={t('TaskActions.cannotScheduleYet_1987')} onClose={close}>
          <p className="menu-note">{tr('TaskActions.cannotScheduleYet', { reason: reason })}</p>
        </Popover>
      ) : (
        <SchedulePicker
          title={t('TaskActions.scheduleExecution')}
          note={`${task.plan ? t('TaskActions.implementTheSavedPlanWhenDueWithoutPlanning') : t('TaskActions.implementTaskDetailsWhenDueWithoutPlanningAgain')}${runsIn}`}
          onSchedule={async (notBefore) => (await createSchedule({ kind: 'task', taskId: task.id }, notBefore)) !== null}
          onClose={close}
        />
      ))}
    </span>
  )
}

// Started from the details as the task keeps its launch, so the dialog is not needed there.
async function startNow(task: Task, launch: TaskLaunch): Promise<void> {
  if (!task.agent || (!onProvider(task) && !await confirmQuota(task.agent, modelText(launch.model)))) return
  const bypass = useCore.getState().rpc?.features.includes('chat-options') ? { allowBypass: true } : {}
  await openChatWhileStarting(task.id, () => perform((rpc) => rpc.call('tasks.start', { id: task.id, ...bypass, ...launchOptions(launch) })))
}

function startLabel(mode: ChatPermissionMode): string {
  return mode === 'plan' ? t('SquadLaunchDialog.startPlanning') : mode === 'readOnly' ? t('TaskActions.startAnalysis') : t('TaskActions.executeDirectly')
}

// Starts at once in the mode the task keeps; the menu beside it picks that mode, planning first or
// carrying the task out directly, and how freely the agent then acts.
function StartSplitButton({ task, dependencies, launch }: { task: Task; dependencies: readonly Task[]; launch: TaskLaunch }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const writes = launch.mode !== 'plan' && launch.mode !== 'readOnly'
  const inPlace = useEditsInPlace(task)
  const starting = useCore((s) => s.startingTasks.includes(task.id))
  const agent = task.agent
  if (!agent) return null
  const blocker = checkStart(task, dependencies)
  const options = modeOptions(agent, launch.offered, launch.offered.filter((mode) => !checkStartMode(dependencies, mode)))
  const option = (mode: string) => options.find((each) => each.value === mode)
  const item = (mode: ChatPermissionMode) => {
    const each = option(mode)
    return each && (
      <PickerItem
        key={mode}
        option={each}
        checked={mode === launch.mode}
        onSelect={() => {
          close()
          if (mode !== launch.mode) void updateTask(task.id, { launch: { ...task.launch, permissionMode: mode } })
        }}
      />
    )
  }
  const direct = launch.offered.filter((mode) => mode !== 'plan' && mode !== 'readOnly')
  const described = option(launch.mode)
  return (
    <>
      <span className="split-button">
        <LaunchButton
          label={startLabel(launch.mode)}
          className="primary"
          Icon={launch.mode === 'plan' ? ChatIcon : PlayIcon}
          reason={starting ? t('SettingsPage.starting') : blocker && blockerText(blocker, unfinished(dependencies))}
          launch={() => startNow(task, launch)}
          labelled
          tooltip={described?.description ? `${modeLabel(agent, launch.mode)}：${described.description}` : undefined}
        />
        <span className="menu-anchor">
          <button
            type="button"
            className={`button split-button-toggle ${blocker ? '' : 'primary'}`}
            aria-label={t('TaskActions.chooseHowToStart')}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDownIcon />
          </button>
          {open && (
            <Popover label={t('TaskActions.howToStart')} onClose={close}>
              {launch.planOnly && <p className="menu-note">{t('TaskActions.dependenciesAreUnfinishedOnlyPlanningIsAvailableNow')}</p>}
              <div className="chat-picker-heading">{t('TaskActions.planFirst')}</div>
              {item('plan')}
              {direct.length > 0 && <div className="chat-picker-heading">{t('TaskActions.executeDirectly')}</div>}
              {direct.map(item)}
              {launch.offered.includes('readOnly') && (
                <>
                  <div className="menu-separator" />
                  {item('readOnly')}
                </>
              )}
            </Popover>
          )}
        </span>
      </span>
      {writes && inPlace && <p className="task-launch-note">{t('SquadLaunchDialog.thisProjectIsNotAGitRepositoryChanges')}</p>}
      <OtherProjectsHint agent={agent} projectCount={task.repos.length} />
    </>
  )
}

function SubmitButton({ task, labelled }: { task: Task; labelled: boolean }) {
  const checking = useProjectCheckRunning(task.conversationId)
  const turn = useChatTurn(task)
  const blocker = checking ? 'check-running' : checkSubmit(task, turn)
  return (
    <LaunchButton
      label={t('TaskActions.submitForReview')}
      className={labelled ? 'primary' : 'run-button'}
      Icon={SubmitIcon}
      reason={blocker && reasonText(blocker, blocker)}
      launch={() => submitTask(task.id)}
      labelled={labelled}
    />
  )
}

function MoveButton({ task, to, labelled }: { task: Task; to: TaskStatus; labelled: boolean }) {
  const action = moveAction(task.status, to)
  if (!action) return null
  return (
    <LaunchButton
      label={action.label}
      className={action.primary ? (labelled ? 'primary' : 'run-button') : undefined}
      Icon={action.Icon}
      reason={moveBlocker(task, to)}
      launch={() => moveTask(task.id, to)}
      labelled={labelled}
    />
  )
}

// A finished task's worktrees can go: their commits stay on the branch, and going on lays them out
// again. Core checks each as it stands; an older core has nothing to clean with.
function useWorktreeCleaning(task: Task): (() => void) | null {
  const supported = useWorktreesSupported()
  const paths = task.repos.flatMap((repo) => (repo.worktreePath ? [repo.worktreePath] : []))
  if (!supported || paths.length === 0 || (task.status !== 'done' && task.status !== 'abandoned')) return null
  return () => void cleanWithConfirm(paths, paths.length > 1 ? t('TaskActions.thisTaskSWorktrees', { value1: paths.length }) : t('TaskActions.thisTaskSWorktree'))
}

function MoreMenu({ task }: { task: Task }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const clean = useWorktreeCleaning(task)
  const cancelling = useCancelling(task)
  return (
    <span className="menu-anchor">
      <button
        type="button"
        className="tool-button"
        aria-label={t('FileEditor.moreActions')}
        data-tooltip={t('FileEditor.moreActions')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreIcon />
      </button>
      {open && (
        <Popover label={t('FileEditor.moreActions')} onClose={close}>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              close()
              copyTaskId(task.id)
            }}
          >{tr('TaskActions.copyTaskId', { value1: <span className="menu-item-icon"><CopyIcon /></span>, value2: <span className="menu-item-path mono">{shortTaskId(task.id)}…</span> })}</button>
          {clean && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                clean()
              }}
            >{tr('TaskActions.cleanWorktree', { value1: <span className="menu-item-icon"><FolderRemoveIcon /></span>, value2: <span className="menu-item-path">{t('TaskActions.branchKept')}</span> })}</button>
          )}
          {cancelling && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                cancelling.run()
              }}
            >
              <span className="menu-item-icon"><cancelling.Icon /></span>
              {cancelling.label}
            </button>
          )}
          <div className="menu-separator" />
          <button
            type="button"
            className="menu-item menu-item-danger"
            onClick={() => {
              close()
              void deleteTask(task)
            }}
          >{tr('TaskActions.deleteTask', { value1: <span className="menu-item-icon"><TrashIcon /></span> })}</button>
        </Popover>
      )}
    </span>
  )
}

// Between the details and where the agent works.
function ViewToggle({ view }: { view: TaskView }) {
  const next = view === 'chat' ? 'detail' : 'chat'
  const label = next === 'detail' ? t('TaskActions.viewDetails') : t('TaskActions.viewChat')
  return (
    <button type="button" className="tool-button" aria-label={label} data-tooltip={label} onClick={() => showView(next)}>
      {next === 'detail' ? <DocumentIcon /> : <ChatIcon />}
    </button>
  )
}

// The inspector sits beside the chat, so from the details the button switches over to open it.
function InspectorToggle({ view, conversationId }: { view: TaskView; conversationId: string }) {
  const parent = useCore((state) => state.conversations[conversationId])
  const helperSupported = useHelperSupported(parent)
  const helper = useHelper(helperSupported ? conversationId : null)
  const open = useCore((s) => s.inspectorOpen)
  const pressed = view === 'chat' && open
  const todoLeft = useOpenTodoCount(useTodosShown() ? conversationId : null)
  return (
    <button
      type="button"
      className="tool-button"
      aria-label={todoLeft > 0 ? t('ConversationView.inspectorToDos_739', { todoLeft: todoLeft }) : t('ConversationView.inspector')}
      aria-pressed={pressed}
      data-tooltip={pressed ? t('ConversationView.collapseInspector') : todoLeft > 0 ? t('ConversationView.inspectorToDos', { todoLeft: todoLeft }) : t('ConversationView.viewChanges')}
      onClick={() => {
        setInspectorOpen(!pressed)
        if (view !== 'chat') showView('chat')
      }}
    >
      <InspectorIcon />
      {helper?.chat?.turn === 'awaiting' && <span className="helper-attention-dot tool-button-dot" role="img" aria-label={t('ConversationView.helperNeedsYourResponse')} />}
      {!pressed && todoLeft > 0 && <span className="tool-button-badge" aria-hidden="true">{todoLeft}</span>}
    </button>
  )
}

// Beside the agent, as a free conversation has it: looks disabled while the agent works, and
// says why when pressed.
function HandoffButton({ handoff, labelled }: { handoff: TaskHandoff; labelled: boolean }) {
  const { blocker } = handoff
  return (
    <button
      type="button"
      className={`${labelled ? 'button' : 'tool-button'} launch-button`}
      aria-label={t('TaskActions.handOffToAnotherAgent')}
      aria-disabled={blocker !== null}
      data-tooltip={blocker ? t('TaskActions.cannotHandOffYet', { blocker: blocker }) : t('TaskActions.handOffToAnotherAgent')}
      data-tooltip-align={labelled ? 'start' : undefined}
      onClick={() => {
        if (!blocker) handoff.open()
      }}
    >
      <HandoffIcon />
      {labelled && t('ChatComposer.handOff')}
    </button>
  )
}

// Who carries the task out and what moves it on. Icons in the chat's header; in the details, a row of
// labelled buttons under the title, led by the one step the task waits for. There, closing a task by
// hand is left to its status, unless it is the accepting that a task under review waits for.
export function TaskSteps({ task, labelled = false }: { task: Task; labelled?: boolean }) {
  const tasks = useCore((s) => s.tasks)
  const dependencies = task.dependsOn.map((id) => tasks[id]).filter((dependency) => dependency !== undefined)
  const handoff = useTaskHandoff(task)
  // A running task's agent changes only by handing its chat over; otherwise the next start or
  // message takes the new one, which a chat already begun is handed to.
  const handsOff = task.status === 'running' && handoff.available
  const squadsSupported = useCore((state) => state.rpc?.features.includes('squads') ?? false)
  const agent = (squadsSupported && (task.status === 'pending' || task.squadId) ? <TaskExecutorPicker task={task} size={labelled ? 'large' : undefined} /> :
    <AgentPicker
      agent={task.agent}
      locked={task.status === 'abandoned' || (task.status === 'running' && !handsOff)}
      labelled={labelled}
      onChange={(agent) => {
        if (!handsOff) void updateTask(task.id, { agent })
        else if (agent) handoff.open(agent)
      }}
    />
  )
  // From the details a task starts at once as it keeps its launch; a planning task's chat is open.
  const launch = useTaskLaunch(task, dependencies, labelled && !task.squadId && task.status === 'pending' && checkStart(task, dependencies) !== 'planning')
  const moves = labelled ? manualMoves(task.status).filter((status) => moveAction(task.status, status)?.primary) : manualMoves(task.status)
  const start = task.status === 'pending' && (launch
    ? <StartSplitButton task={task} dependencies={dependencies} launch={launch} />
    : <StartButton task={task} dependencies={dependencies} labelled={labelled} />)
  const submit = !task.squadId && task.status === 'running' && <SubmitButton task={task} labelled={labelled} />
  const moveButtons = moves.map((status) => <MoveButton key={status} task={task} to={status} labelled={labelled} />)
  // A finished task goes on by a message in its chat.
  const redo = isFinished(task.status) && <RedoButton task={task} labelled={labelled} />
  const handoffButton = handoff.available && <HandoffButton handoff={handoff} labelled={labelled} />
  const schedule = task.status === 'pending' && <ScheduleButton task={task} dependencies={dependencies} labelled={labelled} />
  return labelled ? (
    <>
      {start}
      {submit}
      {moveButtons}
      {redo}
      {agent}
      {launch && <TaskModelPicker task={task} launch={launch} />}
      {handoffButton}
      {schedule}
    </>
  ) : (
    <>
      {agent}
      {handoffButton}
      {start}
      {schedule}
      {submit}
      {moveButtons}
      {redo}
    </>
  )
}

// The task's header. The chat has no title row of its own, so the steps ride in it there; the
// details have theirs under the title. Where to look and closing end the row in both panes, so
// switching between them never moves those.
export function TaskToolbar({ task, view }: { task: Task; view: TaskView }) {
  const parent = useCore((state) => state.conversations[task.conversationId ?? ''])
  const delegationSupported = useAgentCallsSupported(parent)
  const { calls } = useAgentCalls(delegationSupported ? parent?.id ?? null : null)
  const helperSupported = useHelperSupported(parent)
  const helper = useHelper(helperSupported ? parent?.id ?? null : null)
  const worktree = task.repos.some((repo) => repo.worktreePath !== null)
  const wire = useWireLogShown()
  const todosShown = useTodosShown()
  return (
    <div className="toolbar">
      {view === 'chat' && <TaskSteps task={task} />}
      {task.conversationId && (calls?.length || helper || worktree || wire || todosShown) ? <InspectorToggle view={view} conversationId={task.conversationId} /> : null}
      {task.conversationId && <ViewToggle view={view} />}
      <MoreMenu task={task} />
      <span className="toolbar-separator" aria-hidden="true" />
      <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={() => selectTask(null)}>
        <CloseIcon />
      </button>
    </div>
  )
}

// The task's status as a line of the details. Opening it says what the status means and offers
// the moves the user may make from it by hand.
export function TaskStatusMenu({ task }: { task: Task }) {
  const tasks = useCore((s) => s.tasks)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const waiting = waitingOn(task, tasks)
  const moves = manualMoves(task.status).flatMap((to) => {
    const action = moveAction(task.status, to)
    return action ? [{ to, action }] : []
  })
  return (
    <span className="menu-anchor">
      <button type="button" className="task-prop" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <StatusIcon status={task.status} waiting={waiting} decorative />
        {STATUS_LABEL[task.status]}
      </button>
      {open && (
        <Popover label={t('TaskActions.status')} onClose={close}>
          <p className="menu-note">{waiting > 0 ? t('StatusIcon.waitingForTasksToFinish', { waiting: waiting }) : STATUS_HINT[task.status]}</p>
          {moves.length > 0 && <div className="menu-separator" />}
          {moves.map(({ to, action }) => (
            <button
              key={to}
              type="button"
              className="menu-item"
              disabled={moveBlocker(task, to) !== null}
              onClick={() => {
                close()
                void moveTask(task.id, to)
              }}
            >
              <action.Icon />
              <span className="menu-item-title">{action.label}</span>
            </button>
          ))}
        </Popover>
      )}
    </span>
  )
}

// The row's right-click menu: the toolbar's one-step actions, under the same rules.
export function TaskContextMenu({ task, at, onClose, onRename }: {
  task: Task
  at: MenuPoint
  onClose: () => void
  onRename: () => void
}) {
  const tasks = useCore((s) => s.tasks)
  const dependencies = task.dependsOn.map((id) => tasks[id]).filter((dependency) => dependency !== undefined)
  const pick = (action: () => void) => () => {
    onClose()
    action()
  }
  const hint = (blocker: string | null) => blocker && blockerText(blocker, unfinished(dependencies))
  const bypassable = useChatOptionsSupported()
  const turn = useChatTurn(task)
  const startBlocker = task.status === 'pending' ? checkStart(task, dependencies) : null
  const clean = useWorktreeCleaning(task)
  const cancelling = useCancelling(task)
  const actions: ReactElement[] = []
  if (task.status === 'pending' && startBlocker !== 'planning') {
    const plan = startKind(dependencies) === 'plan'
    actions.push(
      <MenuItem key="start" label={plan ? t('SquadLaunchDialog.startPlanning') : t('TaskActions.startExecution')} icon={plan ? <ChatIcon /> : <PlayIcon />} hint={hint(startBlocker)} disabled={startBlocker !== null} onSelect={pick(() => void startTask(task.id))} />
    )
  }
  if (task.status === 'running') {
    const blocker = checkSubmit(task, turn)
    actions.push(
      <MenuItem key="submit" label={t('TaskActions.submitForReview')} icon={<SubmitIcon />} hint={blocker && reasonText(blocker, blocker)} disabled={blocker !== null} onSelect={pick(() => void submitTask(task.id))} />
    )
  }
  for (const status of manualMoves(task.status)) {
    const action = moveAction(task.status, status)
    const blocker = moveBlocker(task, status)
    if (action) {
      actions.push(
        <MenuItem key={status} label={action.label} icon={<action.Icon />} hint={blocker} disabled={blocker !== null} onSelect={pick(() => void moveTask(task.id, status))} />
      )
    }
  }
  if (task.conversationId) {
    actions.push(
      <MenuItem
        key="work"
        label={t('TaskActions.viewChat')}
        icon={<ChatIcon />}
        onSelect={pick(() => {
          selectTask(task.id)
          showView('chat')
        })}
      />
    )
  }
  return (
    <ContextMenu at={at} label={t('TaskActions.actionsForTask', { value1: task.title })} onClose={onClose}>
      {actions}
      {actions.length > 0 && <div className="menu-separator" role="separator" />}
      <MenuItem label={t('ConversationActions.rename')} icon={<PencilIcon />} onSelect={pick(onRename)} />
      <MenuItem label={t('TaskActions.copyTaskId_2008')} icon={<CopyIcon />} hint={`${shortTaskId(task.id)}…`} onSelect={pick(() => copyTaskId(task.id))} />
      {clean && <MenuItem label={t('TaskActions.cleanWorktree_2009')} icon={<FolderRemoveIcon />} hint={t('TaskActions.branchKept')} onSelect={pick(clean)} />}
      {cancelling && <MenuItem label={cancelling.label} icon={<cancelling.Icon />} onSelect={pick(cancelling.run)} />}
      <div className="menu-separator" role="separator" />
      <MenuItem label={t('TaskActions.deleteTask_2010')} icon={<TrashIcon />} danger onSelect={pick(() => void deleteTask(task))} />
    </ContextMenu>
  )
}
