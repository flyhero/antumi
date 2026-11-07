import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Task, type PullRequestLink, type PullRequestStatus } from '@antumi/protocol'
import { GitHubClient } from './github-client'
import { PullRequestService, type PullRequestAccepting } from './pull-request-service'
import { PullRequestStore } from './pull-request-store'
import { TaskStore } from './task-store'

const SHA = 'a'.repeat(40)
const pull = (overrides: Record<string, unknown> = {}) => ({
  number: 7, html_url: 'https://github.com/flyhero/antumi/pull/7', state: 'open', draft: false, title: 'Add PRs',
  head: { sha: SHA, ref: 'antumi/abc', repo: { owner: { login: 'flyhero' } } }, base: { ref: 'main' },
  mergeable: true, merged_at: null, updated_at: '2026-11-07T10:00:00Z', ...overrides
})
const merged = pull({ state: 'closed', merged_at: '2026-11-07T12:00:00Z' })

describe('PullRequestService merging and accepting', () => {
  let dir: string
  let tasks: TaskStore
  let store: PullRequestStore
  let task: Task
  let calls: { path: string; method: string; body: unknown }[]
  let reply: (path: string, method: string) => Response
  let accepting: { enabled: ReturnType<typeof vi.fn<PullRequestAccepting['enabled']>>; accept: ReturnType<typeof vi.fn<PullRequestAccepting['accept']>> }
  let service: PullRequestService
  const status = (overrides: Partial<PullRequestStatus> = {}): PullRequestStatus => ({ state: 'open', draft: false, title: 'T', headSha: SHA, base: 'main', mergeable: 'mergeable', checks: [], reviews: [], comments: [], mergedAt: null, updatedAt: 0, ...overrides })
  const link = (repoPath = '/repo', overrides: Partial<PullRequestLink> = {}): PullRequestLink => ({ taskId: task.id, repoPath, repo: { host: 'github', owner: 'flyhero', name: 'antumi' }, number: 7, url: 'https://github.com/flyhero/antumi/pull/7', headBranch: 'antumi/abc', base: 'main', status: status(), problem: null, fetchedAt: 1, refreshing: false, ...overrides })

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-pr-merge-'))
    tasks = new TaskStore(path.join(dir, 'antumi.db'))
    store = new PullRequestStore(path.join(dir, 'antumi.db'))
    task = Task.parse({ ...tasks.create('A'), status: 'review', repos: [{ path: '/repo', worktreePath: '/repo-wt', branch: 'antumi/abc', startRef: null, start: null }] })
    calls = []
    reply = (path) => Response.json(path.endsWith('/pulls/7') ? pull() : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/status') ? { statuses: [] } : [])
    const fetch: typeof globalThis.fetch = async (input, init) => { const call = { path: new URL(String(input)).pathname, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }; calls.push(call); return call.path === '/repos/flyhero/antumi' ? Response.json({ default_branch: 'main', permissions: { push: true } }) : reply(call.path, call.method) }
    const client = new GitHubClient({ credentialsFor: () => [] }, { ghAccounts: async () => [{ login: null, token: 'gh-secret' }], fetch })
    accepting = { enabled: vi.fn<PullRequestAccepting['enabled']>(() => true), accept: vi.fn<PullRequestAccepting['accept']>(() => {}) }
    service = new PullRequestService({ get: () => task }, { status: async () => { throw new Error('unused') }, execute: async () => { throw new Error('unused') } }, store, client, { accepting })
  })
  afterEach(() => { store.close(); tasks.close(); rmSync(dir, { recursive: true, force: true }) })

  it('merges by the method chosen while the head is what the client saw, then accepts the task', async () => {
    store.put(link())
    reply = (path, method) => method === 'PUT' ? Response.json({ merged: true }) : Response.json(path.endsWith('/pulls/7') ? merged : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/status') ? { statuses: [] } : [])
    const result = await service.merge(task.id, '/repo', 'squash', SHA)
    expect(calls.find((call) => call.method === 'PUT')).toMatchObject({ path: '/repos/flyhero/antumi/pulls/7/merge', body: { merge_method: 'squash', sha: SHA } })
    expect(result.status?.state).toBe('merged')
    expect(accepting.accept).toHaveBeenCalledWith(task.id)
  })

  it('refuses a head that moved, a pull request not open, and what the host refuses', async () => {
    store.put(link())
    await expect(service.merge(task.id, '/repo', 'squash', 'b'.repeat(40))).rejects.toMatchObject({ reason: 'pull-request-head-moved' })
    store.put(link('/repo', { status: status({ state: 'merged' }) }))
    await expect(service.merge(task.id, '/repo', 'squash', SHA)).rejects.toMatchObject({ reason: 'pull-request-not-open' })
    store.put(link())
    reply = (_path, method) => method === 'PUT' ? new Response(JSON.stringify({ message: 'Pull Request is not mergeable' }), { status: 405 }) : Response.json(pull())
    await expect(service.merge(task.id, '/repo', 'squash', SHA)).rejects.toMatchObject({ reason: 'pull-request-request-failed', message: expect.stringContaining('not mergeable') })
    expect(accepting.accept).not.toHaveBeenCalled()
  })

  it('accepts on a refresh that finds the pull request merged elsewhere, once every repo is', async () => {
    task = Task.parse({ ...task, repos: [...task.repos, { path: '/docs', worktreePath: '/docs-wt', branch: 'antumi/abc', startRef: null, start: null }] })
    store.put(link('/repo'))
    store.put(link('/docs', { status: status({ state: 'merged' }) }))
    reply = (path) => Response.json(path.endsWith('/pulls/7') ? merged : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/status') ? { statuses: [] } : [])
    await service.refresh(task.id, '/repo', true)
    expect(accepting.accept).toHaveBeenCalledTimes(1)
    await service.refresh(task.id, '/repo', true)
    expect(accepting.accept).toHaveBeenCalledTimes(1)
  })

  it('leaves the task to the user when the setting is off, or the task is not ready', async () => {
    store.put(link())
    reply = (path) => Response.json(path.endsWith('/pulls/7') ? merged : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/status') ? { statuses: [] } : [])
    accepting.enabled.mockReturnValue(false)
    await service.refresh(task.id, undefined, true)
    expect(accepting.accept).not.toHaveBeenCalled()
    accepting.enabled.mockReturnValue(true)
    task = Task.parse({ ...task, status: 'done' })
    store.put(link())
    await service.refresh(task.id, undefined, true)
    expect(accepting.accept).not.toHaveBeenCalled()
  })
})
