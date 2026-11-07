import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { PullRequestCheck, PullRequestComment, PullRequestFailure, PullRequestMergeMethod, PullRequestProblem, PullRequestRepo, PullRequestReview } from '@antumi/protocol'
import { planLaunch } from '@antumi/protocol/node'
import type { SourceService } from './source-service'

const execFileAsync = promisify(execFile)
const API = 'https://api.github.com'
const TIMEOUT_MS = 15_000
// A credential is looked up again this long on, or at once after it stops working.
const CREDENTIAL_MS = 5 * 60_000
// Below this many calls left in the hour, reads stop until the window resets, so that a poll
// never spends what the user's own gh and editor need; GitHub says when it resets.
const RATE_LIMIT_FLOOR = 50
const DEFAULT_BRANCH_MS = 60 * 60_000
const PAGE = 100

// What GitHub refused or failed, in terms every client can explain.
export class GitHubError extends Error {
  constructor(
    readonly code: PullRequestFailure,
    message: string
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

export function pullRequestProblem(error: unknown): PullRequestProblem {
  if (error instanceof GitHubError) return { code: error.code, message: error.message }
  return { code: 'request-failed', message: error instanceof Error ? error.message : String(error) }
}

// A pull request as the host has it, reduced to what core keeps. headOwner is null when the fork
// it came from is gone.
export type GitHubPull = {
  number: number
  url: string
  state: 'open' | 'merged' | 'closed'
  draft: boolean
  title: string
  headSha: string
  headRef: string
  headOwner: string | null
  base: string
  mergeable: 'mergeable' | 'conflicting' | 'unknown'
  mergedAt: number | null
  updatedAt: number
}

type Credential = { source: 'gh' | 'github-plugin'; instance: string | null; token: string }
type Dependencies = { ghToken?: (signal: AbortSignal) => Promise<string | null>; fetch?: typeof fetch; now?: () => number }
type Method = 'GET' | 'POST' | 'PUT'

// The official GitHub source plugin stores a token credential in this form.
const TokenCredential = z.object({ kind: z.literal('token'), payload: z.object({ token: z.string().min(1).max(16_384).regex(/^[^\s\x00-\x1f\x7f]+$/) }) })
const Viewer = z.object({ login: z.string().min(1).max(100) })
const Repository = z.object({ default_branch: z.string().min(1) })
const Pull = z.object({
  number: z.number().int().positive(),
  html_url: z.string(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean().optional(),
  title: z.string(),
  head: z.object({ sha: z.string(), ref: z.string(), repo: z.object({ owner: z.object({ login: z.string() }) }).nullable() }),
  base: z.object({ ref: z.string() }),
  mergeable: z.boolean().nullable().optional(),
  merged_at: z.string().nullable(),
  updated_at: z.string()
})
const CheckRuns = z.object({
  check_runs: z.array(z.object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    html_url: z.string().nullable(),
    completed_at: z.string().nullable()
  }))
})
const CombinedStatus = z.object({
  statuses: z.array(z.object({ id: z.number(), context: z.string(), state: z.string(), target_url: z.string().nullable(), updated_at: z.string() }))
})
const Review = z.object({ id: z.number(), user: z.object({ login: z.string() }).nullable(), state: z.string(), body: z.string().nullable(), submitted_at: z.string().nullable() })
const ReviewComment = z.object({ id: z.number(), user: z.object({ login: z.string() }).nullable(), path: z.string(), line: z.number().nullable().optional(), body: z.string(), html_url: z.string(), created_at: z.string() })
const IssueComment = z.object({ id: z.number(), user: z.object({ login: z.string() }).nullable(), body: z.string().nullable(), html_url: z.string(), created_at: z.string() })
const Failure = z.object({ message: z.string().optional() })

const at = (iso: string | null | undefined): number | null => {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? null : ms
}

export function pullOf(data: z.infer<typeof Pull>): GitHubPull {
  return {
    number: data.number,
    url: data.html_url,
    state: data.merged_at ? 'merged' : data.state,
    draft: data.draft ?? false,
    title: data.title,
    headSha: data.head.sha,
    headRef: data.head.ref,
    headOwner: data.head.repo?.owner.login ?? null,
    base: data.base.ref,
    mergeable: data.mergeable === true ? 'mergeable' : data.mergeable === false ? 'conflicting' : 'unknown',
    mergedAt: at(data.merged_at),
    updatedAt: at(data.updated_at) ?? 0
  }
}

function checkState(status: string, conclusion: string | null): PullRequestCheck['state'] {
  if (status !== 'completed') return status === 'queued' || status === 'pending' || status === 'waiting' || status === 'requested' ? 'queued' : 'running'
  switch (conclusion) {
    case 'success': return 'success'
    case 'skipped': return 'skipped'
    case 'neutral': return 'neutral'
    default: return 'failure'
  }
}

function statusState(state: string): PullRequestCheck['state'] {
  switch (state) {
    case 'success': return 'success'
    case 'pending': return 'running'
    default: return 'failure'
  }
}

async function ghToken(signal: AbortSignal): Promise<string | null> {
  try {
    const env = { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' }
    const launch = planLaunch('gh', ['auth', 'token', '--hostname', 'github.com'], process.cwd(), env)
    const { stdout } = await execFileAsync(launch.file, launch.args, {
      env: launch.env, encoding: 'utf8', windowsHide: true, timeout: 5_000, maxBuffer: 16 * 1024, signal
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

// GitHub's REST API with the credential this machine has: the GitHub CLI's, else the one the
// GitHub source plugin signed in with. Every request is pinned to api.github.com, follows no
// redirect, and gives up after TIMEOUT_MS; the token never leaves this class.
export class GitHubClient {
  private readonly readGhToken: NonNullable<Dependencies['ghToken']>
  private readonly fetch: typeof fetch
  private readonly now: () => number
  private credential: { value: Credential; account: string | null; at: number } | null = null
  private resolving: Promise<Credential | null> | null = null
  private limitedUntil = 0
  private readonly defaultBranches = new Map<string, { name: string; at: number }>()

  constructor(private readonly sources: Pick<SourceService, 'credentialsFor'>, dependencies: Dependencies = {}) {
    this.readGhToken = dependencies.ghToken ?? ghToken
    this.fetch = dependencies.fetch ?? fetch
    this.now = dependencies.now ?? Date.now
  }

  // Whether any credential is at hand, without asking GitHub; the `auth` blocker.
  async available(): Promise<boolean> {
    return (await this.resolve()) !== null
  }

  // The login the credential belongs to; null when it has not been checked yet or does not work.
  async account(): Promise<string | null> {
    const credential = await this.resolve()
    if (!credential) return null
    if (this.credential?.account) return this.credential.account
    const data = Viewer.safeParse(await this.json('GET', '/user'))
    const account = data.success ? data.data.login : null
    if (this.credential?.value === credential) this.credential.account = account
    return account
  }

  async defaultBranch(repo: PullRequestRepo): Promise<string> {
    const key = `${repo.owner}/${repo.name}`
    const cached = this.defaultBranches.get(key)
    if (cached && this.now() - cached.at < DEFAULT_BRANCH_MS) return cached.name
    const data = Repository.parse(await this.json('GET', `/repos/${key}`))
    this.defaultBranches.set(key, { name: data.default_branch, at: this.now() })
    return data.default_branch
  }

  async pull(repo: PullRequestRepo, number: number): Promise<GitHubPull> {
    return pullOf(Pull.parse(await this.json('GET', `/repos/${repo.owner}/${repo.name}/pulls/${number}`)))
  }

  // Every pull request whose head is the branch in this repo (not a fork's), open or not, newest first.
  async pullsByHead(repo: PullRequestRepo, branch: string): Promise<GitHubPull[]> {
    const query = new URLSearchParams({ head: `${repo.owner}:${branch}`, state: 'all', sort: 'updated', direction: 'desc', per_page: '10' })
    return z.array(Pull).parse(await this.json('GET', `/repos/${repo.owner}/${repo.name}/pulls?${query}`)).map(pullOf)
  }

  async createPull(repo: PullRequestRepo, fields: { title: string; body: string; head: string; base: string; draft: boolean }): Promise<GitHubPull> {
    return pullOf(Pull.parse(await this.json('POST', `/repos/${repo.owner}/${repo.name}/pulls`, fields)))
  }

  // Check runs and the older commit statuses on a commit, as one list.
  async checks(repo: PullRequestRepo, sha: string): Promise<PullRequestCheck[]> {
    const path = `/repos/${repo.owner}/${repo.name}/commits/${sha}`
    const [runs, statuses] = await Promise.all([
      this.json('GET', `${path}/check-runs?per_page=${PAGE}`).then((data) => CheckRuns.parse(data).check_runs),
      this.json('GET', `${path}/status?per_page=${PAGE}`).then((data) => CombinedStatus.parse(data).statuses)
    ])
    return [
      ...runs.map((run) => ({ id: `run:${run.id}`, name: run.name, state: checkState(run.status, run.conclusion), url: run.html_url, completedAt: at(run.completed_at) })),
      ...statuses.map((status) => ({ id: `status:${status.id}`, name: status.context, state: statusState(status.state), url: status.target_url, completedAt: status.state === 'pending' ? null : at(status.updated_at) }))
    ]
  }

  async reviews(repo: PullRequestRepo, number: number): Promise<PullRequestReview[]> {
    const data = z.array(Review).parse(await this.json('GET', `/repos/${repo.owner}/${repo.name}/pulls/${number}/reviews?per_page=${PAGE}`))
    return data.flatMap((review) => {
      const state = review.state === 'APPROVED' ? 'approved' : review.state === 'CHANGES_REQUESTED' ? 'changes_requested' : review.state === 'COMMENTED' ? 'commented' : null
      return state ? [{ id: `review:${review.id}`, author: review.user?.login ?? '', state, body: review.body ?? '', submittedAt: at(review.submitted_at) ?? 0 }] : []
    })
  }

  // Comments on the diff, then on the conversation; whether a diff thread is resolved is not in
  // REST, so it stays unknown.
  async comments(repo: PullRequestRepo, number: number): Promise<PullRequestComment[]> {
    const base = `/repos/${repo.owner}/${repo.name}`
    const [onDiff, onIssue] = await Promise.all([
      this.json('GET', `${base}/pulls/${number}/comments?per_page=${PAGE}`).then((data) => z.array(ReviewComment).parse(data)),
      this.json('GET', `${base}/issues/${number}/comments?per_page=${PAGE}`).then((data) => z.array(IssueComment).parse(data))
    ])
    return [
      ...onDiff.map((comment) => ({ id: `diff:${comment.id}`, author: comment.user?.login ?? '', path: comment.path, line: comment.line ?? null, body: comment.body, url: comment.html_url, resolved: null, createdAt: at(comment.created_at) ?? 0 })),
      ...onIssue.map((comment) => ({ id: `issue:${comment.id}`, author: comment.user?.login ?? '', path: null, line: null, body: comment.body ?? '', url: comment.html_url, resolved: null, createdAt: at(comment.created_at) ?? 0 }))
    ]
  }

  // Merges only while the head is still `sha`; GitHub refuses (409) when it moved.
  async merge(repo: PullRequestRepo, number: number, method: PullRequestMergeMethod, sha: string): Promise<void> {
    await this.json('PUT', `/repos/${repo.owner}/${repo.name}/pulls/${number}/merge`, { merge_method: method, sha })
  }

  private async resolve(): Promise<Credential | null> {
    if (this.credential && this.now() - this.credential.at < CREDENTIAL_MS) return this.credential.value
    this.resolving ??= this.resolveInner().finally(() => { this.resolving = null })
    return this.resolving
  }

  private async resolveInner(): Promise<Credential | null> {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    const token = await this.readGhToken(signal).catch(() => null)
    const value: Credential | null = token
      ? { source: 'gh', instance: null, token }
      : this.sources.credentialsFor('github').flatMap(({ instance, credential }) => {
        const parsed = TokenCredential.safeParse(credential)
        return parsed.success ? [{ source: 'github-plugin' as const, instance, token: parsed.data.payload.token }] : []
      })[0] ?? null
    this.credential = value ? { value, account: null, at: this.now() } : null
    return value
  }

  private async json(method: Method, path: string, body?: unknown): Promise<unknown> {
    if (this.now() < this.limitedUntil) throw new GitHubError('rate-limited', `GitHub 的请求额度用完了，${new Date(this.limitedUntil).toLocaleTimeString()} 后恢复。`)
    const credential = await this.resolve()
    if (!credential) throw new GitHubError('auth-failed', '这台电脑上没有 GitHub 凭据：登录 gh，或在 设置 → 集成 → GitHub 登录。')
    let response: Response
    try {
      response = await this.fetch(`${API}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${credential.token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'Antumi', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    } catch (error) {
      throw new GitHubError('request-failed', error instanceof Error ? error.message : String(error))
    }
    this.noteRateLimit(response)
    if (response.ok) return response.status === 204 ? null : await response.json()
    const text = await response.text().catch(() => '')
    const detail = ((): string => { try { return Failure.parse(JSON.parse(text)).message ?? '' } catch { return '' } })()
    throw this.failure(response, detail)
  }

  private noteRateLimit(response: Response): void {
    const remaining = Number(response.headers.get('x-ratelimit-remaining'))
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    if (Number.isFinite(remaining) && remaining < RATE_LIMIT_FLOOR && reset > 0) this.limitedUntil = Math.max(this.limitedUntil, reset * 1000)
  }

  private failure(response: Response, detail: string): GitHubError {
    const { status } = response
    if (status === 401) {
      this.credential = null
      return new GitHubError('auth-failed', detail || 'GitHub 不认这个凭据，请重新登录。')
    }
    if (status === 429 || (status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail)))) {
      const retry = Number(response.headers.get('retry-after'))
      if (retry > 0) this.limitedUntil = Math.max(this.limitedUntil, this.now() + retry * 1000)
      return new GitHubError('rate-limited', detail || 'GitHub 的请求额度用完了，稍后再试。')
    }
    if (status === 403) return new GitHubError('forbidden', detail ? `GitHub 拒绝了：${detail}` : 'GitHub 拒绝了：这个凭据没有这个仓库 Pull requests 的权限。')
    if (status === 404) return new GitHubError('not-found', detail || 'GitHub 上没有这个仓库，或凭据看不到它。')
    return new GitHubError('request-failed', detail ? `GitHub 返回 ${status}：${detail}` : `GitHub 返回 ${status}。`)
  }
}
