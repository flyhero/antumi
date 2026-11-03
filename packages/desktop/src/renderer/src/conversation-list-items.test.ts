import { describe, expect, it } from 'vitest'
import { Conversation, Discussion, Task } from '@antumi/protocol'
import { arrangeItems, conversationItem, discussionItem, GROUP_LIMIT, groupActivity, groupOf, itemArchived, itemConversation, itemMatches, itemRunning, itemShown, shownRows, taskItem } from './conversation-list-items'

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

// A started task's row: the task with the chat it runs in, which is numbered 500 above the task.
const repo = (path: string) => ({ path, worktreePath: null, branch: null, startRef: null, start: null })
const task = (n: number, patch: Partial<Task> = {}, chatPatch: Partial<Conversation> = {}) => {
  const own = chat(500 + n, { agent: 'codex', ...chatPatch })
  if (own.kind !== 'conversation') throw new Error('chat')
  return taskItem(Task.parse({
    id: id(n), title: `任务 ${n}`, details: '', status: 'running', repos: [], dependsOn: [], agent: 'codex', conversationId: own.id, createdAt: n, updatedAt: n, ...patch
  }), own.conversation)
}

describe('conversation list items', () => {
  it('summarizes all rows in a folded group, keeping unread replies through a new turn until read', () => {
    const items = [
      chat(1, { sessionId: 's', chat: { turn: 'awaiting' } }),
      chat(2, { sessionId: 's', chat: { turn: 'running' } }),
      chat(3, { lastExit: { code: 1, at: 1 } }),
      chat(4, { sessionId: 's', chat: { turn: 'idle' } }),
      chat(5, { starting: true }),
      ...Array.from({ length: GROUP_LIMIT }, (_, index) => chat(10 + index))
    ]
    const unread = { [id(2)]: true, [id(15)]: true } as const
    expect(groupActivity(items, unread)).toEqual({ awaiting: 1, failed: 1, unseen: 2, running: 2 })
    expect(groupActivity(items, {})).toEqual({ awaiting: 1, failed: 1, unseen: 0, running: 2 })
    expect(groupActivity([chat(2)], unread)).toEqual({ awaiting: 0, failed: 0, unseen: 1, running: 0 })
    expect(groupActivity([], unread)).toEqual({ awaiting: 0, failed: 0, unseen: 0, running: 0 })
  })

  it('includes async questions and delegated approvals, ignoring archived activity and stale requests', () => {
    const request = { requestId: 'async:c1', kind: 'question', tool: null, title: '?', decisions: [], open: 1, async: true } as const
    expect(groupActivity([
      chat(1, { sessionId: 's', chat: { turn: 'idle', request: { ...request, decisions: [] } } }),
      chat(2, { delegation: { open: 1, awaiting: 1, writing: false }, chat: { turn: 'idle' } }),
      chat(3, { archivedAt: 1, lastExit: { code: 1, at: 1 } }),
      chat(4, { chat: { turn: 'awaiting' } }),
      chat(5, { delegation: { open: 1, awaiting: 0, writing: false }, chat: { turn: 'idle' } })
    ], { [id(3)]: true })).toEqual({ awaiting: 2, failed: 0, unseen: 0, running: 1 })
  })

  it('counts each group chat once, prioritizing members needing input over the running round', () => {
    expect(groupActivity([
      group(1, { state: 'running', members: [member(1, 'awaiting'), member(2, 'awaiting')] }),
      group(2, { state: 'running' }),
      group(3, { state: 'paused', members: [member(1, 'working')] }),
      group(4),
      group(5, { state: 'running', archivedAt: 1 })
    ], {})).toEqual({ awaiting: 1, failed: 0, unseen: 0, running: 2 })
  })

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

  it('lists a started task by its own title and projects, with its chat for the activity', () => {
    const item = task(1, { repos: [repo('/code/antumi'), repo('/code/lobehub')] }, { sessionId: 's', chat: { turn: 'awaiting' } })
    expect(groupOf(item, 'project')).toEqual({ label: 'antumi', rank: 0 })
    expect(groupOf(item, 'agent')).toEqual({ label: 'Codex', rank: 1 })
    expect(itemRunning(item)).toBe(true)
    expect(itemMatches(item, '任务 1')).toBe(true)
    expect(itemMatches(item, '会话')).toBe(false)
    expect(itemMatches(item, 'lobe')).toBe(true)
    expect(itemConversation(item)?.id).toBe(id(501))
    expect(groupActivity([item], { [id(501)]: true })).toEqual({ awaiting: 1, failed: 0, unseen: 1, running: 0 })
  })

  it('puts an accepted or cancelled task with the archived, by its status rather than its chat', () => {
    expect(itemArchived(task(1))).toBe(false)
    expect(itemArchived(task(2, { status: 'review' }))).toBe(false)
    expect(itemArchived(task(3, { status: 'done' }))).toBe(true)
    expect(itemArchived(task(4, { status: 'abandoned' }))).toBe(true)
    expect(itemArchived(task(5, {}, { archivedAt: 1 }))).toBe(false)
  })

  it('sorts a task by whichever moved last, the task or its chat, and pins it through its chat', () => {
    const groups = arrangeItems([chat(10), task(2, { updatedAt: 20 }), task(3, { updatedAt: 1 }, { updatedAt: 30, pinnedAt: 1 }), task(4, { updatedAt: 5 }, { updatedAt: 1 })], 'none', 'recent')
    expect(groups.map((each) => each.items.map((item) => item.id))).toEqual([[id(3)], [id(2), id(10), id(4)]])
    expect(arrangeItems([task(1), group(2), chat(3)], 'agent', 'recent').map((each) => [each.label, each.agent ?? each.discussions])).toEqual([['Claude Code', 'claude'], ['Codex', 'codex'], ['群聊', true]])
  })

  it('keeps to tasks alone when asked', () => {
    expect(itemShown(task(1), 'all')).toBe(true)
    expect(itemShown(task(1), 'tasks')).toBe(true)
    expect(itemShown(task(1), 'conversations')).toBe(false)
    expect(itemShown(chat(1), 'tasks')).toBe(false)
    expect(itemShown(group(1), 'tasks')).toBe(false)
  })

  it("shows a group's first rows, and the open one wherever it falls", () => {
    const items = Array.from({ length: 9 }, (_, index) => ({ id: `c${index}` }))
    expect(shownRows(items, null).map((each) => each.id)).toEqual(items.slice(0, GROUP_LIMIT).map((each) => each.id))
    expect(shownRows(items, 'c8').map((each) => each.id)).toEqual([...items.slice(0, GROUP_LIMIT).map((each) => each.id), 'c8'])
    expect(shownRows(items, null, GROUP_LIMIT + 2)).toHaveLength(GROUP_LIMIT + 2)
  })
})
