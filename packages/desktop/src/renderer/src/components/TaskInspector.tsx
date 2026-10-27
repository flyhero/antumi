import { AgentCalls } from './AgentCalls'
import { useAgentCalls, useAgentCallsSupported } from '../agent-calls'
import { t, tr } from '../i18n'
import { HelperPanel } from './HelperPanel'
import { useHelper, useHelperSupported } from '../helper-conversations'
import { SquadWorkPanel } from './SquadWorkPanel'
import { GitInspector } from './GitInspector'
import { useEffect, useState } from 'react'
import { openTodoCount, type RepoChanges, type Task, type SquadRun } from '@antumi/protocol'
import { pathShortener, type PlanItem } from '../chat-state'
import { clearInspectorFile, setInspectorOpen, setTaskInspectorTab, showInspectorFile, showTaskPlan, useCore } from '../core-store'
import { ProjectGroups, ProjectRow, useProjectHeads } from './BranchStatus'
import { ChatPlanView } from './ChatPlan'
import { ChangedFiles, CommitList, FileDiffView, GIT_TABS, InspectorPanel, useFocusCount, type InspectorTab } from './Inspector'
import { TodoPanel } from './TodoPanel'
import { useConversationTodos, useTodosShown } from '../conversation-todos'
import { projectName } from './ProjectPicker'
import { WireLogView } from './WireLogView'
import { FileEditor } from './FileEditor'
import { DiffCommentConversation } from './DiffComments'
import { EMPTY_FILE_TABS, updateFileTabs, useFileTabs } from '../file-tabs'

// Read again whenever the task changes (every agent turn and exit), the window regains focus,
// or the user refreshes. An older core without the method has nothing to show.
function useTaskChanges(taskId: string, updatedAt: number, refreshCount: number): RepoChanges[] | null {
  const gitRevision = useCore((state) => state.gitRevision)
  const rpc = useCore((state) => state.rpc)
  const focusCount = useFocusCount()
  const [changes, setChanges] = useState<{ taskId: string; changes: RepoChanges[] } | null>(null)
  useEffect(() => {
    if (!rpc) return
    let current = true
    void rpc.call('tasks.changes', { id: taskId })
      .catch(() => [])
      .then((found) => {
        if (current) setChanges({ taskId, changes: found })
      })
    return () => {
      current = false
    }
  }, [rpc, taskId, updatedAt, focusCount, refreshCount, gitRevision])
  return changes?.taskId === taskId ? changes.changes : null
}

function ChangeList({ changes, onOpen }: { changes: RepoChanges[] | null; onOpen: (repo: string, file: string) => void }) {
  if (changes === null) return <p className="inspector-empty muted">{t('ConversationInspector.loadingChanges')}</p>
  const compared = changes.filter((repo) => repo.base)
  if (compared.length === 0) return <p className="inspector-empty muted">{t('TaskInspector.thisTaskHasNoWorktreeYetAgentChanges')}</p>
  return (
    <div className="branch-status inspector-repos">
      <ProjectGroups items={compared}>
        {(repo, primary) => (
          <section key={repo.path} className="branch-status-project inspector-repo" data-primary={primary || undefined} aria-label={projectName(repo.path)}>
            <ProjectRow path={repo.path} branch={repo.branch}>
              <span className="inspector-row-since">{tr('TaskInspector.since', { value1: <span className="mono">{repo.base}</span> })}</span>
            </ProjectRow>
            <CommitList commits={repo.commits} label={t('GitInspector.commit')} />
            <ChangedFiles label={t('TaskInspector.changes')} files={repo.files} empty={t('TaskInspector.noChangesFromStartingPoint')} onOpen={(file) => onOpen(repo.path, file)} />
          </section>
        )}
      </ProjectGroups>
    </div>
  )
}

const NO_ROOTS: readonly string[] = []

// Beside the terminal: what the agent changed since its branch started, to judge a result under
// review before accepting it.
// A chat task's inspector also shows the plans its agent proposed, and has no git to show while the
// task only plans.
export function TaskInspector({ task, widthRatio, onWidthRatioChange, plans = [], planNote, wire = false, squadRuns = [], onMemberConversation }: {
  task: Task
  squadRuns?: readonly SquadRun[]
  onMemberConversation?: (id: string) => void
  widthRatio: number
  onWidthRatioChange: (ratio: number) => void
  plans?: readonly PlanItem[]
  planNote?: (item: PlanItem) => string | null
  // The raw traffic with the task's chat agent (settings → 调试).
  wire?: boolean
}) {
  const conversationId = task.conversationId ?? ''
  const parent = useCore((state) => state.conversations[conversationId])
  const delegationSupported = useAgentCallsSupported(parent)
  const { calls } = useAgentCalls(delegationSupported ? conversationId : null)
  const helperSupported = useHelperSupported(parent)
  const helper = useHelper(helperSupported ? conversationId : null)
  const files = useFileTabs((state) => state[conversationId] ?? EMPTY_FILE_TABS)
  const fileEditor = useCore((state) => state.rpc?.features.includes('file-editor') ?? false)
  const fileRoots = parent?.projectPaths ?? NO_ROOTS
  const gitRevision = useCore((state) => state.gitRevision)
  const rpc = useCore((state) => state.rpc)
  const wanted = useCore((state) => state.taskInspectorTab)
  const selectedPlan = useCore((state) => state.taskInspectorPlan)
  const worktree = task.repos.some((repo) => repo.worktreePath !== null)
  const todosShown = useTodosShown() && task.conversationId !== null
  const todos = useConversationTodos(todosShown ? task.conversationId : null)
  const tabs: InspectorTab[] = [...(helper ? ['helper' as const] : []), ...(calls?.length ? ['delegation' as const] : []),...(squadRuns.length ? ['squad' as const] : []),...(worktree ? GIT_TABS : []), ...(plans.length > 0 ? ['plan' as const] : []), ...(todosShown ? ['todos' as const] : []), ...(wire && task.conversationId ? ['wire' as const] : []), ...(files.tabs.length > 0 || (fileEditor && fileRoots.length > 0) ? ['files' as const] : [])]
  const tab = tabs.includes(wanted) ? wanted : (tabs[0] ?? 'changes')
  useEffect(() => {
    if (wanted !== 'files') updateFileTabs(conversationId, (state) => state.maximized ? { ...state, maximized: false } : state)
  }, [conversationId, wanted])
  useEffect(() => () => {
    updateFileTabs(conversationId, (state) => state.maximized ? { ...state, maximized: false } : state)
  }, [conversationId])
  const [refreshCount, setRefreshCount] = useState(0)
  const [gitMaximized, setGitMaximized] = useState(false)
  useEffect(() => { setGitMaximized(false) }, [wanted, task.id])

  const selected = useCore((state) => state.inspectorFile?.kind === 'task' && state.inspectorFile.id === task.id ? state.inspectorFile : null)
  const selectedFolder = task.repos.find((repo) => repo.path === selected?.project)?.worktreePath
  const changes = useTaskChanges(task.id, task.updatedAt, refreshCount)
  const heads = useProjectHeads({ kind: 'task', id: task.id }, task.updatedAt, refreshCount)
  const fileCount = changes?.reduce((sum, repo) => sum + repo.files.length, 0) ?? 0
  const onEmpty = () => {
    const other = tabs.find((tab) => tab !== 'files')
    if (other) setTaskInspectorTab(other)
    else setInspectorOpen(false)
  }
  return (
    <InspectorPanel
      label={t('TaskInspector.taskInspector')}
      maximized={(tab === 'files' && files.maximized) || (tab === 'branch' && gitMaximized)}
      ratio={widthRatio}
      onRatioChange={onWidthRatioChange}
      tabs={tabs}
      tab={tab}
      onTab={setTaskInspectorTab}
      helperAwaiting={helper?.chat?.turn === 'awaiting'}
      fileCount={fileCount}
      todoCount={openTodoCount(todos)}
      onRefresh={() => setRefreshCount((count) => count + 1)}
      onClose={() => setInspectorOpen(false)}
    >
      <DiffCommentConversation.Provider value={task.conversationId}>
        {tab === 'helper' && parent ? (
          <HelperPanel key={parent.id} parent={parent} />
        ) : tab === 'delegation' && parent ? (
          <AgentCalls key={parent.id} conversation={parent} />
        ) : tab === 'squad' ? (
          <SquadWorkPanel runs={squadRuns} onConversation={(id) => onMemberConversation?.(id)} />
        ) : tab === 'todos' && task.conversationId ? (
          <TodoPanel conversationId={task.conversationId} />
        ) : tab === 'files' ? (
          <FileEditor conversationId={conversationId} roots={fileRoots} updatedAt={task.updatedAt} inspector="task" editor={fileEditor} onEmpty={onEmpty} />
        ) : tab === 'wire' && task.conversationId ? (
          <WireLogView conversationId={task.conversationId} />
        ) : tab === 'plan' ? (
          <ChatPlanView conversationId={task.conversationId ?? null} plans={plans} selected={selectedPlan} onSelect={showTaskPlan} note={planNote} />
        ) : tab === 'branch' ? (
          <GitInspector target={{ kind: 'task', id: task.id }} heads={heads} updatedAt={task.updatedAt} refresh={refreshCount} maximized={gitMaximized} onMaximize={() => setGitMaximized((value) => !value)} />
        ) : selected && rpc ? (
          <FileDiffView
            file={selectedFolder ? pathShortener([selectedFolder])(selected.file) : selected.file}
            loadKey={`${task.id}\0${selected.project}\0${selected.file}\0${selected.revision}\0${refreshCount}`}
            commentKey={`task:${task.id}\0${selected.project}\0${selected.file}`}
            load={() => rpc.call('tasks.diff', { id: task.id, repo: selected.project, file: selected.file })}
            onBack={clearInspectorFile}
            edit={selected.edit}
          />
        ) : (
          <ChangeList changes={changes} onOpen={(repo, file) => showInspectorFile('task', task.id, repo, file)} />
        )}
      </DiffCommentConversation.Provider>
    </InspectorPanel>
  )
}
