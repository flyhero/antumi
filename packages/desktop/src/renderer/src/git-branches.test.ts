import { describe, expect, it } from 'vitest'
import { GitBranch } from '@antumi/protocol'
import { branchGroupIds, branchMatch, branchNodes, branchRows, compareBranchNames } from './git-branches'

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

  it('collapses descendants as well as their local, remote, recent and tag sections', () => {
    const branches = [branch('main', true), branch('feature/api/login'), branch('feature/ui/panel'), branch('feature/api/login', false, 'origin'), branch('hotfix/urgent', false, 'upstream')]
    const options = { branches, tags: [{ ref: 'refs/tags/v1', name: 'v1', sha: 'abc' }], current: 'main', recent: ['refs/heads/feature/api/login'], grouped: true, showRecent: true, showTags: true }
    const ids = branchGroupIds(options)
    expect(ids).toEqual(['recent', 'local', 'local/feature', 'local/feature/api', 'local/feature/ui', 'remote', 'remote/origin', 'remote/origin/feature', 'remote/origin/feature/api', 'remote/upstream', 'remote/upstream/hotfix', 'tags'])
    const folded = new Set(ids)
    const rows = (folded: ReadonlySet<string>, query = '') => branchRows({ ...options, folded, query, favoritesOnly: false })
    expect(rows(folded).every((row) => row.kind === 'filter' || row.kind === 'group' && !row.open)).toBe(true)
    folded.delete('local')
    expect(rows(folded).filter((row) => row.kind === 'branch').map((row) => row.branch.name)).toEqual(['main'])
    expect(rows(folded).find((row) => row.id === 'local/feature')).toMatchObject({ open: false })
    expect(rows(folded, 'login').filter((row) => row.kind === 'branch')).toHaveLength(3)
    expect(rows(folded).find((row) => row.id === 'local/feature')).toMatchObject({ open: false })
    expect(new Set(rows(new Set()).flatMap((row) => row.kind === 'branch' ? [row.branch.ref] : []))).toEqual(new Set(branches.map((branch) => branch.ref)))
    expect(rows(new Set()).some((row) => row.kind === 'tag')).toBe(true)
  })

  it('collects only enabled groups and handles an empty branch tree', () => {
    const options = { branches: [branch('feature/nested/topic'), branch('feature/nested/topic', false, 'origin')], tags: [{ ref: 'refs/tags/v1', name: 'v1', sha: 'abc' }], current: null, recent: ['refs/heads/feature/nested/topic'], grouped: false, showRecent: false, showTags: false }
    expect(branchGroupIds(options)).toEqual(['local', 'remote', 'remote/origin'])
    expect(branchGroupIds({ ...options, branches: [] })).toEqual([])
  })

  it('defaults to one expanded level while keeping current branches, favorites and recent entries visible', () => {
    const options = { branches: [branch('work/current'), branch('feature/saved', true), branch('feature/api/login'), branch('main'), branch('feature/api/login', false, 'origin')], tags: [{ ref: 'refs/tags/v1', name: 'v1', sha: 'abc' }], current: 'work/current', recent: ['refs/heads/feature/api/login'], grouped: true, showRecent: true, showTags: true }
    const folded = new Set(branchGroupIds(options, 1))
    expect([...folded]).toEqual(['local/feature', 'local/feature/api', 'remote/origin', 'remote/origin/feature', 'remote/origin/feature/api'])
    const rows = branchRows({ ...options, query: '', favoritesOnly: false, folded })
    expect(rows.every((row) => row.kind !== 'group' || row.depth !== 0 || row.open)).toBe(true)
    expect(rows.every((row) => row.kind !== 'group' || row.depth !== 1 || !row.open)).toBe(true)
    expect(rows.flatMap((row) => row.kind === 'branch' ? [row.branch.name] : [])).toEqual(['feature/api/login', 'work/current', 'feature/saved', 'main'])
    expect(rows.some((row) => row.kind === 'tag')).toBe(true)
    expect(branchRows({ ...options, query: 'login', favoritesOnly: false, folded }).filter((row) => row.kind === 'branch')).toHaveLength(3)
    expect(branchGroupIds({ ...options, branches: [], tags: [] }, 1)).toEqual([])
    expect(branchGroupIds({ ...options, grouped: false }, 1)).toEqual(['remote/origin'])
  })
})
