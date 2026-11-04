import { checkCleanWorktree, type ManagedWorktree } from '@antumi/protocol'
import { t } from './i18n'
import { showError, useCore } from './core-store'
import { reasonText } from './labels'
import { cleanWorktrees, useWorktrees } from './worktree-store'

// Whether core cleans an archived conversation's worktree and lays it out again when it is taken out.
export function archivedWorktreesSupported(): boolean {
  return useCore.getState().rpc?.features.includes('archived-worktrees') ?? false
}

// The worktrees a conversation goes by that could go once it is archived or deleted: no task's or
// delegation's, and none holding anything that would be lost. Core looks at each again as it cleans.
export function cleanableOnceAway(list: readonly ManagedWorktree[], conversationId: string): string[] {
  return list
    .filter((worktree) => worktree.conversationId === conversationId && !worktree.taskId && !worktree.agentCall && !worktree.planning)
    .filter((worktree) => checkCleanWorktree({ ...worktree, conversationArchived: true, inUse: false }, null) === null)
    .map((worktree) => worktree.path)
}

// Read from core as it stands: the list kept for the status bar may predate the conversation.
export async function worktreesToOffer(conversationId: string): Promise<string[]> {
  const rpc = useCore.getState().rpc
  if (!rpc || !archivedWorktreesSupported()) return []
  const list = await rpc.call('worktrees.list', {}).catch(() => null)
  if (list) useWorktrees.setState({ list })
  return list ? cleanableOnceAway(list, conversationId) : []
}

// Cleans them, saying which stayed and why; true when every one went.
export async function cleanAway(paths: readonly string[]): Promise<boolean> {
  const results = await cleanWorktrees(paths)
  if (!results) return false
  const failed = results.filter((result) => !result.removed)
  if (failed.length > 0) {
    const reasons = [...new Set(failed.map((result) => reasonText(result.reason ?? 'worktree-failed', result.reason ?? '')))]
    showError(t('WorktreeManager.worktreesWereNotCleaned', { value1: failed.length, value2: reasons.join('；') }))
  }
  return failed.length === 0
}
