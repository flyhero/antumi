import { t } from './i18n'
import { checkCleanWorktree, type Conversation, type ManagedWorktree, type Task, type WorktreeCleanBlocker } from '@antumi/protocol'

export type WorktreeRow = { worktree: ManagedWorktree; task: Task | null; conversation: Conversation | null; blocker: WorktreeCleanBlocker | null }

// Cleanable: a finished task's or an archived conversation's, safe to go. Orphaned: its task or
// conversation was deleted, the easiest to forget. Attention: holds something only the user can
// decide on. Active: its task is under way, or its conversation is in use.
export type WorktreeGroupId = 'cleanable' | 'orphaned' | 'attention' | 'active'
export type WorktreeGroup = { id: WorktreeGroupId; rows: WorktreeRow[] }

export const GROUP_ORDER: readonly WorktreeGroupId[] = ['cleanable', 'orphaned', 'attention', 'active']

export function worktreeRows(
  worktrees: readonly ManagedWorktree[],
  tasks: Readonly<Record<string, Task>>,
  conversations: Readonly<Record<string, Conversation>> = {}
): WorktreeRow[] {
  return worktrees.map((worktree) => {
    const task = worktree.taskId ? (tasks[worktree.taskId] ?? null) : null
    const conversation = worktree.conversationId ? (conversations[worktree.conversationId] ?? null) : null
    return { worktree, task, conversation, blocker: checkCleanWorktree(worktree, task) }
  })
}

function groupOf(row: WorktreeRow): WorktreeGroupId {
  if (row.blocker === 'conversation-open' || row.blocker === 'delegation-open') return 'active'
  // A delegation's worktree is its call's, cleanable once that ended, whether or not the caller is still there.
  if (!row.task && !row.worktree.agentCall && !row.worktree.conversationArchived) return 'orphaned'
  if (row.blocker === 'task-active') return 'active'
  return row.blocker ? 'attention' : 'cleanable'
}

// Oldest first within each: the longer one has lain untouched, the likelier it is forgotten.
export function groupWorktrees(rows: readonly WorktreeRow[]): WorktreeGroup[] {
  const sorted = [...rows].sort((a, b) => a.worktree.touchedAt - b.worktree.touchedAt)
  return GROUP_ORDER.map((id) => ({ id, rows: sorted.filter((row) => groupOf(row) === id) })).filter((group) => group.rows.length > 0)
}

export type WorktreeSummary = { count: number; bytes: number; counting: boolean; cleanable: number }

export function worktreeSummary(rows: readonly WorktreeRow[]): WorktreeSummary {
  return {
    count: rows.length,
    bytes: rows.reduce((sum, row) => sum + (row.worktree.size ?? 0), 0),
    counting: rows.some((row) => row.worktree.size === null),
    cleanable: rows.filter((row) => row.blocker === null).length
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

// What stands out about a worktree, in a few words: why it is kept, or how its commits stand.
export function worktreeState({ worktree }: Pick<WorktreeRow, 'worktree'>): { text: string; warn: boolean } {
  if (worktree.changes === null) return { text: worktree.repo === null ? t('worktreeGroups.itsRepositoryCannotBeFound') : t('labels.cannotReadItsGitStatus'), warn: true }
  if (worktree.inUse) return { text: t('worktreeGroups.agentIsStillOpen'), warn: true }
  if (worktree.changes > 0) return { text: t('worktreeGroups.uncommittedFiles', { value1: worktree.changes }), warn: true }
  if (worktree.alone) return { text: t('worktreeGroups.hasCommitsThatExistOnlyHere'), warn: true }
  if (worktree.locked) return { text: t('labels.lockedWithGitWorktreeLock'), warn: true }
  if (worktree.planning) return { text: t('worktreeGroups.readOnlyPlanningCheckout'), warn: false }
  if (!worktree.unmerged) return { text: t('ConversationInspector.noUncommittedChanges'), warn: false }
  const { count, into } = worktree.unmerged
  return { text: count > 0 ? t('worktreeGroups.commitsNotMergedInto', { count: count, into: into }) : t('worktreeGroups.mergedInto', { into: into }), warn: false }
}
