import { z } from 'zod'
import { AgentKind } from './agent'
import { ModelTokens } from './model-cost'
import { UsageWindow, type AgentUsage } from './usage'
import { ScheduledQuotaReset, scheduledQuotaReset } from './quota-resets'

export const UsageEvent = ModelTokens.extend({
  id: z.string(), agent: AgentKind, account: z.string().nullable(), identity: z.string().nullable(),
  at: z.number(), session: z.string().nullable(), turn: z.string().nullable(), cwd: z.string().nullable(),
  source: z.enum(['antumi', 'external']), origin: z.enum(['transcript', 'live', 'quick', 'warmup', 'cursor']),
  costKind: z.enum(['reported', 'estimated']).nullable(),
  precision: z.enum(['request', 'session']).default('request'), startedAt: z.number().optional()
})
export type UsageEvent = z.infer<typeof UsageEvent>
export const UsageFilter = z.object({
  range: z.number().int().min(1).max(90), timeZone: z.string().refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true } catch { return false }
  }),
  agent: AgentKind.optional(), account: z.string().nullable().optional(), identity: z.string().nullable().optional(), model: z.string().nullable().optional(),
  source: z.enum(['antumi', 'external']).optional()
})
export type UsageFilter = z.infer<typeof UsageFilter>
export const UsageTotals = z.object({
  requests: z.number(), input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(),
  costUsd: z.number().nullable(), reportedUsd: z.number().nullable(), estimatedUsd: z.number().nullable(), priced: z.number()
})
export type UsageTotals = z.infer<typeof UsageTotals>
export const UsageScanStatus = z.object({
  running: z.boolean(), updatedAt: z.number().nullable(), files: z.number(), errors: z.array(z.string())
})
export type UsageScanStatus = z.infer<typeof UsageScanStatus>
export const UsageHistory = z.object({
  totals: UsageTotals,
  unallocated: UsageTotals,
  days: z.array(UsageTotals.extend({ day: z.string() })),
  models: z.array(UsageTotals.extend({ agent: AgentKind, model: z.string().nullable() })),
  accounts: z.array(UsageTotals.extend({ agent: AgentKind, account: z.string().nullable(), identity: z.string().nullable() })),
  sessions: z.array(UsageTotals.extend({ agent: AgentKind, session: z.string().nullable(), cwd: z.string().nullable(), at: z.number() })),
  scan: UsageScanStatus
})
export type UsageHistory = z.infer<typeof UsageHistory>

export const UsageForecast = z.object({
  window: UsageWindow, account: z.string(), agent: AgentKind,
  basis: z.enum(['recent', 'window', 'idle', 'insufficient', 'stale']),
  percentPerHour: z.number().nullable(), runsOutAt: z.number().nullable(), beforeReset: z.boolean(),
  scheduledReset: ScheduledQuotaReset.optional()
})
export type UsageForecast = z.infer<typeof UsageForecast>
export type QuotaSample = { at: number; used: number; reset: number | null }

export function forecastUsage(usage: AgentUsage, window: z.infer<typeof UsageWindow>, samples: readonly QuotaSample[], now: number): UsageForecast {
  const planned = scheduledQuotaReset(usage, window, now)
  const base = { agent: usage.agent, account: usage.account ?? 'default', window, percentPerHour: null, runsOutAt: null, beforeReset: false,
    ...(planned ? { scheduledReset: planned } : {}) }
  if (usage.status !== 'ok' || now - usage.updatedAt > 30 * 60_000 || window.resetsAt === null || window.resetsAt <= now) return { ...base, basis: 'stale' }
  if (window.usedPercent >= 100) return { ...base, basis: 'recent', runsOutAt: now, beforeReset: true }
  const recent = samples.filter((sample) => sample.at >= now - 3600_000 && sample.at <= now && sample.reset === window.resetsAt)
  const first = recent[0], last = recent.at(-1)
  let rate: number | null = null
  let basis: UsageForecast['basis'] = 'insufficient'
  if (recent.length >= 3 && first && last && last.at - first.at >= 15 * 60_000) {
    rate = (last.used - first.used) / (last.at - first.at)
    if (rate <= 0) return { ...base, basis: 'idle', percentPerHour: 0 }
    basis = 'recent'
  } else {
    const length = window.windowMinutes * 60_000
    const elapsed = length - (window.resetsAt - now)
    if (elapsed >= length * 0.1 && window.usedPercent > 0) { rate = window.usedPercent / elapsed; basis = 'window' }
  }
  if (!rate) return { ...base, basis }
  const runsOutAt = now + (100 - window.usedPercent) / rate
  const resetAt = planned?.kind === 'reset' ? planned.at : window.resetsAt
  return { ...base, basis, percentPerHour: rate * 3600_000, runsOutAt, beforeReset: runsOutAt < resetAt }
}

export const UsageAutomationPolicy = z.object({
  agent: AgentKind, account: z.string(), daily: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(12),
  timeZone: UsageFilter.shape.timeZone, afterReset: z.boolean(), weekReset: z.boolean(), expiringReset: z.boolean()
})
export type UsageAutomationPolicy = z.infer<typeof UsageAutomationPolicy>
export const UsageAutomationEntry = z.object({
  id: z.string(), agent: AgentKind, account: z.string(), kind: z.enum(['warmup', 'week', 'expiring', 'manual']),
  at: z.number(), state: z.enum(['pending', 'completed', 'failed']), detail: z.string().nullable()
})
export type UsageAutomationEntry = z.infer<typeof UsageAutomationEntry>
export const UsageAutomationState = z.object({ policies: z.array(UsageAutomationPolicy.extend({ paused: z.boolean().optional() })), recent: z.array(UsageAutomationEntry) })
export type UsageAutomationState = z.infer<typeof UsageAutomationState>
