import { probeProvider, useProviderProbes } from '../provider-probes'
import { getLocale, t } from '../i18n'
import { useLayoutEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  AGENT_KINDS, MODEL_PROVIDER_PRESETS, MODEL_PROVIDER_PRESET_IDS, providerUrlProblem, providerWireFor,
  type AgentKind, type ModelProvider, type ModelProviderInput, type ModelProviderPreset, type ModelProviderPresetId, type ModelProviderProbe, type ProviderModel, type ProviderWire
} from '@antumi/protocol'
import { perform, setSettingsOpen, useAccountsSupported, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { Segmented } from './SettingsControls'
import { PRESET_VENDOR } from '../provider-vendors'
import { SettingsEmptyState } from './SettingsEmptyState'
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, CloudIcon, PlusIcon } from './icons'

type Draft = {
  id: string | null
  name: string
  preset: ModelProviderPreset
  apiKey: string
  hasKey: boolean
  // One model id per line; known: what is known of each beyond its id (the preset's, or as saved).
  models: string
  known: readonly ProviderModel[]
  defaultModel: string
  smallModel: string
  agents: AgentKind[]
  anthropicUrl: string
  anthropicAuth: 'auth_token' | 'api_key'
  chatUrl: string
  responsesUrl: string
}

const presetName = (id: ModelProviderPresetId) => (getLocale() === 'en' ? MODEL_PROVIDER_PRESETS[id].translations.en.name : MODEL_PROVIDER_PRESETS[id].name)
const presetNotes = (id: ModelProviderPresetId) => MODEL_PROVIDER_PRESETS[id].notes.map((note) => (getLocale() === 'en' ? note.en : note.zh))

function draftOfPreset(preset: ModelProviderPreset): Draft {
  const blank = { id: null, apiKey: '', hasKey: false, anthropicUrl: '', anthropicAuth: 'auth_token' as const, chatUrl: '', responsesUrl: '' }
  if (preset === 'custom') return { ...blank, name: '', preset, models: '', known: [], defaultModel: '', smallModel: '', agents: [] }
  const entry = MODEL_PROVIDER_PRESETS[preset]
  return {
    ...blank, name: presetName(preset), preset, models: entry.models.map((model) => model.id).join('\n'), known: entry.models,
    defaultModel: entry.defaultModel, smallModel: entry.smallModel, agents: [...entry.agents]
  }
}

function draftOf(provider: ModelProvider): Draft {
  return {
    id: provider.id, name: provider.name, preset: provider.preset, apiKey: '', hasKey: provider.hasKey,
    models: provider.models.map((model) => model.id).join('\n'), known: provider.models,
    defaultModel: provider.defaultModel, smallModel: provider.smallModel, agents: [...provider.agents],
    anthropicUrl: provider.anthropic?.baseUrl ?? '', anthropicAuth: provider.anthropic?.auth ?? 'auth_token',
    chatUrl: provider.openai?.chatUrl ?? '', responsesUrl: provider.openai?.responsesUrl ?? ''
  }
}

// A preset's endpoints come from its table; a custom provider's from what was typed.
function endpointsOf(draft: Draft): Pick<ModelProvider, 'anthropic' | 'openai'> {
  if (draft.preset !== 'custom') return { anthropic: MODEL_PROVIDER_PRESETS[draft.preset].anthropic, openai: MODEL_PROVIDER_PRESETS[draft.preset].openai }
  const chatUrl = draft.chatUrl.trim() || null
  const responsesUrl = draft.responsesUrl.trim() || null
  return {
    anthropic: draft.anthropicUrl.trim() ? { baseUrl: draft.anthropicUrl.trim(), auth: draft.anthropicAuth, env: {} } : null,
    openai: chatUrl || responsesUrl ? { chatUrl, responsesUrl } : null
  }
}

function modelsOf(draft: Draft): ProviderModel[] {
  const ids = [...new Set(draft.models.split('\n').map((line) => line.trim()).filter(Boolean))]
  return ids.map((id) => draft.known.find((model) => model.id === id) ?? { id, label: null, contextWindow: null, maxOutput: null, efforts: [] })
}

function inputOf(draft: Draft): ModelProviderInput {
  const endpoints = endpointsOf(draft)
  return {
    id: draft.id, name: draft.name.trim(), preset: draft.preset, ...(draft.preset === 'custom' ? endpoints : {}),
    models: modelsOf(draft), defaultModel: draft.defaultModel, smallModel: draft.smallModel,
    agents: draft.agents.filter((agent) => providerWireFor(endpoints, agent)), apiKey: draft.apiKey.trim() || null
  }
}

function urlProblems(draft: Draft): string[] {
  if (draft.preset !== 'custom') return []
  return [draft.anthropicUrl, draft.chatUrl, draft.responsesUrl].map((url) => url.trim()).filter((url) => url && providerUrlProblem(url) !== null)
}

function PresetGrid({ value, onPick }: { value: ModelProviderPreset; onPick: (preset: ModelProviderPreset) => void }) {
  return (
    <div className="provider-presets" role="radiogroup" aria-label={t('ModelProviderSettings.plan')}>
      {[...MODEL_PROVIDER_PRESET_IDS, 'custom' as const].map((preset) => (
        <button key={preset} type="button" role="radio" aria-checked={preset === value} className="provider-preset" onClick={() => onPick(preset)}>
          <span className="provider-preset-name">
            <span className="provider-mark" data-vendor={preset === 'custom' ? 'custom' : PRESET_VENDOR[preset].vendor} aria-hidden="true">{preset === 'custom' ? '+' : PRESET_VENDOR[preset].mark}</span>
            {preset === 'custom' ? t('ModelProviderSettings.custom') : presetName(preset)}
            {preset !== 'custom' && <VerifiedBadge preset={preset} />}
          </span>
          <span className="provider-preset-host" title={preset === 'custom' ? undefined : presetHost(preset)}>{preset === 'custom' ? t('ModelProviderSettings.customHint') : presetHost(preset)}</span>
        </button>
      ))}
    </div>
  )
}

function presetHost(preset: ModelProviderPresetId): string {
  const { anthropic, openai } = MODEL_PROVIDER_PRESETS[preset]
  const url = anthropic?.baseUrl ?? openai?.chatUrl ?? openai?.responsesUrl ?? ''
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

function VerifiedBadge({ preset }: { preset: ModelProviderPresetId }) {
  const verified = MODEL_PROVIDER_PRESETS[preset].verified !== null
  return <span className="provider-badge" data-verified={verified}>{verified ? t('ModelProviderSettings.verified') : t('ModelProviderSettings.unverified')}</span>
}

function ProviderForm({ initial, onDone }: { initial: Draft; onDone: (saved: string | null) => void }) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const authId = useId()
  const keyHintId = useId()
  const form = useRef<HTMLFormElement>(null)
  useLayoutEffect(() => { form.current?.closest('.settings-content')?.scrollTo({ top: 0 }) }, [])
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))
  const endpoints = endpointsOf(draft)
  const models = modelsOf(draft)
  const ids = models.map((model) => model.id)
  const servable = AGENT_KINDS.filter((agent) => providerWireFor(endpoints, agent))
  const badUrls = urlProblems(draft)
  const presetId = draft.preset === 'custom' ? null : draft.preset
  const preset = presetId ? MODEL_PROVIDER_PRESETS[presetId] : null
  // Saved as the preset's own list, core keeps it following the preset (model-providers.ts).
  const followsPreset = preset !== null && ids.length === preset.models.length && preset.models.every((model, index) => ids[index] === model.id)
  const ready = draft.name.trim() && (draft.apiKey.trim() || draft.hasKey) && ids.includes(draft.defaultModel) && ids.includes(draft.smallModel)
    && draft.agents.some((agent) => servable.includes(agent)) && badUrls.length === 0 && (endpoints.anthropic || endpoints.openai)

  // Picking a preset starts its form over; the key typed so far stays.
  const pick = (next: ModelProviderPreset) => setDraft((current) => ({ ...draftOfPreset(next), apiKey: current.apiKey }))
  const setModels = (text: string) => {
    const next = [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))]
    set({ models: text, defaultModel: next.includes(draft.defaultModel) ? draft.defaultModel : next[0] ?? '', smallModel: next.includes(draft.smallModel) ? draft.smallModel : next[0] ?? '' })
  }
  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready || saving) return
    setSaving(true)
    const saved = await perform((rpc) => rpc.call('modelProviders.save', inputOf(draft)))
    setSaving(false)
    if (saved) onDone(saved.id)
  }

  return (
    <form ref={form} className="chat-command-form provider-settings-form" onSubmit={(event) => void save(event)}>
      <div className="settings-section-toolbar provider-form-heading">
        <div><button type="button" className="link-button" onClick={() => onDone(null)}><ArrowLeftIcon />{t('SettingsPage.backToProviders')}</button><h3>{draft.name || t('ModelProviderSettings.custom')}{presetId && <VerifiedBadge preset={presetId} />}</h3></div>
      </div>
      {draft.id === null && (
        <details className="settings-disclosure provider-plan-switcher">
          <summary>{t('ModelProviderSettings.plan')}<span>{draft.preset === 'custom' ? t('ModelProviderSettings.custom') : presetName(draft.preset)}</span><ChevronDownIcon /></summary>
          <PresetGrid value={draft.preset} onPick={pick} />
          <span className="chat-command-hint">{t('ModelProviderSettings.unverifiedHint')}</span>
        </details>
      )}
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.name')}</span>
        <input className="input" value={draft.name} onChange={(event) => set({ name: event.target.value })} maxLength={60} autoFocus={draft.id !== null} />
      </label>
      <label className="chat-command-field">
        <span>API Key</span>
        <input className="input mono" aria-label="API Key" aria-describedby={keyHintId} type="password" autoComplete="new-password" value={draft.apiKey} onChange={(event) => set({ apiKey: event.target.value })}
          placeholder={draft.hasKey ? t('McpSettingsSection.alreadySetLeaveEmptyToKeep') : ''} />
        <span id={keyHintId} className="chat-command-hint">
          {t('ModelProviderSettings.keyHint')}
          {preset && <> <a className="provider-link" href={preset.keyUrl} target="_blank" rel="noreferrer">{t('ModelProviderSettings.getKey')}</a></>}
        </span>
      </label>
      {presetId && <p className="settings-note">{presetNotes(presetId)[0]}</p>}
      {preset && <p className="provider-ready-summary">{t('SettingsPage.providerPresetHint', { model: draft.defaultModel, agents: draft.agents.filter((agent) => servable.includes(agent)).map(agentLabel).join('、') })}</p>}
      <details className="settings-disclosure provider-advanced" key={draft.preset} open={preset === null || undefined}>
        <summary>{preset ? t('SettingsPage.providerAdvanced') : t('SettingsPage.providerCustomSetup')}</summary>
        {preset && <p className="settings-note">{t('SettingsPage.providerPresetHint', { model: draft.defaultModel, agents: draft.agents.map(agentLabel).join('、') })}</p>}
      <label className="chat-command-field">
        <span>{t('ModelProviderSettings.models')}</span>
        <textarea className="input mono mcp-args" rows={4} value={draft.models} onChange={(event) => setModels(event.target.value)} spellCheck={false} placeholder="glm-5.3" />
        <span className="chat-command-hint">
          {t('ModelProviderSettings.modelsHint')}
          {preset && (followsPreset
            ? <> {t('ModelProviderSettings.modelsFollowPreset')}</>
            : <button type="button" className="link-button" onClick={() => setModels(preset.models.map((model) => model.id).join('\n'))}>{t('ModelProviderSettings.restorePresetModels')}</button>)}
        </span>
      </label>
      <div className="provider-model-pickers">
        <label className="chat-command-field">
          <span>{t('ModelProviderSettings.defaultModel')}</span>
          <select className="input mono" value={draft.defaultModel} onChange={(event) => set({ defaultModel: event.target.value })}>
            {ids.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="chat-command-field">
          <span>{t('ModelProviderSettings.smallModel')}</span>
          <select className="input mono" value={draft.smallModel} onChange={(event) => set({ smallModel: event.target.value })}>
            {ids.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <span className="chat-command-hint">{t('ModelProviderSettings.smallModelHint')}</span>
        </label>
      </div>
      <div className="chat-command-field">
        <span>{t('ModelProviderSettings.agents')}</span>
        <span className="mcp-agents">
          {AGENT_KINDS.map((agent) => (
            <label key={agent} className="mcp-agent">
              <input type="checkbox" disabled={!servable.includes(agent)} checked={draft.agents.includes(agent) && servable.includes(agent)}
                onChange={(event) => set({ agents: event.target.checked ? [...draft.agents, agent] : draft.agents.filter((each) => each !== agent) })} />
              {agentLabel(agent)}
            </label>
          ))}
        </span>
        {servable.length < AGENT_KINDS.length && (
          <span className="chat-command-hint">{t('ModelProviderSettings.agentsUnservable', { value1: AGENT_KINDS.filter((agent) => !servable.includes(agent)).map(agentLabel).join('、') })}</span>
        )}
      </div>
      {preset ? (
        <div className="chat-command-field">
          <span>{t('ModelProviderSettings.addresses')}</span>
          <ul className="provider-endpoints mono">
            {preset.anthropic && <li>{preset.anthropic.baseUrl}<span className="muted"> · Anthropic</span></li>}
            {preset.openai?.responsesUrl && <li>{preset.openai.responsesUrl}<span className="muted"> · Responses</span></li>}
            {preset.openai?.chatUrl && <li>{preset.openai.chatUrl}<span className="muted"> · Chat Completions</span></li>}
          </ul>
          {presetId && presetNotes(presetId).map((note) => <span key={note} className="chat-command-hint">{note}</span>)}
        </div>
      ) : (
        <>
          <label className="chat-command-field">
            <span>{t('ModelProviderSettings.anthropicUrl')}</span>
            <input className="input mono" value={draft.anthropicUrl} onChange={(event) => set({ anthropicUrl: event.target.value })} placeholder="https://api.example.com/anthropic" spellCheck={false} />
            <span className="chat-command-hint">{t('ModelProviderSettings.anthropicUrlHint')}</span>
          </label>
          {draft.anthropicUrl.trim() && (
            <div className="chat-command-field">
              <span id={authId}>{t('ModelProviderSettings.keyHeader')}</span>
              <Segmented labelId={authId} value={draft.anthropicAuth} options={[{ value: 'auth_token', label: 'Authorization: Bearer' }, { value: 'api_key', label: 'x-api-key' }]} onChange={(anthropicAuth) => set({ anthropicAuth })} />
            </div>
          )}
          <label className="chat-command-field">
            <span>{t('ModelProviderSettings.responsesUrl')}</span>
            <input className="input mono" value={draft.responsesUrl} onChange={(event) => set({ responsesUrl: event.target.value })} placeholder="https://api.example.com/v1" spellCheck={false} />
          </label>
          <label className="chat-command-field">
            <span>{t('ModelProviderSettings.chatUrl')}</span>
            <input className="input mono" value={draft.chatUrl} onChange={(event) => set({ chatUrl: event.target.value })} placeholder="https://api.example.com/v1" spellCheck={false} />
            <span className="chat-command-hint">{badUrls.length ? t('ModelProviderSettings.badUrl') : t('ModelProviderSettings.openaiUrlHint')}</span>
          </label>
        </>
      )}
      </details>
      <div className="chat-command-actions">
        <button type="button" className="button ghost" onClick={() => onDone(null)}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={!ready || saving}>{saving ? t('McpSettingsSection.saving') : t('McpSettingsSection.saveAndTest')}</button>
      </div>
    </form>
  )
}

const WIRE_LABELS: Record<ProviderWire, string> = { anthropic: 'Anthropic', 'openai-responses': 'Responses', 'openai-chat': 'Chat Completions' }

function ProbeResult({ probe }: { probe: ModelProviderProbe | 'running' }) {
  if (probe === 'running') return <p className="settings-status" role="status">{t('ModelProviderSettings.testing')}</p>
  return (
    <ul className="provider-checks" role="status">
      {probe.checks.map((check) => (
        <li key={`${check.wire}/${check.model}`} className="provider-check" data-ok={check.ok}>
          <span>{check.ok ? '✓' : '✗'} {WIRE_LABELS[check.wire]} · <span className="mono">{check.model}</span></span>
          <span className="muted">
            {check.ok ? ` · ${check.latencyMs ?? 0} ms` : ` · ${check.status ?? t('ModelProviderSettings.noResponse')}${check.message ? ` · ${check.message}` : ''}`}
          </span>
        </li>
      ))}
      {!probe.ok && <li className="settings-note">{t('ModelProviderSettings.probeFailedHint')}</li>}
    </ul>
  )
}

function ProviderRow({ provider, probe, onProbe, onEdit }: { provider: ModelProvider; probe: ModelProviderProbe | 'running' | undefined; onProbe: () => void; onEdit: () => void }) {
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const preset = provider.preset === 'custom' ? null : provider.preset
  const remove = async () => {
    setBusy(true)
    try { await perform((rpc) => rpc.call('modelProviders.remove', { id: provider.id })) } finally { setBusy(false) }
  }
  return (
    <article className="provider-entry">
      <div className="settings-row">
        <div className="settings-row-text">
          <div className="agent-row-head"><span className="provider-mark" data-vendor={preset ? PRESET_VENDOR[preset].vendor : 'custom'} aria-hidden="true">{preset ? PRESET_VENDOR[preset].mark : '+'}</span><span className="settings-row-label">{provider.name}</span><span className="settings-state-pill" data-state={!provider.hasKey ? 'warning' : probe === 'running' ? 'pending' : probe ? (probe.ok ? 'ok' : 'error') : 'pending'}>{!provider.hasKey ? t('ModelProviderSettings.noKey') : probe === 'running' ? t('ModelProviderSettings.testing') : probe ? (probe.ok ? t('SettingsPage.providerTested') : t('SettingsPage.providerTestFailed')) : t('SettingsPage.providerUntested')}</span></div>
          <p className="settings-row-description">
            {t('ModelProviderSettings.summary', { value1: provider.agents.map(agentLabel).join('、'), value2: provider.defaultModel })}
            {!provider.hasKey && <span className="warning"> · {t('ModelProviderSettings.noKey')}</span>}
          </p>
          {preset && (
            <p className="settings-row-description">
              {presetNotes(preset)[0]}
              {' '}<a className="provider-link" href={MODEL_PROVIDER_PRESETS[preset].consoleUrl} target="_blank" rel="noreferrer">{t('ModelProviderSettings.console')}</a>
            </p>
          )}
        </div>
      </div>
      {probe && <ProbeResult probe={probe} />}
      <div className="plugin-actions">
        <button type="button" className="button" disabled={busy || probe === 'running' || !provider.hasKey} onClick={onProbe}>{t('McpSettingsSection.testConnection')}</button>
        <button type="button" className="button" disabled={busy} onClick={onEdit}>{t('chatTools.edit')}</button>
        {removing ? (
          <>
            <span className="settings-note">{t('ModelProviderSettings.removeWarning')}</span>
            <button type="button" className="button" disabled={busy} onClick={() => void remove()}>{t('McpSettingsSection.confirmDeletion')}</button>
            <button type="button" className="button ghost" onClick={() => setRemoving(false)}>{t('ChatCommandSettings.cancel')}</button>
          </>
        ) : <button type="button" className="button ghost" disabled={busy} onClick={() => setRemoving(true)}>{t('ChatCommandSettings.delete')}</button>}
      </div>
    </article>
  )
}

// Third-party coding plans an agent can be started on in place of its own account. Nothing goes into
// the agents' own configuration; the key stays in Antumi's credentials.
export function ModelProviderSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const providers = useCore((s) => s.modelProviders)
  const [draft, setDraft] = useState<Draft | null>(null)
  const accountsSupported = useAccountsSupported()
  const probes = useProviderProbes((state) => state.probes)

  if (!connected) return <SettingsEmptyState icon={<CloudIcon />} title={t('SettingsPage.providersDisconnected')}>{t('ChatCommandSettings.connectToAntumiCoreToView')}</SettingsEmptyState>
  if (draft) return <ProviderForm key={draft.id ?? 'new'} initial={draft} onDone={(saved) => { setDraft(null); if (saved) void probeProvider(saved) }} />
  return (
    <div className="provider-settings">
      {providers.length === 0 ? <>
        <SettingsEmptyState icon={<CloudIcon />} title={t('SettingsPage.providerGetStarted')} actions={<button type="button" className="button" onClick={() => setDraft(draftOfPreset('custom'))}><PlusIcon />{t('SettingsPage.providerCustomAdd')}</button>}>
          {t('SettingsPage.providerEmptyHint')}
        </SettingsEmptyState>
        <div className="provider-start-list" aria-label={t('SettingsPage.providerChoosePlan')}>
          <h3>{t('SettingsPage.providerChoosePlan')}</h3>
          {MODEL_PROVIDER_PRESET_IDS.map((preset) => <button type="button" key={preset} className="provider-start-row" onClick={() => setDraft(draftOfPreset(preset))}>
            <span className="provider-mark" data-vendor={PRESET_VENDOR[preset].vendor} aria-hidden="true">{PRESET_VENDOR[preset].mark}</span>
            <span><strong>{presetName(preset)}</strong><span className="settings-quota-note">{MODEL_PROVIDER_PRESETS[preset].agents.map(agentLabel).join(' · ')}</span></span>
            <VerifiedBadge preset={preset} /><ChevronRightIcon />
          </button>)}
          <p className="settings-note">{t('ModelProviderSettings.unverifiedHint')}</p>
        </div>
        <div className="provider-account-alternative"><h3>{t('SettingsPage.providerAccountAlternative')}</h3><p>{t('SettingsPage.providerAccountHint')}</p>{accountsSupported && <button type="button" className="link-button" onClick={() => setSettingsOpen(true, 'accounts')}>{t('AgentAccounts.manage')}<ChevronRightIcon /></button>}</div>
      </> : <>
        <div className="settings-section-toolbar"><p>{t('ModelProviderSettings.intro')}</p><button type="button" className="button primary" onClick={() => setDraft(draftOfPreset(MODEL_PROVIDER_PRESET_IDS[0]))}><PlusIcon />{t('ModelProviderSettings.add')}</button></div>
        {providers.map((provider) => <ProviderRow key={provider.id} provider={provider} probe={probes[provider.id]?.revision === provider.revision ? probes[provider.id]?.result : undefined} onProbe={() => void probeProvider(provider.id)} onEdit={() => setDraft(draftOf(provider))} />)}
      </>}
    </div>
  )
}
