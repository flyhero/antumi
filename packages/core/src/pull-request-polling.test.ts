import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Task, type PullRequestLink } from '@antumi/protocol'
import { GitHubClient } from './github-client'
import { PullRequestService } from './pull-request-service'
import { PullRequestStore } from './pull-request-store'
import { TaskStore } from './task-store'

const SHA = 'a'.repeat(40)
const pull = (overrides: Record<string, unknown> = {}) => ({
  number: 7, html_url: 'https://github.com/flyhero/antumi/pull/7', state: 'open', draft: false, title: 'Add PRs',
  head: { sha: SHA, ref: 'antumi/abc', repo: { owner: { login: 'flyhero' } } }, base: { ref: 'main' },
  mergeable: null, merged_at: null, updated_at: '2026-11-07T10:00:00Z', ...overrides
})
const MINUTE = 60_000

// How often the host is asked, with the time faked: a client looking on, nothing changing, the
// host failing, and nobody looking.
describe('PullRequestService polling', () => {
  let dir: string
  let tasks: TaskStore
  let store: PullRequestStore
  let service: PullRequestService
  let taskId: string
  let fetches: string[]
  let reply: (path: string) => Response
  const watcher = () => { const listeners = new Set<() => void>(); return { onClose: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }, close: () => listeners.forEach((listener) => listener()) } }
  const link = (overrides: Partial<PullRequestLink> = {}): PullRequestLink => ({
    taskId, repoPath: '/repo', repo: { host: 'github', owner: 'flyhero', name: 'antumi' }, number: 7, url: 'https://github.com/flyhero/antumi/pull/7', headBranch: 'antumi/abc', base: 'main',
    status: null, problem: null, fetchedAt: null, refreshing: false, ...overrides
  })
  const pullFetches = () => fetches.filter((path) => path.endsWith('/pulls/7')).length

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-pr-polling-'))
    tasks = new TaskStore(path.join(dir, 'antumi.db'))
    store = new PullRequestStore(path.join(dir, 'antumi.db'))
    fetches = []
    reply = (path) => Response.json(path.endsWith('/pulls/7') ? pull() : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/status') ? { statuses: [] } : [])
    const fetch: typeof globalThis.fetch = async (input) => { const path = new URL(String(input)).pathname; fetches.push(path); return path === '/repos/flyhero/antumi' ? Response.json({ default_branch: 'main', permissions: { push: true } }) : reply(path) }
    const client = new GitHubClient({ credentialsFor: () => [] }, { ghAccounts: async () => [{ login: null, token: 'gh-secret' }], fetch, now: () => Date.now() })
    const task = Task.parse({ ...tasks.create('A'), status: 'running', repos: [{ path: '/repo', worktreePath: '/repo-wt', branch: 'antumi/abc', startRef: null, start: null }] })
    taskId = task.id
    service = new PullRequestService({ get: () => task }, { status: async () => { throw new Error('unused') }, execute: async () => { throw new Error('unused') } }, store, client, { now: () => Date.now() })
  })
  afterEach(() => { service.stop(); store.close(); tasks.close(); rmSync(dir, { recursive: true, force: true }); vi.useRealTimers() })

  it('follows a watched pull request every half minute, slowing while nothing changes', async () => {
    store.put(link())
    service.start()
    service.watch(taskId, true, watcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(pullFetches()).toBe(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(pullFetches()).toBe(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(pullFetches()).toBe(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(pullFetches()).toBe(3)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(pullFetches()).toBe(4)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(pullFetches()).toBe(5)
    // A change brings it back to every half minute.
    reply = (path) => Response.json(path.endsWith('/pulls/7') ? pull({ title: 'Renamed' }) : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/status') ? { statuses: [] } : [])
    await vi.advanceTimersByTimeAsync(120_000)
    expect(pullFetches()).toBe(6)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(pullFetches()).toBe(7)
  })

  it('sweeps open pull requests nobody watches every five minutes, and stops once none is open', async () => {
    store.put(link({ fetchedAt: Date.now() }))
    service.start()
    await vi.advanceTimersByTimeAsync(4 * MINUTE)
    expect(pullFetches()).toBe(0)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(pullFetches()).toBe(1)
    reply = (path) => Response.json(path.endsWith('/pulls/7') ? pull({ state: 'closed', merged_at: '2026-11-07T11:00:00Z' }) : path.includes('/check-runs') ? { check_runs: [] } : path.includes('/status') ? { statuses: [] } : [])
    await vi.advanceTimersByTimeAsync(5 * MINUTE)
    expect(pullFetches()).toBe(2)
    expect(store.get(taskId, '/repo')?.status?.state).toBe('merged')
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(pullFetches()).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits longer after each failure, up to half an hour', async () => {
    store.put(link())
    reply = () => new Response(JSON.stringify({ message: 'down' }), { status: 500 })
    service.start()
    service.watch(taskId, true, watcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(pullFetches()).toBe(1)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(pullFetches()).toBe(2)
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    expect(pullFetches()).toBe(3)
    await vi.advanceTimersByTimeAsync(4 * MINUTE)
    expect(pullFetches()).toBe(4)
    await vi.advanceTimersByTimeAsync(8 * MINUTE)
    expect(pullFetches()).toBe(5)
    await vi.advanceTimersByTimeAsync(16 * MINUTE)
    expect(pullFetches()).toBe(6)
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(pullFetches()).toBe(7)
    expect(store.get(taskId, '/repo')?.problem?.code).toBe('request-failed')
  })

  it('drops a watcher that closes, falling back to the sweep', async () => {
    store.put(link())
    service.start()
    const client = watcher()
    service.watch(taskId, true, client)
    await vi.advanceTimersByTimeAsync(0)
    expect(pullFetches()).toBe(1)
    client.close()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(pullFetches()).toBe(2)
    await vi.advanceTimersByTimeAsync(4 * MINUTE)
    expect(pullFetches()).toBe(2)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(pullFetches()).toBe(3)
  })

  it('does nothing before started, and nothing after stopped', async () => {
    store.put(link())
    service.watch(taskId, true, watcher())
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    expect(pullFetches()).toBe(0)
    service.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(pullFetches()).toBe(1)
    service.stop()
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    expect(pullFetches()).toBe(1)
  })
})
