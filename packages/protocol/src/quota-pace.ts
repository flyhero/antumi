import type { AgentKind } from './task'
import { quotaVerdict, type AgentUsage, type QuotaState, type UsageWindow } from './usage'
import { quotaRecovery, scheduledQuotaReset, type QuotaRecovery } from './quota-resets'

// How a window is being spent against its clock, from the rate so far:
// over: at this rate it runs out before it resets · under: it resets soon with much left over,
// which is then lost · even: neither · early: too little of the window gone to tell
// exhausted: already at its cap.
export type Pace = 'exhausted' | 'over' | 'under' | 'even' | 'early'

export type WindowPace = {
  window: UsageWindow
  pace: Pace
  // What it would stand at when it resets, at the rate so far; null while early.
  projected: number | null
  // When it runs out at the rate so far; null unless over.
  runsOutAt: number | null
  // How much would be left unused at the reset; null unless under.
  wastePercent: number | null
}

// Below this share of the window gone, one busy hour would read as a runaway rate.
const MIN_ELAPSED = 0.1
// Over only with a margin: a projection just past the cap is noise, not a warning.
const OVER_PROJECTED = 110
// Under only near the reset, when there is too little time left to catch up unnoticed.
const UNDER_REMAINING = 0.25
const UNDER_WASTE = 25

// null for a window with no reset time, or one past it (it has started over).
export function windowPace(window: UsageWindow, now: number, expectedResetAt = window.resetsAt): WindowPace | null {
  if (window.resetsAt === null || window.resetsAt <= now) return null
  const length = window.windowMinutes * 60_000
  const remaining = (expectedResetAt ?? window.resetsAt) - now
  const elapsed = length - (window.resetsAt - now)
  const base = { window, projected: null, runsOutAt: null, wastePercent: null }
  if (window.usedPercent >= 100) return { ...base, pace: 'exhausted' }
  const recent = window.recentRate && window.recentRate.measuredAt <= now && now - window.recentRate.measuredAt <= 30 * 60_000 ? window.recentRate : null
  if (!recent && elapsed < length * MIN_ELAPSED) return { ...base, pace: 'early' }
  const rate = recent ? recent.percentPerHour / 3600_000 : window.usedPercent / elapsed
  const projected = window.usedPercent + rate * remaining
  if (projected >= OVER_PROJECTED) {
    return { ...base, pace: 'over', projected, runsOutAt: now + (100 - window.usedPercent) / rate }
  }
  const waste = 100 - projected
  if (remaining <= length * UNDER_REMAINING && waste >= UNDER_WASTE) {
    return { ...base, pace: 'under', projected, wastePercent: waste }
  }
  return { ...base, pace: 'even', projected }
}

// wait-reset: the 5-hour window is spent or soon will be, while the longer ones have room
// slow-down: a weekly or monthly window runs out before it resets at this rate; `at` is when
// switch-model: a model's own cap is near or reached while the shared ones have room
// use-more: a weekly or monthly window resets soon with `percent` of it left over; `model` names a
// model whose own cap has room too, to spend it on.
export type QuotaAdviceKind = 'wait-reset' | 'slow-down' | 'switch-model' | 'use-more' | 'reset-option'

export type QuotaAdvice = {
  agent: AgentKind
  kind: QuotaAdviceKind
  window: UsageWindow
  at: number | null
  percent: number | null
  model: string | null
  recovery?: QuotaRecovery
}

const longWindow = (window: UsageWindow) => window.kind !== 'session'
const TIGHT_PERCENT = 80

// What is worth telling the user about how to spend this agent's quota, most pressing first.
// Nothing once a shared cap is reached: the agent is used up, which quotaVerdict says already.
export function agentAdvice(usage: AgentUsage | null | undefined, now: number): QuotaAdvice[] {
  if (!usage || usage.status === 'signed-out') return []
  const verdict = quotaVerdict(usage, now)
  const paces = usage.windows.map((window) => windowPace(window, now)).filter((pace) => pace !== null)
  const shared = paces.filter((pace) => pace.window.model === null)
  const exhausted = shared.find((pace) => longWindow(pace.window) && pace.pace === 'exhausted')
  const advice = (kind: QuotaAdviceKind, window: UsageWindow, fields: Partial<Pick<QuotaAdvice, 'at' | 'percent' | 'model' | 'recovery'>> = {}): QuotaAdvice => ({
    agent: usage.agent,
    kind,
    window,
    at: null,
    percent: null,
    model: null,
    ...fields
  })
  if (exhausted) {
    const recovery = quotaRecovery(usage, exhausted.window, now, now)
    return recovery ? [advice('reset-option', exhausted.window, { recovery })] : []
  }
  const out: QuotaAdvice[] = []
  const session = shared.find((pace) => pace.window.kind === 'session')
  const sessionTight = session !== undefined && (session.pace === 'exhausted' || session.pace === 'over' || session.window.usedPercent >= TIGHT_PERCENT)
  if (session && (session.pace === 'exhausted' || session.pace === 'over')) {
    out.push(advice('wait-reset', session.window, { at: session.window.resetsAt, percent: session.window.usedPercent }))
  }
  const over = shared.filter((pace) => longWindow(pace.window) && pace.pace === 'over').sort((a, b) => (a.runsOutAt ?? 0) - (b.runsOutAt ?? 0))[0]
  if (over) out.push(advice('slow-down', over.window, { at: over.runsOutAt }))
  const models = paces.filter((pace) => pace.window.model !== null)
  for (const pace of models) {
    if (pace.pace === 'exhausted' || pace.pace === 'over' || pace.window.usedPercent >= TIGHT_PERCENT) {
      out.push(advice('switch-model', pace.window, { at: pace.window.resetsAt, percent: pace.window.usedPercent, model: pace.window.model }))
    }
  }
  const under = shared.filter((pace) => longWindow(pace.window) && pace.pace === 'under').sort((a, b) => (b.wastePercent ?? 0) - (a.wastePercent ?? 0))[0]
  // Stale numbers may be from before a busy spell; no urging to spend on those.
  if (under && !verdict.stale && !sessionTight && verdict.state === 'ok') {
    const roomy = models
      .filter((pace) => pace.pace !== 'exhausted' && pace.pace !== 'over' && pace.window.usedPercent < TIGHT_PERCENT)
      .sort((a, b) => a.window.usedPercent - b.window.usedPercent)[0]
    out.push(advice('use-more', under.window, { at: under.window.resetsAt, percent: under.wastePercent, model: roomy?.window.model ?? null }))
  }
  const adjusted = out.map((item) => {
    const pace = paces.find((entry) => entry.window === item.window)
    const planned = scheduledQuotaReset(usage, item.window, now)
    if (item.kind === 'use-more' && planned?.kind === 'reset') return { ...item, kind: 'reset-option' as const, recovery: planned }
    const recovery = quotaRecovery(usage, item.window, pace?.runsOutAt ?? now, now)
    return recovery && item.kind !== 'use-more' ? { ...item, kind: 'reset-option' as const, recovery } : item
  })
  for (const pace of shared.filter((entry) => longWindow(entry.window))) {
    const planned = scheduledQuotaReset(usage, pace.window, now)
    if (planned?.kind !== 'reset' || adjusted.some((item) => item.window === pace.window)) continue
    const expected = windowPace(pace.window, now, planned.at)
    if (expected?.pace === 'under' && !verdict.stale && !sessionTight && verdict.state === 'ok') {
      adjusted.push(advice('reset-option', pace.window, { recovery: planned, percent: expected.wastePercent }))
    }
  }
  return adjusted
}

export function quotaAdvicePressed(advice: readonly QuotaAdvice[]): boolean {
  return advice.some((item) => item.kind === 'wait-reset' || item.kind === 'slow-down' ||
    (item.kind === 'reset-option' && (item.recovery?.kind === 'banked' || item.recovery?.kind === 'unknown')))
}

// A quota state's place in line: room first, then unknown (signed out, no reading yet) ahead of
// used up.
export const QUOTA_RANK: Record<QuotaState, number> = { ok: 0, tight: 1, unknown: 2, exhausted: 3 }

type Standing = { agent: AgentKind; state: QuotaState; resetsAt: number; used: number; pressed: boolean; expiring: number }

function standing(agent: AgentKind, usage: AgentUsage | undefined, now: number): Standing {
  const verdict = quotaVerdict(usage, now)
  const advice = agentAdvice(usage, now)
  return {
    agent,
    state: verdict.state,
    resetsAt: verdict.window?.resetsAt ?? Infinity,
    used: verdict.window?.usedPercent ?? 0,
    pressed: quotaAdvicePressed(advice),
    expiring: advice.find((item) => item.kind === 'use-more')?.percent ?? 0
  }
}

function compare(a: Standing, b: Standing): number {
  const byState = QUOTA_RANK[a.state] - QUOTA_RANK[b.state]
  if (byState !== 0) return byState
  if (a.state === 'exhausted') return a.resetsAt - b.resetsAt
  if (a.pressed !== b.pressed) return a.pressed ? 1 : -1
  // Quota about to be lost unused goes first; what is kept for later can wait.
  if (a.expiring !== b.expiring) return b.expiring - a.expiring
  return a.used - b.used
}

// The agents best spent now first: room before none, one on pace before one running out early,
// quota about to go unused before quota that keeps, then the most room; when all are used up,
// the one to reset first.
export function rankAgents(usages: readonly AgentUsage[], agents: readonly AgentKind[], now: number): AgentKind[] {
  return agents
    .map((agent) => standing(agent, usages.find((usage) => usage.agent === agent), now))
    .sort(compare)
    .map((entry) => entry.agent)
}

// expiring: its quota resets soon with much of it unused · room: the others are closer to a cap.
export type AgentRecommendation = { agent: AgentKind; reason: 'expiring' | 'room' }

// The agent to mark as the one to use, only when it is clearly better than the next: a mark on
// one of two equals would only be noise.
export function recommendAgent(usages: readonly AgentUsage[], agents: readonly AgentKind[], now: number): AgentRecommendation | null {
  if (agents.length < 2) return null
  const ranked = agents.map((agent) => standing(agent, usages.find((usage) => usage.agent === agent), now)).sort(compare)
  const [best, next] = ranked
  if (!best || !next || best.state === 'exhausted' || best.state === 'unknown') return null
  if (best.expiring > 0 && next.expiring === 0) return { agent: best.agent, reason: 'expiring' }
  if (QUOTA_RANK[best.state] < QUOTA_RANK[next.state] || (!best.pressed && next.pressed)) {
    return { agent: best.agent, reason: best.expiring > 0 ? 'expiring' : 'room' }
  }
  return null
}
