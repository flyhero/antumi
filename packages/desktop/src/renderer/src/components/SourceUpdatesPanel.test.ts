import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StateCreator } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcClient, Task, type Conversation, type RpcConnection, type SourceUpdateSummary } from '@antumi/protocol'
import { showSourceUpdates, useCore } from '../core-store'
import { SourceCommentBadge, SourceUpdatesButton, SourceUpdatesPanel } from './SourceUpdatesPanel'
import { ConversationInspector } from './ConversationInspector'
import { TaskInspector } from './TaskInspector'
import { useConversationPanel } from './ConversationView'
import { conversationSurface } from './chat-surface'
import { ChatIcon, SourceIcon } from './icons'

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

const target = { kind: 'conversation', id: 'one' } as const
const initial: SourceUpdateSummary = { revision: 'one', target, watching: true, active: true, supported: true, unread: 2, pending: 3, through: 9, refreshedAt: 1000, refreshing: false, problem: null, sendBlocker: null }
const render = () => renderToStaticMarkup(createElement(SourceUpdatesPanel, { target }))
function connect(features = ['source-comments-v1']) {
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features, close: () => {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, sourceUpdates: { 'conversation:one': initial } })
}
beforeEach(() => { useCore.setState(useCore.getInitialState(), true); connect() })

describe('issue update entry', () => {
  it('keeps the unread count separate from comments not sent to the agent', () => {
    const html = render()
    expect(html).toContain('2 条新评论')
    expect(html).toContain('3 条尚未交给 Agent')
    expect(html).toContain('带新评论继续排查')
    expect(renderToStaticMarkup(createElement(SourceCommentBadge, { target }))).toContain('2 条新评论')
  })
  it('hides the feature on an older core', () => {
    connect([])
    expect(render()).toBe('')
  })
  it('disables sending while the conversation is archived', () => {
    useCore.setState({ sourceUpdates: { 'conversation:one': { ...initial, active: false, sendBlocker: '请先取消归档' } } })
    expect(render()).toContain('disabled="" title="请先取消归档"')
    expect(render()).toContain('同步已暂停')
  })

  it('keeps pending comments visible after reading them, and removes the count only after delivery', () => {
    const button = () => renderToStaticMarkup(createElement(SourceUpdatesButton, { target }))
    expect(button()).toContain('class="source-updates-unread"')
    expect(button()).toContain('class="source-updates-count">3')
    expect(button()).not.toContain('source-updates-content')
    useCore.setState({ sourceUpdates: { 'conversation:one': { ...initial, unread: 0 } } })
    expect(button()).not.toContain('class="source-updates-unread"')
    expect(button()).toContain('class="source-updates-count">3')
    useCore.setState({ sourceUpdates: { 'conversation:one': { ...initial, unread: 0, pending: 0 } } })
    expect(button()).not.toContain('class="source-updates-count"')
    expect(button()).toContain('评论更新')
  })

  it('does not show an entry without an update summary or on an older core', () => {
    useCore.setState({ sourceUpdates: {} })
    expect(renderToStaticMarkup(createElement(SourceUpdatesButton, { target }))).toBe('')
    connect([])
    expect(renderToStaticMarkup(createElement(SourceUpdatesButton, { target }))).toBe('')
  })

  it('opens the owning inspector without changing the other inspector or marking comments read', () => {
    useCore.setState({ taskInspectorTab: 'branch', conversationInspectorTab: 'plan' })
    showSourceUpdates(target)
    expect(useCore.getState()).toMatchObject({ conversationInspectorOpen: true, conversationInspectorTab: 'source', inspectorOpen: false, taskInspectorTab: 'branch' })
    expect(useCore.getState().sourceUpdates['conversation:one']).toEqual(initial)
    showSourceUpdates({ kind: 'task', id: 'task' })
    expect(useCore.getState()).toMatchObject({ inspectorOpen: true, taskInspectorTab: 'source' })
  })
})

describe('source inspector availability', () => {
  const source = { provider: 'jira', instance: 'work', name: 'Jira', key: 'YAAS-1', url: 'https://jira.example/browse/YAAS-1' }
  const conversation: Conversation = { id: 'one', title: 'Investigate', titleLocked: false, agent: 'claude', workspacePath: '/w', projectPaths: [], managedWorkspace: true, sessionId: null, createdAt: 0, updatedAt: 0, source }
  const task = Task.parse({ id: 'task', title: 'Task', details: '', repos: [], dependsOn: [], conversationId: conversation.id, status: 'running', agent: 'claude', createdAt: 0, updatedAt: 0, source })

  it('uses each target’s source mark beside comment updates, with a comment icon for other plugins', () => {
    useCore.setState({ conversations: { one: conversation }, tasks: { task: { ...task, source: { ...source, provider: 'github', name: 'GitHub', key: 'repo/#1' } } }, sourceUpdates: { 'conversation:one': initial, 'task:task': { ...initial, target: { kind: 'task', id: task.id } } } })
    for (const [kind, id, provider, label] of [
      ['conversation', 'one', 'jira', 'Jira YAAS-1'],
      ['task', 'task', 'github', 'GitHub repo/#1']
    ] as const) {
      const html = renderToStaticMarkup(createElement(SourceUpdatesButton, { target: { kind, id } }))
      expect(html).toContain(renderToStaticMarkup(createElement(SourceIcon, { provider })))
      expect(html).toContain('评论更新')
      expect(html).toContain(label)
    }
    useCore.setState({ conversations: { one: { ...conversation, source: { ...source, provider: 'custom' } } } })
    expect(renderToStaticMarkup(createElement(SourceUpdatesButton, { target }))).toContain(renderToStaticMarkup(createElement(ChatIcon)))
  })

  it('offers source details without a repository, plan, todo or helper in both inspectors', () => {
    useCore.setState({ conversations: { one: conversation }, tasks: { task }, sourceUpdates: { 'conversation:one': initial, 'task:task': { ...initial, target: { kind: 'task', id: task.id } } }, conversationInspectorTab: 'source', taskInspectorTab: 'source' })
    expect(conversationSurface(conversation).sourceUpdates).toEqual(target)
    expect(conversationSurface({ ...conversation, source: null }).sourceUpdates).toBeUndefined()
    const renderAvailability = () => String(useConversationPanel(conversation).hasPanel)
    expect(renderToStaticMarkup(createElement(renderAvailability))).toBe('true')
    for (const html of [
      renderToStaticMarkup(createElement(ConversationInspector, { conversation, widthRatio: .35, onWidthRatioChange() {} })),
      renderToStaticMarkup(createElement(TaskInspector, { task, widthRatio: .35, onWidthRatioChange() {} }))
    ]) {
      expect(html).toContain('aria-selected="true">来源')
      expect(html).toContain('data-inspector="true"')
      expect(html).toContain('YAAS-1')
      expect(html).toContain('关注新评论')
    }
  })
})
