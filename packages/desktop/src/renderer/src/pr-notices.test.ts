import { describe, expect, it } from 'vitest'
import type { PullRequestLink, PullRequestStatus } from '@antumi/protocol'
import { prNoticesBetween } from './pr-notices'

const status = (overrides: Partial<PullRequestStatus> = {}): PullRequestStatus => ({
  state: 'open', draft: false, title: 'T', headSha: 'a'.repeat(40), base: 'main', mergeable: 'unknown', checks: [], reviews: [], comments: [], mergedAt: null, updatedAt: 0, ...overrides
})
const link = (status: PullRequestStatus | null, number = 7): PullRequestLink => ({
  taskId: 'task', repoPath: '/repo', repo: { host: 'github', owner: 'o', name: 'r' }, number, url: `https://github.com/o/r/pull/${number}`, headBranch: 'b', base: 'main', status, problem: null, fetchedAt: 1, refreshing: false
})
const tasks = { task: { title: 'Add PRs' } }
const failing = status({ checks: [{ id: 'run:1', name: 'test', state: 'failure', url: null, completedAt: null }] })

describe('prNoticesBetween', () => {
  it('tells of checks that start failing, once', () => {
    expect(prNoticesBetween({ task: [link(status())] }, { task: [link(failing)] }, tasks)).toEqual([{ title: 'Add PRs', body: 'PR #7 的检查失败', target: { kind: 'pullRequest', taskId: 'task' } }])
    expect(prNoticesBetween({ task: [link(failing)] }, { task: [link(failing)] }, tasks)).toEqual([])
    expect(prNoticesBetween({ task: [link(failing)] }, { task: [link(status({ checks: [{ id: 'run:1', name: 'test', state: 'failure', url: null, completedAt: null }, { id: 'run:2', name: 'lint', state: 'failure', url: null, completedAt: null }] }))] }, tasks)).toEqual([])
  })

  it('tells of a reviewer asking for changes, and of a merge', () => {
    const asked = status({ reviews: [{ id: 'review:1', author: 'ann', state: 'changes_requested', body: '', submittedAt: 0 }] })
    expect(prNoticesBetween({ task: [link(status())] }, { task: [link(asked)] }, tasks).map((notice) => notice.body)).toEqual(['ann 要求修改 PR #7'])
    expect(prNoticesBetween({ task: [link(asked)] }, { task: [link(status({ state: 'merged', mergedAt: 1 }))] }, tasks).map((notice) => notice.body)).toEqual(['PR #7 已合并'])
  })

  it('is silent for a pull request just linked, never fetched, or whose task is gone', () => {
    expect(prNoticesBetween({}, { task: [link(failing)] }, tasks)).toEqual([])
    expect(prNoticesBetween({ task: [link(null)] }, { task: [link(failing)] }, tasks)).toEqual([])
    expect(prNoticesBetween({ task: [link(status())] }, { task: [link(failing, 8)] }, tasks)).toEqual([])
    expect(prNoticesBetween({ task: [link(status())] }, { task: [link(failing)] }, {})).toEqual([])
  })
})
