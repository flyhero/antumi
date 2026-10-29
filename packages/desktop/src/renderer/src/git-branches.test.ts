import { describe, expect, it } from 'vitest'
import { GitBranch } from '@antumi/protocol'
import { branchMatch, branchNodes, branchRows, compareBranchNames } from './git-branches'

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

  it('naturally sorts numeric names and prefers a contiguous search match before subsequences', () => {
    expect(['feature/10', 'feature/2', 'feature/1'].sort(compareBranchNames)).toEqual(['feature/1', 'feature/2', 'feature/10'])
    expect(branchMatch('feature/topic', 'TOP')).toEqual([8, 9, 10])
    expect(branchMatch('feature/topic', 'ftp')).toEqual([0, 3, 10])
    expect(branchMatch('feature/topic', 'xyz')).toBeNull()
    expect(branchMatch('feature/topic', '  ')).toEqual([])
  })

  it('expands search results without losing folded state and separates identical local and remote names', () => {
    const options = { branches: [branch('feature/2'), branch('feature/10'), branch('feature/2', false, 'origin')], tags: [{ ref: 'refs/tags/v2', name: 'v2', sha: 'abc' }], current: null, recent: [], query: '', favoritesOnly: false, grouped: true, showRecent: true, showTags: true, folded: new Set(['local', 'remote/origin', 'tags']) }
    expect(branchRows(options).filter((row) => row.kind === 'branch')).toEqual([])
    const searching = branchRows({ ...options, query: 'f2' })
    expect(searching.filter((row) => row.kind === 'branch').map((row) => row.branch.ref)).toEqual(['refs/heads/feature/2', 'refs/remotes/origin/feature/2'])
    expect(branchRows(options).find((row) => row.id === 'local')).toMatchObject({ open: false })
    expect(branchRows({ ...options, query: 'v2' }).filter((row) => row.kind === 'tag')).toHaveLength(1)
  })

  it('preserves recent checkout order, supports a flat list, and applies favorites to all sections', () => {
    const options = { branches: [branch('feature/2', true), branch('feature/10'), branch('main')], tags: [], current: 'main', recent: ['refs/heads/feature/10', 'refs/heads/missing', 'refs/heads/feature/2', 'refs/heads/main'], query: '', favoritesOnly: false, grouped: false, showRecent: true, showTags: true, folded: new Set<string>() }
    const rows = branchRows(options)
    expect(rows.flatMap((row) => row.kind === 'branch' && row.parent === 'recent' ? [row.branch.name] : [])).toEqual(['feature/10', 'feature/2'])
    expect(rows.some((row) => row.kind === 'group' && row.label === 'feature')).toBe(false)
    expect(branchRows({ ...options, favoritesOnly: true }).filter((row) => row.kind === 'branch').every((row) => row.branch.favorite)).toBe(true)
    expect(branchRows({ ...options, showRecent: false }).some((row) => row.id === 'recent')).toBe(false)
  })
})
