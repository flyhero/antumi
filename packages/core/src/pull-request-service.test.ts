import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Task, type PullRequestLink } from '@antumi/protocol'
import { GitFavoriteStore } from './git-favorite-store'
import { GitService } from './git-service'
import { GitHubClient } from './github-client'
import { PullRequestService, baseOfStart } from './pull-request-service'
import { PullRequestStore } from './pull-request-store'
import { TaskStore } from './task-store'

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const SHA = 'a'.repeat(40)
const pull = (overrides: Record<string, unknown> = {}) => ({
  number: 7, html_url: 'https://github.com/flyhero/antumi/pull/7', state: 'open', draft: true, title: 'Add PRs',
  head: { sha: SHA, ref: 'antumi/abc', repo: { owner: { login: 'flyhero' } } }, base: { ref: 'main' },
  mergeable: null, merged_at: null, updated_at: '2026-11-07T10:00:00Z', ...overrides
})

type Call = { path: string; method: string; body: unknown }

describe('PullRequestService', () => {
  let root: string
  let repo: string
  let worktree: string
  let remote: string
  let tasks: TaskStore
  let favorites: GitFavoriteStore
  let store: PullRequestStore
  let task: Task
  let calls: Call[]
  let reply: (call: Call) => Response
  const changed = vi.fn<(taskId: string, links: PullRequestLink[]) => void>()
  let service: PullRequestService
  let now: number

  const commit = (dir: string, name: string, message = name) => { writeFileSync(path.join(dir, name), `${name}\n`); git(dir, 'add', '--', name); git(dir, 'commit', '-q', '-m', message); return git(dir, 'rev-parse', 'HEAD') }
  const setTask = (overrides: Partial<Task> = {}) => { task = Task.parse({ ...task, ...overrides }) }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-pull-requests-')))
    repo = path.join(root, 'repo'); remote = path.join(root, 'origin.git'); worktree = path.join(root, 'wt')
    git(root, 'init', '-q', '--bare', '-b', 'main', remote)
    git(root, 'init', '-q', '-b', 'main', repo)
    git(repo, 'config', 'user.name', 'T'); git(repo, 'config', 'user.email', 't@example.com')
    git(repo, 'remote', 'add', 'origin', 'git@github.com:flyhero/antumi.git')
    git(repo, 'remote', 'set-url', '--push', 'origin', remote)
    git(repo, 'config', `url.${remote}.insteadOf`, 'git@github.com:flyhero/antumi.git')
    const start = commit(repo, 'base.txt', 'initial')
    git(repo, 'push', '-q', '-u', 'origin', 'main')
    git(repo, 'worktree', 'add', '-q', '-b', 'antumi/abc', worktree)
    git(worktree, 'config', 'user.name', 'T'); git(worktree, 'config', 'user.email', 't@example.com')
    commit(worktree, 'work.txt', 'do the work')
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    favorites = new GitFavoriteStore(database)
    store = new PullRequestStore(database)
    task = Task.parse({ ...tasks.create('Add PRs'), details: 'Open pull requests from tasks', status: 'review', repos: [{ path: repo, worktreePath: worktree, branch: 'antumi/abc', startRef: 'refs/remotes/origin/main', start: { ref: 'origin/main', commit: start, note: null, at: 0 } }], dependsOn: [], agent: 'claude', createdAt: 0, updatedAt: 0 })
    const taskService = { get: (id: string) => { if (id !== task.id) throw new Error('task missing'); return task } }
    const gitService = new GitService({ ...taskService, list: () => [task], isLaunching: () => false }, { get: () => { throw new Error('no conversation') }, listAll: () => [], recordGitChange: async () => {}, isGitPending: () => false }, favorites)
    calls = []
    reply = () => Response.json([])
    now = 1_000_000
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const call = { path: new URL(String(input)).pathname + new URL(String(input)).search, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
      calls.push(call)
      if (call.path === '/repos/flyhero/antumi') return Response.json({ default_branch: 'main' })
      return reply(call)
    }
    const client = new GitHubClient({ credentialsFor: () => [] }, { ghAccounts: async () => [{ login: null, token: 'gh-secret' }], fetch, now: () => now })
    changed.mockClear()
    service = new PullRequestService(taskService, gitService, store, client, { now: () => now, changed })
  })
  afterEach(() => { store.close(); favorites.close(); tasks.close(); rmSync(root, { recursive: true, force: true }) })

  it('finds a branch ready for a pull request, pushed or not', async () => {
    const [result] = await service.check(task.id)
    expect(result).toEqual({ repoPath: repo, repo: { host: 'github', owner: 'flyhero', name: 'antumi' }, headBranch: 'antumi/abc', base: 'main', baseFallback: null, needsPush: true, blocker: null, existing: null })
    expect(calls.map((call) => call.path)).toEqual(['/repos/flyhero/antumi', '/repos/flyhero/antumi/pulls?head=flyhero%3Aantumi%2Fabc&state=all&sort=updated&direction=desc&per_page=10'])
    git(worktree, 'push', '-q', '-u', 'origin', 'antumi/abc')
    expect((await service.check(task.id))[0]?.needsPush).toBe(false)
  })

  it('names what stands in the way, the most basic first', async () => {
    git(repo, 'remote', 'set-url', 'origin', 'git@gitlab.com:flyhero/antumi.git')
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: 'not-github', repo: null })
    git(repo, 'remote', 'set-url', 'origin', 'git@github.com:flyhero/antumi.git')

    writeFileSync(path.join(worktree, 'dirty.txt'), 'x')
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: 'dirty', headBranch: 'antumi/abc', base: 'main' })
    rmSync(path.join(worktree, 'dirty.txt'))

    git(worktree, 'reset', '-q', '--hard', 'HEAD~1')
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: 'no-commits' })
  })

  it('refuses the default branch itself, and has no credential to ask with', async () => {
    const main = path.join(root, 'main-wt')
    git(repo, 'worktree', 'add', '-q', '--detach', main)
    setTask({ repos: [{ ...task.repos[0]!, worktreePath: main, branch: null }] })
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: 'detached-head' })
    git(main, 'checkout', '-q', '-b', 'main2')
    git(main, 'branch', '-q', '-m', 'main2', 'main-copy')
    setTask({ repos: [{ ...task.repos[0]!, worktreePath: worktree, branch: 'antumi/abc' }] })

    const noAuth = new PullRequestService({ get: () => task }, { status: async () => ({ git: true, directory: worktree, branch: 'antumi/abc', head: SHA, upstream: null, ahead: 1, behind: 0, changes: 0, branches: [], remotes: ['origin'], blocker: null, operation: null, conflicts: [] }), execute: async () => ({ state: 'done' }) }, store, new GitHubClient({ credentialsFor: () => [] }, { ghAccounts: async () => [], fetch: async () => { throw new Error('offline') } }))
    expect((await noAuth.check(task.id))[0]).toMatchObject({ blocker: 'auth', needsPush: true })
  })

  it('offers the default branch when the start branch is not on the remote', async () => {
    setTask({ repos: [{ ...task.repos[0]!, start: { ref: 'antumi/dep', commit: task.repos[0]!.start!.commit, note: null, at: 0 } }] })
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: 'base-missing', base: 'antumi/dep', baseFallback: 'main' })
    git(repo, 'branch', '-q', 'antumi/dep', 'main')
    git(repo, 'push', '-q', 'origin', 'antumi/dep')
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: null, base: 'antumi/dep', baseFallback: null })
  })

  it('takes the base from the project config over the start', async () => {
    mkdirSync(path.join(repo, '.antumi'))
    writeFileSync(path.join(repo, '.antumi', 'project.json'), JSON.stringify({ pullRequest: { base: 'develop' } }))
    git(repo, 'branch', '-q', 'develop', 'main')
    git(repo, 'push', '-q', 'origin', 'develop')
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: null, base: 'develop' })
  })

  it('finds a pull request the agent opened itself when the task changes, now and then', async () => {
    const lookups = () => calls.filter((call) => call.path.startsWith('/repos/flyhero/antumi/pulls?')).length
    reply = (call) => Response.json(call.path.startsWith('/repos/flyhero/antumi/pulls?') ? [pull({ number: 11 })] : pull())
    service.taskChanged(task)
    await vi.waitFor(() => expect(store.get(task.id, repo)?.number).toBe(11))
    expect(changed).toHaveBeenCalledWith(task.id, [expect.objectContaining({ number: 11 })])
    // Linked now: nothing more to find.
    now += 10 * 60_000
    service.taskChanged(task)
    expect(lookups()).toBe(1)
  })

  it('asks the host at most every two minutes per task, and only for a task at work', async () => {
    const lookups = () => calls.filter((call) => call.path.startsWith('/repos/flyhero/antumi/pulls?')).length
    service.taskChanged(task)
    await vi.waitFor(() => expect(lookups()).toBe(1))
    service.taskChanged(task)
    now += 60_000
    service.taskChanged(task)
    expect(lookups()).toBe(1)
    now += 61_000
    service.taskChanged(task)
    await vi.waitFor(() => expect(lookups()).toBe(2))
    now += 10 * 60_000
    service.taskChanged(Task.parse({ ...task, status: 'done' }))
    service.taskChanged(Task.parse({ ...task, status: 'pending' }))
    service.taskChanged(Task.parse({ ...task, repos: [{ ...task.repos[0]!, branch: null }] }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(lookups()).toBe(2)
  })

  it('recognizes a pull request opened elsewhere for the branch and keeps it', async () => {
    reply = (call) => Response.json(call.path.startsWith('/repos/flyhero/antumi/pulls?') ? [pull({ number: 3, state: 'closed' }), pull({ number: 5, state: 'closed', merged_at: '2026-11-07T11:00:00Z' }), pull({ number: 7 })] : pull())
    const [result] = await service.check(task.id)
    expect(result).toMatchObject({ blocker: 'existing-pr', existing: expect.objectContaining({ number: 7, status: expect.objectContaining({ state: 'open' }) }) })
    expect(store.get(task.id, repo)?.number).toBe(7)
    expect(changed).toHaveBeenCalledWith(task.id, [expect.objectContaining({ number: 7 })])
    expect(service.list(task.id).map((link) => link.number)).toEqual([7])

    reply = (call) => Response.json(call.path.startsWith('/repos/flyhero/antumi/pulls?') ? [pull({ number: 5, state: 'closed', merged_at: '2026-11-07T11:00:00Z' })] : pull())
    service.unlink(task.id, repo)
    expect(store.suppressed(task.id, repo)).toEqual([7])
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: 'existing-pr', existing: expect.objectContaining({ number: 5, status: expect.objectContaining({ state: 'merged' }) }) })
  })

  it('pushes the branch, then opens the pull request, and refuses a branch that moved', async () => {
    reply = (call) => call.method === 'POST' ? Response.json(pull({ number: 9, html_url: 'https://github.com/flyhero/antumi/pull/9', draft: false, head: { sha: git(worktree, 'rev-parse', 'HEAD'), ref: 'antumi/abc', repo: { owner: { login: 'flyhero' } } } })) : Response.json([])
    await expect(service.create({ taskId: task.id, repoPath: repo, base: 'main', title: 'Add PRs', body: 'Why.', draft: false, from: 'antumi/other' })).rejects.toMatchObject({ reason: 'git-branch-changed' })
    const link = await service.create({ taskId: task.id, repoPath: repo, base: 'main', title: 'Add PRs', body: 'Why.', draft: false, from: 'antumi/abc' })
    expect(git(remote, 'rev-parse', 'refs/heads/antumi/abc')).toBe(git(worktree, 'rev-parse', 'HEAD'))
    expect(git(worktree, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/antumi/abc')
    expect(calls.find((call) => call.method === 'POST')).toMatchObject({ path: '/repos/flyhero/antumi/pulls', body: { title: 'Add PRs', body: 'Why.', head: 'antumi/abc', base: 'main', draft: false } })
    expect(link).toMatchObject({ number: 9, url: 'https://github.com/flyhero/antumi/pull/9', headBranch: 'antumi/abc', base: 'main', fetchedAt: now, status: expect.objectContaining({ state: 'open', draft: false }) })
    expect(store.get(task.id, repo)?.number).toBe(9)
    expect((await service.check(task.id))[0]).toMatchObject({ blocker: 'existing-pr', existing: expect.objectContaining({ number: 9 }) })
  })

  it('knows the project by its worktree, as an agent names the folder it works in', async () => {
    expect((await service.check(task.id, worktree))[0]?.repoPath).toBe(repo)
    // The real path, as the agent sees it, of a worktree core knows by another.
    const linked = path.join(root, 'link-to-wt')
    symlinkSync(worktree, linked)
    task = Task.parse({ ...task, repos: [{ ...task.repos[0]!, worktreePath: linked }] })
    expect((await service.check(task.id, worktree))[0]?.repoPath).toBe(repo)
    await expect(service.check(task.id, path.join(root, 'elsewhere'))).rejects.toMatchObject({ reason: 'repo-not-found' })
  })

  it('pushes for the agent that asked from within its turn, not for anyone else', async () => {
    reply = (call) => call.method === 'POST' ? Response.json(pull({ number: 9 })) : Response.json([])
    const execute = vi.spyOn(GitService.prototype, 'execute')
    await service.create({ taskId: task.id, repoPath: repo, base: 'main', title: 'T', body: '', draft: false, from: 'antumi/abc' }, { byAgent: true })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task' }), { kind: 'push', from: 'antumi/abc' }, { ownTurn: true })
    execute.mockRestore()
  })

  it('takes the pull request GitHub says already exists rather than failing', async () => {
    let listed = false
    reply = (call) => {
      if (call.method === 'POST') return new Response(JSON.stringify({ message: 'A pull request already exists for flyhero:antumi/abc.' }), { status: 422 })
      if (call.path.startsWith('/repos/flyhero/antumi/pulls?')) { const found = listed; listed = true; return Response.json(found ? [pull({ number: 4 })] : []) }
      return Response.json(pull())
    }
    const link = await service.create({ taskId: task.id, repoPath: repo, base: 'main', title: 'Add PRs', body: '', draft: true, from: 'antumi/abc' })
    expect(link.number).toBe(4)
  })

  it('refreshes what the host says, keeping the old status when it fails', async () => {
    store.put({ taskId: task.id, repoPath: repo, repo: { host: 'github', owner: 'flyhero', name: 'antumi' }, number: 7, url: 'https://github.com/flyhero/antumi/pull/7', headBranch: 'antumi/abc', base: 'main', status: null, problem: null, fetchedAt: null, refreshing: false })
    reply = (call) => {
      if (call.path.endsWith('/pulls/7')) return Response.json(pull({ mergeable: true }))
      if (call.path.includes('/check-runs')) return Response.json({ check_runs: [{ id: 1, name: 'test', status: 'completed', conclusion: 'failure', html_url: null, completed_at: null }] })
      if (call.path.includes('/status')) return Response.json({ statuses: [] })
      if (call.path.includes('/reviews')) return Response.json([{ id: 2, user: { login: 'ann' }, state: 'APPROVED', body: '', submitted_at: '2026-11-07T10:00:00Z' }])
      return Response.json([])
    }
    const [link] = await service.refresh(task.id)
    expect(link).toMatchObject({ fetchedAt: now, problem: null, refreshing: false, status: expect.objectContaining({ mergeable: 'mergeable', checks: [expect.objectContaining({ state: 'failure' })], reviews: [expect.objectContaining({ state: 'approved' })] }) })
    expect(changed).toHaveBeenLastCalledWith(task.id, [expect.objectContaining({ refreshing: false, fetchedAt: now })])
    const before = calls.length
    await service.refresh(task.id)
    expect(calls).toHaveLength(before)
    now += 60_000
    reply = () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
    const [again] = await service.refresh(task.id)
    expect(again).toMatchObject({ problem: { code: 'auth-failed' }, status: expect.objectContaining({ mergeable: 'mergeable' }), fetchedAt: now - 60_000 })
  })

  it('shares a refresh in flight', async () => {
    store.put({ taskId: task.id, repoPath: repo, repo: { host: 'github', owner: 'flyhero', name: 'antumi' }, number: 7, url: '', headBranch: 'antumi/abc', base: 'main', status: null, problem: null, fetchedAt: null, refreshing: false } satisfies PullRequestLink)
    reply = (call) => Response.json(call.path.endsWith('/pulls/7') ? pull() : call.path.includes('/check-runs') ? { check_runs: [] } : call.path.includes('/status') ? { statuses: [] } : [])
    await Promise.all([service.refresh(task.id, undefined, true), service.refresh(task.id, undefined, true)])
    expect(calls.filter((call) => call.path.endsWith('/pulls/7'))).toHaveLength(1)
  })
})

describe('baseOfStart', () => {
  it('names the branch the task started from as the host does', () => {
    expect(baseOfStart({ ref: 'origin/main', commit: SHA, note: null, at: 0 })).toBe('main')
    expect(baseOfStart({ ref: 'origin/main', commit: SHA, note: null, at: 0 }, 'upstream')).toBe('origin/main')
    expect(baseOfStart({ ref: 'origin/release/2.4', commit: SHA, note: null, at: 0 })).toBe('release/2.4')
    expect(baseOfStart({ ref: 'antumi/dep-branch', commit: SHA, note: null, at: 0 })).toBe('antumi/dep-branch')
    expect(baseOfStart({ ref: 'abc1234', commit: SHA, note: null, at: 0 })).toBeNull()
    expect(baseOfStart({ ref: 'HEAD', commit: SHA, note: null, at: 0 })).toBeNull()
    expect(baseOfStart(null)).toBeNull()
  })
})
