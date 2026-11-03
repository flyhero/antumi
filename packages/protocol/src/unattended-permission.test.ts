import { describe, expect, it } from 'vitest'
import { AGENT_KINDS } from './agent'
import { agentDescriptor } from './agents'
import type { ChatModel } from './chat'
import { startModes, unattendedPermission } from './unattended-permission'

const model = (autoMode?: boolean): ChatModel => ({ id: 'm', label: 'M', description: null, efforts: [], isDefault: true, ...(autoMode === undefined ? {} : { autoMode }) })

describe('unattendedPermission', () => {
  it('runs a careful run in each agent\'s own mode for it, as its model takes it', () => {
    const careful = (agent: Parameters<typeof startModes>[0], autoMode?: boolean) => unattendedPermission(agent, 'acceptEdits', startModes(agent, model(autoMode)))
    expect(careful('claude', true)).toBe('auto')
    expect(careful('claude')).toBe('acceptEdits')
    expect(careful('zcode', true)).toBe('auto')
    expect(careful('zcode')).toBe('acceptEdits')
    // Kimi has no accepting of edits; its auto needs nothing of the model.
    expect(careful('kimi')).toBe('auto')
    for (const agent of ['codex', 'opencode', 'pi', 'dsh', 'gemini'] as const) expect(careful(agent)).toBe('acceptEdits')
  })

  it('allows everything only where it is offered, and gives nothing for an agent with none of its modes', () => {
    expect(unattendedPermission('codex', 'bypass', startModes('codex', model()))).toBe('bypass')
    expect(unattendedPermission('codex', 'bypass', ['ask', 'acceptEdits'])).toBeNull()
    expect(unattendedPermission('kimi', 'acceptEdits', ['ask', 'plan'])).toBeNull()
  })

  it('names for every agent that can run unattended a careful mode it can start in', () => {
    for (const agent of AGENT_KINDS.filter((each) => agentDescriptor(each).capabilities.unattended)) {
      expect(unattendedPermission(agent, 'acceptEdits', startModes(agent, model(true))), agent).not.toBeNull()
    }
  })
})
