import { localized, t, tr } from '../i18n'
import { useEffect, useState } from 'react'
import { DEFAULT_DISCUSSION_REQUIREMENTS, DEFAULT_DISCUSSION_ROUNDS, MAX_DISCUSSION_MEMBERS, MAX_DISCUSSION_ROUNDS, MIN_DISCUSSION_MEMBERS, type AgentKind, type Discussion } from '@antumi/protocol'
import { resolveModel, useAgentCatalog } from '../agent-models'
import { closeConversationDraft, selectDiscussion, useCore, useDiscussionRequirementsSupported, type DraftCarry } from '../core-store'
import { composerDraft } from '../composer-drafts'
import { createDiscussion, defaultMemberName, loadDiscussionPosts } from '../discussions'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { usePreferences } from '../preferences'
import { useChatTypeface } from '../chat-typeface'
import { useShortcutLabel } from '../keyboard-shortcuts'
import { effortLabel } from './ChatOptionsBar'
import { ChatModelPicker, ChatPicker } from './ChatPicker'
import { sendsMessage } from './ChatComposer'
import { AgentIcon, ChevronDownIcon, CloseIcon, EnterIcon } from './icons'
import { ProjectPicker } from './ProjectPicker'
import { DiscussionRequirements } from './DiscussionRequirements'
import { DraftModeSwitch } from './DraftModeSwitch'

// A member as picked: name is null while it follows the agent and model.
type Draft = { key: string; agent: AgentKind; model?: string; effort?: string; name: string | null; role: string }

const ROLE_HINTS = localized(() => ([t('DiscussionDraft.supporter'), t('DiscussionDraft.opponent'), t('DiscussionDraft.focusOnSecurityAndRisk'), t('DiscussionDraft.focusOnPerformanceAndCost'), t('DiscussionDraft.critic')]))

function MemberRow({ member, index, agents, chair, busy, removable, onChange, onRemove, onChair }: {
  member: Draft
  index: number
  agents: readonly AgentKind[]
  chair: boolean
  busy: boolean
  removable: boolean
  onChange: (next: Draft) => void
  onRemove: () => void
  onChair: () => void
}) {
  const catalog = useAgentCatalog(member.agent, true)
  const { model, effort } = resolveModel(catalog, { model: member.model, effort: member.effort })
  const shownName = member.name ?? defaultMemberName(member.agent, member.model ?? null)
  return (
    <li className="discussion-draft-member">
      <span className="discussion-draft-index">{String.fromCharCode(65 + index)}</span>
      <ChatPicker
        label="Agent"
        value={member.agent}
        placeholder="Agent"
        disabled={busy}
        options={agents.map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} /> }))}
        onChange={(value) => {
          const agent = agents.find((each) => each === value)
          if (agent) onChange({ ...member, agent, model: undefined, effort: undefined })
        }}
      />
      {!catalog && <span className="chat-options-note muted">{catalog === undefined ? t('AgentModelPicker.loadingModels') : t('ChatPicker.defaultModel')}</span>}
      {catalog && (
        <ChatModelPicker
          align="start"
          models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
          model={model?.id ?? null}
          effort={effort ?? null}
          disabled={busy}
          onModel={(value) => {
            const next = catalog.models.find((each) => each.id === value)
            if (next) onChange({ ...member, model: next.id, effort: member.effort && next.efforts.includes(member.effort) ? member.effort : undefined })
          }}
          onEffort={(value) => onChange({ ...member, effort: value })}
        />
      )}
      <input
        className="discussion-draft-name"
        aria-label={t('DiscussionDraft.memberSNameUsedToMentionThem', { value1: index + 1 })}
        value={shownName}
        maxLength={60}
        disabled={busy}
        onChange={(event) => onChange({ ...member, name: event.target.value })}
        onBlur={() => { if (member.name !== null && !member.name.trim()) onChange({ ...member, name: null }) }}
      />
      <input
        className="discussion-draft-role"
        aria-label={t('DiscussionDraft.memberSPositionOrPerspective', { value1: index + 1 })}
        placeholder={t('DiscussionDraft.optionalEG', { value1: ROLE_HINTS[index % ROLE_HINTS.length] })}
        value={member.role}
        maxLength={2000}
        disabled={busy}
        onChange={(event) => onChange({ ...member, role: event.target.value })}
      />
      <label className="discussion-draft-chair" data-tooltip={t('DiscussionDraft.theChairSummarizesWhenTheDiscussionEnds')}>{tr('DiscussionDraft.chair', { value1: <input type="radio" name="discussion-chair" checked={chair} disabled={busy} onChange={onChair} /> })}</label>
      <button type="button" className="icon-button" aria-label={t('DiscussionDraft.removeMember', { value1: index + 1 })} data-tooltip={t('ChatQuoteCards.remove')} disabled={busy || !removable} onClick={onRemove}>
        <CloseIcon />
      </button>
    </li>
  )
}

// What the page holds besides what is written, kept while the app runs so switching to one agent
// and back finds the members as they were.
type Settings = { members: Draft[]; chair: number; rounds: number; anonymous: boolean; requirements: string }
let kept: Settings | null = null

function membersFor(installed: readonly AgentKind[], carry: DraftCarry | null): Draft[] {
  const first = carry?.agent ?? installed[0] ?? 'claude'
  const second = installed.find((agent) => agent !== first) ?? first
  return [
    { key: crypto.randomUUID(), agent: first, ...(carry?.model ? { model: carry.model } : {}), name: null, role: '' },
    { key: crypto.randomUUID(), agent: second, name: null, role: '' }
  ]
}

function settingsFrom(from: Discussion): Settings {
  return {
    members: from.members.map((member) => ({ key: crypto.randomUUID(), agent: member.agent, model: member.model ?? undefined, effort: member.effort ?? undefined, name: member.name, role: member.role })),
    chair: Math.max(0, from.members.findIndex((member) => member.id === from.chairId)),
    rounds: from.maxRounds,
    anonymous: from.anonymous,
    requirements: from.requirements ?? DEFAULT_DISCUSSION_REQUIREMENTS
  }
}

// The new page set to a group chat: the topic is written where a first message would be, the
// projects sit above it, and the members and options are in the middle. One begun from another
// group starts with its members, projects and options, for a topic of its own.
export function DiscussionDraft({ from }: { from: Discussion | null }) {
  const installed = useInstalledAgents()
  const sendKey = useShortcutLabel('send-message')
  const width = usePreferences((p) => p.chatWidth)
  const typeface = useChatTypeface()
  const requirementsSupported = useDiscussionRequirementsSupported()
  // From one agent's draft: what was written, its projects, and its agent as the first member.
  const [carry] = useState(() => useCore.getState().conversationDraftCarry)
  const requested = useCore((s) => s.conversationDraftProjects)
  const [settings] = useState<Settings>(() => from ? settingsFrom(from) : kept ?? {
    members: membersFor(installed, carry), chair: 0, rounds: DEFAULT_DISCUSSION_ROUNDS, anonymous: false, requirements: DEFAULT_DISCUSSION_REQUIREMENTS
  })
  const [topic, setTopic] = useState(() => carry?.text ?? '')
  const [projectPaths, setProjectPaths] = useState<string[]>(() => [...(from?.projectPaths ?? carry?.projects ?? requested?.paths ?? [])])
  const [members, setMembers] = useState<Draft[]>(settings.members)
  const [chair, setChair] = useState(settings.chair)
  const [rounds, setRounds] = useState(settings.rounds)
  const [anonymous, setAnonymous] = useState(settings.anonymous)
  const [requirements, setRequirements] = useState(settings.requirements)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!from) kept = { members, chair, rounds, anonymous, requirements } }, [from, members, chair, rounds, anonymous, requirements])
  // Images wait in one agent's draft: a group chat takes none.
  const [imagesLeft] = useState(() => composerDraft(null).images.length)
  // Names in use more than once would make @ ambiguous.
  const names = members.map((member) => (member.name ?? defaultMemberName(member.agent, member.model ?? null)).trim())
  const clash = names.find((name, index) => names.indexOf(name) !== index)
  const canStart = !busy && topic.trim() !== '' && members.length >= MIN_DISCUSSION_MEMBERS && !clash && names.every(Boolean)

  const update = (index: number, next: Draft) => setMembers(members.map((each, at) => (at === index ? next : each)))
  const add = () => setMembers([...members, { key: crypto.randomUUID(), agent: installed[members.length % Math.max(installed.length, 1)] ?? 'claude', name: null, role: '' }])
  const remove = (index: number) => {
    setMembers(members.filter((_, at) => at !== index))
    setChair((current) => (current === index ? 0 : current > index ? current - 1 : current))
  }
  const first = members[0]
  const toSingle = (): DraftCarry => ({ text: topic, projects: projectPaths, agent: first?.agent ?? null, model: first?.model ?? null })
  const start = async () => {
    if (!canStart) return
    setBusy(true)
    const created = await createDiscussion({
      topic: topic.trim(),
      ...(requirementsSupported ? { requirements: requirements.trim() } : {}),
      projectPaths,
      members: members.map((member, index) => ({
        agent: member.agent,
        ...(member.model ? { model: member.model } : {}),
        ...(member.effort ? { effort: member.effort } : {}),
        name: names[index] ?? agentLabel(member.agent),
        role: member.role.trim()
      })),
      chair,
      maxRounds: rounds,
      anonymous
    })
    setBusy(false)
    if (!created) return
    kept = null
    void loadDiscussionPosts(created.id)
    selectDiscussion(created.id)
  }
  const startLabel = [t('DiscussionDraft.startDiscussion'), sendKey].filter(Boolean).join(' · ')
  return (
    <section className="detail terminal-view conversation-view" aria-label={t('DiscussionDraft.newGroupChat')}>
      <header className="detail-header conversation-header">
        <span className="terminal-view-title">{t('DiscussionDraft.newGroupChat')}</span>
        <div className="toolbar">
          <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={closeConversationDraft}><CloseIcon /></button>
        </div>
      </header>
      <div className="terminal-body">
        <div className="chat-view" data-width={width} {...typeface}>
          <div className="chat-list chat-draft">
            <div className="chat-draft-start discussion-draft-start">
              <DraftModeSwitch mode="group" carry={toSingle} disabled={busy} />
              {from && <p className="discussion-draft-from">{tr('DiscussionDraft.reuseMembersProjectsAndSettingsFromEachMember', { value1: from.title })}</p>}
              <p className="chat-draft-hint muted">{t('DiscussionDraft.agentsFirstAnswerIndependentlyThenReviewChallengeOr')}</p>
              <div className="discussion-draft-field">
                <ul className="discussion-draft-members" aria-label={t('DiscussionDraft.members')}>
                  {/* What each column of a member is: the name most of all, as it is what @ picks it by. */}
                  <li className="discussion-draft-member discussion-draft-member-head" aria-hidden="true">
                    <span />
                    <span>Agent</span>
                    <span>{t('AgentModelPicker.model')}</span>
                    <span>{t('DiscussionDraft.nameForMentions')}</span>
                    <span>{t('DiscussionDraft.positionOrPerspective')}</span>
                    <span />
                    <span />
                  </li>
                  {members.map((member, index) => (
                    <MemberRow
                      key={member.key}
                      member={member}
                      index={index}
                      agents={installed}
                      chair={chair === index}
                      busy={busy}
                      removable={members.length > MIN_DISCUSSION_MEMBERS}
                      onChange={(next) => update(index, next)}
                      onRemove={() => remove(index)}
                      onChair={() => setChair(index)}
                    />
                  ))}
                </ul>
                {members.length < MAX_DISCUSSION_MEMBERS && (
                  <button type="button" className="link-button discussion-draft-add" disabled={busy} onClick={add}>{t('DiscussionDraft.addMember')}</button>
                )}
                {clash && <p className="discussion-draft-error">{tr('DiscussionDraft.twoMembersAreNamedRenameOneSoThey', { clash: clash })}</p>}
              </div>
              <div className="discussion-draft-settings" data-open={optionsOpen || undefined}>
                <button type="button" className="discussion-draft-settings-toggle" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(!optionsOpen)}>
                  <ChevronDownIcon />
                  {t('DiscussionDraft.settingsSummary', { rounds, anonymous: anonymous ? t('DiscussionDraft.anonymousShort') : '', requirements: requirements.trim() === DEFAULT_DISCUSSION_REQUIREMENTS ? t('DiscussionDraft.defaultRequirements') : requirements.trim() ? t('DiscussionDraft.customRequirements') : t('DiscussionDraft.noRequirements') })}
                </button>
                {optionsOpen && (
                  <div className="discussion-draft-settings-body">
                    {requirementsSupported && <DiscussionRequirements value={requirements} onChange={setRequirements} disabled={busy} />}
                    <div className="discussion-draft-options">
                      <span className="discussion-draft-rounds">{tr('DiscussionDraft.upToSummarizeEarlyWhenPositionsRemainUnchanged', { value1: <ChatPicker
                          label={t('DiscussionDraft.maximumRounds')}
                          value={String(rounds)}
                          placeholder={t('DiscussionDraft.rounds', { rounds: rounds })}
                          placement="above"
                          disabled={busy}
                          options={Array.from({ length: MAX_DISCUSSION_ROUNDS }, (_, index) => ({ value: String(index + 1), label: t('DiscussionDraft.rounds_823', { value1: index + 1 }) }))}
                          onChange={(value) => setRounds(Number(value))}
                        /> })}</span>
                      <label data-tooltip={t('DiscussionDraft.useMemberABWithoutRevealingAgentOr')}>{tr('DiscussionDraft.anonymousPeerReview', { value1: <input type="checkbox" checked={anonymous} disabled={busy} onChange={(event) => setAnonymous(event.target.checked)} /> })}</label>
                    </div>
                  </div>
                )}
              </div>
              {imagesLeft > 0 && <p className="chat-draft-hint muted">{t('DiscussionDraft.imagesStayBehind', { count: imagesLeft })}</p>}
            </div>
          </div>
          <div className="chat-dock">
            <div className="chat-dock-header chat-draft-projects">
              <ProjectPicker projects={projectPaths.map((path) => ({ path, worktreePath: null }))} onChange={setProjectPaths} locked={busy} />
            </div>
            <div className="chat-input-card" data-working={busy || undefined}>
              <textarea
                className="chat-input"
                rows={3}
                autoFocus
                value={topic}
                disabled={busy}
                maxLength={20000}
                aria-label={t('DiscussionDraft.topic')}
                placeholder={t('DiscussionDraft.whatShouldBeDiscussedDescribeTheQuestionAnd')}
                onChange={(event) => setTopic(event.target.value)}
                onKeyDown={(event) => {
                  if (!sendsMessage(event)) return
                  event.preventDefault()
                  void start()
                }}
              />
              <div className="chat-options">
                <span className="discussion-draft-readonly" data-tooltip={t('DiscussionDraft.membersReadOnlyHint')}>{t('DiscussionDraft.membersReadOnly')}</span>
                <span className="chat-options-note muted">{t('DiscussionDraft.rounds_823', { value1: rounds })}</span>
                <span className="chat-dock-spacer" />
                <button type="button" className="button primary discussion-draft-start" data-tooltip={startLabel} data-tooltip-side="top-end" disabled={!canStart} onClick={() => void start()}>
                  {busy ? t('DiscussionDraft.starting') : t('DiscussionDraft.startDiscussion')}
                  <EnterIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
