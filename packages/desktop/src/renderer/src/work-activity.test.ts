import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Squad, SquadRun, Task, type Conversation } from '@antumi/protocol'
import { WorkingSummary } from './components/WorkingSummary'
import { TaskActivity } from './components/TaskActivity'
import { conversationActivity, taskActivity } from './work-activity'

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const conversation = (n: number, chat: Conversation['chat']): Conversation => ({ id: id(n), title: '', titleLocked: true, agent: 'codex', workspacePath: '/w', projectPaths: ['/w'], managedWorkspace: false, sessionId: 's', createdAt: 0, updatedAt: 0, chat })
const task = Task.parse({ id: 'task', title: 'Export', details: '', status: 'running', agent: 'codex', repos: [], dependsOn: [], conversationId: id(7), createdAt: 0, updatedAt: 0 })
const squad = Squad.parse({ id: id(1), name: 'Delivery', leaderId: id(2), archivedAt: null, createdAt: 0, updatedAt: 0, members: [
  { id: id(2), name: '队长', agent: 'claude', capability: 'readOnly' },
  { id: id(3), name: '开发', agent: 'codex', capability: 'develop' },
  { id: id(4), name: '审查', agent: 'cursor', capability: 'readOnly' }
] })
const work = (n: number, member: number, state: string, conv: number) => ({ id: id(n), memberId: id(member), conversationId: id(conv), instruction: `第 ${n} 项`, capability: 'develop', state, result: null, error: null, delivered: false, createdAt: n, updatedAt: n })
const run = SquadRun.parse({ id: id(10), taskId: 'squad-task', squad, leaderConversationId: id(20), state: 'running', permissionMode: 'ask', allowBypass: false, summary: null, createdAt: 0, updatedAt: 0, works: [work(30, 3, 'running', 21), work(31, 4, 'running', 22)] })
const squadTask = { ...task, id: 'squad-task', squadId: squad.id }

describe('who is at work', () => {
  it('reads a chat\'s turn: what it is on, or what it asked', () => {
    expect(conversationActivity(conversation(7, { turn: 'running', doing: { tool: 'Bash', title: 'pnpm test' } }), 'codex')).toEqual({ state: 'running', workers: [{ agent: 'codex', name: 'Codex' }], detail: '命令 pnpm test' })
    expect(conversationActivity(conversation(7, { turn: 'awaiting', request: { requestId: 'r', kind: 'approval', tool: 'Bash', title: 'git push', decisions: [], open: 1 } }), 'codex')).toMatchObject({ state: 'awaiting', detail: 'git push' })
    expect(conversationActivity(conversation(7, { turn: 'idle' }), 'codex')).toBeNull()
    expect(taskActivity(task, { [id(7)]: conversation(7, { turn: 'running' }) }, {})).toMatchObject({ state: 'running', detail: null })
  })

  it('shows a delegated request before the parent’s current action', () => {
    const parent = { ...conversation(7, { turn: 'running', doing: { tool: 'Bash', title: 'pnpm test' } }), delegation: { open: 1, awaiting: 1, writing: false } }
    expect(conversationActivity(parent, 'codex')).toMatchObject({ state: 'awaiting', detail: '委派等你处理' })
    expect(conversationActivity({ ...parent, delegation: { ...parent.delegation, awaiting: 0 } }, 'codex')).toMatchObject({ state: 'running', detail: '命令 pnpm test' })
  })

  it('reads a squad\'s task through its members, a member waiting on the user first', () => {
    const working = taskActivity(squadTask, { [id(20)]: conversation(20, { turn: 'running', doing: { tool: null, title: '汇总' } }), [id(21)]: conversation(21, { turn: 'running', doing: { tool: 'Bash', title: 'pnpm test' } }) }, { [run.id]: run })
    expect(working).toEqual({ state: 'running', workers: [{ agent: 'claude', name: '队长' }, { agent: 'codex', name: '开发' }, { agent: 'cursor', name: '审查' }], detail: '开发：命令 pnpm test' })
    const asking = taskActivity(squadTask, { [id(22)]: conversation(22, { turn: 'awaiting', request: { requestId: 'r', kind: 'question', tool: null, title: '要覆盖时区吗？', decisions: [], open: 1 } }) }, { [run.id]: run })
    expect(asking).toEqual({ state: 'awaiting', workers: [{ agent: 'cursor', name: '审查' }], detail: '审查：要覆盖时区吗？' })
    expect(taskActivity(squadTask, {}, { [run.id]: { ...run, state: 'review' } })).toBeNull()
  })

  it('names who works, or counts them past two', () => {
    const html = (names: string[]) => renderToStaticMarkup(createElement(WorkingSummary, { activity: { state: 'running', workers: names.map((name) => ({ agent: 'codex' as const, name })), detail: '开发：命令 pnpm test' } }))
    expect(html(['开发', '队长'])).toContain('开发、队长 工作中')
    expect(html(['开发', '队长', '审查'])).toContain('3 人工作中')
    expect(html(['开发'])).toContain('开发：命令 pnpm test')
  })

  it('shows only the current action on a card, retaining the worker in its accessible description', () => {
    const html = renderToStaticMarkup(createElement(TaskActivity, { activity: { state: 'running', workers: [{ agent: 'claude', name: 'Claude Code' }], detail: '分析 Agent 额度用量' } }))
    expect(html).toContain('class="task-card-activity-text">分析 Agent 额度用量</span>')
    expect(html).toContain('aria-label="Claude Code · 执行中：分析 Agent 额度用量"')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('working-label')
  })

  it('keeps waiting requests explicit and provides a status when there is no current action', () => {
    const render = (state: 'running' | 'awaiting', detail: string | null, count = 1) => renderToStaticMarkup(createElement(TaskActivity, { activity: { state, workers: Array.from({ length: count }, () => ({ agent: 'codex' as const, name: 'Codex' })), detail } }))
    expect(render('awaiting', '允许运行 pnpm test？')).toContain('等你回答：允许运行 pnpm test？</span>')
    expect(render('awaiting', null)).toContain('class="task-card-activity-text">等你回答</span>')
    expect(render('running', null)).toContain('class="task-card-activity-text">执行中</span>')
    expect(render('running', '  ', 3)).toContain('class="task-card-activity-text">3 个 Agent 执行中</span>')
  })
})
