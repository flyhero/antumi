import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatItem, Conversation } from '@antumi/protocol'
import { useAgentCatalog } from '../agent-models'
import { useCore } from '../core-store'
import { ChatOptionsBar, switchesProvider } from './ChatOptionsBar'

vi.mock('../agent-models', () => ({ useAgentCatalog: vi.fn() }))

const conversation: Conversation = {
  id: 'imported', title: 'Imported session', titleLocked: false, agent: 'zcode',
  workspacePath: '/repo', projectPaths: [], managedWorkspace: false, sessionId: null,
  createdAt: 0, updatedAt: 0,
  chatOptions: { permissionMode: null, model: 'zai/flash', effort: null, account: null }
}
const state: Extract<ChatItem, { kind: 'state' }> = {
  id: 'state', stageId: 'imported', at: 0, revision: 1, kind: 'state',
  permissionMode: null, permissionModes: [], model: null, models: [], effort: null,
  context: null, todos: [], activity: null, turnUsage: null, queued: null, queue: [], steerable: false, commands: []
}
const model = { id: 'zai/flash', label: 'GLM Flash', description: null, efforts: [], isDefault: true }

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  vi.mocked(useAgentCatalog).mockReset().mockReturnValue({ models: [model] })
})

describe('models before an imported session resumes', () => {
  it.each([state, null])('offers the catalog when the transcript has no model list (%j)', (state) => {
    const html = renderToStaticMarkup(createElement(ChatOptionsBar, { conversation, state }))
    expect(html).toContain('GLM Flash')
    expect(useAgentCatalog).toHaveBeenCalledWith('zcode', true, null, undefined)
  })

  it('keeps an unavailable selected provider in catalog requests instead of using native models', () => {
    const providerId = '00000000-0000-4000-8000-000000000123'
    renderToStaticMarkup(createElement(ChatOptionsBar, { conversation: { ...conversation, modelProvider: providerId }, state: null }))
    expect(useAgentCatalog).toHaveBeenCalledWith('zcode', true, null, providerId)
  })

  it('discards stale stage models after a provider switch that still needs to restart', () => {
    const render = (selected: string | null) => renderToStaticMarkup(createElement(ChatOptionsBar, {
      conversation: { ...conversation, providerChangePending: true, chatOptions: { permissionMode: null, model: selected, effort: null, account: null } },
      state: { ...state, model: 'stale-provider-model', models: [{ ...model, id: 'stale-provider-model', label: 'Old provider model' }] }
    }))
    const html = render(null)
    expect(html).toContain('默认模型')
    expect(html).not.toContain('Old provider model')
    expect(render('zai/flash')).toContain('GLM Flash')
    expect(useAgentCatalog).toHaveBeenCalledWith('zcode', true, null, undefined)
  })

  it('keeps a stopped stage’s model list when it already has one', () => {
    const html = renderToStaticMarkup(createElement(ChatOptionsBar, { conversation, state: { ...state, models: [{ ...model, label: 'Stage model' }] } }))
    expect(html).toContain('Stage model')
    expect(html).not.toContain('GLM Flash')
    expect(useAgentCatalog).toHaveBeenCalledWith('zcode', false, null, undefined)
  })

  it('takes live model choices only from the running agent', () => {
    const html = renderToStaticMarkup(createElement(ChatOptionsBar, { conversation: { ...conversation, sessionId: 'running' }, state }))
    expect(html).not.toContain('GLM Flash')
    expect(useAgentCatalog).toHaveBeenCalledWith('zcode', false, null, undefined)
  })
})

describe('switchesProvider', () => {
  const features = ['provider-selection-v2']
  const own = { ...conversation, agent: 'claude' as const }

  it('offers switching in an ordinary conversation of an agent that takes providers', () => {
    expect(switchesProvider(own, features)).toBe(true)
  })

  it('leaves the route badge where the provider is inherited, unsupported or the core is older', () => {
    expect(switchesProvider({ ...own, squadRunId: 'run' }, features)).toBe(false)
    expect(switchesProvider({ ...own, helperOf: 'parent' }, features)).toBe(false)
    expect(switchesProvider({ ...own, discussionId: 'talk' }, features)).toBe(false)
    expect(switchesProvider({ ...own, agent: 'cursor' }, features)).toBe(false)
    expect(switchesProvider(own, [])).toBe(false)
  })
})
