import { AgentCalls } from './AgentCalls'
import { useAgentCalls, useAgentCallsSupported } from '../agent-calls'
import { t } from '../i18n'
import { HelperPanel } from './HelperPanel'
import { useHelper, useHelperSupported } from '../helper-conversations'
import { GitInspector } from './GitInspector'
import { useEffect, useState, type ReactNode } from 'react'
import { openTodoCount, type Conversation, type FolderChanges } from '@antumi/protocol'
import { pathShortener, usePlans } from '../chat-state'
import { clearInspectorFile, setConversationInspectorOpen, setConversationInspectorTab, showConversationPlan, showInspectorFile, useCore } from '../core-store'
import { ProjectGroups, ProjectRow, useProjectHeads } from './BranchStatus'
import { ChatPlanView } from './ChatPlan'
import { ChangedFiles, CommitList, FileDiffView, GIT_TABS, InspectorPanel, useFocusCount, type InspectorTab } from './Inspector'
import { TodoPanel } from './TodoPanel'
import { useConversationTodos, useTodosShown } from '../conversation-todos'
import { projectName } from './ProjectPicker'
import { WireLogView } from './WireLogView'
import { DiffCommentConversation } from './DiffComments'

// Read again whenever the conversation changes (every agent turn and exit), the window regains
// focus, or the user refreshes. An older core without the method has nothing to show.
export function useFolderChanges(id: string, updatedAt: number, refreshCount: number): FolderChanges[] | null {
  const gitRevision = useCore((state) => state.gitRevision)
  const rpc = useCore((state) => state.rpc)
  const focusCount = useFocusCount()
  const [changes, setChanges] = useState<{ id: string; changes: FolderChanges[] } | null>(null)
  useEffect(() => {
    if (!rpc) return
    let current = true
    void rpc.call('conversations.changes', { id })
      .catch(() => [])
      .then((found) => {
        if (current) setChanges({ id, changes: found })
      })
    return () => {
      current = false
    }
  }, [rpc, id, updatedAt, focusCount, refreshCount, gitRevision])
  return changes?.id === id ? changes.changes : null
}

function ChangeList({ changes, onOpen }: { changes: FolderChanges[] | null; onOpen: (project: string, file: string) => void }) {
  if (changes === null) return <p className="inspector-empty muted">{t('ConversationInspector.loadingChanges')}</p>
  const repos = changes.filter((folder) => folder.head !== null || folder.files.length > 0)
  if (repos.length === 0) return <p className="inspector-empty muted">{t('ConversationInspector.thisConversationSProjectIsNotInA')}</p>
  return (
    <div className="branch-status inspector-repos">
      <ProjectGroups items={repos}>
        {(folder, primary) => (
          <section key={folder.path} className="branch-status-project inspector-repo" data-primary={primary || undefined} aria-label={projectName(folder.path)}>
            <ProjectRow path={folder.path} branch={folder.branch} />
            {folder.commits === null
              ? <p className="inspector-row-empty">{t('ConversationInspector.noStartingCommitWasRecordedForThisConversation')}</p>
              : <CommitList commits={folder.commits} label={t('ConversationInspector.commitsInThisConversation')} />}
            <ChangedFiles label={t('ConversationInspector.uncommittedChanges')} files={folder.files} empty={t('ConversationInspector.noUncommittedChanges')} onOpen={(file) => onOpen(folder.path, file)} />
          </section>
        )}
      </ProjectGroups>
      <p className="branch-status-note">{t('ConversationInspector.youShareTheProjectDirectoryUncommittedChangesMay')}</p>
    </div>
  )
}

// Beside the transcript, opened by the user or by a plan the agent proposes. A conversation in
// Antumi's own folder has no changes of the user's to show, only its plans. With wire set, the
// raw traffic with its agent too (settings → 调试).
export function ConversationInspector({ conversation, widthRatio, onWidthRatioChange, wire = false, owner }: {
  conversation: Conversation
  owner?: ReactNode
  widthRatio: number
  onWidthRatioChange: (ratio: number) => void
  wire?: boolean
}) {
  const delegationSupported = useAgentCallsSupported(conversation)
  const { calls } = useAgentCalls(delegationSupported ? conversation.id : null)
  const helperSupported = useHelperSupported(conversation)
  const helper = useHelper(helperSupported ? conversation.id : null)
  const conversationId = conversation.id
  const gitRevision = useCore((state) => state.gitRevision)
  const rpc = useCore((state) => state.rpc)
  const wanted = useCore((state) => state.conversationInspectorTab)
  const selectedPlan = useCore((state) => state.conversationPlan)
  const plans = usePlans(conversation.id)
  const todosShown = useTodosShown()
  const todos = useConversationTodos(todosShown ? conversation.id : null)
  const tabs: InspectorTab[] = [...(helper ? ['helper' as const] : []), ...(calls?.length ? ['delegation' as const] : []),...(conversation.projectPaths.length > 0 ? GIT_TABS : []), ...(plans.length > 0 ? ['plan' as const] : []), ...(todosShown ? ['todos' as const] : []), ...(wire ? ['wire' as const] : [])]
  const tab = tabs.includes(wanted) ? wanted : (tabs[0] ?? 'changes')
  const [refreshCount, setRefreshCount] = useState(0)
  const [gitMaximized, setGitMaximized] = useState(false)
  useEffect(() => { setGitMaximized(false) }, [wanted, conversation.id])

  const selected = useCore((state) => state.inspectorFile?.kind === 'conversation' && state.inspectorFile.id === conversation.id ? state.inspectorFile : null)
  const changes = useFolderChanges(conversation.id, conversation.updatedAt, refreshCount)
  const heads = useProjectHeads({ kind: 'conversation', id: conversation.id }, conversation.updatedAt, refreshCount)
  const fileCount = changes?.reduce((sum, folder) => sum + folder.files.length, 0) ?? 0
  return (
    <InspectorPanel
      label={t('ConversationInspector.conversationInspector')}
      owner={owner}
      maximized={tab === 'branch' && gitMaximized}
      ratio={widthRatio}
      onRatioChange={onWidthRatioChange}
      tabs={tabs}
      tab={tab}
      onTab={setConversationInspectorTab}
      helperAwaiting={helper?.chat?.turn === 'awaiting'}
      fileCount={fileCount}
      todoCount={openTodoCount(todos)}
      onRefresh={() => setRefreshCount((count) => count + 1)}
      onClose={() => setConversationInspectorOpen(false)}
    >
      <DiffCommentConversation.Provider value={conversation.id}>
        {tab === 'helper' ? (
          <HelperPanel key={conversation.id} parent={conversation} />
        ) : tab === 'delegation' && conversation ? (
          <AgentCalls key={conversation.id} conversation={conversation} />
        ) : tab === 'todos' ? (
          <TodoPanel conversationId={conversation.id} />
        ) : tab === 'wire' ? (
          <WireLogView conversationId={conversation.id} />
        ) : tab === 'plan' ? (
          <ChatPlanView conversationId={conversation.id} plans={plans} selected={selectedPlan} onSelect={showConversationPlan} />
        ) : tab === 'branch' ? (
          <GitInspector target={{ kind: 'conversation', id: conversation.id }} heads={heads} updatedAt={conversation.updatedAt} refresh={refreshCount} maximized={gitMaximized} onMaximize={() => setGitMaximized((value) => !value)} />
        ) : selected && rpc ? (
          <FileDiffView
            file={pathShortener([selected.project])(selected.file)}
            loadKey={`${conversation.id}\0${selected.project}\0${selected.file}\0${selected.revision}\0${refreshCount}`}
            commentKey={`conversation:${conversation.id}\0${selected.project}\0${selected.file}`}
            load={() => rpc.call('conversations.diff', { id: conversation.id, project: selected.project, file: selected.file })}
            onBack={clearInspectorFile}
            edit={selected.edit}
          />
        ) : (
          <ChangeList changes={changes} onOpen={(project, file) => showInspectorFile('conversation', conversation.id, project, file)} />
        )}
      </DiffCommentConversation.Provider>
    </InspectorPanel>
  )
}
