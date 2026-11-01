import { describe, expect, it } from 'vitest'
import type { DiscussionPost } from '@antumi/protocol'
import { discussionProgress, EVERYONE, mentionChoices, mentionedMembers, mentionQuery, mergePosts } from './discussions'

const post = (sequence: number, patch: Partial<DiscussionPost> = {}): DiscussionPost => ({
  id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, discussionId: '00000000-0000-4000-8000-000000000100',
  sequence, round: 1, memberId: null, kind: 'user', text: `p${sequence}`, mentions: [], topic: false, state: 'done', error: null, stage: null, version: null, verdict: null, createdAt: 0, updatedAt: sequence,
  ...patch
})

describe('group chat helpers', () => {
  it('merges posts by id in sequence order, keeping the newest revision', () => {
    const pending = post(2, { state: 'pending', updatedAt: 5 })
    const merged = mergePosts([post(3), pending], [post(1), { ...pending, state: 'done', text: 'said', updatedAt: 9 }])
    expect(merged.map((each) => [each.sequence, each.state])).toEqual([[1, 'done'], [2, 'done'], [3, 'done']])
    expect(mergePosts(merged, [{ ...pending, updatedAt: 1 }])[1]?.text).toBe('said')
  })

  it('reads @names, the longer of two names that share a start first', () => {
    const members = [{ id: 'a', name: 'Claude' }, { id: 'b', name: 'Claude · opus' }, { id: 'c', name: 'Codex' }]
    expect(mentionedMembers('@Claude · opus why?', members)).toEqual(['b'])
    expect(mentionedMembers('@Claude and @Codex', members)).toEqual(['a', 'c'])
    expect(mentionedMembers('no one', members)).toEqual([])
  })

  it('reads @所有人 as every member', () => {
    const members = [{ id: 'a', name: 'Claude' }, { id: 'c', name: 'Codex' }]
    expect(mentionedMembers('@所有人 再想想', members)).toEqual(['a', 'c'])
  })

  it('finds the @ being typed at the caret, as one word after a space or at the start', () => {
    expect(mentionQuery('@Cl', 3)).toEqual({ start: 0, query: 'Cl' })
    expect(mentionQuery('好的 @', 4)).toEqual({ start: 3, query: '' })
    expect(mentionQuery('a@b', 3)).toBeNull()
    expect(mentionQuery('@Claude 你', 9)).toBeNull()
    expect(mentionQuery('@Claude 你', 4)).toEqual({ start: 0, query: 'Cla' })
  })

  it('offers everyone first, then the members a query matches', () => {
    const members = [{ name: 'Claude' }, { name: 'Codex' }]
    expect(mentionChoices(members, '')).toEqual([EVERYONE, ...members])
    expect(mentionChoices(members, 'co')).toEqual([{ name: 'Codex' }])
    expect(mentionChoices(members, '所')).toEqual([EVERYONE])
  })

  it('says where the discussion stands', () => {
    expect(discussionProgress({ state: 'running', step: 'round', round: 2, lastRound: 3, topicStart: 0 })).toBe('第 2 / 3 轮')
    expect(discussionProgress({ state: 'pausing', step: 'round', round: 1, lastRound: 3, topicStart: 0 })).toBe('第 1 / 3 轮 · 本轮结束后暂停')
    expect(discussionProgress({ state: 'running', step: 'summary', round: 2, lastRound: 2, topicStart: 0 })).toBe('总结')
    // A new topic's rounds count from where it began.
    expect(discussionProgress({ state: 'running', step: 'round', round: 4, lastRound: 5, topicStart: 2 })).toBe('第 2 / 3 轮')
    expect(discussionProgress({ state: 'done', step: 'summary', round: 2, lastRound: 2, topicStart: 0 })).toBe('已总结')
  })

  it("says where a review stands by its draft and step", () => {
    const at = (round: number, state: 'running' | 'paused' | 'done' = 'running', step: 'round' | 'summary' = 'round') => discussionProgress({ format: 'review', state, step, round, lastRound: 6, topicStart: 0 })
    expect(at(1)).toBe('起草中')
    expect(at(2)).toBe('第 1 版评审中')
    expect(at(3)).toBe('修订第 2 版')
    expect(at(4, 'paused')).toBe('第 2 版评审中 · 已暂停')
    expect(at(4, 'running', 'summary')).toBe('整理定稿')
    expect(at(4, 'done', 'summary')).toBe('已定稿')
  })
})

