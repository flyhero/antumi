import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, realpathSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Conversation, Task, type GitTarget } from '@antumi/protocol'
import { GitService } from './git-service'
import { committedDiff, filesBetween } from './git-repository'
import { GitFavoriteStore } from './git-favorite-store'
import { TaskStore } from './task-store'

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
describe('Git management', () => {
  let root: string
  let repo: string
  let remote: string
  let service: GitService
  let store: TaskStore
  let favorites: GitFavoriteStore
  let target: GitTarget
  let conversations: Conversation[]
  let tasks: Task[]
  let launching: boolean
  const record = vi.fn(async () => {})
  const commit = (name: string, content: string, message = name) => { writeFileSync(path.join(repo, name), content); git(repo, 'add', '--', name); git(repo, 'commit', '-q', '-m', message); return git(repo, 'rev-parse', 'HEAD') }
  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-git-management-')))
    repo = path.join(root, 'repo'); remote = path.join(root, 'origin.git')
    git(root, 'init', '-q', '--bare', '-b', 'main', remote)
    git(root, 'init', '-q', '-b', 'main', repo)
    git(repo, 'config', 'user.name', 'Antumi Test'); git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'remote', 'add', 'origin', remote)
    commit('file.txt', 'base\n', 'initial')
    git(repo, 'push', '-q', '-u', 'origin', 'main')
    conversations = [Conversation.parse({ id: randomUUID(), title: 'test', titleLocked: false, agent: 'claude', workspacePath: repo, projectPaths: [repo], managedWorkspace: false, sessionId: null, createdAt: 0, updatedAt: 0 })]
    tasks = []; launching = false; record.mockClear()
    const database = path.join(root, 'antumi.db')
    store = new TaskStore(database)
    favorites = new GitFavoriteStore(database)
    service = new GitService({ get: (id) => { const task = tasks.find((task) => task.id === id); if (!task) throw new Error('task missing'); return task }, list: () => tasks, isLaunching: () => launching }, {
      get: (id) => { const conversation = conversations.find((conversation) => conversation.id === id); if (!conversation) throw new Error('conversation missing'); return conversation }, listAll: () => conversations, recordGitChange: record, isGitPending: () => false
    }, favorites)
    target = { kind: 'conversation', id: conversations[0]!.id, project: repo }
  })
  afterEach(() => { favorites.close(); store.close(); rmSync(root, { recursive: true, force: true }) })

  it('shares favorites across worktrees, keeping local and remote refs and independent clones separate', async () => {
    const worktree = path.join(root, 'worktree')
    git(repo, 'worktree', 'add', '-q', '-b', 'feature/topic', worktree)
    const other = Conversation.parse({ ...conversations[0], id: randomUUID(), workspacePath: worktree, projectPaths: [worktree] })
    conversations.push(other)
    const otherTarget: GitTarget = { kind: 'conversation', id: other.id, project: worktree }
    await service.favorite(target, 'refs/heads/feature/topic', true)
    await service.favorite(target, 'refs/heads/main', false)
    await service.favorite(target, 'refs/remotes/origin/main', true)
    const branches = (await service.status(otherTarget)).branches
    expect(branches.find((branch) => branch.ref === 'refs/heads/feature/topic')?.favorite).toBe(true)
    expect(branches.find((branch) => branch.ref === 'refs/heads/main')?.favorite).toBe(false)
    expect(branches.find((branch) => branch.ref === 'refs/remotes/origin/main')?.favorite).toBe(true)
    const clone = path.join(root, 'clone')
    git(root, 'clone', '-q', repo, clone)
    conversations[0]!.projectPaths.push(clone)
    const cloned = (await service.status({ ...target, project: clone })).branches
    expect(cloned.find((branch) => branch.ref === 'refs/heads/main')?.favorite).toBe(true)
    expect(cloned.find((branch) => branch.ref === 'refs/remotes/origin/main')?.favorite).toBe(false)
    expect(record).not.toHaveBeenCalled()
  })

  it('can favorite while an agent runs without changing Git, and rejects missing or non-branch refs', async () => {
    conversations[0]!.sessionId = 'agent'; conversations[0]!.chat = { turn: 'running' }
    const before = git(repo, 'show-ref')
    await service.favorite(target, 'refs/remotes/origin/main', true)
    await service.favorite(target, 'refs/remotes/origin/main', true)
    expect((await service.status(target)).branches.find((branch) => branch.ref === 'refs/remotes/origin/main')?.favorite).toBe(true)
    expect(git(repo, 'show-ref')).toBe(before)
    await expect(service.favorite(target, 'refs/heads/missing', true)).rejects.toMatchObject({ reason: 'branch-not-found' })
    await expect(service.favorite(target, 'HEAD', true)).rejects.toMatchObject({ reason: 'branch-not-found' })
    await expect(service.favorite({ ...target, project: root }, 'refs/heads/main', true)).rejects.toMatchObject({ reason: 'repo-not-found' })
  })

  it('keeps a favorite on rename and clears it on deletion', async () => {
    git(repo, 'branch', 'feature')
    await service.favorite(target, 'refs/heads/feature', true)
    await service.execute(target, { kind: 'rename', ref: 'refs/heads/feature', name: 'renamed' })
    expect((await service.status(target)).branches.find((branch) => branch.name === 'renamed')?.favorite).toBe(true)
    await service.execute(target, { kind: 'delete', ref: 'refs/heads/renamed' })
    git(repo, 'branch', 'renamed')
    git(repo, 'branch', 'feature')
    const branches = (await service.status(target)).branches
    expect(branches.find((branch) => branch.name === 'renamed')?.favorite).toBe(false)
    expect(branches.find((branch) => branch.name === 'feature')?.favorite).toBe(false)
  })

  it('lists the local and remote branches holding a commit, leaving out a remote HEAD', async () => {
    const base = git(repo, 'rev-parse', 'HEAD')
    git(repo, 'switch', '-q', '-c', 'feature')
    const ahead = commit('feature.txt', 'feature\n', 'feature work')
    git(repo, 'push', '-q', 'origin', 'feature')
    git(repo, 'remote', 'set-head', 'origin', 'main')
    const local = (name: string) => ({ name, remote: false })
    const remote = (name: string) => ({ name, remote: true })
    expect(await service.containing(target, base)).toEqual([local('feature'), local('main'), remote('origin/feature'), remote('origin/main')])
    expect(await service.containing(target, ahead)).toEqual([local('feature'), remote('origin/feature')])
  })

  it('holds a repository lock across preparation or cleanup and blocks agent starts in subdirectories', async () => {
    const child = path.join(repo, 'child'); mkdirSync(child)
    let release = () => {}
    let started = () => {}
    const pending = new Promise<void>((resolve) => { release = resolve })
    const ready = new Promise<void>((resolve) => { started = resolve })
    const operation = service.withRepositories([repo], async () => { started(); await pending; return 'done' })
    await ready
    try {
      await expect(service.execute(target, { kind: 'fetch' })).rejects.toMatchObject({ reason: 'git-busy' })
      await expect(service.guardAgent([child])).rejects.toMatchObject({ reason: 'git-busy' })
      await expect(service.withRepositories([child], async () => {})).rejects.toMatchObject({ reason: 'git-busy' })
    } finally { release(); await operation }
    await expect(service.guardAgent([child])).resolves.toBeUndefined()
    await expect(service.execute(target, { kind: 'fetch' })).resolves.toEqual({ state: 'done' })
  })

  it('commits and pushes in one checkout while an agent works in another worktree of the repository', async () => {
    const worktree = path.join(root, 'worktree')
    git(repo, 'worktree', 'add', '-q', '-b', 'feature', worktree)
    const other = Conversation.parse({ ...conversations[0], id: randomUUID(), workspacePath: worktree, projectPaths: [worktree] })
    conversations.push(other)
    conversations[0]!.sessionId = 'agent'; conversations[0]!.chat = { turn: 'running' }
    const here: GitTarget = { kind: 'conversation', id: other.id, project: worktree }
    expect((await service.status(here)).blocker).toBeNull()
    writeFileSync(path.join(worktree, 'feature.txt'), 'feature\n')
    expect(await service.execute(here, { kind: 'commit', message: 'feature', push: true })).toMatchObject({ state: 'done' })
    expect(git(remote, 'log', '-1', '--format=%s', 'feature')).toBe('feature')
    await expect(service.withRepositories([worktree], async () => 'ok')).resolves.toBe('ok')
    // The checkout the agent works in stays held, from wherever in it git is asked.
    expect((await service.status(target)).blocker).not.toBeNull()
    await expect(service.execute(target, { kind: 'fetch' })).rejects.toMatchObject({ reason: 'chat-busy' })
    const child = path.join(repo, 'child'); mkdirSync(child)
    await expect(service.withRepositories([child], async () => {})).rejects.toMatchObject({ reason: 'chat-busy' })
  })

  it('removes a worktree while an agent works in another checkout of its repository, but not during a Git operation', async () => {
    const worktree = path.join(root, 'worktree')
    git(repo, 'worktree', 'add', '-q', '-b', 'antumi/done', worktree)
    conversations[0]!.sessionId = 'agent'; conversations[0]!.chat = { turn: 'running' }
    await service.withRepositoryLock([worktree], async () => { git(repo, 'worktree', 'remove', worktree) })
    expect(git(repo, 'worktree', 'list')).not.toContain(worktree)

    let release = () => {}
    let started = () => {}
    const pending = new Promise<void>((resolve) => { release = resolve })
    const ready = new Promise<void>((resolve) => { started = resolve })
    conversations[0]!.chat = { turn: 'idle' }
    const operation = service.withRepositories([repo], async () => { started(); await pending })
    await ready
    try {
      await expect(service.withRepositoryLock([repo], async () => {})).rejects.toMatchObject({ reason: 'git-busy' })
    } finally { release(); await operation }
  })

  it('lists upstreams and worktree holders and protects task branches even after cleanup', async () => {
    const worktree = path.join(root, 'worktree')
    git(repo, 'worktree', 'add', '-q', '-b', 'antumi/task', worktree)
    tasks.push(Task.parse({ id: 'task', title: 'task', details: '', status: 'done', repos: [{ path: repo, worktreePath: worktree, branch: 'antumi/task' }], dependsOn: [], agent: 'claude', createdAt: 0, updatedAt: 0 }))
    expect(await service.status(target)).toMatchObject({ branch: 'main', upstream: 'origin/main', changes: 0 })
    expect((await service.status(target)).branches.find((branch) => branch.name === 'antumi/task')).toMatchObject({ protected: true, worktree })
    await expect(service.execute(target, { kind: 'delete', ref: 'refs/heads/antumi/task' })).rejects.toMatchObject({ reason: 'git-protected' })
    git(repo, 'worktree', 'remove', worktree); tasks[0]!.repos[0]!.worktreePath = null
    await expect(service.execute(target, { kind: 'rename', ref: 'refs/heads/antumi/task', name: 'new' })).rejects.toMatchObject({ reason: 'git-protected' })
  })

  it('rejects foreign directories, busy or starting agents and task checkouts', async () => {
    await expect(service.status({ ...target, project: root })).rejects.toMatchObject({ reason: 'repo-not-found' })
    for (const turn of ['running', 'awaiting'] as const) {
      conversations[0]!.sessionId = 'agent'; conversations[0]!.chat = { turn }
      await expect(service.execute(target, { kind: 'fetch' })).rejects.toMatchObject({ reason: 'chat-busy' })
    }
    conversations[0]!.sessionId = null; conversations[0]!.starting = true
    await expect(service.execute(target, { kind: 'fetch' })).rejects.toMatchObject({ reason: 'chat-busy' })
    conversations[0]!.starting = false
    tasks.push(Task.parse({ id: 'task', title: '', details: '', status: 'running', repos: [{ path: repo, worktreePath: repo, branch: 'main' }], dependsOn: [], agent: 'claude', createdAt: 0, updatedAt: 0 }))
    const taskTarget: GitTarget = { kind: 'task', id: 'task', project: repo }
    await expect(service.execute(taskTarget, { kind: 'switch', ref: 'refs/remotes/origin/main' })).rejects.toMatchObject({ reason: 'task-conversation' })
    await expect(service.execute(taskTarget, { kind: 'detach', ref: 'HEAD' })).rejects.toMatchObject({ reason: 'task-conversation' })
    await service.execute(taskTarget, { kind: 'create', name: 'candidate', ref: 'HEAD', checkout: false })
    expect(git(repo, 'branch', '--show-current')).toBe('main')
    launching = true
    await expect(service.execute(target, { kind: 'fetch' })).rejects.toMatchObject({ reason: 'chat-busy' })
  })

  it('creates tracking branches, refuses name collisions and never overwrites work', async () => {
    await service.execute(target, { kind: 'create', name: 'feature', ref: 'refs/remotes/origin/main', checkout: true })
    expect(git(repo, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/main')
    expect(record).toHaveBeenCalledWith(target.id, repo, 'feature', true)
    await expect(service.execute(target, { kind: 'create', name: 'feature', ref: 'HEAD', checkout: false })).rejects.toMatchObject({ reason: 'git-operation-failed' })
    await expect(service.execute(target, { kind: 'create', name: '-bad', ref: 'HEAD', checkout: false })).rejects.toMatchObject({ reason: 'invalid-branch-name' })
    writeFileSync(path.join(repo, 'file.txt'), 'unsaved')
    await expect(service.execute(target, { kind: 'switch', ref: 'refs/heads/main' })).rejects.toMatchObject({ reason: 'uncommitted-changes' })
    expect(git(repo, 'diff')).toContain('unsaved')
  })

  it('tags a commit and checks one out detached, refusing bad names and unsaved work', async () => {
    const first = git(repo, 'rev-parse', 'HEAD')
    commit('next.txt', 'next\n')
    await service.execute(target, { kind: 'tag', name: 'v1.0', ref: first })
    expect(git(repo, 'rev-parse', 'v1.0^{commit}')).toBe(first)
    await expect(service.execute(target, { kind: 'tag', name: 'v1.0', ref: 'HEAD' })).rejects.toMatchObject({ reason: 'git-operation-failed' })
    for (const name of ['-f', 'bad name', 'a..b']) await expect(service.execute(target, { kind: 'tag', name, ref: 'HEAD' })).rejects.toMatchObject({ reason: 'invalid-tag-name' })
    await expect(service.execute(target, { kind: 'detach', ref: '--orphan' })).rejects.toMatchObject({ reason: 'branch-not-found' })
    writeFileSync(path.join(repo, 'file.txt'), 'unsaved')
    await expect(service.execute(target, { kind: 'detach', ref: first })).rejects.toMatchObject({ reason: 'uncommitted-changes' })
    git(repo, 'checkout', '--', 'file.txt')
    await service.execute(target, { kind: 'detach', ref: first })
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(first)
    expect(git(repo, 'branch', '--show-current')).toBe('')
    expect(record).toHaveBeenCalledWith(target.id, repo, git(repo, 'rev-parse', '--short', 'HEAD'), true)
  })

  it('safely deletes merged branches and remote branches but refuses current and unmerged ones', async () => {
    git(repo, 'branch', 'merged')
    await service.execute(target, { kind: 'rename', ref: 'refs/heads/merged', name: 'renamed' })
    await service.execute(target, { kind: 'delete', ref: 'refs/heads/renamed' })
    await expect(service.execute(target, { kind: 'delete', ref: 'refs/heads/main' })).rejects.toMatchObject({ reason: 'branch-elsewhere' })
    git(repo, 'switch', '-q', '-c', 'unique'); commit('unique.txt', 'unique\n'); git(repo, 'switch', '-q', 'main')
    await expect(service.execute(target, { kind: 'delete', ref: 'refs/heads/unique' })).rejects.toMatchObject({ reason: 'git-operation-failed' })
    git(repo, 'push', '-q', 'origin', 'main:release'); git(repo, 'fetch', '-q')
    await service.execute(target, { kind: 'delete', ref: 'refs/remotes/origin/release' })
    expect(git(repo, 'ls-remote', '--heads', 'origin', 'release')).toBe('')
  })

  it('handles root, rename, binary and unusual filenames in committed diffs', async () => {
    const initial = git(repo, 'rev-parse', 'HEAD')
    const detail = await service.detail(target, initial)
    expect(detail.parent).toBeNull(); expect(detail.files).toMatchObject([{ kind: 'added', path: 'file.txt', additions: 1 }])
    expect((await service.diff(target, null, initial, 'file.txt')).diff).toContain('+base')
    git(repo, 'mv', 'file.txt', 'with\tnewline\n.txt')
    writeFileSync(path.join(repo, 'binary.dat'), Buffer.from([0, 1, 2]))
    git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'rename and binary')
    const head = git(repo, 'rev-parse', 'HEAD')
    expect(await filesBetween(repo, initial, head)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'renamed', path: 'with\tnewline\n.txt', oldPath: 'file.txt' }), expect.objectContaining({ path: 'binary.dat', additions: null, deletions: null })
    ]))
    expect((await committedDiff(repo, initial, head, 'with\tnewline\n.txt')).diff).toContain('rename')
    await expect(service.diff(target, initial, head, '../outside')).rejects.toMatchObject({ reason: 'file-not-changed' })
    await expect(service.detail(target, '--all')).rejects.toMatchObject({ reason: 'branch-not-found' })
  })

  it('paginates on fixed tips while new commits arrive and searches across pages', async () => {
    for (let i = 0; i < 110; i++) git(repo, 'commit', '-q', '--allow-empty', '-m', `commit ${i}`)
    const first = await service.history(target, 'HEAD', 0, '')
    expect(first.commits).toHaveLength(100); expect(first.next).toBe(100)
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'new tip')
    const second = await service.history(target, 'HEAD', first.next!, '', first.tips)
    expect(second.commits).toHaveLength(11); expect(second.next).toBeNull()
    expect(new Set([...first.commits, ...second.commits].map((commit) => commit.sha)).size).toBe(111)
    expect((await service.history(target, 'HEAD', 0, 'commit 0')).commits).toHaveLength(1)
    expect((await service.history(target, 'HEAD', 0, 'Antumi Test')).commits).toHaveLength(100)
    // 110 commits, one git process each, take most of the default 5s on a busy machine.
  }, 20_000)

  it('compares divergence, fast-forwards pull and refuses a divergent pull', async () => {
    const peer = path.join(root, 'peer')
    git(root, 'clone', '-q', remote, peer); git(peer, 'config', 'user.name', 'Peer'); git(peer, 'config', 'user.email', 'peer@t')
    writeFileSync(path.join(peer, 'peer.txt'), 'peer'); git(peer, 'add', '.'); git(peer, 'commit', '-q', '-m', 'peer'); git(peer, 'push', '-q')
    await service.execute(target, { kind: 'pull' }); expect(git(repo, 'log', '-1', '--format=%s')).toBe('peer')
    commit('local.txt', 'local')
    writeFileSync(path.join(peer, 'peer.txt'), 'peer2'); git(peer, 'add', '.'); git(peer, 'commit', '-q', '-m', 'peer2'); git(peer, 'push', '-q')
    const before = git(repo, 'rev-parse', 'HEAD')
    await expect(service.execute(target, { kind: 'pull' })).rejects.toMatchObject({ reason: 'git-operation-failed' })
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(before)
    const comparison = await service.compare(target, 'refs/remotes/origin/main', false)
    expect(comparison).toMatchObject({ ahead: 1, behind: 1 }); expect(comparison.files.map((file) => file.path)).toEqual(['peer.txt'])
    expect((await service.compare(target, 'refs/remotes/origin/main', true)).files.map((file) => file.path)).toEqual(['local.txt', 'peer.txt'])
  })

  it('reads persisted merge conflicts and supports resolve, finish and abort', async () => {
    git(repo, 'switch', '-q', '-c', 'feature'); commit('file.txt', 'feature\n'); git(repo, 'switch', '-q', 'main'); commit('file.txt', 'main\n')
    expect(await service.execute(target, { kind: 'merge', ref: 'refs/heads/feature' })).toEqual({ state: 'conflicts' })
    expect(await service.status(target)).toMatchObject({ operation: 'merge', conflicts: ['file.txt'] })
    await expect(service.execute(target, { kind: 'continue' })).rejects.toMatchObject({ reason: 'git-conflicts' })
    await expect(service.execute(target, { kind: 'commit', message: 'wrong', push: false })).rejects.toMatchObject({ reason: 'git-in-progress' })
    await service.execute(target, { kind: 'abort' }); expect(await service.status(target)).toMatchObject({ operation: null, changes: 0 })
    await service.execute(target, { kind: 'merge', ref: 'refs/heads/feature' })
    writeFileSync(path.join(repo, 'file.txt'), 'resolved\n')
    await service.execute(target, { kind: 'resolve', file: 'file.txt' }); await service.execute(target, { kind: 'continue' })
    const detail = await service.detail(target, git(repo, 'rev-parse', 'HEAD'))
    expect(detail.commit.parents).toHaveLength(2)
    expect((await service.detail(target, detail.commit.sha, detail.commit.parents[1])).files).toMatchObject([{ path: 'file.txt' }])
    expect(await service.status(target)).toMatchObject({ operation: null, changes: 0 })
  })

  it('pushes new branches explicitly and retains a local commit if push fails', async () => {
    await service.execute(target, { kind: 'create', name: 'new', ref: 'HEAD', checkout: true })
    commit('new.txt', 'new')
    expect(await service.execute(target, { kind: 'push', remote: 'origin', name: 'new-remote' })).toMatchObject({ upstream: 'origin/new-remote' })
    writeFileSync(path.join(repo, 'new.txt'), 'changed')
    git(repo, 'remote', 'set-url', 'origin', path.join(root, 'missing'))
    await expect(service.execute(target, { kind: 'commit', message: 'keep me', push: true })).rejects.toMatchObject({ reason: 'git-push-after-commit-failed' })
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('keep me'); expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  describe('update', () => {
    // Someone else's clone, pushing to the shared remote.
    const pushElsewhere = (branch: string, name: string, content: string) => {
      const other = path.join(root, `other-${randomUUID()}`)
      git(root, 'clone', '-q', '-b', branch, remote, other)
      git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.com')
      writeFileSync(path.join(other, name), content); git(other, 'add', '--', name); git(other, 'commit', '-q', '-m', `remote ${name}`)
      git(other, 'push', '-q', 'origin', branch)
    }
    const main = 'refs/heads/main'

    it('says how far each local branch is from its upstream', async () => {
      pushElsewhere('main', 'remote.txt', 'remote\n')
      commit('local.txt', 'local\n')
      git(repo, 'fetch', '-q')
      const branch = (await service.status(target)).branches.find((entry) => entry.ref === main)
      expect(branch).toMatchObject({ ahead: 1, behind: 1 })
    })

    it('fast-forwards a branch not checked out without switching to it, and refuses one that diverged', async () => {
      git(repo, 'switch', '-q', '-c', 'feature')
      pushElsewhere('main', 'remote.txt', 'remote\n')
      expect(await service.execute(target, { kind: 'update', ref: main })).toMatchObject({ state: 'done', incoming: 1 })
      expect(git(repo, 'rev-parse', 'main')).toBe(git(repo, 'rev-parse', 'origin/main'))
      expect(git(repo, 'branch', '--show-current')).toBe('feature')
      git(repo, 'switch', '-q', 'main'); commit('local.txt', 'local\n'); git(repo, 'switch', '-q', 'feature')
      pushElsewhere('main', 'more.txt', 'more\n')
      const before = git(repo, 'rev-parse', 'main')
      await expect(service.execute(target, { kind: 'update', ref: main })).rejects.toMatchObject({ reason: 'git-update-diverged' })
      expect(git(repo, 'rev-parse', 'main')).toBe(before)
    })

    it('fast-forwards the branch checked out, putting uncommitted changes back', async () => {
      pushElsewhere('main', 'remote.txt', 'remote\n')
      writeFileSync(path.join(repo, 'file.txt'), 'unsaved\n'); writeFileSync(path.join(repo, 'new.txt'), 'untracked\n')
      expect(await service.execute(target, { kind: 'update', ref: main })).toMatchObject({ state: 'done', incoming: 1, stash: 'restored' })
      expect(git(repo, 'rev-parse', 'HEAD')).toBe(git(repo, 'rev-parse', 'origin/main'))
      expect(git(repo, 'diff', '--name-only')).toBe('file.txt')
      expect(git(repo, 'ls-files', '--others', '--exclude-standard')).toBe('new.txt')
      expect(git(repo, 'stash', 'list')).toBe('')
      expect(await service.execute(target, { kind: 'update', ref: main })).toMatchObject({ state: 'done', incoming: 0 })
    })

    it('asks how to take in a diverged upstream, then merges or rebases', async () => {
      pushElsewhere('main', 'remote.txt', 'remote\n')
      commit('local.txt', 'local\n')
      await expect(service.execute(target, { kind: 'update', ref: main })).rejects.toMatchObject({ reason: 'git-update-diverged' })
      git(repo, 'branch', 'saved')
      expect(await service.execute(target, { kind: 'update', ref: main, method: 'merge' })).toMatchObject({ state: 'done', incoming: 1 })
      expect(git(repo, 'log', '-1', '--format=%P').split(' ')).toHaveLength(2)
      expect(git(repo, 'log', '-1', '--format=%s')).toBe("Merge remote-tracking branch 'origin/main'")
      git(repo, 'reset', '-q', '--hard', 'saved')
      expect(await service.execute(target, { kind: 'update', ref: main, method: 'rebase' })).toMatchObject({ state: 'done', incoming: 1 })
      expect(git(repo, 'log', '--format=%s', '-3').split('\n')).toEqual(['local.txt', 'remote remote.txt', 'initial'])
    })

    it('stops a rebase on conflicts, carries it on once resolved, and only then puts the stash back', async () => {
      pushElsewhere('main', 'file.txt', 'remote\n')
      commit('file.txt', 'local\n')
      writeFileSync(path.join(repo, 'notes.txt'), 'unsaved\n')
      expect(await service.execute(target, { kind: 'update', ref: main, method: 'rebase' })).toMatchObject({ state: 'conflicts' })
      const stopped = await service.status(target)
      expect(stopped).toMatchObject({ operation: 'other', rebase: true, conflicts: ['file.txt'] })
      await expect(service.execute(target, { kind: 'fetch' })).rejects.toMatchObject({ reason: 'git-in-progress' })
      writeFileSync(path.join(repo, 'file.txt'), 'both\n')
      await service.execute(target, { kind: 'resolve', file: 'file.txt' })
      expect(await service.execute(target, { kind: 'continue' })).toMatchObject({ state: 'done', stash: 'restored' })
      expect(git(repo, 'branch', '--show-current')).toBe('main')
      expect(git(repo, 'log', '--format=%s', '-2').split('\n')).toEqual(['file.txt', 'remote file.txt'])
      expect(git(repo, 'status', '--porcelain')).toBe('?? notes.txt')
    })

    it('aborts a stopped rebase back to where the branch was, with its changes', async () => {
      pushElsewhere('main', 'file.txt', 'remote\n')
      const local = commit('file.txt', 'local\n')
      writeFileSync(path.join(repo, 'notes.txt'), 'unsaved\n')
      await service.execute(target, { kind: 'update', ref: main, method: 'rebase' })
      expect(await service.execute(target, { kind: 'abort' })).toMatchObject({ state: 'done', stash: 'restored' })
      expect(git(repo, 'rev-parse', 'HEAD')).toBe(local)
      expect(git(repo, 'status', '--porcelain')).toBe('?? notes.txt')
    })

    it('refuses a branch with no upstream', async () => {
      git(repo, 'branch', 'loose')
      await expect(service.execute(target, { kind: 'update', ref: 'refs/heads/loose' })).rejects.toMatchObject({ reason: 'git-no-upstream' })
    })
  })

  describe('push', () => {
    const upstreamOf = (branch: string) => git(repo, 'rev-parse', '--abbrev-ref', `${branch}@{upstream}`)

    it('lists what a first push sends, and makes the new remote branch its upstream', async () => {
      git(repo, 'switch', '-q', '-c', 'feature')
      commit('a.txt', 'a\n', 'first'); commit('b.txt', 'b\n', 'second')
      const outgoing = await service.outgoing(target, 'origin', 'feature')
      expect(outgoing).toMatchObject({ total: 2, isNew: true })
      expect(outgoing.commits.map((entry) => entry.subject)).toEqual(['second', 'first'])
      expect(await service.execute(target, { kind: 'push', remote: 'origin', name: 'feature', from: 'feature' })).toMatchObject({ state: 'done', upstream: 'origin/feature' })
      expect(upstreamOf('feature')).toBe('origin/feature')
      expect(await service.outgoing(target, 'origin', 'feature')).toMatchObject({ total: 0, isNew: false })
    })

    it('refuses a one-click push when the upstream has another name, and keeps the upstream on a push named elsewhere', async () => {
      git(repo, 'switch', '-q', '-c', 'feature', '--track', 'origin/main')
      commit('a.txt', 'a\n', 'feature work')
      await expect(service.execute(target, { kind: 'push' })).rejects.toMatchObject({ reason: 'git-push-name-mismatch' })
      writeFileSync(path.join(repo, 'b.txt'), 'b\n')
      await expect(service.execute(target, { kind: 'commit', message: 'more', push: true })).rejects.toMatchObject({ reason: 'git-push-after-commit-failed' })
      expect(git(remote, 'log', '-1', '--format=%s', 'main')).toBe('initial')
      expect((await service.outgoing(target, 'origin', 'main')).total).toBe(2)
      await service.execute(target, { kind: 'push', remote: 'origin', name: 'shared', from: 'feature' })
      expect(git(remote, 'log', '-1', '--format=%s', 'shared')).toBe('more')
      expect(upstreamOf('feature')).toBe('origin/main')
    })

    it('refuses a push from a dialog that saw another branch', async () => {
      git(repo, 'switch', '-q', '-c', 'feature')
      await expect(service.execute(target, { kind: 'push', remote: 'origin', name: 'main', from: 'main' })).rejects.toMatchObject({ reason: 'git-branch-changed' })
    })

    it('tells a push the remote rejected for commits the branch lacks from other failures', async () => {
      const other = path.join(root, 'other')
      git(root, 'clone', '-q', remote, other)
      git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.com')
      writeFileSync(path.join(other, 'remote.txt'), 'remote\n'); git(other, 'add', '--', 'remote.txt'); git(other, 'commit', '-q', '-m', 'remote'); git(other, 'push', '-q', 'origin', 'main')
      commit('local.txt', 'local\n')
      await expect(service.execute(target, { kind: 'push', remote: 'origin', name: 'main', from: 'main' })).rejects.toMatchObject({ reason: 'git-push-rejected' })
    })

    it('sets a branch to track a remote branch, or none', async () => {
      git(repo, 'switch', '-q', '-c', 'feature')
      git(repo, 'push', '-q', 'origin', 'feature')
      await service.execute(target, { kind: 'track', ref: 'refs/heads/feature', upstream: 'refs/remotes/origin/feature' })
      expect(upstreamOf('feature')).toBe('origin/feature')
      await service.execute(target, { kind: 'track', ref: 'refs/heads/feature', upstream: null })
      expect(() => upstreamOf('feature')).toThrow()
      await expect(service.execute(target, { kind: 'track', ref: 'refs/heads/feature', upstream: 'refs/remotes/origin/missing' })).rejects.toMatchObject({ reason: 'branch-not-found' })
    })
  })
})
