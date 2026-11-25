import { getLocale, t, tr } from '../i18n'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { AGENT_KINDS, agentDescriptor, agentReadiness, type AgentCliInstallation, type AgentKind, type DetectedAgent, type EnvironmentCheck } from '@antumi/protocol'
import { refreshAgentCli, upgradeAgentCli, cancelAgentCliUpgrade, selectConversation, installAgentCli, refreshEnvironment, showTerminal, useCore } from '../core-store'
import { cliStatusText, cliErrorText, cliBackendOutdated, cliChannelText } from '../agent-cli-text'
import { checkStatusText } from '../environment-text'
import { agentLabel, reasonText } from '../labels'
import { setPreference, usePreferences } from '../preferences'
import { CopyButton } from './CopyButton'
import { AgentIcon, RefreshIcon } from './icons'
import { Toggle } from './SettingsControls'
import { agentReadinessText } from '../agent-readiness-text'
import { useProviderProbes } from '../provider-probes'

// Turning one off takes it out of every choice of agent for new work; the last one on stays on.
function setEnabled(kind: AgentKind, enabled: boolean): void {
  const { disabledAgents } = usePreferences.getState()
  setPreference('disabledAgents', enabled ? disabledAgents.filter((each) => each !== kind) : [...new Set([...disabledAgents, kind])])
}

// What to type to put it right, copyable: an install for one that is not there, a sign-in for one
// with no account.
function Fix({ label, command }: { label: string; command: string }) {
  return (
    <p className="environment-fix">
      <span>{label}</span>
      <code>{command}</code>
      <CopyButton text={command} label={t('InstalledAgentsSettings.copyCommand')} />
    </p>
  )
}

function CliMaintenance({ kind, check }: { kind: AgentKind; check: EnvironmentCheck }) {
  const supported = useCore((s) => s.rpc?.features.includes('agent-cli-maintenance') ?? false)
  const status = useCore((s) => supported ? s.agentCli[kind] : undefined)
  const conversations = useCore((s) => s.conversations)
  const terminals = useCore((s) => s.terminals)
  const [opening, setOpening] = useState(false)
  const busy = opening || status?.phase === 'checking' || status?.phase === 'starting' || status?.phase === 'running'
  const running = status?.phase === 'running' || status?.phase === 'starting'
  const upgrade = async () => {
    if (opening) return
    setOpening(true)
    try { await upgradeAgentCli(kind) } finally { setOpening(false) }
  }
  const terminal = terminals.find((each) => each.id === status?.terminalId)
  const blockers = Object.values(conversations).filter((each) => each.sessionId && status?.blockers.includes(each.sessionId))
  const backendOutdated = cliBackendOutdated(status?.error ?? null)
  const operationVisible = status && status.phase !== 'idle' && !backendOutdated
  const updateAvailable = status?.availability === 'available'
  const error = status?.error && !backendOutdated ? cliErrorText(status.error) : null
  const path = check.path ?? status?.path
  const channelText = cliChannelText(status?.channel)
  // Only core proves how a CLI was installed; a guessed command could install a second copy.
  const upgradeCommand = status?.upgradeCommand ?? null
  const settled = status !== undefined && status.checkedAt !== null
  const canUpgradeInApp = Boolean(status?.canUpgrade && !backendOutdated)

  const upgradeButton = canUpgradeInApp && status?.availability !== 'current' && (
    <button type="button" className="button" disabled={busy} onClick={() => void upgrade()}>
      {opening ? t('agentCli.starting') : updateAvailable ? t('agentCli.upgrade') : t('agentCli.checkUpgrade')}
    </button>
  )
  return (
    <div className="agent-cli-maintenance">
      {(operationVisible || updateAvailable) && (
        <div className="agent-cli-summary" role="status">
          <span className="settings-row-description">
            {operationVisible ? cliStatusText(status) : status?.latestVersion ? t('agentCli.updateTo', { version: status.latestVersion }) : t('agentCli.available')}
          </span>
          {running ? (
            <button type="button" className="button" onClick={() => void cancelAgentCliUpgrade(kind)}>
              {t('agentCli.cancel')}
            </button>
          ) : (
            canUpgradeInApp && updateAvailable && upgradeButton
          )}
        </div>
      )}
      {operationVisible && error && <p className="settings-row-description" role="status">{error}</p>}
      {blockers.map((conversation) => (
        <button key={conversation.id} type="button" className="button ghost" onClick={() => selectConversation(conversation.id)}>
          {t('agentCli.openConversation', { title: conversation.title })}
        </button>
      ))}
      {terminal && (
        <button type="button" className="button ghost" onClick={() => showTerminal(terminal.id)}>
          {t('agentCli.output')}
        </button>
      )}
      <details className="agent-cli-details">
        <summary>{t('InstalledAgentsSettings.details')}</summary>
        {check.signedIn === null && !agentDescriptor(kind).environment.verifyNativeModels && <p className="settings-row-description">{t('InstalledAgentsSettings.signInUnknown')}</p>}
        {(channelText || path) && (
          <p className="settings-row-description mono agent-row-where" title={path ?? undefined}>
            {channelText ? (path ? `${channelText} · ${path}` : channelText) : path}
          </p>
        )}
        {supported && <p className="settings-row-description">{status ? cliStatusText(status) : t('agentCli.checking')}</p>}
        {!operationVisible && error && <p className="settings-row-description">{error}</p>}
        {settled && (canUpgradeInApp ? (
          <>
            <div className="agent-install-actions">
              {!running && !updateAvailable && upgradeButton}
              <button type="button" className="button ghost" disabled={busy} onClick={() => void refreshAgentCli(kind, true)}>
                {t('agentCli.check')}
              </button>
              {status.availability === 'managed' && (
                <span className="settings-row-description">{t('agentCli.checkUpgradeHint')}</span>
              )}
            </div>
            {upgradeCommand && <Fix label={t('agentCli.orRunInTerminal')} command={upgradeCommand} />}
          </>
        ) : (
          <>
            {upgradeCommand ? (
              <Fix
                label={backendOutdated ? t('agentCli.backendOutdatedUpgradeHint') : t('agentCli.upgradeUnavailableInApp')}
                command={upgradeCommand}
              />
            ) : status.channel !== 'desktop' && status.phase === 'idle' && status.availability !== 'missing' && status.error !== 'agent-cli-source-unknown' && (
              <p className="settings-row-description">{t('agentCli.manual')}</p>
            )}
            {!backendOutdated && (
              <div className="agent-install-actions">
                <button type="button" className="button ghost" disabled={busy} onClick={() => void refreshAgentCli(kind, true)}>
                  {t('agentCli.check')}
                </button>
              </div>
            )}
          </>
        ))}
      </details>
    </div>
  )
}

type NativeModelsCheck = { state: 'idle' } | { state: 'checking' } | { state: 'listed'; count: number } | { state: 'unavailable'; detail?: string }

function nativeModelsBadge(check: NativeModelsCheck): { text: string; level?: 'ok' | 'warning' } {
  if (check.state === 'listed') return { text: t('InstalledAgentsSettings.nativeModelsListed', { count: check.count }), level: 'ok' }
  if (check.state === 'unavailable') return { text: t('InstalledAgentsSettings.nativeModelsUnavailable'), level: 'warning' }
  return { text: t(check.state === 'checking' ? 'InstalledAgentsSettings.nativeModelsChecking' : 'InstalledAgentsSettings.nativeModelsUnchecked') }
}

function AgentRow({ kind, check, enabled, last }: { kind: AgentKind; check: EnvironmentCheck; enabled: boolean; last: boolean }) {
  const labelId = useId()
  const environment = useCore((s) => s.environment)
  const rpc = useCore((s) => s.rpc)
  const providers = useCore((s) => s.modelProviders)
  const disabled = usePreferences((s) => s.disabledAgents)
  const probes = useProviderProbes((s) => s.probes)
  const readiness = agentReadiness(kind, environment, disabled, providers, probes)
  const [nativeModels, setNativeModels] = useState<NativeModelsCheck>({ state: 'idle' })
  const checkNative = enabled && check.status === 'ok' && !check.problem && agentDescriptor(kind).environment.verifyNativeModels
  const canVerifyNative = rpc?.features.includes('chat-catalog-refresh') ?? false
  const nativeBadge = checkNative && readiness.state === 'unknown-auth'
  const nativeStatus = nativeModelsBadge(nativeModels)
  const nativeHelp = t('InstalledAgentsSettings.nativeModelsHelp', { agent: agentLabel(kind) })
  const badge = nativeBadge ? nativeStatus : {
    text: agentReadinessText(readiness, kind), level: readiness.state === 'ready' ? 'ok' : 'warning'
  }
  const verifyNative = async () => {
    if (!rpc || !canVerifyNative || nativeModels.state === 'checking') return
    setNativeModels({ state: 'checking' })
    try {
      const catalog = await rpc.call('conversations.chatCatalog', { agent: kind, refresh: true })
      if (catalog?.models.length) {
        setNativeModels({ state: 'listed', count: catalog.models.length })
        return
      }
      const problem = await rpc.call('conversations.chatCatalogProblem', { agent: kind })
      setNativeModels({ state: 'unavailable', detail: problem ? reasonText(problem.reason, problem.message) : undefined })
    } catch {
      setNativeModels({ state: 'unavailable' })
    }
  }
  const currentVersion = useCore((s) => {
    const cli = s.agentCli[kind]
    return cli?.path === check.path ? cli.currentVersion : null
  })
  const version = check.requiresStandaloneCli ? null : currentVersion ?? check.version ?? (check.status === 'unknown' ? t('InstalledAgentsSettings.versionUnknown') : null)
  return (
    <div className="settings-row agent-row" data-off={!enabled || undefined}>
      <span className="agent-row-icon" aria-hidden="true"><AgentIcon agent={kind} /></span>
      <div className="settings-row-text">
        <div className="agent-row-head">
          <span id={labelId} className="settings-row-label">{agentLabel(kind)}</span>
          {version && <span className="agent-row-version mono" title={check.path ?? undefined}>{version}</span>}
          {!enabled && <span className="agent-row-pill">{t('InstalledAgentsSettings.disabled')}</span>}
          {enabled && (
            <span className="environment-pill" data-level={badge.level} aria-live={nativeBadge ? 'polite' : undefined}>
              {badge.text}
            </span>
          )}
        </div>
        {readiness.state === 'ready' && readiness.via === 'account' && readiness.authSource === 'native-provider' && <p className="settings-row-description">{t('InstalledAgentsSettings.nativeProviderHint')}</p>}
        {check.requiresStandaloneCli ? (
          <Fix label={checkStatusText(check)} command={agentDescriptor(kind, getLocale()).environment.install} />
        ) : check.status === 'unknown' && <p className="settings-row-description">{tr('InstalledAgentsSettings.checkWhetherTheCliCanStart', { value1: checkStatusText(check), value2: agentDescriptor(kind, getLocale()).environment.outdated?.hint ?? '' })}</p>}
        {checkNative ? (
          <div className="agent-install-actions">
            {canVerifyNative && (
              <button type="button" className="button" onClick={() => void verifyNative()} disabled={nativeModels.state === 'checking'}>
                {t(nativeModels.state === 'idle' || nativeModels.state === 'checking' ? 'InstalledAgentsSettings.verifyNativeModels' : 'InstalledAgentsSettings.verifyNativeModelsAgain')}
              </button>
            )}
            {!nativeBadge && nativeModels.state !== 'idle' && <span className="environment-pill" data-level={nativeStatus.level} aria-live="polite">{nativeStatus.text}</span>}
            <span className="settings-row-description" aria-live="polite">
              {nativeModels.state === 'unavailable' ? nativeModels.detail ?? nativeHelp : canVerifyNative ? t('InstalledAgentsSettings.nativeModelsHint') : nativeHelp}
            </span>
          </div>
        ) : (readiness.state === 'needs-account' || readiness.state === 'needs-provider' || readiness.state === 'unknown-auth' || readiness.state === 'authorize-on-use') && <Fix label={t('InstalledAgentsSettings.signIn')} command={agentDescriptor(kind, getLocale()).environment.signIn} />}
        <CliMaintenance kind={kind} check={check} />
      </div>
      <div className="settings-row-control">
        <Toggle
          labelId={labelId}
          checked={enabled}
          disabled={enabled && last}
          title={enabled && last ? t('InstalledAgentsSettings.keepAtLeastOneAgentEnabled') : undefined}
          onChange={(next) => setEnabled(kind, next)}
        />
      </div>
    </div>
  )
}

// One Antumi can run but this machine does not have: dimmed, with what to type to install it.
function MissingAgentRow({ kind, installation }: { kind: AgentKind; installation?: AgentCliInstallation }) {
  const environment = agentDescriptor(kind, getLocale()).environment
  // An installation is offered without the application too, for a runtime Antumi downloads itself.
  const appFound = useCore((s) => s.environment?.detectedAgents?.some((each) => each.id === kind && each.locations.some((location) => location.source === 'application')) ?? false)
  const [opening, setOpening] = useState(false)
  const terminal = useCore((s) => installation ? s.terminals.findLast((each) => !each.conversationId && each.command === installation.command) : undefined)
  const running = terminal && !terminal.exited
  const failed = terminal?.exited && terminal.exitCode !== 0
  const install = async () => {
    if (opening) return
    if (running) { showTerminal(terminal.id); return }
    setOpening(true)
    try { await installAgentCli(kind) } finally { setOpening(false) }
  }
  return (
    <div className="settings-row agent-row" data-off>
      <span className="agent-row-icon" aria-hidden="true"><AgentIcon agent={kind} /></span>
      <div className="settings-row-text">
        <div className="agent-row-head">
          <span className="settings-row-label">{agentLabel(kind)}</span>
          <span className="agent-row-pill">{environment.missing?.status ?? (appFound ? t('InstalledAgentsSettings.cliNotFound') : t('AgentPicker.notInstalled'))}</span>
        </div>
        <p className="settings-row-description">{environment.missing?.hint ?? (appFound ? t('InstalledAgentsSettings.appDetectedInstallItsCliToUseIt', { value1: agentLabel(kind) }) : environment.role)}</p>
        {!installation && <Fix label={t('InstalledAgentsSettings.install')} command={environment.install} />}
        {installation && (
          <div className="agent-install-actions">
            <button type="button" className="button" disabled={opening} onClick={() => void install()}>
              {opening ? t('InstalledAgentsSettings.openingTerminal') : running ? t('InstalledAgentsSettings.viewInstallationProgress') : failed ? t('InstalledAgentsSettings.retryInstallation') : t('InstalledAgentsSettings.installInTerminal')}
            </button>
            {terminal?.exited && <button type="button" className="button ghost" onClick={() => showTerminal(terminal.id)}>{t('InstalledAgentsSettings.viewInstallationOutput')}</button>}
            {terminal?.exited && <span className="settings-row-description">{failed ? t('InstalledAgentsSettings.installationFailedExitCodeReviewOutputAndRetry', { value1: terminal.exitCode ?? t('InstalledAgentsSettings.unknown') }) : t('InstalledAgentsSettings.installationCommandFinishedIfCliIsStillMissing')}</span>}
          </div>
        )}
        {installation && (
          <details className="agent-cli-details">
            <summary>{t('InstalledAgentsSettings.details')}</summary>
            <Fix label={t('agentCli.orRunInTerminal')} command={installation.command} />
          </details>
        )}
      </div>
    </div>
  )
}

function DetectedAgentRow({ agent }: { agent: DetectedAgent }) {
  const cli = agent.cliCheck
  let cliLabel = t('InstalledAgentsSettings.appFoundAgentCommandNotFound')
  if (cli?.status === 'responded') cliLabel = t('InstalledAgentsSettings.commandResponded', { value1: cli.version ? ` · ${cli.version}` : t('InstalledAgentsSettings.versionNotRecognized') })
  else if (cli?.reason === 'windows-shim') cliLabel = t('InstalledAgentsSettings.commandFoundCannotVerifyVersionThroughWindowsCommand')
  else if (cli?.reason === 'probe-failed') cliLabel = t('InstalledAgentsSettings.commandFoundVersionCheckFailedMayNotStart')
  else if (agent.locations.some((location) => location.source === 'cli')) cliLabel = t('InstalledAgentsSettings.commandFoundVersionNotVerified')
  return (
    <div className="settings-row agent-row">
      <span className="agent-row-icon" aria-hidden="true"><AgentIcon agent={null} /></span>
      <div className="settings-row-text">
        <div className="agent-row-head">
          <span className="settings-row-label">{agent.name}</span>
          <span className="agent-row-pill">{t('InstalledAgentsSettings.notSupportedYet')}</span>
        </div>
        <p className="settings-row-description">{cliLabel}</p>
        {agent.locations.map(({ source, path }) => (
          <p key={`${source}:${path}`} className="settings-row-description mono agent-row-where" title={path}>
            {source === 'cli' ? t('chatTools.command') : t('InstalledAgentsSettings.app')} · {path}
          </p>
        ))}
      </div>
    </div>
  )
}

// collapsible: the user can close it. It starts open, so what can be installed is in view.
function Group({ title, count, collapsible = false, children }: { title: string; count: number; collapsible?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  if (count === 0) return null
  if (collapsible) return (
    <details className="agent-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="agent-group-head">
        <span className="agent-group-title">{title}</span>
        <span className="agent-list-count">{count}</span>
      </summary>
      {children}
    </details>
  )
  return (
    <div className="agent-group">
      <div className="agent-group-head">
        <span className="agent-group-title">{title}</span>
        <span className="agent-list-count">{count}</span>
      </div>
      {children}
    </div>
  )
}

// Every agent in one place, as core found them: the ones Antumi runs, each on until turned off (off,
// it is not offered for new tasks and conversations; what already runs on it carries on); the
// ones it runs that are not installed, with how to install them; and others it found but cannot
// run yet. Git, which is not an agent, is under 关于.
export function InstalledAgentsSettings() {
  const environment = useCore((s) => s.environment)
  const installationSupported = useCore((s) => s.rpc?.features.includes('agent-cli-installation') ?? false)
  const maintenanceSupported = useCore((s) => s.rpc?.features.includes('agent-cli-maintenance') ?? false)
  const cliStatuses = useCore((s) => s.agentCli)
  useEffect(() => { if (maintenanceSupported) void refreshAgentCli() }, [maintenanceSupported])
  const disabled = usePreferences((s) => s.disabledAgents)
  const [checking, setChecking] = useState(false)
  const checkOf = (kind: AgentKind) => environment?.checks.find((each) => each.tool === kind)
  const found = AGENT_KINDS.flatMap((kind) => {
    const check = checkOf(kind)
    return check && check.status !== 'missing' ? [{ kind, check }] : []
  })
  const missing = AGENT_KINDS.filter((kind) => checkOf(kind)?.status === 'missing')
  const other = environment?.detectedAgents?.filter((agent) => !AGENT_KINDS.some((kind) => kind === agent.id)) ?? []
  const enabledCount = found.filter(({ kind }) => !disabled.includes(kind)).length
  const recheck = async () => {
    setChecking(true)
    try {
      await Promise.all([refreshEnvironment(), ...(maintenanceSupported ? [refreshAgentCli(undefined, true)] : [])])
    } finally {
      setChecking(false)
    }
  }
  return (
    <div className="agent-list">
      <div className="agent-list-head">
        <span className="agent-list-title">{t('InstalledAgentsSettings.agentsOnThisComputer')}</span>
        <button type="button" className="button ghost agent-list-refresh" onClick={() => void recheck()} disabled={checking} title={t('InstalledAgentsSettings.scanAgainAfterInstallingOrSigningIn')}>
          <RefreshIcon />
          {checking ? t('InstalledAgentsSettings.scanning') : t('InstalledAgentsSettings.scanAgain')}
        </button>
      </div>
      {!environment && <p className="settings-row-description agent-list-note">{t('InstalledAgentsSettings.notScannedYet')}</p>}
      {maintenanceSupported && found.some(({ kind }) => cliBackendOutdated(cliStatuses[kind]?.error ?? null)) && (
        <div className="agent-cli-notice" role="status">
          <p className="settings-row-description">{t('agentCli.backendNotice')}</p>
          <details className="agent-cli-details">
            <summary>{t('InstalledAgentsSettings.details')}</summary>
            <p className="settings-row-description">{t('agentCli.backendNoticeDetails')}</p>
          </details>
        </div>
      )}
      <Group title={t('InstalledAgentsSettings.installed')} count={found.length}>
        {found.map(({ kind, check }) => (
          <AgentRow key={JSON.stringify([kind, check.path, check.version])} kind={kind} check={check} enabled={!disabled.includes(kind)} last={enabledCount <= 1} />
        ))}
      </Group>
      <Group title={t('InstalledAgentsSettings.availableToInstall')} count={missing.length} collapsible={found.length > 0}>
        {missing.map((kind) => <MissingAgentRow key={kind} kind={kind} installation={installationSupported ? environment?.cliInstallations?.find((each) => each.agent === kind) : undefined} />)}
      </Group>
      <Group title={t('InstalledAgentsSettings.notSupportedYet')} count={other.length}>
        <p className="settings-row-description agent-list-note">{t('InstalledAgentsSettings.foundOnThisComputerButCannotRunIn')}</p>
        {other.map((agent) => <DetectedAgentRow key={agent.id} agent={agent} />)}
      </Group>
      {environment && (
        <details className="environment-search-path">
          <summary>{tr('InstalledAgentsSettings.antumiSearchesTheseDirectoriesForCommands', { value1: environment.searchPath.length })}</summary>
          <p className="settings-row-description">{t('InstalledAgentsSettings.pathUsedByCoreAndAgentsPlusCommon')}</p>
          <ul className="mono">
            {environment.searchPath.map((dir) => (
              <li key={dir}>{dir}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
