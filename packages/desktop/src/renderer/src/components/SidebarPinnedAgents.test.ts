import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { AgentProfile, Conversation } from '@antumi/protocol'
import { useCore } from '../core-store'
import { usePreferences } from '../preferences'
import { SidebarPinnedAgents } from './SidebarPinnedAgents'

vi.mock('zustand', async (original) => {
  const zustand = await original<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const id = '11111111-1111-4111-8111-111111111111'
const profile = AgentProfile.parse({ id, name: '代码审查', agent: 'claude', archivedAt: null, createdAt: 1, updatedAt: 1 })
const conversation = Conversation.parse({ id: '22222222-2222-4222-8222-222222222222', title: '检查改动', titleLocked: false, profile, agent: 'claude', workspacePath: '/project', projectPaths: ['/project'], managedWorkspace: false, sessionId: 'session', chat: { turn: 'running' }, createdAt: 1, updatedAt: 1 })

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  usePreferences.setState({ pinnedAgentIds: [id] })
  useCore.setState({ agentProfiles: { [id]: profile }, conversations: { [conversation.id]: conversation } })
})

it('shows a named agent shortcut with its avatar and the conversation status', () => {
  const html = renderToStaticMarkup(createElement(SidebarPinnedAgents))
  expect(html).toContain('aria-label="代码审查"')
  expect(html).toContain('agent-avatar')
  expect(html).toContain('data-glyph="running"')
  expect(html).toContain('代码审查 · 检查改动')
  expect(html).not.toContain('aria-current="true"')
  useCore.setState({ overviewOpen: false, section: 'conversations', selectedConversationId: conversation.id })
  expect(renderToStaticMarkup(createElement(SidebarPinnedAgents))).toContain('aria-current="true"')
})

it('shows an agent with no conversation, and hides unpinned, archived or missing profiles', () => {
  useCore.setState({ conversations: {} })
  expect(renderToStaticMarkup(createElement(SidebarPinnedAgents))).toContain('代码审查')
  usePreferences.setState({ pinnedAgentIds: [] })
  expect(renderToStaticMarkup(createElement(SidebarPinnedAgents))).toBe('')
  usePreferences.setState({ pinnedAgentIds: [id] })
  useCore.setState({ agentProfiles: { [id]: { ...profile, archivedAt: 10 } } })
  expect(renderToStaticMarkup(createElement(SidebarPinnedAgents))).toBe('')
  useCore.setState({ agentProfiles: {} })
  expect(renderToStaticMarkup(createElement(SidebarPinnedAgents))).toBe('')
})
