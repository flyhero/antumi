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
// Which account a repo goes by, and its default branch, are asked again this long on.
const CHOICE_MS = 60 * 60_000
const PAGE = 100
// What of a failed job's log goes to the agent: its end, where the failure is.
const LOG_LINES = 150
const MAX_LOG_BYTES = 256 * 1024

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

// An account the GitHub CLI is signed in to; login is null when gh is too old to say.
export type GhAccount = { login: string | null; token: string }
type Credential = { source: 'gh' | 'github-plugin'; instance: string | null; login: string | null; token: string }
type Dependencies = { ghAccounts?: (signal: AbortSignal) => Promise<GhAccount[]>; fetch?: typeof fetch; now?: () => number }
type Method = 'GET' | 'POST' | 'PUT'

// The official GitHub source plugin stores a token credential in this form.
const TokenCredential = z.object({ kind: z.literal('token'), payload: z.object({ token: z.string().min(1).max(16_384).regex(/^[^\s\x00-\x1f\x7f]+$/) }) })
const Token = TokenCredential.shape.payload.shape.token
const GhStatus = z.object({ hosts: z.record(z.string(), z.array(z.object({ login: z.string().min(1).max(100), active: z.boolean().optional(), state: z.string().optional() }))) })
const Repository = z.object({ default_branch: z.string().min(1), permissions: z.object({ push: z.boolean() }).partial().optional() })
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
// GitHub's error body: a summary (Validation Failed), and for a 422 what failed, one by one.
const Failure = z.object({ message: z.string().optional(), errors: z.array(z.object({ message: z.string().optional() }).catch({})).optional().catch(undefined) })

export function failureDetail(text: string): string {
  try {
    const failure = Failure.parse(JSON.parse(text))
    return [failure.message, ...(failure.errors ?? []).map((entry) => entry.message)].filter((part) => part?.trim()).join('：')
  } catch {
    return ''
  }
}

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

async function ghRun(args: string[], signal: AbortSignal): Promise<string | null> {
  try {
    const env = { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' }
    const launch = planLaunch('gh', args, process.cwd(), env)
    const { stdout } = await execFileAsync(launch.file, launch.args, {
      env: launch.env, encoding: 'utf8', windowsHide: true, timeout: 5_000, maxBuffer: 64 * 1024, signal
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

// Every account gh is signed in to on github.com, the active one first, each with its token: a
// person often has a work and a personal one, and a repo may take only one of them. A gh too old
// to list them gives the active account's token alone.
async function ghAccounts(signal: AbortSignal): Promise<GhAccount[]> {
  const status = GhStatus.safeParse(JSON.parse(await ghRun(['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'], signal) ?? 'null'))
  const logins = status.success
    ? (status.data.hosts['github.com'] ?? []).filter((entry) => !entry.state || entry.state === 'success').sort((a, b) => Number(b.active ?? false) - Number(a.active ?? false)).map((entry) => entry.login)
    : []
  if (logins.length === 0) {
    const token = Token.safeParse(await ghRun(['auth', 'token', '--hostname', 'github.com'], signal))
    return token.success ? [{ login: null, token: token.data }] : []
  }
  const accounts = await Promise.all(logins.map(async (login) => {
    const token = Token.safeParse(await ghRun(['auth', 'token', '--hostname', 'github.com', '--user', login], signal))
    return token.success ? { login, token: token.data } : null
  }))
  return accounts.filter((account) => account !== null)
}

// GitHub's REST API with the credentials this machine has: every account the GitHub CLI is signed
// in to, then the ones the GitHub source plugin signed in with. Each repo goes by the first that
// may push to it, the one named like its owner tried first, else the first that can read it; so
// a personal repo is never written to as a work account that can only read it. Every request is
// pinned to api.github.com, follows no redirect, and gives up after TIMEOUT_MS; tokens never leave
// this class.
export class GitHubClient {
  private readonly readGhAccounts: NonNullable<Dependencies['ghAccounts']>
  private readonly fetch: typeof fetch
  private readonly now: () => number
  private credentials: { list: Credential[]; at: number } | null = null
  private resolving: Promise<Credential[]> | null = null
  private readonly chosen = new Map<string, { credential: Credential; defaultBranch: string; at: number }>()
  private readonly choosing = new Map<string, Promise<{ credential: Credential; defaultBranch: string }>>()
  private readonly limitedUntil = new Map<string, number>()

  constructor(private readonly sources: Pick<SourceService, 'credentialsFor'>, dependencies: Dependencies = {}) {
    this.readGhAccounts = dependencies.ghAccounts ?? ghAccounts
    this.fetch = dependencies.fetch ?? fetch
    this.now = dependencies.now ?? Date.now
  }

  // Whether any credential is at hand, without asking GitHub; the `auth` blocker.
  async available(): Promise<boolean> {
    return (await this.resolve()).length > 0
  }

  // The account a repo goes by, once chosen; null before.
  accountFor(repo: PullRequestRepo): string | null {
    return this.chosen.get(repoKey(repo))?.credential.login ?? null
  }

  async defaultBranch(repo: PullRequestRepo): Promise<string> {
    return (await this.choose(repo)).defaultBranch
  }

  async pull(repo: PullRequestRepo, number: number): Promise<GitHubPull> {
    return pullOf(Pull.parse(await this.call(repo, 'GET', `/repos/${repo.owner}/${repo.name}/pulls/${number}`)))
  }

  // Every pull request whose head is the branch in this repo (not a fork's), open or not, newest first.
  async pullsByHead(repo: PullRequestRepo, branch: string): Promise<GitHubPull[]> {
    const query = new URLSearchParams({ head: `${repo.owner}:${branch}`, state: 'all', sort: 'updated', direction: 'desc', per_page: '10' })
    return z.array(Pull).parse(await this.call(repo, 'GET', `/repos/${repo.owner}/${repo.name}/pulls?${query}`)).map(pullOf)
  }

  async createPull(repo: PullRequestRepo, fields: { title: string; body: string; head: string; base: string; draft: boolean }): Promise<GitHubPull> {
    return pullOf(Pull.parse(await this.call(repo, 'POST', `/repos/${repo.owner}/${repo.name}/pulls`, fields)))
  }

  // Check runs and the older commit statuses on a commit, as one list.
  async checks(repo: PullRequestRepo, sha: string): Promise<PullRequestCheck[]> {
    const path = `/repos/${repo.owner}/${repo.name}/commits/${sha}`
    const [runs, statuses] = await Promise.all([
      this.call(repo, 'GET', `${path}/check-runs?per_page=${PAGE}`).then((data) => CheckRuns.parse(data).check_runs),
      this.call(repo, 'GET', `${path}/status?per_page=${PAGE}`).then((data) => CombinedStatus.parse(data).statuses)
    ])
    return [
      ...runs.map((run) => ({ id: `run:${run.id}`, name: run.name, state: checkState(run.status, run.conclusion), url: run.html_url, completedAt: at(run.completed_at) })),
      ...statuses.map((status) => ({ id: `status:${status.id}`, name: status.context, state: statusState(status.state), url: status.target_url, completedAt: status.state === 'pending' ? null : at(status.updated_at) }))
    ]
  }

  async reviews(repo: PullRequestRepo, number: number): Promise<PullRequestReview[]> {
    const data = z.array(Review).parse(await this.call(repo, 'GET', `/repos/${repo.owner}/${repo.name}/pulls/${number}/reviews?per_page=${PAGE}`))
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
      this.call(repo, 'GET', `${base}/pulls/${number}/comments?per_page=${PAGE}`).then((data) => z.array(ReviewComment).parse(data)),
      this.call(repo, 'GET', `${base}/issues/${number}/comments?per_page=${PAGE}`).then((data) => z.array(IssueComment).parse(data))
    ])
    return [
      ...onDiff.map((comment) => ({ id: `diff:${comment.id}`, author: comment.user?.login ?? '', path: comment.path, line: comment.line ?? null, body: comment.body, url: comment.html_url, resolved: null, createdAt: at(comment.created_at) ?? 0 })),
      ...onIssue.map((comment) => ({ id: `issue:${comment.id}`, author: comment.user?.login ?? '', path: null, line: null, body: comment.body ?? '', url: comment.html_url, resolved: null, createdAt: at(comment.created_at) ?? 0 }))
    ]
  }

  // The end of a GitHub Actions job's log, as plain lines, or null when there is none to read.
  // GitHub answers with a redirect to a signed, short-lived URL in its log storage: that one
  // redirect is followed by hand, only to that storage, and without the token.
  async jobLogTail(repo: PullRequestRepo, jobId: string, lines = LOG_LINES): Promise<string | null> {
    if (!/^\d{1,20}$/.test(jobId)) return null
    const { credential } = await this.choose(repo)
    const limited = this.limitedUntil.get(credential.token) ?? 0
    if (this.now() < limited) return null
    let response: Response
    try {
      response = await this.fetch(`${API}/repos/${repo.owner}/${repo.name}/actions/jobs/${jobId}/logs`, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${credential.token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'Antumi' }
      })
    } catch {
      return null
    }
    this.noteRateLimit(credential, response)
    await response.body?.cancel()
    const location = logLocation(response)
    if (!location) return null
    try {
      const log = await this.fetch(location, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'Antumi' } })
      if (!log.ok || !log.body) { await log.body?.cancel(); return null }
      return logTail(await readTail(log.body, MAX_LOG_BYTES), lines)
    } catch {
      return null
    }
  }

  // Merges only while the head is still `sha`; GitHub refuses (409) when it moved.
  async merge(repo: PullRequestRepo, number: number, method: PullRequestMergeMethod, sha: string): Promise<void> {
    await this.call(repo, 'PUT', `/repos/${repo.owner}/${repo.name}/pulls/${number}/merge`, { merge_method: method, sha })
  }

  private async resolve(): Promise<Credential[]> {
    if (this.credentials && this.now() - this.credentials.at < CREDENTIAL_MS) return this.credentials.list
    this.resolving ??= this.resolveInner().finally(() => { this.resolving = null })
    return this.resolving
  }

  private async resolveInner(): Promise<Credential[]> {
    const accounts = await this.readGhAccounts(AbortSignal.timeout(TIMEOUT_MS)).catch(() => [])
    const list: Credential[] = [
      ...accounts.map(({ login, token }) => ({ source: 'gh' as const, instance: null, login, token })),
      ...this.sources.credentialsFor('github').flatMap(({ instance, credential }) => {
        const parsed = TokenCredential.safeParse(credential)
        return parsed.success ? [{ source: 'github-plugin' as const, instance, login: null, token: parsed.data.payload.token }] : []
      })
    ].filter((credential, index, all) => all.findIndex((other) => other.token === credential.token) === index)
    this.credentials = { list, at: this.now() }
    return list
  }

  private async choose(repo: PullRequestRepo): Promise<{ credential: Credential; defaultBranch: string }> {
    const key = repoKey(repo)
    const cached = this.chosen.get(key)
    if (cached && this.now() - cached.at < CHOICE_MS) return cached
    const running = this.choosing.get(key)
    if (running) return running
    const work = this.chooseInner(repo).finally(() => this.choosing.delete(key))
    this.choosing.set(key, work)
    return work
  }

  private async chooseInner(repo: PullRequestRepo): Promise<{ credential: Credential; defaultBranch: string }> {
    const list = await this.resolve()
    if (list.length === 0) throw new GitHubError('auth-failed', '这台电脑上没有 GitHub 凭据：登录 gh，或在 设置 → 集成 → GitHub 登录。')
    const owner = repo.owner.toLowerCase()
    const ordered = [...list].sort((a, b) => Number(b.login?.toLowerCase() === owner) - Number(a.login?.toLowerCase() === owner))
    let readable: { credential: Credential; defaultBranch: string } | null = null
    let failure: unknown = null
    for (const credential of ordered) {
      try {
        const data = Repository.parse(await this.json(credential, 'GET', `/repos/${repo.owner}/${repo.name}`))
        const found = { credential, defaultBranch: data.default_branch }
        if (data.permissions?.push) return this.keepChoice(repo, found)
        readable ??= found
      } catch (error) {
        // Out of calls is no answer about access: say so rather than settle for another account.
        if (error instanceof GitHubError && error.code === 'rate-limited') throw error
        failure ??= error
      }
    }
    if (readable) return this.keepChoice(repo, readable)
    throw failure ?? new GitHubError('not-found', 'GitHub 上没有这个仓库，或凭据看不到它。')
  }

  private keepChoice(repo: PullRequestRepo, found: { credential: Credential; defaultBranch: string }): { credential: Credential; defaultBranch: string } {
    this.chosen.set(repoKey(repo), { ...found, at: this.now() })
    return found
  }

  // A request about the repo, as the account it goes by. One that account is refused for drops
  // the choice, so the next call chooses again.
  private async call(repo: PullRequestRepo, method: Method, path: string, body?: unknown): Promise<unknown> {
    const { credential } = await this.choose(repo)
    try {
      return await this.json(credential, method, path, body)
    } catch (error) {
      if (error instanceof GitHubError && error.code === 'auth-failed') this.chosen.delete(repoKey(repo))
      throw error
    }
  }

  private async json(credential: Credential, method: Method, path: string, body?: unknown): Promise<unknown> {
    const limited = this.limitedUntil.get(credential.token) ?? 0
    if (this.now() < limited) throw new GitHubError('rate-limited', `GitHub 的请求额度用完了，${new Date(limited).toLocaleTimeString()} 后恢复。`)
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
    this.noteRateLimit(credential, response)
    if (response.ok) return response.status === 204 ? null : await response.json()
    const text = await response.text().catch(() => '')
    const detail = failureDetail(text)
    throw this.failure(credential, response, detail)
  }

  private limit(credential: Credential, until: number): void {
    this.limitedUntil.set(credential.token, Math.max(this.limitedUntil.get(credential.token) ?? 0, until))
  }

  private noteRateLimit(credential: Credential, response: Response): void {
    const remaining = Number(response.headers.get('x-ratelimit-remaining'))
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    if (Number.isFinite(remaining) && response.headers.has('x-ratelimit-remaining') && remaining < RATE_LIMIT_FLOOR && reset > 0) this.limit(credential, reset * 1000)
  }

  private failure(credential: Credential, response: Response, detail: string): GitHubError {
    const { status } = response
    if (status === 401) {
      this.credentials = null
      return new GitHubError('auth-failed', detail || 'GitHub 不认这个凭据，请重新登录。')
    }
    if (status === 429 || (status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail)))) {
      const retry = Number(response.headers.get('retry-after'))
      if (retry > 0) this.limit(credential, this.now() + retry * 1000)
      return new GitHubError('rate-limited', detail || 'GitHub 的请求额度用完了，稍后再试。')
    }
    if (status === 403) return new GitHubError('forbidden', detail ? `GitHub 拒绝了：${detail}` : 'GitHub 拒绝了：这个凭据没有这个仓库 Pull requests 的权限。')
    if (status === 404) return new GitHubError('not-found', detail || 'GitHub 上没有这个仓库，或凭据看不到它。')
    return new GitHubError('request-failed', detail ? `GitHub 返回 ${status}：${detail}` : `GitHub 返回 ${status}。`)
  }
}

const repoKey = (repo: PullRequestRepo) => `${repo.owner}/${repo.name}`.toLowerCase()

// Where GitHub keeps Actions logs; a redirect anywhere else is not followed.
const LOG_HOSTS = ['.blob.core.windows.net', '.actions.githubusercontent.com']

function logLocation(response: Response): string | null {
  if (response.status !== 302 && response.status !== 301 && response.status !== 307) return null
  try {
    const url = new URL(response.headers.get('location') ?? '')
    return url.protocol === 'https:' && LOG_HOSTS.some((suffix) => url.hostname.endsWith(suffix)) ? url.href : null
  } catch {
    return null
  }
}

// The last `max` bytes of a stream, so a huge log is never held whole.
async function readTail(body: ReadableStream<Uint8Array>, max: number): Promise<string> {
  const reader = body.getReader()
  let chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    while (size - (chunks[0]?.byteLength ?? 0) >= max && chunks.length > 1) size -= chunks.shift()?.byteLength ?? 0
  }
  const bytes = Buffer.concat(chunks)
  chunks = []
  return bytes.subarray(Math.max(0, bytes.byteLength - max)).toString('utf8')
}

// The lines as a person reads them: no timestamps GitHub puts in front, no terminal colours. A
// job's log ends with cleanup after the step that failed; GitHub marks the failure `##[error]`,
// so the lines leading up to the last mark are kept, not the cleanup.
export function logTail(text: string, lines: number): string {
  const clean = text.split(/\r?\n/)
    .map((line) => line.replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''))
  const lastError = clean.findLastIndex((line) => line.startsWith('##[error]'))
  const upTo = lastError >= 0 ? clean.slice(0, lastError + 1) : clean
  while (upTo.length > 0 && upTo[upTo.length - 1]?.trim() === '') upTo.pop()
  return upTo.slice(-lines).join('\n')
}
