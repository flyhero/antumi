import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { handoffMessage, type ChatItem, type Conversation } from '@antumi/protocol'
import { useCore } from '../core-store'
import { useChat } from '../chat-state'
import { useInitialMessages } from '../initial-messages'
import { keepChatDelivery, useChatDeliveries } from '../chat-deliveries'
import { ConversationChat } from './ConversationChat'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})
vi.mock('zustand', async (load) => {
  const zustand = await load<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const conversation: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: '已重命名的排查', titleLocked: true, agent: 'claude',
  workspacePath: '/repo', projectPaths: [], managedWorkspace: false, sessionId: null, createdAt: 0, updatedAt: 0,
  source: { provider: 'github', instance: 'default', name: 'GitHub', key: 'repo/#42', title: '清空重做后采集失败', url: 'https://example.test/issues/42' }
}
const message = (id: string, text: string): ChatItem => ({ kind: 'user', id, stageId: 'first', revision: 0, at: 1, text, images: [] })
const first = message('first', handoffMessage('/handoffs/issue.md', '看下是什么意思？'))
const next = message('next', '继续排查')
const render = (value = conversation) => renderToStaticMarkup(createElement(ConversationChat, { conversation: value }))

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  useChat.setState({ [conversation.id]: { items: [first, next], before: null } }, true)
  useInitialMessages.setState({}, true)
  useChatDeliveries.setState({}, true)
})

describe('outgoing messages', () => {
  const ref = '22222222-2222-4222-8222-222222222222'
  const outgoing = { ref, text: '立即发送的内容', images: [], stageId: 'pending', at: 2 }

  it('shows the local bubble with sending status before any server message', () => {
    keepChatDelivery(conversation.id, outgoing)
    const html = render()
    expect(html.match(/立即发送的内容/g)).toHaveLength(1)
    expect(html).toContain('发送中…')
  })

  it('shows failure and retry below one bubble even when core already recorded it', () => {
    keepChatDelivery(conversation.id, outgoing)
    useChatDeliveries.setState({ [conversation.id]: [{ ...outgoing, phase: 'failed', error: '网络断开' }] })
    useChat.setState({ [conversation.id]: { items: [first, message(`u:${ref}`, outgoing.text)], before: null } }, true)
    const html = render()
    expect(html.match(/立即发送的内容/g)).toHaveLength(1)
    expect(html).toContain('发送失败')
    expect(html).toContain('查看详情')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('网络断开')
    expect(html).toContain('重试')
    expect(html).not.toContain('support-actions')
    expect(html.indexOf('立即发送的内容')).toBeLessThan(html.indexOf('发送失败'))
  })
})

describe('private chat errors', () => {
  const privateError = '内部项目 /repo/private：连接失败'
  const failures: ChatItem[] = [
    { kind: 'notice', id: 'notice', stageId: 'first', revision: 0, at: 2, level: 'error', text: privateError, action: { kind: 'retryTurn', userItemId: first.id } },
    { kind: 'notice', id: 'long-notice', stageId: 'first', revision: 0, at: 2, level: 'error', text: `${privateError}\n${'详细错误\n'.repeat(20)}` },
    { kind: 'turn', id: 'failed-turn', stageId: 'first', revision: 0, at: 2, state: 'failed', error: privateError, durationMs: null, usage: null }
  ]

  it.each(failures)('keeps $kind errors in the chat without author or issue actions', (item) => {
    useChat.setState({ [conversation.id]: { items: [first, item], before: null } }, true)
    const html = render()
    expect(html).toContain(privateError)
    expect(html).not.toContain('support-actions')
    expect(html).not.toContain('找作者')
    expect(html).not.toContain('GitHub Issue')
  })

  it('keeps retry available for a failed first message without a feedback link', () => {
    useChat.setState({}, true)
    useInitialMessages.setState({ [conversation.id]: { ref: 'pending', text: '私人消息', at: 1, images: [], phase: 'failed', error: privateError } }, true)
    const html = render()
    expect(html).toContain(privateError)
    expect(html).toContain('重试')
    expect(html).not.toContain('support-actions')
    expect(html).not.toContain('GitHub Issue')
  })
})

describe('investigation prompt reference', () => {
  it('links the original issue above the first instruction for any source', () => {
    const html = render()
    expect(html.match(/class="chat-investigation-reference"/g)).toHaveLength(1)
    expect(html).toContain('href="https://example.test/issues/42" target="_blank" rel="noreferrer"')
    expect(html).toContain('引用问题 · GitHub')
    expect(html).toContain('repo/#42')
    expect(html).toContain('清空重做后采集失败')
    expect(html.indexOf('清空重做后采集失败')).toBeLessThan(html.indexOf('看下是什么意思？'))
    expect(html).not.toContain('/handoffs/issue.md')
    expect(html).not.toContain('已重命名的排查')
  })

  it('does not label later messages when earlier history has not loaded', () => {
    useChat.setState({ [conversation.id]: { items: [next], before: 'older' } }, true)
    expect(render()).not.toContain('chat-investigation-reference')
    useChat.setState({ [conversation.id]: { items: [first, next], before: null } }, true)
    expect(render()).toContain('chat-investigation-reference')
  })

  it('keeps ordinary conversations unchanged and supports older issue metadata', () => {
    expect(render({ ...conversation, source: null })).not.toContain('chat-investigation-reference')
    const { title: _title, ...source } = conversation.source!
    expect(render({ ...conversation, title: '旧排查标题', source })).toContain('旧排查标题')
  })

  it('shows the same reference while the first message is still being delivered', () => {
    useChat.setState({}, true)
    useInitialMessages.setState({ [conversation.id]: { ref: 'pending', text: '看下是什么意思？', at: 1, images: [], phase: 'starting', error: null } }, true)
    const html = render()
    expect(html.match(/class="chat-investigation-reference"/g)).toHaveLength(1)
    expect(html.indexOf('清空重做后采集失败')).toBeLessThan(html.indexOf('看下是什么意思？'))
  })
})
