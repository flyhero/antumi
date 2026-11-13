import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StateCreator } from 'zustand'
import { beforeEach, expect, it, vi } from 'vitest'
import { AgentProfile, Conversation } from '@antumi/protocol'
import { useCore } from '../core-store'
import { proposeHandoff, useHandoffs } from '../chat-handoff'
import { useComposerHandoff } from './ChatHandoff'

vi.mock('zustand', async (load) => {
  const zustand = await load<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  useHandoffs.setState({}, true)
})

it('offers no handoff for profile conversations, including an already pending handoff', () => {
  const profile = AgentProfile.parse({ id: '11111111-1111-4111-8111-111111111111', name: 'Reviewer', agent: 'claude', archivedAt: null, createdAt: 1, updatedAt: 1 })
  const conversation = Conversation.parse({ id: '22222222-2222-4222-8222-222222222222', title: 'Review', titleLocked: false, agent: 'claude', profile, workspacePath: '/project', projectPaths: ['/project'], managedWorkspace: false, sessionId: null, createdAt: 1, updatedAt: 1 })
  proposeHandoff(conversation.id, 'codex')
  const render = (chat: Conversation) => renderToStaticMarkup(createElement(() => {
    const handoff = useComposerHandoff(chat)
    return JSON.stringify({ targets: handoff.targets, target: handoff.target })
  }))
  expect(render(conversation)).toBe('{&quot;targets&quot;:[],&quot;target&quot;:null}')
  expect(render({ ...conversation, profile: null })).toContain('codex')
})
