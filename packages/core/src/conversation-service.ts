import { applyActiveAgentProxy, blankProxyUnset, refreshActiveAgentProxy } from './agent-proxy'
import type { ChatReference, AgentProfile, SkillRef } from '@antumi/protocol'
import { agentCliAccess } from './agent-cli-access'
import { limitChatPage } from './chat-page-limit'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { mkdir, realpath, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { branchSwitchMessage, withoutBranchSwitchNote, chatReferencesFor, canHaveHelper, helperAllowsMode, isHelper, agentDescriptor, agentSupportsReadOnly, modelPrice, providerEndpoint, type CostBaseline, checkEditAdditionalProjects, checkSwitchBranch, handoffMessage, isPlanApproval, parseHandoffMessage, MAX_TASK_REPOS, type AgentKind, type ChatCatalog, type ChatImage, type ChatItem, type ChatModel, type ChatOption, type ChatSettings, type CommitPushResult, type CommitResult, type PushResult, type Conversation, type ConversationMessage, type ConversationSearchHit, type ConversationStage, type FileDiff, type FolderChanges, type ProjectBranches, type ProjectHead, type ChatDecision, type KnowledgeBase, type TaskSource, type UnattendedMode, type ChatPermissionMode, startModes, unattendedPermission, isAntumiRequest , PROCESS_OWNER_ENV, processOwner, parseProcessOwner } from '@antumi/protocol'
import type { DaemonEvent, SessionInfo } from '@antumi/protocol/node'
import { ALLOW_SITE_ALWAYS, canReuseConversation, DEFAULT_ACCOUNT, type ConversationChannel, type ConversationConfiguration, type TaskLaunchOptions } from '@antumi/protocol'
import { channelPrompt } from './channel-prompt'
import type { RunMeasure } from './agent-run-store'
import type { AttachmentStore } from './attachment-store'
import { WHOLE_SESSION_FORK, type ChatAnswer, type StageMessage } from './chat-driver'
import { catalogOf, probeChatCatalog } from './chat-catalog'
import { ChatHost, type ChatStage } from './chat-host'
import { ChatLog, type LoggedRecord } from './chat-log'
import { chatDeliveryStatus } from './chat-delivery-status'
import type { Transcript } from './agent-transcripts'
import type { SessionHost } from './daemon-client'
import { ConversationStore } from './conversation-store'
import { folderChanges, folderDiff, folderHead } from './conversation-changes'
import { adapterOf, checkUnattended } from './agents'
import type { AgentAdapter, AgentLaunch, AgentStage, CancelGrace } from './agents/agent-adapter'
import type { AgentMcpServer, McpServer } from './agent-command'
import { chatCommand } from './conversation-command'
import { foldersInUse, launchDir, launchLeftovers, launchRoot, removeLaunch, type StageRef } from './stage-launch'
import { searchSnippet } from './conversation-search'
import { buildHandoff } from './conversation-handoff'
import { SCHEDULED_GO_TEXT, UNATTENDED_NOTE } from './agent-prompt'
import { UNATTENDED_QUESTION_WAIT_MS, channelAnswer, unattendedAnswer } from './unattended-answer'
import { branchHolders, createProjectBranch, projectBranches, switchProjectBranch } from './project-branches'
import { resolveStart } from './task-start'
import { commitAll, commitAndPush, pushBranch } from './project-commit'
import type { ProjectRegistry } from './project-registry'
import { Rejection } from './rejection'
import type { UsageReport } from './usage-source'
import { normalizeRepoPath, prepareConversationWorktrees, projectHead, restoreWorktree } from './workspace'
import type { NewWorktree, WorktreeSetup } from './worktree-setup'
import { DEFAULT_AGENT_CONCURRENCY } from './chat-settings'
import { WireLog } from './wire-log'
import { ConversationTitles, type TitleGenerator } from './conversation-titles'
import { conversationRoute, decideRoute, providerLaunch, sameRoute, type RouteDecision } from './conversation-route'
import type { ModelProviderStore } from './model-providers'
import type { AccountLaunch, AgentAccountStore } from './agent-accounts'
import type { ProviderLaunch } from './provider-launch'
import type { QuickProvider } from './quick-request'
import { FREED_ATTACHMENT_GRACE_MS, type AttachmentSweeper } from './attachment-sweep'

export type ConversationEvent =
  | { type: 'changed'; conversation: Conversation }
  | { type: 'deleted'; id: string }
  | { type: 'chatItems'; conversationId: string; items: ChatItem[] }
  | { type: 'importedItems'; conversationId: string; items: ChatItem[]; replaceStage?: string }
  | { type: 'prompt'; conversationId: string; stageId: string; ref: string }
  | { type: 'chatDelta'; conversationId: string; stageId: string; itemId: string; append: string }
  // A plan approved in a task's chat, for the task to keep as the one it carries out.
  | { type: 'planApproved'; taskId: string; plan: { markdown: string; agent: AgentKind; stageId: string; requestId: string } }
  // A running chat agent reported its account's limits.
  | { type: 'usage'; agent: AgentKind; account: string; report: UsageReport }

type UnattendedRun = { mode: UnattendedMode; permission: ChatPermissionMode; reads?: 'allow' | 'only' }
type AutomaticInvestigationHooks = { owns(id: string): boolean; takeover(id: string): void; unattended?(id: string): UnattendedRun | null }
export type ChatStageRef = { conversationId: string; taskId: string | null; stageId: string; agent: AgentKind; ended: boolean }

// How a task's chat starts a stage: where its agent works (worktrees once the task runs, its projects
// while it only plans), and whether it goes on with the last session or takes one of its own (a first
// start, or planning giving way to carrying the plan out).
// What a model choice holds: see TaskLaunchOptions.
export type ModelChoice = Pick<TaskLaunchOptions, 'model' | 'effort'>
// What an agent takes over with on a handoff; each left out stays as the chat last had it.
// modelProvider: the provider it runs on from here, null its own account.
export type HandoffChoice = Pick<TaskLaunchOptions, 'permissionMode' | 'model' | 'effort'> & { references?: ChatReference[]; images?: readonly string[]; modelProvider?: string | null }

export type TaskChatLaunch = TaskLaunchOptions & {
  profile?: AgentProfile
  cwd: string
  extraDirs: readonly string[]
  // The task's reference projects, which the agent may read but never edit.
  referenceDirs?: readonly string[]
  planOnly: boolean
  workspaceReadOnly?: boolean
  session: 'new' | 'resume'
  // Files the agent may read without asking, such as the task's images.
  readable?: readonly string[]
  allowBypass?: boolean
  // What the user adds for the next agent when the task's agent changes on the way.
  handoffNote?: string
  // The provider the agent taking over runs on, null its own account (HandoffChoice.modelProvider).
  handoffProvider?: string | null
  references?: ChatReference[]
  images?: readonly string[]
  // The stage's first message. An agent going on from a handoff reads it there, in the turn the
  // handoff opens; otherwise it is sent once the agent is up.
  opening?: { text: string; imageIds: readonly string[] }
}

// What a stage's start takes beyond the agent: see TaskChatLaunch; moved says the agent works
// somewhere else than its last stage did.
// brief: a file written for the first stage to read before anything else, sent as a handoff is.
type StageLaunch = { skipProjectSetup?: boolean; ref?: string; fresh?: boolean; moved?: boolean; rerouted?: boolean; planOnly?: boolean; backend?: string | null; account?: string | null; readable?: readonly string[]; fork?: ForkPoint; opening?: string; brief?: string; references?: ChatReference[]; images?: readonly ChatImage[] }
// The provider session another conversation's stage ran, taken over through the turn `at` names;
// neither null means a session the agent can fork, else the fork starts afresh.
// latest: the point is the last the agent's session holds, so the session forked whole is the same.
// routeKey: the route that session was opened on (ProviderRoute.key), null on the agent's own account.
type ForkPoint = { providerSessionId: string | null; at: string | null; latest: boolean; routeKey: string | null }
type OpeningChat = { sessionId: string; stop: Promise<void> | null }
type PendingLaunch = { agent: AgentKind; opening: OpeningChat | null; finished: Promise<void> }

// A chat page stops adding older stages once it holds this many items.
const CHAT_PAGE_ITEMS = 1000
const STOP_GRACE_MS = 5000
const KILL_GRACE_MS = 2000
// How long a stage folder waits before it goes where no process can be seen using it, and how
// often one still in use is looked at again.
const LAUNCH_SWEEP_GRACE_MS = 30_000
// A chat agent left this long with nothing to do is let go (see releaseIdle).
const CHAT_IDLE_MS = 30 * 60_000

// Whether `promise` settles within `ms`.
function settles(promise: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    timer.unref()
    void promise.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

// Each an existing directory, by its real path and as picked; `taken` are real paths already in use.
async function resolveProjects(projectPaths: readonly string[], taken: readonly string[] = []): Promise<{ projects: string[]; picked: string[] }> {
  const projects: string[] = []
  const picked: string[] = []
  for (const rawPath of projectPaths) {
    const projectPath = normalizeRepoPath(rawPath)
    if (!(await stat(projectPath).catch(() => null))?.isDirectory()) {
      throw new Rejection('invalid-workspace', 'project must be an existing absolute directory')
    }
    const resolved = await realpath(projectPath)
    if (projects.includes(resolved) || taken.includes(resolved)) throw new Rejection('duplicate-project')
    projects.push(resolved)
    picked.push(projectPath)
  }
  return { projects, picked }
}

export class ConversationService {
  private importHooks: { before(id: string, agent: AgentKind, nativeId: string): Promise<void>; after(id: string): Promise<void> } | null = null
  setImportHooks(hooks: NonNullable<ConversationService['importHooks']>): void { this.importHooks = hooks }
  private delegationStatus: ((id: string) => Conversation['delegation']) | null = null
  setDelegationStatus(status: (id: string) => Conversation['delegation']): void { this.delegationStatus = status }
  refreshDelegation(id: string): void { const conversation = this.store.get(id); if (conversation) this.changed(conversation) }
  private delegationAvailable: ((id: string) => boolean) | null = null
  setDelegationAvailable(available: (id: string) => boolean): void { this.delegationAvailable = available }
  private callCleanup: ((id: string) => Promise<void>) | null = null
  setCallCleanup(cleanup: (id: string) => Promise<void>): void { this.callCleanup = cleanup }
  private squadGuard: ((conversation: Conversation) => void) | null = null
  setSquadGuard(guard: (conversation: Conversation) => void): void { this.squadGuard = guard }

  // Core's chat settings say; main hands them over before any stage starts.
  private promptSuggestions = false
  private userBrowser: boolean | undefined
  private userTodos = true
  private knowledgeBase: KnowledgeBase | null = null
  private readonly retiring = new Set<string>()
  private readonly launchReleases = new Map<string, Promise<void>>()
  private readonly launching = new Map<string, PendingLaunch>()
  // Issue conversations whose issue is being fetched, or failed to be (see openInvestigation).
  private readonly fetchingIssues = new Map<string, NonNullable<Conversation['preparing']>>()
  // Conversations whose last start took its opening into the handoff it began from.
  private readonly openedInHandoff = new Set<string>()
  private readonly gitSending = new Map<string, number>()
  private gitPreparation: (<T>(dirs: readonly string[], run: () => Promise<T>, requireIdle: boolean) => Promise<T>) | null = null
  setGitPreparation(prepare: <T>(dirs: readonly string[], run: () => Promise<T>, requireIdle: boolean) => Promise<T>): void { this.gitPreparation = prepare }
  private gitGuard: ((dirs: readonly string[]) => Promise<void>) | null = null

  isGitPending(id: string): boolean { return this.launching.has(id) || this.gitSending.has(id) }

  setGitGuard(guard: (dirs: readonly string[]) => Promise<void>): void { this.gitGuard = guard }
  private worktreeSetup: Pick<WorktreeSetup, 'requireTrusted' | 'setUp'> | null = null
  setWorktreeSetup(setup: Pick<WorktreeSetup, 'requireTrusted' | 'setUp'>): void { this.worktreeSetup = setup }

  // start: the project's head once a branch was checked out in it, where the conversation's work now begins.
  recordGitChange(id: string, project: string, branch: string, start?: string): void {
    const conversation = this.get(id)
    if (start && !conversation.taskId) this.store.setProjectStart(id, project, start)
    this.store.setSwitchedBranches(id, { ...this.store.switchedBranches(id), [project]: branch })
    this.changed(this.get(id))
  }
  private maxConcurrentAgents = 20
  private agentConcurrency: Partial<Record<AgentKind, number>> = {}
  private automaticInvestigation: AutomaticInvestigationHooks | null = null
  setAutomaticInvestigation(hooks: AutomaticInvestigationHooks): void { this.automaticInvestigation = hooks }

  private capacityReleased: (() => void) | null = null
  private readonly freshCatalogs = new Set<AgentKind>()
  private readonly catalogs = new Map<AgentKind, Promise<ChatCatalog | null>>()
  private readonly catalogProblems = new Map<AgentKind, { reason: string; message: string }>()
  private readonly chats: ChatHost
  private readonly titles: ConversationTitles
  // Sessions being stopped on purpose: their exit reads as a stop, not a crash.
  private readonly stopping = new Set<string>()
  private readonly exitWaiters = new Map<string, () => void>()
  // The stage folder each running agent's launch wrote to, by its daemon session (stage-launch.ts),
  // and the stages whose launch is under way, before the daemon names a session for them.
  private readonly launches = new Map<string, StageRef & { at: number }>()
  private readonly preparing = new Set<string>()
  // Stage folders no session here accounts for, kept until it is shown no process uses them: by
  // folder, since when it may go (where the platform cannot see who uses one).
  private readonly doubtful = new Map<string, number>()
  private doubtTimer: NodeJS.Timeout | null = null
  // Which folders running processes still name (stage-launch.ts); a test may stand in for the platform.
  inspectLaunches: (dirs: readonly string[]) => Promise<Set<string> | null> = (dirs) => foldersInUse(dirs)
  // Agents being stopped after a cancel they may not obey (AgentAdapter.turns.stopAfterCancel).
  private readonly cancelStops = new Map<string, Promise<void>>()
  // The tail of each conversation's sends and retries, for an agent that takes them one at a time.
  private readonly serialActions = new Map<string, Promise<void>>()
  // Antumi's own questions waiting on the user, by request id.
  private readonly asks = new Map<string, { resolve: (answer: ChatAnswer) => void; reject: (error: Error) => void }>()
  // Conversations a scheduled run is carrying out, by the mode it runs in: nobody is there, so
  // what their agents ask is answered as the mode says (unattendedAnswer) until the user acts in
  // them. Kept in memory: after a restart, a request waits for the user, as it always did.
  // permission: the agent's own mode the run works in (unattendedPermission), which an approved
  // plan returns to.
  private readonly unattended = new Map<string, UnattendedRun>()
  // Requests already answered that way, which the next items may still show as open.
  private readonly autoAnswered = new Set<string>()
  // Questions such a run's agent asked, waiting a while for the user before Antumi answers them
  // (UNATTENDED_QUESTION_WAIT_MS), by conversation and request id.
  private readonly heldQuestions = new Map<string, NodeJS.Timeout>()
  // How long such a question waits; a test may shorten it.
  questionWaitMs = UNATTENDED_QUESTION_WAIT_MS

  private sweeper: Pick<AttachmentSweeper, 'mentionedBy' | 'sweep'> | null = null

  constructor(
    private readonly store: ConversationStore,
    private readonly daemon: SessionHost,
    private readonly sessionsRoot: string,
    private readonly emit: (event: ConversationEvent) => void,
    private readonly projects: ProjectRegistry,
    private readonly attachments: AttachmentStore,
    // Antumi's MCP server for a conversation's agent, acting for that conversation; null leaves the
    // agent without Antumi's tools.
    private readonly mcp: ((conversationId: string) => McpServer) | null = null,
    // Where a conversation started in worktrees lays them out; null offers none.
    private readonly worktreesRoot: string | null = null,
    // Where chat stages' raw traffic goes while the user has it on; null keeps none.
    private readonly wire: WireLog | null = null
  ) {
    this.titles = new ConversationTitles(store, (conversation) => this.changed(conversation))
    this.chats = new ChatHost(daemon, sessionsRoot, attachments, {
      settled: (stage, items) => this.titles.observe(stage.conversationId, items),
      items: (conversationId, items) => {
        this.rememberMode(conversationId, items)
        this.rememberCatalog(conversationId, items)
        this.rememberContext(conversationId, items)
        this.settleAsks(items)
        this.emit({ type: 'chatItems', conversationId, items })
        this.answerUnattended(conversationId, items)
        this.refuseForChannel(conversationId, items)
      },
      delta: (conversationId, stageId, itemId, append) => this.emit({ type: 'chatDelta', conversationId, stageId, itemId, append }),
      messages: (stage, messages) => messages.forEach((message) => this.recordChatMessage(stage, message)),
      prompt: (stage, ref) => this.emit({ type: 'prompt', conversationId: stage.conversationId, stageId: stage.stageId, ref }),
      provider: (stage, providerSessionId) => this.store.setProviderSession(stage.stageId, providerSessionId),
      activity: (conversationId) => {
        const current = this.store.get(conversationId)
        if (current) this.changed(current)
      },
      offset: (stageId, end) => this.store.setChatOffset(stageId, end),
      // A stage on a provider reports the provider's limits, not the agent's account's; any other,
      // the limits of the account it runs on.
      usage: (stage, report) => {
        if (!stage.options.providerModels) this.emit({ type: 'usage', agent: stage.agent, account: this.store.stage(stage.stageId)?.account ?? DEFAULT_ACCOUNT, report })
      },
      turnStalled: (conversationId, sessionId) => {
        const agent = this.store.get(conversationId)?.agent
        const grace = agent ? adapterOf(agent).turns?.stopAfterCancel : undefined
        if (!grace) return
        this.stopping.add(sessionId)
        // ChatHost dispatches the cancel immediately after this callback; begin its grace
        // period in the following microtask so the cancellation is always first.
        queueMicrotask(() => { void this.stopAfterCancel(sessionId, grace) })
      },
      sessionLost: (stage, sessionId) => {
        this.store.endStage(stage.stageId, null)
        this.handleExit(sessionId, null)
      }
    }, Date.now, wire)
  }

  // Takes effect in running chats at once: off pauses their suggestions and takes away the one
  // showing; on resumes them in an agent started with them, and the rest have them from their next start.
  setPromptSuggestions(enabled: boolean): void {
    if (enabled === this.promptSuggestions) return
    this.promptSuggestions = enabled
    const showing = this.store.list().filter((conversation) => this.chats.suggestion(conversation.id) !== null)
    this.chats.pauseSuggestions(!enabled)
    showing.forEach((conversation) => this.changed(conversation))
  }

  // Read at each start: a running agent keeps what it started with.
  setUserBrowser(enabled: boolean): void {
    this.userBrowser = enabled
  }

  setUserTodos(enabled: boolean): void {
    this.userTodos = enabled
  }

  setTitleNaming(mode: NonNullable<ChatSettings['titleNaming']>): void { this.titles.setMode(mode) }
  setTitleGenerator(generate: TitleGenerator): void { this.titles.setGenerator(generate) }

  // Read at each start too.
  setKnowledgeBase(knowledgeBase: KnowledgeBase | null): void {
    this.knowledgeBase = knowledgeBase
  }

  // The skills bundle an agent's start gets, from the library, or null for none; asked at each
  // start. A bundle that cannot be built keeps no agent from starting: it is noted and left out.
  private skillsFor: ((agent: AgentKind, selected?: readonly SkillRef[] | null) => Promise<{ dir: string } | null>) | null = null
  // The user's MCP servers an agent's start gets beside Antumi's; asked at each start, like skills.
  // readOnly: for a group chat member, which gets only the servers' read-only tools.
  private userMcpFor: ((agent: AgentKind, readOnly: boolean, selected?: readonly string[] | null) => AgentMcpServer[]) | null = null
  setUserMcpProvider(provider: (agent: AgentKind, readOnly: boolean, selected?: readonly string[] | null) => AgentMcpServer[]): void {
    this.userMcpFor = provider
  }
  setSkillsProvider(provider: (agent: AgentKind, selected?: readonly SkillRef[] | null) => Promise<{ dir: string } | null>): void {
    this.skillsFor = provider
  }

  // What a conversation opened for a chat platform's asker starts with in place of everything
  // above: Antumi's MCP server serving only these tools. Without it none can start.
  // A locked-down agent's tools and what it is told of them, as its channel gives them now.
  private channelTools: { mcp(conversationId: string): McpServer; tools(conversationId: string): readonly string[]; instructions?(conversationId: string): string | null } | null = null
  setChannelTools(provider: { mcp(conversationId: string): McpServer; tools(conversationId: string): readonly string[]; instructions?(conversationId: string): string | null }): void {
    this.channelTools = provider
  }

  // The user's model providers, for a conversation started on one; without them none can be.
  private providers: ModelProviderStore | null = null
  private accounts: Pick<AgentAccountStore, 'launch' | 'activeOf' | 'exists'> & Partial<Pick<AgentAccountStore, 'home'>> | null = null
  setModelProviders(providers: ModelProviderStore): void { this.providers = providers }
  setAccounts(accounts: Pick<AgentAccountStore, 'launch' | 'activeOf' | 'exists'> & Partial<Pick<AgentAccountStore, 'home'>>): void { this.accounts = accounts }

  // What the agent's next stage here runs on (see decideRoute). rerouted: the user has just picked
  // the provider for it, which wins over the route it last ran on here.
  private routeFor(conversation: Pick<Conversation, 'id' | 'modelProvider'>, agent: AgentKind, rerouted = false): RouteDecision {
    const chosen = conversation.modelProvider ?? null
    const resolved = chosen === null ? null : this.providers?.resolve(chosen) ?? null
    return decideRoute(chosen, agent, rerouted ? null : this.store.latestStage(conversation.id, agent), resolved)
  }

  // The provider whose models an agent picks from here, where it runs on one.
  private catalogProvider(conversation: Pick<Conversation, 'id' | 'modelProvider'>, agent: AgentKind): string | undefined {
    const decision = this.routeFor(conversation, agent)
    return decision.kind === 'provider' ? decision.route.providerId : undefined
  }

  // Where a small job for the conversation goes (a title, a translation, a commit message): the
  // provider its agent runs on, else the agent's own account (undefined). A provider gone refuses
  // the job rather than spend the agent's own account on it.
  quickProvider(conversationId: string): QuickProvider | undefined {
    const conversation = this.store.get(conversationId)
    return conversation?.modelProvider ? quickProviderOf(this.routeFor(conversation, conversation.agent)) : undefined
  }

  // The same for something that has no conversation yet, such as a task's branch name: as its
  // first start would run.
  quickProviderFor(providerId: string, agent: AgentKind): QuickProvider | undefined {
    return quickProviderOf(decideRoute(providerId, agent, null, this.providers?.resolve(providerId) ?? null))
  }

  // A provider a new conversation is to start on: one that has a key and serves its agent.
  private requireProvider(providerId: string, agent: AgentKind): void {
    const resolved = this.providers?.resolve(providerId)
    if (!resolved) throw new Rejection('model-provider-unavailable', '服务商不存在或没有 API Key')
    if (!providerEndpoint(resolved.provider, agent)) {
      throw new Rejection('model-provider-agent-unsupported', `服务商「${resolved.provider.name}」不服务这个 Agent`)
    }
  }

  // The vault as this stage gets it: writable only where the stage may edit; left out where the
  // user made the vault a project already, or where its folder is gone (Claude refuses to start
  // on a missing --add-dir).
  private async stageKnowledgeBase(conversation: Conversation, stage: ConversationStage): Promise<KnowledgeBase | undefined> {
    const vault = this.knowledgeBase
    if (!vault || !(await stat(vault.path).catch(() => null))?.isDirectory()) return undefined
    // Projects are kept resolved; the vault is given as the user wrote it.
    if (conversation.projectPaths.includes(await realpath(vault.path))) return undefined
    return { ...vault, write: vault.write && !stage.planOnly && !conversation.workspaceReadOnly }
  }

  setCapacity(settings: Pick<ChatSettings, 'maxConcurrentAgents' | 'agentConcurrency'>, released: () => void): void {
    const hadCapacity = this.capacityReleased !== null
    this.maxConcurrentAgents = settings.maxConcurrentAgents ?? 20
    this.agentConcurrency = settings.agentConcurrency ?? {}
    this.capacityReleased = released
    if (hadCapacity) released()
  }

  // The turn is over and nothing waits on the user; work left in the background may run on.
  turnOver(id: string): boolean { return this.chats.turnOver(id) }

  // Nothing would be lost if the agent went: no turn, request, queued message or background work.
  agentIdle(id: string): boolean { return this.chats.idle(id) }

  // Count sessions, not turns: an agent awaiting approval still owns a process and a slot. A
  // launch in progress reserves its slot until it either attaches a session or fails.
  capacityAvailable(agent: AgentKind, conversationId?: string | null): boolean {
    const existing = conversationId ? this.store.get(conversationId) : null
    if (existing?.sessionId && existing.agent === agent) return true
    const active = new Map(this.store.list().filter((conversation) => conversation.sessionId !== null)
      .map((conversation) => [conversation.id, conversation.agent]))
    // A handoff may replace this conversation's old process before starting the new agent.
    if (existing?.sessionId && conversationId) active.delete(conversationId)
    for (const [id, launch] of this.launching) if (!active.has(id)) active.set(id, launch.agent)
    return active.size < this.maxConcurrentAgents &&
      [...active.values()].filter((kind) => kind === agent).length < (this.agentConcurrency[agent] ?? DEFAULT_AGENT_CONCURRENCY)
  }

  // Task summaries are opt-in; older clients expect only free conversations. A group chat's members
  // are never listed: a client that does not know group chats would show them as its own. Nor is
  // one opened for a chat platform's asker, which is not the user's to speak in.
  list(includeTasks = false, includeSquads = false, includeDelegates = false): Conversation[] {
    return this.store.list().filter((conversation) => (includeTasks || !conversation.taskId) && !isHelper(conversation) && !conversation.discussionId && !conversation.channel && (includeSquads || !conversation.squadRunId) && (includeDelegates || !conversation.parentConversationId)).map((conversation) => this.withChat(conversation))
  }
  helper(parentId: string): Conversation | null {
    this.get(parentId)
    const helper = this.store.helper(parentId)
    return helper ? this.withChat(helper) : null
  }

  // Every conversation, including helpers and group members: who else works in a folder.
  listAll(): Conversation[] {
    return this.store.list().map((conversation) => this.withChat(conversation))
  }
  get(id: string): Conversation {
    const found = this.store.get(id)
    if (!found) throw new Rejection('conversation-not-found', `no conversation ${id}`)
    return this.withChat(found)
  }
  messages(id: string): ConversationMessage[] { this.get(id); return this.store.messages(id) }

  // What the agent answered to the message sent with this ref: its final reply as recorded; failing
  // that, what the chat shows it saying before the turn ended. Empty when it said nothing.
  replyOf(id: string, ref: string): string {
    const recorded = this.store.messages(id).findLast((message) => message.role === 'assistant' && message.eventKey === `chat:${ref}:assistant`)
    if (recorded) return recorded.text.trim()
    const items = this.chatPage(id).items
    const start = items.findIndex((item) => item.id === `u:${ref}`)
    if (start < 0) return ''
    const end = items.findIndex((item, index) => index > start && item.kind === 'turn')
    return items.slice(start + 1, end < 0 ? undefined : end).flatMap((item) => (item.kind === 'assistant' ? [item.text] : [])).join('\n\n').trim()
  }
  stages(id: string): ConversationStage[] { this.get(id); return this.store.stages(id) }

  // What a task's run cost in its chat: the turns that ended between `from` and `to`, across however
  // many stages the run spanned, and the model and effort the last of them reported. null when the
  // conversation is gone.
  runUsage(id: string, from: number, to: number): RunMeasure | null {
    const conversation = this.store.get(id)
    if (!conversation) return null
    const stages = this.store.stages(id).filter((stage) => stage.startedAt <= to && (stage.endedAt === null || stage.endedAt >= from))
    const sum = { input: 0, output: 0, total: 0, work: 0, split: false, lumped: false, counted: false, timed: false }
    let state: ChatItem | undefined
    for (const stage of stages) {
      const items = this.chats.items(this.chatStage(conversation, stage))
      for (const item of items) {
        if (item.kind !== 'turn' || item.at < from || item.at > to) continue
        if (item.durationMs !== null) { sum.work += item.durationMs; sum.timed = true }
        if (!item.usage) continue
        sum.counted = true
        if ('total' in item.usage) { sum.total += item.usage.total; sum.lumped = true }
        else { sum.input += item.usage.input; sum.output += item.usage.output; sum.total += item.usage.input + item.usage.output; sum.split = true }
      }
      state = items.findLast((item) => item.kind === 'state') ?? state
    }
    return {
      model: state?.kind === 'state' ? state.model : null,
      effort: state?.kind === 'state' ? state.effort : null,
      // Split only when every counted turn said which way its tokens went.
      inputTokens: sum.split && !sum.lumped ? sum.input : null,
      outputTokens: sum.split && !sum.lumped ? sum.output : null,
      totalTokens: sum.counted ? sum.total : null,
      workMs: sum.timed ? sum.work : null
    }
  }
  branches(id: string): Promise<ProjectHead[]> {
    return Promise.all(this.get(id).projectPaths.map(async (projectPath) => ({ path: projectPath, ...await projectHead(projectPath) })))
  }
  // A project's branches before any conversation has it: for a new one to start on.
  async projectBranchOptions(project: string): Promise<ProjectBranches> {
    return this.projectBranchesFor(project, null)
  }

  // A project's branches, with who holds each one checked out elsewhere and which other
  // conversations (not `id`) have an agent open in it.
  private async projectBranchesFor(project: string, id: string | null): Promise<ProjectBranches> {
    const { main, ...branches } = await projectBranches(project)
    const all = this.store.list()
    const roots = this.worktreesRoot ? [this.worktreesRoot, await realpath(this.worktreesRoot).catch(() => this.worktreesRoot ?? '')] : []
    const live = all.filter((other) => other.id !== id && other.sessionId !== null)
    return {
      path: project,
      ...branches,
      holders: branchHolders(branches.elsewhere, main, all, roots),
      sharedWith: live.filter((other) => other.projectPaths.includes(project)).map((other) => other.title)
    }
  }

  // Other conversations with an agent open in a folder see its files change with a switch.
  async branchOptions(id: string): Promise<ProjectBranches[]> {
    return Promise.all(this.get(id).projectPaths.map((project) => this.projectBranchesFor(project, id)))
  }

  async switchBranch(id: string, project: string, ref: string): Promise<Conversation> {
    return this.branched(id, project, (dir) => switchProjectBranch(dir, ref))
  }

  async createBranch(id: string, project: string, name: string): Promise<Conversation> {
    return this.branched(id, project, (dir) => createProjectBranch(dir, name))
  }

  async commitPush(id: string, project: string, message: string): Promise<CommitPushResult> {
    return commitAndPush(this.gitProject(id, project), message)
  }

  async commit(id: string, project: string, message: string): Promise<CommitResult> {
    return commitAll(this.gitProject(id, project), message)
  }

  async push(id: string, project: string): Promise<PushResult> {
    return pushBranch(this.gitProject(id, project))
  }

  // A project of the conversation git may write to: only while no agent works in its folder.
  private gitProject(id: string, project: string): string {
    const conversation = this.get(id)
    const blocker = checkSwitchBranch(conversation)
    if (blocker) throw new Rejection(blocker)
    if (!conversation.projectPaths.includes(project)) throw new Rejection('repo-not-found', `${project} is not one of the conversation's projects`)
    return project
  }

  // Only while no agent works in the folder (checkSwitchBranch). The conversation's changes then
  // count from the new HEAD, and its agent hears of the switch with the next message it is sent.
  private async branched(id: string, project: string, change: (dir: string) => Promise<string>): Promise<Conversation> {
    const conversation = this.get(id)
    const blocker = checkSwitchBranch(conversation)
    if (blocker) throw new Rejection(blocker)
    if (!conversation.projectPaths.includes(project)) throw new Rejection('repo-not-found', `${project} is not one of the conversation's projects`)
    const branch = await change(project)
    const head = await folderHead(project)
    if (head) this.store.setProjectStart(id, project, head)
    this.store.setSwitchedBranches(id, { ...this.store.switchedBranches(id), [project]: branch })
    return this.changed(this.get(id))
  }

  // What the user switched since the agent last heard, said before their next message.
  private switchNote(id: string): string[] | null {
    const switched = Object.entries(this.store.switchedBranches(id))
    if (switched.length === 0) return null
    return switched.map(([project, branch]) => `${path.basename(project)} 现在在分支 ${branch}`)
  }

  changes(id: string): Promise<FolderChanges[]> {
    const starts = this.store.projectStarts(id)
    return Promise.all(this.get(id).projectPaths.map((project) => folderChanges(project, starts[project] ?? null)))
  }
  async diff(id: string, project: string, file: string): Promise<FileDiff> {
    if (!this.get(id).projectPaths.includes(project)) throw new Rejection('repo-not-found', `${project} is not one of the conversation's projects`)
    return folderDiff(project, file)
  }
  // Tasks' chats are opt-in, as in list(): older clients have no row to show a hit on.
  search(query: string, includeTasks = false): ConversationSearchHit[] {
    return this.store.searchMessages(query, includeTasks).map(({ conversationId, text }) => ({ conversationId, snippet: searchSnippet(text, query) }))
  }

  // Read the stage in core so a conversation need not be open in the requesting client.
  configuration(id: string): ConversationConfiguration {
    const conversation = this.get(id)
    if (!canReuseConversation(conversation)) throw new Rejection('invalid-params', '只能沿用普通会话的配置')
    const stage = this.store.stages(id).at(-1)
    const state = stage?.agent === conversation.agent
      ? this.stageChatItems(id, stage.id).findLast((item) => item.kind === 'state')
      : undefined
    const next = conversation.chatOptions
    const live = conversation.sessionId !== null && state?.kind === 'state'
    return {
      agent: conversation.agent,
      projectPaths: [...conversation.projectPaths],
      modelProvider: conversation.modelProvider ?? null,
      permissionMode: live ? state.permissionMode : next?.permissionMode ?? state?.permissionMode ?? null,
      model: live ? state.model : next?.model ?? state?.model ?? null,
      effort: live ? state.effort : next?.effort ?? (next?.model && next.model !== state?.model ? null : state?.effort ?? null)
    }
  }

  // routine: the routine whose run opens it, which also names it for good; id: the run's own,
  // so a start tried again finds the conversation it already made. start.worktree: it works in a
  // worktree of each project rather than in the project itself. start.unlisted: its projects are
  // not remembered as recent ones.
  async create(
    agent: AgentKind,
    projectPaths: readonly string[],
    allowBypass?: boolean,
    start: { permissionMode?: string; model?: string; effort?: string; worktree?: boolean; branch?: string; deferStart?: boolean; deferWorkspace?: boolean; helperOf?: string; modelProvider?: string; profile?: AgentProfile; parentId?: string; callId?: string; readOnly?: boolean; referencePaths?: readonly string[]; unlisted?: boolean; investigation?: { source: TaskSource; title: string; automaticId?: string } ; channel?: ConversationChannel; title?: string; account?: string } = {},
    routine: { id: string; title: string } | null = null,
    id: string = randomUUID(),
    discussion: { id: string; title: string } | null = null,
    squad: { runId: string; readOnly: boolean; referencePaths?: readonly string[] } | null = null
  ): Promise<Conversation> {
    if (start.helperOf) {
      const parent = this.get(start.helperOf)
      if (this.retiring.has(parent.id) || !canHaveHelper(parent) || routine || discussion || squad || start.worktree || start.branch) throw new Rejection('invalid-params', '这个会话不能创建小助手')
      const permissionMode = start.permissionMode ?? 'ask'
      if (!helperAllowsMode(permissionMode)) throw new Rejection('chat-option-invalid', '小助手不能只做规划')
      if (this.store.helper(parent.id)) throw new Rejection('invalid-params', '这个会话已有小助手')
      if (!start.deferStart && !this.capacityAvailable(agent)) throw new Rejection('agent-capacity')
      // On what its parent runs on now: the provider, unless the parent's agent runs on its own account.
      const parentStage = this.store.stages(parent.id).at(-1)
      const modelProvider = parentStage ? parentStage.route?.providerId ?? null : parent.modelProvider ?? null
      const helperProvider = modelProvider !== null && this.routeFor({ id, modelProvider }, agent).kind === 'provider' ? modelProvider : undefined
      await this.validateStartOptions(agent, { ...start, permissionMode }, helperProvider)
      // Recheck after catalog discovery: concurrent creates must not open two helpers.
      const currentParent = this.get(parent.id)
      if (this.retiring.has(parent.id) || !canHaveHelper(currentParent) || this.store.helper(parent.id)) throw new Rejection('invalid-params', '不能创建小助手或已有小助手')
      this.store.create(agent, currentParent.workspacePath, currentParent.projectPaths, id, this.store.projectStarts(parent.id), null, null, null, parent.id)
      this.store.setModelProvider(id, modelProvider)
      // On the account its parent keeps, where it is the same agent's.
      const account = this.store.chatOptions(parent.id)[agent]?.account
      this.store.setChatOptions(id, { permissionMode, allowBypass: allowBypass ?? false, [agent]: { model: start.model, effort: start.effort, ...(account ? { account } : {}) } })
      this.changed(this.get(id))
      return start.deferStart ? this.get(id) : this.start(id, agent, '', false)
    }
    if (projectPaths.length > MAX_TASK_REPOS) throw new Rejection('too-many-projects')
    // It works in a folder of its own with nothing in it: what it may read, it reads through tools.
    if (start.channel && (projectPaths.length || start.worktree || start.branch || routine || discussion || squad)) throw new Rejection('invalid-params', 'a channel conversation has no projects')
    const { permissionMode, model, effort, worktree = false, branch } = start
    const worktreesRoot = worktree ? this.worktreesRoot : null
    if (worktree && (!worktreesRoot || projectPaths.length === 0)) throw new Rejection('missing-repo', 'a worktree needs a project to lay out')
    if (!start.deferStart && !this.capacityAvailable(agent)) throw new Rejection('agent-capacity')
    if (start.modelProvider) this.requireProvider(start.modelProvider, agent)
    if (!start.channel && (start.readOnly || start.profile?.capability === 'readOnly' || squad?.readOnly) && !agentSupportsReadOnly(agent)) {
      throw new Rejection('agent-read-only-unsupported', `${agentDescriptor(agent).label} 不支持只读模式，请选择支持只读的外部智能体`)
    }
    const deferredWorkspace = Boolean(start.deferStart && start.deferWorkspace)
    if (!deferredWorkspace) await this.validateStartOptions(agent, { permissionMode, model, effort }, start.modelProvider)
    if (start.account) this.requireAccount(agent, start.account, start.modelProvider ?? null)
    const resolved = deferredWorkspace
      ? { projects: projectPaths.map(normalizeRepoPath), picked: projectPaths.map(normalizeRepoPath) }
      : await resolveProjects(projectPaths)
    const { picked } = resolved
    const primary = resolved.projects[0]
    if (branch && !primary) throw new Rejection('missing-repo', 'a branch needs a project')
    // Asked before anything is laid out, so a refusal leaves nothing behind.
    const setups = !deferredWorkspace && worktreesRoot && this.worktreeSetup ? await this.worktreeSetup.requireTrusted(resolved.projects) : []
    let made: NewWorktree[] = []
    // The primary's branch: in a worktree, where its branch starts (a remote one fetched first);
    // in the project itself, switched to before anything else, so a refusal makes nothing.
    const prepare = async () => {
      const primaryStart = branch && primary && worktreesRoot ? (await resolveStart(primary, branch, null, Date.now())).commit : undefined
      if (branch && primary && !worktreesRoot) await switchProjectBranch(primary, branch)
      if (!worktreesRoot) return resolved.projects
      const worktrees = await prepareConversationWorktrees(id, resolved.projects, worktreesRoot, primaryStart)
      made = worktrees.flatMap(({ dir, topLevel, created }) => (created ? [{ dir, topLevel }] : []))
      return await Promise.all(worktrees.map(({ dir }) => realpath(dir)))
    }
    const projects = deferredWorkspace ? resolved.projects : this.gitPreparation && (branch || worktree)
      ? await this.gitPreparation(resolved.projects, prepare, !worktree) : await prepare()
    let workspace: string
    if (projects.length === 0) {
      workspace = path.join(this.sessionsRoot, id, 'workspace')
      if (!deferredWorkspace) await mkdir(workspace, { recursive: true, mode: 0o700 })
    } else {
      workspace = projects[0]!
    }
    const starts: Record<string, string> = {}
    if (!deferredWorkspace) {
      for (const project of projects) {
        const head = await folderHead(project)
        if (head) starts[project] = head
      }
    }
    const created = this.store.create(agent, workspace, projects, id, starts, null, routine, discussion, null, start.investigation ?? null)
    if (deferredWorkspace) this.store.setWorkspacePreparation(id, { projects: resolved.projects, worktree, ...(branch ? { branch } : {}) })
    if (start.modelProvider) this.store.setModelProvider(id, start.modelProvider)
    if (start.profile) this.store.setProfile(id, start.profile, start.parentId ?? null, start.callId ?? null)
    if (start.readOnly || start.profile?.capability === 'readOnly' || start.channel) this.store.setWorkspaceReadOnly(id, true)
    if (start.channel) this.store.setChannel(id, start.channel)
    // Named once, by who opened it: no agent is asked to title it.
    if (start.title) this.store.update(id, { title: start.title, titleLocked: true })
    if (start.referencePaths?.length) this.store.setReferencePaths(id, start.referencePaths)
    if (squad) this.store.setSquad(id, squad.runId, squad.readOnly)
    if (squad?.referencePaths?.length) this.store.setReferencePaths(id, squad.referencePaths)
    if (allowBypass !== undefined) this.store.setChatOptions(id, { allowBypass })
    if (permissionMode) this.store.setChatOptions(id, { permissionMode })
    if (model || effort || start.account) this.store.setChatOptions(id, { [agent]: { model, effort, ...(start.account ? { account: start.account } : {}) } })
    // The paths as picked, not resolved: the same strings a task stores for them. Not a worktree
    // Antumi laid out for a delegated member (start.unlisted): no one picks that again.
    if (!start.unlisted) this.projects.remember(picked)
    // The agent starts once setup ends; a failure shows in its tab, with no first message to tell the agent in.
    if (made.length && setups.length && this.worktreeSetup) {
      this.changed(created)
      await this.worktreeSetup.setUp(id, made, setups)
    }
    if (start.deferStart) return this.changed(this.get(id))
    this.changed(created)
    return this.start(id, agent, '', false)
  }

  // Everything but the primary changes (checkEditAdditionalProjects). The agent is given its
  // directories at launch, so an idle one restarts and goes on from where it was, as after /add-dir.
  async setAdditionalProjects(id: string, projectPaths: readonly string[]): Promise<Conversation> {
    const conversation = this.own(id)
    if (conversation.squadRunId || conversation.parentConversationId) throw new Rejection('squad-managed')
    const blocker = this.launching.has(id) ? 'conversation-running' : checkEditAdditionalProjects(conversation)
    if (blocker) throw new Rejection(blocker)
    const primary = conversation.workspacePath
    const { projects, picked } = await resolveProjects(projectPaths, [primary])
    const next = [primary, ...projects]
    if (next.join('\n') === conversation.projectPaths.join('\n')) return conversation
    const live = conversation.sessionId !== null
    if (live && !this.chats.idle(id)) throw new Rejection('chat-busy', 'the agent is still working')
    if (live) await this.stop(id)
    this.store.moveWorkspace(id, primary, next)
    const starts = this.store.projectStarts(id)
    for (const project of projects) {
      const head = starts[project] ? null : await folderHead(project)
      if (head) this.store.setProjectStart(id, project, head)
    }
    this.projects.remember(picked)
    return live ? this.start(id, conversation.agent, '', false) : this.changed(this.get(id))
  }

  // One opened for a chat platform's asker stays as it was made: its agent, its lock and what it
  // may read are not the user's to change from the conversation.
  private own(id: string): Conversation {
    const conversation = this.free(id)
    if (conversation.channel) throw new Rejection('channel-managed', 'this conversation answers a chat platform; change it from its agent')
    return conversation
  }

  // A task's chat is driven from its task, which checks what the task may do first.
  private free(id: string): Conversation {
    const conversation = this.get(id)
    if (conversation.taskId) throw new Rejection('task-conversation', 'this conversation runs a task; go on from the task')
    return conversation
  }

  // Validate before preparing a workspace or replacing a task's existing stage.
  // providerId: the provider the agent runs on, whose models it picks from.
  // Whether the user let this conversation run with nothing asked and nothing sandboxed.
  allowsBypass(id: string): boolean {
    return this.store.chatOptions(id).allowBypass ?? false
  }

  async validateStartOptions(agent: AgentKind, options: { permissionMode?: string; model?: string | null; effort?: string | null }, providerId?: string): Promise<void> {
    const { permissionMode, model, effort } = options
    const adapter = adapterOf(agent)
    const backend = adapter.resolveBackend ? await adapter.resolveBackend() : undefined
    const allowedModes = adapter.permissionModesFor?.(backend) ?? adapter.permissionModes
    if (permissionMode && !allowedModes.includes(permissionMode)) {
      throw new Rejection('chat-option-invalid', `${agent} has no permission mode ${permissionMode}`)
    }
    if (model || effort) {
      // An agent the provider does not serve runs on its own account (decideRoute).
      const provider = providerId === undefined ? null : this.providers?.get(providerId)
      const onProvider = Boolean(provider && providerEndpoint(provider, agent))
      const models = (await this.chatCatalog(agent, onProvider ? providerId : undefined))?.models ?? []
      const picked = model == null
        ? models.find((each) => each.isDefault)
        : models.find((each) => each.id === model) ?? (onProvider ? adapter.matchProviderModel?.(model, models) : undefined)
      if (model && !picked) throw new Rejection('chat-option-invalid', `${agent} lists no model ${model}`)
      if (effort && !picked?.efforts.includes(effort)) throw new Rejection('chat-option-invalid', `the model takes no effort ${effort}`)
    }
  }

  // A task's chat: made on the task's first start, then moved to wherever its agent works next.
  // Resolves once the agent can take a message, which the task then sends.
  async startForTask(task: { id: string; title: string; agent: AgentKind }, launch: TaskChatLaunch): Promise<Conversation> {
    const cwd = await realpath(launch.cwd)
    const extraDirs = await Promise.all(launch.extraDirs.map((dir) => realpath(dir)))
    const projectPaths = [cwd, ...extraDirs]
    const referencePaths = await Promise.all((launch.referenceDirs ?? []).map((dir) => realpath(dir)))
    const images = await this.chatImages(launch.images ?? [])
    const existing = this.store.byTask(task.id)
    // The provider is settled with the conversation: a later start may only name the same one,
    // unless it hands the task to another agent, who may run on another.
    if (existing && launch.modelProvider !== undefined && launch.modelProvider !== (existing.modelProvider ?? null)) {
      throw new Rejection('model-provider-fixed', '任务的服务商在第一次启动时已定下')
    }
    const rerouted = launch.handoffProvider !== undefined
    const provider = rerouted ? launch.handoffProvider ?? null : existing ? undefined : launch.modelProvider ?? null
    if (provider) this.requireProvider(provider, task.agent)
    const conversation = existing ?? this.store.create(task.agent, cwd, projectPaths, randomUUID(), {}, { id: task.id, title: task.title })
    if (!existing && provider) this.store.setModelProvider(conversation.id, provider)
    const { id } = conversation
    if (launch.profile) this.store.setProfile(id, launch.profile)
    if (this.launching.has(id)) throw new Rejection('conversation-running')
    // Another cwd is another place for the agent; only the directories it was given changed, the
    // agent restarts with them but goes on from where it was, as it would take /add-dir.
    const moved = conversation.workspacePath !== cwd
    const regrouped = moved || conversation.projectPaths.join('\n') !== projectPaths.join('\n') || (conversation.referencePaths ?? []).join('\n') !== referencePaths.join('\n')
    const live = conversation.sessionId !== null && this.chats.activity(id) !== null
    // Going on with another agent than the chat had, it is handed what was said, as a handoff is.
    const switched = launch.session === 'resume' && conversation.agent !== task.agent
    const same = !regrouped && !switched && (conversation.planOnly ?? false) === launch.planOnly && Boolean(conversation.workspaceReadOnly) === Boolean(launch.workspaceReadOnly)
    if (live && launch.session === 'resume' && same) return this.withChat(conversation)
    if (conversation.sessionId && !this.chats.idle(id)) throw new Rejection('chat-busy', 'the agent is still working')
    if (conversation.sessionId) await this.stop(id)
    if (rerouted) this.store.setModelProvider(id, provider ?? null)
    this.store.setWorkspaceReadOnly(id, launch.workspaceReadOnly ?? false)
    if (regrouped) this.store.moveWorkspace(id, cwd, projectPaths, referencePaths)
    if (conversation.title !== task.title) this.store.update(id, { title: task.title })
    if (launch.allowBypass !== undefined) this.store.setChatOptions(id, { allowBypass: launch.allowBypass })
    // A stage of its own plans first; one going on keeps the mode it was left in, unless it is given
    // one, as a squad's leader is when it goes on from planning to leading.
    if (launch.session === 'new' || launch.permissionMode) this.store.setChatOptions(id, { permissionMode: launch.permissionMode ?? 'plan' })
    this.pickModel(id, task.agent, launch)
    const started = await this.start(id, task.agent, launch.handoffNote ?? '', switched, {
      fresh: launch.session === 'new',
      moved,
      rerouted,
      planOnly: launch.planOnly,
      readable: launch.readable,
      opening: launch.opening?.text,
      references: launch.references,
      images
    })
    if (launch.opening && !this.openedInHandoff.delete(id)) await this.send(id, launch.opening.text, launch.opening.imageIds)
    return started
  }

  planForTransfer(id: string, stageId: string, requestId: string): { markdown: string; agent: AgentKind } {
    const item = this.chatPage(id).items.find((entry) => entry.stageId === stageId && entry.kind === 'approval' && entry.requestId === requestId)
    const conversation = this.get(id)
    const latest = this.store.stages(id).at(-1)
    if (latest?.id !== stageId || !(conversation.planOnly || conversation.chatOptions?.permissionMode === 'plan') || item?.kind !== 'approval' || !isPlanApproval(item) || !item.detail || item.resolution !== null) throw new Rejection('chat-request-gone', '规划已执行或不存在')
    return { markdown: item.detail, agent: this.get(id).agent }
  }

  // Keeps a plan-only stage's plan: answers it, if it still waits, so the agent does not carry it
  // out, and gives what it said for the task to keep.
  async savePlan(conversationId: string, stageId: string, requestId: string): Promise<{ markdown: string; agent: AgentKind }> {
    const conversation = this.get(conversationId)
    const stage = this.store.stages(conversationId).find((each) => each.id === stageId)
    if (!stage) throw new Rejection('stage-not-found', `no stage ${stageId}`)
    if (!stage.planOnly) throw new Rejection('not-planning', 'only a stage that may only plan keeps its plan for later')
    const item = this.chats.items(this.chatStage(conversation, stage)).find((each) => each.kind === 'approval' && each.requestId === requestId)
    if (item?.kind !== 'approval' || !isPlanApproval(item) || !item.detail) throw new Rejection('chat-request-gone', 'no such plan')
    if (item.resolution === null && this.store.activeStage(conversationId)?.id === stageId) {
      await this.chats.respond(conversationId, requestId, { decision: 'deny', saved: true })
    }
    return { markdown: item.detail, agent: stage.agent }
  }

  rename(id: string, title: string): Conversation {
    if (isHelper(this.get(id))) throw new Rejection('invalid-params', '小助手的标题固定')
    return this.changed(this.store.update(id, { title: title.trim(), titleLocked: true }))
  }

  // The conversations a deleted routine opened become the user's like any other: back in the list.
  clearRoutine(routineId: string): void {
    for (const conversation of this.store.clearRoutine(routineId)) this.changed(conversation)
  }

  // A task's chat sits in the list with the free conversations, so it is pinned like one.
  setPinned(id: string, pinned: boolean): Conversation {
    const current = this.get(id)
    if ((current.pinnedAt != null) === pinned) return current
    return this.changed(this.store.setPinned(id, pinned))
  }

  // Puts a free conversation away, or takes it out again. An archived one is read-only, so its
  // agent, which must be idle, is let go; the next message after taking it out resumes it.
  async setArchived(id: string, archived: boolean): Promise<Conversation> {
    const current = this.free(id)
    if (current.squadRunId || current.parentConversationId) throw new Rejection('squad-managed')
    if (current.discussionId) throw new Rejection('discussion-member', 'a group chat member is put away with its group chat')
    if ((current.archivedAt != null) === archived) return current
    if (archived) {
      if (this.launching.has(id)) throw new Rejection('conversation-running')
      if (current.sessionId && !this.chats.idle(id)) throw new Rejection('chat-busy', 'the agent is still working')
      this.retiring.add(id)
      try {
        await this.callCleanup?.(id)
        if (current.sessionId) await this.stop(id)
        const helper = this.store.helper(id)
        if (helper) await this.remove(helper.id)
        await this.archiveDelegates(id)
        return this.changed(this.store.setArchived(id, archived))
      } finally { this.retiring.delete(id) }
    }
    await this.restoreWorktrees(id)
    const restored = this.changed(this.store.setArchived(id, archived))
    for (const child of this.store.children(id)) if (child.archivedAt != null) this.changed(this.store.setArchived(child.id, false))
    return restored
  }

  // A delegated member goes with its caller: put away with it, taken out with it, deleted with it.
  private async archiveDelegates(parentId: string): Promise<void> {
    for (const child of this.store.children(parentId)) {
      if (child.archivedAt != null) continue
      if (child.sessionId) await this.stop(child.id)
      this.changed(this.store.setArchived(child.id, true))
    }
  }

  // Members older versions left behind their caller: deleted with a deleted one, put away with an
  // archived one.
  async tidyDelegates(): Promise<void> {
    for (const child of this.store.children()) {
      const parent = child.parentConversationId ? this.store.get(child.parentConversationId) : null
      try {
        if (!parent) await this.remove(child.id)
        else if (parent.archivedAt != null && child.archivedAt == null) await this.archiveDelegates(parent.id)
      } catch (error) {
        console.error(`[antumi-core] tidying delegated conversation ${child.id} failed`, error)
      }
    }
  }

  // Lays out again, where they stood, the worktrees cleaned while it was archived; one another
  // conversation took out first is already there. Setup runs in them as in new ones, in the
  // background: a long install would hold up taking it out. One that cannot be laid out stays
  // recorded, for the next time it is taken out.
  private async restoreWorktrees(id: string): Promise<void> {
    const cleaned = this.store.cleanedWorktrees(id)
    if (cleaned.length === 0) return
    const made: NewWorktree[] = []
    const failed: typeof cleaned = []
    const restore = async () => {
      for (const worktree of cleaned) {
        if (await stat(worktree.dir).then((info) => info.isDirectory(), () => false)) continue
        if (await restoreWorktree(worktree.repo, worktree.dir, worktree.branch, worktree.head)) made.push({ topLevel: worktree.repo, dir: worktree.dir })
        else failed.push(worktree)
      }
    }
    const repos = cleaned.map((worktree) => worktree.repo)
    await (this.gitPreparation ? this.gitPreparation(repos, restore, true) : restore())
    this.store.setCleanedWorktrees(id, failed)
    const setup = this.worktreeSetup
    if (made.length === 0 || !setup) return
    void setup.requireTrusted(made.map((worktree) => worktree.topLevel))
      .then((setups) => (setups.length ? setup.setUp(id, made, setups) : []))
      .catch((error: unknown) => console.error('[antumi-core] setup in a restored worktree failed', error))
  }

  // An archived conversation takes no message until it is taken out again.
  private writable(id: string): Conversation {
    const conversation = this.get(id)
    if (conversation.archivedAt != null) throw new Rejection('conversation-archived', 'take the conversation out of the archive first')
    return conversation
  }

  // Readies the agent for a message: one already up stays as it is.
  async continue(id: string, allowBypass?: boolean, readable?: readonly string[], skipProjectSetup = false): Promise<Conversation> {
    this.writable(id)
    const current = this.free(id)
    if (this.launching.has(id)) throw new Rejection('conversation-running')
    if (current.sessionId && this.chats.activity(id) !== null) return current
    if (allowBypass !== undefined) this.store.setChatOptions(id, { allowBypass })
    if (current.sessionId) await this.stop(id)
    return this.start(id, current.agent, '', false, { readable, skipProjectSetup })
  }

  async resumeDelegation(id: string): Promise<Conversation> {
    const current = this.writable(id)
    if (!current.taskId) return this.continue(id)
    if (current.sessionId && this.chats.activity(id) !== null) return current
    return this.start(id, current.agent, '', false, { planOnly: current.planOnly })
  }

  // Stops an agent left idle on another account than its agent's active one, so the next start
  // resumes its session there: how a usage limit's resume moves to the account switched to. One
  // at work, or waiting on the user, is left as it is.
  async leaveSpentAccount(id: string): Promise<void> {
    const current = this.get(id)
    const stage = this.store.latestStage(id, current.agent)
    if (!this.accounts || !stage?.account || stage.route || stage.account === this.accounts.activeOf(current.agent)) return
    // One the user chose its account for stays on it.
    if (this.keptAccount(id, current.agent)) return
    if (!current.sessionId || this.launching.has(id) || !this.chats.idle(id)) return
    await this.stop(id)
  }

  async handoff(id: string, agent: AgentKind, note: string, stopRunning: boolean, allowBypass?: boolean, choice: HandoffChoice = {}): Promise<Conversation> {
    this.writable(id)
    const current = this.own(id)
    // Configured identities keep their agent; another would speak in their place.
    if (current.profile) throw new Rejection('profile-managed', '智能体会话沿用指定的 Agent，不能移交')
    if (isHelper(current)) throw new Rejection('invalid-params', '小助手不能移交')
    if (current.squadRunId || current.parentConversationId) throw new Rejection('squad-managed')
    if (current.discussionId) throw new Rejection('discussion-member', 'a group chat member keeps its agent')
    if (agent === current.agent) throw new Rejection('conversation-same-agent')
    await this.validateStartOptions(agent, choice, this.handoffProvider(current, agent, choice.modelProvider))
    if (allowBypass !== undefined) this.store.setChatOptions(id, { allowBypass })
    if (this.launching.has(id)) throw new Rejection('conversation-running')
    if (current.sessionId && !stopRunning && !this.chats.idle(id)) throw new Rejection('conversation-running')
    if (!this.capacityAvailable(agent, id)) throw new Rejection('agent-capacity')
    const images = await this.chatImages(choice.images ?? [])
    if (current.sessionId) await this.stop(id)
    this.pickModel(id, agent, choice)
    // After the stop, which may leave the old agent's last mode in the options.
    if (choice.permissionMode) this.store.setChatOptions(id, { permissionMode: choice.permissionMode })
    const rerouted = choice.modelProvider !== undefined
    if (rerouted) this.store.setModelProvider(id, choice.modelProvider ?? null)
    return this.start(id, agent, note, true, { references: choice.references, images, rerouted })
  }

  // The provider an agent taking the conversation over runs on: the one picked for it, which must
  // serve it, else the conversation's, where that serves it. undefined: its own account.
  private handoffProvider(conversation: Pick<Conversation, 'id' | 'modelProvider'>, agent: AgentKind, picked: string | null | undefined): string | undefined {
    if (picked !== undefined) return this.pickedProvider(agent, picked)
    const decision = this.routeFor(conversation, agent)
    if (decision.kind === 'unavailable') throw new Rejection('model-provider-unavailable', decision.message)
    return decision.kind === 'provider' ? decision.route.providerId : undefined
  }

  // A provider picked for an agent to take over on, which must serve it; null its own account.
  pickedProvider(agent: AgentKind, picked: string | null): string | undefined {
    if (picked === null) return undefined
    this.requireProvider(picked, agent)
    return picked
  }

  // The model and effort an agent starts in: each as picked, null back to the default, absent as it
  // last ran here. A new model drops an effort it was not picked with, which it may not take.
  private pickModel(id: string, agent: AgentKind, choice: ModelChoice): void {
    if (choice.model === undefined && choice.effort === undefined) return
    const previous = this.store.chatOptions(id)[agent] ?? {}
    this.store.setChatOptions(id, { [agent]: {
      ...previous,
      model: choice.model === undefined ? previous.model : choice.model ?? undefined,
      effort: choice.effort === undefined
        ? (choice.model !== undefined && choice.model !== previous.model ? undefined : previous.effort)
        : choice.effort ?? undefined
    } })
  }

  // A new conversation holding this one's chat up to a message, for the same agent in the same
  // projects: through the turn an agent's message belongs to, or up to (not including) a user
  // message, which the client puts back in the input. The chat logs are copied and cut, so the new
  // conversation reads as the old one did at that point; the agent's own session is forked at
  // the same turn where it can be, so it remembers just that much.
  // A conversation opened to look into an inbox issue: named after the issue, it reads the brief
  // (the issue's text and how to go about it) first, the way a handoff is read, so the chat shows
  // only what the user added. readable: the issue's images, which the brief points at.
  // Opens a conversation for an issue at once, preparing while the issue is fetched: its agent
  // starts from beginInvestigation once the issue is in, and nothing starts it before.
  async openInvestigation(
    agent: AgentKind,
    projectPaths: readonly string[],
    allowBypass: boolean | undefined,
    start: { readOnly?: boolean; permissionMode?: string; model?: string; effort?: string; worktree?: boolean; branch?: string; modelProvider?: string },
    issue: { source: TaskSource; title: string; automaticId?: string }
  ): Promise<Conversation> {
    if (issue.automaticId && this.store.get(issue.automaticId)) {
      const existing = this.get(issue.automaticId)
      if (start.readOnly && (!agentSupportsReadOnly(agent) || !agentSupportsReadOnly(existing.agent))) {
        throw new Rejection('agent-read-only-unsupported', `${agentDescriptor(agent).label} 不支持只读模式，请选择支持只读的外部智能体`)
      }
      if (start.readOnly) this.store.setWorkspaceReadOnly(existing.id, true)
      if (!existing.sessionId && this.store.stages(existing.id).length === 0) {
        await this.validateStartOptions(agent, start, start.modelProvider)
        this.store.setModelProvider(existing.id, start.modelProvider ?? null)
        this.store.setChatOptions(existing.id, { allowBypass: allowBypass ?? false, permissionMode: start.permissionMode ?? agentDescriptor(agent).discussionMode,
          [agent]: { model: start.model, effort: start.effort } })
      }
      return this.get(existing.id)
    }
    if (!this.capacityAvailable(agent)) throw new Rejection('agent-capacity', 'Agent 运行数量已达到上限，请等待其他会话结束，或预约稍后执行')
    const { id } = await this.create(agent, projectPaths, allowBypass, { ...start, deferStart: true, investigation: issue }, null, issue.automaticId)
    this.fetchingIssues.set(id, { step: 'issue', error: null })
    this.store.setSource(id, { ...issue.source, title: issue.title })
    return this.changed(this.store.update(id, { title: issue.title, titleLocked: true }))
  }

  // How far an issue's fetch has got, or why it stopped; null once it is in. A conversation gone
  // meanwhile is left alone.
  setPreparing(id: string, step: 'issue' | 'images', error: { reason: string; message: string } | null = null): void {
    if (!this.store.get(id)) return
    this.fetchingIssues.set(id, { step, error: error?.message ?? null, ...(error ? { reason: error.reason } : {}) })
    this.changed(this.get(id))
  }

  // Starts the agent on the issue's brief. A start that fails leaves the conversation preparing
  // with the failure, to be tried again.
  async beginInvestigation(id: string, issue: { title: string; brief: string; readable: readonly string[] }, note: string, references?: ChatReference[], imageIds: readonly string[] = [], ref?: string): Promise<Conversation> {
    const current = this.get(id)
    this.fetchingIssues.delete(id)
    try {
      const images = await this.chatImages(imageIds)
      if (current.source) this.store.setSource(id, { ...current.source, title: issue.title })
      this.store.update(id, { title: issue.title, titleLocked: true })
      const directory = path.join(this.sessionsRoot, id, 'handoffs')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const brief = path.join(directory, `${randomUUID()}.md`)
      await writeFile(brief, issue.brief, { mode: 0o600 })
      if (current.autoInvestigationId && current.sessionId && ref) {
        if (this.sourceDeliveryReceipt(id, ref, 'uncertain')) throw new Rejection('delivery-uncertain', '首条指令的提交结果需要检查')
        const message = handoffMessage(brief, note)
        await this.chats.send(id, message, images, false, false, ref, chatReferencesFor(note, message, references))
        return this.get(id)
      }
      return await this.start(id, current.agent, note, false, { brief, readable: issue.readable, references, images, ref })
    } catch (error) {
      if (!this.store.get(id) || this.store.get(id)?.sessionId) throw error
      this.setPreparing(id, 'issue', { reason: error instanceof Rejection ? error.reason : 'chat-start-failed', message: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  // The issue's images, come after its agent started: the next message once the turn is over.
  async sendInvestigationImages(id: string, text: string, imageIds: readonly string[]): Promise<void> {
    await this.send(id, text, imageIds, true, false, `investigation-images:${id}`)
  }

  // An issue's conversation that never got its agent: still fetching, stopped on a failure, or cut
  // off by a restart (one with an issue and no stage at all, which a retry picks up again).
  private preparingOf(conversation: Conversation): Conversation['preparing'] {
    const known = this.fetchingIssues.get(conversation.id)
    if (known) return known
    if (!conversation.source || conversation.sessionId || this.launching.has(conversation.id) || this.store.stages(conversation.id).length > 0) return null
    return { step: 'issue', error: '问题没拉取完就中断了，可以重试', reason: 'investigation-interrupted' }
  }

  // The latest conversation opened for each issue of a source instance, by issue key.
  investigations(provider: string, instance: string): Map<string, string> {
    const latest = new Map<string, Conversation>()
    for (const conversation of this.store.list()) {
      const { source } = conversation
      if (source?.provider !== provider || source.instance !== instance) continue
      const known = latest.get(source.key)
      if (!known || conversation.createdAt > known.createdAt) latest.set(source.key, conversation)
    }
    return new Map([...latest].map(([key, conversation]) => [key, conversation.id]))
  }

  async fork(sourceId: string, stageId: string, itemId: string): Promise<Conversation> {
    const source = this.own(sourceId)
    if (isHelper(source)) throw new Rejection('invalid-params', '小助手不能 fork')
    if (source.squadRunId || source.parentConversationId) throw new Rejection('squad-managed')
    const stages = this.store.stages(sourceId)
    const index = stages.findIndex((stage) => stage.id === stageId)
    if (index < 0) throw new Rejection('stage-not-found', `no chat stage ${stageId}`)
    const cutStage = stages[index]!
    const items = this.chats.items(this.chatStage(source, cutStage))
    const position = items.findIndex((item) => item.id === itemId)
    if (position < 0) throw new Rejection('chat-item-not-found', `no chat item ${itemId}`)
    const picked = items[position]!
    // What of the cut stage goes along, and where the agent's own session is cut.
    const turnAt = (from: number) => items.slice(from).find((item): item is Extract<ChatItem, { kind: 'turn' }> => item.kind === 'turn')
    const lastTurnBefore = (end: number) => items.slice(0, end).reverse().find((item): item is Extract<ChatItem, { kind: 'turn' }> => item.kind === 'turn')
    let kept: ChatItem[]
    let turn: Extract<ChatItem, { kind: 'turn' }> | undefined
    const before = picked.kind === 'user' ? picked : null
    if (before) {
      kept = items.slice(0, position)
      turn = lastTurnBefore(position)
    } else {
      const closing = turnAt(position)
      if (!closing) throw new Rejection('fork-turn-running', 'this turn has not ended yet')
      kept = items.slice(0, items.indexOf(closing) + 1)
      turn = closing
    }
    // The last turn in an earlier stage, when the cut stage has none before the point.
    const earlier = turn ?? stages.slice(0, index).reverse().map((stage) => this.chats.items(this.chatStage(source, stage)).reverse().find((item) => item.kind === 'turn')).find(Boolean)
    const sessionStage = turn ? cutStage : stages.slice(0, index).reverse().find((stage) => this.chats.items(this.chatStage(source, stage)).some((item) => item.kind === 'turn'))
    // The agent whose session is forked goes on; one that has never spoken here is the source's.
    const agent = sessionStage?.agent ?? source.agent
    if (!this.capacityAvailable(agent)) throw new Rejection('agent-capacity')
    const providerSessionId = sessionStage?.providerSessionId ?? null
    // Nothing the user said after the point, here or in a later stage of the same session.
    const said = (each: readonly ChatItem[]) => each.some((item) => item.kind === 'user')
    const latest = !before && turn !== undefined && providerSessionId !== null && !said(items.slice(kept.length)) &&
      stages.slice(index + 1).every((stage) => stage.providerSessionId !== providerSessionId || !said(this.chats.items(this.chatStage(source, stage))))
    const fork: ForkPoint = { providerSessionId, at: earlier?.kind === 'turn' ? earlier.providerRef ?? null : null, latest, routeKey: sessionStage?.route?.key ?? null }
    // A fork of a Claude session must run in the folder the session ran in: the same projects, or
    // the source's own managed workspace, shared from now on (remove() leaves a workspace in place).
    const id = randomUUID()
    const created = this.store.create(agent, source.workspacePath, source.projectPaths, id, this.store.projectStarts(sourceId))
    this.store.setForkedFrom(id, sourceId)
    this.store.setModelProvider(id, source.modelProvider ?? null)
    this.store.setChatOptions(id, this.store.chatOptions(sourceId))
    this.store.update(id, { title: `${source.title} · 分支`, titleLocked: true })
    // The chat so far: every earlier stage whole, the cut stage up to the point, each as a stage
    // of the new conversation that has ended, with the messages those turns recorded.
    for (const stage of stages.slice(0, index + 1)) {
      const copyId = randomUUID()
      this.store.startStage(id, stage.agent, null, 0, copyId, stage.planOnly ?? false, stage.route ?? null, stage.account ?? null, stage.backend ?? null)
      const { records } = ChatLog.of(this.sessionsRoot, sourceId, stage.id).read()
      const last = stage.id === cutStage.id ? kept.at(-1) : undefined
      const cutAt = stage.id === cutStage.id ? (before ? before.at : last?.at ?? 0) : Infinity
      const copied = records.filter((record) => (before && stage.id === cutStage.id ? record.at < cutAt : record.at <= cutAt))
      const endedAt = copied.at(-1)?.at ?? this.store.stage(copyId)!.startedAt
      ChatLog.of(this.sessionsRoot, id, copyId).append([...copied, { dir: 'exit', at: endedAt, code: null, stderr: '' }])
      const refs = new Set((stage.id === cutStage.id ? kept : this.chats.items(this.chatStage(source, stage)))
        .flatMap((item) => (item.kind === 'user' && item.id.startsWith('u:') ? [item.id.slice(2)] : [])))
      for (const message of this.store.messages(sourceId)) {
        if (message.stageId !== stage.id) continue
        const ref = /^chat:(.+):(user|assistant)$/.exec(message.eventKey)?.[1]
        if (ref === undefined || !refs.has(ref)) continue
        this.store.addMessage({ conversationId: id, stageId: copyId, role: message.role, agent: message.agent, text: message.text, eventKey: message.eventKey, complete: true })
      }
      this.store.endStage(copyId, null)
    }
    this.changed(created)
    await this.start(id, agent, '', false, { fork })
    return this.withChat(this.store.get(id)!)
  }

  // A session the agent ran outside Antumi, taken in as a stage that has ended, on that session: the
  // next start resumes it, as it would a stage of Antumi's own. title: what the session was called.
  importStage(id: string, agent: AgentKind, providerSessionId: string | null, transcript: Transcript, title: { text: string; locked: boolean } | null = null, update?: { stageId: string; order: readonly string[] }, origin?: { account?: string | null; backend?: string | null }): Conversation {
    const current = this.get(id)
    if (current.sessionId || this.launching.has(id)) throw new Rejection('conversation-running')
    const existingStageId = update?.stageId
    const stageId = existingStageId ?? randomUUID()
    if (existingStageId && !this.store.stages(id).some((stage) => stage.id === existingStageId && stage.endedAt !== null && stage.sessionId === null)) throw new Rejection('invalid-params', 'not an imported stage')
    const previous = new Map<string, ChatItem>(existingStageId ? this.stageChatItems(id, existingStageId).filter((item) => item.kind !== 'state').map((item) => [item.id, item]) : [])
    if (!existingStageId) this.store.startStage(id, agent, providerSessionId, this.store.maxSequence(id), stageId, false, null, origin?.account ?? null, origin?.backend ?? null)
    // No exit record: no process ran here, and the driver would read one as a start that failed.
    let items: ChatItem[] = transcript.entries.map((entry) => ({ ...entry.item, stageId, revision: (previous.get(entry.item.id)?.revision ?? 0) + 1, at: previous.get(entry.item.id)?.at ?? entry.at }))
    const log = ChatLog.of(this.sessionsRoot, id, stageId)
    if (update) {
      const ranks = new Map(update.order.map((itemId, index) => [itemId, index]))
      let lastRank = -1
      for (const item of previous.values()) {
        const rank = ranks.get(item.id)
        if (rank !== undefined) lastRank = rank
        else { lastRank += 1 / (previous.size + 1); ranks.set(item.id, lastRank) }
      }
      const merged = new Map(previous)
      for (const item of items) merged.set(item.id, item)
      items = [...merged.values()].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity))
      log.replaceImported(items.map((item): LoggedRecord => ({ dir: 'item', at: item.at, item })))
    } else log.append(items.map((item): LoggedRecord => ({ dir: 'item', at: item.at, item })))
    this.chats.invalidateHistory(stageId)
    for (const message of transcript.messages) {
      this.store.addMessage({ conversationId: id, stageId, role: message.role, agent, text: message.text, eventKey: `chat:${message.ref}:${message.role}`, complete: true })
      if (existingStageId) this.store.updateImportedMessage(stageId, `chat:${message.ref}:${message.role}`, message.text)
    }
    this.store.endStage(stageId, null)
    if (title) this.store.update(id, { title: title.text, titleLocked: title.locked })
    else this.store.touch(id)
    if (items.length) this.emit({ type: 'importedItems', conversationId: id, items, ...(existingStageId ? { replaceStage: existingStageId } : {}) })
    return this.changed(this.get(id))
  }

  // Kept in the store so a restart or a declined trust prompt can retry the same workspace.
  private async prepareWorkspace(id: string, agent: AgentKind, skipSetup: boolean): Promise<void> {
    let plan = this.store.workspacePreparation(id)
    if (!plan) return
    const current = this.get(id)
    const options = this.store.chatOptions(id)
    await this.validateStartOptions(agent, { ...options[agent], permissionMode: options.permissionMode }, this.catalogProvider(current, agent))
    const { projects } = await resolveProjects(plan.projects)
    const setups = plan.worktree && !skipSetup && this.worktreeSetup ? await this.worktreeSetup.requireTrusted(projects) : []
    let paths = projects
    if (plan.worktree) {
      if (!plan.worktrees) {
        const { branch } = plan
        const prepare = async () => {
          const primary = projects[0]
          const commit = branch && primary ? (await resolveStart(primary, branch, null, Date.now())).commit : undefined
          if (!this.worktreesRoot) throw new Rejection('missing-repo')
          return prepareConversationWorktrees(id, projects, this.worktreesRoot, commit)
        }
        const worktrees = await (this.gitPreparation ? this.gitPreparation(projects, prepare, false) : prepare())
        plan = { ...plan, worktrees: worktrees.map(({ topLevel, dir }) => ({ topLevel, dir })) }
        this.store.setWorkspacePreparation(id, plan)
      }
      paths = await Promise.all((plan.worktrees ?? []).map(({ dir }) => realpath(dir)))
      if (!paths.length) throw new Rejection('missing-repo')
    } else if (plan.branch) {
      const primary = projects[0]
      if (!primary) throw new Rejection('missing-repo')
      const branch = plan.branch
      const prepare = () => switchProjectBranch(primary, branch)
      await (this.gitPreparation ? this.gitPreparation(projects, prepare, true) : prepare())
    }
    const workspace = paths[0] ?? path.join(this.sessionsRoot, id, 'workspace')
    if (!paths.length) await mkdir(workspace, { recursive: true, mode: 0o700 })
    this.store.moveWorkspace(id, workspace, paths)
    for (const project of paths) {
      const head = await folderHead(project)
      if (head) this.store.setProjectStart(id, project, head)
    }
    this.changed(this.get(id))
    if (setups.length && this.worktreeSetup) await this.worktreeSetup.setUp(id, plan.worktrees ?? [], setups)
    this.store.setWorkspacePreparation(id, null)
  }

  private async start(id: string, agent: AgentKind, note: string, handoff: boolean, launch: StageLaunch = {}): Promise<Conversation> {
    this.squadGuard?.(this.get(id))
    if (this.launching.has(id) || this.retiring.has(id)) throw new Rejection('conversation-running')
    // Its agent waits for the issue, which only beginInvestigation hands over.
    if (!launch.brief && this.preparingOf(this.store.get(id)!)) throw new Rejection('conversation-preparing', 'the issue is still being fetched')
    if (!this.capacityAvailable(agent)) throw new Rejection('agent-capacity', 'Agent 运行数量已达到上限，请等待其他会话结束，或预约稍后执行')
    let finish = () => {}
    const finished = new Promise<void>((resolve) => { finish = resolve })
    this.launching.set(id, { agent, opening: null, finished })
    try {
      this.changed(this.get(id))
      await this.prepareWorkspace(id, agent, launch.skipProjectSetup ?? false)
      const current = this.get(id)
      await this.gitGuard?.(current.projectPaths)
      this.changed(current)
      if (current.sessionId) throw new Rejection('conversation-running')
      if (launch.fork) return { ...await this.startFork(current, agent, launch.fork), starting: false }
      try {
        return await this.startStage(current, agent, note, handoff, launch, null)
      } catch (error) {
        // The session it resumed has gone (Cursor keeps one only once a turn got somewhere): it
        // starts afresh from a handoff instead.
        const lost = this.store.latestStage(id, agent)?.providerSessionId
        if (!(error instanceof Rejection && error.reason === 'chat-session-lost') || !lost) throw error
        return await this.startStage(current, agent, note, handoff, launch, lost)
      }
    } finally {
      this.launching.delete(id)
      finish()
      const current = this.store.get(id)
      if (current) this.changed(current)
      this.capacityReleased?.()
    }
  }

  // lost: the provider session that turned out not to be there to resume.
  private async startStage(current: Conversation, agent: AgentKind, note: string, handoff: boolean, launch: StageLaunch, lost: string | null): Promise<Conversation> {
    const { id } = current
    const decision = this.routeFor(current, agent, launch.rerouted)
    if (decision.kind === 'unavailable') throw new Rejection('model-provider-unavailable', decision.message)
    const route = decision.kind === 'provider' ? decision.route : null
    const previous = launch.fresh ? null : this.store.latestStage(id, agent)
    // A session named before launch may never have been saved, one bound to its folder is left
    // behind by a move, and one opened on another route would reach another account: in each case
    // the agent starts afresh from a handoff.
    const adapter = adapterOf(agent)
    const { session } = adapter
    const prevBackend = previous ? (previous.backend ?? agentDescriptor(agent).legacyBackend ?? null) : null
    // Global runtime preference applies to new conversations (and fresh stages); an existing
    // conversation stays on its previous stage's backend unless an explicit override is passed.
    const backend = launch.backend !== undefined
      ? launch.backend
      : prevBackend ?? ((await adapter.resolveBackend?.()) ?? null)
    const nextBackend = backend ?? agentDescriptor(agent).legacyBackend ?? null
    const accountChoice = launch.account !== undefined
      ? (launch.account && this.accounts?.exists(agent, launch.account) ? launch.account : undefined)
      : this.keptAccount(current.id, agent)
    const account = route ? null : await this.accounts?.launch(agent, accountChoice) ?? null
    const sameBackend = !previous || prevBackend === nextBackend
    const sameAccount = !previous || !adapter.accountScopedSessions?.(nextBackend) || (previous.account ?? null) === (account?.id ?? null)
    const resumable = session.nativeResume !== false && !(launch.moved && session.folderBound) && (lost === null || previous?.providerSessionId !== lost) && sameRoute(previous?.route, route) && sameBackend && sameAccount
    const saved = resumable && previous?.providerSessionId && (!session.preassignedId || this.store.hasProviderMessages(id, previous.providerSessionId))
      ? previous.providerSessionId : null
    const providerSessionId = saved ?? (session.preassignedId ? randomUUID() : null)
    const missingNativeSession = previous !== null && saved === null
    const messages = withoutUnanswered(missingNativeSession ? this.store.messages(id) :
      handoff ? this.store.messages(id, previous?.receivedSequence ?? 0) : [], this.store.stages(id), lost)
    if (previous !== null && !sameBackend && !handoff && messages.length > 0) {
      const backendNote = '对话已切换运行后端，将通过摘要交接继续。'
      note = note ? `${backendNote}\n\n${note}` : backendNote
    }
    const needsHandoff = handoff || (missingNativeSession && messages.length > 0)
    let handoffPath: string | null = null
    this.openedInHandoff.delete(id)
    if (needsHandoff && launch.opening) {
      note = note ? `${note}\n\n${launch.opening}` : launch.opening
      this.openedInHandoff.add(id)
    }
    if (needsHandoff) {
      const directory = path.join(this.sessionsRoot, id, 'handoffs')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      handoffPath = path.join(directory, `${randomUUID()}.md`)
      await writeFile(handoffPath, buildHandoff(current, messages, note, current.agent, agent), { mode: 0o600 })
    }
    if (launch.brief) handoffPath = launch.brief
    const stageId = randomUUID()
    const stage = this.store.startStage(id, agent, providerSessionId, this.store.maxSequence(id), stageId, launch.planOnly ?? false, route, account?.id ?? null, backend)
    if (saved) await this.importHooks?.before(id, agent, saved)
    const provider = decision.kind === 'provider' ? providerLaunch(decision.route, decision.apiKey) : undefined
    return { ...await this.startChat(current, stage, saved !== null, handoffPath === null ? null : { path: handoffPath, note, references: launch.references, images: launch.images, ref: launch.ref }, launch.readable ?? [], null, provider, account), starting: false }
  }

  // The first stage of a fork: the source's session taken over through the fork point, where the
  // agent can (Claude's session from the same folder, Codex's thread), or whole where the point is
  // its latest turn and it forks only whole (OpenCode); else a fresh start. The chat it continues
  // is already copied, so no handoff file is written.
  private async startFork(current: Conversation, agent: AgentKind, fork: ForkPoint): Promise<Conversation> {
    const adapter = adapterOf(agent)
    const { session } = adapter
    const backend = (await adapter.resolveBackend?.()) ?? null
    const decision = this.routeFor(current, agent)
    if (decision.kind === 'unavailable') throw new Rejection('model-provider-unavailable', decision.message)
    const route = decision.kind === 'provider' ? decision.route : null
    const whole = session.nativeFork === 'latest' && fork.latest
    const native = fork.providerSessionId !== null && (whole || (session.nativeFork === 'any' && fork.at !== null)) && fork.routeKey === (route?.key ?? null)
    const providerSessionId = native ? fork.providerSessionId : session.preassignedId ? randomUUID() : null
    // Without a session to fork, the copied chat reaches the agent the way a handoff does.
    let handoffPath: string | null = null
    const messages = native ? [] : this.store.messages(current.id)
    if (messages.length > 0) {
      const directory = path.join(this.sessionsRoot, current.id, 'handoffs')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      handoffPath = path.join(directory, `${randomUUID()}.md`)
      await writeFile(handoffPath, buildHandoff(current, messages, '', agent, agent), { mode: 0o600 })
    }
    const account = route ? null : await this.accounts?.launch(agent, this.keptAccount(current.id, agent)) ?? null
    const stage = this.store.startStage(current.id, agent, providerSessionId, this.store.maxSequence(current.id), randomUUID(), false, route, account?.id ?? null, backend)
    const provider = decision.kind === 'provider' ? providerLaunch(decision.route, decision.apiKey) : undefined
    return this.startChat(current, stage, native, handoffPath === null ? null : { path: handoffPath, note: '' }, [], whole ? WHOLE_SESSION_FORK : native ? fork.at : null, provider, account)
  }

  // Runs the stage's agent over stdio, driven by the chat host, and waits until it can take a message.
  private async startChat(
    current: Conversation,
    stage: ConversationStage,
    resume: boolean,
    // The file a new agent reads first, and what the user added for it.
    handoff: { path: string; note: string; references?: ChatReference[]; images?: readonly ChatImage[]; ref?: string } | null,
    readable: readonly string[],
    forkAt: string | null = null,
    // The model provider the stage runs on, with its key; the stage's route says which.
    provider?: ProviderLaunch,
    // The agent account it runs on otherwise; the stage's account says which.
    account?: AccountLaunch | null
  ): Promise<Conversation> {
    const { id } = current
    const { agent } = stage
    // For a chat platform's asker it starts locked down or not at all: no vault, no skills, none of
    // the user's MCP servers, and only an agent that says it can.
    const locked = current.channel ? this.channelTools : null
    if (current.channel && (!locked || !agentDescriptor(agent).capabilities.lockdown)) {
      this.store.deleteStage(stage.id)
      throw new Rejection('agent-no-lockdown', `${agentDescriptor(agent).label} cannot answer from a chat platform`)
    }
    const knowledgeBase = locked ? undefined : await this.stageKnowledgeBase(current, stage)
    const skills = locked ? null : await this.skillsFor?.(agent, current.profile?.skills).catch((error: unknown) => {
      this.wire?.record(id, stage.id, [{ dir: 'note', text: JSON.stringify({ event: 'skills-unavailable', error: error instanceof Error ? error.message : String(error) }) }])
      return null
    }) ?? null
    let userMcp: AgentMcpServer[] = []
    try {
      userMcp = locked ? [] : this.userMcpFor?.(agent, Boolean(current.discussionId || current.workspaceReadOnly || stage.planOnly), current.profile?.mcpServers) ?? []
    } catch (error) {
      this.wire?.record(id, stage.id, [{ dir: 'note', text: JSON.stringify({ event: 'user-mcp-unavailable', error: error instanceof Error ? error.message : String(error) }) }])
    }
    const { options } = this.chatStage(current, stage, forkAt, knowledgeBase, userMcp)
    const { launch } = adapterOf(agent)
    const agentStage = this.agentStage(id, stage)
    const agentLaunch: AgentLaunch = locked ? {
      ...(stage.backend ? { backend: stage.backend } : {}),
      instructions: channelPrompt(current.profile, locked.instructions?.(id)),
      providerSessionId: stage.providerSessionId,
      resume,
      handoffPath: null,
      extraProjects: [],
      preferred: { model: options.preferred?.model, effort: options.preferred?.effort },
      mcp: options.mcp,
      todos: false,
      lockdown: { tools: locked.tools(id) },
      ...(provider ? { provider } : {}),
      ...(account?.env ? { account: { id: account.id, env: account.env } } : {})
    } : {
      ...(stage.backend ? { backend: stage.backend } : {}),
      instructions: this.roleInstructions(current),
      providerSessionId: stage.providerSessionId,
      resume,
      handoffPath: handoff?.path ?? null,
      extraProjects: options.extraDirs,
      preferred: options.preferred,
      allowBypass: options.allowBypass,
      planOnly: options.planOnly ? { dirs: [options.cwd, ...options.extraDirs] } : undefined,
      readOnly: options.readOnly ? { dirs: [options.cwd, ...options.extraDirs] } : undefined,
      // What the user pasted as files into this conversation, which the agent reads without asking.
      readable: [...readable, `${this.attachments.pastedTextDir(id)}/**`],
      ...(current.referencePaths?.length ? { references: current.referencePaths } : {}),
      forkAt,
      // As its adapter starts it, for an agent that takes it on its command (OpenCode's config).
      ...(this.mcp ? { mcp: launch ? launch.mcp(this.mcp(id), agentStage) : this.mcp(id) } : {}),
      ...(userMcp.length ? { userMcp } : {}),
      ...(this.userBrowser === undefined ? {} : { userBrowser: this.userBrowser }),
      todos: this.userTodos && !current.discussionId && !current.parentConversationId,
      ...(knowledgeBase ? { knowledgeBase } : {}),
      ...(skills ? { skills } : {}),
      ...(provider ? { provider } : {}),
      ...(account?.env ? { account: { id: account.id, env: account.env } } : {})
    }
    const command = adapterOf(agent).command(agentLaunch)
    const launched: StageRef = { sessionsRoot: this.sessionsRoot, conversationId: id, stageId: stage.id }
    let sessionId: string
    this.preparing.add(stage.id)
    try {
      let env = command.env ?? {}
      let unsetEnv = [...(command.unsetEnv ?? [])]
      if (launch) {
        const prepared = await launch.prepare(agentStage, options.mcp, agentLaunch)
        if (prepared.command) command.command = prepared.command
        if (prepared.args) command.args = [...command.args, ...prepared.args]
        if (prepared.env) env = { ...env, ...prepared.env }
        if (prepared.unsetEnv?.length) unsetEnv = [...new Set([...unsetEnv, ...prepared.unsetEnv])]
      }
      await refreshActiveAgentProxy()
      const proxy = applyActiveAgentProxy(agent, env, unsetEnv, Boolean(locked))
      env = proxy.env
      unsetEnv = proxy.unsetEnv
      this.wire?.record(id, stage.id, [{ dir: 'spawn', text: JSON.stringify({ command: command.command, args: command.args, cwd: current.workspacePath }) }])
      if (unsetEnv.length && !(await this.daemon.request('info', {})).features?.includes('unset-env')) {
        ({ env, unsetEnv } = blankProxyUnset({ env, unsetEnv }))
        if (unsetEnv.length) throw new Rejection('daemon-outdated', '当前运行的 Antumi 后台版本过旧，无法安全隔离环境变量，请重启后台后重试')
      }
      // Locked down, it gets none of the daemon's own environment either (the user's keys and tokens).
      const spawned = await agentCliAccess.use(agent, () => this.daemon.request(locked ? 'spawnPipeClean' : 'spawnPipe', { agent, command: command.command, args: command.args, cwd: current.workspacePath, env: { ...env, [PROCESS_OWNER_ENV]: processOwner({ kind: 'conversation', id }) }, ...(unsetEnv.length ? { unsetEnv } : {}) }))
      sessionId = spawned.sessionId
      this.launches.set(sessionId, { ...launched, at: Date.now() })
      this.preparing.delete(stage.id)
    } catch (error) {
      // What the launch wrote goes, unless the daemon may have started the process all the same
      // (its answer lost with the connection): then the sweep after reconnecting weighs it.
      if (!(error instanceof Rejection && error.reason === 'daemon-unavailable')) await removeLaunch(launched).catch((failure: unknown) => this.launchStuck(launched, failure))
      this.store.deleteStage(stage.id)
      this.preparing.delete(stage.id)
      throw error instanceof Rejection && error.reason === 'unknown-method'
        ? new Rejection('daemon-outdated', 'the running daemon predates chat mode; restart it')
        : error
    }
    try {
      this.store.attachStage(stage.id, sessionId)
      this.changed(this.store.update(id, { agent, sessionId }))
      if (launch) {
        this.wire?.record(id, stage.id, [{
          dir: 'note',
          text: JSON.stringify({ event: `${agent}-lifecycle`, phase: 'process-spawned', sessionId })
        }])
      }
      const opened = this.chatStage(current, stage, forkAt, knowledgeBase, userMcp)
      const pending = this.launching.get(id)
      const opening: OpeningChat = { sessionId, stop: null }
      if (pending) pending.opening = opening
      try {
        await this.chats.open(opened, sessionId, 0, true)
      } finally {
        // Authentication can finish just as stop arrives. Honour a confirmed stop before any
        // handoff or first message, and keep the launch reserved until its cleanup is done.
        if (opening.stop && await opening.stop.then(() => true, () => false)) {
          throw new Rejection('chat-start-cancelled', '智能体启动已取消')
        }
        if (pending) pending.opening = null
      }
      const retired = this.rememberedOnProvider(this.store.chatOptions(id)[agent], opened.options.providerModels, adapterOf(agent))
      if (retired.dropped) this.chats.updateNotice(opened, { dir: 'note', at: Date.now(), level: 'info', id: `provider-model:${stage.id}`, text: `服务商不再提供上次用的模型 ${retired.dropped}，这次改用它的默认模型 ${retired.instead ?? ''}`.trim() })
      await launch?.ready(agentStage)
      if (handoff) {
        const message = handoffMessage(handoff.path, handoff.note)
        await this.chats.send(id, message, handoff.images ?? [], false, false, handoff.ref, chatReferencesFor(handoff.note, message, handoff.references))
      }
    } catch (error) {
      if (current.autoInvestigationId && handoff?.ref && this.sourceDeliveryReceipt(id, handoff.ref, 'uncertain')) throw error
      // A stage that never started leaves nothing to resume, so it goes, log and all.
      this.chats.forget(sessionId, stage.id)
      if (!(error instanceof Rejection && error.reason === 'chat-start-cancelled')) {
        await this.daemon.request('kill', { sessionId, force: true }).catch(() => {})
      }
      this.store.deleteStage(stage.id)
      await rm(ChatLog.of(this.sessionsRoot, id, stage.id).file, { force: true })
      this.changed(this.store.update(id, { sessionId: null }))
      throw error
    }
    // Only move queued messages after startup can no longer delete the new stage on rollback.
    const previous = this.store.stages(id).filter((candidate) => candidate.id !== stage.id).at(-1)
    if (previous) this.chats.restoreQueue(id, this.chatStage(current, previous))
    // Announced again now that the agent can take a message: clients learn it is idle.
    return this.changed(this.store.touch(id))
  }

  // A picture a tool returned in its bytes (an MCP screenshot), kept so the chat can show it after
  // the log has left the bytes out. One the store refuses (too large, not an image) stays a placeholder.
  private keepImage(data: string): ChatImage | null {
    try {
      const { id, width, height } = this.attachments.putSync(Buffer.from(data, 'base64'))
      return { id, width, height }
    } catch {
      return null
    }
  }

  // forkAt: only while the stage is being opened as a fork; a stage taken back later resumes the
  // session the fork made, which the stage then holds. knowledgeBase and userMcp: only at a start,
  // as its process was given them; a stage taken back keeps what its process started with.
  private roleInstructions(conversation: Conversation): string {
    const profile = conversation.profile
    const notes = [profile ? `你是用户配置的智能体「${profile.name}」。\n${profile.instructions}` : '']
    if (!this.automaticInvestigation?.owns(conversation.id) && this.delegationAvailable?.(conversation.id) && !conversation.parentConversationId && !conversation.discussionId && !conversation.squadRunId && !conversation.routineId && !isHelper(conversation)) {
      notes.push('用户用 @ 点名智能体时，先查找对应智能体并委派，不要自行代替它回答。需要其他专业智能体协助时，可用 Antumi 的 antumi_agent_list 查找可调用的智能体（用户配置的，以及本机可直接调用的外部智能体），再用 antumi_agent_dispatch 委派具体子任务（说明目标、必要背景、文件范围和交付要求）。这是独立子会话，不自动继承聊天历史。只读委派和 workspace: worktree 的开发委派派出即开始，在主会话目录里改文件的开发委派等这一轮结束才开始；派出只读审阅后，别再改派给它看的那些文件，等它的结果回来。结果都在这一轮结束后交回，Antumi 会自动继续当前会话，所以派完没有别的事就结束回合。用 antumi_agent_status 查看进度；不要反复轮询。跨很多目录、彼此不重叠的机械性改动，可以拆成几个 workspace: worktree 的开发委派同时做：先把自己的改动提交，派出后可以继续做不相关的事，但别改派出去的那些文件；结果回来后合并各个分支（git merge），解决冲突，重新跑检查。')
      notes.push('用户 @团队（含 antumi://squad/<id> 引用）时，用 antumi_team_list 查找准确团队，再用 antumi_team_dispatch 交给该团队，不代替团队完成。指令须带必要背景、项目范围和验收标准。团队在独立任务工作区开发，按当前授权直接执行。派出后结束回合，结果会自动交回；收到有效提交后检查主工作区并在当前授权内合并、解决冲突和重新验证，不自动 push 或接受任务。')
    }
    return notes.filter(Boolean).join('\n\n')
  }

  private chatStage(conversation: Conversation, stage: ConversationStage, forkAt: string | null = null, knowledgeBase?: KnowledgeBase, userMcp: readonly AgentMcpServer[] = []): ChatStage {
    const chosen = this.store.chatOptions(conversation.id)
    const mcp = conversation.channel ? this.channelTools?.mcp(conversation.id) : this.mcp?.(conversation.id)
    let permissionMode = isHelper(conversation) && chosen.permissionMode && !helperAllowsMode(chosen.permissionMode) ? 'ask' : chosen.permissionMode
    const adapter = adapterOf(stage.agent)
    const { fallbackMode, launch, providerModels } = adapter
    const allowBypass = !stage.planOnly && !conversation.workspaceReadOnly && (chosen.allowBypass ?? false)
    const permissionModes = adapter.permissionModesFor?.(stage.backend) ?? adapter.permissionModes
    const restartModes: readonly string[] = adapter.restartForModes?.(stage.backend) ?? []
    if (!allowBypass && permissionMode === 'bypass' && restartModes.includes('bypass')) permissionMode = fallbackMode ?? 'ask'
    if (fallbackMode && (!permissionMode || !permissionModes.includes(permissionMode))) permissionMode = fallbackMode
    const onProvider = stage.route ? providerModels?.(stage.route) ?? [] : undefined
    const remembered = this.rememberedOnProvider(chosen[stage.agent], onProvider, adapter)
    // Auto only where the model on this route takes it (a run nobody watches chose it by the
    // agent's own catalog, not knowing the route): the next mode such a run would take instead.
    if (permissionMode === 'auto' && onProvider) {
      const offered = startModes(stage.agent, onProvider.find((each) => remembered.preferred.model ? each.id === remembered.preferred.model : each.isDefault))
      if (!offered.includes('auto')) permissionMode = unattendedPermission(stage.agent, 'acceptEdits', offered) ?? fallbackMode ?? 'ask'
    }
    return {
      conversationId: conversation.id,
      stageId: stage.id,
      agent: stage.agent,
      ended: stage.endedAt != null,
      options: {
        ...(stage.backend ? { backend: stage.backend } : {}),
        ...(conversation.channel ? { lockdown: true } : {}),
        instructions: conversation.channel ? channelPrompt(conversation.profile, this.channelTools?.instructions?.(conversation.id)) : this.roleInstructions(conversation),
        cwd: conversation.workspacePath,
        ...(mcp ? { mcp: launch ? launch.mcp(mcp, this.agentStage(conversation.id, stage)) : mcp } : {}),
        extraDirs: conversation.projectPaths.slice(1),
        ...(conversation.referencePaths?.length ? { references: conversation.referencePaths } : {}),
        resume: stage.providerSessionId,
        fork: forkAt,
        // Both constraints survive a restart; coordination is not task planning.
        planOnly: Boolean(stage.planOnly),
        readOnly: !stage.planOnly && Boolean(conversation.workspaceReadOnly),
        allowBypass,
        promptSuggestions: this.promptSuggestions,
        preferred: { permissionMode, ...remembered.preferred },
        keepImage: (data) => this.keepImage(data),
        todos: this.userTodos && !conversation.discussionId && !conversation.parentConversationId && !conversation.channel,
        ...(knowledgeBase ? { knowledgeBase } : {}),
        ...(userMcp.length ? { userMcp } : {}),
        ...(onProvider ? { providerModels: onProvider } : {})
      }
    }
  }

  // The model and effort the conversation last ran with, as a stage on a provider can take them: one
  // the provider no longer serves is dropped, so the stage starts on its default model rather than
  // fail, and its effort goes too unless that model takes it. Never another provider's or the
  // agent's own account: the stage stays on its provider's models.
  private rememberedOnProvider(remembered: { model?: string; effort?: string } | undefined, offered: readonly ChatModel[] | undefined, adapter?: AgentAdapter): { preferred: { model?: string; effort?: string }; dropped: string | null; instead: string | null } {
    const preferred = remembered ?? {}
    if (!offered || !preferred.model) return { preferred, dropped: null, instead: null }
    const matched = offered.find((model) => model.id === preferred.model) ?? adapter?.matchProviderModel?.(preferred.model, offered)
    if (matched) return { preferred: matched.id === preferred.model ? preferred : { ...preferred, model: matched.id }, dropped: null, instead: null }
    const fallback = offered.find((model) => model.isDefault) ?? offered[0]
    const effort = preferred.effort && fallback?.efforts.includes(preferred.effort) ? { effort: preferred.effort } : {}
    return { preferred: effort, dropped: preferred.model, instead: fallback ? fallback.label : null }
  }

  private agentStage(conversationId: string, stage: ConversationStage): AgentStage {
    return { sessionsRoot: this.sessionsRoot, conversationId, stageId: stage.id, planOnly: Boolean(stage.planOnly || this.get(conversationId).workspaceReadOnly) }
  }

  // Remembered for the conversation's next start once the stage took it: a model or effort here,
  // a permission mode when the stage reports it (see rememberMode). With no agent running, only
  // remembered, from what the last chat stage offered.
  async setOption(id: string, option: ChatOption, value: string): Promise<void> {
    const conversation = this.get(id)
    if (conversation.squadRunId || conversation.parentConversationId || conversation.workspaceReadOnly) throw new Rejection(conversation.profile ? 'profile-managed' : 'squad-managed', conversation.profile ? '本次运行沿用智能体配置' : '本次运行沿用团队配置')
    if (isHelper(conversation) && option === 'permissionMode' && !helperAllowsMode(value)) throw new Rejection('chat-option-invalid', '小助手不能只做规划')
    const { agent } = conversation
    if (isHelper(conversation) && this.chats.activity(id) === null && this.store.stages(id).length === 0) {
      if (option === 'permissionMode') {
        await this.validateStartOptions(conversation.agent, { permissionMode: value })
        this.store.setChatOptions(id, { permissionMode: value })
        this.changed(this.get(id))
        return
      }
      const chosen = this.store.chatOptions(id)[conversation.agent] ?? {}
      const choice = option === 'model' ? { model: value } : { ...chosen, effort: value }
      await this.validateStartOptions(conversation.agent, choice, this.catalogProvider(conversation, conversation.agent))
      this.store.setChatOptions(id, { [conversation.agent]: choice })
      this.changed(this.get(id))
      return
    }
    if (this.chats.activity(id) === null) {
      await this.chooseForNextStart(conversation, option, value)
      return
    }
    if (option === 'permissionMode') {
      const stage = this.store.activeStage(id)
      const adapter = adapterOf(agent)
      const restartModes: readonly string[] = adapter.restartForModes?.(stage?.backend) ?? []
      if (restartModes.length > 0 && stage) {
        const state = this.chats.items(this.chatStage(conversation, stage)).findLast((item) => item.kind === 'state')
        const currentMode = state?.kind === 'state' ? state.permissionMode : this.store.chatOptions(id).permissionMode ?? null
        if (value === currentMode && restartModes.includes(value)) return
        const transitions = value !== currentMode && (restartModes.includes(value) || (currentMode !== null && restartModes.includes(currentMode)))
        if (transitions) {
          if (this.launching.has(id)) throw new Rejection('conversation-running')
          if (this.chats.activity(id) !== 'idle') throw new Rejection('chat-busy', '请在回合结束后切换模式或模型')
          if (conversation.planOnly && value !== 'plan') throw new Rejection('plan-only', '此阶段只能规划')
          if (value === 'bypass' && !this.allowsBypass(id)) throw new Rejection('chat-option-invalid', '当前会话未开启全部放行授权')
          const allowed = state?.kind === 'state' && state.permissionModes.length
            ? state.permissionModes
            : (adapter.permissionModesFor?.(stage.backend) ?? adapter.permissionModes)
          if (!allowed.includes(value)) throw new Rejection('chat-option-invalid', `${agent} offers no permission mode ${value}`)
          const previousOptions = this.store.chatOptions(id)
          const preservedAgentChoice = state?.kind === 'state'
            ? {
                ...previousOptions[agent],
                ...(state.model ? { model: state.model } : {}),
                ...(state.effort ? { effort: state.effort } : {})
              }
            : previousOptions[agent]
          const pinnedBackend = stage.backend ?? agentDescriptor(agent).legacyBackend ?? null
          const pinnedAccount = stage.account ?? undefined
          await this.stop(id, true)
          this.store.setChatOptions(id, {
            permissionMode: value,
            ...(preservedAgentChoice ? { [agent]: preservedAgentChoice } : {})
          })
          try {
            await this.start(id, agent, '', false, {
              planOnly: conversation.planOnly,
              backend: pinnedBackend,
              ...(pinnedAccount !== undefined ? { account: pinnedAccount } : {})
            })
          } catch (error) {
            this.store.setChatOptions(id, {
              permissionMode: previousOptions.permissionMode,
              ...(previousOptions[agent] !== undefined ? { [agent]: previousOptions[agent] } : {})
            })
            this.changed(this.get(id))
            throw error
          }
          return
        }
      }
    }
    await this.chats.setOption(id, option, value)
    if (option === 'permissionMode') return
    if (adapterOf(agent).optionsFromState) {
      const stage = this.store.activeStage(id)
      const state = stage ? this.chats.items(this.chatStage(conversation, stage)).findLast((item) => item.kind === 'state') : null
      const existing = this.store.chatOptions(id)[agent]
      if (state?.kind === 'state') this.store.setChatOptions(id, { [agent]: { ...existing, model: state.model ?? undefined, effort: state.effort ?? undefined } })
      return
    }
    const chosen = this.store.chatOptions(id)
    this.store.setChatOptions(id, { [agent]: { ...chosen[agent], [option]: value } })
  }

  private async chooseForNextStart(conversation: Conversation, option: ChatOption, value: string): Promise<void> {
    const { id, agent } = conversation
    const stage = this.store.stages(id).at(-1)
    const state = stage?.agent === agent
      ? this.chats.items(this.chatStage(conversation, stage)).findLast((item) => item.kind === 'state')
      : undefined
    // Imported transcripts have messages but no model catalog until their first resume.
    const models = state?.models.length ? state.models : (await this.chatCatalog(agent, this.catalogProvider(conversation, agent)))?.models ?? []
    const latest = this.get(id)
    if (latest.agent !== agent || latest.sessionId !== conversation.sessionId || this.store.stages(id).at(-1)?.id !== stage?.id) return this.setOption(id, option, value)
    const adapter = adapterOf(agent)
    const backend = stage?.agent === agent
      ? (stage.backend ?? agentDescriptor(agent).legacyBackend ?? null)
      : ((await adapter.resolveBackend?.()) ?? null)
    const backendModes: readonly string[] | undefined = backend ? agentDescriptor(agent).backendModes?.[backend] : undefined
    const permissionModes = !backendModes && state?.permissionModes.length
      ? state.permissionModes
      : conversation.planOnly ? ['plan'] : startModes(agent, models.find((each) => each.isDefault), backend)
    const canBypass = backendModes ? backendModes.includes('bypass') : agentDescriptor(agent).capabilities.bypass
    const chosen = this.store.chatOptions(id)
    const current = chosen[agent] ?? {}
    const model = (name: string | null | undefined) => models.find((each) => each.id === name)
    if (option === 'permissionMode') {
      // Bypass is for the start to allow, which asks the user's setting again.
      if ((value !== 'bypass' || !canBypass) && !permissionModes.includes(value)) throw new Rejection('chat-option-invalid', `${agent} offers no permission mode ${value}`)
      this.store.setChatOptions(id, { permissionMode: value })
    } else if (option === 'model') {
      const picked = model(value)
      if (!picked) throw new Rejection('chat-option-invalid', `${agent} lists no model ${value}`)
      // An effort the new model does not take would stop it from starting.
      const effort = current.effort && picked.efforts.includes(current.effort) ? current.effort : undefined
      this.store.setChatOptions(id, { [agent]: { ...current, model: value, effort } })
    } else {
      if (!model(current.model ?? state?.model ?? models.find((each) => each.isDefault)?.id)?.efforts.includes(value)) throw new Rejection('chat-option-invalid', `the model takes no effort ${value}`)
      this.store.setChatOptions(id, { [agent]: { ...current, effort: value } })
    }
    this.changed(conversation)
  }

  // The account the conversation chose for its agent, while that agent still has it; undefined
  // follows the agent's active account.
  private keptAccount(id: string, agent: AgentKind): string | undefined {
    const account = this.store.chatOptions(id)[agent]?.account
    return account && this.accounts?.exists(agent, account) ? account : undefined
  }

  private requireAccount(agent: AgentKind, account: string, modelProvider: string | null): void {
    if (modelProvider) throw new Rejection('account-on-provider', '使用模型服务商的会话不用 Agent 账号')
    if (!this.accounts?.exists(agent, account)) throw new Rejection('account-unknown', '没有这个账号')
  }

  // An idle agent on another account is restarted on this one, resuming its session there; a task's
  // is only stopped, for the task to go on. One at work is left to finish first.
  async setAccount(id: string, account: string | null): Promise<Conversation> {
    const conversation = this.get(id)
    if (conversation.squadRunId || conversation.parentConversationId) throw new Rejection('squad-managed', '本次运行沿用团队配置')
    const { agent } = conversation
    if (account !== null) this.requireAccount(agent, account, conversation.modelProvider ?? null)
    if ((this.store.chatOptions(id)[agent]?.account ?? null) === account) return conversation
    const activity = this.chats.activity(id)
    if (activity !== null && activity !== 'idle') throw new Rejection('chat-busy', '请在回合结束后切换账号')
    const { account: _previous, ...rest } = this.store.chatOptions(id)[agent] ?? {}
    this.store.setChatOptions(id, { [agent]: account === null ? rest : { ...rest, account } })
    const stage = this.store.latestStage(id, agent)
    const runsOn = (account ?? this.accounts?.activeOf(agent)) ?? null
    if (activity !== null && stage && !stage.route && (stage.account ?? null) !== runsOn) {
      await this.stop(id)
      return conversation.taskId ? this.get(id) : this.continue(id)
    }
    this.changed(this.get(id))
    return this.get(id)
  }

  invalidateCli(agent: AgentKind): void { this.catalogs.delete(agent); this.freshCatalogs.add(agent) }

  // What a new chat can pick from before its agent starts: the models the agent listed last,
  // kept as each chat stage reports them, read back from the newest stage after a restart, and
  // asked of the CLI only when it never ran a chat. On a provider, the provider's models; null
  // where it does not serve the agent.
  chatCatalog(agent: AgentKind, providerId?: string, refresh = false): Promise<ChatCatalog | null> {
    if (providerId !== undefined) {
      const provider = this.providers?.get(providerId)
      const offered = provider && providerEndpoint(provider, agent) ? adapterOf(agent).providerModels?.({ ...provider, providerId }) : undefined
      return Promise.resolve(offered ? { models: offered } : null)
    }
    if (refresh) this.invalidateCli(agent)
    const known = this.catalogs.get(agent)
    if (known) return known
    const adapter = adapterOf(agent)
    const found = this.freshCatalogs.has(agent) || adapter.partialStageCatalog ? null : this.catalogFromStages(agent)
    const activeAccountCtx = async () => {
      if (!this.accounts) return undefined
      const launched = await this.accounts.launch(agent)
      if (!launched) return undefined
      const home = this.accounts.home?.(agent, launched.id) ?? launched.env?.GEMINI_HOME
      return { id: launched.id, ...(home ? { home } : {}), ...(launched.env ? { env: launched.env } : {}) }
    }
    const catalog = found ? Promise.resolve(found) : agentCliAccess.use(agent, async () => adapter.catalog ? adapter.catalog(this.sessionsRoot, await activeAccountCtx()) : this.probeCatalog(agent)).then((result) => {
      if (this.catalogs.get(agent) === catalog) this.catalogProblems.delete(agent)
      return result
    }, (error: unknown) => {
      if (this.catalogs.get(agent) === catalog) {
        if (error instanceof Rejection) this.catalogProblems.set(agent, { reason: error.reason, message: error.message })
        else this.catalogProblems.delete(agent)
      }
      return null
    })
    this.catalogs.set(agent, catalog)
    // A probe that failed is tried again next time rather than remembered.
    void catalog.then((result) => {
      if (this.catalogs.get(agent) !== catalog) return
      if (result) this.freshCatalogs.delete(agent)
      else this.catalogs.delete(agent)
    })
    return catalog
  }

  // What the last probe that failed said, so a picker with no models can say why.
  chatCatalogProblem(agent: AgentKind): { reason: string; message: string } | null {
    return this.catalogProblems.get(agent) ?? null
  }

  // On the agent's active account: the user's own may not be signed in.
  private async probeCatalog(agent: AgentKind): Promise<ChatCatalog | null> {
    const account = await this.accounts?.launch(agent)
    const adapter = adapterOf(agent)
    const backend = (await adapter.resolveBackend?.()) ?? null
    return probeChatCatalog(
      adapter.createDriver('catalog', { cwd: this.sessionsRoot, extraDirs: [], resume: null, ...(backend ? { backend } : {}) }),
      chatCommand(agent, null, false, null, [], { ...(backend ? { backend } : {}), ...(account?.env ? { account: { id: account.id, env: account.env } } : {}) }),
      this.sessionsRoot, undefined, agent
    )
  }

  private catalogFromStages(agent: AgentKind): ChatCatalog | null {
    const stage = this.store.latestChatStage(agent)
    const conversation = stage ? this.store.get(stage.conversationId) : null
    return stage && conversation ? catalogOf(this.chats.items(this.chatStage(this.withChat(conversation), stage))) : null
  }

  // Only the agent's own catalog: one on a provider lists the provider's models.
  private rememberCatalog(conversationId: string, items: readonly ChatItem[]): void {
    if (this.store.activeStage(conversationId)?.route) return
    const catalog = catalogOf(items)
    const agent = this.store.get(conversationId)?.agent
    if (catalog && agent && !adapterOf(agent).partialStageCatalog) this.catalogs.set(agent, Promise.resolve(catalog))
  }

  // Lists read a small saved summary instead of replaying every conversation's chat log.
  private rememberContext(conversationId: string, items: readonly ChatItem[]): void {
    let changed = false
    for (const item of items) {
      if (item.kind === 'state' && this.store.setStageContext(item.stageId, item.context)) changed = true
    }
    if (!changed) return
    const conversation = this.store.get(conversationId)
    if (conversation) this.changed(conversation)
  }

  // An idle chat agent goes after a while, so the ones open all day do not pile up; the next
  // message starts it again on the same session. Idle means the agent says so: a turn, a question
  // for the user or a command left running in the background keeps it.
  async releaseIdle(now = Date.now()): Promise<number> {
    let released = 0
    for (const id of this.chats.idleSince(now - CHAT_IDLE_MS)) {
      if (this.launching.has(id)) continue
      try {
        await this.stop(id)
        released++
      } catch (error) {
        console.error('[antumi-core] releasing an idle chat agent failed', error)
      }
    }
    return released
  }

  // The mode the stage runs in, however it got there: a plan approved to carry out with edits
  // accepted leaves the conversation in acceptEdits, not in the plan mode the user picked.
  private rememberMode(conversationId: string, items: readonly ChatItem[]): void {
    const mode = items.findLast((item) => item.kind === 'state')
    const conversation = this.store.get(conversationId)
    if (!conversation || mode?.kind !== 'state' || !mode.permissionMode || (isHelper(conversation) && !helperAllowsMode(mode.permissionMode))) return
    if (this.store.chatOptions(conversationId).permissionMode !== mode.permissionMode) {
      this.store.setChatOptions(conversationId, { permissionMode: mode.permissionMode })
    }
  }

  // A retry may resume in a new stage; its ref still names the original message.
  async send(id: string, text: string, imageIds: readonly string[] = [], queue = false, steer = false, ref?: string, references?: ChatReference[]): Promise<void> {
    const conversation = this.writable(id)
    if (this.preparingOf(conversation)) throw new Rejection('conversation-preparing', 'the issue is still being fetched')
    this.squadGuard?.(conversation)
    if (adapterOf(conversation.agent).turns?.serialized) {
      return this.serially(id, () => this.sendNow(id, text, imageIds, queue, steer, ref, references))
    }
    return this.sendNow(id, text, imageIds, queue, steer, ref, references)
  }

  private async sendNow(id: string, text: string, imageIds: readonly string[], queue: boolean, steer: boolean, ref?: string, references?: ChatReference[]): Promise<void> {
    this.gitSending.set(id, (this.gitSending.get(id) ?? 0) + 1)
    try {
      await this.gitGuard?.(this.get(id).projectPaths)
      if (ref && this.checkSentRef(id, ref, 0, true)) return
      const note = this.switchNote(id)
      const message = note ? branchSwitchMessage(note, text) : text
      await this.chats.send(id, message, await this.chatImages(imageIds), queue, steer, ref, chatReferencesFor(text, message, references))
      if (note) this.store.setSwitchedBranches(id, {})
    } finally { const pending = (this.gitSending.get(id) ?? 1) - 1; if (pending) this.gitSending.set(id, pending); else this.gitSending.delete(id) }
  }

  private async serially<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.serialActions.get(id) ?? Promise.resolve()
    const result = previous.catch(() => {}).then(action)
    const tail = result.then(() => {}, () => {})
    this.serialActions.set(id, tail)
    try {
      return await result
    } finally {
      if (this.serialActions.get(id) === tail) this.serialActions.delete(id)
    }
  }

  // Whether a message with this ref went to the agent in a chat stage still open at `since` or later.
  // Goes on for a scheduled run, with nobody there to answer: a plan waiting for approval is
  // approved, or the agent is readied in the unattended mode (`ready` starts it: a task's chat goes
  // through its task) and told to go ahead. A turn still running has the message wait behind it.
  // images go with the text; a message of pictures alone is sent as it is, not as the go-ahead.
  async runScheduled(id: string, text: string, images: readonly string[], mode: UnattendedMode, ready: () => Promise<unknown>, ref: string, references?: ChatReference[]): Promise<void> {
    const conversation = this.get(id)
    if (isHelper(conversation)) throw new Rejection('chat-option-invalid', '小助手不能无人值守执行')
    checkUnattended(conversation.agent)
    const permission = await this.unattendedChatMode(conversation, mode)
    this.markUnattended(id, mode, permission)
    const plan = this.waitingPlan(conversation)
    if (plan) {
      await this.chats.respond(id, plan.requestId, { decision: 'allowForSession' })
      // Carried out in the run's mode, not the one approving leaves it in; bypass only where the
      // stage was started allowing it.
      await this.chats.setOption(id, 'permissionMode', permission).catch(() => {})
      if (text || images.length) {
        const message = `${UNATTENDED_NOTE}\n\n${text}`.trim()
        await this.send(id, message, images, true, false, ref, chatReferencesFor(text, message, references))
      }
      return
    }
    const live = this.chats.activity(id) !== null
    const switched = live && await this.chats.setOption(id, 'permissionMode', permission).then(() => true, () => false)
    // A stage that cannot switch (one started without bypass allowed, say) never works on in the
    // mode it had, which may allow more than the run: an idle one starts again in the run's, a busy
    // one is tried again later. A planning stage changes nothing whatever its mode.
    if (live && !switched && !conversation.planOnly) {
      if (!this.chats.idle(id)) throw new Rejection('chat-busy', `the chat cannot switch to ${permission} while its agent works`)
      await this.stop(id)
    }
    if (this.chats.activity(id) === null) {
      this.store.setChatOptions(id, { permissionMode: permission, ...(mode === 'bypass' ? { allowBypass: true } : {}) })
      await ready()
    }
    const message = `${UNATTENDED_NOTE}\n\n${text || (images.length ? '' : SCHEDULED_GO_TEXT)}`.trim()
    await this.send(id, message, images, !this.chats.idle(id), false, ref, chatReferencesFor(text, message, references))
  }

  // The request id of the plan the conversation waits on the user to approve, if any.
  waitingPlanRequest(id: string): string | null {
    return this.waitingPlan(this.get(id))?.requestId ?? null
  }

  // The plan the live stage waits on the user to approve, if any.
  private waitingPlan(conversation: Conversation): { requestId: string } | null {
    const stage = this.chats.activity(conversation.id) === null ? null : this.store.activeStage(conversation.id)
    if (!stage) return null
    const item = this.chats.items(this.chatStage(conversation, stage))
      .findLast((each) => each.kind === 'approval' && isPlanApproval(each) && each.resolution === null)
    return item?.kind === 'approval' ? { requestId: item.requestId } : null
  }

  sentRef(id: string, ref: string, since: number): boolean {
    return this.checkSentRef(id, ref, since, false)
  }

  private checkSentRef(id: string, ref: string, since: number, checkUncertain: boolean): boolean {
    const conversation = this.get(id)
    for (const stage of this.store.stages(id)) {
      if (stage.endedAt !== null && stage.endedAt < since) continue
      const chat = this.chatStage(conversation, stage)
      if (checkUncertain) this.chats.assertDelivery(chat, ref)
      if (this.chats.submitted(chat, ref)) return true
      if (this.chats.items(chat).some((item) => item.id === `u:${ref}`) && !this.chats.undelivered(chat, ref)) return true
    }
    return false
  }

  sourceDeliveryReceipt(id: string, ref: string, known: import('@antumi/protocol').SourceDelivery['state']): import('./source-updates').SourceDeliveryReceipt | null {
    const conversation = this.store.get(id)
    if (!conversation) return { state: 'cancelled' }
    let result: import('./source-updates').SourceDeliveryReceipt | null = null
    for (const stage of this.store.stages(id)) {
      const records = ChatLog.of(this.sessionsRoot, id, stage.id).read().records
      const delivery = chatDeliveryStatus(records, ref)
      if (delivery === 'undelivered') result = { state: 'failed' }
      else if (delivery !== null) result = { state: known === 'submitted' || delivery === 'submitted' ? 'submitted' : 'uncertain' }
      else if (records.some((record) => record.dir === 'queue' && record.ref === ref && record.text !== null)) {
        const state = this.stageChatItems(id, stage.id).findLast((item) => item.kind === 'state')
        const entry = state?.kind === 'state' ? state.queue.find((entry) => entry.ref === ref) : undefined
        result = entry ? { state: entry.held || stage.endedAt !== null ? 'held' : 'queued' } : { state: 'cancelled' }
      }
    }
    return result
  }

  // One item as the stage holds it now, for whoever has news about it; null once it is gone.
  chatItem(id: string, stageId: string, itemId: string): ChatItem | null {
    return this.stageChatItems(id, stageId).find((item) => item.id === itemId) ?? null
  }

  // A chat stage's items, live or rebuilt from its log; none once the stage is gone.
  stageChatItems(id: string, stageId: string): ChatItem[] {
    const conversation = this.store.get(id)
    const stage = conversation ? this.store.stages(id).find((each) => each.id === stageId) : undefined
    const items = conversation && stage ? this.chats.items(this.chatStage(conversation, stage)) : []
    this.rememberContext(id, items)
    return items
  }

  // Who ran a chat stage, for what, and on which model as its state item last said; null once gone.
  stageFacts(id: string, stageId: string): { taskId: string | null; agent: AgentKind; model: string | null } | null {
    const conversation = this.store.get(id)
    const stage = conversation ? this.store.stages(id).find((each) => each.id === stageId) : undefined
    if (!conversation || !stage) return null
    const state = this.stageChatItems(id, stageId).findLast((item) => item.kind === 'state')
    return { taskId: conversation.taskId ?? null, agent: stage.agent, model: state?.kind === 'state' ? state.model : null }
  }

  costBaseline(id: string): CostBaseline {
    const source = this.get(id)
    const conversation = source.helperOf ? this.get(source.helperOf) : source
    const stage = this.store.stages(conversation.id).at(-1)
    const state = stage ? this.stageChatItems(conversation.id, stage.id).findLast((item) => item.kind === 'state') : undefined
    const model = state?.kind === 'state' ? state.billingModel ?? state.model : conversation.chatOptions?.model ?? null
    const context = state?.kind === 'state' ? state.context?.used ?? null : null
    // A provider's plan is not priced like the agent's own models, even where a name matches.
    return { model, context, price: stage?.route ? null : modelPrice(agentDescriptor(conversation.agent).prices, model, Date.now()) }
  }

  // Every chat stage of every conversation, task chats included, oldest first.
  chatStageRefs(): ChatStageRef[] {
    return this.store.list().flatMap((conversation) => this.store.stages(conversation.id)
      .map((stage) => ({ conversationId: conversation.id, taskId: conversation.taskId ?? null, stageId: stage.id, agent: stage.agent, ended: stage.endedAt !== null })))
  }

  // Each image once, checked to be in the store before the agent is asked to look at it.
  private async chatImages(ids: readonly string[]): Promise<ChatImage[]> {
    const images: ChatImage[] = []
    for (const id of new Set(ids)) {
      const info = await this.attachments.info(id)
      if (!info) throw new Rejection('attachment-not-found', `no image ${id}`)
      images.push({ id, width: info.width, height: info.height })
    }
    return images
  }

  moveQueued(id: string, ref: string, direction: 'up' | 'down'): void {
    this.get(id)
    this.chats.moveQueued(id, ref, direction)
  }

  cancelQueued(id: string, ref?: string): void {
    this.get(id)
    this.chats.cancelQueued(id, ref)
  }

  async sendQueued(id: string, ref?: string, now = false): Promise<void> {
    this.gitSending.set(id, (this.gitSending.get(id) ?? 0) + 1)
    try {
      await this.gitGuard?.(this.get(id).projectPaths)
      await this.chats.sendQueued(id, ref, now)
    } finally { const pending = (this.gitSending.get(id) ?? 1) - 1; if (pending) this.gitSending.set(id, pending); else this.gitSending.delete(id) }
  }

  // Asks the user, in the running chat, whether the browser may open a site; the card stays
  // until they answer, the agent leaves, or the turn is interrupted.
  askHost(id: string, host: string, url: string): Promise<ChatDecision | typeof ALLOW_SITE_ALWAYS> {
    // With no agent left in the conversation, what takes its tab elsewhere is the user or the page
    // itself (a form's redirect), which the gate is not there to stop; and there is no chat to ask
    // in, so asking would refuse it and leave the tab on a blank error page.
    if (!this.store.get(id)?.sessionId && !this.launching.has(id)) return Promise.resolve('allow')
    const requestId = this.chats.ask(id, { kind: 'browser-host', host, url })
    return new Promise((resolve, reject) => this.asks.set(requestId, {
      resolve: (answer) => resolve(answer.choice === ALLOW_SITE_ALWAYS && answer.decision !== 'deny' ? ALLOW_SITE_ALWAYS : answer.decision),
      reject
    }))
  }

  // Asks the user, in the running chat, whether a command the agent wants may run in a terminal
  // of its own; the same card, and the same answers, as a site the browser would open.
  askTerminal(id: string, command: string, cwd: string): Promise<ChatDecision> {
    const requestId = this.chats.ask(id, { kind: 'terminal-run', command, cwd })
    return new Promise((resolve, reject) => this.asks.set(requestId, { resolve: (answer) => resolve(answer.decision), reject }))
  }

  // Asks the user, in the running chat, whether the agent may open the pull request it drafted
  // (its title, and branch → base); the same card and answers again.
  askPullRequest(id: string, title: string, detail: string): Promise<ChatDecision> {
    const requestId = this.chats.ask(id, { kind: 'pull-request', title, detail })
    return new Promise((resolve, reject) => this.asks.set(requestId, { resolve: (answer) => resolve(answer.decision), reject }))
  }

  // A question of Antumi's answered as cancelled (the agent went, the stage was replayed) has
  // nobody left to tell; its waiter learns so here.
  private settleAsks(items: readonly ChatItem[]): void {
    for (const item of items) {
      if (item.kind !== 'approval' || item.resolution !== 'cancelled' || !isAntumiRequest(item.requestId)) continue
      this.asks.get(item.requestId)?.reject(new Rejection('chat-request-gone', 'the question was withdrawn'))
      this.asks.delete(item.requestId)
    }
  }

  // A run nobody watches starting here, or going on (see unattended).
  markUnattended(id: string, mode: UnattendedMode, permission: ChatPermissionMode): void {
    this.unattended.set(id, { mode, permission })
  }

  // The mode a run nobody watches starts a new chat of `agent` in, by what its model takes there.
  async unattendedStartMode(agent: AgentKind, mode: UnattendedMode, model?: string | null, providerId?: string): Promise<ChatPermissionMode> {
    if (mode === 'bypass') return 'bypass'
    const models = (await this.chatCatalog(agent, providerId))?.models ?? []
    const permission = unattendedPermission(agent, mode, startModes(agent, models.find((each) => model ? each.id === model : each.isDefault)))
    if (!permission) throw new Rejection('chat-option-invalid', `${agent} has no mode a careful unattended run can work in`)
    return permission
  }

  // The same for a conversation's chat: of the modes its stage offers, else as it would start.
  private async unattendedChatMode(conversation: Conversation, mode: UnattendedMode): Promise<ChatPermissionMode> {
    if (mode === 'bypass') return 'bypass'
    const stage = this.store.stages(conversation.id).at(-1)
    const state = stage?.agent === conversation.agent ? this.chats.items(this.chatStage(conversation, stage)).findLast((item) => item.kind === 'state') : undefined
    const offered = state?.kind === 'state' ? unattendedPermission(conversation.agent, mode, state.permissionModes) : null
    return offered ?? this.unattendedStartMode(conversation.agent, mode, this.store.chatOptions(conversation.id)[conversation.agent]?.model, this.catalogProvider(conversation, conversation.agent))
  }

  // The user acting in the conversation: what its agent asks from now on waits for them.
  attend(id: string): void {
    this.unattended.delete(id)
    for (const [key, timer] of this.heldQuestions) {
      if (!key.startsWith(`${id}:`)) continue
      clearTimeout(timer)
      this.heldQuestions.delete(key)
    }
  }

  // The user answering a request: they are here (attend), unless it is a question a run nobody
  // watches held for them, which is no sign they stay, so the run goes on unattended.
  userAnswers(id: string, requestId: string): void {
    if (!this.heldQuestions.has(`${id}:${requestId}`)) this.attend(id)
  }

  // Answered before ChatHost works out whether the stage waits on the user, so a run nobody
  // watches never shows, or notifies, as waiting: respond applies its answer at once. A question
  // is the exception: only the user can settle what the agent cannot tell, so it waits and
  // notifies as any would, and is answered for them only once nobody has.
  // An automatic investigation is such a run for as long as it owns its conversation, restarts included.
  private answerUnattended(conversationId: string, items: readonly ChatItem[]): void {
    if (!items.some((item) => item.kind === 'approval' || item.kind === 'question')) return
    const run = this.unattended.get(conversationId) ?? this.automaticInvestigation?.unattended?.(conversationId)
    if (!run) return
    for (const item of items) {
      if (item.kind !== 'approval' && item.kind !== 'question') continue
      const answer = unattendedAnswer(item, run.mode, run.reads, run.reads && item.kind === 'approval' ? this.approvedCommand(conversationId, items, item) : null)
      const key = `${conversationId}:${item.requestId}`
      if (!answer || this.autoAnswered.has(key)) continue
      this.autoAnswered.add(key)
      if (item.kind === 'question') {
        const timer = setTimeout(() => {
          this.heldQuestions.delete(key)
          this.answerFor(conversationId, item.stageId, item.requestId, answer)
        }, this.questionWaitMs)
        timer.unref()
        this.heldQuestions.set(key, timer)
        continue
      }
      // An approved plan is carried out in the run's mode, not the one approving leaves it in.
      const after = item.kind === 'approval' && isPlanApproval(item) && answer.decision !== 'deny' ? () => this.chats.setOption(conversationId, 'permissionMode', run.permission) : undefined
      this.answerFor(conversationId, item.stageId, item.requestId, answer, after)
    }
  }

  // The full command an approval asks about, from its tool's card: its title holds only the first
  // line. A card shows a command as the command, or, under a name an ACP dialect gave it, as JSON.
  private approvedCommand(conversationId: string, items: readonly ChatItem[], approval: Extract<ChatItem, { kind: 'approval' }>): string | null {
    if (!approval.toolItemId) return null
    const stage = this.store.stages(conversationId).find((each) => each.id === approval.stageId)
    const tool = items.find((each) => each.id === approval.toolItemId)
      ?? (stage ? this.chats.items(this.chatStage(this.get(conversationId), stage)).find((each) => each.id === approval.toolItemId) : undefined)
    if (tool?.kind !== 'tool' || tool.input === null) return null
    if (!tool.input.startsWith('{')) return tool.input
    try { return z.looseObject({ command: z.string() }).safeParse(JSON.parse(tool.input)).data?.command ?? null } catch { return null }
  }

  // Whatever an agent answering a chat platform's asker asks for is refused at once: nobody there
  // may grant it, and the user is not asked on a stranger's behalf. A question is refused the same
  // way, so the agent says what it could not settle instead of waiting.
  private refuseForChannel(conversationId: string, items: readonly ChatItem[]): void {
    if (!items.some((item) => channelAnswer(item)) || !this.store.get(conversationId)?.channel) return
    for (const item of items) {
      const answer = channelAnswer(item)
      if (!answer || (item.kind !== 'approval' && item.kind !== 'question')) continue
      const key = `${conversationId}:${item.requestId}`
      if (this.autoAnswered.has(key)) continue
      this.autoAnswered.add(key)
      this.answerFor(conversationId, item.stageId, item.requestId, answer)
    }
  }

  private answerFor(conversationId: string, stageId: string, requestId: string, answer: ChatAnswer, after?: () => Promise<unknown>): void {
    void this.respond(conversationId, requestId, answer).then(after).catch((error: unknown) => {
      this.wire?.record(conversationId, stageId, [{ dir: 'note', text: JSON.stringify({ event: 'unattended-answer-failed', requestId, error: error instanceof Error ? error.message : String(error) }) }])
    })
  }

  async respond(id: string, requestId: string, answer: ChatAnswer): Promise<void> {
    clearTimeout(this.heldQuestions.get(`${id}:${requestId}`))
    this.heldQuestions.delete(`${id}:${requestId}`)
    const conversation = this.get(id)
    if (isHelper(conversation)) {
      const stage = this.store.activeStage(id)
      const request = stage ? this.chats.items(this.chatStage(conversation, stage)).find((item) => item.kind === 'approval' && item.requestId === requestId) : null
      const choice = request?.kind === 'approval' ? request.choices?.find((item) => item.id === answer.choice) : null
      if (answer.decision === 'allowForSession' || (answer.mode && !helperAllowsMode(answer.mode)) || choice?.grants.some((grant) => grant.behavior === 'allow')) throw new Rejection('chat-option-invalid', '小助手的写操作需要逐次批准')
    }
    if (isAntumiRequest(requestId)) {
      const resolution = answer.decision === 'allow' ? 'allowed' : answer.decision === 'allowForSession' ? 'allowedForSession' : 'denied'
      this.chats.answer(id, requestId, resolution, answer.message, answer.choice)
      this.asks.get(requestId)?.resolve(answer)
      this.asks.delete(requestId)
      return
    }
    const stage = this.store.activeStage(id)
    const item = conversation.taskId && stage
      ? this.chats.items(this.chatStage(conversation, stage)).find((each) => each.kind === 'approval' && each.requestId === requestId)
      : undefined
    await this.chats.respond(id, requestId, answer)
    if (stage && adapterOf(stage.agent).turns?.denialAsMessage && answer.decision === 'deny' && answer.message) await this.chats.send(id, answer.message, [], true)
    if (conversation.taskId && stage && item?.kind === 'approval' && isPlanApproval(item) && item.detail && answer.decision !== 'deny') {
      this.emit({ type: 'planApproved', taskId: conversation.taskId, plan: { markdown: item.detail, agent: stage.agent, stageId: stage.id, requestId } })
    }
  }

  async interrupt(id: string): Promise<void> {
    if (this.launching.get(id)?.opening) {
      await this.stop(id)
      return
    }
    const current = this.get(id)
    this.chats.cancelAsks(id)
    const grace = adapterOf(current.agent).turns?.stopAfterCancel
    if (!grace || !current.sessionId) {
      try { await this.chats.interrupt(id) }
      catch {
        if (!current.sessionId || this.get(id).sessionId !== current.sessionId) return
        await this.stop(id, true)
      }
      return
    }
    // Mark it intentional before writing cancel: the agent may obey and exit before the daemon's
    // write request itself has resolved.
    this.stopping.add(current.sessionId)
    try {
      await this.chats.interrupt(id)
      await this.stopAfterCancel(current.sessionId, grace)
    } catch (error) {
      this.stopping.delete(current.sessionId)
      throw error
    }
  }

  async stopBackground(id: string, itemId: string): Promise<void> {
    this.get(id)
    await this.chats.stopBackground(id, itemId)
  }

  async retryTurn(id: string, stageId: string, itemId: string): Promise<void> {
    await this.serially(id, async () => {
      const conversation = this.get(id)
      const { agent } = conversation
      const stage = this.store.stages(id).find((candidate) => candidate.id === stageId)
      if (!stage) throw new Rejection('stage-not-found', `no chat stage ${stageId}`)
      const notice = this.chats.items(this.chatStage(conversation, stage)).find((item) => item.id === itemId)
      if (notice?.kind !== 'notice' || notice.action?.kind !== 'retryTurn') {
        throw new Rejection('chat-item-not-found', `no retry action ${itemId}`)
      }
      const user = this.chats.items(this.chatStage(conversation, stage)).find((item) => item.id === notice.action?.userItemId)
      if (user?.kind !== 'user') throw new Rejection('chat-item-not-found', 'the message to retry is no longer available')
      const ref = user.id.slice(2)
      const undelivered = this.chats.undelivered(this.chatStage(conversation, stage), ref)
      if (!adapterOf(agent).turns?.retryByRestart && !undelivered) throw new Rejection('chat-option-invalid', `${agent} turns cannot reconnect this way`)
      if (undelivered && this.sentRef(id, ref, 0)) {
        this.chats.updateNotice(this.chatStage(conversation, stage), { dir: 'note', at: Date.now(), id: notice.id, level: 'info', text: '这条消息已在重新连接后送达。', action: null })
        return
      }

      // Offered while the turn was still silent: stopped first, if it still is.
      const silent = this.chats.silentTurn(id)
      if (notice.action.stop && silent !== null && `u:${silent}` === notice.action.userItemId) await this.interrupt(id)
      const active = this.get(id)
      if (active.sessionId) await this.cancelStops.get(active.sessionId)
      const ready = this.get(id)
      if (ready.sessionId && !this.chats.idle(id)) throw new Rejection('chat-busy', `${agent} is already working on another turn`)
      if (ready.sessionId) await this.stop(id)
      await this.start(id, agent, '', false)
      await this.sendNow(id, user.text, user.images.map((image) => image.id), false, false, undelivered ? ref : randomUUID(), user.references)
      this.chats.updateNotice(this.chatStage(conversation, stage), {
        dir: 'note',
        at: Date.now(),
        id: notice.id,
        level: notice.level,
        text: `已重新连接 ${agentDescriptor(agent).label}，并重新发送这条消息。`,
        action: null
      })
    })
  }

  // The newest chat stages' items, oldest first; `before` pages further back. With a limit, only
  // the newest that many (limitChatPage).
  chatPage(id: string, before?: string, limit?: number): { items: ChatItem[]; before: string | null; truncated?: boolean } {
    const conversation = this.get(id)
    const stages = this.store.stages(id)
    const until = before === undefined ? stages.length : stages.findIndex((stage) => stage.id === before)
    if (until < 0) throw new Rejection('stage-not-found', `no chat stage ${before}`)
    const pages: ChatItem[][] = []
    const most = Math.min(limit ?? CHAT_PAGE_ITEMS, CHAT_PAGE_ITEMS)
    let count = 0
    let index = until
    while (index > 0 && (pages.length === 0 || count < most)) {
      index--
      const items = this.chats.items(this.chatStage(conversation, stages[index]!))
      this.rememberContext(id, items)
      pages.unshift(items)
      count += items.length
    }
    if (limit === undefined || count <= limit) return { items: pages.flat(), before: index > 0 ? stages[index]!.id : null }
    const cut = limitChatPage(pages, index, limit)
    return { items: cut.items, before: cut.first > 0 ? stages[cut.first]!.id : null, ...(cut.truncated ? { truncated: true } : {}) }
  }

  async stop(id: string, requireExit = false): Promise<Conversation> {
    const pending = this.launching.get(id)
    if (pending) {
      const { opening } = pending
      if (!opening) throw new Rejection('conversation-running')
      opening.stop ??= this.stopAgent(opening.sessionId, true).catch((error: unknown) => {
        opening.stop = null
        throw error
      })
      await opening.stop
      await pending.finished
      return this.get(id)
    }
    const current = this.get(id)
    if (!current.sessionId) return current
    await this.stopAgent(current.sessionId, requireExit)
    await this.importHooks?.after(id)
    if (this.store.get(id)?.sessionId === null) return this.get(id)
    const stage = this.store.activeStage(id)
    if (stage) this.store.endStage(stage.id, null)
    const stopped = this.changed(this.store.update(id, { sessionId: null }))
    this.capacityReleased?.()
    return stopped
  }

  // An agent is gone only once the daemon says so: clearing the session any earlier would let a
  // continue start a second writer on the same Claude session or Codex thread.
  private async stopAgent(sessionId: string, requireExit = false): Promise<void> {
    const cancelStop = this.cancelStops.get(sessionId)
    if (cancelStop) return cancelStop
    const exited = new Promise<void>((resolve) => this.exitWaiters.set(sessionId, resolve))
    this.stopping.add(sessionId)
    try {
      await this.daemon.request('kill', { sessionId })
      if (await settles(exited, STOP_GRACE_MS)) return
      await this.daemon.request('kill', { sessionId, force: true }).catch(() => {})
      if (!(await settles(exited, KILL_GRACE_MS)) && requireExit) {
        throw new Rejection('chat-stop-timeout', '尚未确认智能体已停止，请重试')
      }
    } finally {
      this.exitWaiters.delete(sessionId)
      this.stopping.delete(sessionId)
    }
  }

  // The cancel has already been written. Give the agent its grace to obey it, then terminate the
  // process group, and force-kill the group only if it survives its second grace.
  private stopAfterCancel(sessionId: string, grace: CancelGrace): Promise<void> {
    const existing = this.cancelStops.get(sessionId)
    if (existing) return existing
    const stopping = this.finishStopAfterCancel(sessionId, grace)
    this.cancelStops.set(sessionId, stopping)
    const clear = () => {
      if (this.cancelStops.get(sessionId) === stopping) this.cancelStops.delete(sessionId)
    }
    void stopping.then(clear, clear)
    return stopping
  }

  private async finishStopAfterCancel(sessionId: string, grace: CancelGrace): Promise<void> {
    const exited = new Promise<void>((resolve) => this.exitWaiters.set(sessionId, resolve))
    this.stopping.add(sessionId)
    try {
      if (!this.store.bySession(sessionId) || await settles(exited, grace.cancelGraceMs)) return
      await this.daemon.request('kill', { sessionId }).catch(() => {})
      if (!this.store.bySession(sessionId) || await settles(exited, grace.termGraceMs)) return
      await this.daemon.request('kill', { sessionId, force: true }).catch(() => {})
      await settles(exited, KILL_GRACE_MS)
    } finally {
      this.exitWaiters.delete(sessionId)
      this.stopping.delete(sessionId)
    }
  }

  async delete(id: string): Promise<void> {
    this.free(id)
    await this.remove(id)
  }

  // Lets the images a deleted conversation used go, unless something else still refers to them.
  useAttachmentSweeper(sweeper: Pick<AttachmentSweeper, 'mentionedBy' | 'sweep'>): void {
    this.sweeper = sweeper
  }

  // A task's chat goes with its task; the worktrees it worked in stay.
  async deleteForTask(taskId: string): Promise<void> {
    const conversation = this.store.byTask(taskId)
    if (conversation) await this.remove(conversation.id)
  }

  // Lets a task's agent go, as a task given up or closed no longer needs it.
  async stopForTask(taskId: string): Promise<void> {
    const conversation = this.store.byTask(taskId)
    if (conversation) await this.callCleanup?.(conversation.id)
    if (conversation?.sessionId) await this.stop(conversation.id)
  }

  private async remove(id: string): Promise<void> {
    if (this.launching.has(id)) throw new Rejection('conversation-running')
    this.fetchingIssues.delete(id)
    this.retiring.add(id)
    this.attend(id)
    try {
      const current = this.get(id)
      await this.callCleanup?.(id)
      const helper = this.store.helper(id)
      if (helper) await this.remove(helper.id)
      for (const child of this.store.children(id)) await this.remove(child.id)
      if (current.sessionId) await this.stop(id)
      // Read before the logs go: what else still refers to these is for the sweep to say.
      const mentioned = await this.sweeper?.mentionedBy(id).catch(() => null)
      const directory = path.join(this.sessionsRoot, id)
      await rm(path.join(directory, 'handoffs'), { recursive: true, force: true })
      await rm(path.join(directory, 'stages'), { recursive: true, force: true })
      await rm(WireLog.directory(this.sessionsRoot, id), { recursive: true, force: true })
      // A confirmed exit may already be removing its launch files. Wait before trying to remove
      // their parent; a Windows sweep cannot tell that this known process has finished.
      await this.launchReleases.get(id)
      // Only folders no process is shown to use; the others stay until one is.
      await this.settleLaunches().catch((error: unknown) => console.error('[antumi-core] settling launch files failed', error))
      await rmdir(launchRoot(this.sessionsRoot, id)).catch(() => {})
      // The folder goes too, unless it still holds the workspace Antumi made, which stays.
      await rmdir(directory).catch(() => {})
      await rm(this.attachments.pastedTextDir(id), { recursive: true, force: true }).catch(() => {})
      this.store.delete(id)
      this.emit({ type: 'deleted', id })
      if (mentioned?.size) {
        void this.sweeper?.sweep(FREED_ATTACHMENT_GRACE_MS, mentioned)
          .catch((error: unknown) => console.error('[antumi-core] freeing a deleted conversation\'s images failed', error))
      }
    } finally { this.retiring.delete(id) }
  }

  // The message itself, then what it says about the rest.
  private recordChatMessage(chat: ChatStage, message: StageMessage): void {
    const conversation = this.store.get(chat.conversationId)
    const stage = this.store.stage(chat.stageId)
    if (!conversation || !stage) return
    const said = message.role === 'user' ? this.userPart(conversation.id, message.text) : message.text
    const text = said.trim()
    if (!text) return
    const saved = this.store.addMessage({
      conversationId: conversation.id, stageId: stage.id, role: message.role, agent: stage.agent,
      text, eventKey: message.eventKey, complete: message.complete
    })
    if (!saved) return
    if (message.role === 'assistant' && message.complete) this.store.completePendingUsers(stage.id)
    if (message.role === 'user' && !conversation.titleLocked && conversation.title === '新会话') {
      // The user's own words name it, not Antumi's note of a branch switch before them.
      const first = withoutBranchSwitchNote(text).split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, ' ')).find(Boolean)
      if (first) {
        this.changed(this.store.update(conversation.id, { title: [...first].slice(0, 40).join('') }))
        return
      }
    }
    this.changed(this.store.touch(conversation.id))
  }

  // Output before the host has opened the stage (core just restarted) is left: open() reads it from
  // the daemon's buffer.
  handleData(event: Extract<DaemonEvent, { event: 'data' }>): void {
    this.chats.handleData(event.sessionId, event.offset, event.data)
  }

  handleStderr(sessionId: string, data: string): void {
    this.chats.handleStderr(sessionId, data)
  }

  handleExit(sessionId: string, exitCode: number | null): void {
    this.chats.handleExit(sessionId, exitCode)
    this.releaseLaunch(sessionId)
    const stopped = this.stopping.has(sessionId)
    const current = this.store.bySession(sessionId)
    if (current) {
      const stage = this.store.activeStage(current.id)
      if (stage?.sessionId === sessionId) this.store.endStage(stage.id, stopped ? null : exitCode)
      void this.importHooks?.after(current.id).catch((error: unknown) => console.error('[antumi-core] observing imported session failed:', error))
      this.changed(this.store.update(current.id, { sessionId: null }))
    }
    this.exitWaiters.get(sessionId)?.()
    if (current) this.capacityReleased?.()
  }

  workingCount(): number {
    return this.store.list().reduce((count, conversation) =>
      count + (conversation.sessionId && this.chats.activity(conversation.id) === 'running' ? 1 : 0), 0)
  }

  // Every session the daemon still knows is drained before it counts as ended, so output from
  // while core was down is kept; only one the daemon never heard of ended unseen.
  // listedAt: when the daemon was asked for its sessions. A stage started since is not in the list,
  // and is no business of this one.
  async reconcile(sessions: readonly SessionInfo[], listedAt = Date.now()): Promise<void> {
    const known = new Map(sessions.map((session) => [session.sessionId, session]))
    // A chat's process no conversation holds (its start failed, or its answer was lost, with the
    // daemon away) has no one to stop it but this; one whose start is still under way is left to it.
    const claimed = new Set(this.store.list().flatMap((conversation) => (conversation.sessionId ? [conversation.sessionId] : [])))
    for (const info of sessions) {
      const owner = info.owner ? parseProcessOwner(info.owner) : null
      if (info.exited || owner?.kind !== 'conversation' || claimed.has(info.sessionId) || this.launching.has(owner.id)) continue
      await this.daemon.request('kill', { sessionId: info.sessionId, force: true }).catch((error: unknown) => console.error(`[antumi-core] stopping unclaimed agent ${info.sessionId} failed`, error))
    }
    // A launch whose process exited while core was away goes now; one the daemon no longer knows
    // (a daemon that restarted) is the sweep's to weigh, as the process may still be leaving.
    for (const [sessionId, launched] of [...this.launches]) {
      const info = known.get(sessionId)
      if ((info && !info.exited) || launched.at >= listedAt) continue
      this.launches.delete(sessionId)
      if (info) await removeLaunch(launched).catch(() => {})
    }
    for (const conversation of this.store.list()) {
      if (!conversation.sessionId) continue
      const info = known.get(conversation.sessionId)
      try {
        const stage = this.store.activeStage(conversation.id)
        // Started, or spawned, since the list was taken.
        if (!info && stage && (stage.startedAt >= listedAt || (this.launches.get(conversation.sessionId)?.at ?? -Infinity) >= listedAt)) continue
        if (!info || !stage) {
          this.chats.handleExit(conversation.sessionId, null)
          if (stage) this.store.endStage(stage.id, null)
          this.changed(this.store.update(conversation.id, { sessionId: null }))
          this.capacityReleased?.()
        } else {
          // Still its process's, until it exits; one the daemon says exited goes whatever else fails.
          const launched = { sessionsRoot: this.sessionsRoot, conversationId: conversation.id, stageId: stage.id }
          if (info.exited) await removeLaunch(launched).catch((error: unknown) => console.error(`[antumi-core] removing launch files of stage ${stage.id} failed`, error))
          else this.launches.set(info.sessionId, { ...launched, at: stage.startedAt })
          await this.chats.open(this.chatStage(conversation, stage), info.sessionId, this.store.chatOffset(stage.id), false)
          // A question left open across a restart has no browser navigation waiting on it now.
          if (!info.exited) this.chats.cancelAsks(conversation.id)
          if (info.exited) this.handleExit(info.sessionId, info.exitCode ?? -1)
        }
      } catch (error) {
        console.error(`[antumi-core] recovering conversation ${conversation.id} failed`, error)
      }
    }
    await this.settleLaunches(sessions).catch((error: unknown) => console.error('[antumi-core] settling launch files failed', error))
    // Upgrade old summaries once, yielding between logs so lists remain responsive.
    for (const stage of this.store.missingContextStages()) {
      try {
        const items = this.stageChatItems(stage.conversationId, stage.id)
        if (!items.some((item) => item.kind === 'state')) this.store.setStageContext(stage.id, null)
      } catch (error) {
        console.error(`[antumi-core] restoring context of stage ${stage.id} failed`, error)
      }
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }

  // A stage's launch files go with its process.
  private releaseLaunch(sessionId: string): void {
    const launched = this.launches.get(sessionId)
    if (!launched) return
    this.launches.delete(sessionId)
    const id = launched.conversationId
    const removing = removeLaunch(launched).catch((error: unknown) => this.launchStuck(launched, error))
    const releases = Promise.all([this.launchReleases.get(id), removing]).then(() => {})
    this.launchReleases.set(id, releases)
    void releases.then(() => { if (this.launchReleases.get(id) === releases) this.launchReleases.delete(id) })
  }

  // One that would not go (a file Windows holds) is tried again with the rest.
  private launchStuck(launched: StageRef, error: unknown): void {
    console.error(`[antumi-core] removing launch files of stage ${launched.stageId} failed`, error)
    if (!this.doubtTimer) void this.settleLaunches().catch((failure: unknown) => console.error('[antumi-core] settling launch files failed', failure))
  }

  // Every stage folder no session here accounts for (one a stage running or starting here holds is
  // left alone) goes once it is shown no process uses it: none names it in its environment, where
  // the platform shows that (macOS, Linux). Where it cannot (Windows), one goes a grace after it was
  // first found unaccounted for, and not while the daemon runs an agent no conversation claims if no
  // stage owns the folder (a start whose answer was lost). Looked at again, against the daemon as it
  // is then, for as long as any is left: a process may take its time to go.
  private async settleLaunches(known?: readonly SessionInfo[]): Promise<void> {
    if (this.doubtTimer) clearTimeout(this.doubtTimer)
    this.doubtTimer = null
    const kept = new Set<string>()
    let failed = false
    try {
      const left = (await launchLeftovers(this.sessionsRoot)).filter((each) => !this.launchBusy(each.stageId))
      if (left.length) {
        const inUse = await this.inspectLaunches(left.map(launchDir))
        const sessions = inUse === null ? known ?? (await this.daemon.request('list', {})).sessions : []
        const claimed = new Set(this.store.list().flatMap((conversation) => (conversation.sessionId ? [conversation.sessionId] : [])))
        const unclaimed = sessions.some((session) => !session.exited && session.io === 'pipe' && !claimed.has(session.sessionId))
        const now = Date.now()
        for (const each of left) {
          const dir = launchDir(each)
          // A start may have begun on it while this looked.
          if (this.launchBusy(each.stageId)) continue
          if (inUse === null) {
            const since = !this.store.stage(each.stageId) && unclaimed ? now : this.doubtful.get(dir) ?? now
            if (now - since < LAUNCH_SWEEP_GRACE_MS) { this.doubtful.set(dir, since); kept.add(dir); continue }
          } else if (inUse.has(dir)) {
            kept.add(dir)
            continue
          }
          // One that will not go now (a file Windows holds) is tried again with the rest.
          await removeLaunch(each).catch((error: unknown) => {
            kept.add(dir)
            console.error(`[antumi-core] removing launch files of stage ${each.stageId} failed`, error)
          })
        }
      }
    } catch (error) {
      failed = true
      throw error
    } finally {
      for (const dir of this.doubtful.keys()) if (!kept.has(dir) && !failed) this.doubtful.delete(dir)
      if (kept.size || failed) {
        this.doubtTimer = setTimeout(() => {
          this.doubtTimer = null
          void this.settleLaunches().catch((error: unknown) => console.error('[antumi-core] settling launch files failed', error))
        }, LAUNCH_SWEEP_GRACE_MS)
        this.doubtTimer.unref()
      }
    }
  }

  private launchBusy(stageId: string): boolean {
    return this.preparing.has(stageId) || [...this.launches.values()].some((launched) => launched.stageId === stageId)
  }

  // What the user said in a message: of a handoff's, only their note, as Antumi's instruction to read
  // the file is not theirs and stays out of the title, search and later handoffs.
  private userPart(id: string, text: string): string {
    const handoff = parseHandoffMessage(text)
    return handoff && path.dirname(handoff.path) === path.join(this.sessionsRoot, id, 'handoffs') ? handoff.note : text
  }

  private withChat(conversation: Conversation): Conversation {
    const turn = conversation.sessionId ? this.chats.activity(conversation.id) : null
    const chosen = this.store.chatOptions(conversation.id)
    const chatOptions = {
      permissionMode: chosen.permissionMode ?? null,
      model: chosen[conversation.agent]?.model ?? null,
      effort: chosen[conversation.agent]?.effort ?? null,
      account: chosen[conversation.agent]?.account ?? null
    }
    // A suggestion is for the idle composer; one the settings turned off since is not shown.
    const suggestion = turn === 'idle' && this.promptSuggestions ? this.chats.suggestion(conversation.id) : null
    const request = turn ? this.chats.request(conversation.id) : null
    const doing = turn === 'running' ? this.chats.doing(conversation.id) : null
    const betweenTurns = turn === 'running' && this.chats.betweenTurns(conversation.id)
    const providerId = conversation.modelProvider ?? null
    const route = providerId === null ? null : conversationRoute(providerId, this.routeFor(conversation, conversation.agent), this.providers?.get(providerId)?.name ?? this.store.latestStage(conversation.id, conversation.agent)?.route?.name ?? null)
    const preparing = this.preparingOf(conversation)
    return { ...conversation, ...(this.delegationStatus ? { delegation: this.delegationStatus(conversation.id) } : {}), ...(preparing ? { preparing } : {}), starting: this.launching.has(conversation.id), chat: turn ? { turn, ...(suggestion ? { suggestion } : {}), ...(request ? { request } : {}), ...(doing ? { doing } : {}), ...(betweenTurns ? { betweenTurns } : {}) } : null, chatOptions, route }
  }

  private changed(value: Conversation): Conversation {
    const decorated = this.withChat(value)
    this.emit({ type: 'changed', conversation: decorated })
    return decorated
  }
}

function quickProviderOf(decision: RouteDecision): QuickProvider | undefined {
  if (decision.kind === 'unavailable') throw new Rejection('model-provider-unavailable', decision.message)
  if (decision.kind === 'own') return undefined
  const { route, apiKey } = decision
  // The user may keep these off a provider whose accounts must not see more than the agent sends.
  if (route.smallJobs === 'account') return undefined
  if (route.smallJobs === 'off') throw new Rejection('model-provider-small-jobs-off', `服务商「${route.name}」设置了不做标题、翻译这类小任务`)
  return { endpoint: { wire: route.wire, baseUrl: route.baseUrl, anthropic: route.anthropic }, apiKey, model: route.smallModel, routeKey: route.key, headers: route.headers ?? {} }
}

// What was said in a lost provider session that never got an answer is left out of the handoff:
// the agent did not answer it, and a retry sends it again.
function withoutUnanswered(messages: ConversationMessage[], stages: readonly ConversationStage[], lost: string | null): ConversationMessage[] {
  if (lost === null) return messages
  const inLost = new Set(stages.filter((stage) => stage.providerSessionId === lost).map((stage) => stage.id))
  if (messages.some((message) => message.role === 'assistant' && inLost.has(message.stageId))) return messages
  return messages.filter((message) => !inLost.has(message.stageId))
}
