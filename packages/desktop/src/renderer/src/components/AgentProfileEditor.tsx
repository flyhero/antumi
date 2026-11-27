import { SupportActions } from './ContactAuthor'
import { useEffect, useId, useState } from 'react'
import { agentDescriptor, agentSupportsReadOnly, AgentProfileFields, DELEGATION_MODES, AGENT_KINDS, forChannels, allowsChannels, type AgentKind, type AgentProfile, type DelegationMode, type SkillRef, type SkillRepo } from '@antumi/protocol'
import { useAgentCatalog } from '../agent-models'
import { agentProfileTemplateModel, type AgentProfileTemplate } from '../agent-profile-templates'
import { perform, useCore, useProfileDelegationModeSupported } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { t } from '../i18n'
import { usePreferences } from '../preferences'
import { useAgentProfileDraft } from '../agent-profile-drafts'
import { askConfirm } from '../confirm-dialog'
import { AgentAvatar } from './AgentAvatar'
import { AgentIcon, CheckIcon, GroupChatIcon, PersonIcon, PlugIcon, SlidersIcon } from './icons'
import { AgentModelPicker } from './AgentModelPicker'
import { ChatPicker } from './ChatPicker'
import { modeOptions } from './ChatOptionsBar'
import { ProviderPicker } from './ProviderPicker'
import { GroupedChecklist } from './GroupedChecklist'
import type { ChecklistGroup } from '../grouped-checklist'
import { AgentChannels } from './AgentChannels'
import { useChannels, useChannelsSupported } from '../channels'
import './agent-profile-editor.css'

// A skill as the checklist names it, and the skills of each repository as its groups.
const skillId = (ref: SkillRef) => `${ref.repo}/${ref.skill}`
function skillGroups(repos: readonly SkillRepo[]): ChecklistGroup[] {
  return repos.flatMap((repo) => {
    const items = repo.skills.filter((skill) => skill.problem === null).map((skill) => ({ id: skillId({ repo: repo.id, skill: skill.name }), label: skill.name, detail: skill.description }))
    return items.length > 0 ? [{ id: repo.id, label: repo.plugin?.name ?? repo.id, items }] : []
  })
}

// The skills picked, back from the checklist's names: one no longer installed keeps its reference.
function skillRefs(ids: readonly string[], repos: readonly SkillRepo[], current: readonly SkillRef[]): SkillRef[] {
  const known = new Map([...current, ...repos.flatMap((repo) => repo.skills.map((skill) => ({ repo: repo.id, skill: skill.name })))].map((ref) => [skillId(ref), ref]))
  return ids.flatMap((id) => known.get(id) ?? [])
}

// The modes a developing profile can be delegated in: those of its agent's that Antumi may pick for it.
const delegationModes = (agent: AgentKind): DelegationMode[] => DELEGATION_MODES.filter((mode) => mode in agentDescriptor(agent).modes)
const CALLER_MODE = 'caller'

export function AgentProfileEditor({ profile, seed, template, onSaved }: { profile: AgentProfile | null; seed: AgentProfileFields | null; template: AgentProfileTemplate | null; onSaved: (profile: AgentProfile) => void }) {
  const formId = useId()
  const installed = useInstalledAgents()
  const draft = useAgentProfileDraft(profile, seed, template?.id, installed[0] ?? 'claude')
  const { fields, setFields } = draft
  const [section, setSection] = useState<'basics' | 'tools' | 'channels'>('basics')
  const [saved, setSaved] = useState(false)
  const profiles = useCore((state) => state.agentProfiles)
  const squads = useCore((state) => state.squads)
  const repos = useCore((state) => state.skillRepos)
  const servers = useCore((state) => state.mcpServers)
  const provider = useCore((state) => state.modelProviders.find((item) => item.id === fields.modelProvider) ?? null)
  const hasProviders = agentDescriptor(fields.agent).capabilities.modelProviders.length > 0
  const modeSupported = useProfileDelegationModeSupported()
  const channels = useChannels()
  const readOnlyUnsupported = !forChannels(fields) && fields.capability !== 'develop' && !agentSupportsReadOnly(fields.agent)
  const catalog = useAgentCatalog(readOnlyUnsupported ? null : fields.agent, true, provider, fields.modelProvider)
  const quickPreference = usePreferences((state) => state.quickModels[fields.agent])
  const [modelPending, setModelPending] = useState(Boolean(template))
  useEffect(() => {
    if (!template || !modelPending || catalog === undefined) return
    setFields((current) => ({ ...current, ...agentProfileTemplateModel(template, current.agent, catalog, provider?.smallModel ?? quickPreference, Boolean(provider)) }))
    setModelPending(false)
  }, [template, modelPending, catalog, provider, quickPreference])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (modelPending || readOnlyUnsupported || platformUnsupported || busy) return
    if (!fields.name.trim()) { setError(t('ProfileEditor.nameRequired')); setSection('basics'); requestAnimationFrame(() => document.getElementById(`${formId}-name`)?.focus()); return }
    const parsed = AgentProfileFields.safeParse(fields)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ''); return }
    setBusy(true); setError(null)
    const saved = await perform((rpc) => rpc.call('agentProfiles.save', { ...parsed.data, ...(profile ? { id: profile.id } : {}) }))
    setBusy(false)
    if (!saved) { setError(useCore.getState().error); return }
    useCore.setState((state) => ({ agentProfiles: { ...state.agentProfiles, [saved.id]: saved } }))
    draft.commit(saved, saved.id)
    setSaved(true)
    onSaved(saved)
  }
  const agents = installed.includes(fields.agent) ? installed : [fields.agent, ...installed]
  const onPlatform = channels.some((channel) => channel.profileId === profile?.id)
  const channelsSupported = useChannelsSupported()
  const audience = fields.audience ?? 'user'
  const toChannels = audience === 'channels'
  const channelsEnabled = audience !== 'user'
  // An agent for a chat platform is one that can be locked down.
  const lockable = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.lockdown)
  const platformUnsupported = channelsEnabled && !lockable.includes(fields.agent)
  const problem = error ?? (platformUnsupported ? t('ProfileEditor.unsupportedPlatformAgent') : readOnlyUnsupported ? t('AgentTemplates.readOnlyUnsupported') : null)
  const ownedChannels = channels.filter((channel) => channel.profileId === profile?.id)
  const channelSummary = !channelsEnabled ? t('ProfileEditor.notEnabled') : ownedChannels.length === 0 ? t('ProfileEditor.notConnected') : t('ProfileEditor.connectionCount', { count: ownedChannels.length })
  const sections = [
    { id: 'basics', title: t('ProfileEditor.basics'), detail: t('ProfileEditor.basicsHint'), icon: PersonIcon },
    { id: 'tools', title: t('ProfileEditor.tools'), detail: t('ProfileEditor.toolsHint'), icon: PlugIcon },
    { id: 'channels', title: t('ProfileEditor.channels'), detail: channelSummary, icon: GroupChatIcon }
  ] as const
  const discard = async () => {
    if (!draft.dirty || !await askConfirm({ message: t('ProfileEditor.discardQuestion'), confirm: t('ProfileEditor.discard'), danger: true })) return
    draft.reset()
    setError(null)
    setSaved(false)
  }
  return <div className="squad-page-body profile-editor" onKeyDown={(event) => { if (event.target instanceof HTMLElement && event.target.closest('dialog')) return; if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!busy && (draft.dirty || !profile)) event.currentTarget.querySelector('form')?.requestSubmit() } }}>
    <header className="profile-editor-summary">
      <span className="profile-editor-avatar">{profile ? <AgentAvatar id={profile.id} /> : <AgentIcon agent={fields.agent} />}</span>
      <div><h3>{fields.name.trim() || t('AgentProfiles.create')}</h3><p>{[agentLabel(fields.agent), fields.model].filter(Boolean).join(' · ')} · {t(toChannels ? 'ProfileEditor.platformOnly' : 'ProfileEditor.localAvailable')}</p></div>
      <span className="profile-editor-draft">{draft.dirty ? t('ProfileEditor.unsaved') : saved ? t('ProfileEditor.saved') : t(profile ? 'ProfileEditor.savedConfiguration' : 'ProfileEditor.newDraft')}</span>
    </header>
    <div className="profile-editor-layout">
      <nav className="profile-editor-nav" aria-label={t('ProfileEditor.navigation')}>
        {sections.filter((item) => item.id !== 'channels' || channelsSupported).map(({ id, title, detail, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}><Icon /><span><strong>{title}</strong><small>{detail}</small></span></button>)}
      </nav>
      <div className="profile-editor-content">

  <form id={formId} className="profile-editor-fields" onInvalidCapture={(event) => { event.preventDefault(); setSection('basics'); setError(t('ProfileEditor.nameRequired')); const field = event.target; if (field instanceof HTMLElement) requestAnimationFrame(() => field.focus()) }} onSubmit={(event) => { event.preventDefault(); void save() }}>
    <fieldset className="squad-fields" disabled={busy}>
    <div hidden={section !== 'basics'} className="profile-editor-basics">
      {template && <p className="agent-template-origin">{t('AgentTemplates.fromTemplate', { name: template.name })}</p>}
      <div className="profile-editor-section-heading"><h3>{t('ProfileEditor.usage')}</h3><p>{t('ProfileEditor.usageHint')}</p></div>
      {channelsSupported && <div className="profile-editor-audience" role="group" aria-label={t('AgentProfiles.audience')}>
        {([['user', PersonIcon, 'AgentProfiles.audienceUser', 'AgentProfiles.audienceUserHint', null], ['channels', GroupChatIcon, 'AgentProfiles.audienceChannels', 'AgentProfiles.audienceChannelsHint', 'AgentProfiles.audienceChannelsDetail']] as const).map(([value, Icon, title, hint, detail]) =>
          <button key={value} type="button" role="checkbox" aria-checked={value === 'user' ? !toChannels : channelsEnabled} className="profile-editor-entry" disabled={(audience === value) || (onPlatform && value === 'channels' && channelsEnabled)}
            title={onPlatform && value === 'channels' ? t('AgentProfiles.audienceLocked') : undefined} data-tooltip={detail ? t(detail) : undefined}
            onClick={() => setFields({ ...fields, audience: audience === 'both' ? (value === 'user' ? 'channels' : 'user') : 'both' })}>
            <span className="profile-editor-entry-icon"><Icon /></span>
            <span className="profile-editor-entry-text"><strong>{t(title)}</strong><span>{t(hint)}</span></span>
            <span className="profile-editor-entry-check" aria-hidden="true"><CheckIcon /></span>
          </button>)}
      </div>}
      <section className="profile-editor-section"><header className="agent-card-head"><span className="agent-card-icon"><PersonIcon /></span><div><h3>{t('AgentProfiles.sectionIdentity')}</h3><p>{t('AgentProfiles.sectionIdentityHint')}</p></div></header>
      <div className="squad-field"><label htmlFor={`${formId}-name`}>{t('AgentProfiles.name')}</label><input id={`${formId}-name`} className="input" required autoFocus={!profile} maxLength={60} value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} /></div>
      <div className="squad-field"><label htmlFor={`${formId}-description`}>{t('AgentProfiles.expertise')}</label><textarea id={`${formId}-description`} className="input" rows={2} maxLength={2000} value={fields.description ?? ''} onChange={(event) => setFields({ ...fields, description: event.target.value })} /></div>
      <div className="squad-field"><label htmlFor={`${formId}-instructions`}>{t('AgentProfiles.instructions')}</label><textarea id={`${formId}-instructions`} className="input" rows={6} maxLength={20000} value={fields.instructions ?? ''} onChange={(event) => setFields({ ...fields, instructions: event.target.value })} /></div>
      </section>
      <section className="profile-editor-section"><header className="agent-card-head"><span className="agent-card-icon"><SlidersIcon /></span><div><h3>{t('AgentProfiles.sectionRuntime')}</h3><p>{t('AgentProfiles.sectionRuntimeHint')}</p></div></header>
      <div className="agent-profile-options"><div className="squad-field">{t('AgentProfiles.engine')}<ChatPicker label={t('AgentProfiles.engine')} value={fields.agent} placeholder="" size="field" placement="below" options={(channelsEnabled ? agents.filter((agent) => lockable.includes(agent)) : agents).map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} /> }))} onChange={(value) => { const agent = agents.find((item) => item === value); if (agent) { setFields({ ...fields, agent, model: null, effort: null, modelProvider: null, delegationMode: fields.delegationMode && delegationModes(agent).includes(fields.delegationMode) ? fields.delegationMode : null }); setModelPending(Boolean(template)) } }} /></div>
        {hasProviders && <div className="squad-field">{t('ProviderPicker.provider')}<ProviderPicker agent={fields.agent} value={fields.modelProvider ?? null} size="field" placement="below" onChange={(modelProvider) => { setFields({ ...fields, modelProvider, model: null, effort: null }); setModelPending(Boolean(template)) }} /></div>}
        <div className="squad-field">{t('AgentModelPicker.model')}<AgentModelPicker catalog={catalog} choice={{ model: fields.model ?? undefined, effort: fields.effort ?? undefined }} size="field" onChange={(choice) => { setModelPending(false); setFields({ ...fields, model: choice.model ?? null, effort: choice.effort ?? null }) }} /></div>
        {!toChannels && <div className="squad-field">{t('Squads.capability_1905')}<ChatPicker label={t('Squads.capability_1905')} value={fields.capability ?? 'readOnly'} placeholder="" size="field" placement="below" options={[{ value: 'readOnly', label: t('Squads.readOnlyAnalysis') }, { value: 'develop', label: t('Squads.developmentTesting') }]} onChange={(value) => setFields({ ...fields, ...(value === 'develop' ? { capability: 'develop' } : { capability: 'readOnly', delegationMode: null }) })} /></div>}
        {modeSupported && !toChannels && fields.capability === 'develop' && <div className="squad-field">{t('AgentProfiles.delegationMode')}<ChatPicker label={t('AgentProfiles.delegationMode')} value={fields.delegationMode ?? CALLER_MODE} placeholder="" size="field" placement="below"
          options={[{ value: CALLER_MODE, label: t('AgentProfiles.delegationModeCaller') }, ...modeOptions(fields.agent, delegationModes(fields.agent))]}
          onChange={(value) => setFields({ ...fields, delegationMode: delegationModes(fields.agent).find((mode) => mode === value) ?? null })} /></div>}
      </div>
      {platformUnsupported && <p className="modal-error" role="alert">{t('ProfileEditor.unsupportedPlatformAgent')}</p>}
      {template && <p className="squad-block-hint muted">{t('AgentTemplates.modelHint')}</p>}
      {toChannels ? <p className="squad-block-hint muted">{t('AgentProfiles.channelsRunHint')}</p> : <p className="squad-block-hint muted" role={readOnlyUnsupported ? 'alert' : undefined}>{t(readOnlyUnsupported ? 'AgentTemplates.readOnlyUnsupported' : fields.capability !== 'develop' ? 'AgentTemplates.readOnlyHint'
        : !modeSupported || !fields.delegationMode ? 'AgentTemplates.developHint' : fields.delegationMode === 'bypass' ? 'AgentTemplates.developBypassHint' : 'AgentTemplates.developModeHint')}</p>}
      </section>
    </div>
    <div hidden={section !== 'tools'}>
      {toChannels && <p className="profile-editor-note">{t('ProfileEditor.channelToolsNotice')}</p>}
      {!toChannels && <section className="profile-editor-section"><header className="agent-card-head"><span className="agent-card-icon"><PlugIcon /></span><div><h3>{t('AgentProfiles.sectionTools')}</h3><p>{t('AgentTemplates.toolsHint')}</p></div></header>
      <div className="profile-editor-resources">
        <details className="profile-editor-resource"><summary>{t('AgentProfiles.callable')}<span>{fields.callableProfiles?.length ?? 0}</span></summary><div className="profile-editor-resource-body"><p className="muted">{t('AgentProfiles.callableHint')}</p>
          {!Object.values(profiles).some((item) => item.archivedAt === null && !forChannels(item) && item.id !== profile?.id) && <p className="muted">{t('ProfileEditor.noAgents')}</p>}
          {Object.values(profiles).filter((item) => item.archivedAt === null && !forChannels(item) && item.id !== profile?.id).map((item) => <label key={item.id} className="agent-profile-check"><input type="checkbox" checked={fields.callableProfiles?.includes(item.id) ?? false} onChange={(event) => setFields({ ...fields, callableProfiles: event.target.checked ? [...(fields.callableProfiles ?? []), item.id] : fields.callableProfiles?.filter((id) => id !== item.id) })} />{item.name}</label>)}
        </div></details>
        <details className="profile-editor-resource"><summary>{t('TeamCalls.callable')}<span>{fields.callableSquads?.length ?? 0}</span></summary><div className="profile-editor-resource-body">
          {!Object.values(squads).some((item) => item.archivedAt === null) && <p className="muted">{t('ProfileEditor.noTeams')}</p>}
          {Object.values(squads).filter((item) => item.archivedAt === null).map((item) => <label key={item.id} className="agent-profile-check"><input type="checkbox" checked={fields.callableSquads?.includes(item.id) ?? false} onChange={(event) => setFields({ ...fields, callableSquads: event.target.checked ? [...(fields.callableSquads ?? []), item.id] : fields.callableSquads?.filter((id) => id !== item.id) })} />{item.name}</label>)}
        </div></details>
        <details className="profile-editor-resource"><summary>{t('AgentProfiles.skills')}<span>{fields.skills == null ? t('ProfileEditor.inherited') : fields.skills.length}</span></summary><div className="profile-editor-resource-body">
          <label className="agent-profile-check"><input type="checkbox" checked={fields.skills == null} onChange={(event) => setFields({ ...fields, skills: event.target.checked ? null : [] })} />{t('AgentProfiles.inherit')}</label>
          {fields.skills != null && <GroupedChecklist groups={skillGroups(repos)} selected={fields.skills.map(skillId)} searchLabel={t('AgentProfiles.searchSkills')} onChange={(ids) => setFields({ ...fields, skills: skillRefs(ids, repos, fields.skills ?? []) })} />}
        </div></details>
        <details className="profile-editor-resource"><summary>MCP<span>{fields.mcpServers == null ? t('ProfileEditor.inherited') : fields.mcpServers.length}</span></summary><div className="profile-editor-resource-body">
          <label className="agent-profile-check"><input type="checkbox" checked={fields.mcpServers == null} onChange={(event) => setFields({ ...fields, mcpServers: event.target.checked ? null : [] })} />{t('AgentProfiles.inherit')}</label>
          {fields.mcpServers != null && <GroupedChecklist groups={[{ id: 'mcp', label: '', items: servers.map((server) => ({ id: server.name, label: server.name })) }]} selected={fields.mcpServers} searchLabel={t('AgentProfiles.searchMcp')} onChange={(mcpServers) => setFields({ ...fields, mcpServers })} />}
        </div></details>
      </div>
      </section>}
    </div>
    </fieldset>
  </form>
  <section hidden={section !== 'channels'} className="profile-editor-platforms">
    <div className="profile-editor-section-heading"><h3>{t('ProfileEditor.channels')}</h3><p>{t('ProfileEditor.channelsHint')}</p></div>
    <p className="profile-editor-note">{t('AgentProfiles.channelsRunHint')}</p>
    {!channelsEnabled ? <div className="profile-editor-empty"><h4>{t('ProfileEditor.platformDisabled')}</h4><p>{t('ProfileEditor.platformDisabledHint')}</p><button type="button" className="button" onClick={() => setSection('basics')}>{t('ProfileEditor.toUsage')}</button></div>
      : <>
        {(draft.dirty || !profile || !allowsChannels(profile)) && <p className="profile-editor-note">{t('ProfileEditor.saveBeforeConnect')}</p>}
        <fieldset className="profile-editor-connection" disabled={draft.dirty || busy} aria-label={t('ProfileEditor.channels')}><AgentChannels profileId={profile && allowsChannels(profile) ? profile.id : null} agent={profile?.agent ?? fields.agent} hasProvider={Boolean(profile ? profile.modelProvider : fields.modelProvider)} /></fieldset>
      </>}
  </section>
      </div>
    </div>
    <footer className="profile-editor-save">
      <div role="status">{problem ? <p className="modal-error" role="alert">{problem}<SupportActions error={problem} /></p> : <><strong>{draft.dirty ? t('ProfileEditor.unsaved') : saved ? t('ProfileEditor.saved') : t(profile ? 'ProfileEditor.savedConfiguration' : 'ProfileEditor.newDraft')}</strong><p>{draft.dirty ? t(draft.persisted ? 'ProfileEditor.draftRetained' : 'ProfileEditor.draftMemory') : t(section === 'channels' ? 'ProfileEditor.independentSave' : 'ProfileEditor.saveHint')}</p></>}</div>
      {draft.dirty && <button type="button" className="button ghost" disabled={busy} onClick={() => void discard()}>{t('ProfileEditor.discard')}</button>}
      <button type="submit" form={formId} className="button primary" disabled={busy || modelPending || readOnlyUnsupported || platformUnsupported || (!draft.dirty && Boolean(profile))}>{t(busy ? 'ProfileEditor.saving' : 'FileEditor.save')}</button>
    </footer>
  </div>
}
