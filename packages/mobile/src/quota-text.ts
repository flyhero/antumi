import { quotaVerdict, type AgentUsage, type QuotaVerdict, type UsageWindow } from '@antumi/protocol'
import { clock } from './chat-text'
import { t } from './i18n'

// How the phone words usage limits (desktop usage-format and AgentQuota), in this app's words.

export function windowName(window: UsageWindow): string {
  const period = t(window.kind === 'session' ? 'quotaSession' : window.kind === 'daily' ? 'quotaDaily' : window.kind === 'monthly' ? 'quotaMonthly' : 'quotaWeekly')
  return window.model ? `${window.model} ${period}` : period
}

// Within a day as how long is left, further off as when; `compact` keeps to how long, in days.
export function resetText(window: UsageWindow, now = Date.now(), compact = false): string {
  if (window.resetsAt === null) return ''
  const minutes = Math.ceil((window.resetsAt - now) / 60_000)
  if (minutes <= 0) return t('quotaResetting')
  if (minutes < 60) return t('quotaResetsIn', { when: t('durationMinutes', { minutes }) })
  if (minutes < 24 * 60) return t('quotaResetsIn', { when: t('durationHours', { hours: Math.floor(minutes / 60) }) })
  if (compact) return t('quotaResetsIn', { when: t('durationDays', { days: Math.floor(minutes / (24 * 60)) }) })
  return t('quotaResetsAt', { time: clock(window.resetsAt, now) })
}

export function usedText(window: UsageWindow): string {
  return window.usedPercent >= 100 ? t('quotaSpent') : t('quotaUsed', { percent: Math.round(window.usedPercent) })
}

// The agents worth a word, each with the window that binds it first; one signed out or not read
// yet says nothing rather than guessing.
export function shownQuotas(usage: readonly AgentUsage[] | null, now = Date.now()): { usage: AgentUsage; verdict: QuotaVerdict & { window: UsageWindow } }[] {
  return (usage ?? []).flatMap((each) => {
    const verdict = quotaVerdict(each, now)
    return verdict.window ? [{ usage: each, verdict: { ...verdict, window: verdict.window } }] : []
  })
}

// For the agent about to be started: said only once a cap is reached.
export function exhaustedText(usage: AgentUsage | undefined, model: string | null, now = Date.now()): string | null {
  const verdict = quotaVerdict(usage, now, model)
  if (verdict.state !== 'exhausted' || !verdict.window) return null
  const window = windowName(verdict.window)
  return verdict.window.resetsAt === null ? t('quotaExhausted', { window }) : t('quotaExhaustedResets', { window, time: clock(verdict.window.resetsAt, now) })
}
