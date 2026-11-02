import { trackedBranch, type GitOutgoing, type GitResult, type GitStatus } from '@antumi/protocol'
import { git, gitOrNull } from './git-changes'
import { logCommits, writeGit } from './git-repository'
import { Rejection } from './rejection'

type Checks = { remoteAt: (remote: string) => string; validName: (name: string) => Promise<void> }

// Pushes the branch checked out, as IntelliJ's Push does: to the remote and branch named, else to its
// own name on its upstream's remote. A branch whose upstream has another name is refused when none
// is named, as git's push.default=simple refuses it, so a one-click push never lands elsewhere. A
// branch keeps the upstream it has; only one with none takes the target as its upstream. Forced, it
// replaces the remote branch only if that is still where it was last fetched (--force-with-lease).
export async function pushBranch(dir: string, status: GitStatus, action: { remote?: string; name?: string; from?: string; force?: boolean }, checks: Checks): Promise<GitResult> {
  const branch = status.branch
  if (!branch) throw new Rejection('git-no-branch', '请先检出一个本地分支。')
  if (action.from && action.from !== branch) throw new Rejection('git-branch-changed', `当前分支已经是 ${branch}，不是对话框里的 ${action.from}。请刷新后再推送。`)
  const local = status.branches.find((entry) => entry.ref === `refs/heads/${branch}`)
  const tracked = trackedBranch(local)
  if (!action.name && tracked && tracked.name !== branch) {
    throw new Rejection('git-push-name-mismatch', `${branch} 的上游是 ${tracked.remote}/${tracked.name}，名字不同。请在 Git 页的 Push 里确认目标。`)
  }
  const remoteName = action.remote ?? tracked?.remote ?? (status.remotes.includes('origin') ? 'origin' : status.remotes[0] ?? 'origin')
  const remote = checks.remoteAt(remoteName)
  const name = action.name ?? branch
  await checks.validName(name)
  // By the commit last fetched, named outright: the remote may be given as a URL, which has no
  // remote-tracking branch for git to take it from. A branch the remote lacks needs no force.
  const lease = action.force ? (await gitOrNull(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remoteName}/${name}`]))?.trim() : null
  try {
    await writeGit(dir, ['push', ...(tracked ? [] : ['--set-upstream']), ...(lease ? [`--force-with-lease=refs/heads/${name}:${lease}`] : []), remote, `refs/heads/${branch}:refs/heads/${name}`])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // The remote has commits the branch lacks: the user can take them in and push again. Not when
    // forcing, where taking them in would bring back what the force was to replace.
    if (!action.force && /\[rejected\]|\(fetch first\)|\(non-fast-forward\)/.test(message)) throw new Rejection('git-push-rejected', `${remote}/${name} 有本地没有的提交，需要先并进来再推。`)
    throw error
  }
  return { state: 'done', branch, upstream: tracked ? `${tracked.remote}/${tracked.name}` : `${remote}/${name}` }
}

// What pushing the branch checked out to remote/name would send. A branch the remote lacks is
// counted against everything the remote has, so a new branch shows only its own commits.
export async function outgoingCommits(dir: string, status: GitStatus, remote: string, name: string, checks: Checks): Promise<GitOutgoing> {
  if (!status.branch) throw new Rejection('git-no-branch', '请先检出一个本地分支。')
  checks.remoteAt(remote)
  await checks.validName(name)
  const source = `refs/heads/${status.branch}`
  const target = `refs/remotes/${remote}/${name}`
  const isNew = !await gitOrNull(dir, ['rev-parse', '--verify', '--quiet', target])
  const exclude = isNew ? ['--not', `--remotes=${remote}`] : [`^${target}`]
  const [commits, total] = await Promise.all([
    logCommits(dir, [source, ...exclude]),
    git(dir, ['rev-list', '--count', source, ...exclude]).then((count) => Number(count.trim()) || 0)
  ])
  return { commits: commits.slice(0, 100), total, isNew }
}

// Sets a local branch to track a remote one, or none.
export async function trackBranch(dir: string, status: GitStatus, ref: string, upstream: string | null): Promise<GitResult> {
  const branch = status.branches.find((entry) => entry.ref === ref && !entry.remote)
  if (!branch) throw new Rejection('branch-not-found')
  if (upstream === null) {
    if (branch.upstream) await writeGit(dir, ['branch', '--unset-upstream', branch.name])
    return { state: 'done', branch: branch.name }
  }
  const target = status.branches.find((entry) => entry.ref === upstream && entry.remote)
  if (!target) throw new Rejection('branch-not-found', '只能跟踪已有的远端分支。')
  await writeGit(dir, ['branch', `--set-upstream-to=${target.remote}/${target.name}`, branch.name])
  return { state: 'done', branch: branch.name, upstream: `${target.remote}/${target.name}` }
}
