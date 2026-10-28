import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationReference, type ChatReference, type Conversation } from '@antumi/protocol'
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
  it('draws only explicitly picked files and agents as short reference marks', () => {
    const text = '**参考** @src/SupportSettings.tsx @代码审查员 https://example.com'
    const references: ChatReference[] = [
      { start: 7, end: 30, target: { kind: 'file', path: '/repo/src/SupportSettings.tsx', relative: 'src/SupportSettings.tsx' } },
      { start: 31, end: 37, target: { kind: 'agent', id: 'bbbbbbbb-0000-4000-8000-000000000002', name: '代码审查员' } }
    ]
    const html = renderToStaticMarkup(createElement(ChatUserText, { text, references }))
    expect(html).toContain('data-reference-kind="file"')
    expect(html).toContain('data-reference-kind="agent"')
    expect(html).toContain('>SupportSettings.tsx</span>')
    expect(html).toContain('>代码审查员</span>')
    expect(html).toContain('**参考**')
    expect(renderToStaticMarkup(createElement(ChatUserText, { text }))).not.toMatch(/data-reference-kind="(file|agent)"/)
  })

  it('shows a linked title in user prose and assistant Markdown while leaving ordinary user Markdown literal', () => {
    useCore.setState({ conversations: { [conversation.id]: conversation } })
    const reference = conversationReference(conversation.id, conversation.title)
    const html = renderToStaticMarkup(createElement(ChatUserText, { text: `**参考** ${reference} https://example.com` }))
    expect(html).toContain('**参考**')
    expect(html).toContain(`data-conversation-id="${conversation.id}"`)
    expect(html).toContain('>鉴权方案</span>')
    expect(html).toContain('data-reference-kind="link" title="https://example.com"')
    expect(html).not.toContain('antumi://')
    expect(html).not.toContain('disabled')
    expect(renderToStaticMarkup(createElement(ChatMarkdown, { text: reference, highlight: false }))).toContain(`data-conversation-id="${conversation.id}"`)
  })

  it('keeps the saved title visible when the source has been deleted, without an external link', () => {
    useCore.setState({ conversations: {} })
    const html = renderToStaticMarkup(createElement(ChatUserText, { text: conversationReference(conversation.id, '<旧方案>') }))
    expect(html).toContain('disabled=""')
    expect(html).toContain('&lt;旧方案&gt;')
    expect(html).not.toContain('data-reference-kind="link"')
  })

  it('draws a web address as a chip naming it short, the full address kept for its tooltip', () => {
    const html = renderToStaticMarkup(createElement(ChatUserText, { text: '看下https://www.example.com/docs/。' }))
    expect(html).toContain('看下<button')
    expect(html).toContain('title="https://www.example.com/docs/"')
    expect(html).toContain('>example.com/docs</span>')
    expect(html).toContain('</button>。')
  })
})
