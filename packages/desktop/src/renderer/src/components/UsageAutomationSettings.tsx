import { useEffect, useState, type FormEvent } from 'react'
import { UsageAutomationPolicy, agentDescriptor, type AgentAccount, type UsageAutomationState } from '@antumi/protocol'
import { accountName } from '../agent-accounts'
import { perform, setSettingsOpen, useAccountsSupported, useCore } from '../core-store'
import { getLocale, t } from '../i18n'
import { agentLabel } from '../labels'
import { SettingsGroup, SettingsRow, Toggle } from './SettingsControls'

function PolicyForm({ account, policy, saved }: { account: AgentAccount; policy?: UsageAutomationState['policies'][number]; saved(state: UsageAutomationState): void }) {
  const [daily, setDaily] = useState(policy?.daily.join(', ') ?? '')
  const [zone, setZone] = useState(policy?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [reset, setReset] = useState(policy?.afterReset ?? false)
  const [week, setWeek] = useState(policy?.weekReset ?? false)
  const [expiring, setExpiring] = useState(policy?.expiringReset ?? false)
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = UsageAutomationPolicy.safeParse({ agent: account.agent, account: account.id, daily: [...new Set(daily.split(',').map((time) => time.trim()).filter(Boolean))],
      timeZone: zone.trim(), afterReset: reset, weekReset: week, expiringReset: expiring })
    setInvalid(!parsed.success)
    if (!parsed.success) return
    setBusy(true)
    try { const state = await perform((rpc) => rpc.call('usage.configureAutomation', parsed.data)); if (state) saved(state) }
    finally { setBusy(false) }
  }
  return <form onSubmit={(event) => void submit(event)}>
    {policy?.paused && <p role="status" className="settings-note">{t('UsageAnalytics.identityPaused')}</p>}
    <SettingsRow label={t('UsageAnalytics.dailyWarmup')} description={t('UsageAnalytics.dailyHint')} control={(id) => <input className="input" aria-labelledby={id} placeholder="06:00, 11:00" value={daily} onChange={(event) => setDaily(event.target.value)} />} />
    <SettingsRow label={t('UsageAnalytics.timeZone')} control={(id) => <input className="input" aria-labelledby={id} value={zone} onChange={(event) => setZone(event.target.value)} />} />
    <SettingsRow label={t('UsageAnalytics.afterReset')} control={(id) => <Toggle labelId={id} checked={reset} onChange={setReset} />} />
    {agentDescriptor(account.agent).quotaAutomation?.resetCredits && <>
      <SettingsRow label={t('UsageAnalytics.weekReset')} description={t('UsageAnalytics.weekHint')} control={(id) => <Toggle labelId={id} checked={week} onChange={setWeek} />} />
      <SettingsRow label={t('UsageAnalytics.expiringReset')} description={t('UsageAnalytics.expiringHint')} control={(id) => <Toggle labelId={id} checked={expiring} onChange={setExpiring} />} />
    </>}
    {invalid && <p role="alert" className="settings-note">{t('UsageAnalytics.invalidPolicy')}</p>}
    <p className="settings-note">{t('UsageAnalytics.warmupNote')}</p>
    <button type="submit" className="button" disabled={busy}>{t('FileEditor.save')}</button>
  </form>
}

export function UsageAutomationSettings({ embedded = false }: { embedded?: boolean }) {
  const rpc = useCore((state) => state.rpc)
  const accounts = useCore((state) => state.accounts)
  const [state, setState] = useState<UsageAutomationState | null>(null)
  const accountsSupported = useAccountsSupported()
  const [problem, setProblem] = useState(false)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (!rpc?.features.includes('usage-analytics')) return
    let current = true
    const load = () => { void rpc.call('usage.automation', {}).then((value) => { if (current) { setState(value); setProblem(false) } }, () => { if (current) setProblem(true) }) }
    load()
    const interval = setInterval(load, 60_000)
    return () => { current = false; clearInterval(interval) }
  }, [rpc, reload])
  if (!rpc?.features.includes('usage-analytics')) return null
  if (!state) return <div className="settings-loading" role="status">{problem ? <>{t('SettingsPage.automationLoadFailed')}<button type="button" className="button" onClick={() => setReload((value) => value + 1)}>{t('ChatContextMenu.retry')}</button></> : t('SettingsPage.automationLoading')}</div>
  const eligible = accounts?.accounts.filter((entry) => agentDescriptor(entry.agent).quotaAutomation) ?? []
  const account = eligible.find((entry) => `${entry.agent}/${entry.id}` === selected) ?? eligible[0]
  if (!eligible.length) return <div className="settings-loading"><p>{t('SettingsPage.automationNoAccounts')}</p>{accountsSupported && <button type="button" className="button" onClick={() => setSettingsOpen(true, 'accounts')}>{t('AgentAccounts.manage')}</button>}</div>
  return <SettingsGroup title={embedded ? undefined : t('UsageAnalytics.automation')}>
    {problem && <div className="settings-loading" role="status"><span>{t('SettingsPage.automationLoadFailed')}</span><button type="button" className="button" onClick={() => setReload((value) => value + 1)}>{t('ChatContextMenu.retry')}</button></div>}
    <SettingsRow label={t('UsageAnalytics.account')} control={(id) => <select className="input" aria-labelledby={id} value={account ? `${account.agent}/${account.id}` : ''} onChange={(event) => setSelected(event.target.value)}>
      {eligible.map((entry) => <option key={`${entry.agent}/${entry.id}`} value={`${entry.agent}/${entry.id}`}>{agentLabel(entry.agent)} · {accountName(entry)}</option>)}
    </select>} />
    {account && <PolicyForm key={`${account.agent}/${account.id}`} account={account} policy={state.policies.find((policy) => policy.agent === account.agent && policy.account === account.id)} saved={setState} />}
    {state.recent.length > 0 && <details className="usage-automation-history"><summary>{t('UsageAnalytics.recentActions')}</summary>{state.recent.map((entry) => <p key={entry.id}>
      <span>{agentLabel(entry.agent)} · {accounts?.accounts.find((account) => account.agent === entry.agent && account.id === entry.account)?.email || entry.account} · {t(`UsageAnalytics.action.${entry.kind}`)}</span>
      <span className="muted">{new Date(entry.at).toLocaleString(getLocale())} · {t(`UsageAnalytics.state.${entry.state}`)}{entry.detail ? ` · ${entry.detail}` : ''}</span>
      {entry.kind !== 'warmup' && entry.state !== 'completed' && <button type="button" className="button ghost" onClick={() => { void perform((client) => client.call('usage.retryReset', { id: entry.id })).then((result) => { if (result) setState(result) }) }}>{t('UsageAnalytics.retryReset')}</button>}
    </p>)}</details>}
  </SettingsGroup>
}
