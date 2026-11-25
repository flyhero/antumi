import { afterEach, describe, expect, it, vi } from 'vitest'
import * as changes from './git-changes'
import { gitWorktreeFields } from './git-workspaces'

afterEach(() => vi.restoreAllMocks())

describe('Git worktree record formats', () => {
  it.each([
    ['2.34.1', false],
    ['2.35.3', false],
    ['2.36.0', true],
    ['2.39.5 (Apple Git-154)', true],
    ['2.45.1.windows.1', true]
  ] as const)('reads the format supported by Git %s', async (version, nul) => {
    const fields = ['worktree /home/me/项目 with spaces', 'branch refs/heads/main', 'locked "first\\nsecond"', '', '']
    const run = vi.spyOn(changes, 'git').mockResolvedValueOnce(`git version ${version}\n`).mockResolvedValueOnce(fields.join(nul ? '\0' : '\n'))
    expect(await gitWorktreeFields('/home/me/项目 with spaces')).toEqual(fields)
    expect(run).toHaveBeenLastCalledWith('/home/me/项目 with spaces', ['worktree', 'list', '--porcelain', ...(nul ? ['-z'] : [])])
  })

  it('keeps newlines inside paths with NUL records', async () => {
    const fields = ['worktree /home/me/first\nbranch refs/heads/fake\nsecond', 'branch refs/heads/main', '', '']
    vi.spyOn(changes, 'git').mockResolvedValueOnce('git version 2.36.0\n').mockResolvedValueOnce(fields.join('\0'))
    expect(await gitWorktreeFields('/home/me/repo')).toEqual(fields)
  })

  it('reports a failed listing without retrying another format', async () => {
    const error = new Error('git worktree list failed')
    const run = vi.spyOn(changes, 'git').mockResolvedValueOnce('git version 2.36.0\n').mockRejectedValueOnce(error)
    await expect(gitWorktreeFields('/home/me/repo')).rejects.toBe(error)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('reports an unrecognized version instead of guessing the format', async () => {
    const run = vi.spyOn(changes, 'git').mockResolvedValueOnce('unexpected version output\n')
    await expect(gitWorktreeFields('/home/me/repo')).rejects.toThrow('Unrecognized Git version: unexpected version output')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
