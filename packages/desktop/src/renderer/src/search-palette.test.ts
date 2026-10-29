import { describe, expect, it } from 'vitest'
import { AgentProfile, Conversation, Task } from '@antumi/protocol'
import { agentEntries, conversationEntries, matchScore, recentEntries, searchSections, taskEntries } from './search-palette'

let next = 0
const uuid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`
// Readable ids in the assertions; the schema wants uuids, so the parsed object takes the name after.
const conversation = (id: string, title: string, patch: object = {}): Conversation => ({
  ...Conversation.parse({ id: uuid(), title, titleLocked: false, agent: 'claude', workspacePath: '/work/antumi', managedWorkspace: false, sessionId: null, projectPaths: ['/work/antumi'], createdAt: 0, updatedAt: 0, ...patch }),
  id
})
const task = (id: string, title: string, patch: object = {}): Task => Task.parse({ id, title, details: '', status: 'running', agent: 'claude', repos: [], dependsOn: [], createdAt: 0, updatedAt: 0, ...patch })
const profile = (id: string, name: string, description = ''): AgentProfile => ({ ...AgentProfile.parse({ id: uuid(), name, description, agent: 'claude', archivedAt: null, createdAt: 0, updatedAt: 0 }), id })
const project = () => 'antumi'

describe('search palette', () => {
  it('ranks a title that starts with the query over one with a word that does, over one that only contains it', () => {
    expect(matchScore('Settings redesign', 'set')).toBe(3)
    expect(matchScore('Fix the settings page', 'set')).toBe(2)
    expect(matchScore('Reset quotas', 'set')).toBe(1)
    expect(matchScore('Reset quotas', 'set page')).toBe(0)
  })

  it('finds conversations by title, then project, then what was said; archived ones and others never lead', () => {
    const list = [conversation('a', 'Quota card', { archivedAt: 1 }), conversation('b', 'Quota forecast'), conversation('c', 'Other', { taskId: 't' }), conversation('d', 'Untitled')]
    const found = conversationEntries(list, 'quota', new Map([['d', 'the quota ran out']]), project)
    expect(found.map((entry) => [entry.id, entry.detail])).toEqual([['a', 'antumi'], ['b', 'antumi'], ['d', 'the quota ran out']])
    expect(searchSections(found, 'conversations')[0]?.entries.map((entry) => entry.id)).toEqual(['b', 'a', 'd'])
  })

  it('puts the kind with the best match first in "all", a few of each', () => {
    const entries = [
      ...taskEntries([task('t', 'Add a search palette')], 'search', () => null),
      ...agentEntries([profile('p', 'Search expert'), profile('q', 'Reviewer', 'reads search code')], 'search')
    ]
    expect(taskEntries([task('3f9a2c1d-0000-4000-8000-000000000000', 'Untitled')], '3f9a', () => null)).toHaveLength(1)
    expect(searchSections(entries, 'all').map((section) => [section.kind, section.entries.map((entry) => entry.id)])).toEqual([['agents', ['p', 'q']], ['tasks', ['t']]])
  })

  it('offers the conversations and tasks touched last when nothing is typed', () => {
    const recent = recentEntries(
      [conversation('old', 'Old', { updatedAt: 1 }), conversation('new', 'New', { updatedAt: 3 })],
      [task('done', 'Done', { status: 'done', updatedAt: 4 }), task('open', 'Open', { updatedAt: 2 })],
      { conversation: project, task: () => null }
    )
    expect(recent.map((entry) => entry.id)).toEqual(['new', 'open', 'old'])
  })
})
