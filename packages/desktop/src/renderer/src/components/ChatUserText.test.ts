import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationReference, type Conversation } from '@antumi/protocol'
import { useCore } from '../core-store'
import { ChatUserText } from './ChatUserText'
import { ChatMarkdown } from './ChatMarkdown'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

// Server rendering otherwise reads Zustand's initial snapshot, before the test's fixtures.
vi.mock('../core-store', async (load) => {
  const actual = await load<typeof import('../core-store')>()
  const useLiveCore = <T>(select: (state: ReturnType<typeof actual.useCore.getState>) => T) => select(actual.useCore.getState())
  return { ...actual, useCore: Object.assign(useLiveCore, actual.useCore) }
})

const original = useCore.getState().conversations
const conversation: Conversation = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001', title: '鉴权方案', titleLocked: false, agent: 'claude',
  workspacePath: '/code/api', projectPaths: ['/code/api'], managedWorkspace: false, sessionId: null, createdAt: 1, updatedAt: 2
}
afterEach(() => useCore.setState({ conversations: original }))

describe('conversation reference display', () => {
  it('shows a linked title in user prose and assistant Markdown while leaving ordinary user Markdown literal', () => {
    useCore.setState({ conversations: { [conversation.id]: conversation } })
    const reference = conversationReference(conversation.id, conversation.title)
    const html = renderToStaticMarkup(createElement(ChatUserText, { text: `**参考** ${reference} https://example.com` }))
    expect(html).toContain('**参考**')
    expect(html).toContain(`data-conversation-id="${conversation.id}"`)
    expect(html).toContain('>鉴权方案</button>')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('antumi://')
    expect(html).not.toContain('disabled')
    expect(renderToStaticMarkup(createElement(ChatMarkdown, { text: reference, highlight: false }))).toContain(`data-conversation-id="${conversation.id}"`)
  })

  it('keeps the saved title visible when the source has been deleted, without an external link', () => {
    useCore.setState({ conversations: {} })
    const html = renderToStaticMarkup(createElement(ChatUserText, { text: conversationReference(conversation.id, '<旧方案>') }))
    expect(html).toContain('disabled=""')
    expect(html).toContain('&lt;旧方案&gt;')
    expect(html).not.toContain('href=')
  })
})
