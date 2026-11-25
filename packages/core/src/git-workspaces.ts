import { access } from 'node:fs/promises'
import { gte } from 'semver'
import type { GitWorkspace } from '@antumi/protocol'
import { git } from './git-changes'

const WORKTREE_NUL_VERSION = '2.36.0'

// Git before 2.36 only has line records; keep NUL records where paths can contain newlines.
export async function gitWorktreeFields(directory: string): Promise<string[]> {
  const output = await git(directory, ['--version'])
  const version = /^git version (\d+\.\d+\.\d+)/.exec(output)?.[1]
  if (!version) throw new Error(`Unrecognized Git version: ${output.trim()}`)
  const nul = gte(version, WORKTREE_NUL_VERSION)
  const listing = await git(directory, ['worktree', 'list', '--porcelain', ...(nul ? ['-z'] : [])])
  return listing.split(nul ? '\0' : '\n')
}

export async function gitWorkspaces(directory: string): Promise<GitWorkspace[]> {
  const fields = await gitWorktreeFields(directory)
  const entries: GitWorkspace[] = []
  let current: GitWorkspace | undefined
  for (const field of fields) {
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
