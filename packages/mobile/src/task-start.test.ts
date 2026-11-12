import { describe, expect, it } from 'vitest'
import type { Task } from '@antumi/protocol'
import { startBlockerOf, startModeOf } from './task-start'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Coupon check',
    details: '',
    status: 'pending',
    repos: [{ path: '/shop', worktreePath: null, branch: null, startRef: null, start: null }],
    dependsOn: [],
    agent: 'claude',
    slug: null,
    derivedFrom: null,
    abandonReason: null,
    attempts: [],
    source: null,
    sourceSnapshot: null,
    images: [],
    awaitingInput: false,
    conversationId: null,
    plan: null,
    launch: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

const dependency = task({ id: '00000000-0000-4000-8000-000000000002', status: 'review' })

describe('starting a task from the phone', () => {
  it('plans when the task keeps no mode, and otherwise takes its own', () => {
    expect(startModeOf(task(), {})).toBe('plan')
    expect(startModeOf(task({ launch: { permissionMode: 'acceptEdits' } }), {})).toBe('acceptEdits')
  })

  it('plans while what the task builds on is not yet accepted', () => {
    const waiting = task({ dependsOn: [dependency.id], launch: { permissionMode: 'acceptEdits' } })
    expect(startModeOf(waiting, { [dependency.id]: dependency })).toBe('plan')
    expect(startModeOf(waiting, { [dependency.id]: { ...dependency, status: 'done' } })).toBe('acceptEdits')
  })

  it('says why a task cannot start, by the same rules as the computer', () => {
    expect(startBlockerOf(task(), {})).toBeNull()
    expect(startBlockerOf(task({ agent: null }), {})).toBe('missing-agent')
    expect(startBlockerOf(task({ repos: [] }), {})).toBe('missing-repo')
    expect(startBlockerOf(task({ status: 'running' }), {})).toBe('not-pending')
  })
})
