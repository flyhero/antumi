import { quotaVerdict, usageLevel, type AgentUsage } from '@antumi/protocol'
import { t } from '../i18n'
import { usePreferences } from '../preferences'
import { percentText, resetText, shownPercent, useNow, windowLabel } from '../usage-format'

export function SettingsQuotaReadout({ usage }: { usage: AgentUsage | undefined }) {
  const display = usePreferences((s) => s.usageDisplay)
  const now = useNow(60_000)
  if (!usage) return <span className="settings-quota-note">{t('AgentAccounts.noUsage')}</span>
  if (usage.status === 'signed-out') return <span className="settings-quota-note">{t('InstalledAgentsSettings.notSignedIn')}</span>
  const stale = quotaVerdict(usage, now).stale
  const general = usage.windows.filter((window) => window.model === null)
  const windows = general.length ? general : usage.windows
  return (
    <div className="settings-quota-readout">
      {windows.map((window) => {
        const valueLabel = display === 'remaining' ? percentText(window, display) : t('AgentQuota.used', { used: Math.round(window.usedPercent) })
        const resetting = window.resetsAt !== null && window.resetsAt <= now
        return (
          <div className="settings-quota-window" key={`${window.kind}/${window.model}`} data-level={usageLevel(window.usedPercent)}>
            <span>{windowLabel(window)}</span>
            {resetting ? <span className="settings-quota-note">{t('UsageBar.resettingSoon')}</span> : <>
              <meter min={0} max={100} value={shownPercent(window, display)} aria-label={`${windowLabel(window)} ${valueLabel}`} />
              <span className="settings-quota-value">{valueLabel}</span>
            </>}
            {!resetting && window.resetsAt !== null && <span className="settings-quota-reset">{resetText(window, now)}</span>}
          </div>
        )
      })}
      {usage.status === 'error' ? <span className="settings-quota-note" data-problem>{usage.error === 'auth-expired' ? t('SettingsPage.quotaAuthExpired') : t('SettingsPage.quotaRefreshFailed')}</span>
        : stale ? <span className="settings-quota-note">{t('AgentQuota.mayBeOutdated')}</span>
          : windows.length === 0 ? <span className="settings-quota-note">{t('AgentAccounts.noUsage')}</span> : null}
    </div>
  )
}
