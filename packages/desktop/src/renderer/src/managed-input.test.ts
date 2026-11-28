import { describe, expect, it } from 'vitest'
import { managedInput } from './managed-input'

const FEATURES = ['managed-steer', 'agent-call-redirect']
const member = { agent: 'codex' as const, sessionId: 's1', archivedAt: null, parentConversationId: 'parent', agentCallId: 'call', squadRunId: null, chat: { turn: 'running' as const } }
const squadMember = { ...member, parentConversationId: null, agentCallId: null, squadRunId: 'run' }

describe('what a managed conversation takes from the user', () => {
  it('takes a message into the turn its agent runs, for a delegation and a squad alike', () => {
    expect(managedInput(member, true, FEATURES)).toBe('steer')
    expect(managedInput(squadMember, true, FEATURES)).toBe('steer')
  })

  it('offers a delegation whose agent takes none into its turn, or may run it after the turn, an interruption instead', () => {
    expect(managedInput(member, false, FEATURES)).toBe('redirect')
    expect(managedInput({ ...member, agent: 'zcode' }, true, FEATURES)).toBe('redirect')
    expect(managedInput({ ...member, agent: 'opencode' }, false, FEATURES)).toBe('redirect')
    // A core that steers but does not redirect, and the other way round.
    expect(managedInput({ ...member, agent: 'opencode' }, false, ['managed-steer'])).toBeNull()
    expect(managedInput(member, true, ['agent-call-redirect'])).toBe('redirect')
  })

  it('offers a squad\'s member no interruption: it has no going on, only a retry', () => {
    expect(managedInput(squadMember, false, FEATURES)).toBeNull()
    expect(managedInput({ ...squadMember, agent: 'opencode' }, false, FEATURES)).toBeNull()
  })

  it('takes nothing where no turn runs', () => {
    expect(managedInput({ ...member, chat: { turn: 'idle' } }, true, FEATURES)).toBeNull()
    expect(managedInput({ ...member, chat: { turn: 'running', betweenTurns: true } }, true, FEATURES)).toBeNull()
    expect(managedInput({ ...member, sessionId: null }, true, FEATURES)).toBeNull()
  })

  it('leaves an older core and a conversation of the user\'s own as they were', () => {
    expect(managedInput(member, true, [])).toBeNull()
    expect(managedInput({ ...member, parentConversationId: null, agentCallId: null }, true, FEATURES)).toBeNull()
  })
})
