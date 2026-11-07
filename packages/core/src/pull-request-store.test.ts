import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PullRequestLink } from '@antumi/protocol'
import { PullRequestStore } from './pull-request-store'
import { TaskStore } from './task-store'

const link = (taskId: string, repoPath: string, number: number, state: 'open' | 'merged' | null = 'open'): PullRequestLink => ({
  taskId, repoPath, repo: { host: 'github', owner: 'flyhero', name: 'antumi' }, number, url: `https://github.com/flyhero/antumi/pull/${number}`,
  headBranch: 'antumi/abc', base: 'main', problem: null, fetchedAt: null, refreshing: false,
  status: state === null ? null : { state, draft: false, title: 'T', headSha: 'a'.repeat(40), base: 'main', mergeable: 'unknown', checks: [], reviews: [], comments: [], mergedAt: null, updatedAt: 0 }
})

describe('PullRequestStore', () => {
  let dir: string
  let tasks: TaskStore
  let store: PullRequestStore
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-pull-requests-'))
    const file = path.join(dir, 'antumi.db')
    tasks = new TaskStore(file)
    store = new PullRequestStore(file)
  })
  afterEach(() => { store.close(); tasks.close(); rmSync(dir, { recursive: true, force: true }) })

  it('keeps one link per task and repo, replaced on put', () => {
    const task = tasks.create('A')
    store.put(link(task.id, '/a', 1))
    store.put(link(task.id, '/b', 2))
    store.put(link(task.id, '/a', 3, 'merged'))
    expect(store.list(task.id).map((entry) => [entry.repoPath, entry.number])).toEqual([['/a', 3], ['/b', 2]])
    expect(store.get(task.id, '/a')?.status?.state).toBe('merged')
    expect(store.get(task.id, '/c')).toBeNull()
  })

  it('lists the links still open, or not yet fetched, across tasks', () => {
    const a = tasks.create('A')
    const b = tasks.create('B')
    store.put(link(a.id, '/a', 1, 'open'))
    store.put(link(a.id, '/b', 2, 'merged'))
    store.put(link(b.id, '/a', 3, null))
    expect(store.open().map((entry) => entry.number).sort()).toEqual([1, 3])
  })

  it('unlinking forgets the link and remembers its number', () => {
    const task = tasks.create('A')
    store.put(link(task.id, '/a', 1))
    store.unlink(task.id, '/a')
    expect(store.get(task.id, '/a')).toBeNull()
    expect(store.list(task.id)).toEqual([])
    expect(store.suppressed(task.id, '/a')).toEqual([1])
    store.put(link(task.id, '/a', 2))
    store.unlink(task.id, '/a')
    expect(store.suppressed(task.id, '/a')).toEqual([1, 2])
    store.unlink(task.id, '/none')
    expect(store.suppressed(task.id, '/none')).toEqual([])
  })

  it('goes with its task', () => {
    const task = tasks.create('A')
    store.put(link(task.id, '/a', 1))
    tasks.delete(task.id)
    expect(store.list(task.id)).toEqual([])
    expect(store.suppressed(task.id, '/a')).toEqual([])
  })
})
