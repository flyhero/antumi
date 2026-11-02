import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { Conversation, createRpcClient, Discussion, type RpcConnection } from '@antumi/protocol'
import { useCore } from '../core-store'
import { usePreferences } from '../preferences'
import { ConversationList } from './ConversationList'

// Read the live store instead of Zustand's fixed SSR hydration snapshot.
vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const chat = (n: number, title: string, archivedAt: number | null) => Conversation.parse({
  id: id(n), title, titleLocked: false, agent: 'claude', workspacePath: '/w', projectPaths: [], managedWorkspace: false,
  sessionId: null, createdAt: n, updatedAt: n, archivedAt
})
const discussion = (n: number, title: string, archivedAt: number | null) => Discussion.parse({
  id: id(n), title, topic: title, projectPaths: [], members: [], chairId: id(99), maxRounds: 3, anonymous: false,
  state: 'done', step: null, round: 1, lastRound: 1, pinnedAt: null, archivedAt, createdAt: n, updatedAt: n
})

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features: ['discussions', 'discussion-archive', 'conversation-archive'], close: () => {}, closed: new Promise(() => {}) }
  useCore.setState({
    connection: 'connected', rpc,
    conversations: { [id(1)]: chat(1, '在用的会话', null), [id(2)]: chat(2, '归档的会话', 5) },
    discussions: { [id(3)]: discussion(3, '在用的群聊', null), [id(4)]: discussion(4, '归档的群聊', 5) }
  })
  usePreferences.setState({ showArchivedConversations: false, conversationKinds: 'all', conversationGroup: 'project', foldedConversationGroups: [] })
})

describe('conversations and group chats in the sidebar', () => {
  it('keeps the most urgent status compact while the tooltip includes every state', () => {
    const first = { ...chat(1, '等待批准', null), sessionId: 's', chat: { turn: 'awaiting' as const } }
    const second = { ...chat(2, '正在运行', null), sessionId: 's', chat: { turn: 'running' as const } }
    useCore.setState({ conversations: { [first.id]: first, [second.id]: second }, discussions: {}, unseen: { [second.id]: true } })
    usePreferences.setState({ foldedConversationGroups: ['project:group:无项目'] })
    const html = renderToStaticMarkup(createElement(ConversationList))
    expect(html).toContain('title="1 个等你处理 · 1 个有新回复 · 1 个运行中"')
    expect(html).toContain('data-state="awaiting"')
    expect(html).not.toContain('data-state="running"')
    expect(html).not.toContain('data-state="unseen"')
  })

  it('shows activity only in folded headings and preserves unread state when the group opens', () => {
    useCore.setState({ unseen: { [id(1)]: true } })
    usePreferences.setState({ foldedConversationGroups: ['project:group:无项目'] })
    const folded = renderToStaticMarkup(createElement(ConversationList))
    expect(folded).toContain('conversation-group-activity')
    expect(folded).toContain('1 个有新回复')
    expect(folded).not.toContain('data-conversation-id')
    usePreferences.setState({ foldedConversationGroups: [] })
    const opened = renderToStaticMarkup(createElement(ConversationList))
    expect(opened).not.toContain('conversation-group-activity')
    expect(opened).toContain('data-glyph="unseen"')
    expect(useCore.getState().unseen[id(1)]).toBe(true)
    usePreferences.setState({ foldedConversationGroups: ['project:group:无项目'] })
    useCore.setState({ unseen: {} })
    expect(renderToStaticMarkup(createElement(ConversationList))).not.toContain('conversation-group-activity')
  })

  it('lists both in one list, archived ones out of sight until asked for', () => {
    const list = renderToStaticMarkup(createElement(ConversationList))
    expect(list).toContain('在用的会话')
    expect(list).toContain('在用的群聊')
    expect(list).not.toContain('已归档')
    expect(list).not.toContain('归档的会话')
    expect(list).not.toContain('归档的群聊')
  })

  it('shows both kinds, opened, at the end once asked for', () => {
    usePreferences.setState({ showArchivedConversations: true })
    expect(renderToStaticMarkup(createElement(ConversationList))).toMatch(/已归档.*归档的(会话|群聊).*归档的(会话|群聊)/s)
  })

  it('keeps to one kind with the filter in sight, and to conversations on a core without group chats', () => {
    usePreferences.setState({ conversationKinds: 'discussions' })
    const groups = renderToStaticMarkup(createElement(ConversationList))
    expect(groups).toContain('在用的群聊')
    expect(groups).not.toContain('在用的会话')
    expect(groups).toContain('仅群聊')
    const rpc = useCore.getState().rpc
    if (rpc) useCore.setState({ rpc: { ...rpc, features: ['conversation-archive'] } })
    const old = renderToStaticMarkup(createElement(ConversationList))
    expect(old).toContain('在用的会话')
    expect(old).not.toContain('在用的群聊')
    expect(old).not.toContain('仅群聊')
  })
})
