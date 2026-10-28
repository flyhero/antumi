import { z } from 'zod'
import { ChangedFile } from './changes'

export const GitTarget = z.object({ kind: z.enum(['task', 'conversation']), id: z.string().min(1), project: z.string().min(1) })
export type GitTarget = z.infer<typeof GitTarget>
const Ref = z.string().min(1).max(500)
export const GitBranch = z.object({
  ref: Ref, name: z.string(), remote: z.string().nullable(), sha: z.string(), upstream: z.string().nullable(), worktree: z.string().nullable(), protected: z.boolean(),
  // A local branch's commits its upstream lacks, and the upstream's it lacks, as of the last fetch.
  ahead: z.number().int().optional(), behind: z.number().int().optional(), favorite: z.boolean().optional()
})
export type GitBranch = z.infer<typeof GitBranch>
export const GitCommit = z.object({ sha: z.string(), parents: z.array(z.string()), subject: z.string(), author: z.string(), date: z.string(), refs: z.array(z.string()), side: z.enum(['current', 'target']).optional() })
export type GitCommit = z.infer<typeof GitCommit>
export const GitHistory = z.object({ commits: z.array(GitCommit), tips: z.array(z.string()), next: z.number().int().nullable() })
export type GitHistory = z.infer<typeof GitHistory>
export const GitStatus = z.object({
  git: z.boolean(), directory: z.string(), branch: z.string().nullable(), head: z.string().nullable(),
  upstream: z.string().nullable(), ahead: z.number().int(), behind: z.number().int(), changes: z.number().int(),
  branches: z.array(GitBranch), remotes: z.array(z.string()), blocker: z.string().nullable(),
  operation: z.enum(['merge', 'other']).nullable(), conflicts: z.array(z.string()),
  // The 'other' operation is a rebase, which a core with git-update carries on like a merge.
  rebase: z.boolean().optional()
})
export type GitStatus = z.infer<typeof GitStatus>
export const GitDetail = z.object({ commit: GitCommit, message: z.string(), parent: z.string().nullable(), files: z.array(ChangedFile) })
export type GitDetail = z.infer<typeof GitDetail>
export const GitComparison = z.object({ base: z.string(), target: z.string(), ancestor: z.string().nullable(), ahead: z.number(), behind: z.number(), commits: z.array(GitCommit), files: z.array(ChangedFile) })
export type GitComparison = z.infer<typeof GitComparison>
export const GitAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('switch'), ref: Ref }),
  // A commit checked out with no branch (detached HEAD); needs git-commit-actions.
  z.object({ kind: z.literal('detach'), ref: Ref }),
  z.object({ kind: z.literal('create'), name: Ref, ref: Ref, checkout: z.boolean() }),
  // A lightweight tag on a commit, kept local; needs git-commit-actions.
  z.object({ kind: z.literal('tag'), name: Ref, ref: Ref }),
  z.object({ kind: z.literal('rename'), ref: Ref, name: Ref }),
  z.object({ kind: z.literal('delete'), ref: Ref }),
  z.object({ kind: z.literal('fetch'), remote: z.string().optional() }),
  z.object({ kind: z.literal('pull') }),
  // A local branch brought up to its upstream, as IntelliJ's Update: fetched first; the branch
  // checked out takes the upstream in by method once the two have diverged, its uncommitted
  // changes stashed and put back; any other only fast-forwards. Needs git-update.
  z.object({ kind: z.literal('update'), ref: Ref, method: z.enum(['merge', 'rebase']).optional() }),
  // name: the remote branch; left out, the branch's own name, and a branch whose upstream has
  // another name is refused (as git's push.default=simple). from: the local branch the user saw,
  // refused once the checkout has moved on (needs git-push-target). The upstream is set only when
  // the branch has none.
  z.object({ kind: z.literal('push'), remote: z.string().optional(), name: Ref.optional(), from: Ref.optional() }),
  // A local branch set to track a remote one (refs/remotes/…), or to track none; needs git-push-target.
  z.object({ kind: z.literal('track'), ref: Ref, upstream: Ref.nullable() }),
  z.object({ kind: z.literal('commit'), message: z.string().trim().min(1).max(10000), push: z.boolean() }),
  z.object({ kind: z.literal('merge'), ref: Ref }),
  z.object({ kind: z.literal('resolve'), file: z.string().min(1) }),
  z.object({ kind: z.literal('continue') }),
  z.object({ kind: z.literal('abort') })
])
export type GitAction = z.infer<typeof GitAction>
export const GitResult = z.object({
  state: z.enum(['done', 'conflicts']), commit: z.string().optional(), branch: z.string().optional(), upstream: z.string().optional(),
  // From update: how many commits came in, and whether stashed changes went back ('kept' when they
  // would not apply cleanly and wait in the stash).
  incoming: z.number().int().optional(), stash: z.enum(['restored', 'kept']).optional()
})
export type GitResult = z.infer<typeof GitResult>
// What a push from the branch checked out would send to remote/name: the newest commits first, how
// many in all, and whether the branch is new there (then counted against all of the remote's).
export const GitOutgoing = z.object({ commits: z.array(GitCommit), total: z.number().int(), isNew: z.boolean() })
export type GitOutgoing = z.infer<typeof GitOutgoing>

// A local branch's upstream as a remote and a branch on it, from refs/remotes/<remote>/<name>.
export function trackedBranch(branch: Pick<GitBranch, 'upstream'> | undefined): { remote: string; name: string } | null {
  const match = branch?.upstream ? /^refs\/remotes\/([^/]+)\/(.+)$/.exec(branch.upstream) : null
  return match?.[1] && match[2] ? { remote: match[1], name: match[2] } : null
}

// Task worktrees keep their binding even while their agent is idle.
export function checkGitOperation(kind: GitTarget['kind'], action: GitAction, busy: boolean, status?: GitStatus): string | null {
  if (busy) return 'chat-busy'
  if (kind === 'task' && (action.kind === 'switch' || action.kind === 'detach' || (action.kind === 'create' && action.checkout))) return 'task-conversation'
  if (!status) return null
  const mergeAction = ['resolve', 'continue', 'abort'].includes(action.kind)
  if (status.operation && !mergeAction) return 'git-in-progress'
  if (mergeAction && status.operation !== 'merge' && !status.rebase) return 'git-in-progress'
  if (['switch', 'detach', 'pull', 'merge'].includes(action.kind) && status.changes > 0) return 'uncommitted-changes'
  if (['commit', 'push', 'pull', 'merge'].includes(action.kind) && !status.branch) return 'git-no-branch'
  // Git will not move a branch another worktree has checked out from here.
  if (action.kind === 'update' && status.branches.some((branch) => branch.ref === action.ref && branch.worktree && branch.worktree !== status.directory)) return 'branch-elsewhere'
  if (action.kind === 'rename' || action.kind === 'delete') {
    const branch = status.branches.find((branch) => branch.ref === action.ref)
    if (branch?.protected) return 'git-protected'
    if (branch?.worktree && (action.kind === 'delete' || branch.worktree !== status.directory)) return 'branch-elsewhere'
  }
  return null
}
