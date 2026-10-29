import { useId, useState } from 'react'
import { AGENT_KINDS, type AgentKind } from '@antumi/protocol'
import { t } from '../i18n'
import { refreshUsage, setChatSettings, setSettingsOpen, useAccountsSupported, useCore } from '../core-store'
import { setPreference, usePreferences } from '../preferences'
import { agentLabel } from '../labels'
import { Segmented, SettingsGroup, SettingsRow, Toggle } from './SettingsControls'
import { UsageAutomationSettings } from './UsageAutomationSettings'
import { SettingsQuotaReadout } from './SettingsQuotaReadout'
import { SettingsEmptyState } from './SettingsEmptyState'
import { AgentIcon, GaugeIcon, RefreshIcon } from './icons'

function QuotaAgentRow({ agent, disabled }: { agent: AgentKind; disabled: boolean }) {
  const labelId = useId()
  const usage = useCore((s) => s.usage?.[agent])
  const hidden = usePreferences((s) => s.hiddenUsageAgents)
  return (
    <div className="quota-agent-row">
      <div className="quota-agent-identity"><AgentIcon agent={agent} /><div><span id={labelId}>{agentLabel(agent)}</span>{usage?.plan && <span className="settings-quota-note">{usage.plan}</span>}</div></div>
      <SettingsQuotaReadout usage={usage} />
      <Toggle labelId={labelId} checked={!hidden.includes(agent)} disabled={disabled} onChange={(next) => {
        const current = usePreferences.getState().hiddenUsageAgents
        setPreference('hiddenUsageAgents', next ? current.filter((entry) => entry !== agent) : [...current.filter((entry) => entry !== agent), agent])
      }} />
    </div>
  )
}

export function UsageSettings() {
  const showUsage = usePreferences((s) => s.showUsage)
  const usage = useCore((s) => s.usage)
  const connected = useCore((s) => s.connection === 'connected')
  const accountsSupported = useAccountsSupported()
  const automation = useCore((s) => s.rpc?.features.includes('usage-analytics') ?? false)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => { setRefreshing(true); try { await refreshUsage() } finally { setRefreshing(false) } }
  const agents = AGENT_KINDS.filter((agent) => usage?.[agent] !== undefined)
  const display = usePreferences((s) => s.usageDisplay)
  const advice = usePreferences((s) => s.quotaAdvice)
  const announcements = useCore((s) => s.chatSettings?.resetAnnouncements)
  return (
    <div className="quota-settings">
      <SettingsGroup title={t('SettingsPage.quotaDisplay')}>
      <SettingsRow
        label={t('SettingsPage.showUsageQuotaInStatusBar')}
        description={t('SettingsPage.subscriptionQuotaWindowsForEachAgentSuchAs')}
        control={(labelId) => (
          <Toggle labelId={labelId} checked={showUsage} onChange={(next) => setPreference('showUsage', next)} />
        )}
      />
      <SettingsRow
        label={t('SettingsPage.percentageDisplay')}
        description={t('SettingsPage.changesTheDisplayedNumberOnlyLowQuotaWarning')}
        control={(labelId) => (
          <Segmented
            labelId={labelId}
            value={display}
            onChange={(next) => setPreference('usageDisplay', next)}
            options={[
              { value: 'used', label: t('SettingsPage.used') },
              { value: 'remaining', label: t('SettingsPage.remaining') }
            ]}
          />
        )}
      />
      </SettingsGroup>
      <section className="quota-agent-section" aria-labelledby="quota-agent-heading">
        <div className="settings-section-toolbar">
          <div><h3 id="quota-agent-heading">{t('SettingsPage.quotaAgents')}</h3><p>{showUsage ? t('SettingsPage.quotaAgentsHint') : t('SettingsPage.quotaBarHidden')}</p></div>
          <button type="button" className="button ghost" disabled={!connected || refreshing} onClick={() => void refresh()}><RefreshIcon />{refreshing ? t('UsageBar.refreshing') : t('UsageBar.refreshNow')}</button>
        </div>
        {agents.length ? <div className="quota-agent-list">{agents.map((agent) => <QuotaAgentRow key={agent} agent={agent} disabled={!showUsage} />)}</div> :
          <SettingsEmptyState icon={<GaugeIcon />} title={t('AgentAccounts.noUsage')} actions={accountsSupported ? <button type="button" className="button" onClick={() => setSettingsOpen(true, 'accounts')}>{t('AgentAccounts.manage')}</button> : undefined}>{connected ? t('SettingsPage.quotaEmptyHint') : t('ChatCommandSettings.connectToAntumiCoreToView')}</SettingsEmptyState>}
      </section>
      <details className="settings-disclosure">
        <summary>{t('SettingsPage.quotaAdviceAndAlerts')}</summary>
      <SettingsRow
        label={t('SettingsPage.quotaAdviceAndAlerts')}
        description={t('SettingsPage.estimateUsagePaceAgainstResetTimesShowAdvice')}
        control={(labelId) => (
          <Toggle labelId={labelId} checked={advice} onChange={(next) => setPreference('quotaAdvice', next)} />
        )}
      />
      {announcements !== undefined && (
        <SettingsRow
          label={t('SettingsPage.showServiceWideResetAnnouncements')}
          description={t('SettingsPage.showUpcomingAndRecentResetsWhenServicesSuch')}
          control={(labelId) => (
            <Toggle labelId={labelId} checked={announcements} onChange={(next) => void setChatSettings({ resetAnnouncements: next })} />
          )}
        />
      )}
      </details>
      {automation && <details className="settings-disclosure"><summary>{t('UsageAnalytics.automation')}</summary><UsageAutomationSettings embedded /></details>}
    </div>
  )
}

