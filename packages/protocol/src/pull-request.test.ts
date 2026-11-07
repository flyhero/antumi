import { describe, expect, it } from 'vitest'
import { checkAcceptOnMerge, type PullRequestLink } from './pull-request'
import type { Task, TaskStatus } from './task'

const repo = (path: string, reference = false): Task['repos'][number] => ({ path, worktreePath: null, branch: null, startRef: null, start: null, ...(reference ? { reference } : {}) })

function task(status: TaskStatus, repos: Task['repos'] = [repo('/a')]): Pick<Task, 'status' | 'repos'> {
  return { status, repos }
}

function link(repoPath: string, state: 'open' | 'merged' | 'closed' | null): Pick<PullRequestLink, 'repoPath' | 'status'> {
  return { repoPath, status: state === null ? null : { state, draft: false, title: '', headSha: 'a'.repeat(40), base: 'main', mergeable: 'unknown', checks: [], reviews: [], comments: [], mergedAt: null, updatedAt: 0 } }
}

describe('checkAcceptOnMerge', () => {
  it('lets a task under review or running be accepted once every repo is merged', () => {
    expect(checkAcceptOnMerge(task('review'), [link('/a', 'merged')])).toBeNull()
    expect(checkAcceptOnMerge(task('running'), [link('/a', 'merged')])).toBeNull()
  })

  it('needs every repo the task writes to, but no reference project', () => {
    expect(checkAcceptOnMerge(task('review', [repo('/a'), repo('/b')]), [link('/a', 'merged')])).toBe('not-merged')
    expect(checkAcceptOnMerge(task('review', [repo('/a'), repo('/b')]), [link('/a', 'merged'), link('/b', 'merged')])).toBeNull()
    expect(checkAcceptOnMerge(task('review', [repo('/a'), repo('/docs', true)]), [link('/a', 'merged')])).toBeNull()
    expect(checkAcceptOnMerge(task('review', []), [])).toBe('not-merged')
  })

  it('counts only a pull request the host says is merged', () => {
    expect(checkAcceptOnMerge(task('review'), [link('/a', 'open')])).toBe('not-merged')
    expect(checkAcceptOnMerge(task('review'), [link('/a', 'closed')])).toBe('not-merged')
    expect(checkAcceptOnMerge(task('review'), [link('/a', null)])).toBe('not-merged')
    expect(checkAcceptOnMerge(task('review'), [])).toBe('not-merged')
  })

  it('never applies to a task not started, or already closed', () => {
    expect(checkAcceptOnMerge(task('pending'), [link('/a', 'merged')])).toBe('not-finished')
    expect(checkAcceptOnMerge(task('done'), [link('/a', 'merged')])).toBe('not-finished')
    expect(checkAcceptOnMerge(task('abandoned'), [link('/a', 'merged')])).toBe('not-finished')
  })
})
