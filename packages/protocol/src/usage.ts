import { z } from 'zod'
import { AgentKind } from './task'

// session: rolling 5 hours · weekly: 7 days · monthly: billing month · daily: the provider's day.
// A client names the kinds it reads (usage.list); core sends it no reading with another, since an
// older client fails to parse the whole list over one unknown kind.
export const USAGE_WINDOW_KINDS = ['session', 'weekly', 'monthly', 'daily'] as const
export const UsageWindowKind = z.enum(USAGE_WINDOW_KINDS)
// What a client that names no kinds reads.
export const LEGACY_USAGE_WINDOW_KINDS: readonly string[] = ['session', 'weekly']
export type UsageWindowKind = z.infer<typeof UsageWindowKind>

export const UsageWindow = z.object({
  kind: UsageWindowKind,
  // Set when the cap applies to one model only, such as a model-specific weekly limit.
  model: z.string().nullable(),
  usedPercent: z.number().min(0).max(100),
  windowMinutes: z.number().int().positive(),
  resetsAt: z.number().nullable(),
  recentRate: z.object({ percentPerHour: z.number().nonnegative(), measuredAt: z.number() }).optional()
})
export type UsageWindow = z.infer<typeof UsageWindow>

// ok: fresh numbers · signed-out: no local credentials for this agent
// error: the last refresh failed; `windows` keeps the previous numbers, now stale
export const UsageStatus = z.enum(['ok', 'signed-out', 'error'])
export type UsageStatus = z.infer<typeof UsageStatus>

// A "usage limit reset" the account holds: using it restores the windows in `clears` once.
export const ResetCredit = z.object({
  // The service's id for it, where it names one: spending this one rather than whichever it picks.
  id: z.string().optional(),
  expiresAt: z.number().nullable(),
  // The service's own description, such as the promotion it came with.
  label: z.string().nullable().default(null),
  clears: z.array(UsageWindowKind).default([])
})
export type ResetCredit = z.infer<typeof ResetCredit>

export const ResetCredits = z.object({
  available: z.number().int().nonnegative(),
  // The available ones the service listed, soonest to expire first; may be fewer than `available`.
  credits: z.array(ResetCredit),
  // Why the service would not say, when that is something the user can fix: 'cli_version'.
  blockedBy: z.string().nullable().default(null),
  // Core can spend one itself (usage.useResetCredit); otherwise only the agent's own app can.
  usable: z.boolean().optional()
})
export type ResetCredits = z.infer<typeof ResetCredits>

// reset: one was spent and the windows cleared · nothing-to-reset: nothing was used up, so none was
// spent · no-credit: none left · already-used: this request id was spent before.
export const ResetCreditOutcome = z.enum(['reset', 'nothing-to-reset', 'no-credit', 'already-used'])
export type ResetCreditOutcome = z.infer<typeof ResetCreditOutcome>

// A reset the service gave everyone, as announced in public (on X) and gathered by a community
// tracker: reset: everyone's windows cleared · banked: a reset credit for every paid account ·
// upcoming: announced, not landed yet; `scheduledFor` is the tracker's estimate of when.
export const GlobalReset = z.object({
  kind: z.enum(['reset', 'banked', 'upcoming']),
  at: z.number(),
  text: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  scheduledFor: z.number().nullable()
})
export type GlobalReset = z.infer<typeof GlobalReset>

export const GlobalResets = z.object({
  latest: GlobalReset.nullable(),
  upcoming: GlobalReset.nullable(),
  // The tracker's odds of another within 48 hours, from past intervals; null without enough history.
  chance48h: z.number().min(0).max(1).nullable(),
  checkedAt: z.number()
})
export type GlobalResets = z.infer<typeof GlobalResets>

export const AgentUsage = z.object({
  agent: AgentKind,
  // The account it is of (AgentAccount.id); older cores leave it out, for the default account.
  account: z.string().optional(),
  status: UsageStatus,
  windows: z.array(UsageWindow),
  plan: z.string().nullable(),
  // Stable code the UI can localize, e.g. 'auth-expired'.
  error: z.string().nullable(),
  updatedAt: z.number(),
  // Only Codex reports these; null when there are none to show or the agent has no such thing.
  resetCredits: ResetCredits.nullable().default(null),
  // For an agent the tracker follows (AgentDescriptor.resetTracker), while the user has it on
  // (ChatSettings.resetAnnouncements). Older cores leave it out.
  globalResets: GlobalResets.nullable().optional()
})
export type AgentUsage = z.infer<typeof AgentUsage>

export function usageReadable(kinds: ReadonlySet<string>, usage: AgentUsage): boolean {
  return usage.windows.every((window) => kinds.has(window.kind))
}

export type UsageLevel = 'normal' | 'warning' | 'critical'

export function usageLevel(usedPercent: number): UsageLevel {
  if (usedPercent >= 80) {
    return 'critical'
  }
  return usedPercent >= 60 ? 'warning' : 'normal'
}

// The window closest to its cap is the one that will stall the agent first.
export function tightestWindow(windows: readonly UsageWindow[]): UsageWindow | null {
  return windows.reduce<UsageWindow | null>(
    (tightest, window) => (!tightest || window.usedPercent > tightest.usedPercent ? window : tightest),
    null
  )
}

// ok: room to run · tight: close to a cap · exhausted: a cap is reached, the agent would stall
// unknown: nothing to judge by (signed out, no reading yet)
export type QuotaState = 'ok' | 'tight' | 'exhausted' | 'unknown'

// `window` is the one the state comes from; `stale` means the numbers may have moved since.
export type QuotaVerdict = { state: QuotaState; window: UsageWindow | null; stale: boolean }

// Two missed polls: numbers older than this are shown with a caveat.
export const QUOTA_STALE_MS = 30 * 60_000

// `model` is any text naming the model to run (its id, label, description): a model-specific
// window counts when that text names it, as 'Opus' names "Opus 5.5". Without one, only the
// windows every model shares count.
export function quotaVerdict(usage: AgentUsage | null | undefined, now: number, model?: string | null): QuotaVerdict {
  if (!usage || usage.status === 'signed-out') {
    return { state: 'unknown', window: null, stale: false }
  }
  const named = model?.toLowerCase() ?? null
  const windows = usage.windows.filter(
    (window) =>
      (window.model === null || (named !== null && named.includes(window.model.toLowerCase()))) &&
      // A window past its reset has started over; its percentage is from before.
      (window.resetsAt === null || window.resetsAt > now)
  )
  const stale = usage.status === 'error' || now - usage.updatedAt > QUOTA_STALE_MS
  const window = tightestWindow(windows)
  if (!window) {
    return { state: usage.windows.length > 0 ? 'ok' : 'unknown', window: null, stale }
  }
  if (window.usedPercent >= 100) {
    return { state: 'exhausted', window, stale }
  }
  return { state: usageLevel(window.usedPercent) === 'critical' ? 'tight' : 'ok', window, stale }
}
