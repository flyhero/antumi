import { mkdir, readdir, rmdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isFinished, shortTaskId, type RepoStartOptions, type Task, type TaskRepo, type TaskStart } from '@antumi/protocol'
import { Rejection } from './rejection'
import { repoStartOptions, resolveStart } from './task-start'
import { execFileAsync } from './hidden-exec'


export type WorkspaceEntry = {
  // Folder name under the task directory; unique within the task.
  name: string
  source: string
  // Where the agent works on this repo: its worktree, or the folder itself.
  dir: string
  branch: string | null
  // The dependency branch a new worktree was started from, if any.
  base: string | null
  startRef: string | null
  start: TaskStart | null
  // The repo's top level, for a git repo; and whether this start laid its worktree out, which is
  // when a project's setup runs.
  topLevel: string | null
  created: boolean
  // A project the agent only reads (TaskRepo.reference), where it is.
  reference: boolean
}

// extraDirs: the other folders the agent may edit; referenceDirs: those it may only read.
export type Workspace = { cwd: string; extraDirs: string[]; referenceDirs: string[]; multi: boolean; entries: WorkspaceEntry[]; repos: TaskRepo[] }

export function normalizeRepoPath(input: string): string {
  const expanded = input === '~' || /^~[\\/]/.test(input) ? path.join(os.homedir(), input.slice(1)) : input
  if (!path.isAbsolute(expanded)) {
    throw new Rejection('repo-path-not-absolute', `repo path must be absolute: ${input}`)
  }
  return path.normalize(expanded)
}

// Keeps what earlier runs recorded for repos that stay on the list.
export function withKnownWorktrees(current: readonly TaskRepo[], paths: readonly string[]): TaskRepo[] {
  const known = new Map(current.map((repo) => [repo.path, repo]))
  // The primary is where the agent works, so it is never only read.
  return [...new Set(paths)].map((repoPath, index) => {
    const repo = known.get(repoPath) ?? { path: repoPath, worktreePath: null, branch: null, startRef: null, start: null }
    return index === 0 && repo.reference ? { ...repo, reference: false } : repo
  })
}

// Keys are checked on import, but a branch name gets only what git and every shell take plainly.
export function branchKey(key: string): string {
  return key
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function branchSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory()
  } catch {
    return false
  }
}

export async function gitTopLevel(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--show-toplevel'])
    return path.normalize(stdout.trim())
  } catch {
    return null
  }
}

export type ProjectStatus = {
  branch: string | null
  detached: boolean
  upstream: string | null
  ahead: number
  behind: number
  changes: number
}

const NOT_A_REPO: ProjectStatus = { branch: null, detached: false, upstream: null, ahead: 0, behind: 0, changes: 0 }

// One status call gives the branch, its upstream and the uncommitted count. --no-optional-locks
// keeps it off index.lock, which the agent's own git commands in the same folder would trip on.
export async function projectHead(dir: string): Promise<ProjectStatus> {
  let stdout: string
  try {
    ({ stdout } = await execFileAsync('git', ['--no-optional-locks', '-C', dir, 'status', '--porcelain=v2', '--branch']))
  } catch {
    return NOT_A_REPO
  }
  const lines = stdout.split('\n').filter(Boolean)
  const header = (key: string) => lines.find((line) => line.startsWith(`# branch.${key} `))?.slice(`# branch.${key} `.length) ?? null
  const head = header('head')
  const detached = head === '(detached)'
  const counts = header('ab')?.match(/^\+(\d+) -(\d+)$/)
  return {
    branch: detached ? header('oid')?.slice(0, 7) ?? null : head,
    detached,
    upstream: header('upstream'),
    ahead: Number(counts?.[1] ?? 0),
    behind: Number(counts?.[2] ?? 0),
    changes: lines.filter((line) => !line.startsWith('#')).length
  }
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    return true
  } catch {
    return false
  }
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base
  for (let n = 2; taken.has(name); n++) {
    name = `${base}-${n}`
  }
  taken.add(name)
  return name
}

// Branches that dependencies left in each repo, keyed by the repo's top level.
async function dependencyBranches(dependencies: readonly Pick<Task, 'repos'>[]): Promise<Map<string, string[]>> {
  const branches = new Map<string, string[]>()
  for (const repo of dependencies.flatMap((dependency) => dependency.repos)) {
    const topLevel = repo.branch ? await gitTopLevel(repo.path) : null
    if (topLevel && repo.branch && (await branchExists(topLevel, repo.branch))) {
      branches.set(topLevel, [...new Set([...(branches.get(topLevel) ?? []), repo.branch])])
    }
  }
  return branches
}

async function worktreeGit(dir: string, args: readonly string[]): Promise<void> {
  try {
    await execFileAsync('git', ['-C', dir, ...args])
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : ''
    throw new Rejection('worktree-failed', stderr || `git ${args.join(' ')} failed`)
  }
}

// `args` add the worktree at `worktreePath`.
async function addWorktree(topLevel: string, worktreePath: string, args: readonly string[]): Promise<void> {
  await mkdir(path.dirname(worktreePath), { recursive: true })
  // A folder deleted by hand leaves git's record of it, which refuses the path. Only that record
  // goes, not every lost one as prune would, and without force, so a locked worktree stays.
  try {
    await execFileAsync('git', ['-C', topLevel, 'worktree', 'remove', worktreePath])
  } catch {
    // Never recorded, or locked: adding says why if it still cannot.
  }
  await worktreeGit(topLevel, ['worktree', 'add', ...args])
}

// Each git repo gets its own worktree on the task's branch, under one task directory.
// The agent works in the primary worktree and gets the others as additional directories. A
// reference project is read where it is, git repo or not. Any other plain folder runs in place, so
// it can only be a task's sole repo.
const isReference = (repo: TaskRepo, index: number) => index > 0 && Boolean(repo.reference)

export async function prepareWorkspace(
  task: Pick<Task, 'id' | 'title' | 'repos' | 'source'> & Partial<Pick<Task, 'slug'>>,
  dependencies: readonly Pick<Task, 'repos'>[],
  worktreesRoot: string,
  at = Date.now()
): Promise<Workspace> {
  const shortId = shortTaskId(task.id)
  // An issue key in the branch name is how Jira links the branch to the issue.
  const slug = task.slug ?? branchSlug(task.title)
  const key = task.source ? branchKey(task.source.key) : ''
  const branch = `antumi/${key ? `${key}-` : ''}${shortId}${slug ? `-${slug}` : ''}`
  const taskDir = path.join(worktreesRoot, shortId)
  const multi = task.repos.length > 1

  const resolved: { repo: TaskRepo; topLevel: string | null; reference: boolean }[] = []
  for (const [index, repo] of task.repos.entries()) {
    if (!(await isDirectory(repo.path))) {
      throw new Rejection('repo-not-found', `repo path does not exist: ${repo.path}`)
    }
    const topLevel = await gitTopLevel(repo.path)
    const reference = isReference(repo, index)
    if (multi && !topLevel && !reference) {
      throw new Rejection('repo-not-git', `every repo of a multi-repo task must be a git repo: ${repo.path}`)
    }
    resolved.push({ repo, topLevel, reference })
  }
  // Reading a folder of a repo the task also edits is no clash.
  const topLevels = resolved.flatMap(({ topLevel, reference }) => (topLevel && !reference ? [topLevel] : []))
  if (new Set(topLevels).size !== topLevels.length) {
    throw new Rejection('repo-duplicate', 'two entries point into the same git repo')
  }

  const stackable = await dependencyBranches(dependencies)
  // Reordering must not let a newly added repo claim a retained worktree's name.
  const taken = new Set(task.repos.flatMap((repo) => repo.worktreePath ? [path.basename(repo.worktreePath)] : []))
  const entries: WorkspaceEntry[] = []
  for (const { repo, topLevel, reference } of resolved) {
    const name = repo.worktreePath ? path.basename(repo.worktreePath) : uniqueName(path.basename(topLevel ?? repo.path), taken)
    const { startRef } = repo
    if (reference) {
      entries.push({ name, source: repo.path, dir: repo.path, branch: null, base: null, startRef: null, start: null, topLevel, created: false, reference })
    } else if (repo.worktreePath && (await isDirectory(repo.worktreePath))) {
      entries.push({ name, source: repo.path, dir: repo.worktreePath, branch: repo.branch, base: null, startRef, start: repo.start, topLevel, created: false, reference })
    } else if (!topLevel) {
      entries.push({ name, source: repo.path, dir: repo.path, branch: null, base: null, startRef, start: null, topLevel, created: false, reference })
    } else {
      // A start the task picked wins over a dependency's branch.
      const base = startRef === null ? onlyBranch(stackable, topLevel) : null
      const worktreePath = repo.worktreePath ?? path.join(taskDir, name)
      const repoBranch = repo.branch ?? branch
      let start = repo.start
      const created = !(await isDirectory(worktreePath))
      // A leftover from a run that failed part-way is picked up as is, and a branch left by an
      // earlier, since-removed worktree is checked out again rather than recreated.
      if (created) {
        if (await branchExists(topLevel, repoBranch)) {
          await addWorktree(topLevel, worktreePath, [worktreePath, repoBranch])
        } else {
          const resolved = await resolveStart(topLevel, startRef, base, at)
          // --no-track: the branch is the task's own, not a copy of the one it started from.
          await addWorktree(topLevel, worktreePath, ['--no-track', '-b', repoBranch, worktreePath, resolved.commit])
          start = resolved.start
        }
      }
      entries.push({ name, source: repo.path, dir: worktreePath, branch: repoBranch, base, startRef, start, topLevel, created, reference })
    }
  }

  if (multi) {
    await mkdir(taskDir, { recursive: true })
  }
  const first = entries[0]
  if (!first) {
    throw new Rejection('missing-repo')
  }
  const others = entries.slice(1)
  return {
    cwd: first.dir,
    extraDirs: others.filter((entry) => !entry.reference).map((entry) => entry.dir),
    referenceDirs: others.filter((entry) => entry.reference).map((entry) => entry.dir),
    multi,
    entries,
    repos: entries.map((entry) => ({
      path: entry.source,
      worktreePath: entry.dir === entry.source ? null : entry.dir,
      branch: entry.branch,
      startRef: entry.startRef,
      start: entry.start,
      ...(entry.reference ? { reference: true } : {})
    }))
  }
}

// Lays out again a worktree cleaned while its conversation was archived, where it stood: on its
// branch while git still has that branch free, else detached at the commit it had out. False when
// neither can be, as when the repo or the commit is gone.
export async function restoreWorktree(repo: string, dir: string, branch: string | null, head: string): Promise<boolean> {
  if (branch && await branchExists(repo, branch)) {
    const onBranch = await addWorktree(repo, dir, ['--quiet', dir, branch]).then(() => true, () => false)
    if (onBranch) return true
  }
  return addWorktree(repo, dir, ['--quiet', '--detach', dir, head]).then(() => true, () => false)
}

// A conversation started in worktrees: each project's repo gets one under the conversation's
// directory, on a branch of its own from what the project has checked out. Uncommitted changes
// stay behind in the project. A start tried again with the same id finds what it laid out.
// primaryStart: the commit the first project's branch starts from, where the user picked one;
// every other one starts from its project's HEAD.
export type ConversationWorktree = { dir: string; topLevel: string; created: boolean }

export async function prepareConversationWorktrees(conversationId: string, projects: readonly string[], worktreesRoot: string, primaryStart?: string): Promise<ConversationWorktree[]> {
  const shortId = shortTaskId(conversationId)
  const branch = `antumi/${shortId}`
  const topLevels: string[] = []
  for (const project of projects) {
    const topLevel = await gitTopLevel(project)
    if (!topLevel) throw new Rejection('worktree-not-git', `not a git repo: ${project}`)
    if (topLevels.includes(topLevel)) throw new Rejection('repo-duplicate', 'two entries point into the same git repo')
    topLevels.push(topLevel)
  }
  const taken = new Set<string>()
  const made: { topLevel: string; dir: string; branched: boolean; created: boolean }[] = []
  try {
    for (const topLevel of topLevels) {
      const dir = path.join(worktreesRoot, shortId, uniqueName(path.basename(topLevel), taken))
      if (await isDirectory(dir)) {
        made.push({ topLevel, dir, branched: false, created: false })
        continue
      }
      const branched = !(await branchExists(topLevel, branch))
      // --no-track: the branch is the conversation's own, not a copy of the one it started from.
      const base = topLevel === topLevels[0] && primaryStart ? primaryStart : 'HEAD'
      await addWorktree(topLevel, dir, branched ? ['--quiet', '--no-track', '-b', branch, dir, base] : ['--quiet', dir, branch])
      made.push({ topLevel, dir, branched, created: true })
    }
  } catch (error) {
    // What this start laid out holds nothing yet, and goes without force; a leftover it picked up stays.
    for (const { topLevel, dir, branched } of made) {
      if (!branched) continue
      await execFileAsync('git', ['-C', topLevel, 'worktree', 'remove', dir]).catch(() => {})
      await execFileAsync('git', ['-C', topLevel, 'branch', '-d', branch]).catch(() => {})
    }
    await rmdir(path.join(worktreesRoot, shortId)).catch(() => {})
    throw error
  }
  return made.map(({ dir, topLevel, created }) => ({ dir, topLevel, created }))
}

async function worktreeOutput(dir: string, args: readonly string[]): Promise<string> {
  try {
    return (await execFileAsync('git', ['-C', dir, ...args])).stdout.trim()
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : ''
    throw new Rejection('worktree-failed', stderr || `git ${args.join(' ')} failed`)
  }
}

// What a redo keeps of an attempt in one repo: everything it left, uncommitted work committed on
// top, on a branch of its own, so the task's branch can start again with nothing lost. Hooks are
// skipped and a missing identity filled in, as this commit is Antumi's keeping, not the user's.
async function keepAttemptWork(topLevel: string, repo: TaskRepo & { branch: string }, attempt: number): Promise<string | null> {
  const dir = repo.worktreePath && (await isDirectory(repo.worktreePath)) ? repo.worktreePath : null
  if (dir && (await worktreeOutput(dir, ['status', '--porcelain']))) {
    const named = (await gitConfig(dir, 'user.name')) && (await gitConfig(dir, 'user.email'))
    const identity = named ? [] : ['-c', 'user.name=Antumi', '-c', 'user.email=antumi@localhost']
    await worktreeGit(dir, ['add', '-A'])
    await worktreeGit(dir, [...identity, 'commit', '--no-verify', '-q', '-m', `Antumi：第 ${attempt} 次尝试里没提交的改动`])
  }
  if (!(await branchExists(topLevel, repo.branch))) return null
  const head = await worktreeOutput(topLevel, ['rev-parse', `refs/heads/${repo.branch}`])
  if (repo.start && head === repo.start.commit) return null
  let kept = `${repo.branch}-try${attempt}`
  for (let n = 2; await branchExists(topLevel, kept); n++) kept = `${repo.branch}-try${attempt}-${n}`
  // Renamed rather than copied: the worktree, if any, follows it, and the name is free again.
  await worktreeGit(topLevel, ['branch', '-m', repo.branch, kept])
  return kept
}

async function gitConfig(dir: string, key: string): Promise<string | null> {
  try {
    return (await execFileAsync('git', ['-C', dir, 'config', key])).stdout.trim() || null
  } catch {
    return null
  }
}

// Starts each of a task's branches over for a redo, from what it would start from now. A worktree
// stays where it is, so what git ignores there (installed dependencies, local settings) is kept;
// one the user removed is laid out again at the next start. Returns the repos as they now stand
// and the branches the attempt's work was kept on.
export async function restartBranches(
  task: Pick<Task, 'repos'>,
  dependencies: readonly Pick<Task, 'repos'>[],
  attempt: number,
  at = Date.now()
): Promise<{ repos: TaskRepo[]; kept: { path: string; branch: string }[] }> {
  const stackable = await dependencyBranches(dependencies)
  const repos: TaskRepo[] = []
  const kept: { path: string; branch: string }[] = []
  for (const repo of task.repos) {
    const topLevel = repo.branch ? await gitTopLevel(repo.path) : null
    if (!topLevel || !repo.branch) {
      repos.push(repo)
      continue
    }
    const branch = await keepAttemptWork(topLevel, { ...repo, branch: repo.branch }, attempt)
    if (branch) kept.push({ path: repo.path, branch })
    const dir = repo.worktreePath && (await isDirectory(repo.worktreePath)) ? repo.worktreePath : null
    if (!dir) {
      repos.push({ ...repo, start: null })
      continue
    }
    const base = repo.startRef === null ? onlyBranch(stackable, topLevel) : null
    const resolved = await resolveStart(topLevel, repo.startRef, base, at)
    await worktreeGit(dir, ['checkout', '-q', '--no-track', '-B', repo.branch, resolved.commit])
    repos.push({ ...repo, start: resolved.start })
  }
  return { repos, kept }
}

// Stack on a dependency's branch only when exactly one dependency left one in the repo; with
// several there is no single right base.
function onlyBranch(stackable: ReadonlyMap<string, string[]>, topLevel: string): string | null {
  const candidates = stackable.get(topLevel) ?? []
  return candidates.length === 1 ? (candidates[0] ?? null) : null
}

export async function startOptions(task: Pick<Task, 'repos'>, dependencies: readonly Pick<Task, 'repos'>[]): Promise<RepoStartOptions[]> {
  const stackable = await dependencyBranches(dependencies)
  return Promise.all(task.repos.map(async (repo) => {
    const topLevel = await gitTopLevel(repo.path)
    return repoStartOptions(repo.path, topLevel, topLevel ? onlyBranch(stackable, topLevel) : null)
  }))
}

export type RefineWorkspace = {
  cwd: string
  dirs: string[]
  // Dependency branches already contained in the code the agent reads.
  landed: ReadonlySet<string>
  // What each planning checkout holds, by its folder; a repo read where it is has none.
  starts: ReadonlyMap<string, TaskStart>
  // The reference projects among dirs, which execution reads where they are too.
  references: ReadonlySet<string>
}

// Planning checkouts: the code a task's branch would start from, checked out with no branch, apart
// from the task's worktrees, which only execution lays out.
function planningRoot(worktreesRoot: string, taskId: string): string {
  return path.join(worktreesRoot, shortTaskId(taskId), '.planning')
}

async function isAncestor(dir: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', dir, 'merge-base', '--is-ancestor', `refs/heads/${branch}`, 'HEAD'])
    return true
  } catch {
    return false
  }
}

// Planning only reads, and only tasks that never ran plan, so it makes no branch: each git repo is
// read at the commit the task's branch would start from, in a planning checkout, or where it is
// when that start is what the project has checked out. `refresh` moves an existing checkout to
// the start as it is now; a planning conversation picked up again keeps reading what it read.
export async function prepareRefineWorkspace(
  task: Pick<Task, 'id' | 'repos'>,
  dependencies: readonly Pick<Task, 'status' | 'repos'>[],
  worktreesRoot: string,
  { refresh = true, at = Date.now() }: { refresh?: boolean; at?: number } = {}
): Promise<RefineWorkspace> {
  const stackable = await dependencyBranches(dependencies)
  const root = planningRoot(worktreesRoot, task.id)
  const taken = new Set<string>()
  const dirs: string[] = []
  const starts = new Map<string, TaskStart>()
  const references = new Set<string>()
  for (const [index, repo] of task.repos.entries()) {
    if (!(await isDirectory(repo.path))) {
      throw new Rejection('repo-not-found', `repo path does not exist: ${repo.path}`)
    }
    if (isReference(repo, index)) {
      dirs.push(repo.path)
      references.add(repo.path)
      continue
    }
    const topLevel = await gitTopLevel(repo.path)
    if (!topLevel) {
      dirs.push(repo.path)
      continue
    }
    const checkout = path.join(root, uniqueName(path.basename(topLevel), taken))
    const exists = await isDirectory(checkout)
    if (exists && !refresh) {
      dirs.push(checkout)
      continue
    }
    const resolved = await resolveStart(topLevel, repo.startRef, repo.startRef === null ? onlyBranch(stackable, topLevel) : null, at)
    if (resolved.head) {
      dirs.push(repo.path)
      continue
    }
    if (exists) await worktreeGit(checkout, ['checkout', '--quiet', '--detach', resolved.commit])
    else await addWorktree(topLevel, checkout, ['--quiet', '--detach', checkout, resolved.commit])
    dirs.push(checkout)
    starts.set(checkout, resolved.start)
  }
  const first = dirs[0]
  if (!first) {
    throw new Rejection('missing-repo')
  }
  const landed = new Set<string>()
  const branches = dependencies
    .filter((dependency) => isFinished(dependency.status))
    .flatMap((dependency) => dependency.repos.flatMap((repo) => (repo.branch ? [repo.branch] : [])))
  for (const branch of new Set(branches)) {
    for (const dir of dirs) {
      if (await isAncestor(dir, branch)) {
        landed.add(branch)
        break
      }
    }
  }
  return { cwd: first, dirs, landed, starts, references }
}

// Once the task runs in its worktrees, its planning checkouts go. The agent only read there, but
// one holding changes after all stays (removing without force refuses it), as does one whose
// commit no ref contains, which only that checkout still holds.
export async function removePlanningCheckouts(taskId: string, worktreesRoot: string): Promise<void> {
  const root = planningRoot(worktreesRoot, taskId)
  const names = await readdir(root).catch(() => [])
  for (const name of names) {
    const checkout = path.join(root, name)
    const kept = await execFileAsync('git', ['-C', checkout, 'for-each-ref', '--contains', 'HEAD', '--count=1', '--format=%(refname)'])
      .then(({ stdout }) => stdout.trim() !== '', () => false)
    if (kept) await execFileAsync('git', ['-C', checkout, 'worktree', 'remove', checkout]).catch(() => {})
  }
  // Only empty folders go: a task directory keeps any worktree in it.
  for (const dir of [root, path.dirname(root)]) await rmdir(dir).catch(() => {})
}
