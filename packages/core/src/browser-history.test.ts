import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BROWSER_HISTORY_DAYS } from '@antumi/protocol'
import { BrowserHistoryStore } from './browser-history'
import { TaskStore } from './task-store'

const CONVERSATION = '6f1c2a4e-1b2c-4d3e-8f9a-0b1c2d3e4f5a'

type Tab = { id: string; url: string; title: string; loading: boolean; userOwned?: boolean; agentActing: boolean; userDriving: boolean }
function tab(id: string, url: string, title = '', state: Partial<Omit<Tab, 'id' | 'url' | 'title'>> = {}): Tab {
  return { id, url, title, loading: false, agentActing: false, userDriving: false, ...state }
}

describe('BrowserHistoryStore', () => {
  let root: string
  let database: string
  let tasks: TaskStore
  let emitted: number
  let clock: number
  let store: BrowserHistoryStore

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-browser-history-'))
    database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    emitted = 0
    clock = 1000
    store = new BrowserHistoryStore(database, () => emitted++, () => clock)
  })

  afterEach(() => {
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('counts a visit when a tab goes somewhere, and takes the title as it loads', () => {
    store.record(null, [tab('a', 'https://example.com/')])
    clock = 2000
    store.record(null, [tab('a', 'https://example.com/', 'Example')])
    expect(store.search('', false, 10)).toEqual([{ url: 'https://example.com/', conversationId: null, title: 'Example', visitedAt: 1000, visits: 1 }])
    clock = 3000
    store.record(null, [tab('a', 'https://example.com/next', 'Next')])
    clock = 4000
    store.record(null, [tab('a', 'https://example.com/', 'Example')])
    expect(store.search('', false, 10).map((entry) => [entry.url, entry.visits])).toEqual([['https://example.com/', 2], ['https://example.com/next', 1]])
    clock = 5000
    store.record(null, [tab('a', 'https://example.com/last', 'Last')])
    expect(store.search('', false, 10, 'frequent').map((entry) => entry.url)).toEqual(['https://example.com/', 'https://example.com/last', 'https://example.com/next'])
    expect(emitted).toBe(5)
  })

  it('takes a page\'s title only once it has loaded', () => {
    store.record(null, [tab('a', 'https://one.test/', 'One')])
    // On the way to the next page: its title already, the address not yet.
    store.record(null, [tab('a', 'https://one.test/', 'Loading https://two.test/', { loading: true })])
    store.record(null, [tab('a', 'https://two.test/', 'Two (loading)', { loading: true })])
    store.record(null, [tab('a', 'https://two.test/', 'Two')])
    expect(store.search('', false, 10).map((entry) => [entry.url, entry.title])).toEqual([['https://two.test/', 'Two'], ['https://one.test/', 'One']])
  })

  it('gives each page to whoever took the tab there', () => {
    const by = () => store.search('', true, 10).map((entry) => [entry.url, entry.conversationId])
    // The agent's own tab: its calls, what lands just after one, and what moves with no one at the wheel.
    store.record(CONVERSATION, [tab('agent', 'about:blank', '', { agentActing: true })])
    store.record(CONVERSATION, [tab('agent', 'https://agent.test/', '', { agentActing: true })])
    clock += 1000
    store.record(CONVERSATION, [tab('agent', 'https://agent.test/redirected')])
    clock += 10_000
    store.record(CONVERSATION, [tab('agent', 'https://agent.test/later')])
    // The user taking the agent's tab somewhere, and a tab the user lent the conversation.
    clock += 1000
    store.record(CONVERSATION, [tab('agent', 'https://mine.test/', '', { userDriving: true }), tab('lent', 'https://lent.test/', '', { userOwned: true })])
    clock += 1000
    store.record(CONVERSATION, [tab('agent', 'https://mine.test/'), tab('lent', 'https://lent.test/by-agent', '', { userOwned: true, agentActing: true })])
    expect(by()).toEqual([
      ['https://lent.test/by-agent', CONVERSATION],
      ['https://lent.test/', null],
      ['https://mine.test/', null],
      ['https://agent.test/later', CONVERSATION],
      ['https://agent.test/redirected', CONVERSATION],
      ['https://agent.test/', CONVERSATION]
    ])
    expect(store.search('', false, 10).map((entry) => entry.url)).toEqual(['https://lent.test/', 'https://mine.test/'])
  })

  it('keeps one row per address and opener, web pages only, and nothing past its days', () => {
    store.record(CONVERSATION, [tab('agent', 'https://same.test/', 'Agent', { agentActing: true })])
    store.record(null, [tab('mine', 'https://same.test/', 'Mine'), tab('file', 'file:///tmp/page.html')])
    expect(store.search('', true, 10).map((entry) => [entry.title, entry.conversationId])).toEqual([['Mine', null], ['Agent', CONVERSATION]])
    store.delete('https://same.test/', CONVERSATION)
    expect(store.search('', true, 10).map((entry) => entry.title)).toEqual(['Mine'])
    clock += BROWSER_HISTORY_DAYS * 24 * 60 * 60 * 1000 + 1
    store.record(null, [tab('mine', 'https://new.test/')])
    expect(store.search('', true, 10).map((entry) => entry.url)).toEqual(['https://new.test/'])
  })

  it('finds pages by every word, and clears them all', () => {
    store.record(null, [tab('a', 'https://docs.example.com/guide', 'Getting Started'), tab('b', 'https://other.test/', 'Guide to Other')])
    expect(store.search('guide started', false, 10).map((entry) => entry.url)).toEqual(['https://docs.example.com/guide'])
    expect(store.search('GUIDE', false, 10)).toHaveLength(2)
    store.clear()
    expect(store.search('', true, 10)).toEqual([])
  })
})
