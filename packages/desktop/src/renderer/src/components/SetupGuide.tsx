import { useState } from 'react'
import { AGENT_KINDS, agentDescriptor, agentReadiness, agentSetupIdentity, isAgentKind } from '@antumi/protocol'
import { agentReadinessText } from '../agent-readiness-text'
import { refreshEnvironment, setSettingsOpen, useCore } from '../core-store'
import { getLocale, t, useLocale } from '../i18n'
import { agentLabel, sourceProblemText } from '../labels'
import { setPreference, usePreferences } from '../preferences'
import { useProviderProbes } from '../provider-probes'
import { useReducedMotion } from '../reduced-motion'
import { updateSetup } from '../setup-controller'
import { configuredSources, preferredSetupAgent, setupResumable, setupStep } from '../setup-progress'
import { useExternalSessionsWhen } from '../external-sessions'
import { ChatPicker } from './ChatPicker'
import { PetSpeech } from './PetSpeech'
import { ResumableSessionList } from './ResumableSessions'
import { usePetSkin } from './PetSprite'
import { settingsSectionOf } from './SourceInboxView'
import { AgentIcon } from './icons'
import './setup-guide.css'

export function SetupGuide() {
  useLocale((state) => state.locale)
  const progress = usePreferences((state) => state.setup)
  const disabled = usePreferences((state) => state.disabledAgents)
  const petLevel = usePreferences((state) => state.petLevel)
  const petStyle = usePreferences((state) => state.petStyle)
  const environment = useCore((state) => state.environment)
  const providers = useCore((state) => state.modelProviders)
  const sources = useCore((state) => state.sources)
  const inboxes = useCore((state) => state.inboxes)
  const connected = useCore((state) => state.connection === 'connected')
  const loginOpen = useCore((state) => state.login !== null)
  const taskLaunchId = useCore((state) => state.taskLaunchId)
  const newTaskOpen = useCore((state) => state.newTaskOpen)
  const settingsOpen = useCore((state) => state.settingsOpen)
  const readingGuide = useCore((state) => state.guideOpen && state.overviewOpen && !state.settingsOpen)
  const features = useCore((state) => state.rpc?.features)
  const probes = useProviderProbes((state) => state.probes)
  const reduced = useReducedMotion()
  const skin = usePetSkin(petStyle, 80, petLevel === 'off' || progress.status !== 'active' || readingGuide)
  const [refreshing, setRefreshing] = useState(false)
  const [sourceId, setSourceId] = useState<string | null>(null)
  // Looked for from the start, so it is there by the time the agent is.
  const sessions = useExternalSessionsWhen(progress.status === 'active')

  if (progress.status !== 'active' || readingGuide) return null
  const situation = { environment, disabled, providers, sources, probes, sessions }
  const agent = progress.agent ?? preferredSetupAgent(situation)
  const readiness = agent ? agentReadiness(agent, environment, disabled, providers, probes) : null
  const step = connected ? setupStep(progress, situation) : 'waiting'
  const descriptor = agent ? agentDescriptor(agent, getLocale()) : null
  const canProvide = Boolean(descriptor?.capabilities.modelProviders.length && features?.includes('model-providers'))
  const configured = configuredSources(sources ?? [])
  const resumable = setupResumable(situation)
  const source = sources?.find((entry) => entry.provider === sourceId) ?? sources?.[0]
  const pause = () => updateSetup({ status: 'paused' })
  const goAgents = () => setSettingsOpen(true, 'agents')
  const goProviders = () => setSettingsOpen(true, 'model-providers')
  const canConfigureSource = Boolean(source || features?.includes('plugins'))
  const goSources = () => { if (canConfigureSource) setSettingsOpen(true, source ? settingsSectionOf(source.provider) : 'plugins') }
  const providerFirst = canProvide && (readiness?.state === 'needs-provider' || readiness?.state === 'provider-failed' || (readiness?.state === 'unknown-auth' && descriptor?.setup === 'provider'))
  const openAgentFix = providerFirst ? goProviders : goAgents
  const primaryClass = settingsOpen ? 'button' : 'button primary'
  const confirm = () => { if (agent) updateSetup({ confirmed: agentSetupIdentity(agent, environment) }) }
  const refresh = async () => {
    setRefreshing(true)
    try { await refreshEnvironment() } finally { setRefreshing(false) }
  }
  const provider = readiness?.state === 'ready' && readiness.via === 'provider' ? readiness.provider : null
  const probe = provider && probes[provider.id]?.revision === provider.revision ? probes[provider.id]?.result : null
  const problem = Object.values(inboxes).find((inbox) => inbox.problem && configured.some((entry) => entry.provider === inbox.provider))?.problem
  const text = step === 'waiting' ? t(connected ? 'SetupGuide.waiting' : 'SetupGuide.disconnected')
    : step === 'agent' ? readiness ? agentReadinessText(readiness, agent ?? undefined) : t('SetupGuide.noSupportedAgent')
    : step === 'sessions' ? t('ResumableSessions.title')
    : step === 'sources' ? t('SetupGuide.sourceQuestion')
    : t('SetupGuide.done')

  return (
    <aside className="setup-guide" aria-label={t('SetupGuide.title')} data-pet-avoid data-blocked={loginOpen || newTaskOpen || taskLaunchId !== null || undefined}>
      <div className="setup-guide-inner">
        {petLevel !== 'off' && <div className="setup-guide-pet" aria-hidden="true">{skin.render({ pose: step === 'done' ? 'review' : 'idle', walking: false, lookX: 0, lookY: 0, reduced })}</div>}
        <div className="setup-guide-speech">
          <PetSpeech text={<span className="setup-guide-heading">
              {step === 'agent' && agent && <ChatPicker
                label={t('SetupGuide.chooseAgent')} value={agent} placeholder={t('SetupGuide.chooseAgent')} placement="above"
                options={AGENT_KINDS.filter((kind) => environment?.checks.some((entry) => entry.tool === kind)).map((kind) => ({ value: kind, label: agentLabel(kind), icon: <AgentIcon agent={kind} />, description: agentReadinessText(agentReadiness(kind, environment, disabled, providers, probes), kind) }))}
                onChange={(value) => { if (isAgentKind(value)) updateSetup({ agent: value, confirmed: null }) }}
              />}
              <span role="status">{text}</span>
            </span>} dismiss={pause}>
            <div className="setup-guide-details">
              {step === 'agent' && descriptor && <p>{readiness?.state === 'missing' || readiness?.state === 'cli-missing' ? descriptor.environment.missing?.hint ?? descriptor.environment.install
                : readiness?.state === 'incompatible-version' ? descriptor.environment.outdated?.status
                : readiness?.state === 'needs-account' || readiness?.state === 'needs-provider' || readiness?.state === 'unknown-auth' || readiness?.state === 'authorize-on-use' ? descriptor.environment.signIn : null}</p>}
              {step !== 'agent' && step !== 'waiting' && step !== 'sessions' && readiness?.state === 'unknown-auth' && <p>{t('SetupGuide.confirmed')}</p>}
              {step === 'agent' && readiness?.state === 'provider-failed' && readiness.message && <p>{readiness.message}</p>}
              {step !== 'agent' && step !== 'waiting' && step !== 'sessions' && readiness?.state === 'authorize-on-use' && <p>{t('SetupGuide.deferredAuth')}</p>}
              {step !== 'waiting' && step !== 'sessions' && provider && <p>{t('SetupGuide.providerConfigured', { name: provider.name })} {t(probe === 'running' ? 'SetupGuide.providerTesting' : probe ? probe.ok ? 'SetupGuide.providerPassed' : 'SetupGuide.providerFailed' : 'SetupGuide.providerUntested')}</p>}
              {step === 'sessions' && <p>{sessions === null ? t('SetupGuide.findingSessions') : t('SetupGuide.sessionsFound', { count: resumable.count })}</p>}
              {step === 'sessions' && resumable.shown.length > 0 && <ResumableSessionList sessions={resumable.shown} onResumed={() => updateSetup({ sessionChoice: 'resumed' })} />}
              {step === 'sources' && progress.sourceChoice === 'configure' && <>
                <p>{t('SetupGuide.sourceConfiguration')}</p>
                {(sources?.length ?? 0) > 0 && <ChatPicker label={t('SetupGuide.selectSource')} value={source?.provider ?? null} placeholder={t('SetupGuide.selectSource')}
                  options={(sources ?? []).map((entry) => ({ value: entry.provider, label: entry.name }))} onChange={setSourceId} size="large" placement="above" />}
              </>}
              {step === 'done' && <p>{configured.length > 0 ? t('SetupGuide.sourceConfigured', { names: configured.map((entry) => entry.name).join('、') }) : t('SetupGuide.sourceSkipped')}</p>}
              {step === 'done' && problem && <p>{t('SetupGuide.sourceProblem', { reason: sourceProblemText(problem) })}</p>}
            </div>
            <div className="setup-guide-actions">
              {step === 'agent' && readiness?.state === 'disabled' && agent && <button type="button" className={primaryClass} onClick={() => setPreference('disabledAgents', disabled.filter((entry) => entry !== agent))}>{t('SetupGuide.enable')}</button>}
              {step === 'agent' && readiness?.state !== 'disabled' && <button type="button" className={primaryClass} onClick={openAgentFix}>{t(providerFirst ? 'SetupGuide.providers' : 'SetupGuide.agents')}</button>}
              {step === 'agent' && canProvide && descriptor?.setup !== 'provider' && (readiness?.state === 'needs-account' || readiness?.state === 'unknown-auth') && <button type="button" className="button" onClick={goProviders}>{t('SetupGuide.providers')}</button>}
              {step === 'agent' && (readiness?.state === 'unknown-auth' || readiness?.state === 'authorize-on-use') && <button type="button" className="button" onClick={confirm}>{t(readiness.state === 'authorize-on-use' ? 'SetupGuide.deferAuth' : 'SetupGuide.confirm')}</button>}
              {step === 'agent' && <button type="button" className="button ghost" disabled={refreshing || !connected} onClick={() => void refresh()}>{t(refreshing ? 'SetupGuide.checking' : 'SetupGuide.refresh')}</button>}
              {step === 'sessions' && resumable.count > 0 && <button type="button" className="button ghost" onClick={() => setSettingsOpen(true, 'session-import')}>{t('ResumableSessions.viewAll')}</button>}
              {step === 'sessions' && <button type="button" className="button ghost" onClick={() => updateSetup({ sessionChoice: 'skip' })}>{t('SetupGuide.skipSessions')}</button>}
              {step === 'sources' && progress.sourceChoice === 'pending' && canConfigureSource && <button type="button" className={primaryClass} onClick={() => { updateSetup({ sourceChoice: 'configure' }); goSources() }}>{t('SetupGuide.configureSources')}</button>}
              {step === 'sources' && progress.sourceChoice === 'configure' && canConfigureSource && <button type="button" className={primaryClass} onClick={goSources}>{t(source ? 'SetupGuide.configureSources' : 'SetupGuide.installSources')}</button>}
              {step === 'sources' && progress.sourceChoice === 'configure' && source && features?.includes('plugins') && <button type="button" className="button" onClick={() => setSettingsOpen(true, 'plugins')}>{t('SetupGuide.installSources')}</button>}
              {step === 'sources' && <button type="button" className="button ghost" onClick={() => updateSetup({ sourceChoice: 'skip' })}>{t('SetupGuide.skipSources')}</button>}
              {step === 'done' && <button type="button" className={primaryClass} onClick={() => updateSetup({ status: 'complete' })}>{t('SetupGuide.finish')}</button>}
              {step !== 'waiting' && step !== 'sessions' && provider && <button type="button" className="button ghost" onClick={goProviders}>{t('SetupGuide.providers')}</button>}
              <button type="button" className="button ghost" onClick={pause} title={t('SetupGuide.resumeHint')}>{t('SetupGuide.pause')}</button>
            </div>
          </PetSpeech>
        </div>
      </div>
    </aside>
  )
}
