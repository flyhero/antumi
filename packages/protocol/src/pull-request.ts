import { z } from 'zod'
import { checkMove, type Task } from './task'

// A pull request for a task's branch in one of its repos (feature pull-requests). Core opens it on
// the host, remembers it, and keeps a copy of what the host says about it; a client never talks to
// the host itself. Only github.com so far; `host` is where another would plug in.

export const PullRequestRepo = z.object({
  host: z.literal('github'),
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100)
})
export type PullRequestRepo = z.infer<typeof PullRequestRepo>

// A check run or commit status on the head commit, in the terms both share.
export const PullRequestCheck = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200),
  state: z.enum(['queued', 'running', 'success', 'failure', 'skipped', 'neutral']),
  url: z.string().max(2000).nullable(),
  completedAt: z.number().nullable()
})
export type PullRequestCheck = z.infer<typeof PullRequestCheck>

export const PullRequestReview = z.object({
  id: z.string().min(1).max(200),
  author: z.string().max(100),
  state: z.enum(['approved', 'changes_requested', 'commented']),
  body: z.string().max(20_000),
  submittedAt: z.number()
})
export type PullRequestReview = z.infer<typeof PullRequestReview>

// A comment on the diff (path and line) or on the conversation (neither).
export const PullRequestComment = z.object({
  id: z.string().min(1).max(200),
  author: z.string().max(100),
  path: z.string().max(2000).nullable(),
  line: z.number().int().nullable(),
  body: z.string().max(20_000),
  url: z.string().max(2000),
  resolved: z.boolean().nullable(),
  createdAt: z.number()
})
export type PullRequestComment = z.infer<typeof PullRequestComment>

export const PullRequestStatus = z.object({
  state: z.enum(['open', 'merged', 'closed']),
  draft: z.boolean(),
  title: z.string().max(500),
  headSha: z.string(),
  base: z.string(),
  // unknown while the host is still computing it, or when it did not say.
  mergeable: z.enum(['mergeable', 'conflicting', 'unknown']),
  checks: z.array(PullRequestCheck),
  reviews: z.array(PullRequestReview),
  comments: z.array(PullRequestComment),
  mergedAt: z.number().nullable(),
  updatedAt: z.number()
})
export type PullRequestStatus = z.infer<typeof PullRequestStatus>

export const PULL_REQUEST_FAILURES = ['auth-failed', 'forbidden', 'not-found', 'rate-limited', 'request-failed'] as const
export const PullRequestFailure = z.enum(PULL_REQUEST_FAILURES)
export type PullRequestFailure = z.infer<typeof PullRequestFailure>

export const PullRequestProblem = z.object({ code: PullRequestFailure, message: z.string() })
export type PullRequestProblem = z.infer<typeof PullRequestProblem>

export const PullRequestLink = z.object({
  taskId: z.string(),
  repoPath: z.string(),
  repo: PullRequestRepo,
  number: z.number().int().positive(),
  url: z.string().max(2000),
  headBranch: z.string(),
  base: z.string(),
  // What the host last said; null until first fetched.
  status: PullRequestStatus.nullable(),
  // The last fetch failed; `status` keeps what the one before it found.
  problem: PullRequestProblem.nullable(),
  fetchedAt: z.number().nullable(),
  refreshing: z.boolean()
})
export type PullRequestLink = z.infer<typeof PullRequestLink>

// Why a branch cannot have a pull request opened for it, the first that applies, in this order.
// existing-pr: one is open or merged for the branch already, given in `existing`. dirty: changes
// not committed, which the pull request would not carry. base-missing: the branch it started from
// is not on the remote, as a dependency's branch is not until pushed; `baseFallback` is the
// remote's default branch, offered instead. auth: no GitHub credential on this machine.
export const PULL_REQUEST_BLOCKERS = ['not-github', 'detached-head', 'head-is-default', 'existing-pr', 'dirty', 'no-commits', 'base-missing', 'auth'] as const
export const PullRequestBlocker = z.enum(PULL_REQUEST_BLOCKERS)
export type PullRequestBlocker = z.infer<typeof PullRequestBlocker>

export const PullRequestEligibility = z.object({
  repoPath: z.string(),
  repo: PullRequestRepo.nullable(),
  headBranch: z.string().nullable(),
  // The base as the host names it (`main`, not `origin/main`), from where the task's branch started.
  base: z.string().nullable(),
  baseFallback: z.string().nullable(),
  // The branch has commits the remote lacks, or no upstream yet; creating pushes first.
  needsPush: z.boolean(),
  blocker: PullRequestBlocker.nullable(),
  existing: PullRequestLink.nullable()
})
export type PullRequestEligibility = z.infer<typeof PullRequestEligibility>

export const PullRequestDraft = z.object({ title: z.string(), body: z.string(), model: z.string().nullable() })
export type PullRequestDraft = z.infer<typeof PullRequestDraft>

export const PULL_REQUEST_MERGE_METHODS = ['squash', 'merge', 'rebase'] as const
export const PullRequestMergeMethod = z.enum(PULL_REQUEST_MERGE_METHODS)
export type PullRequestMergeMethod = z.infer<typeof PullRequestMergeMethod>

// What of a pull request is handed to the task's agent: failed checks, or review comments.
export const PullRequestHandoffKind = z.enum(['checks', 'reviews'])
export type PullRequestHandoffKind = z.infer<typeof PullRequestHandoffKind>

export type AcceptOnMergeBlocker = 'not-finished' | 'not-merged'

// A task whose work is merged on the host can be accepted on the strength of that: it is still the
// user's move (or, by their setting, core's on their behalf), never the host's. Every repo the task
// writes to must have a merged pull request; a reference project has none.
export function checkAcceptOnMerge(task: Pick<Task, 'status' | 'repos'>, links: readonly Pick<PullRequestLink, 'repoPath' | 'status'>[]): AcceptOnMergeBlocker | null {
  if (task.status === 'pending' || checkMove(task, 'done') !== null) return 'not-finished'
  const repos = task.repos.filter((repo) => !repo.reference)
  if (repos.length === 0) return 'not-merged'
  return repos.every((repo) => links.some((link) => link.repoPath === repo.path && link.status?.state === 'merged')) ? null : 'not-merged'
}
