import { probeProvider, useProviderProbes } from '../provider-probes'
import { getLocale, t } from '../i18n'
import { useLayoutEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  AGENT_KINDS, MODEL_PROVIDER_PRESETS, MODEL_PROVIDER_PRESET_IDS, agentDescriptor, providerUrlProblem, providerWireFor, sameModels,
  type AgentKind, type ModelProvider, type ModelProviderInput, type ModelProviderModels, type ProviderSmallJobs, type ModelProviderPreset, type ModelProviderPresetId, type ModelProviderProbe, type ProviderModel, type ProviderWire
} from '@antumi/protocol'
import { perform, setSettingsOpen, useAccountsSupported, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { formatTokens, parseTokens, pickedIds, withListed } from '../provider-model-limits'
import { formatProviderHeaders, parseProviderHeaders } from '../provider-headers'
import { Segmented } from './SettingsControls'
import { PRESET_VENDOR } from '../provider-vendors'
import { SettingsEmptyState } from './SettingsEmptyState'
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, CloudIcon, PlusIcon } from './icons'

type Draft = {
  id: string | null
  name: string
  preset: ModelProviderPreset
  // The local gateway a custom provider was started from, its addresses filled in; null when none.
  template: ProviderTemplate | null
  apiKey: string
  hasKey: boolean
  // One model id per line; known: what is known of each beyond its id (the preset's, or as saved).
  models: string
  known: readonly ProviderModel[]
  // A model's context and output as typed, where edited; the rest read as known.
  limits: Readonly<Record<string, Limits>>
  // Extra request headers, one `Name: value` a line, and where small jobs go.
  headers: string
  smallJobs: ProviderSmallJobs
  defaultModel: string
  smallModel: string
  agents: AgentKind[]
  anthropicUrl: string
  anthropicAuth: 'auth_token' | 'api_key'
  chatUrl: string
  responsesUrl: string
}

// A custom provider for a gateway on this machine, addresses at its default port: not a preset, whose
// addresses are fixed, as the user may have moved the port.
const PROVIDER_TEMPLATES = ['cliproxyapi'] as const
type ProviderTemplate = (typeof PROVIDER_TEMPLATES)[number]
type Choice = ModelProviderPreset | ProviderTemplate
const CLIPROXYAPI_URL = 'http://127.0.0.1:8317'

type Limits = { context: string; output: string }
type LimitField = keyof Limits

// The most models a provider holds (ModelProvider.models).
const MODEL_LIMIT = 100

const presetName = (id: ModelProviderPresetId) => (getLocale() === 'en' ? MODEL_PROVIDER_PRESETS[id].translations.en.name : MODEL_PROVIDER_PRESETS[id].name)
const presetNotes = (id: ModelProviderPresetId) => MODEL_PROVIDER_PRESETS[id].notes.map((note) => (getLocale() === 'en' ? note.en : note.zh))

function draftOfPreset(preset: ModelProviderPreset): Draft {
  const blank = { id: null, template: null, apiKey: '', hasKey: false, anthropicUrl: '', anthropicAuth: 'auth_token' as const, chatUrl: '', responsesUrl: '', limits: {}, headers: '', smallJobs: 'provider' as const }
  if (preset === 'custom') return { ...blank, name: '', preset, models: '', known: [], defaultModel: '', smallModel: '', agents: [] }
  const entry = MODEL_PROVIDER_PRESETS[preset]
  return {
    ...blank, name: presetName(preset), preset, models: entry.models.map((model) => model.id).join('\n'), known: entry.models,
    defaultModel: entry.defaultModel, smallModel: entry.smallModel, agents: [...entry.agents]
  }
}

// CLIProxyAPI serves all three wires under one port and takes its key in either header; the models
// are whatever accounts it holds, so they come from its list.
function draftOfTemplate(template: ProviderTemplate): Draft {
  const draft: Draft = {
    // Its accounts are subscriptions: nothing goes to them but what an agent sends itself.
    ...draftOfPreset('custom'), name: 'CLIProxyAPI', template, smallJobs: 'off',
    anthropicUrl: CLIPROXYAPI_URL, responsesUrl: `${CLIPROXYAPI_URL}/v1`, chatUrl: `${CLIPROXYAPI_URL}/v1`
  }
  const endpoints = endpointsOf(draft)
  return { ...draft, agents: (['claude', 'codex', 'opencode'] as const).filter((agent) => providerWireFor(endpoints, agent)) }
}

const draftOfChoice = (choice: Choice): Draft => (choice === 'cliproxyapi' ? draftOfTemplate(choice) : draftOfPreset(choice))

function draftOf(provider: ModelProvider): Draft {
  return {
    id: provider.id, template: null, name: provider.name, preset: provider.preset, apiKey: '', hasKey: provider.hasKey, limits: {}, headers: formatProviderHeaders(provider.headers ?? {}), smallJobs: provider.smallJobs ?? 'provider',
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

const idsOf = (text: string) => [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))]

// Each model whole, as known (its efforts and label too), with only its context and output as typed.
function modelsOf(draft: Draft): ProviderModel[] {
  return idsOf(draft.models).map((id) => {
    const known = draft.known.find((model) => model.id === id) ?? { id, label: null, contextWindow: null, maxOutput: null, efforts: [] }
    const typed = draft.limits[id]
    return typed ? { ...known, contextWindow: parseTokens(typed.context) ?? null, maxOutput: parseTokens(typed.output) ?? null } : known
  })
}

function limitText(draft: Draft, model: ProviderModel, field: LimitField): string {
  return draft.limits[model.id]?.[field] ?? formatTokens(field === 'context' ? model.contextWindow : model.maxOutput)
}

const limitsInvalid = (draft: Draft) => Object.entries(draft.limits).some(([id, typed]) => idsOf(draft.models).includes(id) && (parseTokens(typed.context) === undefined || parseTokens(typed.output) === undefined))

// The model list as typed, the default and small model kept where they still are in it.
function withModels(draft: Draft, text: string): Draft {
  const next = idsOf(text)
  return { ...draft, models: text, defaultModel: next.includes(draft.defaultModel) ? draft.defaultModel : next[0] ?? '', smallModel: next.includes(draft.smallModel) ? draft.smallModel : next[0] ?? '' }
}

// An older core keeps neither headers nor where small jobs go: they are sent only to one that does.
function inputOf(draft: Draft, extras: boolean): ModelProviderInput {
  const endpoints = endpointsOf(draft)
  return {
    ...(extras ? { headers: parseProviderHeaders(draft.headers).headers, smallJobs: draft.smallJobs } : {}),
    id: draft.id, name: draft.name.trim(), preset: draft.preset, ...(draft.preset === 'custom' ? endpoints : {}),
    models: modelsOf(draft), defaultModel: draft.defaultModel, smallModel: draft.smallModel,
    agents: draft.agents.filter((agent) => providerWireFor(endpoints, agent)), apiKey: draft.apiKey.trim() || null
  }
}

// Where a key would go: a kept key goes only where it was saved to go (model-providers.ts in core).
function addressesOf(draft: Draft): string {
  const { anthropic, openai } = endpointsOf(draft)
  return JSON.stringify([anthropic?.baseUrl ?? null, openai?.chatUrl ?? null, openai?.responsesUrl ?? null])
}

function urlProblems(draft: Draft): string[] {
  if (draft.preset !== 'custom') return []
  return [draft.anthropicUrl, draft.chatUrl, draft.responsesUrl].map((url) => url.trim()).filter((url) => url && providerUrlProblem(url) !== null)
}

function PresetGrid({ value, onPick }: { value: Choice; onPick: (choice: Choice) => void }) {
  return (
    <div className="provider-presets" role="radiogroup" aria-label={t('ModelProviderSettings.plan')}>
      {[...MODEL_PROVIDER_PRESET_IDS, ...PROVIDER_TEMPLATES, 'custom' as const].map((choice) => (
        <button key={choice} type="button" role="radio" aria-checked={choice === value} className="provider-preset" onClick={() => onPick(choice)}>
          <span className="provider-preset-name">
            <ChoiceMark choice={choice} />
            {choiceName(choice)}
            {choice !== 'custom' && choice !== 'cliproxyapi' && <VerifiedBadge preset={choice} />}
          </span>
          <span className="provider-preset-host" title={choice === 'custom' || choice === 'cliproxyapi' ? undefined : presetHost(choice)}>{choiceHint(choice)}</span>
        </button>
      ))}
    </div>
  )
}

function ChoiceMark({ choice }: { choice: Choice }) {
  if (choice === 'custom') return <span className="provider-mark" data-vendor="custom" aria-hidden="true">+</span>
  if (choice === 'cliproxyapi') return <span className="provider-mark" data-vendor="local" aria-hidden="true">C</span>
  return <span className="provider-mark" data-vendor={PRESET_VENDOR[choice].vendor} aria-hidden="true">{PRESET_VENDOR[choice].mark}</span>
}

const choiceName = (choice: Choice) => (choice === 'custom' ? t('ModelProviderSettings.custom') : choice === 'cliproxyapi' ? 'CLIProxyAPI' : presetName(choice))
const choiceHint = (choice: Choice) => (choice === 'custom' ? t('ModelProviderSettings.customHint') : choice === 'cliproxyapi' ? t('ModelProviderSettings.cliProxyHint') : presetHost(choice))

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

type Listing = { result: ModelProviderModels; picked: ReadonlySet<string>; filter: string }

// The models the endpoints listed, to pick from: those already in the list start picked.
function ModelListing({ listing, current, onChange, onTake }: { listing: Listing; current: readonly string[]; onChange: (next: Listing | null) => void; onTake: (taken: Listing) => void }) {
  const { result, picked, filter } = listing
  const shown = result.models.filter((model) => !filter.trim() || `${model.id} ${model.label ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()))
  const total = pickedIds(current, result.models.map((model) => model.id), picked).length
  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked)
    if (on) next.add(id)
    else next.delete(id)
    onChange({ ...listing, picked: next })
  }
  return (
    <div className="provider-model-listing">
      {result.models.length > 0 && <input className="input" value={filter} onChange={(event) => onChange({ ...listing, filter: event.target.value })} placeholder={t('ModelProviderSettings.listedSearch')} aria-label={t('ModelProviderSettings.listedSearch')} autoFocus />}
      {result.models.length > 0
        ? <ul className="provider-model-listed">
          {shown.map((model) => (
            <li key={model.id}><label>
              <input type="checkbox" checked={picked.has(model.id)} onChange={(event) => toggle(model.id, event.target.checked)} />
              <span className="mono">{model.id}</span>
              {(model.label || model.contextWindow !== null) && <span className="muted">{[model.label, model.contextWindow !== null ? t('ModelProviderSettings.listedContext', { value1: formatTokens(model.contextWindow) }) : null].filter(Boolean).join(' · ')}</span>}
            </label></li>
          ))}
        </ul>
        : <p className="settings-note">{t('ModelProviderSettings.listedEmpty')}</p>}
      {result.endpoints.some((endpoint) => !endpoint.ok) && (
        <ul className="provider-checks" role="status">
          {result.endpoints.map((endpoint) => (
            <li key={endpoint.wire} className="provider-check" data-ok={endpoint.ok}>
              <span>{endpoint.ok ? '✓' : '✗'} {WIRE_LABELS[endpoint.wire]}</span>
              <span className="muted">{endpoint.ok ? ` · ${t('ModelProviderSettings.listedCount', { value1: endpoint.count })}` : ` · ${endpoint.status ?? t('ModelProviderSettings.noResponse')}${endpoint.message ? ` · ${endpoint.message}` : ''}`}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="plugin-actions">
        {total > MODEL_LIMIT && <span className="settings-note warning">{t('ModelProviderSettings.tooManyModels', { value1: MODEL_LIMIT })}</span>}
        <button type="button" className="button ghost" onClick={() => onChange(null)}>{t('ChatCommandSettings.cancel')}</button>
        {result.models.length > 0 && <button type="button" className="button primary" disabled={total === 0 || total > MODEL_LIMIT} onClick={() => onTake(listing)}>{t('ModelProviderSettings.listedTake', { value1: total })}</button>}
      </div>
    </div>
  )
}

const SMALL_JOBS = ['provider', 'account', 'off'] as const satisfies readonly ProviderSmallJobs[]
const SMALL_JOB_LABELS = { provider: 'ModelProviderSettings.smallJobsProvider', account: 'ModelProviderSettings.smallJobsAccount', off: 'ModelProviderSettings.smallJobsOff' } as const satisfies Record<ProviderSmallJobs, string>

const ADDRESS_LABELS = { anthropic: 'ModelProviderSettings.anthropicUrl', 'openai-responses': 'ModelProviderSettings.responsesUrl', 'openai-chat': 'ModelProviderSettings.chatUrl' } as const satisfies Record<ProviderWire, string>

// Why an agent can't be ticked: for a custom provider, the address it would need (any of those its
// descriptor takes); an agent that takes no provider, or a preset's, which has the addresses it has.
function UnservableHint({ servable, custom }: { servable: readonly AgentKind[]; custom: boolean }) {
  const unservable = AGENT_KINDS.filter((agent) => !servable.includes(agent))
  const wiresOf = (agent: AgentKind) => agentDescriptor(agent).capabilities.modelProviders
  const needs = custom ? unservable.filter((agent) => wiresOf(agent).length > 0) : []
  const never = unservable.filter((agent) => !needs.includes(agent))
  if (unservable.length === 0) return null
  return (
    <span className="chat-command-hint">
      {needs.length > 0 && <>{t('ModelProviderSettings.agentsNeed', { value1: needs.map((agent) => t('ModelProviderSettings.agentAddress', { value1: agentLabel(agent), value2: wiresOf(agent).map((wire) => t(ADDRESS_LABELS[wire])).join(t('ModelProviderSettings.or')) })).join(t('ModelProviderSettings.listSeparator')) })} </>}
      {never.length > 0 && t('ModelProviderSettings.agentsUnservable', { value1: never.map(agentLabel).join('、') })}
    </span>
  )
}

function ProviderForm({ initial, onDone }: { initial: Draft; onDone: (saved: string | null) => void }) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [listing, setListing] = useState<Listing | 'running' | null>(null)
  const canList = useCore((s) => s.rpc?.features.includes('model-provider-models') ?? false)
  const canExtras = useCore((s) => s.rpc?.features.includes('model-provider-headers') ?? false)
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
  const followsPreset = preset !== null && sameModels(models, preset.models)
  // An older core keeps a preset's list by its ids alone, and would drop a context edited there.
  const editsLimits = draft.preset === 'custom' || canList
  const badLimits = limitsInvalid(draft)
  const hasEndpoint = Boolean(endpoints.anthropic || endpoints.openai)
  const moved = draft.id !== null && addressesOf(draft) !== addressesOf(initial)
  const { headers: typedHeaders, bad: badHeaders } = parseProviderHeaders(draft.headers)
  const keyReady = Boolean(draft.apiKey.trim() || (draft.hasKey && !moved))
  const ready = draft.name.trim() && keyReady && ids.includes(draft.defaultModel) && ids.includes(draft.smallModel)
    && draft.agents.some((agent) => servable.includes(agent)) && badUrls.length === 0 && hasEndpoint && !badLimits && ids.length <= MODEL_LIMIT && !(canExtras && badHeaders.length)
  const canFetch = canList && hasEndpoint && badUrls.length === 0 && keyReady && listing !== 'running'

  // Picking a preset starts its form over; the key typed so far stays.
  const pick = (next: Choice) => setDraft((current) => ({ ...draftOfChoice(next), apiKey: current.apiKey }))
  const setModels = (text: string) => setDraft((current) => withModels(current, text))
  const setLimit = (model: ProviderModel, field: LimitField, text: string) => setDraft((current) => ({
    ...current,
    limits: { ...current.limits, [model.id]: { context: limitText(current, model, 'context'), output: limitText(current, model, 'output'), [field]: text } }
  }))
  // The preset's models whole, their contexts too.
  const restorePreset = (entry: NonNullable<typeof preset>) => setDraft((current) => withModels({
    ...current, known: [...entry.models, ...current.known.filter((model) => !entry.models.some((each) => each.id === model.id))], limits: {}
  }, entry.models.map((model) => model.id).join('\n')))
  const fetchModels = async () => {
    setListing('running')
    const result = await perform((rpc) => rpc.call('modelProviders.fetchModels', { id: draft.id, preset: draft.preset, ...endpoints, apiKey: draft.apiKey.trim() || null, ...(canExtras ? { headers: typedHeaders } : {}) }))
    setListing(result ? { result, picked: new Set(result.models.filter((model) => ids.includes(model.id)).map((model) => model.id)), filter: '' } : null)
  }
  const takeListed = (taken: Listing) => {
    setDraft((current) => {
      const listed = taken.result.models
      const next = pickedIds(idsOf(current.models), listed.map((model) => model.id), taken.picked)
      // What the endpoint tells fills a context or output left empty, never one typed.
      const limits = Object.fromEntries(Object.entries(current.limits).map(([id, typed]) => {
        const found = listed.find((model) => model.id === id)
        return [id, found ? { context: typed.context.trim() ? typed.context : formatTokens(found.contextWindow), output: typed.output.trim() ? typed.output : formatTokens(found.maxOutput) } : typed]
      }))
      return withModels({ ...current, known: withListed(current.known, listed), limits }, next.join('\n'))
    })
    setListing(null)
  }
  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready || saving) return
    setSaving(true)
    const saved = await perform((rpc) => rpc.call('modelProviders.save', inputOf(draft, canExtras)))
    setSaving(false)
    if (saved) onDone(saved.id)
  }

  return (
    <form ref={form} className="chat-command-form provider-settings-form" onSubmit={(event) => void save(event)}>
      <div className="settings-section-toolbar provider-form-heading">
        <div><button type="button" className="link-button" onClick={() => onDone(null)}><ArrowLeftIcon />{t('SettingsPage.backToProviders')}</button><h3>{draft.name || t('ModelProviderSettings.custom')}{presetId && <VerifiedBadge preset={presetId} />}</h3></div>
      </div>
      {/* Both parts open at first: what a plan fills in is there to read before saving. */}
      {draft.id === null && (
        <details open className="settings-disclosure provider-plan-switcher">
          <summary>{t('ModelProviderSettings.plan')}<span>{choiceName(draft.template ?? draft.preset)}</span><ChevronDownIcon /></summary>
          <PresetGrid value={draft.template ?? draft.preset} onPick={pick} />
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
          placeholder={draft.hasKey && !moved ? t('McpSettingsSection.alreadySetLeaveEmptyToKeep') : ''} />
        <span id={keyHintId} className="chat-command-hint">
          {draft.hasKey && moved && !draft.apiKey.trim() && <span className="warning">{t('ModelProviderSettings.keyAgain')} </span>}
          {t('ModelProviderSettings.keyHint')}
          {preset && <> <a className="provider-link" href={preset.keyUrl} target="_blank" rel="noreferrer">{t('ModelProviderSettings.getKey')}</a></>}
        </span>
      </label>
      {presetId && <p className="settings-note">{presetNotes(presetId)[0]}</p>}
      {draft.template === 'cliproxyapi' && <p className="settings-note">{t('ModelProviderSettings.cliProxyNote')}</p>}
      {preset && <p className="provider-ready-summary">{t('SettingsPage.providerPresetHint', { model: draft.defaultModel, agents: draft.agents.filter((agent) => servable.includes(agent)).map(agentLabel).join('、') })}</p>}
      <details open className="settings-disclosure provider-advanced">
        <summary>{preset ? t('SettingsPage.providerAdvanced') : t('SettingsPage.providerCustomSetup')}</summary>
        {preset && <p className="settings-note">{t('SettingsPage.providerPresetHint', { model: draft.defaultModel, agents: draft.agents.map(agentLabel).join('、') })}</p>}
      <label className="chat-command-field">
        <span>{t('ModelProviderSettings.models')}</span>
        <textarea className="input mono mcp-args" rows={4} value={draft.models} onChange={(event) => setModels(event.target.value)} spellCheck={false} placeholder="glm-5.3" />
        <span className="chat-command-hint">
          {t('ModelProviderSettings.modelsHint')}
          {preset && (followsPreset
            ? <> {t('ModelProviderSettings.modelsFollowPreset')}</>
            : <button type="button" className="link-button" onClick={() => restorePreset(preset)}>{t('ModelProviderSettings.restorePresetModels')}</button>)}
          {ids.length > MODEL_LIMIT && <span className="warning"> {t('ModelProviderSettings.tooManyModels', { value1: MODEL_LIMIT })}</span>}
        </span>
      </label>
      {canList && (
        <div className="provider-model-fetch">
          <button type="button" className="button" disabled={!canFetch} onClick={() => void fetchModels()}>{listing === 'running' ? t('ModelProviderSettings.fetchingModels') : t('ModelProviderSettings.fetchModels')}</button>
          {!canFetch && listing !== 'running' && <span className="chat-command-hint">{t('ModelProviderSettings.fetchModelsNeeds')}</span>}
        </div>
      )}
      {listing && listing !== 'running' && <ModelListing listing={listing} current={ids} onChange={setListing} onTake={takeListed} />}
      {editsLimits && models.length > 0 && (
        <div className="chat-command-field">
          <span>{t('ModelProviderSettings.limits')}</span>
          <div className="provider-model-limits" role="group" aria-label={t('ModelProviderSettings.limits')}>
            <span className="provider-model-limit-head" aria-hidden="true"><span /><span>{t('ModelProviderSettings.limitContext')}</span><span>{t('ModelProviderSettings.limitOutput')}</span></span>
            {models.map((model) => (
              <span key={model.id} className="provider-model-limit">
                <span className="mono" title={model.id}>{model.id}</span>
                {(['context', 'output'] as const).map((field) => {
                  const text = limitText(draft, model, field)
                  return <input key={field} className="input mono" value={text} onChange={(event) => setLimit(model, field, event.target.value)} spellCheck={false}
                    aria-label={`${model.id} ${t(field === 'context' ? 'ModelProviderSettings.limitContext' : 'ModelProviderSettings.limitOutput')}`} aria-invalid={parseTokens(text) === undefined}
                    placeholder={t('ModelProviderSettings.limitUnknown')} />
                })}
              </span>
            ))}
          </div>
          <span className="chat-command-hint">{badLimits ? <span className="warning">{t('ModelProviderSettings.limitsInvalid')}</span> : t('ModelProviderSettings.limitsHint')}</span>
        </div>
      )}
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
          {(!canExtras || draft.smallJobs === 'provider') && <span className="chat-command-hint">{t('ModelProviderSettings.smallModelHint')}</span>}
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
        <UnservableHint servable={servable} custom={draft.preset === 'custom'} />
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
      {canExtras && (
        <>
          <label className="chat-command-field">
            <span>{t('ModelProviderSettings.smallJobs')}</span>
            <select className="input" value={draft.smallJobs} onChange={(event) => { const value = SMALL_JOBS.find((each) => each === event.target.value); if (value) set({ smallJobs: value }) }}>
              {SMALL_JOBS.map((value) => <option key={value} value={value}>{t(SMALL_JOB_LABELS[value])}</option>)}
            </select>
            <span className="chat-command-hint">{t('ModelProviderSettings.smallJobsHint')}</span>
          </label>
          <label className="chat-command-field">
            <span>{t('ModelProviderSettings.headers')}</span>
            <textarea className="input mono mcp-args" rows={3} value={draft.headers} onChange={(event) => set({ headers: event.target.value })} spellCheck={false} placeholder="User-Agent: my-client/1.0" aria-invalid={badHeaders.length > 0} />
            <span className="chat-command-hint">{badHeaders.length
              ? <span className="warning">{t('ModelProviderSettings.headersInvalid', { value1: badHeaders.map((each) => each.line).join('、') })}</span>
              : t('ModelProviderSettings.headersHint')}</span>
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
          {PROVIDER_TEMPLATES.map((template) => <button type="button" key={template} className="provider-start-row" onClick={() => setDraft(draftOfTemplate(template))}>
            <ChoiceMark choice={template} />
            <span><strong>{choiceName(template)}</strong><span className="settings-quota-note">{choiceHint(template)}</span></span>
            <ChevronRightIcon />
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
