import type { PullRequestLink, PullRequestStatus } from '@antumi/protocol'
import { perform, useCore } from './core-store'

const NONE: readonly PullRequestLink[] = []

export function usePullRequestsSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('pull-requests') ?? false)
}

// The task's pull requests as core last told, every repo's; core announces each change.
export function usePullRequests(taskId: string | null): readonly PullRequestLink[] {
  return useCore((state) => (taskId ? state.pullRequests[taskId] : undefined) ?? NONE)
}

export function receivePullRequests(taskId: string, links: PullRequestLink[]): void {
  useCore.setState((state) => ({ pullRequests: { ...state.pullRequests, [taskId]: links } }))
}

export function receiveAllPullRequests(links: readonly PullRequestLink[]): void {
  const byTask: Record<string, PullRequestLink[]> = {}
  for (const link of links) (byTask[link.taskId] ??= []).push(link)
  useCore.setState({ pullRequests: byTask })
}

export async function refreshPullRequests(taskId: string): Promise<void> {
  const links = await perform((rpc) => rpc.call('pullRequests.refresh', { taskId }))
  if (links) receivePullRequests(taskId, links)
}

export async function unlinkPullRequests(taskId: string, repoPaths: readonly string[]): Promise<void> {
  for (const repoPath of repoPaths) await perform((rpc) => rpc.call('pullRequests.unlink', { taskId, repoPath }))
}

// In the user's own browser, signed in as they are.
export function openPullRequest(link: Pick<PullRequestLink, 'url'>): void {
  window.open(link.url, '_blank', 'noreferrer')
}

export type PullRequestState = 'draft' | 'open' | 'merged' | 'closed' | 'unknown'

export function pullRequestState(link: Pick<PullRequestLink, 'status'>): PullRequestState {
  if (!link.status) return 'unknown'
  return link.status.state === 'open' && link.status.draft ? 'draft' : link.status.state
}

export type ChecksSummary = 'none' | 'running' | 'success' | 'failure'

// How the checks stand as one word: any failed is failed, else any still running, else passed.
export function checksSummary(status: Pick<PullRequestStatus, 'checks'> | null): ChecksSummary {
  const counted = status?.checks.filter((check) => check.state !== 'skipped' && check.state !== 'neutral') ?? []
  if (counted.length === 0) return 'none'
  if (counted.some((check) => check.state === 'failure')) return 'failure'
  if (counted.some((check) => check.state === 'queued' || check.state === 'running')) return 'running'
  return 'success'
}

// The pull requests still standing: a closed one is history, which the task may open anew.
export function livePullRequests(links: readonly PullRequestLink[]): PullRequestLink[] {
  return links.filter((link) => link.status?.state !== 'closed')
}
