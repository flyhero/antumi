import { getLocale, localized, t, tr } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import { openTerminal, selectConversation, selectTask, setWorktreesOpen, showError, useCore } from '../core-store'
import { timeAgo } from '../conversation-state'
import { canRevealFile, revealFile } from '../desktop-bridge'
import { reasonText, STATUS_LABEL } from '../labels'
import { formatBytes, groupWorktrees, worktreeRows, worktreeState, worktreeSummary, type WorktreeGroupId, type WorktreeRow } from '../worktree-groups'
import { cleanWorktrees, refreshWorktrees, useWorktrees } from '../worktree-store'
import { CloseIcon, FolderIcon, TerminalIcon } from './icons'
import { projectName } from './ProjectPicker'
import { askConfirm } from '../confirm-dialog'

const GROUP_TEXT: Record<WorktreeGroupId, { title: string; note: string }> = localized(() => ({
  cleanable: { title: t('WorktreeManager.cleanable'), note: t('WorktreeManager.taskCompletedOrCancelledWithNoUncommittedChanges') },
  orphaned: { title: t('WorktreeManager.taskOrConversationNotFound'), note: t('WorktreeManager.taskOrConversationDeletedWorktreeRemains') },
  attention: { title: t('WorktreeManager.needsYourAttention'), note: t('WorktreeManager.cleanupWouldLoseWorkCommitMoveOrDiscard') },
  active: { title: t('ChatTodos.inProgress'), note: t('WorktreeManager.taskUnfinishedOrConversationStillExistsShowingDisk') }
}))

const CLEAN_NOTE = () => t('WorktreeManager.branchesAndCommitsAreKeptWorktreesAreRecreated')

// Asks first, then says what was kept and why; what went needs no word.
export async function cleanWithConfirm(paths: readonly string[], subject: string): Promise<void> {
  if (paths.length === 0 || !await askConfirm({ message: t('WorktreeManager.clean', { subject: subject, CLEAN_NOTE: CLEAN_NOTE() }), confirm: t('SettingsPage.cleanup'), danger: true })) return
  const results = await cleanWorktrees(paths)
  const kept = results?.filter((result) => !result.removed) ?? []
  if (kept.length > 0) {
    const reasons = [...new Set(kept.map((result) => reasonText(result.reason ?? 'worktree-failed', result.reason ?? '')))]
    showError(t('WorktreeManager.worktreesWereNotCleaned', { value1: kept.length, value2: reasons.join('；') }))
  }
}

function Row({ row, now, checked, onToggle }: { row: WorktreeRow; now: number; checked: boolean | null; onToggle: () => void }) {
  const { worktree, task, conversation } = row
  const state = worktreeState(row)
  const project = projectName(worktree.repo ?? worktree.path)
  return (
    <li className="worktree-row">
      <span className="worktree-check">
        {checked !== null && (
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={t('WorktreeManager.clean_2235', { value1: task?.title ?? conversation?.title ?? worktree.path })} />
        )}
      </span>
      <span className="worktree-main">
        <span className="worktree-title" title={worktree.path}>{task?.title ?? conversation?.title ?? (worktree.conversationId ? t('BrowserPanel.conversation') : t('WorktreeManager.taskOrConversationDeleted'))}</span>
        <span className="worktree-meta">
          {[task && STATUS_LABEL[task.status], worktree.conversationId && t('BrowserPanel.conversation'), timeAgo(worktree.touchedAt, now), project, worktree.planning && t('WorktreeManager.planningCheckout')].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="worktree-branch mono" title={worktree.path}>{worktree.branch ?? t('WorktreeManager.noBranch')}</span>
      <span className="worktree-state" data-warn={state.warn || undefined}>{state.text}</span>
      <span className="worktree-size">{worktree.size === null ? '…' : formatBytes(worktree.size)}</span>
      <span className="worktree-actions">
        {task && (
          <button type="button" className="button ghost worktree-open" onClick={() => selectTask(task.id)}>{t('SourceInboxView.openTask')}</button>
        )}
        {worktree.conversationId && (
          <button type="button" className="button ghost worktree-open" onClick={() => selectConversation(worktree.conversationId ?? null)}>{t('WorktreeManager.openConversation')}</button>
        )}
        <button type="button" className="tool-button" aria-label={t('WorktreeManager.openInTerminal')} data-tooltip={t('WorktreeManager.openInTerminal')} onClick={() => void openTerminal(worktree.path)}>
          <TerminalIcon />
        </button>
        {canRevealFile() && (
          <button type="button" className="tool-button" aria-label={t('ChatContextMenu.showInFileManager')} data-tooltip={t('ChatContextMenu.showInFileManager')} onClick={() => void revealFile([worktree.path])}>
            <FolderIcon />
          </button>
        )}
      </span>
    </li>
  )
}

// Every worktree Antumi laid out, by what can be done about each. Nothing goes without asking, and
// only what loses nothing can be picked.
export function WorktreeManager() {
  const list = useWorktrees((s) => s.list)
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const rows = useMemo(() => (list ? worktreeRows(list, tasks, conversations) : []), [list, tasks, conversations, getLocale()])
  const groups = groupWorktrees(rows)
  const summary = worktreeSummary(rows)
  // Unpicked paths; everything that can be cleaned starts picked.
  const [unpicked, setUnpicked] = useState<ReadonlySet<string>>(new Set())
  const [showActive, setShowActive] = useState(false)
  const [busy, setBusy] = useState(false)
  // An agent ending changes no task, so nothing else would say its worktree is free now.
  useEffect(() => refreshWorktrees(0), [])
  const picked = rows.filter((row) => row.blocker === null && !unpicked.has(row.worktree.path)).map((row) => row.worktree.path)
  const now = Date.now()
  const toggle = (worktreePath: string) =>
    setUnpicked((current) => {
      const next = new Set(current)
      if (!next.delete(worktreePath)) next.add(worktreePath)
      return next
    })
  const clean = async () => {
    setBusy(true)
    await cleanWithConfirm(picked, t('WorktreeManager.worktrees', { value1: picked.length }))
    setBusy(false)
  }

  return (
    <section className="worktrees-page" aria-label="Worktree">
      <header className="worktrees-header">
        <div className="worktrees-heading">
          <h2>Worktree</h2>
          <p className="muted">{tr('WorktreeManager.totalUsedCleanable', { value1: summary.count, value2: formatBytes(summary.bytes), value3: summary.counting ? t('WorktreeManager.stillCalculating') : '', value4: summary.cleanable })}</p>
          <p className="muted">{tr('WorktreeManager.cleanupDeletesOnlyWorktreeDirectories', { CLEAN_NOTE: CLEAN_NOTE() })}</p>
        </div>
        <button type="button" className="button primary" disabled={busy || picked.length === 0} onClick={() => void clean()}>{tr('WorktreeManager.cleanSelected', { value1: picked.length })}</button>
        <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={() => setWorktreesOpen(false)}>
          <CloseIcon />
        </button>
      </header>
      {list === null ? (
        <p className="worktrees-empty muted">{t('DashboardPanel.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="worktrees-empty muted">{t('WorktreeManager.noAntumiWorktrees')}</p>
      ) : (
        groups.map((group) => {
          const collapsed = group.id === 'active' && !showActive
          return (
            <section key={group.id} className="worktree-group" aria-label={GROUP_TEXT[group.id].title}>
              <h3 className="worktree-group-title">
                {GROUP_TEXT[group.id].title} · {group.rows.length}
                <span className="muted"> · {GROUP_TEXT[group.id].note}</span>
                {group.id === 'active' && (
                  <button type="button" className="link-button" aria-expanded={!collapsed} onClick={() => setShowActive(!showActive)}>
                    {collapsed ? t('FileSource.expand') : t('ChatPlan.collapse')}
                  </button>
                )}
              </h3>
              {!collapsed && (
                <ul className="worktree-list">
                  {group.rows.map((row) => (
                    <Row
                      key={row.worktree.path}
                      row={row}
                      now={now}
                      checked={row.blocker === null ? !unpicked.has(row.worktree.path) : null}
                      onToggle={() => toggle(row.worktree.path)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })
      )}
    </section>
  )
}
