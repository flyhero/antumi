import { describe, expect, it } from 'vitest'
import type { AgentUsage, UsageWindow } from '@antumi/protocol'
import { spendNote, windowLabel } from './usage-format'

const window = (kind: UsageWindow['kind'], model: string | null = null): UsageWindow => ({ kind, model, usedPercent: 9, windowMinutes: 1, resetsAt: null })

describe('windowLabel', () => {
  it('names each window by its period, and a model-specific one by its model too', () => {
    expect([window('session'), window('weekly'), window('weekly', 'Opus'), window('monthly'), window('monthly', 'API')].map(windowLabel)).toEqual(['5h', '本周', 'Opus 本周', '本月', 'API 本月'])
    expect([window('daily'), window('daily', 'Gemini Pro')].map(windowLabel)).toEqual(['今天', 'Gemini Pro 今天'])
  })
})

describe('spendNote', () => {
  const usage = (usedPercent: number): AgentUsage => ({
    agent: 'codex',
    status: 'ok',
    windows: [{ kind: 'session', model: null, usedPercent: 30, windowMinutes: 300, resetsAt: null }, { kind: 'weekly', model: null, usedPercent, windowMinutes: 10_080, resetsAt: null }],
    plan: null,
    error: null,
    updatedAt: 0,
    resetCredits: { available: 1, credits: [{ expiresAt: null, label: null, clears: ['session', 'weekly'] }], blockedBy: null, usable: true }
  })

  it('says what a reset clears, and that it cannot be taken back', () => {
    expect(spendNote(usage(100), ['session', 'weekly'])).toBe('用掉一张，立即清零 5h 和每周额度，用掉后不能退回。')
  })

  it('points out the room left by the window closest to its cap', () => {
    expect(spendNote(usage(62.4), ['session', 'weekly'])).toBe('用掉一张，立即清零 5h 和每周额度，用掉后不能退回。现在额度还剩 38%，用完再用更划算。')
  })
})
