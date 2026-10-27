import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Squad, SquadRun, Task, createRpcClient, type Conversation, type RpcConnection } from '@antumi/protocol'
import { actionableItems, attentionCount, noticesBetween } from './attention'
import { openAttentionItem, selectSquad, useCore } from './core-store'
import { saveSquad } from './squads'
import { SquadsEntry, SquadsView } from './components/Squads'
import { SquadWorkPanel } from './components/SquadWorkPanel'

vi.mock('./core-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core-store')>()
  return { ...actual, useSquadsSupported: () => actual.useCore.getState().rpc?.features.includes('squads') ?? false, useCore: Object.assign((selector: (state: import('./core-store').CoreState) => unknown) => selector(actual.useCore.getState()), actual.useCore) }
})

vi.mock('./components/ChatMarkdown', () => ({ ChatMarkdown: ({ text }: { text: string }) => createElement('p', null, text) }))

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const squad = Squad.parse({ id: id(5), name: 'Delivery', leaderId: id(1), archivedAt: null, createdAt: 0, updatedAt: 0, members: [
  { id: id(1), name: 'Lead', agent: 'claude', capability: 'readOnly' }, { id: id(2), name: 'Build', agent: 'codex', capability: 'develop', role: 'implement and test' }
] })
const run = SquadRun.parse({ id: id(6), taskId: 'task', squad, leaderConversationId: id(7), state: 'running', permissionMode: 'ask', allowBypass: false, summary: null, createdAt: 0, updatedAt: 0, works: [
  { id: id(8), memberId: id(2), conversationId: id(9), instruction: 'Implement export', capability: 'develop', state: 'awaiting', result: null, error: null, delivered: false, createdAt: 0, updatedAt: 0 }
] })
const task = Task.parse({ id: 'task', title: 'Export', details: '', status: 'running', agent: 'claude', squadId: squad.id, repos: [], dependsOn: [], conversationId: id(7), awaitingInput: true, createdAt: 0, updatedAt: 0 })
const conversation: Conversation = { id: id(9), title: 'Build', titleLocked: true, agent: 'codex', workspacePath: '/wt', projectPaths: ['/wt'], managedWorkspace: false, sessionId: 'worker', createdAt: 0, updatedAt: 0, squadRunId: run.id, chat: { turn: 'awaiting', request: { kind: 'approval', requestId: 'approve', title: 'Run tests', tool: 'shell', open: 1, decisions: ['allow', 'deny'] } } }

beforeEach(() => useCore.setState(useCore.getInitialState(), true))
describe('development squad user paths', () => {
  it('waits for successful creation before opening the saved squad', async () => {
    const sent: Array<{ id: number; method: string; params: unknown }> = []
    const client = createRpcClient((frame) => sent.push(JSON.parse(frame)))
    const rpc: RpcConnection = { ...client, features: ['squads'], close: () => {}, closed: new Promise(() => {}) }
    useCore.setState({ rpc, settingsOpen: true, section: 'tasks' })
    const saving = saveSquad(squad)
    expect(useCore.getState().section).toBe('tasks')
    expect(sent[0]?.method).toBe('squads.create')
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, result: squad }))
    await saving
    expect(useCore.getState()).toMatchObject({ section: 'squads', selectedSquadId: squad.id, settingsOpen: false, squads: { [squad.id]: squad } })
  })
  it('shows a dedicated management section, editable roles and member work access', () => {
    const client = createRpcClient(() => {})
    const rpc: RpcConnection = { ...client, features: ['squads'], close: () => {}, closed: new Promise(() => {}) }
    useCore.setState({ rpc, squads: { [squad.id]: squad } })
    selectSquad(null)
    // The sidebar holds an entry only; the squads are listed on their page.
    const sidebar = renderToStaticMarkup(createElement(SquadsEntry))
    expect(sidebar).toContain('<span>团队</span>')
    expect(sidebar).not.toContain('Delivery')
    const list = renderToStaticMarkup(createElement(SquadsView))
    expect(list).toContain('Delivery')
    // A card a squad, its leader first and marked, and a card to start another.
    expect(list).toContain('data-lead="true" title="Lead · Claude Code')
    expect(list).toContain('新建团队')
    selectSquad(squad.id)
    const overview = renderToStaticMarkup(createElement(SquadsView))
    expect(overview).toContain('负责人 · 只读')
    expect(overview).toContain('开发 / 测试')
    expect(overview).toContain('implement and test')
    expect(overview).toContain('编辑')
    const panel = renderToStaticMarkup(createElement(SquadWorkPanel, { runs: [run], onConversation: () => {} }))
    expect(panel).toContain('等你回答')
    expect(panel).toContain('看会话')
    expect(panel).toContain('Implement export')
  })
  it('routes member approvals to the task and opens the exact member conversation', () => {
    const snapshot = { tasks: { [task.id]: task }, conversations: { [conversation.id]: conversation }, squadRuns: { [run.id]: run }, unseen: {} }
    const items = actionableItems(snapshot)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ target: { kind: 'task', id: task.id }, conversationId: conversation.id, primaryReason: 'awaiting' })
    expect(attentionCount(snapshot)).toBe(1)
    useCore.setState(snapshot)
    openAttentionItem(items[0]!)
    expect(useCore.getState()).toMatchObject({ section: 'tasks', selectedId: task.id, view: 'chat', taskMemberConversationId: conversation.id, taskInspectorTab: 'squad' })
    const before = { ...conversation, chat: { turn: 'running' as const } }
    expect(noticesBetween({ ...snapshot, conversations: { [conversation.id]: before } }, snapshot)[0]?.target).toEqual({ kind: 'task', id: task.id })
  })
})
