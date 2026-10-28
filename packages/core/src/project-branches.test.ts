import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Conversation } from '@antumi/protocol'
import { branchHolders, createProjectBranch, projectBranches, switchProjectBranch } from './project-branches'

describe('project branches', () => {
  let root: string
  let app: string
  const git = (dir: string, ...args: string[]) =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim()
  const current = () => git(app, 'symbolic-ref', '--short', 'HEAD')

  beforeEach(() => {
    // As git names folders: macOS's temporary one is behind a symlink.
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-branches-')))
    const origin = path.join(root, 'origin.git')
    git(root, 'init', '-q', '--bare', '-b', 'main', origin)
    const seed = path.join(root, 'seed')
    git(root, 'init', '-q', '-b', 'main', seed)
    writeFileSync(path.join(seed, 'a.txt'), 'a\n')
    git(seed, 'add', '.')
    git(seed, 'commit', '-q', '-m', 'init')
    git(seed, 'push', '-q', origin, 'main', 'main:release')
    app = path.join(root, 'app')
    git(root, 'clone', '-q', origin, app)
    git(app, 'branch', 'feature')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('lists local branches, then remote ones, and those another worktree holds', async () => {
    git(app, 'worktree', 'add', '-q', '-b', 'antumi/aaaa-task', path.join(root, 'task-wt'))
    const found = await projectBranches(app)
    expect(found).toMatchObject({ git: true, branch: 'main', changes: 0 })
    expect(found.refs.slice(0, 3).sort()).toEqual(['refs/heads/antumi/aaaa-task', 'refs/heads/feature', 'refs/heads/main'])
    expect(found.refs.slice(3).sort()).toEqual(['refs/remotes/origin/main', 'refs/remotes/origin/release'])
    expect(found.elsewhere).toEqual({ 'refs/heads/antumi/aaaa-task': expect.stringContaining('task-wt') })
    expect(found.main).toBe(app)
    expect(await projectBranches(root)).toEqual({ git: false, branch: null, changes: 0, refs: [], elsewhere: {}, main: null })
  })

  it('names the repo\'s own folder from a worktree, which holds the branch checked out there', async () => {
    const worktree = path.join(root, 'task-wt')
    git(app, 'worktree', 'add', '-q', '-b', 'antumi/aaaa-task', worktree)
    const found = await projectBranches(worktree)
    expect(found.main).toBe(app)
    expect(found.elsewhere).toEqual({ 'refs/heads/main': app })
  })

  it('switches to a local branch, and to a remote one through a local branch tracking it', async () => {
    expect(await switchProjectBranch(app, 'refs/heads/feature')).toBe('feature')
    expect(current()).toBe('feature')
    expect(await switchProjectBranch(app, 'refs/remotes/origin/release')).toBe('release')
    expect(git(app, 'rev-parse', '--abbrev-ref', 'release@{upstream}')).toBe('origin/release')
    // A remote branch whose local one exists goes to that one.
    expect(await switchProjectBranch(app, 'refs/remotes/origin/main')).toBe('main')
    expect(current()).toBe('main')
  })

  it('refuses a switch over uncommitted changes, but lets untracked files come along', async () => {
    writeFileSync(path.join(app, 'a.txt'), 'changed\n')
    await expect(switchProjectBranch(app, 'refs/heads/feature')).rejects.toMatchObject({ reason: 'uncommitted-changes' })
    expect(current()).toBe('main')
    git(app, 'checkout', '--', 'a.txt')
    writeFileSync(path.join(app, 'notes.md'), 'mine\n')
    expect(await switchProjectBranch(app, 'refs/heads/feature')).toBe('feature')
  })

  it('refuses a branch another worktree holds, one that is not there, and anything not a branch', async () => {
    git(app, 'worktree', 'add', '-q', '-b', 'antumi/aaaa-task', path.join(root, 'task-wt'))
    await expect(switchProjectBranch(app, 'refs/heads/antumi/aaaa-task')).rejects.toMatchObject({ reason: 'branch-elsewhere' })
    await expect(switchProjectBranch(app, 'refs/heads/nope')).rejects.toMatchObject({ reason: 'branch-not-found' })
    await expect(switchProjectBranch(app, 'HEAD')).rejects.toMatchObject({ reason: 'branch-not-found' })
    expect(current()).toBe('main')
  })

  it('makes a branch at HEAD, taking uncommitted changes along, and refuses bad or taken names', async () => {
    writeFileSync(path.join(app, 'a.txt'), 'changed\n')
    expect(await createProjectBranch(app, 'fix/login')).toBe('fix/login')
    expect(current()).toBe('fix/login')
    expect(git(app, 'status', '--porcelain')).toBe('M a.txt')
    await expect(createProjectBranch(app, 'feature')).rejects.toMatchObject({ reason: 'branch-name-taken' })
    for (const name of ['bad name', '-x', 'a..b']) await expect(createProjectBranch(app, name)).rejects.toMatchObject({ reason: 'invalid-branch-name' })
  })

  it('says who holds a branch: the repo\'s folder, the conversation whose worktree it is, or something else', () => {
    const at = (id: string, folder: string, updatedAt: number, extra: Partial<Conversation> = {}) => Conversation.parse({
      id, title: `conversation ${id.slice(0, 4)}`, titleLocked: false, agent: 'claude', workspacePath: folder, projectPaths: [folder],
      managedWorkspace: true, sessionId: null, createdAt: 0, updatedAt, ...extra
    })
    const made = '/home/u/.antumi/worktrees/c24ff62b/menu-service'
    const shared = '/home/u/.antumi/worktrees/c8471a20/menu-service'
    const conversations = [
      at('c24ff62b-0000-4000-8000-000000000000', made, 1, { archivedAt: 5 }),
      at('d7142a6f-0000-4000-8000-000000000000', shared, 9),
      at('c8471a20-0000-4000-8000-000000000000', shared, 2)
    ]
    expect(branchHolders({
      'refs/heads/main': '/home/u/menu-service',
      'refs/heads/heic': made,
      'refs/heads/fix': shared,
      'refs/heads/release': '/home/u/menu-service/.claude/worktrees/resolve'
    }, '/home/u/menu-service', conversations)).toEqual({
      'refs/heads/main': { kind: 'main' },
      'refs/heads/heic': { kind: 'conversation', conversationId: conversations[0]!.id, title: 'conversation c24f', archived: true },
      // The one that made the worktree, though another sharing it was active since.
      'refs/heads/fix': { kind: 'conversation', conversationId: conversations[2]!.id, title: 'conversation c847', archived: false },
      'refs/heads/release': { kind: 'other' }
    })
  })
})
