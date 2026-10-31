import { describe, expect, it } from 'vitest'
import { agentAdvice, quotaAdvicePressed, windowPace } from './quota-pace'
import { forecastUsage } from './usage-analytics'
import { quotaRecovery, scheduledQuotaReset } from './quota-resets'
import { quotaVerdict, type AgentUsage, type GlobalReset, type UsageWindow } from './usage'

const HOUR = 3600_000
const now = Date.parse('2026-10-30T12:00:00Z')
const weekly: UsageWindow = { kind: 'weekly', model: null, usedPercent: 37, windowMinutes: 10_080, resetsAt: now + 119 * HOUR }
const upcoming = (resetType: GlobalReset['resetType'] = 'reset'): GlobalReset => ({
  kind: 'upcoming', resetType, at: now - HOUR, scheduledFor: now + 48 * HOUR, text: null, sourceUrl: null
})
const usage = (resetType: GlobalReset['resetType'] = 'reset'): AgentUsage => ({
  agent: 'codex', account: 'work', status: 'ok', windows: [weekly], updatedAt: now, plan: null, error: null, resetCredits: null,
  globalResets: { latest: null, upcoming: upcoming(resetType), chance48h: 0.9, checkedAt: now }
})

describe('quota reset planning', () => {
  it('uses the announced reset horizon without changing the rate or the account window', () => {
    const account = usage()
    const regular = forecastUsage({ ...account, globalResets: null }, weekly, [], now)
    const expected = forecastUsage(account, weekly, [], now)
    expect(regular.beforeReset).toBe(true)
    expect(expected).toMatchObject({ beforeReset: false, runsOutAt: regular.runsOutAt, percentPerHour: regular.percentPerHour,
      scheduledReset: { at: now + 48 * HOUR, kind: 'reset' }, window: weekly })
    expect(windowPace(weekly, now)?.pace).toBe('over')
    expect(windowPace(weekly, now, now + 48 * HOUR)?.pace).toBe('even')
    expect(agentAdvice(account, now)).toEqual([expect.objectContaining({ kind: 'reset-option', recovery: { kind: 'reset', at: now + 48 * HOUR } })])
  })

  it.each(['banked', null, undefined] as const)('does not treat a %s announcement as automatic recovery', (type) => {
    const account = usage(type)
    // Explicit undefined exercises an older core that omitted the field.
    if (account.globalResets?.upcoming) account.globalResets.upcoming.resetType = type
    expect(forecastUsage(account, weekly, [], now).beforeReset).toBe(true)
    const advice = agentAdvice(account, now)
    expect(advice[0]).toMatchObject({ kind: 'reset-option', recovery: { kind: type ?? 'unknown' } })
    expect(quotaAdvicePressed(advice)).toBe(true)
  })

  it.each([
    { scheduledFor: now - 1 }, { scheduledFor: null }, { scheduledFor: now + 130 * HOUR },
    { at: now - 4 * 24 * HOUR }, { at: now + HOUR }
  ])('ignores missed, missing, late or invalid estimates: %j', (fields) => {
    const account = usage()
    account.globalResets = { latest: null, upcoming: { ...upcoming(), ...fields }, chance48h: 1, checkedAt: now }
    expect(scheduledQuotaReset(account, weekly, now)).toBeNull()
    expect(agentAdvice(account, now)[0]?.kind).toBe('slow-down')
    expect(forecastUsage(account, weekly, [], now).beforeReset).toBe(true)
  })

  it('does not trust stale news, odds, completed announcements or model-specific limits', () => {
    const account = usage()
    expect(scheduledQuotaReset({ ...account, globalResets: { latest: null, upcoming: upcoming(), chance48h: 1, checkedAt: now - 7 * HOUR } }, weekly, now)).toBeNull()
    expect(scheduledQuotaReset({ ...account, globalResets: { latest: upcoming(), upcoming: upcoming(), checkedAt: now, chance48h: 1 } }, weekly, now)).toBeNull()
    expect(scheduledQuotaReset(account, { ...weekly, model: 'Opus' }, now)).toBeNull()
    expect(quotaVerdict({ ...account, windows: [{ ...weekly, usedPercent: 100 }] }, now).state).toBe('exhausted')
  })

  it('still warns if the quota runs out before the announced automatic reset', () => {
    const fast = { ...weekly, recentRate: { percentPerHour: 5, measuredAt: now } }
    const account = { ...usage(), windows: [fast] }
    expect(agentAdvice(account, now)[0]?.kind).toBe('slow-down')
    const samples = [27, 32, 37].map((used, i) => ({ used, at: now - (2 - i) * 15 * 60_000, reset: weekly.resetsAt }))
    expect(forecastUsage(account, fast, samples, now).beforeReset).toBe(true)
  })

  it('offers a covering, unexpired card without clearing quota or hiding exhaustion forecasts', () => {
    const account: AgentUsage = { ...usage(), globalResets: null, resetCredits: { available: 1, blockedBy: null,
      credits: [{ expiresAt: now + 120 * HOUR, label: null, clears: ['session', 'weekly'] }] } }
    expect(agentAdvice(account, now)[0]).toMatchObject({ kind: 'reset-option', recovery: { kind: 'credit' } })
    expect(forecastUsage(account, weekly, [], now).beforeReset).toBe(true)
    expect(agentAdvice({ ...account, windows: [{ ...weekly, usedPercent: 100 }] }, now)[0]).toMatchObject({ kind: 'reset-option', recovery: { kind: 'credit' } })
    expect(quotaVerdict({ ...account, windows: [{ ...weekly, usedPercent: 100 }] }, now).state).toBe('exhausted')
    for (const credits of [[], [{ expiresAt: now - 1, label: null, clears: ['weekly'] as const }], [{ expiresAt: null, label: null, clears: ['session'] as const }]]) {
      expect(quotaRecovery({ ...account, resetCredits: { available: 1, blockedBy: null, credits: credits.map((credit) => ({ ...credit, clears: [...credit.clears] })) } }, weekly, now + 80 * HOUR, now)).toBeNull()
    }
    expect(quotaRecovery({ ...account, status: 'error' }, weekly, now + HOUR, now)).toBeNull()
    expect(quotaRecovery({ ...account, updatedAt: now - HOUR }, weekly, now + HOUR, now)).toBeNull()
    expect(quotaRecovery({ ...account, resetCredits: { available: 0, blockedBy: null, credits: [] } }, weekly, now + HOUR, now)).toBeNull()
  })
})
