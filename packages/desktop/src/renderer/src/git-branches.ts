import type { GitBranch } from '@antumi/protocol'

export type BranchNode = { kind: 'branch'; branch: GitBranch; label: string } | { kind: 'folder'; name: string; children: BranchNode[] }

// Lift the current branch and favorites out of folders so a collapsed directory cannot hide them.
export function branchNodes(branches: readonly GitBranch[], current: string | null, searching = false, prefix = ''): BranchNode[] {
  const isCurrent = (branch: GitBranch) => !branch.remote && branch.name === current
  const pinned = (branch: GitBranch) => isCurrent(branch) || branch.favorite === true
  const ordered = [...branches].sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a)) || Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name))
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
  return [...first, ...[...folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, entries]): BranchNode => ({ kind: 'folder', name, children: branchNodes(entries, current, searching, `${prefix}${name}/`) })), ...leaves]
}
