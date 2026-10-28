import { describe, expect, it } from 'vitest'
import { GitBranch } from '@antumi/protocol'
import { branchNodes } from './git-branches'

const branch = (name: string, favorite?: boolean, remote: string | null = null) => GitBranch.parse({ ref: remote ? `refs/remotes/${remote}/${name}` : `refs/heads/${name}`, name, remote, favorite, sha: 'abc', upstream: null, worktree: null, protected: false })

describe('branch tree', () => {
  it('lifts the current branch and favorites out of folders, followed by ordinary directories and names', () => {
    const current = branch('work/current')
    const favorite = branch('feature/saved', true)
    const nested = branch('feature/other')
    const nodes = branchNodes([branch('z'), nested, favorite, branch('a'), current], current.name)
    expect(nodes).toEqual([
      { kind: 'branch', branch: current, label: 'work/current' },
      { kind: 'branch', branch: favorite, label: 'feature/saved' },
      { kind: 'folder', name: 'feature', children: [{ kind: 'branch', branch: nested, label: 'other' }] },
      { kind: 'branch', branch: branch('a'), label: 'a' },
      { kind: 'branch', branch: branch('z'), label: 'z' }
    ])
  })

  it('does not treat a remote with the current local name as checked out, and keeps full names in search', () => {
    const remote = branch('work/current', false, 'origin')
    const favorite = branch('feature/saved', true, 'origin')
    const other = branch('a/b', undefined, 'origin')
    expect(branchNodes([remote, other, favorite], 'work/current', true)).toEqual([
      { kind: 'branch', branch: favorite, label: 'feature/saved' },
      { kind: 'branch', branch: other, label: 'a/b' },
      { kind: 'branch', branch: remote, label: 'work/current' }
    ])
  })
})
