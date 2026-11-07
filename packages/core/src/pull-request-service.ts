import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitTarget, PullRequestBlocker, PullRequestCheck, PullRequestComment, PullRequestEligibility, PullRequestLink, PullRequestRepo, PullRequestReview, PullRequestStatus, Task, TaskRepo } from '@antumi/protocol'
import { gitOrNull } from './git-changes'
import type { GitService } from './git-service'
import { GitHubClient, GitHubError, pullRequestProblem, type GitHubPull } from './github-client'
import { githubRemote } from './github-remote'
import { readProjectConfig } from './project-config'
import { pullRequestContext, type PullRequestContext } from './pull-request-draft'
import type { PullRequestStore } from './pull-request-store'
import { Rejection } from './rejection'
import type { TaskService } from './task-service'

const execFileAsync = promisify(execFile)
// Asking the remote what branches it has can hang on a credential prompt or a dead network.
const REMOTE_TIMEOUT_MS = 20_000
// The host is asked about a pull request at most this often; a stuck refresh button should not
// spend the hourly quota.
const MIN_REFRESH_MS = 10_000
// A pull request a client has on screen is followed every half minute, less often as long as
// nothing changes; any other still open, every few minutes. A fetch that fails waits longer each
// time, so an outage or a spent quota is not hammered.
const WATCH_MIN_MS = 30_000
const WATCH_MAX_MS = 120_000
const SWEEP_MS = 5 * 60_000
const FAIL_MIN_MS = 60_000
const FAIL_MAX_MS = 30 * 60_000

type Dependencies = { now?: () => number; changed?: (taskId: string, links: PullRequestLink[]) => void }
type Watcher = { onClose(listener: () => void): () => void }
type Cadence = { interval: number; dueAt: number; failures: number }
type CreateFields = { taskId: string; repoPath: string; base: string; title: string; body: string; draft: boolean; from: string }

// What a pull request's status looks like straight from the pull request itself, before its
// checks, reviews and comments are fetched.
function statusOf(pull: GitHubPull, parts: { checks: PullRequestCheck[]; reviews: PullRequestReview[]; comments: PullRequestComment[] }): PullRequestStatus {
  return { state: pull.state, draft: pull.draft, title: pull.title, headSha: pull.headSha, base: pull.base, mergeable: pull.mergeable, ...parts, mergedAt: pull.mergedAt, updatedAt: pull.updatedAt }
}

const EMPTY_PARTS = { checks: [], reviews: [], comments: [] }

// The base a task's branch would go into, as the host names it: the branch it started from, with
// the remote's name taken off. A start at a commit or at HEAD names no branch.
export function baseOfStart(start: TaskRepo['start'], remote = 'origin'): string | null {
  const ref = start?.ref
  if (!ref || ref === 'HEAD') return null
  if (ref.startsWith(`${remote}/`)) return ref.slice(remote.length + 1)
  return /^[0-9a-f]{7,40}$/.test(ref) ? null : ref
}

async function remoteHasBranch(dir: string, remote: string, branch: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'ls-remote', '--heads', '--', remote, `refs/heads/${branch}`], {
      timeout: REMOTE_TIMEOUT_MS, maxBuffer: 64 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

// Pull requests for tasks' branches on github.com: whether one can be opened, opening it after
// pushing, finding one opened elsewhere (by the agent with gh, or by hand), and keeping what the
// host says about it. Clients only ever see the links; the credential and the host stay here.
export class PullRequestService {
  private readonly now: () => number
  private readonly changed: NonNullable<Dependencies['changed']>
  private readonly refreshing = new Map<string, Promise<PullRequestLink>>()
  private readonly watchers = new Map<string, Set<Watcher>>()
  private readonly cadence = new Map<string, Cadence>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private started = false

  constructor(
    private readonly tasks: Pick<TaskService, 'get'>,
    private readonly git: Pick<GitService, 'status' | 'execute'>,
    private readonly store: PullRequestStore,
    private readonly client: GitHubClient,
    dependencies: Dependencies = {}
  ) {
    this.now = dependencies.now ?? Date.now
    this.changed = dependencies.changed ?? (() => {})
  }

  // Follows the pull requests still open from now on.
  start(): void {
    this.started = true
    this.schedule()
  }

  stop(): void {
    this.started = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  // A client has the task's pull requests on screen, or no longer; one that goes away takes its
  // interest with it.
  watch(taskId: string, open: boolean, watcher: Watcher): void {
    const task = this.tasks.get(taskId)
    const watching = this.watchers.get(task.id) ?? new Set<Watcher>()
    if (open) {
      if (!watching.has(watcher)) {
        watching.add(watcher)
        this.watchers.set(task.id, watching)
        watcher.onClose(() => this.watch(task.id, false, watcher))
      }
      // Fresh at once, and often from here on.
      for (const link of this.store.list(task.id)) this.cadence.set(this.keyOf(link), { interval: WATCH_MIN_MS, dueAt: this.now(), failures: 0 })
    } else {
      watching.delete(watcher)
      if (watching.size === 0) this.watchers.delete(task.id)
    }
    this.schedule()
  }

  list(taskId: string): PullRequestLink[] {
    return this.store.list(this.tasks.get(taskId).id)
  }

  listAll(): PullRequestLink[] {
    return this.store.all()
  }

  // Whether each repo the task writes to can have a pull request opened, and the one it has.
  async check(taskId: string, repoPath?: string): Promise<PullRequestEligibility[]> {
    const task = this.tasks.get(taskId)
    return Promise.all(this.writableRepos(task, repoPath).map((repo) => this.checkRepo(task, repo)))
  }

  async create(fields: CreateFields): Promise<PullRequestLink> {
    const task = this.tasks.get(fields.taskId)
    const repo = this.writableRepos(task, fields.repoPath)[0]
    if (!repo) throw new Rejection('repo-not-found')
    const eligibility = await this.checkRepo(task, repo, fields.base)
    if (eligibility.blocker === 'existing-pr' && eligibility.existing) return eligibility.existing
    if (eligibility.blocker) throw new Rejection(`pull-request-${eligibility.blocker}`)
    if (!eligibility.repo || !eligibility.headBranch || !eligibility.base) throw new Rejection('pull-request-not-github')
    if (eligibility.headBranch !== fields.from) throw new Rejection('git-branch-changed', `当前分支已经是 ${eligibility.headBranch}，不是对话框里的 ${fields.from}。请刷新后再试。`)
    const target: GitTarget = { kind: 'task', id: task.id, project: repo.path }
    if (eligibility.needsPush) await this.git.execute(target, { kind: 'push', from: fields.from })
    let pull: GitHubPull
    try {
      pull = await this.client.createPull(eligibility.repo, { title: fields.title, body: fields.body, head: eligibility.headBranch, base: eligibility.base, draft: fields.draft })
    } catch (error) {
      // Opened meanwhile, by the agent or by hand: that one is the task's.
      const found = error instanceof GitHubError && /already exists/i.test(error.message) ? await this.lookup(task.id, repo.path, eligibility.repo, eligibility.headBranch) : null
      if (found) return found
      throw this.rejection(error)
    }
    // A closed pull request the branch had before is left behind, never to be picked up again.
    if (this.store.get(task.id, repo.path)) this.store.unlink(task.id, repo.path)
    return this.keep({ taskId: task.id, repoPath: repo.path, repo: eligibility.repo, number: pull.number, url: pull.url, headBranch: pull.headRef, base: pull.base, status: statusOf(pull, EMPTY_PARTS), problem: null, fetchedAt: this.now(), refreshing: false })
  }

  // Asks the host about the task's pull requests again. One asked about a moment ago is given as
  // is unless forced; a fetch that fails keeps the status it had and says why.
  async refresh(taskId: string, repoPath?: string, force = false): Promise<PullRequestLink[]> {
    const task = this.tasks.get(taskId)
    const links = this.store.list(task.id).filter((link) => !repoPath || link.repoPath === repoPath)
    return Promise.all(links.map((link) => this.refreshLink(link, force)))
  }

  // What a title and description for the repo's pull request are written from.
  async draftContext(taskId: string, repoPath: string, base: string): Promise<PullRequestContext> {
    const task = this.tasks.get(taskId)
    const repo = this.writableRepos(task, repoPath)[0]
    if (!repo?.worktreePath) throw new Rejection('git-no-worktree', '任务 worktree 不存在，请先开始执行任务。')
    const host = await githubRemote(repo.worktreePath)
    if (!host) throw new Rejection('pull-request-not-github')
    const branch = (await this.git.status({ kind: 'task', id: task.id, project: repo.path })).branch
    if (!branch) throw new Rejection('pull-request-detached-head')
    const related = this.store.list(task.id).filter((link) => link.repoPath !== repo.path && link.status?.state !== 'closed')
    return pullRequestContext(repo.worktreePath, task, repo, branch, base, host, related)
  }

  unlink(taskId: string, repoPath: string): void {
    const task = this.tasks.get(taskId)
    this.store.unlink(task.id, repoPath)
    this.cadence.delete(`${task.id}\0${repoPath}`)
    this.changed(task.id, this.store.list(task.id))
    this.schedule()
  }

  private keyOf(link: Pick<PullRequestLink, 'taskId' | 'repoPath'>): string {
    return `${link.taskId}\0${link.repoPath}`
  }

  // Sets the timer for the next pull request due, if any is still open; none due means none open.
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.started) return
    const open = this.store.open()
    const keys = new Set(open.map((link) => this.keyOf(link)))
    for (const key of this.cadence.keys()) if (!keys.has(key)) this.cadence.delete(key)
    if (open.length === 0) return
    const now = this.now()
    let dueAt = Infinity
    for (const link of open) {
      const cadence = this.cadence.get(this.keyOf(link)) ?? this.firstCadence(link)
      this.cadence.set(this.keyOf(link), cadence)
      dueAt = Math.min(dueAt, cadence.dueAt)
    }
    this.timer = setTimeout(() => void this.tick(), Math.max(0, dueAt - now))
    this.timer.unref()
  }

  // A link first followed is due by when it was last fetched, so a restart does not fetch all at once.
  private firstCadence(link: PullRequestLink): Cadence {
    const interval = this.watchers.has(link.taskId) ? WATCH_MIN_MS : SWEEP_MS
    return { interval, dueAt: (link.fetchedAt ?? 0) + interval, failures: 0 }
  }

  private async tick(): Promise<void> {
    this.timer = null
    const now = this.now()
    const due = this.store.open().filter((link) => (this.cadence.get(this.keyOf(link))?.dueAt ?? 0) <= now)
    await Promise.all(due.map(async (link) => {
      const before = JSON.stringify(link.status)
      const after = await this.refreshLink(link, true)
      const watched = this.watchers.has(link.taskId)
      const cadence = this.cadence.get(this.keyOf(link)) ?? this.firstCadence(link)
      let next: Cadence
      if (after.problem) {
        next = { interval: Math.min(Math.max(FAIL_MIN_MS, cadence.interval * 2), FAIL_MAX_MS), dueAt: 0, failures: cadence.failures + 1 }
      } else if (!watched) {
        next = { interval: SWEEP_MS, dueAt: 0, failures: 0 }
      } else {
        next = { interval: JSON.stringify(after.status) === before ? Math.min(cadence.interval * 2, WATCH_MAX_MS) : WATCH_MIN_MS, dueAt: 0, failures: 0 }
      }
      next.dueAt = this.now() + next.interval
      this.cadence.set(this.keyOf(link), next)
    }))
    this.schedule()
  }

  private writableRepos(task: Task, repoPath?: string): TaskRepo[] {
    const repos = task.repos.filter((repo) => !repo.reference && (!repoPath || repo.path === repoPath))
    if (repoPath && repos.length === 0) throw new Rejection('repo-not-found')
    return repos
  }

  private async checkRepo(task: Task, repo: TaskRepo, baseOverride?: string): Promise<PullRequestEligibility> {
    const result: PullRequestEligibility = { repoPath: repo.path, repo: null, headBranch: null, base: null, baseFallback: null, needsPush: false, blocker: null, existing: this.store.get(task.id, repo.path) }
    const blocked = (blocker: PullRequestBlocker): PullRequestEligibility => ({ ...result, blocker })
    if (!repo.worktreePath) throw new Rejection('git-no-worktree', '任务 worktree 不存在，请先开始执行任务。')
    const dir = repo.worktreePath
    result.repo = await githubRemote(dir)
    if (!result.repo) return blocked('not-github')
    const status = await this.git.status({ kind: 'task', id: task.id, project: repo.path })
    result.headBranch = status.branch
    if (!result.headBranch) return blocked('detached-head')
    result.needsPush = !status.upstream || status.ahead > 0
    if (!(await this.client.available())) return blocked('auth')
    let defaultBranch: string
    try {
      defaultBranch = await this.client.defaultBranch(result.repo)
    } catch (error) {
      if (error instanceof GitHubError && error.code === 'auth-failed') return blocked('auth')
      throw this.rejection(error)
    }
    if (result.headBranch === defaultBranch) return blocked('head-is-default')
    const existing = result.existing && result.existing.status?.state !== 'closed' ? result.existing : await this.lookup(task.id, repo.path, result.repo, result.headBranch).catch((error: unknown) => { throw this.rejection(error) })
    result.existing = existing
    if (existing) return blocked('existing-pr')
    const config = await readProjectConfig(repo.path).catch(() => null)
    if (config?.config.pullRequest?.draft !== undefined) result.draftDefault = config.config.pullRequest.draft
    result.base = baseOverride ?? config?.config.pullRequest?.base ?? baseOfStart(repo.start) ?? defaultBranch
    if (status.changes > 0) return blocked('dirty')
    const since = repo.start?.commit ? await gitOrNull(dir, ['rev-list', '--count', `${repo.start.commit}..HEAD`]) : null
    if (since !== null && Number(since) === 0) return blocked('no-commits')
    if (result.base !== defaultBranch && !(await remoteHasBranch(dir, 'origin', result.base))) {
      result.baseFallback = defaultBranch
      return blocked('base-missing')
    }
    return result
  }

  // The pull request the host has for the branch, open before merged, never closed nor one the
  // user cut loose; kept as the task's once found.
  private async lookup(taskId: string, repoPath: string, repo: PullRequestRepo, branch: string): Promise<PullRequestLink | null> {
    const suppressed = new Set(this.store.suppressed(taskId, repoPath))
    const pulls = (await this.client.pullsByHead(repo, branch)).filter((pull) => !suppressed.has(pull.number) && pull.state !== 'closed')
    const pull = pulls.find((entry) => entry.state === 'open') ?? pulls[0]
    if (!pull) return null
    return this.keep({ taskId, repoPath, repo, number: pull.number, url: pull.url, headBranch: pull.headRef, base: pull.base, status: statusOf(pull, EMPTY_PARTS), problem: null, fetchedAt: null, refreshing: false })
  }

  private refreshLink(link: PullRequestLink, force: boolean): Promise<PullRequestLink> {
    const key = `${link.taskId}\0${link.repoPath}`
    const running = this.refreshing.get(key)
    if (running) return running
    if (!force && link.fetchedAt !== null && this.now() - link.fetchedAt < MIN_REFRESH_MS) return Promise.resolve(link)
    const work = this.fetchLink(link).finally(() => this.refreshing.delete(key))
    this.refreshing.set(key, work)
    return work
  }

  private async fetchLink(link: PullRequestLink): Promise<PullRequestLink> {
    this.keep({ ...link, refreshing: true })
    try {
      const pull = await this.client.pull(link.repo, link.number)
      const [checks, reviews, comments] = await Promise.all([
        this.client.checks(link.repo, pull.headSha), this.client.reviews(link.repo, link.number), this.client.comments(link.repo, link.number)
      ])
      return this.keep({ ...link, headBranch: pull.headRef, base: pull.base, url: pull.url, status: statusOf(pull, { checks, reviews, comments }), problem: null, fetchedAt: this.now(), refreshing: false })
    } catch (error) {
      return this.keep({ ...link, problem: pullRequestProblem(error), refreshing: false })
    }
  }

  private keep(link: PullRequestLink): PullRequestLink {
    const known = this.cadence.has(this.keyOf(link))
    this.store.put(link)
    this.changed(link.taskId, this.store.list(link.taskId))
    // One just found or opened is followed from now; one merged or closed drops out on the next round.
    if (!known && !link.refreshing) this.schedule()
    return link
  }

  private rejection(error: unknown): Error {
    if (error instanceof Rejection) return error
    const { code, message } = pullRequestProblem(error)
    return new Rejection(`pull-request-${code}`, message)
  }
}
