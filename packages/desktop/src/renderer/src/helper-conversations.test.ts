import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcClient, RpcRequest, type ChatCatalog, type Conversation, type RpcConnection } from '@antumi/protocol'
import { ensureHelper, handToHelper, helperFor, helperModel, helperWaiting } from './helper-conversations'
import { useCore } from './core-store'
import { usePreferences } from './preferences'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StateCreator } from 'zustand'
import { useQuotes, setQuotes } from './chat-quotes'

vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const parent: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Main', titleLocked: false, agent: 'claude',
  workspacePath: '/worktree', projectPaths: ['/worktree', '/extra'], managedWorkspace: false, sessionId: null, createdAt: 0, updatedAt: 0
}
const helper: Conversation = { ...parent, id: '22222222-2222-4222-8222-222222222222', title: '小助手', titleLocked: true, helperOf: parent.id }
const catalog: ChatCatalog = { models: [
  { id: 'sonnet', label: 'Sonnet', description: null, efforts: [], isDefault: true },
  { id: 'haiku', label: 'Haiku', description: null, efforts: [], isDefault: false }
] }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
function connection(features = ['conversation-helper']) {
  const sent: Array<ReturnType<typeof RpcRequest.parse>> = []
  const client = createRpcClient((frame) => sent.push(RpcRequest.parse(JSON.parse(frame))))
  const rpc: RpcConnection = { ...client, features, close() {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc })
  return { rpc, sent, reply: (index: number, result: unknown) => rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[index]?.id, result })) }
}

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  setQuotes(helper.id, [])
  usePreferences.setState({ quickModels: {} })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('helper conversations', () => {
  it('matches a legacy 1M provider small model to the catalog spelling', () => {
    const providerId = 'relay'
    useCore.setState({ modelProviders: [{
      id: providerId, name: 'Relay', preset: 'custom', anthropic: null, openai: null, models: [],
      defaultModel: 'sonnet', smallModel: 'claude-haiku-5-5[1M]', agents: ['claude'],
      hasKey: true, revision: 1, createdAt: 0, updatedAt: 0
    }] })
    const onProvider: Conversation = { ...parent, modelProvider: providerId, route: { providerId, name: 'Relay', reason: 'served' } }
    const model = { id: 'claude-haiku-5-5[1m]', label: 'Haiku (1M)', description: null, isDefault: false, efforts: [] }
    expect(helperModel(onProvider, { models: [...catalog.models, model] })).toBe(model.id)
  })

  it.each(['haiku', 'sonnet'])('creates a deferred ask conversation with the quick model %s and transfers the selection', async (model) => {
    usePreferences.setState({ quickModels: model === 'sonnet' ? { claude: 'sonnet' } : {} })
    const { sent, reply } = connection()
    const opening = handToHelper(parent, '/worktree/test.txt', 'conversation')
    expect(sent[0]).toMatchObject({ method: 'conversations.helper', params: { id: parent.id } })
    reply(0, null)
    await settle()
    expect(sent[1]).toMatchObject({ method: 'conversations.chatCatalog', params: { agent: parent.agent } })
    reply(1, catalog)
    await settle()
    expect(sent[2]).toMatchObject({ method: 'conversations.create', params: {
      agent: parent.agent, helperOf: parent.id, projectPaths: parent.projectPaths, model,
      deferStart: true, permissionMode: 'ask', allowBypass: true
    } })
    reply(2, helper)
    await opening
    expect(useCore.getState()).toMatchObject({ conversationInspectorOpen: true, conversationInspectorTab: 'helper' })
    function Quotes() { return createElement('div', null, useQuotes(helper.id).map((quote) => quote.text).join('\n')) }
    expect(renderToStaticMarkup(createElement(Quotes))).toContain('/worktree/test.txt')
    expect(sent).toHaveLength(3)
  })

  it('discovers the persisted helper after restart and opens the task inspector', async () => {
    const { sent, reply } = connection()
    const opening = handToHelper({ ...parent, taskId: 'task' }, 'selected', 'task')
    reply(0, helper)
    await opening
    expect(sent).toHaveLength(1)
    expect(useCore.getState()).toMatchObject({ inspectorOpen: true, taskInspectorTab: 'helper' })
    expect(helperFor(useCore.getState().conversations, parent.id)?.id).toBe(helper.id)
  })

  it('reuses the loaded helper and shares concurrent creates', async () => {
    const { sent, reply } = connection()
    const first = ensureHelper(parent)
    expect(ensureHelper(parent)).toBe(first)
    reply(0, helper)
    expect(await first).toEqual(helper)
    expect(await ensureHelper(parent)).toEqual(helper)
    expect(sent).toHaveLength(1)
  })

  it('does not resurrect a helper deleted while discovery is in flight', async () => {
    const { rpc, reply } = connection()
    const opening = ensureHelper(parent)
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', method: 'conversations.deleted', params: { id: helper.id } }))
    reply(0, helper)
    await settle()
    // Discovery moves on to catalog lookup instead of reusing the deleted result.
    reply(1, catalog)
    await settle()
    reply(2, { ...helper, id: '33333333-3333-4333-8333-333333333333' })
    expect((await opening)?.id).not.toBe(helper.id)
  })

  it('preserves a newer waiting state received during discovery', async () => {
    const { rpc, reply } = connection()
    const opening = ensureHelper(parent)
    const waiting = { ...helper, sessionId: 'live', chat: { turn: 'awaiting' as const } }
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', method: 'conversations.changed', params: { conversation: waiting } }))
    reply(0, helper)
    await opening
    expect(helperWaiting(useCore.getState().conversations, parent.id)).toBe(true)
  })

  it('ignores unavailable features, blank selections and invalid parents', async () => {
    const { sent } = connection([])
    expect(await ensureHelper(parent)).toBeNull()
    await handToHelper(parent, 'selection', 'conversation')
    connection()
    expect(await ensureHelper(helper)).toBeNull()
    await handToHelper(parent, ' ', 'conversation')
    expect(sent).toHaveLength(0)
  })
})
