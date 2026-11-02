import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { createRpcClient, type Conversation, type ConversationConfiguration, type RpcConnection } from '@antumi/protocol'
import { useCore } from '../core-store'
import { composerDraft, EMPTY_DRAFT, saveComposerDraft } from '../composer-drafts'
import { useInitialMessages } from '../initial-messages'
import { newConversationFrom, sendToNewConversation } from './ConversationActions'
import { ConversationDraft } from './ConversationDraft'
import { ConversationView } from './ConversationView'

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

const source: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Original', titleLocked: false, agent: 'claude',
  workspacePath: '/worktree/app', projectPaths: ['/worktree/app', '/worktree/lib'], managedWorkspace: false,
  sessionId: 'running-session', createdAt: 1, updatedAt: 1, chat: { turn: 'running' },
  chatOptions: { permissionMode: 'acceptEdits', model: 'old', effort: 'low' }
}
const configuration: ConversationConfiguration = { agent: 'codex', projectPaths: ['/worktree/app', '/worktree/lib'], permissionMode: 'plan', model: 'gpt-6', effort: 'high' }

function connect(features = ['conversation-configuration', 'chat-options']) {
  const sent: Array<{ id: number; method: string; params: unknown }> = []
  const client = createRpcClient((frame) => sent.push(JSON.parse(frame)))
  const rpc: RpcConnection = { ...client, features, close() {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, conversations: { [source.id]: source }, section: 'conversations', selectedConversationId: source.id })
  return { rpc, sent }
}

beforeEach(() => useCore.setState(useCore.getInitialState(), true))
afterEach(() => {
  useInitialMessages.setState({}, true)
  saveComposerDraft(source.id, EMPTY_DRAFT)
  saveComposerDraft(null, EMPTY_DRAFT)
  const from = useCore.getState().conversationDraftFrom
  if (from) saveComposerDraft(from.key, EMPTY_DRAFT)
})

describe('new conversation from current settings', () => {
  it('opens a blank draft from the core snapshot without creating a conversation or touching other drafts', async () => {
    const { rpc, sent } = connect()
    saveComposerDraft(null, { text: 'ordinary draft', mentions: [], images: [] })
    saveComposerDraft(source.id, { text: 'source input', mentions: [], images: [{ id: `${'a'.repeat(64)}.png`, width: 16, height: 16 }] })
    const opening = newConversationFrom(source)
    expect(sent).toMatchObject([{ method: 'conversations.configuration', params: { id: source.id } }])
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, result: configuration }))
    await opening
    const state = useCore.getState()
    expect(state).toMatchObject({ conversationDraft: true, selectedConversationId: null, conversationDraftIssue: null, conversationDraftProjects: { paths: configuration.projectPaths }, conversationDraftFrom: { title: source.title, configuration } })
    expect(state.conversations).toEqual({ [source.id]: source })
    expect(composerDraft(null).text).toBe('ordinary draft')
    expect(composerDraft(source.id).images).toHaveLength(1)
    expect(composerDraft(state.conversationDraftFrom!.key)).toEqual(EMPTY_DRAFT)
    expect(sent).toHaveLength(1)
    const html = renderToStaticMarkup(createElement(ConversationDraft))
    expect(html).toContain('aria-label="权限模式：规划"')
    expect(html).toContain('Original')
    expect(html).toContain('开始新的会话')
    expect(html).not.toContain('ordinary draft')
    expect(html).not.toContain('source input')
  })

  it('preserves the current page on failure and starts afresh on every successful request', async () => {
    const { rpc, sent } = connect()
    const failed = newConversationFrom(source)
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, error: { code: -32000, message: 'source is gone' } }))
    await failed
    expect(useCore.getState()).toMatchObject({ selectedConversationId: source.id, conversationDraft: false })
    const first = newConversationFrom(source)
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[1]?.id, result: configuration }))
    await first
    const previous = useCore.getState().conversationDraftFrom!
    saveComposerDraft(previous.key, { text: 'unsent', mentions: [], images: [] })
    const second = newConversationFrom(source)
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[2]?.id, result: configuration }))
    await second
    expect(useCore.getState().conversationDraftFrom?.key).not.toBe(previous.key)
    expect(composerDraft(previous.key)).toEqual(EMPTY_DRAFT)
  })

  it('offers the header action only for ordinary conversations on a supporting core', () => {
    connect()
    const render = () => renderToStaticMarkup(createElement(ConversationView, { id: source.id }))
    expect(render()).toContain('aria-label="沿用配置开新会话"')
    connect([])
    expect(render()).not.toContain('aria-label="沿用配置开新会话"')
    connect()
    for (const patch of [{ taskId: 'task' }, { discussionId: 'group' }, { routineId: 'routine' }, { squadRunId: 'squad' }, { helperOf: 'parent' }]) {
      useCore.setState({ conversations: { [source.id]: { ...source, ...patch } } })
      expect(render()).not.toContain('aria-label="沿用配置开新会话"')
    }
  })
})

describe('send to a new conversation', () => {
  const image = { id: `${'b'.repeat(64)}.png`, width: 16, height: 16 }
  const created: Conversation = { ...source, id: '22222222-2222-4222-8222-222222222222', agent: 'codex', sessionId: null, chat: undefined }

  it('creates it on the core snapshot and opens it on the message, leaving the source alone', async () => {
    const { rpc, sent } = connect(['conversation-configuration', 'chat-options', 'deferred-conversation-start'])
    const reply = (index: number, result: unknown) => rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[index]?.id, result }))
    const sending = sendToNewConversation(source, 'next task', [image])
    expect(sent).toMatchObject([{ method: 'conversations.configuration', params: { id: source.id } }])
    reply(0, configuration)
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toMatchObject({ method: 'conversations.create', params: {
      agent: 'codex', projectPaths: configuration.projectPaths, deferStart: true, allowBypass: true, permissionMode: 'plan', model: 'gpt-6', effort: 'high'
    } })
    reply(1, created)
    expect(await sending).toBe(true)
    expect(useCore.getState().selectedConversationId).toBe(created.id)
    expect(useInitialMessages.getState()[created.id]).toMatchObject({ text: 'next task', images: [image] })
    await vi.waitFor(() => expect(sent[2]).toMatchObject({ method: 'conversations.continue', params: { id: created.id } }))
    expect(JSON.stringify(sent.slice(1))).not.toContain(source.id)
  })

  it('sends nothing for a conversation whose settings cannot be reused, and stays put when core refuses', async () => {
    const { rpc, sent } = connect()
    expect(await sendToNewConversation({ ...source, taskId: 'task' }, 'next task', [])).toBe(false)
    expect(sent).toHaveLength(0)
    const sending = sendToNewConversation(source, 'next task', [])
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, error: { code: -32000, message: 'source is gone' } }))
    expect(await sending).toBe(false)
    expect(sent).toHaveLength(1)
    expect(useCore.getState().selectedConversationId).toBe(source.id)
  })

})
