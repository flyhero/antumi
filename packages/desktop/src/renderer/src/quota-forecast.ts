import { useEffect, useState } from 'react'
import type { UsageForecast } from '@antumi/protocol'
import { useCore } from './core-store'
import { getLocale, t } from './i18n'

export function useQuotaForecasts(): UsageForecast[] {
  const rpc = useCore((state) => state.rpc)
  const [forecasts, setForecasts] = useState<UsageForecast[]>([])
  useEffect(() => {
    if (!rpc?.features.includes('usage-analytics')) return
    let current = true
    const refresh = () => { void rpc.call('usage.forecasts', {}).then((result) => { if (current) setForecasts(result) }, () => {}) }
    refresh()
    const stop = rpc.on('usage.changed', refresh)
    const interval = setInterval(refresh, 60_000)
    return () => { current = false; stop(); clearInterval(interval) }
  }, [rpc])
  return forecasts
}

// When a window runs out before it resets, as the forecast has it, and how that was worked out;
// null where it lasts, or there is too little to tell.
export function forecastRunsOut(forecast: UsageForecast | undefined, resetAt?: number | null): { at: number; basis: string } | null {
  if (!forecast || forecast.runsOutAt === null || (forecast.basis !== 'recent' && forecast.basis !== 'window')) return null
  if (resetAt === undefined ? !forecast.beforeReset : resetAt === null || forecast.runsOutAt >= resetAt) return null
  return { at: forecast.runsOutAt, basis: forecast.basis === 'window' ? t('UsageAnalytics.windowAverage') : t('UsageAnalytics.recentRate') }
}

export function forecastText(forecast: UsageForecast): string {
  if (forecast.basis === 'stale') return t('UsageAnalytics.stale')
  if (forecast.basis === 'idle') return t('UsageAnalytics.idle')
  if (forecast.basis === 'insufficient') return t('UsageAnalytics.insufficient')
  const basis = forecast.basis === 'window' ? t('UsageAnalytics.windowAverage') : t('UsageAnalytics.recentRate')
  if (!forecast.beforeReset) return `${forecast.scheduledReset?.kind === 'reset' ? t('quotaAdviceText.expectedResetFirst') : t('UsageAnalytics.resetFirst')} · ${basis}`
  const at = forecast.runsOutAt === null ? '—' : new Date(forecast.runsOutAt).toLocaleString(getLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `${t('UsageAnalytics.exhaustsAt', { at })} · ${basis}`
}
