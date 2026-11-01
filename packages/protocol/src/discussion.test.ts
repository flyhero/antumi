import { describe, expect, it } from 'vitest'
import { DEFAULT_DISCUSSION_REQUIREMENTS, DiscussionCreate, MAX_DISCUSSION_REQUIREMENTS, checkAddDiscussionMember, checkDiscussionAction, checkEditDiscussionProjects, checkArchiveDiscussion, checkNewDiscussionTopic, checkRemoveDiscussionMember, checkDiscussionMention, currentTopic, memberLetter, reviewRound, reviewSteps } from './discussion'

describe('discussion requirements', () => {
  const create = { topic: 'Compare caches', projectPaths: [], members: [{ agent: 'claude', name: 'Ann' }, { agent: 'codex', name: 'Bob' }], chair: 0 }

  it('keeps older requests valid and distinguishes omitted from explicitly empty requirements', () => {
    expect(DiscussionCreate.parse(create).requirements).toBe(DEFAULT_DISCUSSION_REQUIREMENTS)
    expect(DiscussionCreate.parse({ ...create, requirements: '   ' }).requirements).toBe('')
    expect(DiscussionCreate.parse({ ...create, requirements: '  Use tables.  ' }).requirements).toBe('Use tables.')
  })

  it('rejects oversized or malformed requirements before starting agents', () => {
    expect(DiscussionCreate.safeParse({ ...create, requirements: 'x'.repeat(MAX_DISCUSSION_REQUIREMENTS + 1) }).success).toBe(false)
    expect(DiscussionCreate.safeParse({ ...create, requirements: null }).success).toBe(false)
  })
})

describe('checkDiscussionAction', () => {
  it('pauses and stops only what runs, and not the summary', () => {
    expect(checkDiscussionAction({ state: 'running', step: 'round' }, 'pause')).toBeNull()
    expect(checkDiscussionAction({ state: 'running', step: 'summary' }, 'pause')).toBe('summing-up')
    expect(checkDiscussionAction({ state: 'paused', step: 'round' }, 'pause')).toBe('not-running')
    expect(checkDiscussionAction({ state: 'pausing', step: 'round' }, 'stop')).toBeNull()
    expect(checkDiscussionAction({ state: 'done', step: 'summary' }, 'stop')).toBe('not-running')
  })

  it('resumes a pause, adds a round to a pause or a finish, and concludes anything unfinished', () => {
    expect(checkDiscussionAction({ state: 'pausing', step: 'round' }, 'resume')).toBeNull()
    expect(checkDiscussionAction({ state: 'running', step: 'round' }, 'resume')).toBe('not-paused')
    expect(checkDiscussionAction({ state: 'done', step: 'summary' }, 'nextRound')).toBeNull()
    expect(checkDiscussionAction({ state: 'running', step: 'round' }, 'nextRound')).toBe('not-paused')
    expect(checkDiscussionAction({ state: 'paused', step: 'summary' }, 'conclude')).toBeNull()
    expect(checkDiscussionAction({ state: 'done', step: 'summary' }, 'conclude')).toBe('done')
  })
})

describe('changing a group chat midway', () => {
  const member = (id: string, position: number, status: 'idle' | 'working' = 'idle') => ({
    id, conversationId: id, agent: 'claude' as const, model: null, effort: null, name: id, role: '', status, position
  })
  const group = (members: ReturnType<typeof member>[], projectPaths: string[] = ['/repo']) => ({ members, formerMembers: [], chairId: 'a', projectPaths })

  it('lets members join up to the limit, and leave unless the chair, answering, or two are left', () => {
    expect(checkAddDiscussionMember(group(['a', 'b', 'c', 'd', 'e'].map((id, i) => member(id, i))))).toBe('full')
    expect(checkAddDiscussionMember(group([member('a', 0), member('b', 1)]))).toBeNull()
    const three = group([member('a', 0), member('b', 1, 'working'), member('c', 2)])
    expect(checkRemoveDiscussionMember(three, 'a')).toBe('chair')
    expect(checkRemoveDiscussionMember(three, 'b')).toBe('busy')
    expect(checkRemoveDiscussionMember(three, 'c')).toBeNull()
    expect(checkRemoveDiscussionMember(group([member('a', 0), member('c', 2)]), 'c')).toBe('too-few')
  })

  it('changes projects only where there are some and everyone is idle', () => {
    expect(checkEditDiscussionProjects(group([member('a', 0), member('b', 1)], []))).toBe('no-projects')
    expect(checkEditDiscussionProjects(group([member('a', 0), member('b', 1, 'working')]))).toBe('busy')
    expect(checkEditDiscussionProjects(group([member('a', 0), member('b', 1)]))).toBeNull()
  })

  it('moves on to a new topic only once nothing is out, and knows the topic now discussed', () => {
    const idle = [member('a', 0), member('b', 1)]
    expect(checkNewDiscussionTopic({ state: 'running', members: idle })).toBe('busy')
    expect(checkNewDiscussionTopic({ state: 'pausing', members: idle })).toBe('busy')
    expect(checkNewDiscussionTopic({ state: 'paused', members: [member('a', 0), member('b', 1, 'working')] })).toBe('busy')
    expect(checkNewDiscussionTopic({ state: 'done', members: idle })).toBeNull()
    expect(checkArchiveDiscussion({ state: 'running', members: idle })).toBe('busy')
    expect(checkArchiveDiscussion({ state: 'paused', members: idle })).toBeNull()
    const said = (text: string, topic: boolean) => ({ text, topic })
    expect(currentTopic({ topic: 'first' }, [said('aside', false)])).toBe('first')
    expect(currentTopic({ topic: 'first' }, [said('second', true), said('third', true), said('aside', false)])).toBe('third')
  })

  it('keeps each member\'s letter by when it joined, a former one\'s too', () => {
    const left = { members: [member('a', 0), member('c', 2)], formerMembers: [member('b', 1)] }
    expect(['a', 'b', 'c'].map((id) => memberLetter(left, id))).toEqual(['A', 'B', 'C'])
    expect(memberLetter(left, 'nobody')).toBeNull()
  })
})

describe('a review', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const member = (n: number) => ({ id: id(n), conversationId: id(10 + n), agent: 'claude' as const, model: null, effort: null, name: `M${n}`, role: '', status: 'idle' as const })
  const discussion = { members: [member(1), member(2), member(3)], chairId: id(1), state: 'running' as const, format: 'review' as const }
  const post = (round: number, memberId: string, stage: 'draft' | 'review' | 'revise' | 'final', state: 'pending' | 'done' | 'failed', verdict: 'pass' | 'change' | null = null, version: number | null = null) =>
    ({ round, memberId, stage, state, verdict, version })

  it('numbers its rounds: drafts and revisions in the odd ones, reviews in the even ones', () => {
    expect([1, 2, 3, 4, 5].map((round) => reviewRound(round))).toEqual([
      { stage: 'draft', version: 1 }, { stage: 'review', version: 1 }, { stage: 'revise', version: 2 }, { stage: 'review', version: 2 }, { stage: 'revise', version: 3 }
    ])
  })

  it('shows each step with how many reviewers passed, the one under way, and the final draft still to come', () => {
    const steps = reviewSteps(discussion, [
      post(1, id(1), 'draft', 'done'), post(2, id(2), 'review', 'done', 'pass'), post(2, id(3), 'review', 'done', 'change'),
      post(3, id(1), 'revise', 'done'), post(4, id(2), 'review', 'done', 'pass'), post(4, id(3), 'review', 'pending')
    ])
    expect(steps.map((step) => [step.stage, step.version, step.state, step.passed, step.total, step.verdict])).toEqual([
      ['draft', 1, 'done', 0, 1, null], ['review', 1, 'done', 1, 2, 'change'], ['revise', 2, 'done', 0, 1, null], ['review', 2, 'current', 1, 2, null], ['final', 0, 'todo', 0, 0, null]
    ])
    // A reviewer asked again counts by its latest answer.
    const retried = reviewSteps({ ...discussion, state: 'done' }, [
      post(1, id(1), 'draft', 'done'), post(2, id(2), 'review', 'done', 'pass'), post(2, id(3), 'review', 'failed'), post(2, id(3), 'review', 'done', 'pass'), post(2, id(1), 'final', 'done', 'pass', 1)
    ])
    expect(retried.map((step) => [step.stage, step.state, step.verdict])).toEqual([['draft', 'done', null], ['review', 'done', 'pass'], ['final', 'done', 'pass']])
  })

  it('keeps its members and topic, and names wait until nothing is out', () => {
    expect(checkAddDiscussionMember(discussion)).toBe('format')
    expect(checkRemoveDiscussionMember(discussion, id(2))).toBe('format')
    expect(checkNewDiscussionTopic({ ...discussion, state: 'done' })).toBe('format')
    expect(checkDiscussionMention(discussion)).toBe('busy')
    expect(checkDiscussionMention({ ...discussion, state: 'done' })).toBeNull()
    expect(checkDiscussionMention({ ...discussion, format: 'roundtable' })).toBeNull()
    expect(checkArchiveDiscussion({ ...discussion, state: 'done' })).toBeNull()
  })
})
