import { describe, expect, it, vi } from 'vitest'
import type { PullRequestRepo } from '@antumi/protocol'
import type { SourceCredential } from './source-provider'
import { GitHubClient, GitHubError, type GhAccount } from './github-client'

type Call = { path: string; method: string; token: string; body: unknown; signal: AbortSignal | null | undefined; redirect: string | undefined }
type Reply = (call: Call) => Response
const repo: PullRequestRepo = { host: 'github', owner: 'flyhero', name: 'antumi' }
const REPO_PATH = '/repos/flyhero/antumi'
const credential = (token: string): SourceCredential => ({ kind: 'token', payload: { token } })
const pull = (overrides: Record<string, unknown> = {}) => ({
  number: 7, html_url: 'https://github.com/flyhero/antumi/pull/7', state: 'open', draft: true, title: 'Add PRs',
  head: { sha: 'a'.repeat(40), ref: 'antumi/abc', repo: { owner: { login: 'flyhero' } } }, base: { ref: 'main' },
  mergeable: null, merged_at: null, updated_at: '2026-11-07T10:00:00Z', ...overrides
})
// Who may push: by token, as GitHub would answer the repository's permissions.
const pushers = new Set(['Bearer gh-secret', 'Bearer personal-secret', 'Bearer plugin-secret'])

function harness(reply: Reply = () => Response.json(pull()), { plugin = true, accounts = [{ login: 'flyhero', token: 'gh-secret' }] as GhAccount[] } = {}) {
  const calls: Call[] = []
  const sources = { credentialsFor: vi.fn(() => (plugin ? [{ instance: 'default', credential: credential('plugin-secret') }] : [])) }
  const ghAccounts = vi.fn(async (_signal: AbortSignal): Promise<GhAccount[]> => accounts)
  let now = 1_000_000
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const call = { path: url.pathname + url.search, method: init?.method ?? 'GET', token: new Headers(init?.headers).get('authorization') ?? '', body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal, redirect: init?.redirect }
    calls.push(call)
    if (call.path === REPO_PATH) return Response.json({ default_branch: 'main', permissions: { push: pushers.has(call.token), pull: true } })
    return reply(call)
  }
  const client = new GitHubClient(sources, { ghAccounts, fetch, now: () => now })
  const asked = () => calls.filter((call) => call.path !== REPO_PATH)
  return { client, sources, ghAccounts, calls, asked, advance: (ms: number) => { now += ms } }
}

describe('GitHubClient', () => {
  it('uses the gh account first and sends every request pinned and signed', async () => {
    const h = harness()
    const result = await h.client.pull(repo, 7)
    expect(result).toMatchObject({ number: 7, state: 'open', draft: true, headRef: 'antumi/abc', headOwner: 'flyhero', base: 'main', mergeable: 'unknown', mergedAt: null })
    expect(h.calls.map((call) => [call.path, call.token])).toEqual([[REPO_PATH, 'Bearer gh-secret'], ['/repos/flyhero/antumi/pulls/7', 'Bearer gh-secret']])
    expect(h.calls.every((call) => call.signal && call.redirect === 'error')).toBe(true)
    expect(h.client.accountFor(repo)).toBe('flyhero')
  })

  it('goes by the account that may push to the repo, not the active one that can only read it', async () => {
    const h = harness(() => Response.json(pull()), { accounts: [{ login: 'work-account', token: 'work-secret' }, { login: 'personal', token: 'personal-secret' }] })
    await h.client.pull(repo, 7)
    expect(h.asked().map((call) => call.token)).toEqual(['Bearer personal-secret'])
    expect(h.client.accountFor(repo)).toBe('personal')
    // Chosen once, kept for the repo.
    await h.client.pull(repo, 7)
    expect(h.calls.filter((call) => call.path === REPO_PATH)).toHaveLength(2)
  })

  it('tries the account named like the owner first', async () => {
    const h = harness(() => Response.json(pull()), { accounts: [{ login: 'other', token: 'personal-secret' }, { login: 'FlyHero', token: 'gh-secret' }] })
    await h.client.pull(repo, 7)
    expect(h.calls[0]?.token).toBe('Bearer gh-secret')
  })

  it('settles for an account that can read when none may push', async () => {
    const h = harness(() => Response.json(pull()), { plugin: false, accounts: [{ login: 'work-account', token: 'work-secret' }] })
    await h.client.pull(repo, 7)
    expect(h.asked()[0]?.token).toBe('Bearer work-secret')
  })

  it('falls back to the GitHub plugin, and has no credential without either', async () => {
    const h = harness(undefined, { accounts: [] })
    expect(await h.client.available()).toBe(true)
    await h.client.pull(repo, 7)
    expect(h.asked()[0]?.token).toBe('Bearer plugin-secret')
    expect(h.sources.credentialsFor).toHaveBeenCalledWith('github')

    const none = harness(undefined, { plugin: false, accounts: [] })
    expect(await none.client.available()).toBe(false)
    await expect(none.client.pull(repo, 7)).rejects.toMatchObject({ code: 'auth-failed' })
    expect(none.calls).toEqual([])
  })

  it('reads merged and conflicting pull requests, and lists those by head branch', async () => {
    const h = harness((call) => call.path.startsWith('/repos/flyhero/antumi/pulls?')
      ? Response.json([pull({ state: 'closed', merged_at: '2026-11-07T12:00:00Z', head: { sha: 'b'.repeat(40), ref: 'antumi/abc', repo: null } })])
      : Response.json(pull({ mergeable: false })))
    expect((await h.client.pull(repo, 7)).mergeable).toBe('conflicting')
    const listed = await h.client.pullsByHead(repo, 'antumi/abc')
    expect(listed).toEqual([expect.objectContaining({ state: 'merged', mergedAt: Date.parse('2026-11-07T12:00:00Z'), headOwner: null })])
    expect(h.asked()[1]?.path).toBe('/repos/flyhero/antumi/pulls?head=flyhero%3Aantumi%2Fabc&state=all&sort=updated&direction=desc&per_page=10')
  })

  it('creates a pull request with the fields as given', async () => {
    const h = harness()
    await h.client.createPull(repo, { title: 'Add PRs', body: 'Why.', head: 'antumi/abc', base: 'main', draft: true })
    expect(h.asked()[0]).toMatchObject({ method: 'POST', path: '/repos/flyhero/antumi/pulls', body: { title: 'Add PRs', body: 'Why.', head: 'antumi/abc', base: 'main', draft: true } })
  })

  it('tells auth, permission, missing and other failures apart, without the token in any', async () => {
    const cases: [number, string, string][] = [[401, 'auth-failed', 'Bad credentials'], [403, 'forbidden', 'Resource not accessible by personal access token'], [404, 'not-found', 'Not Found'], [422, 'request-failed', 'A pull request already exists for flyhero:antumi/abc.'], [500, 'request-failed', '']]
    for (const [status, code, message] of cases) {
      const h = harness(() => new Response(JSON.stringify({ message }), { status }))
      const error = await h.client.pull(repo, 7).catch((error: unknown) => error)
      expect(error).toBeInstanceOf(GitHubError)
      expect(error).toMatchObject({ code })
      if (message) expect((error as GitHubError).message).toContain(message)
      expect((error as GitHubError).message).not.toContain('secret')
    }
  })

  it('says the repo is not found when no account can see it', async () => {
    const h = harness(undefined, { plugin: false })
    const fetch: typeof globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
    const client = new GitHubClient(h.sources, { ghAccounts: h.ghAccounts, fetch })
    await expect(client.pull(repo, 7)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('stops calling GitHub as an account once its rate limit is nearly spent, until it resets', async () => {
    const h = harness((call) => Response.json(pull(), { headers: call.path.endsWith('/7') ? { 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': '1800' } : {} }))
    await h.client.pull(repo, 7)
    await expect(h.client.pull(repo, 8)).rejects.toMatchObject({ code: 'rate-limited' })
    expect(h.asked()).toHaveLength(1)
    h.advance(1_000_000)
    await h.client.pull(repo, 8)
    expect(h.asked()).toHaveLength(2)
  })

  it('reads a 403 with no calls left as the rate limit, not as a permission problem', async () => {
    const h = harness(() => new Response(JSON.stringify({ message: 'API rate limit exceeded for user' }), { status: 403, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' } }))
    await expect(h.client.pull(repo, 7)).rejects.toMatchObject({ code: 'rate-limited' })
    await expect(h.client.pull(repo, 7)).rejects.toMatchObject({ code: 'rate-limited' })
    expect(h.asked()).toHaveLength(1)
  })

  it('looks the credentials up again after one is refused', async () => {
    const h = harness(() => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }))
    await expect(h.client.pull(repo, 7)).rejects.toMatchObject({ code: 'auth-failed' })
    await expect(h.client.pull(repo, 7)).rejects.toMatchObject({ code: 'auth-failed' })
    expect(h.ghAccounts).toHaveBeenCalledTimes(2)
  })

  it('merges check runs and commit statuses into one list', async () => {
    const h = harness((call) => call.path.includes('/check-runs')
      ? Response.json({ check_runs: [{ id: 1, name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://ci/1', completed_at: '2026-11-07T10:00:00Z' }, { id: 2, name: 'build', status: 'in_progress', conclusion: null, html_url: null, completed_at: null }] })
      : Response.json({ statuses: [{ id: 3, context: 'lint', state: 'success', target_url: null, updated_at: '2026-11-07T10:00:00Z' }] }))
    const checks = await h.client.checks(repo, 'a'.repeat(40))
    expect(checks.map(({ id, state }) => [id, state])).toEqual([['run:1', 'failure'], ['run:2', 'running'], ['status:3', 'success']])
  })

  it('reads reviews and both kinds of comments', async () => {
    const h = harness((call) => call.path.includes('/reviews')
      ? Response.json([{ id: 1, user: { login: 'ann' }, state: 'CHANGES_REQUESTED', body: 'Fix it', submitted_at: '2026-11-07T10:00:00Z' }, { id: 2, user: null, state: 'PENDING', body: null, submitted_at: null }])
      : call.path.includes('/pulls/7/comments')
        ? Response.json([{ id: 3, user: { login: 'ann' }, path: 'src/a.ts', line: 12, body: 'Rename', html_url: 'https://github.com/c/3', created_at: '2026-11-07T10:00:00Z' }])
        : Response.json([{ id: 4, user: { login: 'bob' }, body: 'LGTM', html_url: 'https://github.com/c/4', created_at: '2026-11-07T11:00:00Z' }]))
    expect(await h.client.reviews(repo, 7)).toEqual([{ id: 'review:1', author: 'ann', state: 'changes_requested', body: 'Fix it', submittedAt: Date.parse('2026-11-07T10:00:00Z') }])
    expect((await h.client.comments(repo, 7)).map(({ id, path, line }) => [id, path, line])).toEqual([['diff:3', 'src/a.ts', 12], ['issue:4', null, null]])
  })

  it('keeps a repository default branch with its account for an hour', async () => {
    const h = harness()
    expect(await h.client.defaultBranch(repo)).toBe('main')
    expect(await h.client.defaultBranch(repo)).toBe('main')
    expect(h.calls).toHaveLength(1)
    h.advance(61 * 60_000)
    await h.client.defaultBranch(repo)
    expect(h.calls).toHaveLength(2)
  })
})
