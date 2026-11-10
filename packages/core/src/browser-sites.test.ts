import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BrowserSiteStore } from './browser-sites'
import { TaskStore } from './task-store'

describe('BrowserSiteStore', () => {
  let root: string
  let tasks: TaskStore
  let clock: number
  let store: BrowserSiteStore

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-browser-sites-'))
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    clock = 1000
    store = new BrowserSiteStore(database, () => clock)
  })

  afterEach(() => {
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('allows a site by its exact host until it is taken back', () => {
    store.allow('www.zhihu.com')
    expect(store.allows('www.zhihu.com')).toBe(true)
    expect(store.allows('zhuanlan.zhihu.com')).toBe(false)
    expect(store.allows('zhihu.com')).toBe(false)
    store.forget('www.zhihu.com')
    expect(store.allows('www.zhihu.com')).toBe(false)
  })

  it('lists the latest first and keeps when a site was first allowed', () => {
    store.allow('a.test.example')
    clock = 2000
    store.allow('b.example')
    clock = 3000
    store.allow('a.test.example')
    expect(store.list()).toEqual([{ host: 'b.example', allowedAt: 2000 }, { host: 'a.test.example', allowedAt: 1000 }])
  })
})
