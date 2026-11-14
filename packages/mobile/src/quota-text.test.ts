import { describe, expect, it } from 'vitest'
import type { AgentUsage, UsageWindow } from '@antumi/protocol'
import { clock } from './chat-text'
import { fill, strings } from './i18n'
import { exhaustedText, resetText, shownQuotas, usedText, windowName } from './quota-text'

// In whichever language the test machine runs: the words come from strings, the logic is checked.

const NOW = new Date(2026, 10, 14, 12, 0).getTime()
const HOUR = 3_600_000

function window(patch: Partial<UsageWindow> = {}): UsageWindow {
  return { kind: 'session', model: null, usedPercent: 40, windowMinutes: 300, resetsAt: NOW + 2 * HOUR, ...patch }
}

function usage(patch: Partial<AgentUsage> = {}): AgentUsage {
  return { agent: 'claude', status: 'ok', windows: [window()], plan: null, error: null, updatedAt: NOW, resetCredits: null, ...patch }
}

describe('wording usage limits', () => {
  it('names a window by its period, and by its model where it has one', () => {
    expect(windowName(window())).toBe(strings.quotaSession)
    expect(windowName(window({ kind: 'weekly', model: 'Opus' }))).toBe(`Opus ${strings.quotaWeekly}`)
  })

  it('says a reset within a day as how long is left, further off as when', () => {
    const inMinutes = fill(strings.quotaResetsIn, { when: fill(strings.durationMinutes, { minutes: 40 }) })
    expect(resetText(window({ resetsAt: NOW + 40 * 60_000 }), NOW)).toBe(inMinutes)
    expect(resetText(window({ resetsAt: NOW + 2.5 * HOUR }), NOW)).toBe(fill(strings.quotaResetsIn, { when: fill(strings.durationHours, { hours: 2 }) }))
    const later = NOW + 50 * HOUR
    expect(resetText(window({ resetsAt: later }), NOW)).toBe(fill(strings.quotaResetsAt, { time: clock(later, NOW) }))
    expect(resetText(window({ resetsAt: later }), NOW, true)).toBe(fill(strings.quotaResetsIn, { when: fill(strings.durationDays, { days: 2 }) }))
    expect(resetText(window({ resetsAt: NOW - 1 }), NOW)).toBe(strings.quotaResetting)
    expect(resetText(window({ resetsAt: null }), NOW)).toBe('')
  })

  it('says a window at its cap is used up', () => {
    expect(usedText(window({ usedPercent: 71.6 }))).toBe(fill(strings.quotaUsed, { percent: 72 }))
    expect(usedText(window({ usedPercent: 100 }))).toBe(strings.quotaSpent)
  })

  it('shows each agent by its tightest window, and none that is signed out or unread', () => {
    const weekly = window({ kind: 'weekly', usedPercent: 85, windowMinutes: 10_080, resetsAt: NOW + 72 * HOUR })
    const shown = shownQuotas([
      usage({ windows: [window(), weekly] }),
      usage({ agent: 'codex', status: 'signed-out' }),
      usage({ agent: 'opencode', windows: [] })
    ], NOW)
    expect(shown.map((each) => [each.usage.agent, each.verdict.window.kind])).toEqual([['claude', 'weekly']])
  })

  it('warns of an agent only once a cap is reached, and of a model’s own cap only for that model', () => {
    expect(exhaustedText(usage(), null, NOW)).toBeNull()
    const spent = usage({ windows: [window({ usedPercent: 100 })] })
    expect(exhaustedText(spent, null, NOW)).toBe(fill(strings.quotaExhaustedResets, { window: strings.quotaSession, time: clock(NOW + 2 * HOUR, NOW) }))
    const opus = usage({ windows: [window({ kind: 'weekly', model: 'Opus', usedPercent: 100, resetsAt: null })] })
    expect(exhaustedText(opus, 'claude-sonnet Sonnet 5.5', NOW)).toBeNull()
    expect(exhaustedText(opus, 'claude-opus Opus 5.5', NOW)).toBe(fill(strings.quotaExhausted, { window: `Opus ${strings.quotaWeekly}` }))
    expect(exhaustedText(undefined, null, NOW)).toBeNull()
  })
})
