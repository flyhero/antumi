import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { Conversation, createRpcClient, type RpcConnection, type SourceInbox, type SourceIssue } from '@antumi/protocol'
import { openConversationDraft, useCore } from '../core-store'
import { SourceInboxView } from './SourceInboxView'

// Read the live store instead of Zustand's fixed SSR hydration snapshot.
vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const conversationId = '11111111-1111-4111-8111-111111111111'
const issue = (key: string, patch: Partial<SourceIssue> = {}): SourceIssue => ({
  key, title: `Bug ${key}`, url: `https://github.com/acme/app/issues/${key}`, status: 'Open', statusCategory: 'todo',
  type: 'Issue', priority: null, updatedAt: null, conversationId: null, ...patch
})
const inbox = (items: SourceIssue[]): SourceInbox => ({
  provider: 'github', instance: 'default', active: true, items, dismissed: [], refreshedAt: 0, refreshing: false, problem: null
})

function connect(features: string[]): void {
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features, close: () => {}, closed: new Promise(() => {}) }
  useCore.setState({
    connection: 'connected', rpc,
    sources: [{ provider: 'github', name: 'GitHub', settings: [], instances: [{ instance: 'default', enabled: true, settings: {}, credential: { configured: true, source: 'store', account: null } }] }],
    inboxes: { 'github/default': inbox([issue('1'), issue('2', { conversationId })]) }
  })
}

const render = () => renderToStaticMarkup(createElement(SourceInboxView))
const row = (html: string, key: string) => html.split('<li class="inbox-row"').find((part) => part.includes(`>${key}</a>`)) ?? ''
beforeEach(() => useCore.setState(useCore.getInitialState(), true))

describe('source inbox', () => {
  it('offers inline viewing only with a compatible core and preserves original links', () => {
    connect(['source-issue-preview'])
    expect(render().match(/class="button inbox-view"/g)).toHaveLength(2)
    expect(render()).toContain('inbox-row-view-title')
    expect(render()).toContain('href="https://github.com/acme/app/issues/1"')
    connect([])
    expect(render()).not.toContain('inbox-view')
    expect(render()).not.toContain('inbox-row-view-title')
  })
  it('offers source installation only when no provider is installed and the core supports plugins', () => {
    connect(['plugins'])
    useCore.setState({ sources: [], inboxes: {} })
    expect(render()).toContain('>安装插件</button>')
    expect(render()).toContain('设置 → 插件')

    connect(['plugins'])
    useCore.setState({ inboxes: {} })
    expect(render()).toContain('>去设置</button>')
    expect(render()).not.toContain('>安装插件</button>')

    connect([])
    useCore.setState({ sources: [], inboxes: {} })
    expect(render()).toContain('>去设置</button>')
    expect(render()).not.toContain('>安装插件</button>')
  })

  it('offers to look into an issue, and once one is, the conversation instead', () => {
    connect(['source-investigate'])
    useCore.setState({ conversations: { [conversationId]: Conversation.parse({ id: conversationId, title: 'Bug 2', titleLocked: true, agent: 'claude', workspacePath: '/w', projectPaths: [], managedWorkspace: false, sessionId: null, createdAt: 0, updatedAt: 0 }) } })
    const html = render()
    expect(row(html, '1')).toContain('>会话排查</button>')
    expect(row(html, '1')).not.toContain('排查中')
    expect(row(html, '2')).toContain('排查中')
    expect(row(html, '2')).toContain('>看会话</button>')
    expect(row(html, '2')).not.toContain('>会话排查</button>')
  })

  it('treats an issue whose conversation is gone as not looked into, and offers nothing new to an older core', () => {
    connect(['source-investigate'])
    expect(row(render(), '2')).toContain('>会话排查</button>')
    connect([])
    expect(render()).not.toContain('>会话排查</button>')
  })

  it('opens the new-conversation page on the issue, with the projects asked for', () => {
    const picked = { provider: 'github', instance: 'default', key: '1', title: 'Bug 1', url: 'https://github.com/acme/app/issues/1', source: 'GitHub' }
    openConversationDraft(['/code/app'], picked)
    expect(useCore.getState()).toMatchObject({ conversationDraft: true, section: 'conversations', conversationDraftIssue: picked, conversationDraftProjects: { paths: ['/code/app'] } })
    openConversationDraft()
    expect(useCore.getState().conversationDraftIssue).toBeNull()
  })
})
