import { describe, expect, it } from 'vitest'
import { agentResultCallIds } from './delegation-delivery'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'

describe('delegation results in the chat', () => {
  it('reads the calls a result message brings back, a call taken up again by its id alone', () => {
    expect(agentResultCallIds({ kind: 'user', id: `u:agent-result:${a}` })).toEqual([a])
    expect(agentResultCallIds({ kind: 'user', id: `u:agent-result:${a}#2,${b}` })).toEqual([a, b])
    expect(agentResultCallIds({ kind: 'user', id: 'u:other' })).toEqual([])
    expect(agentResultCallIds({ kind: 'assistant', id: `u:agent-result:${a}` })).toEqual([])
  })
})
