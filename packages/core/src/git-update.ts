import { access, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { GitResult, GitStatus } from '@antumi/protocol'
import { git, gitOrNull } from './git-changes'
import { conflictFiles, gitOperation, writeGit } from './git-repository'
import { Rejection } from './rejection'

// What an update stashes the checkout's changes under, so only its own stash is ever put back.
const stashLabel = (branch: string) => `antumi-update:${branch}`

async function rebaseOriginFile(dir: string): Promise<string> {
  return path.resolve(dir, (await git(dir, ['rev-parse', '--git-path', 'antumi-direct-rebase'])).trim())
}

export async function clearDirectRebase(dir: string): Promise<void> {
  await unlink(await rebaseOriginFile(dir)).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  })
}

export async function rebaseBranch(dir: string, sha: string): Promise<GitResult> {
  // A direct rebase must never pop a stash kept by an earlier Update, including after restart.
  await writeFile(await rebaseOriginFile(dir), '')
  try {
    await writeGit(dir, ['-c', 'rebase.autoStash=false', '-c', 'rebase.updateRefs=false', 'rebase', sha])
    return { state: 'done' }
  } catch (error) {
    if (await rebasing(dir)) return { state: 'conflicts' }
    throw error
  } finally {
    if (!await rebasing(dir)) await clearDirectRebase(dir)
  }
}

export async function rebasing(dir: string): Promise<boolean> {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const file = await gitOrNull(dir, ['rev-parse', '--git-path', name])
    if (file && await access(path.resolve(dir, file)).then(() => true, () => false)) return true
  }
  return false
}

// "ahead 2, behind 12" from for-each-ref's %(upstream:track,nobracket); a gone upstream counts nothing.
export function parseTrack(track: string): { ahead?: number; behind?: number } {
  if (!track || track === 'gone') return {}
  const count = (word: string) => Number(new RegExp(`${word} (\\d+)`).exec(track)?.[1] ?? 0)
  return { ahead: count('ahead'), behind: count('behind') }
}

async function counts(dir: string, local: string, upstream: string): Promise<{ ahead: number; behind: number }> {
  const [ahead = 0, behind = 0] = (await git(dir, ['rev-list', '--left-right', '--count', `${local}...${upstream}`])).trim().split(/\s+/).map(Number)
  return { ahead, behind }
}

// Puts back the stash an update made for branch, when it is the newest one; 'kept' when it would
// not apply cleanly, which leaves it in the stash for the user.
export async function restoreUpdateStash(dir: string, branch: string | null): Promise<GitResult['stash']> {
  if (!branch) return undefined
  const top = await gitOrNull(dir, ['stash', 'list', '--max-count=1', '--format=%gs'])
  if (!top?.endsWith(`: ${stashLabel(branch)}`)) return undefined
  try {
    await writeGit(dir, ['stash', 'pop'])
    return 'restored'
  } catch {
    return 'kept'
  }
}

// After a merge or rebase stopped on conflicts: whether it stopped again, else the branch's stash back.
async function settled(dir: string): Promise<GitResult> {
  if (await gitOperation(dir) && (await conflictFiles(dir)).length) return { state: 'conflicts' }
  if (await access(await rebaseOriginFile(dir)).then(() => true, () => false)) {
    await clearDirectRebase(dir)
    return { state: 'done' }
  }
  const branch = await gitOrNull(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  return { state: 'done', stash: await restoreUpdateStash(dir, branch) }
}

export async function continueOperation(dir: string, status: GitStatus): Promise<GitResult> {
  if (status.conflicts.length) throw new Rejection('git-conflicts', '仍有未解决的冲突文件。')
  try {
    // No editor to wait on: each commit keeps the message it had.
    await writeGit(dir, status.rebase ? ['-c', 'core.editor=true', 'rebase', '--continue'] : ['commit', '--no-edit'])
  } catch (error) {
    if (status.rebase && (await conflictFiles(dir)).length) return { state: 'conflicts' }
    throw error
  }
  return settled(dir)
}

export async function abortOperation(dir: string, status: GitStatus): Promise<GitResult> {
  await writeGit(dir, status.rebase ? ['rebase', '--abort'] : ['merge', '--abort'])
  return settled(dir)
}

// Brings a local branch up to its upstream, as IntelliJ's Update does. The upstream is fetched
// first. A branch not checked out only fast-forwards, and is refused once it has diverged; the one
// checked out fast-forwards, or takes the upstream in by method, its uncommitted changes stashed for
// the while and put back after.
export async function updateBranch(dir: string, status: GitStatus, ref: string, method: 'merge' | 'rebase' | undefined, remoteAt: (remote: string) => string): Promise<GitResult> {
  const branch = status.branches.find((entry) => entry.ref === ref && !entry.remote)
  if (!branch) throw new Rejection('branch-not-found')
  const upstream = branch.upstream ? /^refs\/remotes\/([^/]+)\/(.+)$/.exec(branch.upstream) : null
  if (!branch.upstream || !upstream?.[1] || !upstream[2]) throw new Rejection('git-no-upstream', '这个分支没有跟踪的远端分支，请先推送并建立跟踪。')
  const remote = remoteAt(upstream[1])
  await writeGit(dir, ['fetch', remote, `+refs/heads/${upstream[2]}:${branch.upstream}`])
  const { ahead, behind } = await counts(dir, branch.ref, branch.upstream)
  if (behind === 0) return { state: 'done', branch: branch.name, incoming: 0 }
  if (status.branch !== branch.name) {
    if (branch.worktree) throw new Rejection('branch-elsewhere')
    if (ahead > 0) throw new Rejection('git-update-diverged', `${branch.name} 和远端已分叉，切换到这个分支后再更新。`)
    // Moves only from the commit read here, so nothing that lands meanwhile is overwritten.
    await writeGit(dir, ['update-ref', '-m', `antumi: update ${branch.name}`, branch.ref, await git(dir, ['rev-parse', branch.upstream]).then((sha) => sha.trim()), branch.sha])
    return { state: 'done', branch: branch.name, incoming: behind }
  }
  if (ahead > 0 && !method) throw new Rejection('git-update-diverged', `${branch.name} 和远端已分叉，请选择合并或变基。`)
  const stashed = status.changes > 0
  if (stashed) await writeGit(dir, ['stash', 'push', '--include-untracked', '--message', stashLabel(branch.name)])
  try {
    if (ahead === 0) await writeGit(dir, ['merge', '--ff-only', branch.upstream])
    else if (method === 'rebase') await writeGit(dir, ['rebase', branch.upstream])
    // By its short name, so the merge commit says 'origin/main' as git's own pull would.
    else await writeGit(dir, ['merge', '--no-edit', branch.upstream.slice('refs/remotes/'.length)])
  } catch (error) {
    // Conflicts wait for the user, the stash with them; it goes back once they finish or abort.
    if (await gitOperation(dir) && (await conflictFiles(dir)).length) return { state: 'conflicts', branch: branch.name, incoming: behind }
    if (stashed) await restoreUpdateStash(dir, branch.name)
    throw error
  }
  return { state: 'done', branch: branch.name, incoming: behind, stash: stashed ? await restoreUpdateStash(dir, branch.name) : undefined }
}
