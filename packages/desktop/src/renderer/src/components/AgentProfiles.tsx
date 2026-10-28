import { useEffect, useId, useState } from 'react'
import { create } from 'zustand'
import { agentDescriptor, AgentProfileFields, type AgentProfile } from '@antumi/protocol'
import { useAgentCatalog } from '../agent-models'
import { agentProfileTemplateModel, agentProfileTemplateSeed, type AgentProfileTemplate } from '../agent-profile-templates'
import { openConversationDraft, perform, selectSquad, useCore } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { t } from '../i18n'
import { timeAgo } from '../conversation-state'
import { AgentIcon, PlusIcon } from './icons'
import { AgentsPageHeader } from './AgentsPageHeader'
import { AgentModelPicker } from './AgentModelPicker'
import { ChatPicker } from './ChatPicker'
import { ProviderPicker } from './ProviderPicker'
import { SquadsView } from './Squads'
import { Segmented } from './SettingsControls'
import { AgentProfileTemplates } from './AgentProfileTemplates'
import { usePreferences } from '../preferences'
import './agent-profiles.css'

const useProfileEditor = create<{ view: 'list' | 'templates' | 'editor'; profile: AgentProfile | null; seed: AgentProfileFields | null; template: AgentProfileTemplate | null; back: 'list' | 'templates' }>(() => ({ view: 'list', profile: null, seed: null, template: null, back: 'list' }))
export function openAgentProfile(id: string): void {
  const profile = useCore.getState().agentProfiles[id]
  if (!profile) return
  selectSquad(null)
  useCore.setState({ agentProfilesTab: 'profiles' })
  useProfileEditor.setState({ view: 'editor', profile, seed: null, template: null, back: 'list' })
}
export function editAgentProfile(seed: AgentProfileFields): void {
  selectSquad(null)
  useCore.setState({ agentProfilesTab: 'profiles' })
  useProfileEditor.setState({ view: 'editor', profile: null, seed, template: null, back: 'list' })
}
export function AgentsView() {
  const supported = useCore((state) => state.rpc?.features.includes('agent-profiles') ?? false)
  const squadsSupported = useCore((state) => state.rpc?.features.includes('squads') ?? false)
  const tab = useCore((state) => state.agentProfilesTab)
  if (!supported) return <SquadsView />
  return <section className="agents-hub">
    <nav className="agents-tabs" aria-label={t('AgentProfiles.title')}>
      <div className="agents-tabs-inner">
        <button type="button" className="button ghost" aria-pressed={tab === 'profiles'} onClick={() => useCore.setState({ agentProfilesTab: 'profiles' })}>{t('AgentProfiles.roles')}</button>
        {squadsSupported && <button type="button" className="button ghost" aria-pressed={tab === 'squads'} onClick={() => useCore.setState({ agentProfilesTab: 'squads' })}>{t('Squads.developmentSquads')}</button>}
      </div>
    </nav>
    {tab === 'squads' && squadsSupported ? <SquadsView /> : <ProfilesView />}
  </section>
}

function ProfilesView() {
  const installed = useInstalledAgents()
  const profiles = useCore((state) => state.agentProfiles)
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const tabsId = useId()
  const { view, profile, seed, template, back } = useProfileEditor()
  const editing = view === 'editor'
  const all = Object.values(profiles).sort((a, b) => b.updatedAt - a.updatedAt)
  const archived = all.filter((item) => item.archivedAt !== null)
  const shown = tab === 'archived' ? archived : all.filter((item) => item.archivedAt === null)
  const [busy, setBusy] = useState(false)
  const now = Date.now()
  const create = () => useProfileEditor.setState({ view: 'templates', profile: null, seed: null, template: null })
  const blank = () => useProfileEditor.setState({ view: 'editor', profile: null, seed: null, template: null, back: 'templates' })
  const pick = (template: AgentProfileTemplate) => useProfileEditor.setState({ view: 'editor', profile: null, seed: agentProfileTemplateSeed(template, installed), template, back: 'templates' })
  const edit = (profile: AgentProfile) => useProfileEditor.setState({ view: 'editor', profile, seed: null, template: null, back: 'list' })
  const leave = () => useProfileEditor.setState({ view: editing ? back : 'list' })
  const archive = async (item: AgentProfile) => {
    setBusy(true)
    const saved = await perform((rpc) => rpc.call('agentProfiles.archive', { id: item.id, archived: item.archivedAt === null }))
    if (saved) useCore.setState((state) => ({ agentProfiles: { ...state.agentProfiles, [saved.id]: saved } }))
    setBusy(false)
  }
  return <section className="worktrees-page agents-page agent-profiles-page" aria-label={t('AgentProfiles.roles')}>
    <AgentsPageHeader title={editing ? t(profile ? 'AgentProfiles.configure' : 'AgentProfiles.create') : view === 'templates' ? t('AgentTemplates.title') : t('AgentProfiles.roles')} description={editing ? null : view === 'templates' ? t('AgentTemplates.chooseHint') : t('AgentProfiles.roleDescription')} back={view !== 'list' ? { label: t(editing && back === 'templates' ? 'AgentTemplates.back' : 'AgentProfiles.back'), onClick: leave } : undefined}
      actions={view === 'list' && <button type="button" className="button primary" onClick={create}><PlusIcon />{t('AgentProfiles.create')}</button>} />
    {editing ? <ProfileEditor key={profile?.id ?? JSON.stringify(seed)} profile={profile} seed={seed} template={template} onCancel={leave} onDone={() => { if (!profile) setTab('active'); useProfileEditor.setState({ view: 'list', template: null }) }} /> : view === 'templates' ? <AgentProfileTemplates onPick={pick} onBlank={blank} /> : <section className="agent-profiles-section" aria-label={t('AgentProfiles.roles')}>
      <div className="squads-tabs">
        <span id={tabsId} className="visually-hidden">{t('RoutinesSection.show')}</span>
        <Segmented labelId={tabsId} value={tab} options={[{ value: 'active', label: t('Squads.inUse', { value1: all.length - archived.length }) }, { value: 'archived', label: t('Squads.archived', { value1: archived.length }) }]} onChange={setTab} />
      </div>
      {tab === 'archived' && shown.length === 0 && <p className="worktrees-empty muted">{t('AgentProfiles.noArchived')}</p>}
      {tab === 'active' && shown.length === 0 ? <><p className="agent-templates-empty muted">{t('AgentTemplates.emptyHint')}</p><AgentProfileTemplates onPick={pick} onBlank={blank} /></> : <ul className="squad-cards agent-profile-list">{shown.map((item) => <li key={item.id}>
        <article className="squad-card agent-profile-card" data-archived={item.archivedAt !== null || undefined}>
          <button type="button" className="agent-profile-card-main" onClick={() => edit(item)}>
            <span className="squad-card-top"><span className="squad-card-icon"><AgentIcon agent={item.agent} /></span><span className="squad-card-name">{item.name}</span>{item.archivedAt !== null && <span className="squad-tag">{t('ConversationList.archived')}</span>}</span>
            <span className="squad-card-description" data-empty={!item.description || undefined}>{item.description || t('Squads.noDescription')}</span>
            <span className="squad-card-members"><span className="squad-card-member">{t(item.capability === 'readOnly' ? 'Squads.readOnlyAnalysis' : 'Squads.developmentTesting')}</span></span>
            <span className="squad-card-foot"><span className="agent-profile-engine" title={[agentLabel(item.agent), item.model].filter(Boolean).join(' · ')}>{[agentLabel(item.agent), item.model].filter(Boolean).join(' · ')}</span><span className="squad-card-time">{t('SourceInboxView.updated', { value1: timeAgo(item.updatedAt, now) })}</span></span>
          </button>
          <footer className="agent-profile-card-actions">
            {item.archivedAt === null && <button type="button" className="button" onClick={() => { openConversationDraft(); useCore.setState({ draftProfileId: item.id }) }}>{t('AgentProfiles.chat')}</button>}
            <button type="button" className="button ghost" onClick={() => edit(item)}>{t('AgentProfiles.edit')}</button>
            <button type="button" className="button ghost" disabled={busy} onClick={() => void archive(item)}>{t(item.archivedAt === null ? 'AgentProfiles.archive' : 'AgentProfiles.restore')}</button>
          </footer>
        </article>
      </li>)}
      {tab === 'active' && <li><button type="button" className="squad-card squad-card-new" onClick={create}><span className="squad-card-plus"><PlusIcon /></span>{t('AgentProfiles.create')}<span className="squad-card-new-hint">{t('AgentProfiles.createHint')}</span></button></li>}
      </ul>}
    </section>}
  </section>
}

function ProfileEditor({ profile, seed, template, onCancel, onDone }: { profile: AgentProfile | null; seed: AgentProfileFields | null; template: AgentProfileTemplate | null; onCancel: () => void; onDone: () => void }) {
  const formId = useId()
  const installed = useInstalledAgents()
  const [fields, setFields] = useState<AgentProfileFields>(() => profile ?? seed ?? { name: '', agent: installed[0] ?? 'claude', capability: 'readOnly' })
  const profiles = useCore((state) => state.agentProfiles)
  const repos = useCore((state) => state.skillRepos)
  const servers = useCore((state) => state.mcpServers)
  const provider = useCore((state) => state.modelProviders.find((item) => item.id === fields.modelProvider) ?? null)
  const readOnlyUnsupported = fields.capability !== 'develop' && agentDescriptor(fields.agent).capabilities.readOnly === false
  const catalog = useAgentCatalog(readOnlyUnsupported ? null : fields.agent, true, provider)
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
    if (modelPending || readOnlyUnsupported || busy) return
    const parsed = AgentProfileFields.safeParse(fields)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ''); return }
    setBusy(true); setError(null)
    const saved = await perform((rpc) => rpc.call('agentProfiles.save', { ...parsed.data, ...(profile ? { id: profile.id } : {}) }))
    setBusy(false)
    if (!saved) { setError(useCore.getState().error); return }
    useCore.setState((state) => ({ agentProfiles: { ...state.agentProfiles, [saved.id]: saved } }))
    onDone()
  }
  const agents = installed.includes(fields.agent) ? installed : [fields.agent, ...installed]
  return <form className="squad-page-body agent-profile-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <fieldset className="squad-fields" disabled={busy}>
      {template && <div className="agent-template-origin"><strong>{t('AgentTemplates.fromTemplate', { name: template.name })}</strong><p className="muted">{t('AgentTemplates.editHint')}</p></div>}
      <div className="squad-field"><label htmlFor={`${formId}-name`}>{t('AgentProfiles.name')}</label><input id={`${formId}-name`} className="input" required autoFocus maxLength={60} value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} /></div>
      <div className="squad-field"><label htmlFor={`${formId}-description`}>{t('AgentProfiles.expertise')}</label><textarea id={`${formId}-description`} className="input" rows={2} maxLength={2000} value={fields.description ?? ''} onChange={(event) => setFields({ ...fields, description: event.target.value })} /></div>
      <div className="squad-field"><label htmlFor={`${formId}-instructions`}>{t('AgentProfiles.instructions')}</label><textarea id={`${formId}-instructions`} className="input" rows={6} maxLength={20000} value={fields.instructions ?? ''} onChange={(event) => setFields({ ...fields, instructions: event.target.value })} /></div>
      <div className="squad-member-options"><div className="squad-field">{t('AgentProfiles.engine')}<ChatPicker label={t('AgentProfiles.engine')} value={fields.agent} placeholder="" size="field" placement="below" options={agents.map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} /> }))} onChange={(value) => { const agent = agents.find((item) => item === value); if (agent) { setFields({ ...fields, agent, model: null, effort: null, modelProvider: null }); setModelPending(Boolean(template)) } }} /></div>
        <div className="squad-field">{t('AgentModelPicker.model')}<AgentModelPicker catalog={catalog} choice={{ model: fields.model ?? undefined, effort: fields.effort ?? undefined }} size="field" onChange={(choice) => { setModelPending(false); setFields({ ...fields, model: choice.model ?? null, effort: choice.effort ?? null }) }} /></div></div>
      {template && <p className="squad-block-hint muted">{t('AgentTemplates.modelHint')}</p>}
      <ProviderPicker agent={fields.agent} value={fields.modelProvider ?? null} size="field" placement="below" onChange={(modelProvider) => { setFields({ ...fields, modelProvider, model: null, effort: null }); setModelPending(Boolean(template)) }} />
      <ChatPicker label={t('Squads.capability_1905')} value={fields.capability ?? 'readOnly'} placeholder="" size="field" placement="below" options={[{ value: 'readOnly', label: t('Squads.readOnlyAnalysis') }, { value: 'develop', label: t('Squads.developmentTesting') }]} onChange={(value) => setFields({ ...fields, capability: value === 'develop' ? 'develop' : 'readOnly' })} />
      <p className="squad-block-hint muted" role={readOnlyUnsupported ? 'alert' : undefined}>{t(readOnlyUnsupported ? 'AgentTemplates.readOnlyUnsupported' : fields.capability === 'develop' ? 'AgentTemplates.developHint' : 'AgentTemplates.readOnlyHint')}</p>
      <section className="squad-block"><h3>{t('AgentProfiles.callable')}</h3><p className="muted">{t('AgentProfiles.callableHint')}</p>
        {Object.values(profiles).filter((item) => item.archivedAt === null && item.id !== profile?.id).map((item) => <label key={item.id} className="agent-profile-check"><input type="checkbox" checked={fields.callableProfiles?.includes(item.id) ?? false} onChange={(event) => setFields({ ...fields, callableProfiles: event.target.checked ? [...(fields.callableProfiles ?? []), item.id] : fields.callableProfiles?.filter((id) => id !== item.id) })} />{item.name}</label>)}
      </section>
      <p className="squad-block-hint muted">{t('AgentTemplates.toolsHint')}</p>
      <section className="squad-block"><h3>{t('AgentProfiles.skills')}</h3>
        <label className="agent-profile-check"><input type="checkbox" checked={fields.skills == null} onChange={(event) => setFields({ ...fields, skills: event.target.checked ? null : [] })} />{t('AgentProfiles.inherit')}</label>
        {fields.skills != null && repos.flatMap((repo) => repo.skills.filter((skill) => skill.problem === null).map((skill) => <label className="agent-profile-check" key={`${repo.id}/${skill.name}`}><input type="checkbox" checked={fields.skills?.some((ref) => ref.repo === repo.id && ref.skill === skill.name) ?? false} onChange={(event) => setFields({ ...fields, skills: event.target.checked ? [...(fields.skills ?? []), { repo: repo.id, skill: skill.name }] : fields.skills?.filter((ref) => ref.repo !== repo.id || ref.skill !== skill.name) })} />{skill.name}</label>))}
      </section>
      <section className="squad-block"><h3>MCP</h3>
        <label className="agent-profile-check"><input type="checkbox" checked={fields.mcpServers == null} onChange={(event) => setFields({ ...fields, mcpServers: event.target.checked ? null : [] })} />{t('AgentProfiles.inherit')}</label>
        {fields.mcpServers != null && servers.map((server) => <label className="agent-profile-check" key={server.name}><input type="checkbox" checked={fields.mcpServers?.includes(server.name) ?? false} onChange={(event) => setFields({ ...fields, mcpServers: event.target.checked ? [...(fields.mcpServers ?? []), server.name] : fields.mcpServers?.filter((name) => name !== server.name) })} />{server.name}</label>)}
      </section>
    </fieldset>
    {error && <p className="modal-error" role="alert">{error}</p>}
    <footer className="squad-editor-footer"><button type="button" className="button ghost" disabled={busy} onClick={onCancel}>{t('ChatCommandSettings.cancel')}</button><button type="submit" className="button primary" disabled={busy || modelPending || readOnlyUnsupported}>{t('FileEditor.save')}</button></footer>
  </form>
}
