import { getLocale, t } from '../i18n'
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { AGENT_KINDS, DEFAULT_ACCOUNT, accountUsage, accountsSupported, activeAccount, agentDescriptor, type AccountKey, type AgentAccount, type AgentKind } from '@antumi/protocol'
import { activateAccount, addAccount, removeAccount, renameAccount, setAccountAutoSwitch, setAccountKey, setSettingsOpen, signInAccount, useAccountKeysSupported, useCore } from '../core-store'
import { accountName, accountsOf } from '../agent-accounts'
import { agentLabel } from '../labels'
import { SettingsQuotaReadout } from './SettingsQuotaReadout'
import { accountDetail } from './AccountPicker'
import { SettingsEmptyState } from './SettingsEmptyState'
import { ContextMenu, type MenuPoint } from './ContextMenu'
import { AgentIcon, MoreIcon, PersonIcon } from './icons'
import { SettingsGroup, SettingsRow, Toggle } from './SettingsControls'

function UsageSummary({ account }: { account: AgentAccount }) {
  const usage = useCore((s) => accountUsage(s.accountUsage, account.agent, account.id))
  // An agent whose usage core never reads (CodeBuddy's) has nothing to wait for.
  const read = useCore((s) => s.accountUsage.some((each) => each.agent === account.agent))
  if (!account.signedIn || (!usage && !read)) return null
  return <SettingsQuotaReadout usage={usage} />
}

// An API key and the edition it is for, with a name when adding: the key is sent once and never shown again.
function KeyForm({ agent, withLabel, edition: initial, submit, onCancel }: {
  agent: AgentKind
  withLabel: boolean
  edition?: string | null
  submit: (label: string | null, key: AccountKey) => Promise<boolean>
  onCancel: () => void
}) {
  const editions = agentDescriptor(agent, getLocale()).accountKeys?.editions ?? []
  const [label, setLabel] = useState('')
  const [edition, setEdition] = useState(initial ?? editions[0]?.id ?? '')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!apiKey.trim() || !edition || busy) return
    setBusy(true)
    try {
      if (await submit(label.trim() || null, { apiKey: apiKey.trim(), edition })) onCancel()
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="chat-command-actions account-add account-key-form" onSubmit={(event) => void save(event)}>
      {withLabel && <input className="input" aria-label={t('AgentAccounts.namePlaceholder')} autoFocus value={label} maxLength={60} placeholder={t('AgentAccounts.namePlaceholder')} onChange={(event) => setLabel(event.target.value)} />}
      <select className="input" aria-label={t('AgentAccounts.edition')} value={edition} onChange={(event) => setEdition(event.target.value)}>
        {editions.map((each) => <option key={each.id} value={each.id}>{each.label}</option>)}
      </select>
      <input className="input mono" type="password" autoComplete="new-password" spellCheck={false} aria-label={t('AgentAccounts.apiKey')} placeholder={t('AgentAccounts.apiKey')} autoFocus={!withLabel} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
      <button type="button" className="button ghost" onClick={onCancel}>{t('ChatCommandSettings.cancel')}</button>
      <button type="submit" className="button primary" disabled={busy || !apiKey.trim()}>{withLabel ? t('AgentAccounts.addKey') : t('FileEditor.save')}</button>
    </form>
  )
}

function AccountRow({ account, active }: { account: AgentAccount; active: boolean }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [rekeying, setRekeying] = useState(false)
  const [busy, setBusy] = useState(false)
  const own = account.id === DEFAULT_ACCOUNT
  const keyed = Boolean(account.edition)
  // A key account signs in again by being given a key.
  const signIn = () => keyed ? setRekeying(true) : void act(() => signInAccount(account.agent, account.id))
  const detail = [accountDetail(account), account.plan].filter(Boolean).join(' · ')
  const trigger = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  const rename = async (event: FormEvent) => {
    event.preventDefault()
    if (renaming === null) return
    await act(() => renameAccount(account.agent, account.id, renaming.trim() || null))
    setRenaming(null)
  }
  return (
    <article className="account-entry">
      <div className="account-entry-main">
        <div className="settings-row-text">
          <div className="agent-row-head">
            <span className="settings-row-label">{accountName(account)}</span>
            {active && <span className="agent-row-pill">{t('AgentAccounts.active')}</span>}
            <span className="environment-pill" data-level={account.signedIn ? 'ok' : 'warning'}>{account.signedIn ? t('InstalledAgentsSettings.signedIn') : t('InstalledAgentsSettings.notSignedIn')}</span>
          </div>
          {detail ? <p className="settings-row-description">{detail}</p> : null}

        </div>
        <div className="account-entry-actions">
          {!account.signedIn ? <button type="button" className="button" disabled={busy} onClick={signIn}>{keyed ? t('AgentAccounts.changeKey') : t('AgentAccounts.signIn')}</button>
            : !active && <button type="button" className="button" disabled={busy} onClick={() => void act(() => activateAccount(account.agent, account.id))}>{t('AgentAccounts.makeActive')}</button>}
          <button type="button" className="icon-button" ref={trigger} disabled={busy} aria-label={t('SettingsPage.manageNamedAccount', { name: accountName(account) })} aria-haspopup="menu" aria-expanded={menu !== null} onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            setMenu(menu ? null : { x: box.right, y: box.bottom + 4 })
          }}><MoreIcon /></button>
          {menu && <ContextMenu at={menu} align="end" trigger={trigger.current} label={t('SettingsPage.manageNamedAccount', { name: accountName(account) })} onClose={closeMenu}>
            {account.signedIn && <button type="button" role="menuitem" className="menu-item" onClick={() => { closeMenu(); signIn() }}>{keyed ? t('AgentAccounts.changeKey') : t('AgentAccounts.signInAgain')}</button>}
            <button type="button" role="menuitem" className="menu-item" onClick={() => { closeMenu(); setRenaming(account.label ?? '') }}>{t('AgentAccounts.rename')}</button>
            {!own && <button type="button" role="menuitem" className="menu-item" onClick={() => { closeMenu(); setRemoving(true) }}>{t('ChatCommandSettings.delete')}</button>}
          </ContextMenu>}
        </div>
      </div>
      <UsageSummary account={account} />
      {rekeying && <KeyForm agent={account.agent} withLabel={false} edition={account.edition} submit={(_label, key) => setAccountKey(account.agent, account.id, key)} onCancel={() => setRekeying(false)} />}
      {renaming !== null && (
        <form className="chat-command-actions" onSubmit={(event) => void rename(event)}>
          <input className="input" aria-label={t('AgentAccounts.namePlaceholder')} autoFocus value={renaming} maxLength={60} placeholder={t('AgentAccounts.namePlaceholder')} onChange={(event) => setRenaming(event.target.value)} />
          <button type="button" className="button ghost" onClick={() => setRenaming(null)}>{t('ChatCommandSettings.cancel')}</button>
          <button type="submit" className="button primary" disabled={busy}>{t('FileEditor.save')}</button>
        </form>
      )}
      {removing && <div className="account-remove-confirm">
        <p>{t('AgentAccounts.removeWarning')}</p>
        <button type="button" className="button" disabled={busy} onClick={() => void act(() => removeAccount(account.agent, account.id))}>{t('McpSettingsSection.confirmDeletion')}</button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => setRemoving(false)}>{t('ChatCommandSettings.cancel')}</button>
      </div>}
    </article>
  )
}

// Adding one signs it in right away: with an API key where the agent takes them, else in the
// terminal panel, which opens on it.
function AddAccount({ agent }: { agent: AgentKind }) {
  const keys = agentDescriptor(agent, getLocale()).accountKeys
  const keysSupported = useAccountKeysSupported()
  const [adding, setAdding] = useState(false)
  if (keys && keysSupported) {
    return adding
      ? <KeyForm agent={agent} withLabel submit={(label, key) => addAccount(agent, label, key)} onCancel={() => setAdding(false)} />
      : <div className="chat-command-actions account-add"><button type="button" className="button" title={keys.hint} onClick={() => setAdding(true)}>{t('AgentAccounts.add', { value1: agentLabel(agent) })}</button></div>
  }
  // An older core adds none of an agent that takes only keys.
  if (keys?.only) return null
  return <TerminalAccount agent={agent} />
}

function TerminalAccount({ agent }: { agent: AgentKind }) {
  const [label, setLabel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (label === null || busy) return
    setBusy(true)
    try {
      await addAccount(agent, label.trim() || null)
      setStarted(true)
      setLabel(null)
    } finally {
      setBusy(false)
    }
  }
  if (label === null) {
    return (
      <div className="chat-command-actions account-add">
        {started && <span className="settings-note">{t('AgentAccounts.signInHint')}</span>}
        <button type="button" className="button" onClick={() => setLabel('')}>{t('AgentAccounts.add', { value1: agentLabel(agent) })}</button>
      </div>
    )
  }
  return (
    <form className="chat-command-actions account-add" onSubmit={(event) => void add(event)}>
      <input className="input" aria-label={t('AgentAccounts.namePlaceholder')} autoFocus value={label} maxLength={60} placeholder={t('AgentAccounts.namePlaceholder')} onChange={(event) => setLabel(event.target.value)} />
      <button type="button" className="button ghost" onClick={() => setLabel(null)}>{t('ChatCommandSettings.cancel')}</button>
      <button type="submit" className="button primary" disabled={busy}>{t('AgentAccounts.addAndSignIn')}</button>
    </form>
  )
}

// Each agent's accounts, the one its next process starts on, and whether a usage limit moves it on.
export function AgentAccountSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const accounts = useCore((s) => s.accounts)
  const environment = useCore((s) => s.environment)
  if (!connected || !accounts || !environment) return <SettingsEmptyState icon={<PersonIcon />} title={connected ? t('SettingsPage.accountsLoading') : t('SettingsPage.accountsDisconnected')}>{connected ? t('SettingsPage.accountsLoadingHint') : t('ChatCommandSettings.connectToAntumiCoreToView')}</SettingsEmptyState>
  // Core supplies a default account even without a CLI; its account list also bounds older cores' support.
  const agents = AGENT_KINDS.filter((agent) => accountsSupported(agent)
    && environment.checks.some((check) => check.tool === agent && check.status !== 'missing')
    && accounts.accounts.some((account) => account.agent === agent))
  if (!agents.length) return <SettingsEmptyState icon={<PersonIcon />} title={t('SettingsPage.noAccountAgents')} actions={<button type="button" className="button" onClick={() => setSettingsOpen(true, 'agents')}>{t('SettingsPage.viewAgents')}</button>}>{t('SettingsPage.noAccountAgentsHint')}</SettingsEmptyState>
  return (
    <div className="account-settings">
      <SettingsGroup>
        <SettingsRow
          label={t('AgentAccounts.autoSwitch')}
          description={t('AgentAccounts.autoSwitchDescription')}
          control={(labelId) => <Toggle labelId={labelId} checked={accounts.autoSwitch} onChange={(next) => void setAccountAutoSwitch(next)} />}
        />
      </SettingsGroup>
      {agents.map((agent) => {
        const own = accountsOf(accounts, agent)
        const active = activeAccount(accounts, agent)
        return <section key={agent} className="account-agent-group" aria-label={agentLabel(agent)}>
          <header className="account-agent-heading">
            <h3><AgentIcon agent={agent} />{agentLabel(agent)}<span>{t('SettingsPage.accountCount', { count: own.length })}</span></h3>
            <AddAccount agent={agent} />
          </header>
          <div className="settings-card">
            {own.length ? own.sort((a, b) => Number(b.id === active) - Number(a.id === active)).map((account) => <AccountRow key={account.id} account={account} active={active === account.id} />)
              : <p className="settings-quota-note account-empty">{t('SettingsPage.accountEmptyHint')}</p>}
          </div>
        </section>
      })}
      <details className="settings-disclosure"><summary>{t('SettingsPage.accountSwitchingHelp')}</summary><p>{t('AgentAccounts.intro')}</p></details>
    </div>
  )
}
