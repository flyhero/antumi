import { describe, expect, it } from 'vitest'
import { AgentCall, type ChatItem } from '@antumi/protocol'
import { chatBlocks, type ChatBlock } from './chat-state'
import { agentResultCallIds } from './delegation-delivery'
import { withDelegations } from './delegation-timeline'

const call = AgentCall.parse({ result: null, error: null, delivered: false,
  id: '11111111-1111-4111-8111-111111111111', parentId: '22222222-2222-4222-8222-222222222222', conversationId: '33333333-3333-4333-8333-333333333333',
  profile: { id: '44444444-4444-4444-8444-444444444444', name: '审查员', agent: 'codex', archivedAt: null, createdAt: 0, updatedAt: 0 },
  instruction: 'Review the change', ref: 'review', permissionMode: 'readOnly', readOnly: true, state: 'queued', createdAt: 15, updatedAt: 15
})
const base = { stageId: 'stage', revision: 1 }
const user = (id: string, at: number): ChatItem => ({ ...base, kind: 'user', id, at, text: 'work', images: [] })
const reply = (id: string, at: number): ChatItem => ({ ...base, kind: 'assistant', id, at, text: 'answer', streaming: false })
const dispatch = (output: string | null = null): Extract<ChatItem, { kind: 'tool' }> => ({ ...base, kind: 'tool', id: 'dispatch', at: 10, name: 'mcp__antumi__antumi_agent_dispatch', title: 'Delegate', input: JSON.stringify({ ref: 'review' }), output, status: 'done', diffs: [] })
const grouped = (items: ChatItem[], foldTurns = true) => chatBlocks(items.map((item) => ({ kind: 'item' as const, item })), { foldTurns })
const cards = (blocks: ChatBlock[]) => blocks.filter((block) => block.kind === 'delegation')

describe('delegation placement', () => {
  it('keeps the card outside folded work and before the answer, with a stable key as state changes', () => {
    const blocks = grouped([user('u', 0), dispatch(), reply('answer', 20), { ...base, kind: 'turn', id: 'end', at: 25, state: 'completed', error: null, durationMs: 25 }])
    for (const state of ['queued', 'running', 'completed'] as const) {
      const shown = withDelegations(blocks, [{ ...call, state }], false)
      const index = shown.findIndex((block) => block.kind === 'delegation')
      expect(shown[index - 1]?.kind).toBe('fold')
      expect(shown[index + 1]).toMatchObject({ kind: 'entry', entry: { item: { id: 'answer' } } })
      expect(cards(shown)).toEqual([{ kind: 'delegation', key: `delegation:${call.id}`, calls: [{ ...call, state }] }])
    }
  })

  it('places manual work after the preceding turn, before its later delivery', () => {
    const blocks = grouped([reply('a', 20), user(`u:agent-result:${call.id}`, 50), reply('b', 60)])
    const shown = withDelegations(blocks, [{ ...call, createdAt: 30 }], false)
    expect(shown.map((block) => block.kind)).toEqual(['entry', 'delegation', 'entry', 'entry'])
  })

  it('only adds older cards to a partial history when their delivery is visible, then moves them to their dispatch', () => {
    const tail = grouped([user(`u:agent-result:${call.id}`, 50), reply('b', 60)])
    expect(cards(withDelegations(tail, [call, { ...call, id: '55555555-5555-4555-8555-555555555555' }], true))).toHaveLength(1)
    // Results that came back together share one delivery.
    const other = { ...call, id: '55555555-5555-4555-8555-555555555555' }
    const together = grouped([user(`u:agent-result:${call.id},${other.id}`, 50), reply('b', 60)])
    expect(agentResultCallIds({ kind: 'user', id: `u:agent-result:${call.id},${other.id}` })).toEqual([call.id, other.id])
    expect(cards(withDelegations(together, [call, other], true))).toHaveLength(1)
    expect(cards(withDelegations(together, [call, other], true))[0]).toMatchObject({ calls: [call, other] })
    const full = grouped([user('u', 0), dispatch(JSON.stringify(call)), ...tail.flatMap((block) => block.kind === 'entry' && block.entry.kind === 'item' ? [block.entry.item] : [])])
    const shown = withDelegations(full, [call], false)
    expect(cards(shown)).toHaveLength(1)
    expect(shown[shown.findIndex((block) => block.kind === 'delegation') - 1]?.kind).toBe('tools')
  })

  it('keeps concurrent calls in creation order and matches a returned id when tool input is absent', () => {
    const other = { ...call, id: '55555555-5555-4555-8555-555555555555', ref: null, createdAt: 16 }
    const tool = dispatch(other.id)
    const blocks = grouped([user('u', 0), { ...tool, kind: 'tool', input: null }, reply('a', 20)])
    const shown = withDelegations(blocks, [other, call], false)
    expect(cards(shown).flatMap((block) => block.calls.map((each) => each.id))).toEqual([call.id, other.id])
    // Dispatched in the same turn, they are one fan-out, not a card each.
    expect(cards(shown)).toHaveLength(1)
    expect(cards(withDelegations([], [call], false))).toHaveLength(1)
    expect(cards(withDelegations([], [call], true))).toHaveLength(0)
  })
})
