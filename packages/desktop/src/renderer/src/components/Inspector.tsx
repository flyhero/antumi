import { localized, t, tr } from '../i18n'
import { useContext, useEffect, useState, type ReactNode } from 'react'
import { RpcError, type ChangedFile, type Commit, type FileDiff } from '@antumi/protocol'
import { revealChatEdit, useCore } from '../core-store'
import type { ChatEdit } from '../inspector-file'
import type { BranchTarget } from './BranchStatus'
import { CommentableDiff, DiffCommentConversation } from './DiffComments'
import { DiffLines } from './DiffLines'
import { ArrowLeftIcon, ChevronRightIcon, CloseIcon, RefreshIcon } from './icons'
import { PanelSeparator } from './PanelSeparator'

// The pieces both inspectors are built from: a task's, beside its terminal, and a conversation's.

const KIND: Record<ChangedFile['kind'], { mark: string; text: string }> = localized(() => ({
  added: { mark: 'A', text: t('Inspector.added') },
  modified: { mark: 'M', text: t('Inspector.modified') },
  deleted: { mark: 'D', text: t('ChatCommandSettings.delete') },
  renamed: { mark: 'R', text: t('ConversationActions.rename') },
  untracked: { mark: 'U', text: t('Inspector.newFileNotYetTrackedByGit') }
}))

// Bumps whenever the window regains focus: the user may have changed files meanwhile.
export function useFocusCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const onFocus = () => setCount((current) => current + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  return count
}

// The files a task's worktrees or a conversation's projects have changed, whichever the target is;
// read again as updatedAt and refresh move, and when the window regains focus.
export function useChangedFiles(target: BranchTarget | null, updatedAt: number, refresh: number): ChangedFile[] | null {
  const gitRevision = useCore((state) => state.gitRevision)
  const rpc = useCore((state) => state.rpc)
  const focusCount = useFocusCount()
  const key = target ? `${target.kind}:${target.id}` : null
  const [files, setFiles] = useState<{ key: string; files: ChangedFile[] } | null>(null)
  useEffect(() => {
    if (!rpc || !target || !key) return
    let current = true
    const read = target.kind === 'task'
      ? rpc.call('tasks.changes', { id: target.id }).then((repos) => repos.flatMap((repo) => repo.files))
      : rpc.call('conversations.changes', { id: target.id }).then((folders) => folders.flatMap((folder) => folder.files))
    void read.catch(() => []).then((found) => {
      if (current) setFiles({ key, files: found })
    })
    return () => {
      current = false
    }
  }, [rpc, key, updatedAt, focusCount, refresh, gitRevision])
  return files?.key === key ? files.files : null
}

export type InspectorTab = 'changes' | 'branch' | 'plan' | 'todos' | 'wire' | 'squad' | 'helper' | 'delegation'

const TAB_LABEL: Record<InspectorTab, string> = localized(() => ({ changes: t('Inspector.changes'), branch: t('GitInspector.branches_1030'), plan: t('chatTools.plan'), todos: t('chatTools.toDos'), wire: t('Inspector.rawData'), squad: t('ChatPlan.squad'), helper: t('HelperPanel.helper'), delegation: t('AgentProfiles.calls') }))
export const GIT_TABS: readonly InspectorTab[] = ['changes', 'branch']

export function InspectorPanel({ label, ratio, onRatioChange, tabs = GIT_TABS, tab, onTab, fileCount, todoCount = 0, helperAwaiting = false, onRefresh, onClose, maximized = false, owner, children }: {
  maximized?: boolean
  // Above the tabs, whose it is where that is not plain: a split's column.
  owner?: ReactNode
  label: string
  ratio: number
  onRatioChange: (ratio: number) => void
  tabs?: readonly InspectorTab[]
  tab: InspectorTab
  onTab: (tab: InspectorTab) => void
  fileCount: number
  // To-dos not done yet, counted on their tab.
  helperAwaiting?: boolean
  todoCount?: number
  onRefresh: () => void
  onClose: () => void
  children: ReactNode
}) {
  return (
    <>
      {!maximized && <PanelSeparator panelName={t('ConversationView.inspector')} ratio={ratio} onRatioChange={onRatioChange} />}
      <aside
        className="side-panel inspector-panel"
        data-maximized={maximized || undefined}
        aria-label={label}
        style={{ flexBasis: maximized ? '100%' : `calc((100% - var(--side-panel-separator-size)) * ${ratio})` }}
      >
        {owner && <div className="inspector-owner">{owner}</div>}
        <header className="inspector-header">
          <div className="inspector-tabs" role="tablist" aria-label={t('ConversationView.inspector')}>
            {tabs.map((each) => (
              <button key={each} type="button" role="tab" aria-selected={tab === each} onClick={() => onTab(each)}>
                {TAB_LABEL[each]}{each === 'helper' && helperAwaiting && <span className="helper-attention-dot" role="img" aria-label={t('ConversationView.helperNeedsYourResponse')} />}{each === 'changes' && fileCount > 0 && <span className="count">{fileCount}</span>}
                {each === 'todos' && todoCount > 0 && <span className="count">{todoCount}</span>}
              </button>
            ))}
          </div>
          {tab !== 'helper' && tab !== 'delegation' && tab !== 'plan' && tab !== 'wire' && tab !== 'todos' && (
            <button type="button" className="tool-button inspector-refresh" aria-label={t('BrowserPanel.reload')} data-tooltip={t('BrowserPanel.reload')} onClick={onRefresh}>
              <RefreshIcon />
            </button>
          )}
          <button type="button" className="tool-button" aria-label={t('ConversationView.collapseInspector')} data-tooltip={t('ChatPlan.collapse')} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="inspector-body" role="tabpanel">
          {children}
        </div>
      </aside>
    </>
  )
}

// A row of the inspector: what it counts, the count as a pill, and anything else to say.
export function InspectorRow({ label, count, children }: { label: string; count?: string | number; children?: ReactNode }) {
  return (
    <div className="inspector-row">
      <span className="inspector-row-label">{label}</span>
      {count !== undefined && <span className="inspector-pill">{count}</span>}
      {children}
    </div>
  )
}

// The commits, folded behind a row with their count; at most 50 are read.
export function CommitList({ commits, label }: { commits: readonly Commit[]; label: string }) {
  const count = commits.length >= 50 ? '50+' : commits.length
  if (commits.length === 0) return <InspectorRow label={label} count={0} />
  return (
    <details className="inspector-fold inspector-commits">
      <summary className="inspector-row">
        <span className="chat-tool-chevron" aria-hidden="true"><ChevronRightIcon /></span>
        <span className="inspector-row-label">{label}</span>
        <span className="inspector-pill">{count}</span>
      </summary>
      <ul>
        {commits.map((commit) => (
          <li key={commit.sha}>
            <span className="mono">{commit.sha}</span> {commit.subject}
          </li>
        ))}
      </ul>
    </details>
  )
}

// The files changed, open under a row with how many and how much, which folds them away; `empty`
// reads when there are none.
export function ChangedFiles({ label, files, empty, onOpen }: { label: string; files: readonly ChangedFile[]; empty: string; onOpen: (file: string) => void }) {
  if (files.length === 0) {
    return (
      <>
        <InspectorRow label={label} count={0} />
        <p className="inspector-row-empty">{empty}</p>
      </>
    )
  }
  return (
    <details className="inspector-fold" open>
      <summary className="inspector-row">
        <span className="chat-tool-chevron" aria-hidden="true"><ChevronRightIcon /></span>
        <span className="inspector-row-label">{label}</span>
        <span className="inspector-pill">{tr('Inspector.files', { value1: files.length })}</span>
        <LineCounts className="inspector-row-counts" {...changeLineTotals(files)} />
      </summary>
      <FileList files={files} onOpen={onOpen} />
    </details>
  )
}

// Lines added and removed, in the colours the chat's change summary uses.
function LineCounts({ className, added, removed }: { className: string; added: number; removed: number }) {
  return (
    <span className={`${className} mono`}>
      <span className="chat-diff-added">+{added}</span> <span className="chat-diff-removed">−{removed}</span>
    </span>
  )
}

export function changeLineTotals(files: readonly ChangedFile[]): { added: number; removed: number } {
  const added = files.reduce((sum, file) => sum + (file.additions ?? 0), 0)
  const removed = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0)
  return { added, removed }
}

export function FileList({ files, onOpen }: { files: readonly ChangedFile[]; onOpen: (file: string) => void }) {
  return (
    <ul className="changed-files">
      {files.map((file) => {
        const slash = file.path.lastIndexOf('/')
        return (
          <li key={file.path}>
            <button
              type="button"
              className="changed-file"
              data-kind={file.kind}
              title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
              onClick={() => onOpen(file.path)}
            >
              <span className="change-kind" data-kind={file.kind} aria-label={KIND[file.kind].text}>{KIND[file.kind].mark}</span>
              <span className="changed-file-name">
                {file.path.slice(slash + 1)}
                {slash > 0 && <span className="muted"> {file.path.slice(0, slash)}</span>}
              </span>
              {file.additions === null || file.deletions === null
                ? <span className="changed-file-counts mono">{file.kind === 'untracked' ? t('Inspector.newFile') : t('Inspector.binary')}</span>
                : <LineCounts className="changed-file-counts" added={file.additions} removed={file.deletions} />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// `load` is asked again whenever `loadKey` changes; a stale answer never replaces a newer one.
// commentKey names the diff for comments on its lines, where the inspector has a chat to send them
// to; it outlasts a reload, as loadKey does not.
// edit is the turn that changed the file, offered once git no longer has it changed.
export function FileDiffView({ file, loadKey, commentKey, load, onBack, edit }: {
  file: string
  loadKey: string
  commentKey?: string
  load: () => Promise<FileDiff>
  onBack: () => void
  edit?: ChatEdit | null
}) {
  const conversationId = useContext(DiffCommentConversation)
  const [result, setResult] = useState<{ key: string; diff: FileDiff | null; gone: boolean } | null>(null)
  useEffect(() => {
    let current = true
    void load().then(
      (diff) => current && setResult({ key: loadKey, diff, gone: false }),
      (error: unknown) => current && setResult({ key: loadKey, diff: null, gone: error instanceof RpcError && error.reason === 'file-not-changed' })
    )
    return () => {
      current = false
    }
  }, [loadKey])
  const shown = result?.key === loadKey ? result : null
  return (
    <div className="file-diff">
      <div className="file-diff-header">
        <button type="button" className="tool-button" aria-label={t('Inspector.backToFileList')} data-tooltip={t('Inspector.backToFileList')} onClick={onBack}>
          <ArrowLeftIcon />
        </button>
        <span className="mono file-diff-path" title={file}>{file}</span>
      </div>
      {!shown ? (
        <p className="inspector-empty muted">{t('Inspector.loadingDiff')}</p>
      ) : !shown.diff ? (
        <div className="inspector-empty muted">
          <p>{shown.gone ? t('Inspector.thisFileIsNoLongerChangedItMay') : t('Inspector.failedToReadDiff')}</p>
          {shown.gone && edit && <button type="button" className="button" onClick={() => revealChatEdit(edit)}>{t('Inspector.viewThisTurnSEdits')}</button>}
        </div>
      ) : (
        <>
          {conversationId && commentKey
            ? <CommentableDiff patch={shown.diff.diff} path={file} conversationId={conversationId} diffKey={commentKey} />
            : <DiffLines patch={shown.diff.diff} path={file} />}
          {shown.diff.truncated && <p className="inspector-empty muted">{t('Inspector.diffTruncatedToTheFirst256kb')}</p>}
        </>
      )}
    </div>
  )
}
