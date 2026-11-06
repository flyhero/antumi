import { describe, expect, it } from 'vitest'
import type { SourceInbox, SourceIssue } from '@antumi/protocol'
import { hasFreshIssues, inboxNoticesBetween, seenAfter, shownInboxes } from './inbox-news'
import type { ActiveInbox } from './source-inboxes'

const issue = (key: string): SourceIssue => ({
  key, title: `title ${key}`, url: `https://demo.test/${key}`, status: 'Open', statusCategory: 'todo', type: 'Bug', priority: null, updatedAt: null
})
const inbox = (items: string[], overrides: Partial<SourceInbox> = {}): SourceInbox => ({
  provider: 'jira', instance: 'default', active: true, items: items.map(issue), dismissed: [], refreshedAt: 1, refreshing: false, problem: null, ...overrides
})
const entry = (key: string, value: SourceInbox): ActiveInbox => ({ key, inbox: value, name: 'Jira' })

describe('inbox news', () => {
  it('tells of issues a sync brought, not those an inbox held when it loaded or was turned on', () => {
    const next = [entry('jira/default', inbox(['A-1', 'A-2', 'A-3', 'A-4']))]
    const before = inbox(['A-1'], { dismissed: [issue('A-2')] })
    expect(inboxNoticesBetween({ 'jira/default': before }, next)).toEqual([
      { title: 'Jira 收件箱', body: 'A-3 title A-3 等 2 个新 issue', target: { kind: 'inbox', key: 'jira/default' } }
    ])
    expect(inboxNoticesBetween({ 'jira/default': inbox(['A-1', 'A-2', 'A-3']) }, next)[0]?.body).toBe('A-4 title A-4')
    expect(inboxNoticesBetween({}, next)).toEqual([])
    expect(inboxNoticesBetween({ 'jira/default': inbox([], { active: false }) }, next)).toEqual([])
  })

  it('starts an inbox as seen, and marks new issues seen only once shown', () => {
    const first = seenAfter({}, [entry('jira/default', inbox(['A-1']))], new Set())
    expect(first).toEqual({ 'jira/default': ['A-1'] })

    const grown = { 'jira/default': inbox(['A-1', 'A-2']) }
    const unseen = seenAfter(first, [entry('jira/default', grown['jira/default'])], new Set())
    expect(unseen).toBe(first)
    expect(hasFreshIssues(grown, unseen)).toBe(true)
    expect(hasFreshIssues({ 'jira/default': inbox(['A-1', 'A-2'], { active: false }) }, unseen)).toBe(false)

    const looked = seenAfter(unseen, [entry('jira/default', grown['jira/default'])], new Set(['jira/default']))
    expect(hasFreshIssues(grown, looked)).toBe(false)
  })

  it('forgets issues an inbox no longer lists', () => {
    const seen = { 'jira/default': ['A-1', 'A-2', 'A-3'] }
    const next = seenAfter(seen, [entry('jira/default', inbox(['A-1'], { dismissed: [issue('A-3')] }))], new Set())
    expect(next).toEqual({ 'jira/default': ['A-1', 'A-3'] })
  })

  it('shows the chosen tab, or the one inbox there is', () => {
    const one = [entry('jira/default', inbox([]))]
    const two = [...one, entry('github/default', inbox(['G-1']))]
    expect(shownInboxes(one, null)).toEqual(['jira/default'])
    expect(shownInboxes(two, 'jira/default')).toEqual(['jira/default'])
    expect(shownInboxes(two, null)).toEqual(['github/default'])
  })
})
