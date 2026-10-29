import { describe, expect, it } from 'vitest'
import { checkGitOperation, GitAction, GitTarget, GitStatus } from './git'
describe('Git operation policy', () => {
  it('keeps task bindings and allows idle task commits and merges', () => {
    expect(checkGitOperation('task', { kind: 'switch', ref: 'refs/heads/main' }, false)).toBe('task-conversation')
    expect(checkGitOperation('task', { kind: 'create', name: 'new', ref: 'HEAD', checkout: true }, false)).toBe('task-conversation')
    expect(checkGitOperation('task', { kind: 'detach', ref: 'HEAD' }, false)).toBe('task-conversation')
    expect(checkGitOperation('task', { kind: 'tag', name: 'v1', ref: 'HEAD' }, false)).toBeNull()
    expect(checkGitOperation('task', { kind: 'merge', ref: 'refs/heads/main' }, false)).toBeNull()
    expect(checkGitOperation('task', { kind: 'commit', message: 'commit', push: false }, false)).toBeNull()
    expect(checkGitOperation('conversation', { kind: 'fetch' }, true)).toBe('chat-busy')
  })
  it('uses the same dirty-worktree and merge-state rules for clients and core', () => {
    const status = GitStatus.parse({ git: true, directory: '/repo', branch: 'main', head: 'abc', upstream: null, ahead: 0, behind: 0, changes: 1, branches: [], remotes: [], blocker: null, operation: null, conflicts: [] })
    expect(checkGitOperation('conversation', { kind: 'merge', ref: 'refs/heads/feature' }, false, status)).toBe('uncommitted-changes')
    expect(checkGitOperation('conversation', { kind: 'detach', ref: 'abc' }, false, status)).toBe('uncommitted-changes')
    expect(checkGitOperation('conversation', { kind: 'tag', name: 'v1', ref: 'abc' }, false, status)).toBeNull()
    status.operation = 'merge'
    expect(checkGitOperation('conversation', { kind: 'commit', message: 'commit', push: false }, false, status)).toBe('git-in-progress')
    expect(checkGitOperation('task', { kind: 'abort' }, false, status)).toBeNull()
    status.operation = null
    expect(checkGitOperation('task', { kind: 'abort' }, false, status)).toBe('git-in-progress')
  })

  it('validates operation inputs', () => {
    expect(GitAction.safeParse({ kind: 'commit', message: ' ', push: false }).success).toBe(false)
    expect(GitAction.safeParse({ kind: 'reset', ref: 'HEAD' }).success).toBe(false)
    expect(GitTarget.safeParse({ kind: 'conversation', id: 'x', project: '' }).success).toBe(false)
    expect(GitTarget.parse({ kind: 'project', project: '/repo' })).toEqual({ kind: 'project', project: '/repo' })
    expect(GitTarget.safeParse({ kind: 'task', project: '/repo' }).success).toBe(false)
    expect(GitAction.safeParse({ kind: 'rebase', ref: 'refs/heads/main' }).success).toBe(true)
  })

  it('enforces task policy for project targets, and requires a clean branch for rebase', () => {
    const status = GitStatus.parse({ git: true, directory: '/repo', branch: 'feature', head: 'abc', upstream: null, ahead: 0, behind: 0, changes: 0, branches: [], remotes: [], blocker: null, operation: null, conflicts: [] })
    const rebase = { kind: 'rebase', ref: 'refs/heads/main' } as const
    expect(checkGitOperation('project', rebase, false, status)).toBeNull()
    status.changes = 1
    expect(checkGitOperation('project', rebase, false, status)).toBe('uncommitted-changes')
    status.changes = 0; status.branch = null
    expect(checkGitOperation('project', rebase, false, status)).toBe('git-no-branch')
    status.branch = 'feature'; status.taskId = 'task'
    expect(checkGitOperation('project', rebase, false, status)).toBe('git-protected')
    expect(checkGitOperation('project', { kind: 'switch', ref: 'refs/heads/main' }, false, status)).toBe('task-conversation')
    expect(checkGitOperation('project', { kind: 'create', name: 'new', ref: 'HEAD', checkout: true }, false, status)).toBe('task-conversation')
    delete status.taskId; status.readOnly = true
    expect(checkGitOperation('project', { kind: 'fetch' }, false, status)).toBe('git-read-only')
  })
})
