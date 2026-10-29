import { getLocale, localized, t, tr } from '../i18n'
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import type { GitAction, GitBranch, GitCommit, GitComparison, GitDetail, GitHistory, GitResult, GitStatus, GitTag, GitTarget } from '@antumi/protocol'
import { checkGitOperation, gitTargetKey, RpcError, trackedBranch } from '@antumi/protocol'
import { perform, openGit, openTerminal, useCore } from '../core-store'
import { gitGraph } from '../git-graph'
import { commitRefs } from '../git-refs'
import { GitBranchTree } from './GitBranchTree'
import { GitLayout } from './GitLayout'
import { reasonText } from '../labels'
import { openResolvedFile, showResolvedFile } from '../file-actions'
import { useOccludesBrowser } from '../browser-occlusion'
import { CommitMessageButton } from './CommitMessageButton'
import { commitSubject, commitWithWrittenMessage, useCanWriteCommitMessage, useWritingCommit } from '../written-commits'
import { GitRefLabel, GitRefName } from './GitRefLabel'
import { ContextMenu, MenuItem, menuPoint, MenuRadioItem, MenuSubmenu, type MenuPoint } from './ContextMenu'
import { FileDiffView, FileList, useFocusCount } from './Inspector'
import { BranchIcon, LinkIcon, RefreshIcon, CheckIcon, ClockIcon, CloseIcon, CommitIcon, CompareIcon, CopyIcon, DocumentIcon, MergeIcon, PencilIcon, StarIcon, TagIcon, TrashIcon } from './icons'
import { ChatPicker } from './ChatPicker'
import { GitPushDialog, GitPushRejectedDialog } from './GitPushDialog'
import { setPreference, usePreferences } from '../preferences'
import { CopyButton } from './CopyButton'
import { projectName } from './ProjectPicker'

function ReadState({ error, retry, children }: { error: string | null; retry: () => void; children?: ReactNode }) {
  return error ? <p className="git-message" role="alert">{error} <button className="button" onClick={retry}>{t('ChatContextMenu.retry')}</button></p> : <>{children}</>
}

function useGitRead<T>(key: string, read: () => Promise<T>, keepPrevious = false) {
  const [result, setResult] = useState<{ key: string; data?: T; error: string | null } | null>(null)
  useEffect(() => {
    let live = true
    void read().then((data) => { if (live) setResult({ key, data, error: null }) }, (error: unknown) => {
      if (live) setResult({ key, error: error instanceof Error ? error.message : String(error) })
    })
    return () => { live = false }
  }, [key])
  return result?.key === key || (keepPrevious && result?.data) ? result : null
}

type DialogKind = 'create' | 'tag' | 'detach' | 'rename' | 'delete' | 'push' | 'commit' | 'merge' | 'rebase' | 'abort' | 'update'
// What the dialog acts on: a branch from the tree, or a commit from the history.
type DialogChoice = { kind: DialogKind; branch?: GitBranch; commit?: GitCommit; source?: GitTag; from?: string }

export function GitRepository({ target, updatedAt = 0, refresh = 0 }: { target: GitTarget; updatedAt?: number; refresh?: number }) {
  const rpc = useCore((s) => s.rpc)
  const revision = useCore((s) => s.gitRevision)
  const focus = useFocusCount()
  const [version, setVersion] = useState(0)
  const [selected, setSelected] = useState('HEAD')
  const [query, setQuery] = useState('')
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [detailView, setDetailView] = useState(false)
  // The branch or commit compared with HEAD, while a comparison shows.
  const [comparison, setComparison] = useState<string | null>(null)
  const [branchesCollapsed, setBranchesCollapsed] = useState(false)
  const [direct, setDirect] = useState(false)
  const [dialog, setDialog] = useState<DialogChoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ message: string; persistent?: boolean } | null>(null)
  useEffect(() => {
    if (!note || note.persistent) return
    const timer = setTimeout(() => setNote(null), 5_000)
    return () => clearTimeout(timer)
  }, [note])
  const refreshKey = `${updatedAt}:${refresh}:${revision}:${focus}:${version}`
  const key = `${gitTargetKey(target)}:${refreshKey}:${rpc ? 'connected' : 'disconnected'}`
  const retry = () => setVersion((n) => n + 1)
  const state = useGitRead(key, async () => {
    if (!rpc) throw new Error(t('GitInspector.notConnectedToCore'))
    return rpc.call('git.status', target)
  }, true)
  const status = state?.data
  const branch = status?.branches.find((branch) => branch.ref === selected)
  const ref = selected === 'all' || selected === 'HEAD' || branch || status?.tags?.some((tag) => tag.ref === selected) ? selected : 'HEAD'
  const writing = useWritingCommit(target)
  const disabled = busy || writing || Boolean(status?.blocker) || !status?.git || Boolean(status?.readOnly)
  // intercept: true when it took the error over (opened a dialog for it), so it goes unreported.
  const execute = async (action: GitAction, intercept?: (error: unknown) => boolean): Promise<GitResult | null> => {
    if (busy) return null
    setBusy(true)
    setNote(null)
    try {
      const result = await perform(async (rpc) => {
        try {
          return await rpc.call('git.execute', { ...target, action })
        } catch (error) {
          if (intercept?.(error)) return null
          throw error
        }
      })
      if (!result) return null
      setNote({ message: resultNote(action, result, status?.rebase === true), persistent: result.state === 'conflicts' || result.stash === 'kept' })
      if (action.kind === 'switch' || action.kind === 'detach' || (action.kind === 'create' && action.checkout) || action.kind === 'rename') {
        setSelected('HEAD'); setSelectedCommit(null); setComparison(null)
      }
      return result
    } finally { setBusy(false); retry() }
  }
  const run = async (action: GitAction) => Boolean(await execute(action, (error) => {
    // The fetch can find the branch checked out diverged after all: ask how to take it in.
    const diverged = action.kind === 'update' && !action.method && error instanceof RpcError && error.reason === 'git-update-diverged'
    const entry = diverged ? status?.branches.find((branch) => branch.ref === action.ref) : undefined
    if (!entry || entry.ref !== `refs/heads/${status?.branch}`) return false
    setDialog({ kind: 'update', branch: entry })
    return true
  }))
  // The dialog is gone by then: the agent writes the message, and the commit follows behind it.
  const commitWritten = async (push: boolean) => {
    const done = await commitWithWrittenMessage(target, async (message) => (await run({ kind: 'commit', message, push })) || null)
    if (done) setNote({ message: t('GitInspector.committed', { value1: commitSubject(done.message), value2: push ? t('GitInspector.andPushed') : '' }) })
  }
  const updateSupported = rpc?.features.includes('git-update') ?? false
  // As IntelliJ's Update: the branch checked out asks how once it has diverged; any other just fast-forwards.
  const update = (entry: GitBranch) => {
    if (entry.ref === `refs/heads/${status?.branch}` && (entry.ahead ?? 0) > 0 && (entry.behind ?? 0) > 0) setDialog({ kind: 'update', branch: entry })
    else void run({ kind: 'update', ref: entry.ref })
  }
  const currentBranch = status?.branches.find((entry) => entry.ref === `refs/heads/${status.branch}`)
  const pushTargetSupported = rpc?.features.includes('git-push-target') ?? false
  const [rejected, setRejected] = useState<{ remote: string; name: string } | null>(null)
  // A push its own upstream rejected can take the upstream in and go again; one to another branch
  // cannot, as updating takes in the upstream, not the target.
  const pushTo = async (remote: string, name: string): Promise<void> => {
    const tracked = trackedBranch(currentBranch)
    const retriable = updateSupported && tracked?.remote === remote && tracked.name === name
    const pushed = await execute({ kind: 'push', remote, name, from: status?.branch ?? undefined }, (error) => {
      if (!retriable || !(error instanceof RpcError) || error.reason !== 'git-push-rejected') return false
      setDialog(null)
      const method = usePreferences.getState().gitPushRejectedUpdate
      if (method === 'ask') setRejected({ remote, name })
      else void updateAndPush(method, remote, name)
      return true
    })
    if (!pushed) return
    setDialog(null)
    setNote({ message: t('GitPush.pushed', { target: `${remote}/${name}` }) })
  }
  const updateAndPush = async (method: 'merge' | 'rebase', remote: string, name: string) => {
    setRejected(null)
    if (!currentBranch) return
    const updated = await execute({ kind: 'update', ref: currentBranch.ref, method })
    if (!updated) return
    if (updated.state === 'conflicts') setNote({ message: t('GitPush.updateStopped'), persistent: true })
    else await pushTo(remote, name)
  }
  // Opened on the state as it is now, not as the page last read it: a branch switched elsewhere
  // would otherwise push from the wrong one.
  const openPush = () => { retry(); setDialog({ kind: 'push' }) }
  const pick = (ref: string) => { setSelected(ref); setSelectedCommit(null); setComparison(null); setDetailView(false) }
  const actionReason = (action: GitAction) => status?.blocker ?? (busy || writing ? t('GitInspector.processing') : checkGitOperation(target.kind, action, false, status))
  const can = (action: GitAction) => !disabled && !actionReason(action)
  const hint = (action: GitAction) => { const reason = actionReason(action); return reason === 'task-conversation' ? t('GitPage.keepTaskBranch') : reason ? reasonText(reason, reason) : null }
  const favoritesSupported = rpc?.features.includes('git-favorites') ?? false
  const [favoriting, setFavoriting] = useState<Set<string>>(new Set())
  const toggleFavorite = async (entry: GitBranch) => {
    if (favoriting.has(entry.ref)) return
    setFavoriting((refs) => new Set([...refs, entry.ref]))
    try {
      await perform((rpc) => rpc.call('git.favorite', { ...target, ref: entry.ref, favorite: !entry.favorite }))
    } finally {
      setFavoriting((refs) => new Set([...refs].filter((ref) => ref !== entry.ref)))
      retry()
    }
  }
  const [trackOpen, setTrackOpen] = useState(false)
  const track = (entry: GitBranch, upstream: string | null, close: () => void) => { setTrackOpen(false); close(); void run({ kind: 'track', ref: entry.ref, upstream }) }
  const branchActions = (entry: GitBranch, close: () => void) => <>
    {favoritesSupported && <MenuItem label={entry.favorite ? t('GitInspector.removeFavorite') : t('GitInspector.addFavorite')} icon={<StarIcon />} disabled={favoriting.has(entry.ref)} onSelect={() => { close(); void toggleFavorite(entry) }} />}
    <MenuItem label={t('GitInspector.viewHistory')} icon={<ClockIcon />} onSelect={() => { pick(entry.ref); close() }} />
    <MenuItem label={t('GitInspector.switchToThisBranch')} icon={<CheckIcon />} hint={entry.ref === `refs/heads/${status?.branch}` ? t('GitInspector.currentBranch') : hint({ kind: 'switch', ref: entry.ref })} disabled={!can({ kind: 'switch', ref: entry.ref }) || entry.ref === `refs/heads/${status?.branch}` || Boolean(entry.worktree && entry.worktree !== status?.directory)} onSelect={() => { close(); void run({ kind: 'switch', ref: entry.ref }) }} />
    {updateSupported && !entry.remote && entry.upstream && <MenuItem label={t('GitInspector.updateFromRemote')} icon={<RefreshIcon />} hint={hint({ kind: 'update', ref: entry.ref })} disabled={!can({ kind: 'update', ref: entry.ref })} onSelect={() => { close(); update(entry) }} />}
    <div className="menu-separator" role="separator" />
    {pushTargetSupported && !entry.remote && <MenuSubmenu label={t('GitInspector.trackedBranch')} icon={<LinkIcon />} value={hint({ kind: 'track', ref: entry.ref, upstream: null }) ?? entry.upstream?.replace(/^refs\/remotes\//, '') ?? t('GitInspector.noTrackedBranch')} disabled={!can({ kind: 'track', ref: entry.ref, upstream: null })} open={trackOpen && can({ kind: 'track', ref: entry.ref, upstream: null })} onOpen={() => setTrackOpen(true)} onClose={() => setTrackOpen(false)}>
      <MenuItem label={t('GitInspector.untrack')} disabled={!entry.upstream || !can({ kind: 'track', ref: entry.ref, upstream: null })} onSelect={() => track(entry, null, close)} />
      <div className="menu-separator" role="separator" />
      {status?.branches.filter((remote) => remote.remote).map((remote) => <MenuRadioItem key={remote.ref} label={`${remote.remote}/${remote.name}`} checked={entry.upstream === remote.ref} onSelect={() => track(entry, remote.ref, close)} />)}
    </MenuSubmenu>}
    <MenuItem label={t('GitInspector.newBranchFromHere')} icon={<BranchIcon />} hint={hint({ kind: 'create', ref: entry.ref, name: 'new', checkout: false })} disabled={!can({ kind: 'create', ref: entry.ref, name: 'new', checkout: false })} onSelect={() => { setDialog({ kind: 'create', branch: entry }); close() }} />
    <MenuItem label={t('GitInspector.compareWithCurrentBranch')} icon={<CompareIcon />} disabled={!status?.head} onSelect={() => { pick(entry.ref); setComparison(entry.ref); setDetailView(true); close() }} />
    <div className="menu-separator" role="separator" />
    <MenuItem label={t('GitInspector.mergeIntoCurrentBranch')} icon={<MergeIcon />} hint={entry.ref === `refs/heads/${status?.branch}` ? t('GitInspector.currentBranch') : hint({ kind: 'merge', ref: entry.ref })} disabled={!can({ kind: 'merge', ref: entry.ref }) || entry.ref === `refs/heads/${status?.branch}`} onSelect={() => { setDialog({ kind: 'merge', branch: entry }); close() }} />
    {rpc?.features.includes('git-rebase') && <MenuItem label={t('GitPage.rebaseOnto', { branch: entry.remote ? `${entry.remote}/${entry.name}` : entry.name })} icon={<MergeIcon />} hint={hint({ kind: 'rebase', ref: entry.ref })} disabled={!can({ kind: 'rebase', ref: entry.ref }) || entry.ref === `refs/heads/${status?.branch}`} onSelect={() => { setDialog({ kind: 'rebase', branch: entry, from: status?.branch ?? undefined }); close() }} />}
    <div className="menu-separator" role="separator" />
    {!entry.remote && <MenuItem label={t('ConversationActions.rename')} icon={<PencilIcon />} hint={hint({ kind: 'rename', ref: entry.ref, name: 'new' })} disabled={!can({ kind: 'rename', ref: entry.ref, name: 'new' }) || entry.protected || Boolean(entry.worktree && entry.worktree !== status?.directory)} onSelect={() => { setDialog({ kind: 'rename', branch: entry }); close() }} />}
    <MenuItem label={entry.remote ? t('GitInspector.deleteRemoteBranch') : t('GitInspector.deleteLocalBranch')} icon={<TrashIcon />} danger hint={hint({ kind: 'delete', ref: entry.ref })} disabled={!can({ kind: 'delete', ref: entry.ref }) || entry.protected || Boolean(entry.worktree)} onSelect={() => { setDialog({ kind: 'delete', branch: entry }); close() }} />
    <MenuItem label={t('BranchStatus.copyBranchName')} icon={<CopyIcon />} onSelect={() => { void navigator.clipboard.writeText(entry.name); close() }} />
  </>
  const tagActions = (tag: GitTag, close: () => void) => <>
    <MenuItem label={t('GitInspector.viewHistory')} icon={<ClockIcon />} onSelect={() => { pick(tag.ref); close() }} />
    <MenuItem label={t('GitInspector.compareWithCurrentBranch')} icon={<CompareIcon />} disabled={!status?.head} onSelect={() => { pick(tag.ref); setComparison(tag.ref); setDetailView(true); close() }} />
    <div className="menu-separator" role="separator" />
    <MenuItem label={t('GitPage.newBranchFromTag')} icon={<BranchIcon />} hint={hint({ kind: 'create', name: 'new', ref: tag.ref, checkout: false })} disabled={!can({ kind: 'create', name: 'new', ref: tag.ref, checkout: false })} onSelect={() => { setDialog({ kind: 'create', source: tag }); close() }} />
    <MenuItem label={t('GitPage.checkoutTag')} icon={<TagIcon />} hint={hint({ kind: 'detach', ref: tag.ref })} disabled={!can({ kind: 'detach', ref: tag.ref })} onSelect={() => { setDialog({ kind: 'detach', source: tag }); close() }} />
    <MenuItem label={t('GitPage.copyTag')} icon={<CopyIcon />} onSelect={() => { void navigator.clipboard.writeText(tag.name); close() }} />
  </>
  const commitActionsSupported = rpc?.features.includes('git-commit-actions') ?? false
  const copyMessage = async (sha: string) => {
    const detail = await perform((rpc) => rpc.call('git.detail', { ...target, sha }))
    if (detail) await navigator.clipboard.writeText(detail.message)
  }
  const commitActions = (commit: GitCommit, close: () => void) => <>
    <MenuItem label={t('GitInspector.copySha')} icon={<CopyIcon />} onSelect={() => { void navigator.clipboard.writeText(commit.sha); close() }} />
    <MenuItem label={t('GitInspector.copyCommitMessage')} icon={<DocumentIcon />} onSelect={() => { close(); void copyMessage(commit.sha) }} />
    <div className="menu-separator" role="separator" />
    <MenuItem label={t('GitInspector.newBranchFromThisCommit')} icon={<BranchIcon />} disabled={!can({ kind: 'create', name: 'new', ref: commit.sha, checkout: false })} onSelect={() => { setDialog({ kind: 'create', commit }); close() }} />
    {commitActionsSupported && <MenuItem label={t('GitInspector.newTag')} icon={<TagIcon />} disabled={!can({ kind: 'tag', name: 'new', ref: commit.sha })} onSelect={() => { setDialog({ kind: 'tag', commit }); close() }} />}
    {commitActionsSupported && <MenuItem label={t('GitInspector.checkOutThisCommit')} icon={<CommitIcon />} disabled={!can({ kind: 'detach', ref: commit.sha }) || (!status?.branch && commit.sha === status?.head)} onSelect={() => { setDialog({ kind: 'detach', commit }); close() }} />}
    <div className="menu-separator" role="separator" />
    <MenuItem label={t('GitInspector.compareWithCurrentBranch')} icon={<CompareIcon />} disabled={!status?.head || commit.sha === status.head} onSelect={() => { setSelectedCommit(commit.sha); setComparison(commit.sha); setDetailView(true); close() }} />
  </>
  return <ReadState error={state?.error ?? null} retry={retry}>
    {!status ? <p className="git-message muted">{t('GitInspector.loadingGit')}</p> : !status.git ? <p className="git-message muted">{t('GitInspector.thisProjectIsNotInAGitRepository')}</p> : <>
      <div className="git-summary">
        <BranchIcon /><span className="mono" title={status.branch ?? status.head ?? ''}>{status.branch ?? (status.head ? t('BranchStatus.detachedHead', { value1: status.head.slice(0, 8) }) : t('GitInspector.noCommitsYet'))}</span>
        <span className="muted">{status.changes ? t('BranchStatus.changes', { value1: status.changes }) : t('BranchStatus.clean')} · ↑{status.ahead} ↓{status.behind}</span>
        <span className="muted mono" title={status.upstream ?? ''}>{status.upstream ?? t('GitInspector.noUpstream')}</span>
      </div>
      <div className="git-toolbar">
        <button className="button" disabled={!can({ kind: 'create', ref: 'HEAD', name: 'new', checkout: false }) || !status.head} onClick={() => setDialog({ kind: 'create', branch })}>{t('ConversationChat.new')}</button>
        <button className="button" disabled={disabled || Boolean(status.operation) || !status.remotes.length} onClick={() => void run({ kind: 'fetch' })}>Fetch</button>
        {updateSupported
          ? <button className="button" disabled={!currentBranch?.upstream || !can({ kind: 'update', ref: currentBranch.ref })} onClick={() => { if (currentBranch) update(currentBranch) }}>Update</button>
          : <button className="button" disabled={!can({ kind: 'pull' }) || !status.branch || !status.upstream || status.changes > 0} onClick={() => void run({ kind: 'pull' })}>Pull</button>}
        <button className="button" disabled={!can({ kind: 'push' }) || !status.branch || !status.remotes.length} onClick={() => (pushTargetSupported ? openPush() : setDialog({ kind: 'push' }))}>Push</button>
        {target.kind !== 'project' && rpc?.features.includes('git-projects') && <button className="button ghost" onClick={() => openGit(status.directory)}>{t('GitPage.openInGit')}</button>}
        <button className="button" disabled={!can({ kind: 'commit', message: 'commit', push: false }) || !status.branch || !status.changes} onClick={() => setDialog({ kind: 'commit' })}>Commit</button>
      </div>
      {status.readOnly && <p className="git-message muted" role="status">{t('GitPage.planningReadOnly')}</p>}
      {status.taskId && target.kind === 'project' && <p className="git-message muted">{t('GitPage.taskBound')}</p>}
      {status.blocker && <p className="git-message muted" role="status">{status.blocker}</p>}
      {writing && <p className="git-message muted" role="status">{t('ConversationBranches.writingCommitMessageThenCommitting')}</p>}
      {note?.persistent && <p className="git-message" role="status">{note.message}</p>}
      {note && !note.persistent && <div className="toast git-result-toast" role="status" aria-atomic="true">
        <span className="toast-icon" aria-hidden="true"><CheckIcon /></span>
        <span className="toast-message">{note.message}</span>
        <button className="tool-button" aria-label={t('GitPage.dismissResult')} onClick={() => setNote(null)}><CloseIcon /></button>
      </div>}
      {status.operation && <div className="git-conflicts">
        <strong>{status.operation === 'merge' ? t('GitInspector.mergeIsUnfinished') : status.rebase ? t('GitInspector.rebaseIsUnfinished') : t('GitInspector.anotherGitOperationIsUnfinishedResolveItIn')}</strong>
        {status.conflicts.map((file) => <ConflictRow key={file} target={target} directory={status.directory} file={file} disabled={disabled} resolve={() => void run({ kind: 'resolve', file })} />)}
        <div className="git-toolbar">
          <button className="button" onClick={() => void openTerminal(status.directory)}>{t('GitInspector.openTerminal')}</button>
          {(status.operation === 'merge' || status.rebase) && <>
            <button className="button" disabled={disabled || status.conflicts.length > 0} onClick={() => void run({ kind: 'continue' })}>{status.rebase ? t('GitInspector.continueRebase') : t('GitInspector.finishMerge')}</button>
            <button className="button" disabled={disabled} onClick={() => setDialog({ kind: 'abort' })}>{status.rebase ? t('GitInspector.abortRebase') : t('GitInspector.abortMerge')}</button>
          </>}
        </div>
      </div>}
      <GitLayout detail={detailView}>
        <div className="git-branches" data-collapsed={branchesCollapsed || undefined}><button className="git-tree-filter git-branch-toggle" aria-expanded={!branchesCollapsed} onClick={() => setBranchesCollapsed((value) => !value)}>{branchesCollapsed ? t('GitInspector.branches') : t('GitInspector.branches_1024')}</button><div className="git-branch-tree"><GitBranchTree directory={status.directory} tags={status.tags ?? []} recent={status.recentBranches ?? []} tagActions={tagActions} branches={status.branches} selected={ref} current={status.branch} pick={pick} actions={branchActions} toggleFavorite={favoritesSupported ? (entry) => void toggleFavorite(entry) : undefined} favoriting={favoriting} onMenuClose={() => setTrackOpen(false)} /></div></div>
        <div className="git-history">
          <div className="git-history-tools"><span className="mono" title={ref}>{ref === 'all' ? t('GitInspector.allBranches') : ref === 'HEAD' ? t('GitInspector.currentBranch') : ref.replace(/^refs\/(heads|remotes|tags)\//, '')}</span>
            <input className="input" maxLength={500} aria-label={t('GitInspector.searchCommits')} placeholder={t('GitInspector.subjectAuthorOrSha')} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <History target={target} gitRef={ref} query={query} refreshKey={refreshKey} remotes={status.remotes} selected={selectedCommit} pick={(sha) => { setSelectedCommit(sha); setComparison(null); setDetailView(true) }} actions={commitActions} />
        </div>
        <div className="git-details">
          <button className="button git-detail-back" onClick={() => setDetailView(false)}>{t('GitInspector.backToHistory')}</button>
          {comparison ? <Comparison target={target} gitRef={comparison} what={status.tags?.some((entry) => entry.ref === comparison) ? t('GitPage.tags') : status.branches.some((entry) => entry.ref === comparison) ? t('GitInspector.branches_1030') : t('GitInspector.commit')} direct={direct} setDirect={setDirect} refreshKey={refreshKey} retry={retry} />
            : selectedCommit ? <CommitDetail target={target} sha={selectedCommit} refreshKey={refreshKey} retry={retry} /> : <p className="git-message muted">{t('GitInspector.selectACommitToViewItsMessageFiles')}</p>}
        </div>
      </GitLayout>
      {dialog?.kind === 'push' && pushTargetSupported
        ? status.branch && <GitPushDialog key={status.branch} target={target} status={status} busy={busy} push={(remote, name) => void pushTo(remote, name)} close={() => setDialog(null)} />
        : dialog && <ActionDialog choice={dialog} target={target} status={status} busy={busy} run={run} commitWritten={(push) => void commitWritten(push)} close={() => setDialog(null)} />}
      {rejected && <GitPushRejectedDialog target={`${rejected.remote}/${rejected.name}`} busy={busy} close={() => setRejected(null)} choose={(method, remember) => {
        if (remember) setPreference('gitPushRejectedUpdate', method)
        void updateAndPush(method, rejected.remote, rejected.name)
      }} />}
    </>}
  </ReadState>
}

function ConflictRow({ target, directory, file, disabled, resolve }: { target: GitTarget; directory: string; file: string; disabled: boolean; resolve: () => void }) {
  const conversationId = useCore((s) => target.kind === 'conversation' ? target.id : target.kind === 'task' ? s.tasks[target.id]?.conversationId ?? '' : '')
  const resolved = { path: `${directory.replace(/[\\/]$/, '')}/${file}`, root: directory, relative: file, kind: 'file' as const }
  return <div className="git-conflict-row"><span className="mono" title={file}>{file}</span>
    {conversationId && <button className="button" onClick={() => showResolvedFile({ conversationId, roots: [directory] }, resolved, null)}>{t('chatTools.preview')}</button>}
    <button className="button" onClick={() => void openResolvedFile(resolved)}>{t('ChatBrowserCard.open')}</button>
    <button className="button" disabled={disabled} onClick={resolve}>{t('GitInspector.markResolved')}</button>
  </div>
}

function History({ target, gitRef, query, refreshKey, remotes, selected, pick, actions }: { target: GitTarget; gitRef: string; query: string; refreshKey: string; remotes: readonly string[]; selected: string | null; pick: (sha: string) => void; actions: (commit: GitCommit, close: () => void) => ReactNode }) {
  const rpc = useCore((s) => s.rpc)
  const [menu, setMenu] = useState<{ commit: GitCommit; at: MenuPoint } | null>(null)
  const key = `${gitRef}:${query}:${refreshKey}`
  const [page, setPage] = useState<{ key: string; history: GitHistory } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef(0)
  useEffect(() => {
    const sequence = ++request.current
    setBusy(true); setError(null)
    void rpc?.call('git.history', { ...target, ref: gitRef, query }).then((history) => { if (sequence === request.current) setPage({ key, history }) }, (error: unknown) => { if (sequence === request.current) setError(error instanceof Error ? error.message : String(error)) }).finally(() => { if (sequence === request.current) setBusy(false) })
    return () => { request.current++ }
  }, [rpc, key, retry])
  const history = page?.key === key ? page.history : null
  const more = async () => {
    if (!rpc || !history || history.next === null || busy) return
    const sequence = request.current
    setBusy(true); setError(null)
    try {
      const next = await rpc.call('git.history', { ...target, ref: gitRef, query, offset: history.next, tips: history.tips })
      if (sequence === request.current) setPage({ key, history: { ...next, commits: [...history.commits, ...next.commits] } })
    } catch (error) { if (sequence === request.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (sequence === request.current) setBusy(false) }
  }
  const graph = gitGraph(history?.commits ?? [])
  return <div className="git-history-list"><div className="git-history-columns" aria-hidden="true"><span className="git-commit-subject">{t('GitPage.commitColumn')}</span><span className="git-commit-author">{t('GitPage.authorColumn')}</span><span className="git-commit-date">{t('GitPage.dateColumn')}</span></div><ReadState error={error} retry={() => setRetry((n) => n + 1)}>
    {history?.commits.map((commit, index) => <button key={commit.sha} className="git-commit-row" data-selected={selected === commit.sha || undefined} onClick={() => pick(commit.sha)}
      onContextMenu={(event) => { event.preventDefault(); setMenu({ commit, at: menuPoint(event) }) }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setMenu({ commit, at: { x: bounds.left, y: bounds.bottom } })
        }
      }}
      title={`${commit.sha}\n${commit.subject}\n${commit.author} · ${new Date(commit.date).toLocaleString(getLocale())}`}>
      {/* Each row as wide as its own lanes, as IDEA's log: a busy stretch does not push every subject right. */}
      <svg className="git-graph" width={Math.max(16, graph[index]?.width ?? 0)} height="32" aria-hidden="true">{graph[index]?.paths.map((path, i) => <path key={i} d={path.d} data-color={path.color} />)}<circle cx={8 + (graph[index]?.lane ?? 0) * 12} cy="16" r="3" data-color={graph[index]?.color} /></svg>
      <span className="git-commit-subject"><GitRefLabel refs={commitRefs(commit.refs, remotes)} />{commit.subject}</span>
      <span className="git-commit-author muted" title={commit.author}>{commit.author}</span><time className="git-commit-date muted" dateTime={commit.date} title={new Date(commit.date).toLocaleString(getLocale())}>{new Date(commit.date).toLocaleDateString(getLocale())}</time>
    </button>)}
    {!busy && history?.commits.length === 0 && <p className="git-message muted">{t('GitInspector.noMatchingCommits')}</p>}
    {busy && <p className="git-message muted">{t('GitInspector.loadingHistory')}</p>}
    {history?.next !== null && history && <button className="button git-load-more" disabled={busy} onClick={() => void more()}>{t('GitInspector.loadMore')}</button>}
    {menu && <ContextMenu at={menu.at} label={t('GitInspector.commitActions')} onClose={() => setMenu(null)}>{actions(menu.commit, () => setMenu(null))}</ContextMenu>}
  </ReadState></div>
}

// The subject line stands out from the body, as a heading over it.
function CommitMessage({ message }: { message: string }) {
  const end = message.indexOf('\n')
  const subject = end < 0 ? message : message.slice(0, end)
  return <pre className="git-commit-message"><strong className="git-commit-headline">{subject}</strong>{end < 0 ? '' : message.slice(end)}</pre>
}

// The branches a commit is on, local then remote, under its message, as IDEA's "In 2 branches".
// Asked apart from the detail, which need not wait for every branch to be walked.
function CommitBranches({ target, sha, refreshKey }: { target: GitTarget; sha: string; refreshKey: string }) {
  const rpc = useCore((s) => s.rpc)
  const supported = rpc?.features.includes('git-commit-branches') ?? false
  const [found, setFound] = useState<{ key: string; branches: { name: string; remote: boolean }[] | null } | null>(null)
  const key = `${sha}:${refreshKey}`
  useEffect(() => {
    if (!rpc || !supported) return
    let live = true
    void rpc.call('git.containing', { ...target, sha }).then((branches) => { if (live) setFound({ key, branches }) }, () => { if (live) setFound({ key, branches: null }) })
    return () => { live = false }
  }, [rpc, supported, key])
  if (!supported) return null
  const branches = found?.key === key ? found.branches : undefined
  if (branches === null) return null
  return (
    <div className="git-commit-branches">
      {branches === undefined
        ? <span className="muted">{t('GitInspector.findingContainingBranches')}</span>
        : branches.length === 0
          ? <span className="muted">{t('GitInspector.notOnAnyBranch')}</span>
          : <>
              <span className="muted">{tr('GitInspector.onBranches', { value1: branches.length })}</span>
              {branches.map(({ name, remote }) => <GitRefName key={name} item={{ name, kind: remote ? 'remote' : 'local', current: false }} />)}
            </>}
    </div>
  )
}

function CommitDetail({ target, sha, refreshKey, retry }: { target: GitTarget; sha: string; refreshKey: string; retry: () => void }) {
  const rpc = useCore((s) => s.rpc)
  const [parent, setParent] = useState<string | undefined>()
  const [file, setFile] = useState<string | null>(null)
  useEffect(() => { setParent(undefined); setFile(null) }, [sha])
  const key = `${sha}:${parent ?? ''}:${refreshKey}`
  const result = useGitRead<GitDetail>(key, async () => {
    if (!rpc) throw new Error(t('GitInspector.notConnectedToCore'))
    return rpc.call('git.detail', { ...target, sha, parent })
  })
  const detail = result?.data
  return <ReadState error={result?.error ?? null} retry={retry}>
    {!detail ? <p className="git-message muted">{t('GitInspector.loadingCommit')}</p> : <>
      <div className="git-detail-meta"><CopyButton text={sha} label={t('GitInspector.copyFullSha')}><span className="mono">{sha.slice(0, 8)}</span></CopyButton><span>{detail.commit.author}</span><time>{new Date(detail.commit.date).toLocaleString(getLocale())}</time></div>
      <CommitMessage message={detail.message} />
      <CommitBranches target={target} sha={sha} refreshKey={refreshKey} />
      {detail.commit.parents.length > 1 && <div className="git-parent">{tr('GitInspector.compareParentCommit', { value1: <ChatPicker label={t('GitInspector.compareParentCommit_1053')} value={detail.parent ?? ''} placeholder={t('GitInspector.parent1')} placement="below"
        options={detail.commit.parents.map((parent, index) => ({ value: parent, label: t('GitInspector.parent', { value1: index + 1, value2: parent.slice(0, 8) }) }))}
        onChange={(parent) => { setParent(parent); setFile(null) }} /> })}</div>}
      <CommitFiles files={detail.files} select={setFile} />
      {file && rpc && <FileDiffView file={file} loadKey={`${key}:${file}`} commentKey={`git:${gitTargetKey(target)}\0${target.project}\0${detail.parent ?? ''}..${sha}\0${file}`} load={() => rpc.call('git.diff', { ...target, sha, base: detail.parent, file })} onBack={() => setFile(null)} />}
    </>}
  </ReadState>
}

function CommitFiles({ files, select }: { files: GitDetail['files']; select: (file: string) => void }) {
  const folders = new Map<string, GitDetail['files']>()
  for (const file of files) { const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''; folders.set(folder, [...folders.get(folder) ?? [], file]) }
  return <div className="git-commit-files">{[...folders].map(([folder, entries]) => folder ? <details key={folder} open><summary title={folder}>{folder} · {entries.length}</summary><FileList files={entries} onOpen={select} /></details> : <FileList key="root" files={entries} onOpen={select} />)}{!files.length && <p className="git-message muted">{t('GitInspector.noFileChanges')}</p>}</div>
}

function Comparison({ target, gitRef, what, direct, setDirect, refreshKey, retry }: { target: GitTarget; gitRef: string; what: string; direct: boolean; setDirect: (value: boolean) => void; refreshKey: string; retry: () => void }) {
  const rpc = useCore((s) => s.rpc)
  const [file, setFile] = useState<string | null>(null)
  const key = `${gitRef}:${direct}:${refreshKey}`
  const result = useGitRead<GitComparison>(key, async () => {
    if (!rpc) throw new Error(t('GitInspector.notConnectedToCore'))
    return rpc.call('git.compare', { ...target, ref: gitRef, direct })
  })
  const comparison = result?.data
  return <>
    <label className="git-parent">{tr('GitInspector.compareEndpointsDirectly', { value1: <input type="checkbox" checked={direct} onChange={(event) => { setDirect(event.target.checked); setFile(null) }} /> })}</label>
    <ReadState error={result?.error ?? null} retry={retry}>
      {!comparison ? <p className="git-message muted">{t('GitInspector.comparing')}</p> : <>
        <p className="git-message">{tr('GitInspector.currentBranchHasUniqueCommitsSelectedHasUnique', { value1: comparison.ahead, what: what, value3: comparison.behind })}</p>
        <p className="git-message muted">{direct ? t('GitInspector.bothEndpoints') : t('GitInspector.commonAncestorToSelected', { what: what })}：<span className="mono">{comparison.base.slice(0, 8)} → {comparison.target.slice(0, 8)}</span></p>
        <div className="git-comparison-commits">{comparison.commits.map((commit) => <div key={commit.sha}><span className="git-branch-badge">{commit.side === 'current' ? t('GitInspector.currentBranch') : t('GitInspector.selected', { what: what })}</span> <span className="mono muted">{commit.sha.slice(0, 8)}</span> {commit.subject}</div>)}{comparison.commits.length >= 100 && <p className="muted">{t('GitInspector.onlyTheFirst100CommitsAreShownOpen')}</p>}</div>
        <CommitFiles files={comparison.files} select={setFile} />
        {file && rpc && <FileDiffView file={file} loadKey={`${key}:${file}`} commentKey={`git:${gitTargetKey(target)}\0${target.project}\0${comparison.base}..${comparison.target}\0${file}`} load={() => rpc.call('git.diff', { ...target, sha: comparison.target, base: comparison.base, file })} onBack={() => setFile(null)} />}
      </>}
    </ReadState>
  </>
}

const TITLES: Record<DialogKind, string> = localized(() => ({ create: t('ConversationBranches.newBranch'), tag: t('GitInspector.newTag_1064'), detach: t('GitInspector.checkOutCommit'), rename: t('GitInspector.renameLocalBranch'), delete: t('GitInspector.deleteBranch'), push: 'Push', commit: 'Commit', merge: 'Merge', rebase: 'Rebase', abort: t('GitInspector.abortMerge_1068'), update: t('GitInspector.updateFromRemote') }))

// What a finished operation leaves to say: how an update went, or that conflicts wait.
function resultNote(action: GitAction, result: GitResult, rebasing: boolean): string {
  if (result.state === 'conflicts') return rebasing || action.kind === 'rebase' || (action.kind === 'update' && action.method === 'rebase') ? t('GitInspector.rebaseConflicts') : t('GitInspector.mergeConflictsFoundResolveTheFilesListedBelow')
  const branch = result.branch ?? ''
  const done = action.kind === 'update' ? (result.incoming ? t('GitInspector.updated', { branch, count: result.incoming }) : t('GitInspector.upToDate', { branch })) : t('GitInspector.gitOperationCompleted')
  return result.stash === 'kept' ? `${done} ${t('GitInspector.stashKept', { branch: branch || 'HEAD' })}` : done
}
function ActionDialog({ choice, target, status, busy, run, commitWritten, close }: { choice: DialogChoice; target: GitTarget; status: GitStatus; busy: boolean; run: (action: GitAction) => Promise<boolean>; commitWritten: (push: boolean) => void; close: () => void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(choice.kind === 'push' ? status.upstream?.split('/').slice(1).join('/') || status.branch || '' : choice.kind === 'rename' ? choice.branch?.name ?? '' : '')
  const [source, setSource] = useState(choice.commit?.sha ?? choice.source?.ref ?? choice.branch?.ref ?? 'HEAD')
  const [checkout, setCheckout] = useState(target.kind !== 'task' && !status.taskId)
  const [remote, setRemote] = useState(status.upstream?.split('/')[0] ?? (status.remotes.includes('origin') ? 'origin' : status.remotes[0] ?? ''))
  const [message, setMessage] = useState('')
  const writable = useCanWriteCommitMessage(target)
  const [confirm, setConfirm] = useState('')
  const [method, setMethod] = useState<'merge' | 'rebase'>('merge')
  useEffect(() => { dialog.current?.showModal() }, [])
  const performAction = async (action: GitAction) => { if (await run(action)) close() }
  const submit = (event: MouseEvent, push = false) => {
    event.preventDefault()
    switch (choice.kind) {
      case 'create': void performAction({ kind: 'create', name: name.trim(), ref: source, checkout }); break
      case 'tag': if (choice.commit) void performAction({ kind: 'tag', name: name.trim(), ref: choice.commit.sha }); break
      case 'detach': void performAction({ kind: 'detach', ref: choice.commit?.sha ?? choice.source?.ref ?? 'HEAD' }); break
      case 'rename': if (choice.branch) void performAction({ kind: 'rename', ref: choice.branch.ref, name: name.trim() }); break
      case 'delete': if (choice.branch) void performAction({ kind: 'delete', ref: choice.branch.ref }); break
      case 'push': void performAction({ kind: 'push', remote, name: name.trim() }); break
      case 'commit':
        if (message.trim()) void performAction({ kind: 'commit', message: message.trim(), push })
        else { close(); commitWritten(push) }
        break
      case 'rebase': if (choice.branch) void performAction({ kind: 'rebase', ref: choice.branch.ref, from: choice.from }); break
      case 'merge': if (choice.branch) void performAction({ kind: 'merge', ref: choice.branch.ref }); break
      case 'abort': void performAction({ kind: 'abort' }); break
      case 'update': if (choice.branch) void performAction({ kind: 'update', ref: choice.branch.ref, method }); break
    }
  }
  const enabled = !busy && (choice.kind === 'commit' ? Boolean(message.trim()) || writable : ['create', 'tag', 'rename', 'push'].includes(choice.kind) ? Boolean(name.trim()) : choice.kind === 'delete' && choice.branch?.remote ? confirm === `${choice.branch.remote}/${choice.branch.name}` : true)
  return <dialog ref={dialog} className="modal branch-dialog git-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <div className="modal-body">
      <h2>{choice.kind === 'abort' && status.rebase ? t('GitInspector.abortRebaseTitle') : choice.kind === 'update' && choice.branch ? t('GitInspector.updateBranch', { branch: choice.branch.name }) : TITLES[choice.kind]}</h2><p className="muted">{projectName(target.project)} · {status.branch ?? t('GitInspector.detachedHead')}</p>
      {(choice.kind === 'create' || choice.kind === 'tag' || choice.kind === 'rename' || choice.kind === 'push') && <label>{choice.kind === 'tag' ? t('GitInspector.tagName') : t('GitInspector.branchName')}<input className="input" autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>}
      {choice.kind === 'create' && <><label>{tr('GitInspector.startingPoint', { value1: <select className="input" value={source} onChange={(event) => setSource(event.target.value)}><option value="HEAD">{t('GitInspector.headCurrentCommit')}</option>{choice.commit && <option value={choice.commit.sha}>{choice.commit.sha.slice(0, 8)} · {choice.commit.subject}</option>}{status.tags?.map((tag) => <option key={tag.ref} value={tag.ref}>{tag.name}</option>)}{status.branches.map((branch) => <option key={branch.ref} value={branch.ref}>{branch.remote ? `${branch.remote}/` : ''}{branch.name}</option>)}</select> })}</label>{target.kind !== 'task' && !status.taskId && <label>{tr('GitInspector.switchAfterCreating', { value1: <input type="checkbox" checked={checkout} onChange={(event) => setCheckout(event.target.checked)} /> })}</label>}</>}
      {choice.kind === 'tag' && choice.commit && <p>{tr('GitInspector.createALightweightTagAtTheTagStays', { value1: <span className="mono">{choice.commit.sha.slice(0, 8)}</span>, value2: choice.commit.subject })}</p>}
      {choice.kind === 'detach' && choice.commit && <p>{tr('GitInspector.checkOutWithDetachedHeadCreateABranch', { value1: <span className="mono">{choice.commit.sha.slice(0, 8)}</span>, value2: choice.commit.subject })}</p>}
      {choice.kind === 'detach' && choice.source && <p>{t('GitPage.detachTag', { tag: choice.source.name })}</p>}
      {choice.kind === 'rebase' && choice.branch && <p>{t('GitPage.rebaseConfirm', { current: choice.from ?? status.branch ?? '', target: choice.branch.remote ? `${choice.branch.remote}/${choice.branch.name}` : choice.branch.name })}</p>}
      {choice.kind === 'push' && <label>Remote<select className="input" value={remote} onChange={(event) => setRemote(event.target.value)}>{status.remotes.map((remote) => <option key={remote}>{remote}</option>)}</select></label>}
      {choice.kind === 'commit' && <><textarea className="input branch-commit-message" aria-label={t('ConversationBranches.commitMessage')} autoFocus maxLength={10000} placeholder={writable ? t('GitInspector.commitTitleBlankLineThenDetailsLeaveEmpty') : t('GitInspector.commitTitleBlankLineThenDetails')} value={message} onChange={(event) => setMessage(event.target.value)} /><p className="muted">{t('GitInspector.commitAllChangesInThisRepositoryLocalCommits')}</p></>}
      {choice.kind === 'delete' && <><p>{tr('GitInspector.repository', { value1: <span className="mono">{status.directory}</span>, value2: <br />, value3: choice.branch?.remote ? t('GitInspector.deleteRemote', { value1: choice.branch.remote, value2: choice.branch.name }) : t('GitInspector.safelyDeleteLocalGitRefusesIfItIs', { value1: choice.branch?.name }) })}</p>{choice.branch?.remote && <label>{tr('GitInspector.typeTheFullRemoteBranchNameToConfirm', { value1: <input className="input" autoFocus placeholder={`${choice.branch.remote}/${choice.branch.name}`} value={confirm} onChange={(event) => setConfirm(event.target.value)} /> })}</label>}</>}
      {choice.kind === 'merge' && <p>{tr('GitInspector.mergeIntoDivergedBranchesCreateAMergeCommit', { value1: <span className="mono">{choice.branch?.ref.replace(/^refs\/(heads|remotes|tags)\//, '')}</span>, value2: <span className="mono">{status.branch}</span> })}</p>}
      {choice.kind === 'abort' && <p>{status.rebase ? t('GitInspector.abortRebaseExplained') : t('GitInspector.abortTheCurrentMergeAndDiscardItsConflict')}</p>}
      {choice.kind === 'update' && choice.branch && <>
        <p>{t('GitInspector.updateDiverged', { branch: choice.branch.name, upstream: (choice.branch.upstream ?? '').replace(/^refs\/remotes\//, ''), ahead: choice.branch.ahead ?? 0, behind: choice.branch.behind ?? 0 })}</p>
        <div className="git-update-methods" role="radiogroup">
          {(['merge', 'rebase'] as const).map((value) => <label key={value} className="git-update-method">
            <input type="radio" name="git-update-method" checked={method === value} onChange={() => setMethod(value)} />
            <span><strong>{value === 'merge' ? t('GitInspector.updateMerge') : t('GitInspector.updateRebase')}</strong><span className="muted">{value === 'merge' ? t('GitInspector.updateMergeDescription') : t('GitInspector.updateRebaseDescription')}</span></span>
          </label>)}
        </div>
        {status.changes > 0 && <p className="muted">{t('GitInspector.updateStashNote')}</p>}
      </>}
      <div className="branch-commit-buttons">{choice.kind === 'commit' && <CommitMessageButton target={target} disabled={busy} onMessage={setMessage} />}<button className="button" disabled={busy} onClick={close}>{t('ChatCommandSettings.cancel')}</button>{choice.kind === 'commit' && <button className="button" disabled={!enabled} onClick={(event) => submit(event, true)}>Commit &amp; Push</button>}<button className="button primary" disabled={!enabled} onClick={submit}>{busy ? t('GitInspector.processing') : TITLES[choice.kind]}</button></div>
    </div>
  </dialog>
}
