import { describe, expect, it } from 'vitest'
import { Conversation, Discussion } from '@antumi/protocol'
import { arrangeItems, conversationItem, discussionItem, GROUP_LIMIT, groupOf, itemMatches, itemRunning, itemShown, shownRows } from './conversation-list-items'

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const chat = (n: number, patch: Partial<Conversation> = {}) => conversationItem(Conversation.parse({
  id: id(n), title: `会话 ${n}`, titleLocked: false, agent: 'claude', workspacePath: '/w', projectPaths: [], managedWorkspace: false,
  sessionId: null, createdAt: n, updatedAt: n, ...patch
}))
const member = (n: number, status: 'idle' | 'working' | 'awaiting' = 'idle') => ({ id: id(100 + n), conversationId: id(200 + n), agent: 'codex' as const, model: null, effort: null, name: `成员 ${n}`, role: '', status })
const group = (n: number, patch: Partial<Discussion> = {}) => discussionItem(Discussion.parse({
  id: id(n), title: `群聊 ${n}`, topic: '题目', projectPaths: [], members: [member(1), member(2)], chairId: id(101), maxRounds: 3, anonymous: false,
  state: 'done', step: 'summary', round: 2, lastRound: 2, pinnedAt: null, archivedAt: null, createdAt: n, updatedAt: n, ...patch
}))

describe('conversation list items', () => {
  it('puts a conversation or group chat under its primary project, whatever else it reaches, and one without last', () => {
    expect(groupOf(chat(1, { projectPaths: ['/code/antumi', '/code/lobehub'] }), 'project')).toEqual({ label: 'antumi', rank: 0 })
    expect(groupOf(group(2, { projectPaths: ['/code/antumi'] }), 'project')).toEqual({ label: 'antumi', rank: 0 })
    expect(groupOf(chat(3), 'project')).toEqual({ label: '无项目', rank: 1 })
  })

  it('gives group chats a group of their own after the agents', () => {
    const groups = arrangeItems([chat(1), group(2), chat(3, { agent: 'codex' })], 'agent', 'recent')
    expect(groups.map((each) => [each.label, each.items.map((item) => item.id)])).toEqual([['Claude Code', [id(1)]], ['Codex', [id(3)]], ['群聊', [id(2)]]])
    expect(groups.at(-1)?.discussions).toBe(true)
  })

  it('sorts both kinds together, pinned ones first in the chosen order', () => {
    const groups = arrangeItems([chat(1), group(2), chat(3, { pinnedAt: 1 }), group(4, { pinnedAt: 9 }), chat(5, { pinnedAt: 5 })], 'none', 'recent')
    expect(groups.map((each) => each.items.map((item) => item.id))).toEqual([[id(5), id(4), id(3)], [id(2), id(1)]])
  })

  it('counts a group chat as running while it discusses or a member is at work', () => {
    expect(itemRunning(group(1))).toBe(false)
    expect(itemRunning(group(1, { state: 'paused', members: [member(1, 'awaiting'), member(2)] }))).toBe(true)
    expect(itemRunning(group(1, { state: 'running' }))).toBe(true)
    expect(itemRunning(chat(2, { sessionId: 's' }))).toBe(true)
  })

  it('keeps to one kind when asked', () => {
    expect(itemShown(group(1), 'all')).toBe(true)
    expect(itemShown(group(1), 'conversations')).toBe(false)
    expect(itemShown(chat(1), 'discussions')).toBe(false)
    expect(itemShown(chat(1), 'conversations')).toBe(true)
  })

  it('finds a group chat by title or project', () => {
    expect(itemMatches(group(1, { projectPaths: ['/code/antumi'] }), 'ANTU')).toBe(true)
    expect(itemMatches(group(1), '群聊')).toBe(true)
    expect(itemMatches(group(1), '会话')).toBe(false)
  })

  it("shows a group's first rows, and the open one wherever it falls", () => {
    const items = Array.from({ length: 9 }, (_, index) => ({ id: `c${index}` }))
    expect(shownRows(items, null).map((each) => each.id)).toEqual(items.slice(0, GROUP_LIMIT).map((each) => each.id))
    expect(shownRows(items, 'c8').map((each) => each.id)).toEqual([...items.slice(0, GROUP_LIMIT).map((each) => each.id), 'c8'])
    expect(shownRows(items, null, GROUP_LIMIT + 2)).toHaveLength(GROUP_LIMIT + 2)
  })
})
