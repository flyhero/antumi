import path from 'node:path'
import { realpath } from 'node:fs/promises'
import { shortTaskId, type AgentCallWorktreeOutcome } from '@antumi/protocol'
import { execFileAsync } from './hidden-exec'
import { Rejection } from './rejection'
import { gitTopLevel, prepareConversationWorktrees } from './workspace'

// A developing member can work in a worktree of its own instead of the caller's directories: a
// branch from the caller's commit, laid out like a conversation's worktree, merged by the caller
// when the member is done. The caller's checkout has to be committed for the branch to start from
// what the caller sees.

// Reads are bounded: the delegation chain waits on them, and a repository that hangs must not
// hold every other call's start and end.
const GIT_TIMEOUT_MS = 15_000
const git = async (dir: string, args: readonly string[]): Promise<string> => (await execFileAsync('git', ['--no-optional-locks', '-C', dir, ...args], { timeout: GIT_TIMEOUT_MS })).stdout.trim()

// Uncommitted entries, untracked files one by one; -z keeps a path from spanning lines. A rename
// (type 2) carries its original path as a field of its own, which is not another entry.
export function countStatusEntries(out: string): number {
  const fields = out.split('\0')
  let count = 0
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (!field) continue
    count++
    if (field.startsWith('2 ')) i++
  }
  return count
}
async function uncommitted(dir: string): Promise<number> {
  const out = (await execFileAsync('git', ['--no-optional-locks', '-C', dir, 'status', '--porcelain=v2', '-z', '--untracked-files=all'], { timeout: GIT_TIMEOUT_MS })).stdout
  return countStatusEntries(out)
}

// The commit a member's branch would start from; refuses a checkout with anything uncommitted,
// untracked files included, which the branch would not carry. Ignored files are not counted.
export async function committedHead(source: string): Promise<string> {
  let head: string
  try {
    head = await git(source, ['rev-parse', '--verify', 'HEAD'])
  } catch {
    throw new Rejection('delegation-dirty', `${source} 还没有提交，先提交再派 worktree 委派`)
  }
  let changes: number
  try {
    changes = await uncommitted(source)
  } catch (error) {
    throw new Rejection('delegation-dirty', `读不到 ${source} 的 Git 状态：${error instanceof Error ? error.message : String(error)}`)
  }
  if (changes > 0) throw new Rejection('delegation-dirty', `${source} 有 ${changes} 个未提交的改动（含未跟踪文件），先提交再派 worktree 委派，或改用 shared`)
  return head
}

export async function isGitCheckout(dir: string): Promise<boolean> {
  return (await gitTopLevel(dir)) !== null
}

export type DelegationLayout = { source: string; topLevel: string; dir: string; branch: string; base: string; created: boolean }

// Lays the member's worktree out under the worktrees root, on its own branch from the source's
// HEAD, and reads the base before anything runs in it. The same conversation id finds what an
// earlier go laid out, so a start tried again after a restart makes nothing twice.
export async function layOutDelegationWorktree(conversationId: string, source: string, worktreesRoot: string): Promise<DelegationLayout> {
  const topLevel = await gitTopLevel(source)
  if (!topLevel) throw new Rejection('worktree-not-git', `not a git repo: ${source}`)
  const head = await committedHead(source)
  const [made] = await prepareConversationWorktrees(conversationId, [source], worktreesRoot)
  if (!made) throw new Rejection('worktree-failed', 'no worktree was laid out')
  const dir = await realpath(made.dir)
  // A worktree found rather than made (a start tried again) started from where its branch and
  // the source last met, not from where the source is now.
  const base = made.created ? head : await git(dir, ['merge-base', 'HEAD', head]).catch(() => head)
  return { source, topLevel, dir, branch: `antumi/${shortTaskId(conversationId)}`, base, created: made.created }
}

// What the member left: read from git rather than taken from its report. A field git could not
// give is null, with the first failure in error; a worktree that is gone reads as all null.
export async function readWorktreeOutcome(dir: string, base: string): Promise<AgentCallWorktreeOutcome> {
  const outcome: AgentCallWorktreeOutcome = { branch: null, head: null, commits: null, changes: null, error: null }
  const attempt = async (read: () => Promise<void>) => {
    try { await read() } catch (error) {
      outcome.error ??= error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error)
    }
  }
  await attempt(async () => { outcome.branch = await git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']) })
  await attempt(async () => { outcome.head = await git(dir, ['rev-parse', '--verify', 'HEAD']) })
  await attempt(async () => { outcome.commits = Number(await git(dir, ['rev-list', '--count', `${base}..HEAD`])) })
  await attempt(async () => { outcome.changes = await uncommitted(dir) })
  return outcome
}

// The outcome as the caller is told of it, after the member's own result.
export function describeWorktreeOutcome(branch: string, outcome: AgentCallWorktreeOutcome): string {
  const parts = [`分支 \`${branch}\``]
  const nothing = outcome.commits === 0 && outcome.changes === 0
  if (nothing) parts.push('没有新的提交，也没有未提交的文件')
  else {
    if (outcome.commits !== null) parts.push(`${outcome.commits} 个提交`)
    if (outcome.changes !== null) parts.push(`${outcome.changes} 个未提交文件`)
  }
  const notes: string[] = []
  if (outcome.changes) notes.push(`有 ${outcome.changes} 个未提交文件留在 worktree 里，合并前不要清理它`)
  if (outcome.branch !== null && outcome.branch !== branch) notes.push(`成员当前在分支 \`${outcome.branch}\`，不是 \`${branch}\``)
  if (outcome.error) notes.push(`读取 worktree 状态时出错：${outcome.error}`)
  return `（worktree 委派：${parts.join('，')}。${notes.length ? `${notes.join('；')}。` : ''}${nothing ? '没有要合并的。' : '合并后请重新运行检查。'}）`
}

export const worktreeMemberNote = (layout: Pick<DelegationLayout, 'dir' | 'branch' | 'base'>, setupFailures: readonly string[]): string =>
  [`你在独立的 worktree 里工作：目录 \`${layout.dir}\`，分支 \`${layout.branch}\`，起点 ${layout.base.slice(0, 8)}。结束前把所有改动提交到这个分支（git add -A && git commit），不要 push、不要合并到别的分支、不要切换分支。结果里写明提交列表和还没提交的文件；主会话会合并你的分支并重新验证。`,
    ...(setupFailures.length ? [`项目的 setup 没有全部成功，先处理：\n${setupFailures.join('\n')}`] : [])].join('\n\n')

export const inWorktreesRoot = (dir: string, root: string): boolean => {
  const relative = path.relative(root, dir)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
