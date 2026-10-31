import { z } from 'zod'
import { QUOTA_STALE_MS, type AgentUsage, type UsageWindow } from './usage'

export const ScheduledQuotaReset = z.object({ at: z.number(), kind: z.enum(['reset', 'banked', 'unknown']) })
export type ScheduledQuotaReset = z.infer<typeof ScheduledQuotaReset>
export type QuotaRecovery = { kind: ScheduledQuotaReset['kind'] | 'credit'; at: number | null }

// A missed estimate never implies that the account has already been reset.
export function scheduledQuotaReset(usage: AgentUsage | null | undefined, window: UsageWindow, now: number): ScheduledQuotaReset | null {
  const resets = usage?.globalResets
  const upcoming = resets?.upcoming
  if (!resets || !upcoming || upcoming.kind !== 'upcoming' || upcoming.scheduledFor === null ||
    upcoming.scheduledFor <= now || upcoming.at > now || now - upcoming.at >= 3 * 86400_000 ||
    resets.checkedAt > now || now - resets.checkedAt > 6 * 3600_000 ||
    (resets.latest && resets.latest.at >= upcoming.at) ||
    (window.resetsAt !== null && upcoming.scheduledFor >= window.resetsAt)) return null
  // Tracker announcements describe the shared Codex 5h and weekly limits only.
  if (window.model !== null || (window.kind !== 'session' && window.kind !== 'weekly')) return null
  return { at: upcoming.scheduledFor, kind: upcoming.resetType ?? 'unknown' }
}

export function quotaRecovery(usage: AgentUsage, window: UsageWindow, runsOutAt: number, now: number): QuotaRecovery | null {
  if (usage.status !== 'ok' || usage.updatedAt > now || now - usage.updatedAt > QUOTA_STALE_MS) return null
  const planned = scheduledQuotaReset(usage, window, now)
  if (planned?.kind === 'reset' && planned.at <= runsOutAt) return planned
  const credits = usage.resetCredits
  if (credits && credits.available > 0 && !credits.blockedBy &&
    credits.credits.some((credit) => credit.clears.includes(window.kind) && (credit.expiresAt === null || credit.expiresAt > Math.max(now, runsOutAt)))) {
    return { kind: 'credit', at: null }
  }
  return planned && planned.at <= runsOutAt ? planned : null
}
