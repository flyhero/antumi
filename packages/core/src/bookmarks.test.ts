import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_BOOKMARKS, type Bookmark } from '@antumi/protocol'
import { BookmarkStore } from './bookmarks'
import { TaskStore } from './task-store'

describe('BookmarkStore', () => {
  let root: string
  let database: string
  let tasks: TaskStore
  let emitted: Bookmark[][]
  let clock: number
  let store: BookmarkStore

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-bookmarks-'))
    database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    emitted = []
    clock = 1000
    store = new BookmarkStore(database, (list) => emitted.push(list), () => clock++)
  })

  afterEach(() => {
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('adds bookmarks oldest first and tells every client', () => {
    const admin = store.add({ title: '后台', url: 'https://admin.example.com/', folder: null })
    store.add({ title: '', url: 'https://docs.example.com/', folder: '书签栏 / 工作' })

    expect(admin).toMatchObject({ title: '后台', url: 'https://admin.example.com/', folder: null, createdAt: 1000 })
    expect(store.list().map((each) => each.url)).toEqual(['https://admin.example.com/', 'https://docs.example.com/'])
    expect(emitted).toHaveLength(2)
    expect(emitted.at(-1)).toEqual(store.list())
  })

  it('keeps one bookmark per address', () => {
    const first = store.add({ title: 'A', url: 'https://a.example.com/', folder: null })
    const again = store.add({ title: 'A again', url: 'https://a.example.com/', folder: null })

    expect(again).toEqual(first)
    expect(store.list()).toHaveLength(1)
    expect(emitted).toHaveLength(1)
  })

  it('imports what is new in one change, skipping what is kept already', () => {
    store.add({ title: 'A', url: 'https://a.example.com/', folder: null })
    emitted = []

    const result = store.import([
      { title: 'A', url: 'https://a.example.com/', folder: 'Bar' },
      { title: 'B', url: 'https://b.example.com/', folder: 'Bar' },
      { title: 'B twice', url: 'https://b.example.com/', folder: 'Other' }
    ])

    expect(result).toEqual({ added: 1, skipped: 2 })
    expect(store.list().map((each) => each.title)).toEqual(['A', 'B'])
    expect(emitted).toHaveLength(1)
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: MAX_BOOKMARKS + 3 }, (_, index) => ({ title: `${index}`, url: `https://example.com/${index}`, folder: null }))

    expect(store.import(many)).toEqual({ added: MAX_BOOKMARKS, skipped: 3 })
    expect(() => store.add({ title: 'one more', url: 'https://more.example.com/', folder: null })).toThrow(expect.objectContaining({ reason: 'bookmarks_full' }))
  })

  it('deletes, and deleting again changes nothing', () => {
    const kept = store.add({ title: 'A', url: 'https://a.example.com/', folder: null })
    store.delete(kept.id)
    store.delete(kept.id)

    expect(store.list()).toEqual([])
    expect(emitted).toHaveLength(2)
  })
})
