import { access } from 'node:fs/promises'
import type { GitWorkspace } from '@antumi/protocol'
import { git } from './git-changes'

// NUL records preserve spaces and non-ASCII paths without Git's display quoting.
export async function gitWorkspaces(directory: string): Promise<GitWorkspace[]> {
  const output = await git(directory, ['worktree', 'list', '--porcelain', '-z'])
  const entries: GitWorkspace[] = []
  let current: GitWorkspace | undefined
  for (const field of output.split('\0')) {
    if (field.startsWith('worktree ')) {
      current = { path: field.slice(9), branch: null, detached: false, locked: false, missing: false, conversationIds: [], planning: field.slice(9).split(/[\\/]/).includes('.planning') }
      entries.push(current)
    } else if (current) {
      if (field.startsWith('branch ')) current.branch = field.slice(7).replace(/^refs\/heads\//, '')
      if (field === 'detached') current.detached = true
      if (field === 'locked' || field.startsWith('locked ')) current.locked = true
    }
  }
  await Promise.all(entries.map(async (entry) => { entry.missing = !await access(entry.path).then(() => true, () => false) }))
  return entries
}
