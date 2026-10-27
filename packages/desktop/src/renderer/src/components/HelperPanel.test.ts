import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { createRpcClient, Task, ChatItem, type Conversation, type RpcConnection } from '@antumi/protocol'
import { useCore } from '../core-store'
import { useChat } from '../chat-state'
import { usePreferences } from '../preferences'
import { HandToHelperItem } from './ChatContextMenu'
import { ConversationInspector } from './ConversationInspector'
import { TaskInspector } from './TaskInspector'
import { ConversationView } from './ConversationView'
import { TaskToolbar } from './TaskActions'
import { HelperPanel } from './HelperPanel'
import { helperMode, helperModes } from './HelperModelPicker'

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
const helper: Conversation = { ...parent, id: '22222222-2222-4222-8222-222222222222', helperOf: parent.id, title: '小助手', chat: { turn: 'awaiting' } }
const task = Task.parse({ id: 'task', title: 'Task', details: '', repos: [], dependsOn: [], conversationId: parent.id, status: 'running', agent: 'claude', createdAt: 0, updatedAt: 0 })
function connect(features = ['conversation-helper']) {
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features, close() {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, conversations: { [parent.id]: parent }, tasks: { [task.id]: task } })
}
const renderMenu = (selection: string, conversation: Conversation = parent) => renderToStaticMarkup(createElement(HandToHelperItem, { parent: conversation, selection, inspector: 'conversation', onClose: () => {} }))

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  useChat.setState({}, true)
  connect()
})

describe('helper UI', () => {
  it('offers the selection action for free and task chats, and only with a supported eligible selection', () => {
    expect(renderMenu('selected')).toContain('交给小助手')
    expect(renderMenu('selected', { ...parent, taskId: 'task' })).toContain('交给小助手')
    expect(renderMenu(' ')).toBe('')
    for (const patch of [{ helperOf: parent.id }, { discussionId: parent.id }, { squadRunId: parent.id }, { routineId: parent.id }, { archivedAt: 1 }]) {
      expect(renderMenu('selected', { ...parent, ...patch })).toBe('')
    }
    connect([])
    expect(renderMenu('selected')).toBe('')
  })

  it('hides an unused helper in both inspectors, then shows it with its approval indicator', () => {
    for (const html of [
      renderToStaticMarkup(createElement(ConversationInspector, { conversation: parent, widthRatio: 0.35, onWidthRatioChange: () => {} })),
      renderToStaticMarkup(createElement(TaskInspector, { task, widthRatio: 0.35, onWidthRatioChange: () => {} }))
    ]) expect(html).not.toContain('>小助手')
    useCore.setState({ conversations: { [parent.id]: parent, [helper.id]: helper } })
    const conversationHtml = renderToStaticMarkup(createElement(ConversationInspector, { conversation: parent, widthRatio: 0.35, onWidthRatioChange: () => {} }))
    const taskHtml = renderToStaticMarkup(createElement(TaskInspector, { task, widthRatio: 0.35, onWidthRatioChange: () => {} }))
    for (const html of [conversationHtml, taskHtml]) {
      expect(html).toContain('小助手')
      expect(html).toContain('aria-label="小助手等你处理"')
    }
  })

  it('marks both inspector buttons while keeping a no-project parent inspectable', () => {
    useCore.setState({ conversations: { [parent.id]: parent, [helper.id]: helper } })
    const conversationHtml = renderToStaticMarkup(createElement(ConversationView, { id: parent.id }))
    const taskHtml = renderToStaticMarkup(createElement(TaskToolbar, { task, view: 'chat' }))
    for (const html of [conversationHtml, taskHtml]) {
      expect(html).toContain('aria-label="检查器"')
      expect(html).toContain('aria-label="小助手等你处理"')
    }
  })

  it('renders an input without creating an agent for the empty helper', () => {
    const html = renderToStaticMarkup(createElement(HelperPanel, { parent }))
    expect(html).toContain('不占主会话的上下文')
    expect(html).toContain('placeholder="交给小助手…"')
    expect(html).toContain('正在读取模型')
  })

  it('sets the empty helper in the chat font the settings choose', () => {
    const before = usePreferences.getState()
    usePreferences.setState({ chatFontSize: 17, chatFont: 'custom', chatFontFamily: 'LXGW WenKai' })
    const html = renderToStaticMarkup(createElement(HelperPanel, { parent }))
    usePreferences.setState(before, true)
    expect(html).toContain('data-font-size="17"')
    expect(html).toContain('data-font="custom"')
    expect(html).toContain('--chat-font-custom:')
  })

  it('offers the helper every start mode but plan, and asks when the pick no longer fits', () => {
    const catalog = { models: [
      { id: 'sonnet', label: 'Sonnet', description: null, efforts: ['high'], isDefault: true, autoMode: true },
      { id: 'haiku', label: 'Haiku', description: null, efforts: [], isDefault: false }
    ] }
    expect(helperModes('claude', catalog, null)).toEqual(['ask', 'acceptEdits', 'auto', 'bypass'])
    const haiku = helperModes('claude', catalog, 'haiku')
    expect(haiku).toEqual(['ask', 'acceptEdits', 'bypass'])
    expect(helperMode(haiku, 'bypass')).toBe('bypass')
    expect(helperMode(haiku, 'acceptEdits')).toBe('acceptEdits')
    expect(helperMode(haiku, 'plan')).toBe('ask')
    expect(helperMode(haiku, 'auto')).toBe('ask')
    expect(helperMode(haiku, null)).toBe('ask')
  })

  it('removes the entry and tab on older cores', () => {
    connect([])
    const html = renderToStaticMarkup(createElement(ConversationInspector, { conversation: parent, widthRatio: 0.35, onWidthRatioChange: () => {} }))
    expect(html).not.toContain('小助手')
  })

  it.each(['reply', 'work', 'empty'] as const)('shows a helper cost once for a %s turn', (shape) => {
    useCore.setState({ conversations: { [parent.id]: parent, [helper.id]: { ...helper, chat: { turn: 'idle' } } } })
    const base = { stageId: 'stage', revision: 1, at: 1000 }
    const items: ChatItem[] = [ChatItem.parse({ ...base, id: 'user', kind: 'user', text: 'question' })]
    if (shape === 'work') items.push(ChatItem.parse({ ...base, id: 'reason', kind: 'reasoning', text: 'thinking', streaming: false }))
    if (shape !== 'empty') items.push(ChatItem.parse({ ...base, id: 'reply', kind: 'assistant', text: 'answer', streaming: false }))
    items.push(ChatItem.parse({ ...base, id: 'turn', kind: 'turn', state: 'completed', error: null, durationMs: 2000,
      usage: { input: 100, output: 10 }, smallModelCost: {
        costUsd: 0.05, savedUsd: 0.63, modelDifferenceUsd: 0.15, contextSavedUsd: 0.48,
        baseline: { model: 'claude-opus-5-5', context: 600000, price: null }, calls: 4,
        callsEstimated: false, prices: [], completed: true
      } }))
    useChat.setState({ [helper.id]: { items, before: null } })
    const html = renderToStaticMarkup(createElement(HelperPanel, { parent }))
    expect(html.match(/class="helper-turn-cost"/g)).toHaveLength(1)
    expect(html).toContain('花费 $0.05')
    expect(html).toContain('约省 $0.63')
    expect(html).toContain('处理了 2 秒')
  })

})
