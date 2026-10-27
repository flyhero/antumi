import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { AgentCall, createRpcClient, Task, type Conversation, type RpcConnection } from '@antumi/protocol'
import { isAgentCallResult, showAgentCalls, useAgentCalls } from '../agent-calls'
import { useCore } from '../core-store'
import { useChat } from '../chat-state'
import { AgentDelegation, AgentDelegationResult } from './AgentDelegation'
import { ChatSurfaceContext, conversationSurface } from './chat-surface'
import { ConversationInspector } from './ConversationInspector'
import { TaskInspector } from './TaskInspector'
import { TaskToolbar } from './TaskActions'
import { ChatDelegationCard } from './ChatDelegationCard'
import { ConversationView } from './ConversationView'

vi.mock('../agent-calls', async (importOriginal) => ({
  ...await importOriginal<typeof import('../agent-calls')>(),
  useAgentCalls: vi.fn(() => ({ calls: null, error: null }))
}))

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})
vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})
const parent: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Main', titleLocked: false, agent: 'claude',
  workspacePath: '/w', projectPaths: [], managedWorkspace: true, sessionId: null, createdAt: 0, updatedAt: 0
}
const task = Task.parse({ id: 'task', title: 'Task', details: '', repos: [], dependsOn: [], conversationId: parent.id, status: 'running', agent: 'claude', createdAt: 0, updatedAt: 0 })
function connect(features = ['agent-profiles']) {
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features, close() {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, conversations: { [parent.id]: parent }, tasks: { [task.id]: task } })
}
const renderButton = (conversation = parent) => renderToStaticMarkup(createElement(ChatSurfaceContext.Provider, { value: conversationSurface(conversation) }, createElement(AgentDelegation, { conversation })))
const call = AgentCall.parse({ result: null, error: null, delivered: false, id: '33333333-3333-4333-8333-333333333333', parentId: parent.id, conversationId: '44444444-4444-4444-8444-444444444444', profile: { id: '55555555-5555-4555-8555-555555555555', name: '审查员', agent: 'codex', archivedAt: null, createdAt: 0, updatedAt: 0 }, instruction: '检查变更', state: 'queued', readOnly: true, permissionMode: 'readOnly', createdAt: 10, updatedAt: 20 })
const renderCard = (patch: Partial<AgentCall>) => renderToStaticMarkup(createElement(ChatSurfaceContext.Provider, { value: conversationSurface(parent) }, createElement(ChatDelegationCard, { call: { ...call, ...patch } })))

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  useChat.setState({}, true)
  connect()
  vi.mocked(useAgentCalls).mockReturnValue({ calls: null, error: null })
})

describe('delegation surfaces', () => {
  it('animates active work, while queued, awaiting, failed and finished cards remain still', () => {
    for (const state of ['starting', 'running'] as const) expect(renderCard({ state })).toContain('data-active="true"')
    for (const state of ['queued', 'awaiting', 'failed', 'completed', 'cancelled'] as const) expect(renderCard({ state })).not.toContain('data-active=')
    const awaiting = renderCard({ state: 'awaiting' })
    expect(awaiting).toContain('等你回答')
    expect(awaiting).toContain('去处理')
    expect(awaiting).toContain('取消委派')
  })

  it('keeps the goal and final outcome readable, with details and conversation links', () => {
    const html = renderCard({ state: 'completed', result: 'Everything passed', delivered: true })
    for (const text of ['审查员', '检查变更', 'Everything passed', '结果返回', '委派记录', '查看会话']) expect(html).toContain(text)
    expect(html).not.toContain('取消委派')
    expect(html).toContain('aria-expanded="false"')
    expect(renderCard({ state: 'failed', error: 'Agent exited unexpectedly' })).toContain('Agent exited unexpectedly')
  })

  it('offers a dialog trigger for parent chats, but never for delegated or special-purpose chats or old cores', () => {
    expect(renderButton()).toContain('aria-haspopup="dialog"')
    expect(renderButton({ ...parent, taskId: task.id })).toContain('委派子任务')
    for (const patch of [{ parentConversationId: parent.id }, { helperOf: parent.id }, { discussionId: parent.id }, { squadRunId: parent.id }, { routineId: parent.id }]) {
      expect(renderButton({ ...parent, ...patch })).toBe('')
    }
    connect([])
    expect(renderButton()).toBe('')
  })

  it('hides delegation tabs and empty inspector entries before the first record arrives', () => {
    useCore.setState({ conversationInspectorTab: 'delegation', taskInspectorTab: 'delegation' })
    for (const calls of [null, []]) {
      vi.mocked(useAgentCalls).mockReturnValue({ calls, error: null })
      for (const html of [
        renderToStaticMarkup(createElement(ConversationInspector, { conversation: parent, widthRatio: 0.35, onWidthRatioChange() {} })),
        renderToStaticMarkup(createElement(TaskInspector, { task, widthRatio: 0.35, onWidthRatioChange() {} }))
      ]) {
        expect(html).not.toContain('>委派')
        expect(html).not.toContain('委派记录')
      }
      expect(renderToStaticMarkup(createElement(TaskToolbar, { task, view: 'chat' }))).not.toContain('aria-label="检查器"')
      expect(renderToStaticMarkup(createElement(ConversationView, { id: parent.id }))).not.toContain('aria-label="检查器"')
    }
    expect(renderButton()).toContain('委派子任务')
  })

  it('keeps existing history reachable in both inspectors even without git, todos or a helper', () => {
    vi.mocked(useAgentCalls).mockReturnValue({ calls: [{ ...call, state: 'completed' }], error: null })
    useCore.setState({ conversationInspectorTab: 'delegation', taskInspectorTab: 'delegation' })
    const conversation = renderToStaticMarkup(createElement(ConversationInspector, { conversation: parent, widthRatio: 0.35, onWidthRatioChange() {} }))
    const taskPanel = renderToStaticMarkup(createElement(TaskInspector, { task, widthRatio: 0.35, onWidthRatioChange() {} }))
    for (const html of [conversation, taskPanel]) {
      expect(html).toContain('aria-selected="true">委派')
      expect(html).toContain('委派记录')
      expect(html).not.toContain('<textarea')
    }
    expect(renderToStaticMarkup(createElement(TaskToolbar, { task, view: 'chat' }))).toContain('aria-label="检查器"')
  })

  it('routes history to its owning inspector without changing the other inspector', () => {
    useCore.setState({ taskInspectorTab: 'branch', inspectorOpen: false })
    showAgentCalls('conversation')
    expect(useCore.getState()).toMatchObject({ conversationInspectorOpen: true, conversationInspectorTab: 'delegation', taskInspectorTab: 'branch', inspectorOpen: false })
    showAgentCalls('task')
    expect(useCore.getState()).toMatchObject({ inspectorOpen: true, taskInspectorTab: 'delegation' })
  })

  it('recognizes delivery refs independently of user text and shows a compact inspector link', () => {
    const id = `u:agent-result:${parent.id}`
    expect(isAgentCallResult({ kind: 'user', id })).toBe(true)
    expect(isAgentCallResult({ kind: 'assistant', id })).toBe(false)
    expect(isAgentCallResult({ kind: 'user', id: `u:${parent.id}` })).toBe(false)
    const html = renderToStaticMarkup(createElement(ChatSurfaceContext.Provider, { value: conversationSurface(parent) }, createElement(AgentDelegationResult)))
    expect(html).toContain('委派结果已返回')
    expect(html).toContain('委派记录')
  })
})
