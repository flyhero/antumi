import { getLocale, localized, t } from './i18n'
import { useEffect, useState } from 'react'
import { tightestWindow, type AgentUsage, type GlobalResets, type ResetCreditOutcome, type UsageWindow } from '@antumi/protocol'
import type { Preferences } from './preferences'

// How usage numbers read wherever they show: the status bar, and next to an agent being picked.

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) {
    return t('statFormat.lessThan1Minute')
  }
  if (minutes < 60) {
    return t('chatTools.min', { minutes: minutes })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return minutes % 60 ? t('statFormat.hM', { hours: hours, value2: minutes % 60 }) : t('statFormat.h', { hours: hours })
  }
  return hours % 24 ? t('usageFormat.dH', { value1: Math.floor(hours / 24), value2: hours % 24 }) : t('usageFormat.d', { value1: Math.floor(hours / 24) })
}

export function formatClock(at: number, now: number): string {
  const date = new Date(at)
  const time = date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })
  if (date.toDateString() === new Date(now).toDateString()) {
    return t('usageFormat.today', { time: time })
  }
  return `${date.toLocaleDateString(getLocale(), { weekday: 'short' })} ${time}`
}

export function windowLabel(window: UsageWindow): string {
  if (window.kind === 'session') {
    return '5h'
  }
  const period = window.kind === 'daily' ? t('usageFormat.thisDay') : window.kind === 'monthly' ? t('usageFormat.thisMonth') : t('usageFormat.thisWeek')
  return window.model ? `${window.model} ${period}` : period
}

export function resetText(window: UsageWindow, now: number): string {
  if (window.resetsAt === null) {
    return ''
  }
  if (window.resetsAt <= now) {
    return t('UsageBar.resettingSoon')
  }
  return t('usageFormat.resetsIn', { value1: formatDuration(window.resetsAt - now), value2: formatClock(window.resetsAt, now) })
}

// Urgency colors always follow what is used; only the number and the fill flip.
export function shownPercent(window: UsageWindow, display: Preferences['usageDisplay']): number {
  return display === 'remaining' ? 100 - window.usedPercent : window.usedPercent
}

export function percentText(window: UsageWindow, display: Preferences['usageDisplay']): string {
  const value = Math.round(shownPercent(window, display))
  return display === 'remaining' ? t('usageFormat.remaining', { value: value }) : `${value}%`
}

export function clearsText(clears: readonly UsageWindow['kind'][]): string {
  const session = clears.includes('session')
  const weekly = clears.includes('weekly')
  if (session && weekly) {
    return t('usageFormat.reset5hAndWeeklyUsage')
  }
  return session ? t('usageFormat.reset5hUsage') : weekly ? t('usageFormat.resetWeeklyUsage') : ''
}

// Said before a reset is spent: it cannot be taken back, and windows with room left waste it.
export function spendNote(usage: AgentUsage, clearing: readonly UsageWindow['kind'][]): string {
  const clears = clearsText(clearing)
  const tightest = tightestWindow(usage.windows)
  const room = tightest && tightest.usedPercent < 100 ? t('usageFormat.quotaRemainsUsingTheCardAfterExhaustionOffers', { value1: 100 - Math.round(tightest.usedPercent) }) : ''
  return t('usageFormat.useOneCardToImmediatelyThisCannotBe', { value1: clears || t('usageFormat.restoreQuota'), room: room })
}

export const SPEND_OUTCOME_TEXT: Record<ResetCreditOutcome, string> = localized(() => ({
  reset: t('usageFormat.usedOneResetCardQuotaRestored'),
  'nothing-to-reset': t('usageFormat.noUsedQuotaToResetNoCardConsumed'),
  'no-credit': t('usageFormat.noResetCardsAvailable'),
  'already-used': t('usageFormat.thisResetCardWasAlreadyUsedQuotaRestored')
}))

// The resets a service announced for everyone, line by line: one still to land leads, and the odds
// of another only show while none is announced.
export function globalResetText(resets: GlobalResets, now: number): { upcoming: string | null; latest: string | null; chance: string | null } {
  const { upcoming, latest, chance48h } = resets
  const ago = (at: number) => t('usageFormat.ago', { value1: formatDuration(Math.max(0, now - at)) })
  return {
    upcoming: upcoming
      ? t('usageFormat.serviceWideResetAnnouncedPosted', { value1: upcoming.scheduledFor !== null && upcoming.scheduledFor > now ? t('usageFormat.expected', { value1: formatClock(upcoming.scheduledFor, now) }) : '', value2: ago(upcoming.at) })
      : null,
    latest: latest ? `${latest.kind === 'banked' ? t('usageFormat.latestResetCardDistributionToAllPaidAccounts') : t('usageFormat.latestServiceWideReset')}：${ago(latest.at)}` : null,
    chance: !upcoming && chance48h !== null ? t('usageFormat.aboutChanceOfAnotherResetWithin48Hours', { value1: Math.round(chance48h * 100) }) : null
  }
}
