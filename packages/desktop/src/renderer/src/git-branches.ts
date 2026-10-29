import type { GitBranch, GitTag } from '@antumi/protocol'

export type BranchNode = { kind: 'branch'; branch: GitBranch; label: string } | { kind: 'folder'; name: string; children: BranchNode[] }

// Lift the current branch and favorites out of folders so a collapsed directory cannot hide them.
export const compareBranchNames = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || a.localeCompare(b, 'en')

export function branchNodes(branches: readonly GitBranch[], current: string | null, searching = false, prefix = ''): BranchNode[] {
  const isCurrent = (branch: GitBranch) => !branch.remote && branch.name === current
  const pinned = (branch: GitBranch) => isCurrent(branch) || branch.favorite === true
  const ordered = [...branches].sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a)) || Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || compareBranchNames(a.name, b.name))
  const first: BranchNode[] = []
  const leaves: BranchNode[] = []
  const folders = new Map<string, GitBranch[]>()
  for (const branch of ordered) {
    const name = branch.name.slice(prefix.length)
    const slash = name.indexOf('/')
    if (pinned(branch)) first.push({ kind: 'branch', branch, label: branch.name })
    else if (searching || slash < 0) leaves.push({ kind: 'branch', branch, label: searching ? branch.name : name })
    else {
      const folder = name.slice(0, slash)
      folders.set(folder, [...folders.get(folder) ?? [], branch])
    }
  }
  return [...first, ...[...folders].sort(([a], [b]) => compareBranchNames(a, b)).map(([name, entries]): BranchNode => ({ kind: 'folder', name, children: branchNodes(entries, current, searching, `${prefix}${name}/`) })), ...leaves]
}

export function branchMatch(text: string, query: string): number[] | null {
  const needle = query.trim().toLowerCase()
  const haystack = text.toLowerCase()
  const start = haystack.indexOf(needle)
  if (start >= 0) return Array.from({ length: needle.length }, (_, index) => start + index)
  const positions: number[] = []
  let after = 0
  for (const char of needle) {
    const index = haystack.indexOf(char, after)
    if (index < 0) return null
    positions.push(index); after = index + char.length
  }
  return positions
}

export type BranchRow = { id: string; depth: number; parent?: string } & (
  | { kind: 'group'; label: string; section?: 'recent' | 'local' | 'remote' | 'tags'; open: boolean; count: number }
  | { kind: 'branch'; branch: GitBranch; label: string }
  | { kind: 'tag'; tag: GitTag; label: string }
  | { kind: 'filter'; ref: 'HEAD' | 'all' }
)

type BranchTreeOptions = {
  branches: readonly GitBranch[]; tags: readonly GitTag[]; current: string | null; recent: readonly string[];
  query: string; favoritesOnly: boolean; grouped: boolean; showRecent: boolean; showTags: boolean; folded: ReadonlySet<string>
}

export function branchRows(options: BranchTreeOptions): BranchRow[] {
  const { current, query, folded } = options
  const rows: BranchRow[] = query.trim() || options.favoritesOnly ? [] : [{ id: 'HEAD', kind: 'filter', ref: 'HEAD', depth: 0 }, { id: 'all', kind: 'filter', ref: 'all', depth: 0 }]
  const branches = options.branches.filter((branch) => (!options.favoritesOnly || branch.favorite) && branchMatch(`${branch.remote ? `${branch.remote}/` : ''}${branch.name}`, query) !== null)
  const group = (id: string, label: string, depth: number, count: number, parent?: string, section?: Extract<BranchRow, { kind: 'group' }>['section']) => {
    const open = Boolean(query.trim()) || !folded.has(id)
    rows.push({ id, kind: 'group', label, depth, count, open, parent, section })
    return open
  }
  const append = (entries: readonly GitBranch[], parent: string, depth: number) => {
    const walk = (nodes: BranchNode[], parent: string, depth: number) => {
      for (const node of nodes) {
        const id = `${parent}/${node.kind === 'branch' ? node.branch.ref : node.name}`
        if (node.kind === 'branch') rows.push({ id, kind: 'branch', branch: node.branch, label: node.label, parent, depth })
        else if (group(id, node.name, depth, node.children.length, parent)) walk(node.children, id, depth + 1)
      }
    }
    walk(branchNodes(entries, current, Boolean(query.trim()) || !options.grouped), parent, depth)
  }
  const recent = options.recent.flatMap((ref) => branches.find((branch) => branch.ref === ref && branch.name !== current) ?? [])
  if (options.showRecent && recent.length && group('recent', '', 0, recent.length, undefined, 'recent')) {
    for (const branch of recent) rows.push({ id: `recent/${branch.ref}`, kind: 'branch', branch, label: branch.name, parent: 'recent', depth: 1 })
  }
  const local = branches.filter((branch) => !branch.remote)
  if (local.length && group('local', '', 0, local.length, undefined, 'local')) append(local, 'local', 1)
  const remote = branches.filter((branch) => branch.remote)
  if (remote.length && group('remote', '', 0, remote.length, undefined, 'remote')) {
    for (const name of [...new Set(remote.map((branch) => branch.remote ?? ''))].sort(compareBranchNames)) {
      const entries = remote.filter((branch) => branch.remote === name)
      if (group(`remote/${name}`, name, 1, entries.length, 'remote')) append(entries, `remote/${name}`, 2)
    }
  }
  const tags = options.tags.filter((tag) => branchMatch(tag.name, query) !== null).sort((a, b) => compareBranchNames(a.name, b.name))
  if (options.showTags && !options.favoritesOnly && tags.length && group('tags', '', 0, tags.length, undefined, 'tags')) {
    for (const tag of tags) rows.push({ id: tag.ref, kind: 'tag', tag, label: tag.name, parent: 'tags', depth: 1 })
  }
  return rows
}

// Include descendants hidden by collapsed parents, independently of search and favorites.
export function branchGroupIds(options: Omit<BranchTreeOptions, 'query' | 'favoritesOnly' | 'folded'>, minDepth = 0): string[] {
  return branchRows({ ...options, query: '', favoritesOnly: false, folded: new Set() }).flatMap((row) => row.kind === 'group' && row.depth >= minDepth ? [row.id] : [])
}
