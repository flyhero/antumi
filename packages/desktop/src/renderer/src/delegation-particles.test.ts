import { describe, expect, it, vi } from 'vitest'
import { fanoutMood, lineOver, lineState } from './delegation-particles'

vi.hoisted(() => { vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }) })

describe('delegation fan-out', () => {
  it('reads a starting call as at work, the rest as they are', () => {
    expect(lineState({ state: 'starting' })).toBe('running')
    for (const state of ['queued', 'running', 'awaiting', 'completed', 'failed', 'cancelled'] as const) expect(lineState({ state })).toBe(state)
  })

  it('colours the caller by what matters most: a member waiting on you, then work, then the end', () => {
    expect(fanoutMood(['running', 'awaiting', 'completed'])).toBe('awaiting')
    expect(fanoutMood(['queued', 'completed'])).toBe('running')
    expect(fanoutMood(['completed', 'cancelled'])).toBe('completed')
    expect(fanoutMood(['completed', 'failed'])).toBe('failed')
  })

  it('counts a line over once its member finished, failed or was cancelled', () => {
    for (const state of ['completed', 'failed', 'cancelled'] as const) expect(lineOver(lineState({ state }))).toBe(true)
    expect(lineOver('awaiting')).toBe(false)
  })
})
