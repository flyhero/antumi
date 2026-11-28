import { describe, expect, it } from 'vitest'
import { managedInput } from './managed-input'

const FEATURES = ['managed-steer']
const member = { agent: 'codex' as const, sessionId: 's1', archivedAt: null, parentConversationId: 'parent', squadRunId: null, chat: { turn: 'running' as const } }

describe('what a managed conversation takes from the user', () => {
  it('takes a message into the turn its agent runs, for a delegation and a squad alike', () => {
    expect(managedInput(member, true, FEATURES)).toBe('steer')
    expect(managedInput({ ...member, parentConversationId: null, squadRunId: 'run' }, true, FEATURES)).toBe('steer')
  })

  it('takes nothing where no turn runs, the turn takes none, or the agent may run it after the turn', () => {
    expect(managedInput({ ...member, chat: { turn: 'idle' } }, true, FEATURES)).toBeNull()
    expect(managedInput({ ...member, chat: { turn: 'running', betweenTurns: true } }, true, FEATURES)).toBeNull()
    expect(managedInput({ ...member, sessionId: null }, true, FEATURES)).toBeNull()
    expect(managedInput(member, false, FEATURES)).toBeNull()
    expect(managedInput({ ...member, agent: 'zcode' }, true, FEATURES)).toBeNull()
    expect(managedInput({ ...member, agent: 'opencode' }, true, FEATURES)).toBeNull()
  })

  it('leaves an older core and a conversation of the user\'s own as they were', () => {
    expect(managedInput(member, true, [])).toBeNull()
    expect(managedInput({ ...member, parentConversationId: null }, true, FEATURES)).toBeNull()
  })
})
