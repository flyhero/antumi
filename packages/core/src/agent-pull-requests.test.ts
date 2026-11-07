import { describe, expect, it, vi } from 'vitest'
import type { ChatDecision, PullRequestEligibility, PullRequestLink } from '@antumi/protocol'
import { AgentPullRequests } from './agent-pull-requests'

const link: PullRequestLink = { taskId: 'task', repoPath: '/repo', repo: { host: 'github', owner: 'o', name: 'r' }, number: 7, url: 'https://github.com/o/r/pull/7', headBranch: 'antumi/abc', base: 'main', status: null, problem: null, fetchedAt: null, refreshing: false }
const ready: PullRequestEligibility = { repoPath: '/repo', repo: { host: 'github', owner: 'o', name: 'r' }, headBranch: 'antumi/abc', base: 'main', baseFallback: null, needsPush: true, blocker: null, existing: null }
const fields = { title: 'Add PRs', body: 'Why.', draft: false }
// Past the eligibility check and the ask, which take a few turns of the loop.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function harness(agent: 'claude' | 'codex', eligibility: PullRequestEligibility = ready) {
  let answer: ((decision: ChatDecision) => void) | null = null
  const ask = vi.fn((_id: string, _title: string, _detail: string) => new Promise<ChatDecision>((resolve) => { answer = resolve }))
  const create = vi.fn(async () => link)
  const gate = new AgentPullRequests(() => ({ agent, taskId: 'task', readOnly: false }), { check: async () => [eligibility], create }, ask, 50)
  return { gate, ask, create, answer: (decision: ChatDecision) => answer?.(decision) }
}

describe('AgentPullRequests', () => {
  it('opens straight away for an agent that asks for MCP tools itself', async () => {
    const h = harness('claude')
    expect(await h.gate.run('c1', fields)).toEqual({ outcome: 'created', link })
    expect(h.ask).not.toHaveBeenCalled()
    expect(h.create).toHaveBeenCalledWith({ taskId: 'task', repoPath: '/repo', base: 'main', title: 'Add PRs', body: 'Why.', draft: false, from: 'antumi/abc' })
  })

  it('asks in the chat for one that asks nothing, and opens once the user says yes', async () => {
    const h = harness('codex')
    const first = h.gate.run('c1', fields)
    await tick()
    expect(h.ask).toHaveBeenCalledWith('c1', 'Add PRs', 'antumi/abc → main')
    h.answer('allow')
    expect(await first).toEqual({ outcome: 'created', link })
    expect(h.create).toHaveBeenCalledTimes(1)
  })

  it('reports waiting when the user has not answered, and takes a late yes on the next try', async () => {
    const h = harness('codex')
    expect(await h.gate.run('c1', fields)).toEqual({ outcome: 'awaiting' })
    h.answer('allow')
    await tick()
    expect(await h.gate.run('c1', fields)).toEqual({ outcome: 'created', link })
    expect(h.ask).toHaveBeenCalledTimes(1)
    // Spent: a third request asks again.
    expect(await h.gate.run('c1', fields)).toEqual({ outcome: 'awaiting' })
    expect(h.ask).toHaveBeenCalledTimes(2)
  })

  it('reports a no, and a different request asks anew', async () => {
    const h = harness('codex')
    const run = h.gate.run('c1', fields)
    await tick()
    h.answer('deny')
    expect(await run).toEqual({ outcome: 'denied' })
    expect(h.create).not.toHaveBeenCalled()
  })

  it('hands back the pull request the branch already has, and refuses a blocked branch', async () => {
    const existing = harness('codex', { ...ready, blocker: 'existing-pr', existing: link })
    expect(await existing.gate.run('c1', fields)).toEqual({ outcome: 'created', link })
    expect(existing.ask).not.toHaveBeenCalled()
    const dirty = harness('claude', { ...ready, blocker: 'dirty' })
    await expect(dirty.gate.run('c1', fields)).rejects.toMatchObject({ reason: 'pull-request-dirty' })
    const fallback = harness('claude', { ...ready, blocker: 'base-missing', base: 'antumi/dep', baseFallback: 'main' })
    await fallback.gate.run('c1', fields)
    expect(fallback.create).toHaveBeenCalledWith(expect.objectContaining({ base: 'main' }))
  })

  it('needs a task conversation', async () => {
    const gate = new AgentPullRequests(() => ({ agent: 'claude', taskId: null, readOnly: false }), { check: async () => [ready], create: async () => link }, async () => 'allow')
    await expect(gate.run('c1', fields)).rejects.toMatchObject({ reason: 'pull-request-not-task' })
  })
})
