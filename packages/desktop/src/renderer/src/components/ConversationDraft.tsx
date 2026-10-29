import { useComposerInsertions } from '../composer-insertions'
import { mergeComposerImages } from '../browser-context'
import { useShortcutLabel } from '../keyboard-shortcuts'
import { getLocale, t, tr } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import { agentDescriptor, ChatPermissionMode, type AgentKind, type ChatCatalog } from '@antumi/protocol'
import { closeConversationDraft, perform, selectConversation, useChatImagesSupported, useChatOptionsSupported, useConversationWorktreesSupported, useCore, useSourceInvestigateSupported, useStartBranchSupported } from '../core-store'
import { OtherProjectsHint } from './OtherProjectsHint'
import { ConversationTip } from './ConversationTip'
import { defaultAgent } from '../default-agent'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { antumiEntries } from '../chat-commands'
import { AgentQuotaHint, confirmQuota, modelText, RecommendedMark, useRecommendation } from './AgentQuota'
import { usePreferences } from '../preferences'
import { useChatTypeface } from '../chat-typeface'
import { openWithFirstMessage, startOptions } from './ConversationActions'
import { sendsMessage } from './ChatComposer'
import { ChatAddMenu, ChatImageStrip, useComposerImages } from './ChatImages'
import { useChatCommandMenu } from './ChatCommandMenu'
import { useChatMentionMenu } from './ChatMentionMenu'
import { MentionField, useMentionedText } from './ChatMentionField'
import { messageReferences, writeMentionedText } from '../chat-mentions'
import { defaultStartMode, effortLabel, modeOptions, modeTone, startModes } from './ChatOptionsBar'
import { ChatModelPicker, ChatPicker } from './ChatPicker'
import { AgentIcon, CloseIcon, EnterIcon } from './icons'
import { ProjectPicker } from './ProjectPicker'
import { DraftBranchPicker, useProjectBranches } from './DraftBranchPicker'
import { composerDraft, EMPTY_DRAFT, saveComposerDraft } from '../composer-drafts'
import { inboxKey, rememberInvestigationProjects } from '../source-inboxes'
import { catalogKey, providerFor } from '../model-provider-choice'
import { ProviderPicker } from './ProviderPicker'

// A new conversation while chats are the default: the agent and projects are picked on the page,
// and the first message creates the conversation and starts the agent, so none is left empty.
// Opened on an inbox issue, it looks into that issue: the agent reads it first, in a mode that only
// reads and plans unless another is picked, and the message is what the user adds, if anything.
export function ConversationDraft() {
  const sendKey = useShortcutLabel('send-message')
  const sendLabel = [t('ChatComposer.send'), sendKey].filter(Boolean).join(' · ')
  const sendHint = sendKey ? t('ChatComposer.sendKeyHint', { keys: sendKey }) : ''
  const investigateLabel = [t('ConversationDraft.investigateEnter'), sendKey].filter(Boolean).join(' · ')
  const installed = useInstalledAgents()
  const recommendation = useRecommendation(installed)
  const from = useCore((s) => s.conversationDraftFrom)
  const draftProfileId = useCore((state) => state.draftProfileId)
  const profiles = useCore((state) => state.agentProfiles)
  const [profileId, setProfileId] = useState<string | null>(draftProfileId)
  const profile = profileId ? profiles[profileId] : null
  const initial = from?.configuration
  const composerId = from?.key ?? null
  // Unset when nothing settles it, for each start to pick.
  const [agent, setAgent] = useState<AgentKind | null>(() => (draftProfileId ? profiles[draftProfileId]?.agent : null) ?? initial?.agent ?? defaultAgent(useCore.getState().tasks, useCore.getState().conversations))
  // Asked for again while the page is open (another project's ＋), it takes the new ones.
  const requested = useCore((s) => s.conversationDraftProjects)
  const [projectPaths, setProjectPaths] = useState<string[]>(() => [...(requested?.paths ?? [])])
  useEffect(() => { if (requested) setProjectPaths([...requested.paths]) }, [requested])
  const investigateSupported = useSourceInvestigateSupported()
  const draftIssue = useCore((s) => s.conversationDraftIssue)
  const issue = investigateSupported ? draftIssue : null
  const [worktree, setWorktree] = useState(false)
  const [draft] = useState(() => composerDraft(composerId))
  const { value, setText, setValue } = useMentionedText({ text: draft.text, mentions: draft.mentions })
  const { text } = value
  const [busy, setBusy] = useState(false)
  // Kept per agent, so switching back finds the mode picked for it.
  const [modes, setModes] = useState<Partial<Record<AgentKind, ChatPermissionMode>>>(() => {
    const mode = ChatPermissionMode.safeParse(initial?.permissionMode)
    return initial && mode.success ? { [initial.agent]: mode.data } : {}
  })
  // A model or effort left unpicked is the agent's own default, which the start does not pass.
  const [picks, setPicks] = useState<Partial<Record<AgentKind, { model?: string; effort?: string }>>>(() => initial ? {
    [initial.agent]: { model: initial.model ?? undefined, effort: initial.effort ?? undefined }
  } : profile ? { [profile.agent]: { model: profile.model ?? undefined, effort: profile.effort ?? undefined } } : {})
  // The model provider picked, for whichever agent it serves; null is the agent's own account.
  const [providerId, setProviderId] = useState<string | null>(() => profile?.modelProvider ?? initial?.modelProvider ?? null)
  const providers = useCore((s) => s.modelProviders)
  const providerOf = (kind: AgentKind | null) => providerFor(providers, providerId, kind)
  // Each agent's models (a provider's where it runs on one), asked for once it is picked; absent
  // while asking, null when core cannot say.
  const [catalogs, setCatalogs] = useState<Record<string, ChatCatalog | null>>({})
  const rpc = useCore((s) => s.rpc)
  const deferStart = rpc?.features.includes('deferred-conversation-start') ?? false
  const optionsSupported = useChatOptionsSupported()
  const imagesSupported = useChatImagesSupported()
  const worktreesSupported = useConversationWorktreesSupported()
  const inWorktree = worktree && worktreesSupported && projectPaths.length > 0
  // The primary project's branch: where its worktree starts, or what it is switched to; null keeps
  // the one checked out. Picked again for each primary.
  const startBranchSupported = useStartBranchSupported()
  const primary = startBranchSupported ? (projectPaths[0] ?? null) : null
  const branches = useProjectBranches(primary)
  const [branch, setBranch] = useState<string | null>(null)
  useEffect(() => setBranch(null), [primary])
  const startBranch = branches.options?.git ? branch : null
  const attached = useComposerImages(draft.images)
  useComposerInsertions(composerId, (insertion) => {
    setText((current) => [current, insertion.text].filter(Boolean).join('\n\n'))
    attached.setImages((current) => mergeComposerImages(current, insertion.images))
  })
  useEffect(() => saveComposerDraft(composerId, { ...value, images: attached.images }), [composerId, value, attached.images])
  const width = usePreferences((s) => s.chatWidth)
  const typeface = useChatTypeface()
  // Only the user's own commands: the agent has not started to say what it takes.
  const chatCommands = useCore((s) => s.chatCommands)
  const commandEntries = useMemo(() => antumiEntries(chatCommands, projectPaths), [chatCommands, projectPaths, getLocale()])
  const commandMenu = useChatCommandMenu({ text, entries: commandEntries, agentLabel: agent ? agentLabel(agent) : '', setText, sendCommand: () => {} })
  // The agent will work in the first project picked.
  const mentionMenu = useChatMentionMenu({ value, setText, setValue, roots: projectPaths, cwd: projectPaths[0] ?? null, agent })
  // Written out for the agent picked when it goes, which may not be the one picked before.
  const writtenMessage = agent ? writeMentionedText(value, agent) : { text, references: [] }
  const written = writtenMessage.text

  const provider = providerOf(agent)
  const key = agent ? catalogKey(agent, provider) : null
  useEffect(() => {
    if (!agent || !key || !rpc || !optionsSupported || key in catalogs) return
    let current = true
    const settle = (catalog: ChatCatalog | null) => current && setCatalogs((known) => ({ ...known, [key]: catalog }))
    // Not through perform: an older core without the method just offers no models.
    rpc.call('conversations.chatCatalog', { agent, ...(provider ? { modelProvider: provider.id } : {}) }).then(settle, () => settle(null))
    return () => { current = false }
  }, [agent, key, provider, rpc, optionsSupported, catalogs])

  const catalog = key ? catalogs[key] : null
  const pick = (agent ? picks[agent] : undefined) ?? {}
  const modelId = pick.model ?? catalog?.models.find((each) => each.isDefault)?.id ?? null
  const model = catalog?.models.find((each) => each.id === modelId)
  const efforts = model?.efforts ?? []
  // A mode the model or settings no longer allow falls back to that agent's available default.
  const offeredModes = agent ? startModes(agent, model) : []
  const chosenMode = agent ? modes[agent] : undefined
  // Looking into an issue starts where the agent only reads, as a group chat member does.
  const reading = agent && issue && offeredModes.includes(agentDescriptor(agent).discussionMode) ? agentDescriptor(agent).discussionMode : null
  const mode = profile?.capability === 'readOnly' && agent ? agentDescriptor(agent).readOnlyMode : agent ? (chosenMode && offeredModes.includes(chosenMode) ? chosenMode : reading ?? defaultStartMode(agent, offeredModes)) : null
  const effort = pick.effort && (!catalog || efforts.includes(pick.effort)) ? pick.effort : null
  const settingsLoading = Boolean(initial && agent && optionsSupported && catalog === undefined)
  const canSend = agent !== null && !busy && !settingsLoading && attached.uploading === 0 && (issue !== null || text.trim() !== '' || attached.images.length > 0)
  // The model a start would run, as quota windows name models; unknown until its catalog is in.
  const modelFor = (kind: AgentKind) => {
    const models = catalogs[catalogKey(kind, providerOf(kind))]?.models ?? []
    const id = picks[kind]?.model ?? models.find((each) => each.isDefault)?.id
    return modelText(models.find((each) => each.id === id))
  }
  const choose = (next: { model?: string; effort?: string }) => {
    if (agent) setPicks({ ...picks, [agent]: next })
  }

  const chosen = {
    ...(optionsSupported ? { permissionMode: mode ?? undefined, ...(pick.model ? { model: pick.model } : {}), ...(effort ? { effort } : {}) } : {}),
    ...(provider ? { modelProvider: provider.id } : {}),
    ...(profile ? { profileId: profile.id } : {})
  }
  // A start on a provider spends its plan, not the agent's own quota.
  const quotaAllows = (kind: AgentKind) => providerOf(kind) !== null || confirmQuota(kind, modelFor(kind))
  const where = { projectPaths, ...(inWorktree ? { worktree: true } : {}), ...(startBranch ? { branch: startBranch } : {}) }
  // The page is how a chat start begins, as settings choose; a terminal start has its dialog.
  const create = () => {
    if (!agent || !quotaAllows(agent)) return Promise.resolve(null)
    return perform((rpc) => rpc.call('conversations.create', { agent, ...where, ...(deferStart ? { deferStart: true } : {}), ...startOptions(), ...chosen }))
  }
  // Core fetches the issue and starts the agent on it before answering, so the page waits.
  const investigate = async () => {
    if (!agent || !issue || !quotaAllows(agent)) return
    setBusy(true)
    const note = written.trim()
    const opened = await perform((rpc) => rpc.call('sources.investigate', {
      provider: issue.provider, instance: issue.instance, key: issue.key, agent, ...where, ...(note ? { note } : {}), ...(rpc.features.includes('chat-references') ? { references: messageReferences(writtenMessage, note) } : {}), ...startOptions(), ...chosen
    }))
    if (!opened) {
      setBusy(false)
      return
    }
    rememberInvestigationProjects(inboxKey(issue), projectPaths)
    // Images go nowhere here, so any already attached wait for the next new conversation.
    saveComposerDraft(composerId, { ...EMPTY_DRAFT, images: attached.images })
    useCore.setState((state) => ({ conversations: { ...state.conversations, [opened.id]: opened }, conversationDraftIssue: null }))
    selectConversation(opened.id)
  }
  // Open before launching; the first message keeps its own delivery and retry state.
  const send = async () => {
    const expanded = commandMenu.expand(written)
    if (expanded !== null) {
      setText(expanded)
      return
    }
    if (!canSend) return
    if (issue) return investigate()
    setBusy(true)
    const created = await create()
    if (created) {
      if (await openWithFirstMessage(created, written.trim(), attached.images, deferStart, messageReferences(writtenMessage, written.trim()))) saveComposerDraft(composerId, EMPTY_DRAFT)
      return
    }
    setBusy(false)
  }
  return (
    <section className="detail terminal-view conversation-view" aria-label={t('ConversationDraft.newConversation')}>
      <header className="detail-header conversation-header">
        <span className="terminal-view-title">{issue ? t('ConversationDraft.investigateIssue') : t('ConversationDraft.newConversation')}</span>
        <div className="toolbar">
          <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={closeConversationDraft}><CloseIcon /></button>
        </div>
      </header>
      <div className="terminal-body">
        <div className="chat-view" data-width={width} {...typeface}>
          <div className="chat-list chat-draft">
            <div className="chat-draft-start">
              {issue && (
                <div className="chat-draft-issue">
                  <span className="muted">{tr('ConversationDraft.investigate', { value1: issue.source })}</span>
                  <a className="chat-draft-issue-key" href={issue.url} target="_blank" rel="noreferrer" data-tooltip={t('ConversationDraft.openIn', { value1: issue.source })}>{issue.key}</a>
                  <span className="chat-draft-issue-title" title={issue.title}>{issue.title}</span>
                  <button type="button" className="tool-button" aria-label={t('ConversationDraft.stopInvestigatingThisIssue')} data-tooltip={t('ConversationDraft.switchToRegularConversation')} disabled={busy}
                    onClick={() => useCore.setState({ conversationDraftIssue: null })}><CloseIcon /></button>
                </div>
              )}
              <h2 className="chat-draft-title">{from ? t('ConversationDraft.startANewConversation') : t('ConversationDraft.chooseAnAgentToStart')}</h2>
              {/* Starting is one choice, the agent below; one of the user's own agents comes along only
                  from its card on the agents page, and goes with the ×. */}
              {!issue && profile && (
                <div className="chat-draft-issue chat-draft-profile">
                  <span className="muted">{t('ConversationDraft.usingAgent')}</span>
                  <span className="chat-draft-issue-title" title={profile.description || undefined}>{profile.name}</span>
                  <button type="button" className="tool-button" aria-label={t('AgentProfiles.noRole')} data-tooltip={t('AgentProfiles.noRole')} disabled={busy}
                    onClick={() => setProfileId(null)}><CloseIcon /></button>
                </div>
              )}
              <div className="chat-draft-agents" role="radiogroup" aria-label="agent">
                {installed.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={agent === kind}
                    className="chat-draft-agent"
                    disabled={busy}
                    onClick={() => { setAgent(kind); setProfileId(null) }}
                  >
                    <AgentIcon agent={kind} />
                    <span>{agentLabel(kind)}</span>
                    {providerOf(kind) ? <span className="chat-draft-agent-provider">{providerOf(kind)?.name}</span> : (
                      <>
                        {recommendation?.agent === kind && <RecommendedMark recommendation={recommendation} />}
                        <AgentQuotaHint agent={kind} model={modelFor(kind)} />
                      </>
                    )}
                  </button>
                ))}
              </div>
              <p className="chat-draft-hint muted">
                {issue
                  ? t('ConversationDraft.agentReadsTheOriginalIssueAndInvestigatesIn')
                  : from ? t('ConversationDraft.usingTheConfigurationOfWithAFreshConversation', { value1: from.title }) : t('ConversationDraft.sendingTheFirstMessageCreatesTheConversationAnd')}
              </p>
              <OtherProjectsHint agent={agent} projectCount={projectPaths.length} />
              {!issue && <ConversationTip agent={agent} agents={installed.length} images={imagesSupported} />}
            </div>
          </div>
          <div className="chat-dock">
            <div className="chat-dock-header chat-draft-projects">
              <ProjectPicker projects={projectPaths.map((path) => ({ path, worktreePath: null }))} onChange={setProjectPaths} locked={busy} />
              {branches.options?.git && (
                <DraftBranchPicker
                  options={branches.options}
                  picked={branch}
                  worktree={inWorktree}
                  locked={busy}
                  onOpen={branches.refresh}
                  onPick={setBranch}
                />
              )}
              {projectPaths.length > 0 && worktreesSupported && (
                <label
                  className="chat-draft-worktree"
                  data-tooltip-side="top"
                  data-tooltip={startBranchSupported
                    ? t('ConversationDraft.createABranchAndWorktreeForEachProject')
                    : t('ConversationDraft.createABranchAndWorktreeFromEachProject')}
                >{tr('ConversationDraft.newWorktree', { value1: <input type="checkbox" checked={worktree} disabled={busy} onChange={(event) => setWorktree(event.target.checked)} /> })}</label>
              )}
            </div>
            <div
              className="chat-input-card"
              data-working={busy || undefined}
              onDragOver={imagesSupported ? attached.handlers.onDragOver : undefined}
              onDrop={imagesSupported ? attached.handlers.onDrop : undefined}
            >
              {commandMenu.menu}
              {mentionMenu.menu}
              {imagesSupported && !issue && <ChatImageStrip images={attached.images} uploading={attached.uploading} onRemove={attached.remove} />}
              <MentionField
                value={value}
                setValue={setValue}
                {...commandMenu.inputProps}
                {...mentionMenu.inputProps}
                autoFocus
                readOnly={busy}
                aria-label={t('ConversationDraft.firstMessage')}
                placeholder={!agent ? t('ConversationDraft.chooseAnAgentAboveFirst') : issue ? t('ConversationDraft.additionalInstructionsOptionalEnterToInvestigate', { send: sendHint }) : t('ConversationDraft.sendTheFirstMessageToEnterToSend', { value1: agentLabel(agent), send: sendHint })}
                onPasteCapture={imagesSupported ? attached.handlers.onPaste : undefined}
                onKeyDownCapture={(event) => {
                  if (commandMenu.onKeyDown(event) || mentionMenu.onKeyDown(event) || !sendsMessage(event)) return
                  event.preventDefault()
                  void send()
                }}
              />
              <div className="chat-options">
                {imagesSupported && !issue && <ChatAddMenu disabled={busy} onAdd={attached.add} />}
                {agent && (
                  <ProviderPicker agent={agent} value={providerId} disabled={busy || Boolean(profile)} onChange={(next) => {
                    // Models differ between accounts, so what was picked for the old one goes.
                    setProviderId(next)
                    setPicks({})
                  }} />
                )}
                {agent && optionsSupported && (
                  <>
                    <ChatPicker
                      label={t('ChatHandoff.permissionMode')}
                      value={mode}
                      placeholder={t('ChatHandoff.permissionMode')}
                      options={modeOptions(agent, offeredModes)}
                      tone={modeTone(mode)}
                      disabled={busy || profile?.capability === 'readOnly'}
                      onChange={(value) => {
                        const picked = ChatPermissionMode.safeParse(value)
                        if (picked.success) setModes({ ...modes, [agent]: picked.data })
                      }}
                    />
                    <span className="chat-dock-spacer" />
                    {catalog === undefined && <span className="chat-options-note muted">{t('AgentModelPicker.loadingModels')}</span>}
                    {catalog && (
                      <ChatModelPicker
                        models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
                        model={modelId}
                        effort={effort}
                        disabled={busy}
                        onModel={(value) => {
                          const next = catalog.models.find((each) => each.id === value)
                          // An effort the new model does not take goes with the old one.
                          if (next) choose({ model: next.id, effort: pick.effort && next.efforts.includes(pick.effort) ? pick.effort : undefined })
                        }}
                        onEffort={(value) => choose({ ...pick, effort: value })}
                      />
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="chat-input-button" data-tooltip-side="top-end"
                  aria-label={sendLabel}
                  data-tooltip={busy && agent ? (issue ? t('ConversationDraft.readingIssueAndStarting', { value1: agentLabel(agent) }) : inWorktree ? t('ConversationDraft.creatingWorktreeAndStarting', { value1: agentLabel(agent) }) : t('ChatComposer.starting', { value1: agentLabel(agent) })) : issue ? investigateLabel : sendLabel}
                  disabled={!canSend}
                  onClick={() => void send()}
                >
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
