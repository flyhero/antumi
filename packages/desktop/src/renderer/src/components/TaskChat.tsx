import { useAgentCallsSupported } from '../agent-calls'
import { getLocale, t, tr } from '../i18n'
import { useHelperSupported } from '../helper-conversations'
import { useEffect, useMemo, useState } from 'react'
import { checkChatResume, shortTaskId, type AgentKind, type Squad, type Task } from '@antumi/protocol'
import { usePlans, type PlanItem } from '../chat-state'
import { loadConversation, perform, showBrowserPanel, showInspectorFile, showTaskChanges, showTaskPlan, useChatOptionsSupported, useCore, useWireLogShown } from '../core-store'
import { insideProjects, locateInspectorFile } from '../inspector-file'
import { agentLabel, reasonText, STATUS_LABEL } from '../labels'
import { waitingOn } from '../task-waiting'
import { confirmQuota } from './AgentQuota'
import { BranchStatus } from './BranchStatus'
import type { ChatSurface } from './chat-surface'
import { ConversationChat } from './ConversationChat'
import { primaryProjectName } from './ProjectPicker'
import { DEFAULT_SIDE_PANEL_RATIO } from './side-panel-size'
import { SourceLink } from './SourceLink'
import { StatusIcon } from './StatusIcon'
import { useSquadRuns } from '../squads'
import { TaskInspector } from './TaskInspector'
import { TaskAlerts } from './TaskAlerts'
import { TaskToolbar } from './TaskActions'
import { Spinner } from './Spinner'
import { BoardCrumb } from './TaskBoard'
import { useTaskHandoff } from './TaskHandoff'
import { useTodosShown } from '../conversation-todos'
import { WorkingSummary } from './WorkingSummary'
import { useTaskActivity } from '../work-activity'

// What the task kept of a plan in its chat: saved for when it can run. An approved one reads as its
// answer already does, so it needs no word.
function planNote(task: Task, item: PlanItem): string | null {
  const { plan } = task
  const kept = plan && plan.stageId === item.stageId && plan.requestId === item.requestId
  return kept ? plan.approved && task.squadId ? t('TaskChat.assignedToDevelopmentSquad') : !plan.approved ? t('TaskChat.savedExecuteAfterDependenciesFinish') : null : null
}

// A message to a task's chat goes through the task first unless its agent is at work: the task checks
// what it may do, lays its worktrees out and goes back to running. A planning agent is checked every
// time, as the task's projects may change while it plans and it should follow them.
function taskSurface(task: Task, dependencies: readonly Task[], planOnly: boolean, bypassable: boolean, handoff: ((agent?: AgentKind) => void) | null, squad: Squad | null): ChatSurface {
  const blocker = checkChatResume(task, dependencies)
  return {
    inspector: 'task',
    showPlan: showTaskPlan,
    showChanges: showTaskChanges,
    showFileChange: (path, edit) => {
      const conversation = task.conversationId ? useCore.getState().conversations[task.conversationId] : undefined
      if (!conversation) return
      const projects = task.repos.flatMap((repo) => repo.worktreePath ? [{ project: repo.path, folder: repo.worktreePath }] : [])
      const found = locateInspectorFile(path, conversation.workspacePath, projects)
      if (found) showInspectorFile('task', task.id, found.project, found.file, edit)
    },
    inProject: (path) => {
      const conversation = task.conversationId ? useCore.getState().conversations[task.conversationId] : undefined
      const folders = task.repos.flatMap((repo) => repo.worktreePath ? [repo.worktreePath] : [])
      return conversation ? insideProjects(path, conversation.workspacePath, folders) : false
    },
    showBrowser: () => showBrowserPanel(task.conversationId),
    changes: task.repos.some((repo) => repo.worktreePath !== null) ? { kind: 'task', id: task.id } : null,
    changesHint: t('TaskChat.uncommittedTaskWorktreeChangesClickToViewIn'),
    prepareSend: async (stopped) => {
      if (!stopped && task.status === 'running') return true
      if (stopped && task.agent && !await confirmQuota(task.agent)) return false
      const allowBypass = bypassable ? { allowBypass: true } : {}
      return Boolean(await perform((rpc) => rpc.call('tasks.resumeChat', { id: task.id, ...allowBypass })))
    },
    sendBlocker: blocker && reasonText(blocker, blocker),
    handoffPlan: !task.squadId && useCore.getState().rpc?.features.includes('squads') ? (item) => useCore.setState({ taskLaunchId: task.id, squadPlan: { stageId: item.stageId, requestId: item.requestId } }) : undefined,
    // The squad's own leader planned it: approving starts the squad on the plan, in the mode picked
    // when planning began, the leader going on from there.
    squadStart: squad && task.status === 'pending' && planOnly && dependencies.every((dependency) => dependency.status === 'done')
      ? {
          name: squad.name,
          start: async (item) => {
            const started = await perform((rpc) => rpc.call('squads.start', {
              id: task.id, squadId: squad.id, permissionMode: task.launch.permissionMode ?? 'ask', allowBypass: true,
              plan: { stageId: item.stageId, requestId: item.requestId }
            }))
            if (started) useCore.setState({ inspectorOpen: true, taskInspectorTab: 'squad' })
          }
        }
      : undefined,
    savePlan: planOnly
      ? async (item) => {
          await perform((rpc) => rpc.call('tasks.savePlan', { id: task.id, stageId: item.stageId, requestId: item.requestId }))
        }
      : null,
    planNote: (item) => planNote(task, item),
    handoff,
    fork: null
  }
}

// A started task: its chat, the task's own header and toolbar above, and the task's inspector beside
// it with the plans its agent proposed.
export function TaskChat({ taskId }: { taskId: string }) {
  const task = useCore((s) => s.tasks[taskId])
  const tasks = useCore((s) => s.tasks)
  const runs = useSquadRuns(taskId)
  const activity = useTaskActivity(task)
  const memberChatId = useCore((state) => state.taskMemberConversationId)
  const setMemberChatId = (id: string | null) => useCore.setState({ taskMemberConversationId: id })
  const memberConversation = useCore((state) => memberChatId ? state.conversations[memberChatId] : undefined)
  const conversationId = task?.conversationId ?? null
  const conversation = useCore((s) => (conversationId ? s.conversations[conversationId] : undefined))
  const delegationSupported = useAgentCallsSupported(conversation)
  const helperSupported = useHelperSupported(conversation)
  const inspectorOpen = useCore((s) => s.inspectorOpen)
  const starting = useCore((s) => s.startingTasks.includes(taskId))
  const bypassable = useChatOptionsSupported()
  const [sidePanelRatio, setSidePanelRatio] = useState(DEFAULT_SIDE_PANEL_RATIO)
  const plans = usePlans(conversationId ?? '')
  const wire = useWireLogShown() && conversationId !== null
  const todosShown = useTodosShown() && conversationId !== null
  const handoff = useTaskHandoff(task)
  const { open: openHandoff } = handoff
  const handoffNow = handoff.available && handoff.blocker === null

  useEffect(() => {
    if (memberChatId && !memberConversation) void loadConversation(memberChatId)
    if (conversationId && !conversation) void loadConversation(conversationId)
  }, [conversationId, conversation, memberChatId, memberConversation])

  // Handed in for review, the task opens on what it changed.
  const status = task?.status
  useEffect(() => {
    if (status === 'review') showTaskChanges()
  }, [status])

  const dependencies = useMemo(
    () => (task ? task.dependsOn.map((id) => tasks[id]).filter((dependency) => dependency !== undefined) : []),
    [task, tasks, getLocale()]
  )
  const squad = useCore((s) => (task?.squadId ? s.squads[task.squadId] ?? null : null))
  const surface = useMemo(
    () => (task ? taskSurface(task, dependencies, conversation?.planOnly ?? false, bypassable, handoffNow ? (agent?: AgentKind) => openHandoff(agent) : null, squad) : null),
    [task, dependencies, conversation?.planOnly, bypassable, handoffNow, openHandoff, squad, getLocale()]
  )
  if (!task || !surface) {
    return null
  }
  const worktree = task.repos.some((repo) => repo.worktreePath !== null)
  const showInspector = inspectorOpen && (delegationSupported || helperSupported || worktree || runs.length > 0 || plans.length > 0 || wire || todosShown)

  return (
    <section className="detail terminal-view" aria-label={t('TaskChat.chat', { value1: task.title })}>
      <header className="detail-header task-terminal-header">
        <BoardCrumb />
        <StatusIcon status={task.status} waiting={waitingOn(task, tasks)} decorative />
        <div className="header-meta">
          <span className="terminal-view-title" title={task.title}>
            {task.title}
          </span>
          {task.agent && <span className="muted">{agentLabel(task.agent)}</span>}
          {task.repos.length > 0 && (
            <span className="muted" title={task.repos.map((repo) => repo.path).join('\n')}>
              {primaryProjectName(task.repos.map((repo) => repo.path))}
            </span>
          )}
          <BranchStatus target={{ kind: 'task', id: task.id }} updatedAt={task.updatedAt} />
          <span className="status-pill" data-status={task.status}>
            {STATUS_LABEL[task.status]}
          </span>
          <TaskAlerts task={task} />
          <span className="muted mono">{shortTaskId(task.id)}</span>
          <SourceLink source={task.source} />
          {conversation?.planOnly && <span className="task-tag task-tag-refining">{task.squadId ? t('TaskChat.leaderIsPlanning') : t('TaskChat.readOnlyPlanning')}</span>}
        </div>
        {task.squadId && activity && (
          <button type="button" className="working-chip" title={t('TaskChat.viewSquadInInspector')} onClick={() => useCore.setState({ inspectorOpen: true, taskInspectorTab: 'squad' })}>
            <WorkingSummary activity={activity} detail={false} />
          </button>
        )}
        <TaskToolbar task={task} view="chat" />
      </header>
      {memberChatId && <div className="squad-member-nav"><button type="button" className="button ghost" onClick={() => setMemberChatId(null)}>{t('TaskChat.backToLeader')}</button><span>{memberConversation?.title ?? t('TaskChat.loadingMemberConversation')}</span></div>}
      <div className="terminal-body">
        {memberChatId ? (
          memberConversation ? <ConversationChat conversation={memberConversation} surface={{ ...surface, showBrowser: () => showBrowserPanel(memberConversation.id), prepareSend: async () => false, sendBlocker: t('TaskChat.theLeaderCoordinatesMemberAssignmentsReturnToThe'), handoffPlan: undefined, savePlan: null, handoff: null }} /> : <p className="muted">{t('TaskChat.loadingMemberConversation')}</p>
        ) : conversation ? (
          <ConversationChat conversation={conversation} surface={surface} />
        ) : starting ? (
          // Before core has the chat: it is getting the code and the agent ready, which can take a while.
          <div className="task-chat-starting" role="status">
            <Spinner />
            <span>{tr('TaskChat.startingSyncingCodeAndPreparingWorkspaceThisMay', { value1: task.agent ? agentLabel(task.agent) : 'Agent' })}</span>
          </div>
        ) : (
          <p className="terminal-view-empty muted">{t('TaskChat.loadingChatHistory')}</p>
        )}
        {showInspector && (
          <TaskInspector
            task={task}
            squadRuns={runs}
            onMemberConversation={setMemberChatId}
            widthRatio={sidePanelRatio}
            onWidthRatioChange={setSidePanelRatio}
            plans={plans}
            planNote={(item) => planNote(task, item)}
            wire={wire}
          />
        )}
      </div>
    </section>
  )
}
