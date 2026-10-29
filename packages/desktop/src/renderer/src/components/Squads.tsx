import { t, tr } from '../i18n'
import { useId, useState, type ReactNode } from 'react'
import { AgentKind, SquadFields, type Squad, type SquadMember } from '@antumi/protocol'
import { useAgentCatalog } from '../agent-models'
import { perform, selectSquad, useCore, useSquadsSupported } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel, reasonText } from '../labels'
import { saveSquad } from '../squads'
import { timeAgo } from '../conversation-state'
import { AgentIcon, ChevronRightIcon, PencilIcon, PlusIcon, SquadIcon } from './icons'
import { AgentsPageHeader } from './AgentsPageHeader'
import { AgentModelPicker } from './AgentModelPicker'
import { effortLabel } from './ChatOptionsBar'
import { ChatPicker } from './ChatPicker'
import { Segmented } from './SettingsControls'

const MAX_MEMBERS = 5
const LEADER_DUTY = () => t('Squads.readOnlyLeaderBreaksDownWorkAssignsMembers')

// The squads live on a page of their own, opened from here like the routines; the sidebar keeps
// no list of them.
export function SquadsEntry() {
  const supported = useSquadsSupported()
  const profilesSupported = useCore((state) => state.rpc?.features.includes('agent-profiles') ?? false)
  const open = useCore((state) => state.section === 'squads' && !state.gitOpen && !state.routinesOpen && !state.overviewOpen && !state.worktreesOpen)
  if (!supported && !profilesSupported) return null
  return (
    <button type="button" className="inbox-entry sidebar-squads" aria-current={open} onClick={() => { selectSquad(null); if (profilesSupported) useCore.setState({ agentProfilesTab: 'profiles' }) }}>
      <SquadIcon />
      <span>{t(profilesSupported ? 'AgentProfiles.title' : 'ChatPlan.squad')}</span>
    </button>
  )
}

const leaderOf = (squad: Pick<Squad, 'members' | 'leaderId'>) => squad.members.find((member) => member.id === squad.leaderId) ?? null

function capabilityText(member: SquadMember, leader: boolean): string {
  if (leader) return t('Squads.leaderReadOnly')
  return member.capability === 'develop' ? t('Squads.developmentTesting') : t('Squads.readOnlyAnalysis')
}

// What a member runs on, in a line: the agent, its model (or the agent's default) and effort.
function engineText(member: SquadMember): string {
  return [agentLabel(member.agent), member.model ?? t('ChatPicker.defaultModel'), member.effort ? effortLabel(member.effort) : null].filter(Boolean).join(' · ')
}

function rosterText(squad: Squad): string {
  const others = squad.members.filter((member) => member.id !== squad.leaderId)
  const developers = others.filter((member) => member.capability === 'develop').length
  const readers = others.length - developers
  return [t('SquadLaunchDialog.members', { value1: others.length }), developers ? t('Squads.developers', { developers: developers }) : null, readers ? t('Squads.readOnly', { readers: readers }) : null].filter(Boolean).join(' · ')
}

type Tab = 'active' | 'archived'

function SquadList() {
  const squads = useCore((state) => state.squads)
  const all = Object.values(squads).sort((a, b) => b.updatedAt - a.updatedAt)
  const archived = all.filter((squad) => squad.archivedAt !== null)
  const [tab, setTab] = useState<Tab>('active')
  const tabsId = useId()
  const shown = tab === 'archived' ? archived : all.filter((squad) => squad.archivedAt === null)
  // Read once a render: the cards say how long ago each changed.
  const now = Date.now()
  return (
    <section className="squads-section" aria-label={t('Squads.developmentSquads')}>
      <div className="squads-tabs">
        <span id={tabsId} className="visually-hidden">{t('RoutinesSection.show')}</span>
        <Segmented labelId={tabsId} value={tab} options={[{ value: 'active', label: t('Squads.inUse', { value1: all.length - archived.length }) }, { value: 'archived', label: t('Squads.archived', { value1: archived.length }) }]} onChange={setTab} />
      </div>
      {tab === 'archived' && shown.length === 0 ? <p className="worktrees-empty muted">{t('Squads.noArchivedSquads')}</p> : (
        <ul className="squad-cards">
          {shown.map((squad) => <SquadCard key={squad.id} squad={squad} now={now} />)}
          {/* The header's button again, where the eye ends up: with none yet, it is the page. */}
          {tab === 'active' && (
            <li>
              <button type="button" className="squad-card squad-card-new" onClick={() => selectSquad(null, true)}>{tr('Squads.newSquad', { value1: <span className="squad-card-plus"><PlusIcon /></span>, value2: <span className="squad-card-new-hint">{t('Squads.preFillLeaderDeveloperReviewerRoles')}</span> })}</button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

// A squad at a glance: its name, what it is for, its members leader first, and when it last changed.
function SquadCard({ squad, now }: { squad: Squad; now: number }) {
  const leader = leaderOf(squad)
  const members = leader ? [leader, ...squad.members.filter((member) => member !== leader)] : squad.members
  return (
    <li>
      <button type="button" className="squad-card" data-archived={squad.archivedAt !== null || undefined} onClick={() => selectSquad(squad.id)}>
        <span className="squad-card-top">
          <span className="squad-card-icon" aria-hidden="true"><SquadIcon /></span>
          <span className="squad-card-name">{squad.name}</span>
          {squad.archivedAt !== null && <span className="squad-tag">{t('ConversationList.archived')}</span>}
        </span>
        <span className="squad-card-description" data-empty={!squad.description || undefined}>{squad.description || t('Squads.noDescription')}</span>
        <span className="squad-card-members">
          {members.map((member) => (
            <span key={member.id} className="squad-card-member" data-lead={member === leader || undefined} title={`${member.name} · ${engineText(member)}`}>
              <AgentIcon agent={member.agent} />{member.name}
            </span>
          ))}
        </span>
        <span className="squad-card-foot">
          <span>{rosterText(squad)}</span>
          <span className="squad-card-time">{tr('SourceInboxView.updated', { value1: timeAgo(squad.updatedAt, now) })}</span>
        </span>
      </button>
    </li>
  )
}

function MemberLine({ member, leader }: { member: SquadMember; leader: boolean }) {
  return (
    <li className="squad-member-line">
      <span className="squad-member-icon"><AgentIcon agent={member.agent} /></span>
      <span className="squad-member-main">
        <span className="squad-member-title">
          <strong>{member.name}</strong>
          <span className="squad-tag" data-kind={leader ? 'leader' : member.capability}>{capabilityText(member, leader)}</span>
          <span className="muted squad-member-engine">{engineText(member)}</span>
        </span>
        {member.role && <span className="squad-member-role">{member.role}</span>}
      </span>
    </li>
  )
}

function OverviewActions({ squad, onEdit }: { squad: Squad; onEdit: () => void }) {
  const [busy, setBusy] = useState(false)
  const archived = squad.archivedAt !== null
  const archive = async () => {
    setBusy(true)
    const changed = await perform((rpc) => rpc.call('squads.archive', { id: squad.id, archived: !archived }))
    if (changed) useCore.setState((state) => ({ squads: { ...state.squads, [changed.id]: changed } }))
    setBusy(false)
  }
  return (
    <div className="squad-header-actions">
      {archived && <span className="squad-tag">{t('ConversationList.archived')}</span>}
      <button type="button" className="button ghost" disabled={busy} onClick={() => void archive()}>{archived ? t('Squads.restoreSquad') : t('Squads.archiveSquad')}</button>
      {!archived && <button type="button" className="button" onClick={onEdit}>{tr('Squads.edit', { value1: <PencilIcon /> })}</button>}
    </div>
  )
}

function SquadOverview({ squad }: { squad: Squad }) {
  const leader = leaderOf(squad)
  return (
    <div className="squad-page-body">
      <section className="squad-block" aria-label={t('SquadWorkPanel.leader')}>
        <h3>{t('SquadWorkPanel.leader')}</h3>
        <p className="muted squad-block-hint">{LEADER_DUTY()}</p>
        {leader && <ul className="squad-member-lines"><MemberLine member={leader} leader /></ul>}
      </section>
      <section className="squad-block" aria-label={t('Squads.teamMembers')}>
        <h3>{t('Squads.teamMembers')} <span className="muted">{squad.members.length - 1}</span></h3>
        <p className="muted squad-block-hint">{t('Squads.developmentAndTestingRunSequentiallyReadOnlyAnalysis')}</p>
        <ul className="squad-member-lines">{squad.members.filter((member) => member.id !== squad.leaderId).map((member) => <MemberLine key={member.id} member={member} leader={false} />)}</ul>
      </section>
      <section className="squad-block" aria-label={t('Squads.instructionsForTheLeader')}>
        <h3>{t('Squads.instructionsForTheLeader')}</h3>
        {squad.instructions ? <p className="squad-instructions">{squad.instructions}</p> : <p className="muted squad-block-hint">{t('Squads.noneTheLeaderAssignsWorkBasedOnThe')}</p>}
      </section>
      <p className="muted squad-footnote">{t('Squads.runningTasksKeepTheirStartupConfigurationChangesHere')}</p>
    </div>
  )
}

// One member while editing: a line like the overview's, opened in place for its settings.
function MemberEditor({ member, leader, open, agents, disabled, onToggle, onChange, onLead, onRemove }: {
  member: SquadMember; leader: boolean; open: boolean; agents: readonly AgentKind[]; disabled: boolean
  onToggle(): void; onChange(member: SquadMember): void; onLead(): void; onRemove(): void
}) {
  const catalog = useAgentCatalog(member.agent, open, null)
  const profiles = useCore((state) => state.agentProfiles)
  const profile = member.profileId ? profiles[member.profileId] : null
  const offered = agents.includes(member.agent) ? agents : [...agents, member.agent]
  return (
    <li className="squad-member-edit" data-open={open || undefined}>
      <div className="squad-member-line">
        <button type="button" className="squad-member-toggle" aria-expanded={open} aria-label={open ? t('Squads.collapse', { value1: member.name }) : t('Squads.expand', { value1: member.name })} onClick={onToggle}><ChevronRightIcon /></button>
        <span className="squad-member-icon"><AgentIcon agent={member.agent} /></span>
        <button type="button" className="squad-member-main" onClick={onToggle}>
          <span className="squad-member-title">
            <strong>{member.name || t('Squads.untitled')}</strong>
            <span className="squad-tag" data-kind={leader ? 'leader' : member.capability}>{capabilityText(member, leader)}</span>
            <span className="muted squad-member-engine">{engineText(member)}</span>
          </span>
          {member.role && <span className="squad-member-role">{member.role}</span>}
        </button>
        {!leader && (
          <span className="squad-member-actions">
            <button type="button" className="link-button" disabled={disabled} onClick={onLead}>{t('Squads.makeLeader')}</button>
            <button type="button" className="link-button" disabled={disabled} onClick={onRemove}>{t('ChatQuoteCards.remove')}</button>
          </span>
        )}
      </div>
      {open && (
        <fieldset className="squad-member-fields" disabled={disabled}>
          <label className="squad-field">{t('AgentProfiles.role')}
            <ChatPicker label={t('AgentProfiles.role')} value={member.profileId ?? ''} placeholder={t('AgentProfiles.customMember')} size="field" placement="below"
              options={[{ value: '', label: t('AgentProfiles.customMember') }, ...Object.values(profiles).filter((item) => item.archivedAt === null && (!leader || item.capability === 'readOnly')).map((item) => ({ value: item.id, label: item.name, description: item.description }))]}
              onChange={(id) => {
                const picked = profiles[id]
                onChange(picked ? { ...member, profileId: id, name: picked.name, agent: picked.agent, model: picked.model, effort: picked.effort, capability: leader ? 'readOnly' : picked.capability } : { ...member, profileId: null, profile: undefined })
              }} />
          </label>
          <div className="squad-member-options">
            <label className="squad-field">{tr('Squads.name', { value1: <input className="input" value={member.name} maxLength={60} required onChange={(event) => onChange({ ...member, name: event.target.value })} /> })}</label>
            <div className="squad-field">{t('AgentProfiles.engine')}
              <ChatPicker label={t('AgentProfiles.engine')} disabled={Boolean(profile)} value={member.agent} placeholder={agentLabel(member.agent)} size="field" placement="below"
                options={offered.map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} />, description: agents.includes(agent) ? null : t('AgentPicker.notInstalled') }))}
                onChange={(value) => {
                  const parsed = AgentKind.safeParse(value)
                  if (parsed.success && parsed.data !== member.agent) onChange({ ...member, agent: parsed.data, model: null, effort: null })
                }} />
            </div>
            <div className="squad-field">{tr('Squads.model', { value1: <AgentModelPicker catalog={catalog} choice={{ model: member.model ?? undefined, effort: member.effort ?? undefined }} size="field" disabled={Boolean(profile)}
                onChange={(next) => onChange({ ...member, model: next.model ?? null, effort: next.effort ?? null })} /> })}</div>
            {!leader && <div className="squad-field">{tr('Squads.capability', { value1: <ChatPicker label={t('Squads.capability_1905')} disabled={Boolean(profile)} value={member.capability} placeholder={t('Squads.readOnlyAnalysisReview')} size="field" placement="below"
                options={[
                  { value: 'readOnly', label: t('Squads.readOnlyAnalysisReview'), description: t('Squads.readAnalyzeAndReviewCodeWithoutEditingMultiple') },
                  { value: 'develop', label: t('Squads.developmentTesting'), description: t('Squads.editCodeAndRunTestsSequentiallyWithOther') }
                ]}
                onChange={(value) => onChange({ ...member, capability: value === 'develop' ? 'develop' : 'readOnly' })} /> })}</div>}
          </div>
          <label className="squad-field">{tr('Squads.roleDescription', { value1: <textarea className="input" value={member.role} maxLength={2000} rows={2} placeholder={t('Squads.responsibilitiesExpertiseAndDeliveryRequirements')} onChange={(event) => onChange({ ...member, role: event.target.value })} /> })}</label>
        </fieldset>
      )}
    </li>
  )
}

function SquadEditor({ squad, onDone }: { squad: Squad | null; onDone: (saved: boolean) => void }) {
  const installed = useInstalledAgents()
  const [name, setName] = useState(squad?.name ?? '')
  const [description, setDescription] = useState(squad?.description ?? '')
  const [instructions, setInstructions] = useState(squad?.instructions ?? '')
  const [members, setMembers] = useState<SquadMember[]>(() => squad?.members ?? [
    { id: crypto.randomUUID(), name: t('SquadWorkPanel.leader'), agent: installed[0] ?? 'claude', model: null, effort: null, role: t('Squads.breakDownWorkCoordinateDevelopmentAndReviewSummarize'), capability: 'readOnly' },
    { id: crypto.randomUUID(), name: t('Squads.development'), agent: installed[0] ?? 'claude', model: null, effort: null, role: t('Squads.implementFeaturesAndRunRelevantChecksAndTests'), capability: 'develop' },
    { id: crypto.randomUUID(), name: t('ConversationChat.review'), agent: installed[1] ?? installed[0] ?? 'claude', model: null, effort: null, role: t('Squads.reviewCorrectnessEdgeCasesAndCodeQualityReport'), capability: 'readOnly' }
  ])
  const [leaderId, setLeaderId] = useState(squad?.leaderId ?? members[0]!.id)
  const [opened, setOpened] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leader = members.find((member) => member.id === leaderId) ?? null
  const others = members.filter((member) => member.id !== leaderId)
  const change = (next: SquadMember) => setMembers(members.map((each) => each.id === next.id ? next : each))
  const editor = (member: SquadMember) => (
    <MemberEditor key={member.id} member={member} leader={member.id === leaderId} agents={installed} disabled={busy}
      open={opened === member.id} onToggle={() => setOpened(opened === member.id ? null : member.id)} onChange={change}
      // A leader only coordinates, so it reads; the one it replaces keeps what it had.
      onLead={() => { setLeaderId(member.id); change({ ...member, capability: 'readOnly' }) }}
      onRemove={() => { setMembers(members.filter((each) => each.id !== member.id)); if (opened === member.id) setOpened(null) }} />
  )
  const add = () => {
    const member: SquadMember = { id: crypto.randomUUID(), name: t('Squads.member', { value1: members.length }), agent: installed[0] ?? 'claude', model: null, effort: null, role: '', capability: 'readOnly' }
    setMembers([...members, member])
    setOpened(member.id)
  }
  const save = async () => {
    const parsed = SquadFields.safeParse({ name, description, instructions, members, leaderId })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const reason: unknown = issue?.code === 'custom' ? issue.params?.reason : undefined
      setError(typeof reason === 'string' ? reasonText(reason, issue?.message ?? '') : issue?.message ?? t('Squads.checkSquadConfiguration'))
      return
    }
    setBusy(true); setError(null)
    const saved = await saveSquad(parsed.data, squad?.id)
    setBusy(false)
    if (saved) onDone(true)
    else setError(useCore.getState().error)
  }
  return (
    <form className="squad-page-body squad-editor-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <fieldset className="squad-fields" disabled={busy}>
        <label className="squad-field">{tr('Squads.squadName', { value1: <input className="input" autoFocus={!squad} value={name} maxLength={200} required placeholder={t('Squads.forExampleWebsiteTeam')} onChange={(event) => setName(event.target.value)} /> })}</label>
        <label className="squad-field">{tr('Squads.shortDescription', { value1: <input className="input" value={description} maxLength={2000} placeholder={t('Squads.whatThisSquadDoesShownInTheSquad')} onChange={(event) => setDescription(event.target.value)} /> })}</label>
      </fieldset>
      <section className="squad-block" aria-label={t('SquadWorkPanel.leader')}>
        <h3>{t('SquadWorkPanel.leader')}</h3>
        <p className="muted squad-block-hint">{LEADER_DUTY()}</p>
        {leader && <ul className="squad-member-lines">{editor(leader)}</ul>}
      </section>
      <section className="squad-block" aria-label={t('Squads.teamMembers')}>
        <h3>{t('Squads.teamMembers')} <span className="muted">{others.length}</span></h3>
        <p className="muted squad-block-hint">{t('Squads.atLeastOneDevelopmentTestingMemberDevelopersRun')}</p>
        <ul className="squad-member-lines">{others.map(editor)}</ul>
        <button type="button" className="link-button squad-add" disabled={busy || members.length >= MAX_MEMBERS} onClick={add}>
          {members.length >= MAX_MEMBERS ? t('Squads.upToMembersIncludingTheLeader', { MAX_MEMBERS: MAX_MEMBERS }) : t('Squads.addMember')}
        </button>
      </section>
      <section className="squad-block" aria-label={t('Squads.instructionsForTheLeader')}>
        <label className="squad-field"><span><b>{t('Squads.instructionsForTheLeader')}</b> <span className="muted">{t('Squads.optional')}</span></span>
          <textarea className="input" value={instructions} maxLength={10000} rows={3} disabled={busy} placeholder={t('Squads.assignmentRulesCollaborationAndAcceptanceCriteriaReadBy')} onChange={(event) => setInstructions(event.target.value)} />
        </label>
      </section>
      {error && <p className="modal-error" role="alert">{error}</p>}
      <footer className="squad-editor-footer">
        <button type="button" className="button ghost" disabled={busy} onClick={() => onDone(false)}>{t('ChatCommandSettings.cancel')}</button>
        <button className="button primary" type="submit" disabled={busy}>{busy ? t('SourceSettingsSection.saving') : squad ? t('FileEditor.save') : t('Squads.createSquad')}</button>
      </footer>
    </form>
  )
}

function SquadPage({ squad }: { squad: Squad }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <PageHeader title={editing ? t('Squads.edit_1926', { value1: squad.name }) : squad.name} description={editing ? null : squad.description || null} back
        actions={editing ? null : <OverviewActions squad={squad} onEdit={() => setEditing(true)} />} />
      {editing ? <SquadEditor squad={squad} onDone={() => setEditing(false)} /> : <SquadOverview squad={squad} />}
    </>
  )
}

function PageHeader({ title, description, back, actions = null }: { title: string; description: string | null; back: boolean; actions?: ReactNode }) {
  return <AgentsPageHeader title={title} description={description} back={back ? { label: t('Squads.backToSquadList'), onClick: () => selectSquad(null) } : undefined} actions={actions} />
}

export function SquadsView() {
  const selected = useCore((state) => state.selectedSquadId)
  const draft = useCore((state) => state.squadDraft)
  const squad = useCore((state) => (selected ? state.squads[selected] ?? null : null))
  return (
    <section className="worktrees-page agents-page squads-page" aria-label={t('Squads.developmentSquads')}>
      {draft ? (
        <>
          <PageHeader title={t('Squads.newDevelopmentSquad')} description={t('Squads.preFilledWithLeaderDeveloperAndReviewerChange')} back />
          <SquadEditor key="new" squad={null} onDone={(saved) => { if (!saved) selectSquad(null) }} />
        </>
      ) : squad ? (
        <SquadPage key={squad.id} squad={squad} />
      ) : (
        <>
          <PageHeader title={t('Squads.developmentSquads')} description={t('Squads.aReadOnlyLeaderCoordinatesMembersBreaksDown')} back={false}
            actions={<button type="button" className="button primary" onClick={() => selectSquad(null, true)}>{tr('Squads.newSquad_1931', { value1: <PlusIcon /> })}</button>} />
          <SquadList />
        </>
      )}
    </section>
  )
}
