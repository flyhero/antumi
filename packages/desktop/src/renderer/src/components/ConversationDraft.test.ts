import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StateCreator } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentProfile, createRpcClient, type RpcConnection } from '@antumi/protocol'
import { useCore } from '../core-store'
import { EMPTY_DRAFT, saveComposerDraft } from '../composer-drafts'
import { ConversationDraft } from './ConversationDraft'

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

beforeEach(() => {
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features: ['chat-images', 'source-investigate', 'source-investigate-images'], close() {}, closed: new Promise(() => {}) }
  useCore.setState({ ...useCore.getInitialState(), rpc, conversationDraftIssue: { provider: 'demo', instance: 'default', source: 'Demo', key: 'D-1', title: 'Issue', url: 'https://example.test/issues/D-1' } }, true)
  saveComposerDraft(null, { ...EMPTY_DRAFT, images: [{ id: `${'a'.repeat(64)}.png`, width: 8, height: 6 }] })
})

describe('investigation draft images', () => {
  const render = () => renderToStaticMarkup(createElement(ConversationDraft))

  it('shows attached images with remove and add controls in an investigation draft', () => {
    const html = render()
    expect(html).toContain('chat-draft-source')
    expect(html).toContain('class="chat-images"')
    expect(html).toContain('class="chat-image-remove"')
    expect(html).toContain('class="chat-add-button"')
  })

  it('hides investigation image controls on older cores while ordinary drafts still support images', () => {
    const rpc = useCore.getState().rpc
    if (!rpc) throw new Error('missing test connection')
    useCore.setState({ rpc: { ...rpc, features: ['chat-images', 'source-investigate'] } })
    expect(render()).not.toContain('class="chat-add-button"')
    expect(render()).not.toContain('class="chat-images"')
    useCore.setState({ conversationDraftIssue: null })
    expect(render()).toContain('class="chat-add-button"')
    expect(render()).toContain('class="chat-images"')
  })
})

it('opens an agent-specific draft without agent selection or group chat controls', () => {
  const profile = AgentProfile.parse({ id: '11111111-1111-4111-8111-111111111111', name: '代码审查', description: '检查代码并提出建议', agent: 'codex', capability: 'readOnly', archivedAt: null, createdAt: 1, updatedAt: 1 })
  const rpc = useCore.getState().rpc
  if (!rpc) throw new Error('missing test connection')
  useCore.setState({ rpc: { ...rpc, features: [...rpc.features, 'discussions'] }, conversationDraftIssue: null, draftProfileId: profile.id, agentProfiles: { [profile.id]: profile } })
  const html = renderToStaticMarkup(createElement(ConversationDraft))
  expect(html).toContain('代码审查</h2>')
  expect(html).toContain('检查代码并提出建议')
  expect(html).toContain('agent-avatar')
  expect(html).not.toContain('role="radiogroup"')
  expect(html).not.toContain('chat-draft-invite')
  expect(html).not.toContain('chat-draft-agent"')

  useCore.setState({ draftProfileId: null })
  const ordinary = renderToStaticMarkup(createElement(ConversationDraft))
  expect(ordinary).toContain('aria-label="agent"')
  expect(ordinary).toContain('chat-draft-mode')
  expect(ordinary).toContain('chat-draft-invite')
})
