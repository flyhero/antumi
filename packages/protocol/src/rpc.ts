import { z } from 'zod'
import { ChatReference } from './chat-reference'
import { AgentProfile, AgentProfileFields, AgentCall } from './agent-profile'
import { GitTarget, GitBranch, GitStatus, GitHistory, GitDetail, GitComparison, GitAction, GitResult, GitOutgoing } from './git'
import { AgentKind, MAX_DETAILS_LENGTH, MAX_TASK_REPOS, RepoStartOptions, Task, TaskStatus } from './task'
import { ATTACHMENT_CHUNK_BYTES, AttachmentId, AttachmentInfo, Base64Chunk, ImageRef, MAX_ATTACHMENT_BYTES, MAX_CHAT_IMAGES, MAX_TASK_IMAGES } from './attachments'
import { LoginNotice, LoginPrompt, SourceDescriptor, SourceId, SourceInbox, SourceProblem } from './source'
import { PluginId, PluginInfo, PluginInstallSource, PluginVersion, RecommendedPlugin } from './plugin'
import { PetId, PetLibraryState, PetResourceData } from './pet'
import { AgentUsage, ResetCreditOutcome } from './usage'
import { UsageFilter, UsageHistory, UsageScanStatus, UsageForecast, UsageAutomationPolicy, UsageAutomationState } from './usage-analytics'
import { AgentStats, ConversationStats } from './agent-stats'
import { DashboardParams, DashboardStats } from './dashboard'
import { CommitPushResult, CommitResult, Conversation, ConversationConfiguration, ConversationMessage, ConversationSearchHit, ConversationStage, ProjectBranches, ProjectHead, PushResult } from './conversation'
import { ChatCatalog, ChatDecision, ChatItemList, ChatOption, ChatPermissionMode, ChatSettings, TaskLaunchOptions } from './chat'
import { TranslateLanguage, Translation } from './translation'
import { FileDiff, FolderChanges, RepoChanges } from './changes'
import { Terminal, TerminalCommand, TerminalCommandFields, TerminalOutput, TerminalRun } from './terminal'
import { PortList, PortRef } from './ports'
import { ProjectConfig, ProjectConfigInfo } from './project-config'
import { ChatCommandFields, SavedChatCommand } from './chat-commands'
import { ProjectFileMatch } from './project-files'
import { DirectoryListing, FileRead, FileWrite, MAX_FILE_PREVIEW_BYTES, ResolvedFile } from './files'
import { ManagedWorktree, WorktreeCleanResult } from './worktree'
import { browserActions, BrowserAction, BrowserCaptureOptions, BrowserConsole, BrowserPageContext, BrowserNavigateTo, BrowserNavigation, BrowserScreenshot, BrowserScreenshotOptions, BrowserSnapshot, BrowserStatus, BrowserTab, BrowserTabId, BrowserUrl, BrowserViewport } from './browser'
import { ComputerAwakeMode, ComputerAwakeStatus } from './awake'
import { AgentCliStatus, AgentCliUpgrade } from './agent-cli'
import { Environment } from './environment'
import { RequestedTarget, ScheduledRun, ScheduledRunList } from './schedule'
import { Routine, RoutineFields, RoutineList } from './routine'
import { WireEntry, WirePage, WireUsage } from './wire'
import { Discussion, DiscussionAction, DiscussionCreate, DiscussionList, DiscussionMemberFields, DiscussionPost } from './discussion'

import { Squad, SquadFields, SquadRun, SquadWork, SquadPlanRef } from './squad'
import { KnowledgeFolder, KnowledgeVault } from './knowledge'
import { CommitSha, RecommendedSkillRepo, SkillActivation, SkillRepo, SkillRepoId, SkillSearchResult, SkillUpdateCheck } from './skills'
import { TodoList, TodoOwner, TodoText, TodoTitle } from './todos'
import { McpImportCandidate, McpImportItem, McpProbe, McpServer, McpServerInput, McpServerName } from './mcp'
import { ModelProvider, ModelProviderId, ModelProviderInput, ModelProviderProbe } from './model-provider'
import { AgentAccount, AgentAccountId, AgentAccounts } from './agent-account'
import { ExternalSession, ExternalSessionRef } from './session-import'
import { ProjectStarIdentity, ProjectStarResult, ProjectStarStatus } from './project-star'
import { Bookmark, BookmarkFields, BookmarkImport, MAX_BOOKMARKS } from './bookmarks'

// Bump only for breaking changes; additive optional fields keep the version.
export const PROTOCOL_VERSION = 18

const TaskRef = z.object({ id: z.string().min(1) })
const TaskTitle = z.string().trim().min(1).max(200)
// Everything but the title, shared by create and update.
const TaskFields = z.object({
  details: z.string().max(MAX_DETAILS_LENGTH).optional(),
  // Each list replaces the task's current one.
  // The first repo is primary; reordering preserves each repo's worktree.
  repos: z.array(z.string().trim().min(1)).max(MAX_TASK_REPOS).optional(),
  dependsOn: z.array(z.string().trim().min(1)).max(50).optional(),
  agent: AgentKind.nullable().optional(),
  squadId: z.string().uuid().nullable().optional()
})
const SessionRef = z.object({ sessionId: z.string().min(1) })
const InstanceRef = z.object({ provider: SourceId, instance: SourceId })
// Trimmed only: a provider may normalize its own keys (Jira upper-cases them) before core checks them.
const IssueRef = InstanceRef.extend({ key: z.string().trim().min(1).max(160) })
const FlowRef = z.object({ flowId: z.string().min(1).max(64) })
const Ok = z.object({ ok: z.literal(true) })
const AccountRef = z.object({ agent: AgentKind, id: AgentAccountId })
const ConversationRef = z.object({ id: z.string().uuid() })
const DiscussionRef = z.object({ id: z.string().uuid() })
const FileScopeParams = z.object({ conversationId: z.string().uuid().optional(), roots: z.array(z.string().min(1).max(32_768)).min(1).max(20).optional() })
// The usage window kinds this client reads; an older client names none, and reads session and weekly.
const UsageParams = z.object({ windowKinds: z.array(z.string()).optional() })
// What core can do beyond this protocol version's baseline; an older core sends none.
// chat-options: a chat stage's permission mode, model and effort can be changed (conversations.setOption).
// chat-images: conversations.send takes images; an older core would drop them unnoticed.
// conversation-projects: a conversation's additional projects can change (conversations.setAdditionalProjects).
// browser: core hosts a browser for chat agents (the browser.* methods).
// usage-limit: core continues a chat whose turn hit a usage limit once it lifts (usageLimit items).
// agent-stats: core keeps each task run and reports how each agent's went (agents.stats).
// conversation-stats: core keeps each chat turn and reports what each agent's cost (agents.conversationStats).
// prompt-suggestions: core keeps the chat settings (system.chatSettings) and reports a chat's suggested next message.
// environment: core checks for git and the agent CLIs on its path (system.environment).
// chat-commands: core keeps the user's own slash commands for the chat composer (chatCommands.*).
// file-mentions: core searches projects' files and folders for the composer's @ menu (projects.searchFiles).
// file-preview: core resolves chat file references and reads their text (files.resolve, files.read).
// file-editor: core lists project folders and saves edited project files (files.list, files.write).
// dashboard: core adds up runs and turns by day for the dashboard (dashboard.stats).
// git-commit-branches: core lists the branches holding a commit (git.containing).
// task-handoff: a task's chat can go to another agent (tasks.handoff), and one going on with another agent is handed the chat.
// handoff-model: a handoff takes the model and effort the agent starts in (conversations.handoff, tasks.handoff).
// handoff-mode: a handoff takes the permission mode the agent starts in, too.
// conversation-todos: core keeps each conversation's to-dos, which its agent writes too (todos.*).
// todo-overview: core gathers what is left to do across conversations, for the overview (todos.open).
// terminal-color-prompt: terminals.open takes colorPrompt, a prompt in colour for a zsh whose prompt the user never set.
// git-commit-actions: git.execute takes tag and detach, for a commit in the history.
// git-update: git.execute takes update, and status says when a rebase can be carried on.
// git-push-target: git.outgoing lists what a push sends; push takes from and keeps an upstream it has;
// git.execute takes track.
// git-favorites: git.favorite saves branch favorites, included in git.status, across a repository's worktrees.
// project-files: the files.* methods take project folders (roots) in place of a conversation, for the files panel
//   browsing a project no conversation is on.
// project-config: core copies files and runs setup in new worktrees and check before review, from a
// project's .antumi/project.json, once the user trusts its commands (projects.config, projects.trustConfig).
// project-config-edit: core writes that file as the user filled it in (projects.writeConfig), and
// suggests what to fill it with (projects.suggestConfig).
// conversation-references: history_read resolves explicit antumi://conversation/<id> references.
// chat-references: user messages and queues retain the composer's explicit reference targets.
export const CORE_FEATURES = ['chat-references', 'conversation-references', 'agent-profiles', 'pets', 'plugins', 'plugin-recommendations', 'chat-options', 'chat-images', 'task-start', 'worktrees', 'conversation-branches', 'conversation-commit-push', 'find-file', 'conversation-projects', 'browser', 'browser-collaboration', 'keep-awake', 'terminal-commands', 'bookmarks', 'usage-limit', 'agent-stats', 'conversation-stats', 'prompt-suggestions', 'environment', 'conversation-pin', 'schedules', 'chat-commands', 'file-mentions', 'plan-modes', 'agent-terminals', 'schedule-images', 'dashboard', 'task-conversation-summaries', 'routines', 'ports', 'conversation-fork', 'conversation-configuration', 'conversation-commit-steps', 'conversation-worktrees', 'conversation-start-branch', 'wire-log', 'file-preview', 'deferred-conversation-start', 'agent-cli-installation', 'agent-cli-maintenance', 'task-launch-options', 'git-management', 'git-commit-branches', 'task-handoff', 'handoff-model', 'handoff-mode', 'task-launch', 'discussions', 'discussion-members', 'discussion-projects', 'discussion-topics', 'discussion-requirements', 'task-cancel', 'task-redo-in-place', 'conversation-archive', 'discussion-archive', 'translate', 'commit-message', 'squads', 'squad-leader-planning', 'conversation-todos', 'knowledge-base', 'knowledge-base-kind', 'skills-library', 'skills-search', 'skills-activation', 'mcp-servers', 'source-investigate', 'todo-overview', 'conversation-helper', 'small-model-stats', 'terminal-color-prompt', 'git-commit-actions', 'file-editor', 'project-config', 'project-config-edit', 'model-providers', 'git-update', 'git-push-target', 'task-auto-run', 'session-import', 'agent-accounts', 'usage-analytics', 'task-references', 'release-idle-chats', 'project-star', 'git-favorites', 'project-files'] as const
// session-import: core lists the sessions agents ran outside Antumi and imports them as conversations (sessionImports.*).
// agent-accounts: Claude and Codex sign in to several accounts, one active each, and a usage limit
// moves the agent to the next with quota (accounts.*); usage readings name their account.
// model-providers: core keeps the user's model providers (modelProviders.*) and starts a conversation or task's agent on one.
// knowledge-base: core hands agents the user's local knowledge base and lists the vaults Obsidian knows (knowledge.*).
// knowledge-base-kind: Markdown folders and Obsidian use their own prompts and skills; missing kind means Obsidian.
// skills-library: core installs Agent Skills repositories pinned to a commit and hands bundles of them to agents (skills.*).
// skills-search: core searches the open skills.sh registry (skills.search) so users find repositories to install.
// mcp-servers: core keeps the user's MCP servers and hands them to the agents picked at each start (mcpServers.*).
// task-launch-options: tasks.start accepts the first stage's mode, model and reasoning effort.
// task-launch: a task keeps them (Task.launch, set by tasks.update and by each start by hand).
// task-auto-run: tasks.update arms a task for one unattended start after its dependencies finish.
// discussion-members: members join and leave a group chat midway; discussion-projects: its projects but the first change.
// discussion-topics: the user moves a group chat on to a new topic (discussions.newTopic, Discussion.topicStart, DiscussionPost.topic).
// discussion-requirements: discussions.create accepts shared requirements, applied to every turn.
// translate: conversations.translate; commit-message: git.commitMessage.
// conversation-archive: conversations.setArchived, Conversation.archivedAt; discussion-archive: discussions.setArchived, Discussion.archivedAt.
// task-cancel: tasks.cancel and tasks.reopen; task-redo-in-place: tasks.redo keeps the task, its earlier goes in Task.attempts.
// deferred-conversation-start: create can return before launching; send takes a ref for safe retries.
// routines: core runs routines, rules that open a conversation on a schedule, and keeps their runs (routines.*). A
// client without it shows the conversations they opened among the others, since it does not read routineId.
// conversation-fork: a free conversation can be forked at one of its messages into a new one (conversations.fork).
// conversation-configuration: conversations.configuration returns settings for a fresh conversation.
// discussions: core runs group chats, agents discussing a topic in rounds (discussions.*).
// wire-log: core can record what passes between it and chat agents (ChatSettings.wireLog) and serves it (debug.*).
// Whether a start may offer running with nothing asked and nothing sandboxed; the conversation
// keeps what its latest start said.
const AllowBypass = z.boolean().optional()
// The mode, model and effort an agent takes over with; absent keeps what it last ran in this chat.
const HandoffOptions = TaskLaunchOptions.pick({ permissionMode: true, model: true, effort: true }).extend({ references: z.array(ChatReference).max(1000).optional() })
// One page of a conversation's chat history; `before` fetches the page older than it, null when none is left.
const ChatPage = z.object({ items: ChatItemList, before: z.string().nullable() })
// Browser calls from an agent name the conversation they act for, and a tab of that conversation.
const BrowserConversationRef = z.object({ conversationId: z.string().uuid() })
const BrowserTabRef = BrowserConversationRef.extend({ tabId: BrowserTabId })

export const rpcMethods = {
  'pets.list': { params: z.object({ refresh: z.boolean().optional() }), result: PetLibraryState },
  'pets.install': { params: z.object({ id: PetId }), result: PetLibraryState },
  'pets.cancel': { params: z.object({ id: PetId }), result: Ok },
  'pets.remove': { params: z.object({ id: PetId }), result: PetLibraryState },
  'pets.read': { params: z.object({ id: PetId }), result: PetResourceData },
  'plugins.recommended': { params: z.object({}), result: z.array(RecommendedPlugin) },
  'plugins.installRecommended': { params: z.object({ id: PluginId }), result: PluginInfo },
  'plugins.list': { params: z.object({}), result: z.array(PluginInfo) },
  'plugins.install': { params: z.object({ source: PluginInstallSource }), result: PluginInfo },
  'plugins.update': { params: z.object({ id: PluginId }), result: PluginInfo },
  'plugins.setEnabled': { params: z.object({ id: PluginId, enabled: z.boolean() }), result: PluginInfo },
  'plugins.rollback': { params: z.object({ id: PluginId, version: PluginVersion }), result: PluginInfo },
  'plugins.uninstall': { params: z.object({ id: PluginId }), result: Ok },
  'agentProfiles.list': { params: z.object({}), result: z.array(AgentProfile) },
  'agentProfiles.save': { params: AgentProfileFields.extend({ id: z.string().uuid().optional() }), result: AgentProfile },
  'agentProfiles.archive': { params: z.object({ id: z.string().uuid(), archived: z.boolean() }), result: AgentProfile },
  'agentProfiles.available': { params: ConversationRef, result: z.array(AgentProfile) },
  'agentCalls.list': { params: ConversationRef, result: z.array(AgentCall) },
  'agentCalls.dispatch': { params: ConversationRef.extend({ profileId: z.string().uuid(), instruction: AgentCall.shape.instruction, ref: z.string().min(1).max(200).optional() }), result: AgentCall },
  'agentCalls.cancel': { params: ConversationRef.extend({ callId: z.string().uuid() }), result: AgentCall },
  'squads.list': { params: z.object({}), result: z.array(Squad) },
  'squads.create': { params: SquadFields, result: Squad },
  'squads.update': { params: SquadFields.safeExtend({ id: z.string().uuid() }), result: Squad },
  'squads.archive': { params: z.object({ id: z.string().uuid(), archived: z.boolean() }), result: Squad },
  'squads.activeRuns': { params: z.object({}), result: z.array(SquadRun) },
  'squads.runs': { params: TaskRef, result: z.array(SquadRun) },
  // planFirst: the leader plans with the user before the squad runs; the squad then starts on the
  // approved plan with plan set. Needs squad-leader-planning.
  'squads.start': { params: TaskRef.extend({ squadId: z.string().uuid(), permissionMode: ChatPermissionMode.default('ask'), allowBypass: AllowBypass, plan: SquadPlanRef.optional(), planFirst: z.boolean().optional() }), result: Task },
  'squads.control': { params: z.object({ id: z.string().uuid(), action: z.enum(['stop', 'resume']) }), result: SquadRun },
  'squads.retry': { params: z.object({ id: z.string().uuid(), workId: z.string().uuid() }), result: SquadRun },
  'squads.roster': { params: ConversationRef, result: SquadRun.nullable() },
  'squads.dispatch': { params: ConversationRef.extend({ memberId: z.string().uuid(), instruction: SquadWork.shape.instruction, capability: SquadWork.shape.capability, retryOf: z.string().uuid().optional() }), result: SquadWork },
  'squads.finish': { params: ConversationRef.extend({ summary: z.string().trim().min(1).max(20000) }), result: Ok },
  'git.status': { params: GitTarget, result: GitStatus },
  'git.favorite': { params: GitTarget.extend({ ref: GitBranch.shape.ref, favorite: z.boolean() }), result: Ok },
  'git.history': { params: GitTarget.extend({ ref: z.string(), query: z.string().max(500).default(''), offset: z.number().int().nonnegative().default(0), tips: z.array(z.string()).optional() }), result: GitHistory },
  'git.detail': { params: GitTarget.extend({ sha: z.string(), parent: z.string().optional() }), result: GitDetail },
  // The local and remote branches holding a commit, apart from its detail: on a large repository
  // walking every branch takes a moment the detail need not wait for.
  'git.containing': { params: GitTarget.extend({ sha: z.string() }), result: z.array(z.object({ name: z.string(), remote: z.boolean() })) },
  'git.diff': { params: GitTarget.extend({ base: z.string().nullable(), sha: z.string(), file: z.string() }), result: FileDiff },
  'git.compare': { params: GitTarget.extend({ ref: z.string(), direct: z.boolean().default(false) }), result: GitComparison },
  'git.execute': { params: GitTarget.extend({ action: GitAction }), result: GitResult },
  // Needs git-push-target.
  'git.outgoing': { params: GitTarget.extend({ remote: z.string().min(1).max(200), name: z.string().min(1).max(500) }), result: GitOutgoing },
  // A message for committing everything the repo holds, written by the target's agent from the diff,
  // the project's commit rules and its last commits, as a quick request on the model picked (else
  // its cheapest). Needs commit-message.
  'git.commitMessage': { params: GitTarget.extend({ model: z.string().trim().min(1).max(200).optional() }), result: z.object({ message: z.string(), model: z.string().nullable() }) },
  'system.hello': {
    params: z.object({ protocolVersion: z.number().int() }),
    result: z.object({
      protocolVersion: z.number().int(),
      serverVersion: z.string(),
      features: z.array(z.string()).optional()
    })
  },
  'system.awakeStatus': { params: z.object({}), result: ComputerAwakeStatus },
  'support.starStatus': { params: z.object({}), result: ProjectStarStatus },
  'support.star': { params: z.object({ identity: ProjectStarIdentity }), result: ProjectStarResult },
  // Each takes the conversation whose folders the files belong to, or the folders themselves
  // (feature project-files); one of the two.
  'files.resolve': { params: FileScopeParams.extend({ path: z.string().min(1).max(32_768) }), result: ResolvedFile.nullable() },
  'files.read': { params: FileScopeParams.extend({ path: z.string().min(1).max(32_768) }), result: FileRead },
  'files.list': { params: FileScopeParams.extend({ path: z.string().min(1).max(32_768) }), result: DirectoryListing },
  'files.write': {
    params: FileScopeParams.extend({ path: z.string().min(1).max(32_768), text: z.string().max(MAX_FILE_PREVIEW_BYTES), expectedMtimeMs: z.number().nullable() }),
    result: FileWrite
  },
  'system.setAwakeMode': { params: z.object({ mode: ComputerAwakeMode }), result: ComputerAwakeStatus },
  'system.chatSettings': { params: z.object({}), result: ChatSettings },
  'system.setChatSettings': { params: ChatSettings.partial(), result: ChatSettings },
  // The vaults Obsidian's registry lists on this machine, the open one first; none headless.
  'knowledge.vaults': { params: z.object({}), result: z.array(KnowledgeVault) },
  'knowledge.inspect': { params: z.object({ path: z.string().min(1).max(32_768) }), result: KnowledgeFolder },
  'skills.list': { params: z.object({}), result: z.array(SkillRepo) },
  'skills.recommended': { params: z.object({}), result: z.array(RecommendedSkillRepo) },
  // Searches the open skills.sh registry (feature skills-search); results install over the same
  // git path as the rest, so a hit is the repository the skill lives in, not the skill alone.
  'skills.search': { params: z.object({ query: z.string().trim().min(1).max(200) }), result: z.array(SkillSearchResult) },
  // Clones the repository and pins it at its head; https only.
  'skills.install': { params: z.object({ url: z.string().trim().min(1).max(500) }), result: SkillRepo },
  'skills.setActivation': { params: z.object({ id: SkillRepoId, activation: SkillActivation }), result: SkillRepo },
  // The README at the pinned commit, for the user to read before relying on third-party skills.
  'skills.readme': { params: z.object({ id: SkillRepoId }), result: z.object({ text: z.string().nullable() }) },
  // Fetches and tells what an update would bring, without moving the pin.
  'skills.checkUpdate': { params: z.object({ id: SkillRepoId }), result: SkillUpdateCheck },
  // Moves the pin to the commit the user saw in the check.
  'skills.update': { params: z.object({ id: SkillRepoId, commit: CommitSha, allowUnavailable: z.boolean().optional() }), result: SkillRepo },
  'skills.rollback': { params: z.object({ id: SkillRepoId }), result: SkillRepo },
  'skills.remove': { params: z.object({ id: SkillRepoId }), result: Ok },
  'mcpServers.list': { params: z.object({}), result: z.array(McpServer) },
  // Adds a server, or replaces one (previousName), from the next start of each agent it goes to.
  'mcpServers.save': { params: McpServerInput, result: McpServer },
  'mcpServers.setEnabled': { params: z.object({ name: McpServerName, enabled: z.boolean() }), result: McpServer },
  'mcpServers.remove': { params: z.object({ name: McpServerName }), result: Ok },
  // Connects to a saved server as an agent would and lists its tools.
  'mcpServers.probe': { params: z.object({ name: McpServerName }), result: McpProbe },
  // The servers Claude, Codex and Cursor have in their own configuration, and taking some in.
  'mcpServers.importable': { params: z.object({}), result: z.array(McpImportCandidate) },
  'mcpServers.import': { params: z.object({ items: z.array(McpImportItem).min(1).max(64), agents: z.array(AgentKind) }), result: z.array(McpServer) },
  // Sessions Claude Code and Codex ran outside Antumi, newest first; importing one again brings in
  // what it added since.
  'sessionImports.list': { params: z.object({}), result: z.object({ sessions: z.array(ExternalSession) }) },
  'sessionImports.import': { params: z.object({ sessions: z.array(ExternalSessionRef).min(1).max(100) }), result: z.object({ conversations: z.array(Conversation) }) },
  'modelProviders.list': { params: z.object({}), result: z.array(ModelProvider) },
  // Adds a provider (id null) or replaces one, from the next start of each agent on it.
  'modelProviders.save': { params: ModelProviderInput, result: ModelProvider },
  'modelProviders.remove': { params: z.object({ id: ModelProviderId }), result: Ok },
  // One small request per endpoint and model, as an agent would send it.
  'modelProviders.probe': { params: z.object({ id: ModelProviderId }), result: ModelProviderProbe },
  'accounts.list': { params: z.object({}), result: AgentAccounts },
  // Adds an account and signs it in, in a terminal (terminals.*) the user follows; the account is
  // there, signed out, until the sign-in ends well.
  'accounts.add': { params: z.object({ agent: AgentKind, label: z.string().trim().max(60).nullable() }), result: z.object({ account: AgentAccount, terminal: Terminal }) },
  // Signs an account in again, in a terminal.
  'accounts.login': { params: AccountRef, result: Terminal },
  'accounts.rename': { params: AccountRef.extend({ label: z.string().trim().max(60).nullable() }), result: AgentAccount },
  // Signs it out and drops its folder; the default account stays.
  'accounts.remove': { params: AccountRef, result: Ok },
  // The account the agent's next processes start on; those running keep theirs.
  'accounts.activate': { params: AccountRef, result: AgentAccounts },
  'accounts.setAutoSwitch': { params: z.object({ autoSwitch: z.boolean() }), result: AgentAccounts },
  // What of git and the agent CLIs core finds on its path; the last answer, unless asked to look again.
  'system.environment': { params: z.object({ refresh: z.boolean().optional() }), result: Environment },
  'system.agentCliStatus': { params: z.object({ agent: AgentKind.optional(), refresh: z.boolean().optional() }), result: z.array(AgentCliStatus) },
  'system.upgradeAgentCli': { params: z.object({ agent: AgentKind }), result: AgentCliUpgrade },
  'system.cancelAgentCliUpgrade': { params: z.object({ agent: AgentKind }), result: AgentCliStatus },
  'system.installAgentCli': { params: z.object({ agent: AgentKind }), result: Terminal },
  // A conversation's wire log: one stage's page (the newest stage without stageId), and the stages that have one.
  'debug.wire': { params: ConversationRef.extend({ stageId: z.string().optional(), before: z.number().int().nonnegative().optional() }), result: WirePage },
  // New entries of the conversation's wire log arrive as debug.wireEntries while watched.
  'debug.watchWire': { params: ConversationRef, result: Ok },
  'debug.unwatchWire': { params: ConversationRef, result: Ok },
  'debug.wireUsage': { params: z.object({}), result: WireUsage },
  // Deletes every wire log; what is left, which a stage still writing may already have added to.
  'debug.clearWire': { params: z.object({}), result: WireUsage },
  'tasks.list': {
    params: z.object({ status: TaskStatus.optional() }),
    result: z.array(Task)
  },
  'tasks.get': { params: TaskRef, result: Task },
  'tasks.create': {
    params: TaskFields.extend({ title: TaskTitle, images: z.array(ImageRef).max(MAX_TASK_IMAGES).optional() }),
    result: Task
  },
  'tasks.update': {
    params: TaskFields.extend({
      id: TaskRef.shape.id,
      title: TaskTitle.optional(),
      autoRun: z.boolean().optional(),
      // Replaces the task's launch (see Task.launch); core clears it when the agent changes.
      launch: TaskLaunchOptions.optional(),
      // Where each named repo's branch is to start (see TaskRepo.startRef); others keep theirs.
      starts: z.array(z.object({ path: z.string().trim().min(1), ref: z.string().min(1).max(500).nullable() })).max(MAX_TASK_REPOS).optional(),
      // Which named additional projects are only read, for reference (see TaskRepo.reference).
      references: z.array(z.object({ path: z.string().trim().min(1), reference: z.boolean() })).max(MAX_TASK_REPOS).optional()
    }),
    result: Task
  },
  // What each of the task's repos could start from, read from git on every call.
  'tasks.startOptions': { params: TaskRef, result: z.array(RepoStartOptions) },
  'tasks.move': { params: TaskRef.extend({ status: TaskStatus }), result: Task },
  // Starts a task handed in or accepted over from scratch (checkRedo): its work so far goes on a
  // branch of its own, its branch starts again, and it is pending, with the reason for its next
  // agent. Returns the task. Before task-redo-in-place, it returned a new task that took over.
  'tasks.redo': { params: TaskRef.extend({ reason: z.string().trim().max(500).optional() }), result: Task },
  // Gives a task up (checkCancel): its agent stops, what it did stays. Needs task-cancel.
  'tasks.cancel': { params: TaskRef.extend({ reason: z.string().trim().max(500).optional() }), result: Task },
  // Brings a cancelled task back (checkReopen, reopenStatus). Needs task-cancel.
  'tasks.reopen': { params: TaskRef, result: Task },
  // A task runs in its chat. start plans first, then carries the plan out in the task's worktree,
  // or only plans while its dependencies are unfinished. resumeChat readies its agent before a
  // message, reopening a finished task as continuing does. submit hands a running one in for
  // review. savePlan keeps a plan-only stage's plan for when the task can run.
  'tasks.start': { params: TaskRef.extend({ allowBypass: AllowBypass }).extend(TaskLaunchOptions.shape), result: Task },
  'tasks.resumeChat': { params: TaskRef.extend({ allowBypass: AllowBypass }), result: Task },
  'tasks.submit': { params: TaskRef, result: Task },
  // Gives the task to another agent, which goes on with its chat at once from a handoff (see checkTaskHandoff).
  'tasks.handoff': { params: TaskRef.extend({ agent: AgentKind, note: z.string().max(10000), allowBypass: AllowBypass }).extend(HandoffOptions.shape), result: Task },
  'tasks.savePlan': { params: TaskRef.extend({ stageId: z.string().uuid(), requestId: z.string().min(1).max(200) }), result: Task },
  'tasks.delete': { params: TaskRef, result: Ok },
  // Appended on the server, so uploads that finish together do not overwrite each other.
  'tasks.addImages': { params: TaskRef.extend({ images: z.array(ImageRef).min(1).max(MAX_TASK_IMAGES) }), result: Task },
  'tasks.updateImage': { params: TaskRef.extend({ attachmentId: AttachmentId, name: ImageRef.shape.name }), result: Task },
  'tasks.removeImage': { params: TaskRef.extend({ attachmentId: AttachmentId }), result: Task },
  // Each repo's worktree, read on every call. A repo without one yet has no branch. Older cores lack it.
  'tasks.branches': { params: TaskRef, result: z.array(ProjectHead) },
  // What the agent changed in each worktree since its branch started, read on every call.
  'tasks.changes': { params: TaskRef, result: z.array(RepoChanges) },
  // One file of those changes; `repo` is the path the user picked, `file` a path from the change list.
  'tasks.diff': { params: TaskRef.extend({ repo: z.string().min(1), file: z.string().min(1) }), result: FileDiff },
  'conversations.list': { params: z.object({ includeTasks: z.boolean().optional(), includeSquads: z.boolean().optional(), includeDelegates: z.boolean().optional() }), result: z.array(Conversation) },
  'conversations.get': { params: ConversationRef, result: Conversation },
  'conversations.configuration': { params: ConversationRef, result: ConversationConfiguration },
  // A parent's helper, reached here because list and search exclude it. Needs conversation-helper.
  'conversations.helper': { params: ConversationRef, result: Conversation.nullable() },
  'conversations.create': {
    // permissionMode, model and effort: what the first start begins with, from what the agent has.
    params: z.object({
      agent: AgentKind,
      profileId: z.string().uuid().optional(),
      // Primary (cwd) first; other directories are available to the agent in place.
      projectPaths: z.array(z.string().trim().min(1)).max(MAX_TASK_REPOS),
      // Each project, which must then be a git repo, gets a worktree on a new branch from its HEAD,
      // and the conversation works there instead. Needs conversation-worktrees.
      worktree: z.boolean().optional(),
      // The primary project's branch, by full name (refs/heads/… or refs/remotes/…): with a
      // worktree, the one it starts from (a remote one fetched first); without, the one the project
      // is switched to before the agent starts, as conversations.switchBranch would. Needs
      // conversation-start-branch.
      branch: z.string().trim().min(1).max(500).optional(),
      allowBypass: AllowBypass,
      permissionMode: ChatPermissionMode.optional(),
      deferStart: z.boolean().optional(),
      helperOf: z.string().uuid().optional(),
      model: z.string().trim().min(1).max(200).optional(),
      effort: z.string().trim().min(1).max(200).optional(),
      // The model provider it runs on (Conversation.modelProvider), which must serve the agent; a
      // helper runs on its parent's. Needs model-providers.
      modelProvider: ModelProviderId.optional()
    }),
    result: Conversation
  },
  // What the agent offers a new chat: the models its latest chat stage listed, or, when it never
  // ran one, what it lists when asked; on a model provider, that provider's. null when it cannot
  // be asked.
  'conversations.chatCatalog': { params: z.object({ agent: AgentKind, modelProvider: ModelProviderId.optional() }), result: ChatCatalog.nullable() },
  // A reply of the conversation's put into another language by its own agent, on the smallest model
  // it has, in a one-off request with no tools that is kept nowhere. Needs translate.
  // model: the one the user picked for translating with this agent; without it, quickModel's.
  'conversations.translate': { params: ConversationRef.extend({ text: z.string().min(1).max(60_000), to: TranslateLanguage, model: z.string().trim().min(1).max(200).optional() }), result: Translation },
  // Replaces every project but the primary (see checkEditAdditionalProjects); an idle chat agent
  // restarts on its session to be given them.
  'conversations.setAdditionalProjects': {
    params: ConversationRef.extend({ projectPaths: z.array(z.string().trim().min(1)).max(MAX_TASK_REPOS - 1) }),
    result: Conversation
  },
  'conversations.rename': { params: ConversationRef.extend({ title: z.string().trim().min(1).max(200) }), result: Conversation },
  // Keeps it at the top of the conversation list, without counting as activity.
  'conversations.setPinned': { params: ConversationRef.extend({ pinned: z.boolean() }), result: Conversation },
  // A conversation's to-dos (see todos.ts). add starts a group, or adds to the open group of that
  // title (or the one named), skipping items it already holds; check and remove take a whole group
  // when no item is named. Each answers with the list as it now stands.
  'todos.list': { params: ConversationRef, result: TodoList },
  // Every conversation with something left to do, with its whole list, for the overview. Needs todo-overview.
  'todos.open': { params: z.object({}), result: z.array(z.object({ conversationId: z.string(), groups: TodoList })) },
  'todos.add': {
    params: ConversationRef.extend({
      title: TodoTitle,
      note: z.string().trim().max(120).nullable().optional(),
      groupId: z.string().optional(),
      items: z.array(z.object({ text: TodoText, owner: TodoOwner.default('user') })).min(1).max(30)
    }),
    result: TodoList
  },
  'todos.check': { params: ConversationRef.extend({ groupId: z.string(), itemId: z.string().optional(), done: z.boolean() }), result: TodoList },
  'todos.edit': { params: ConversationRef.extend({ groupId: z.string(), itemId: z.string().optional(), text: TodoText }), result: TodoList },
  'todos.remove': { params: ConversationRef.extend({ groupId: z.string(), itemId: z.string().optional() }), result: TodoList },
  // Puts a free conversation away, read-only, or takes it out again. Its agent must be idle, and is
  // let go. Needs conversation-archive.
  'conversations.setArchived': { params: ConversationRef.extend({ archived: z.boolean() }), result: Conversation },
  'conversations.continue': { params: ConversationRef.extend({ allowBypass: AllowBypass }), result: Conversation },
  'conversations.handoff': {
    params: ConversationRef.extend({ agent: AgentKind, note: z.string().max(10000), stopRunning: z.boolean(), allowBypass: AllowBypass }).extend(HandoffOptions.shape),
    result: Conversation
  },
  // A new conversation with the same agent and projects, holding the chat up to a message: through
  // the turn an agent's message belongs to, or up to (not including) a user message, which the
  // client then offers in the new chat's input. The agent's own session is forked where it can
  // be, so the new agent remembers what the chat shows, and no more.
  'conversations.fork': { params: ConversationRef.extend({ stageId: z.string().uuid(), itemId: z.string().min(1) }), result: Conversation },
  // A message for the agent, text and/or images already uploaded (attachments.commit),
  // in the order they show. With queue, one sent while a turn runs waits its turn behind any
  // already waiting; with steer, it goes into the running turn (state.steerable says whether the
  // agent takes that); with neither, the agent must be idle.
  'conversations.send': {
    params: ConversationRef.extend({
      text: z.string().trim().max(100000),
      images: z.array(AttachmentId).max(MAX_CHAT_IMAGES).optional(),
      queue: z.boolean().optional(),
      ref: z.string().uuid().optional(),
      steer: z.boolean().optional(),
      references: z.array(ChatReference).max(1000).optional()
    }).refine((params) => params.text !== '' || (params.images?.length ?? 0) > 0, { message: 'a message needs text or an image' }),
    result: Ok
  },
  // Drops a waiting message (the ref from state.queue), or every one without a ref.
  'conversations.cancelQueued': { params: ConversationRef.extend({ ref: z.string().optional() }), result: Ok },
  // Releases a message a failed turn held (the first without a ref) to go out when the agent is
  // idle; with now, takes it out of the queue and sends it at once, into the running turn if need be.
  'conversations.sendQueued': { params: ConversationRef.extend({ ref: z.string().optional(), now: z.boolean().optional() }), result: Ok },
  // Whether core continues the chat on its own once the usage limit a usageLimit item reports lifts.
  'conversations.setUsageLimitAutoContinue': {
    params: ConversationRef.extend({ stageId: z.string().uuid(), itemId: z.string().min(1).max(300), autoContinue: z.boolean() }),
    result: Ok
  },
  // Continues now, the way core would once the limit lifts. Refused while another try is under way.
  'conversations.retryUsageLimit': {
    params: ConversationRef.extend({ stageId: z.string().uuid(), itemId: z.string().min(1).max(300) }),
    result: Ok
  },
  // Restarts an agent's process after its current turn produced no events or failed, then resends
  // the original user message, only after an explicit click.
  'conversations.retryTurn': {
    params: ConversationRef.extend({ stageId: z.string().uuid(), itemId: z.string().min(1).max(300) }),
    result: Ok
  },
  // Switches one of the stage's options to a value its state item offers. The
  // conversation remembers it for its next start.
  'conversations.setOption': { params: ConversationRef.extend({ option: ChatOption, value: z.string().trim().min(1).max(200) }), result: Ok },
  // Ends the running turn. Cursor's process goes with it; the next message starts another.
  'conversations.interrupt': { params: ConversationRef, result: Ok },
  // Stops one piece of background work, apart from the turn: a tool item marked stoppable.
  'conversations.stopBackground': { params: ConversationRef.extend({ itemId: z.string().min(1).max(200) }), result: Ok },
  // Answers an approval or question item. answers maps a question id to option ids, or labels
  // when the provider supplies none.
  'conversations.respond': {
    params: ConversationRef.extend({
      requestId: z.string().min(1).max(200),
      decision: ChatDecision,
      // One of the approval's choices, which then says what the answer lets through; decision is
      // what it amounts to, for a core that offers none.
      choice: z.string().min(1).max(200).optional(),
      // For a plan carried out: the permission mode to carry it out in, one the stage offers.
      mode: ChatPermissionMode.optional(),
      message: z.string().trim().max(2000).optional(),
      answers: z.record(z.string().max(500), z.array(z.string().max(2000)).max(20)).optional()
    }),
    result: Ok
  },
  // The latest page of chat items; this connection then receives conversations.chatItems and
  // conversations.chatDelta for the conversation until it unwatches.
  'conversations.watchChat': { params: ConversationRef, result: ChatPage },
  'conversations.unwatchChat': { params: ConversationRef, result: Ok },
  'conversations.chatItems': { params: ConversationRef.extend({ before: z.string().uuid() }), result: ChatPage },
  'conversations.stop': { params: ConversationRef, result: Conversation },
  // Lets every chat agent with nothing to do go now rather than after its idle wait, as before an
  // app update; the next message starts each again on the same session.
  'conversations.releaseIdle': { params: z.object({}), result: z.object({ released: z.number().int() }) },
  'conversations.delete': { params: ConversationRef, result: Ok },
  'conversations.messages': { params: ConversationRef, result: z.array(ConversationMessage) },
  'conversations.stages': { params: ConversationRef, result: z.array(ConversationStage) },
  // Messages only: clients match titles and projects themselves. Older cores lack it.
  // Read on every call: the agent works in the project folders themselves, so either it or
  // the user can switch branches at any time. Older cores lack it.
  'conversations.branches': { params: ConversationRef, result: z.array(ProjectHead) },
  // What each project could switch to (see checkSwitchBranch); read from git on every call.
  'conversations.branchOptions': { params: ConversationRef, result: z.array(ProjectBranches) },
  // The same for a project no conversation has yet, for a new one to start on (feature
  // conversation-start-branch).
  'projects.branches': { params: z.object({ path: z.string().trim().min(1) }), result: ProjectBranches },
  // Checks out a branch by its full name in one project; a remote one gets a local branch tracking it.
  'conversations.switchBranch': { params: ConversationRef.extend({ project: z.string().min(1), ref: z.string().min(1).max(500) }), result: Conversation },
  // Makes a branch at the project's HEAD and checks it out, uncommitted changes and all.
  'conversations.createBranch': { params: ConversationRef.extend({ project: z.string().min(1), name: z.string().trim().min(1).max(200) }), result: Conversation },
  // Stages every change in one project, commits it, then pushes its current branch.
  'conversations.commitPush': {
    params: ConversationRef.extend({ project: z.string().min(1), message: z.string().trim().min(1).max(10_000) }),
    result: CommitPushResult
  },
  // The two halves of it on their own (feature conversation-commit-steps): committing every
  // change, and pushing the current branch with what it has.
  'conversations.commit': {
    params: ConversationRef.extend({ project: z.string().min(1), message: z.string().trim().min(1).max(10_000) }),
    result: CommitResult
  },
  'conversations.push': { params: ConversationRef.extend({ project: z.string().min(1) }), result: PushResult },
  // Each project's uncommitted changes and the commits since the conversation started.
  'conversations.changes': { params: ConversationRef, result: z.array(FolderChanges) },
  'conversations.diff': { params: ConversationRef.extend({ project: z.string().min(1), file: z.string().min(1) }), result: FileDiff },
  'conversations.search': { params: z.object({ query: z.string().trim().min(1).max(200) }), result: z.array(ConversationSearchHit) },
  // The browser core hosts (feature `browser`). The agent's side, from its MCP tools: every call
  // names the conversation it acts for, and sees only that conversation's tabs. A screenshot is
  // stored as an attachment; snapshots are AI-mode aria snapshots whose refs the actions take.
  'browser.tabs': { params: BrowserConversationRef, result: z.array(BrowserTab) },
  // A new tab for the conversation, at the URL when one is given, held at the viewport when one is.
  'browser.open': { params: BrowserConversationRef.extend({ url: BrowserUrl.optional(), viewport: BrowserViewport.nullable().optional() }), result: BrowserNavigation },
  // The first visit to a site outside local development hosts asks the user in the chat; the
  // outcome says whether the page loaded, the user refused, or they have not answered yet.
  'browser.navigate': { params: BrowserTabRef.extend({ to: BrowserNavigateTo, viewport: BrowserViewport.nullable().optional() }), result: BrowserNavigation },
  // Holds the tab at a size for the agent's layout, or lets it follow the panel again (null).
  'browser.setViewport': { params: BrowserTabRef.extend({ viewport: BrowserViewport.nullable() }), result: BrowserTab },
  'browser.snapshot': { params: BrowserTabRef, result: BrowserSnapshot },
  'browser.screenshot': { params: BrowserTabRef.extend(BrowserScreenshotOptions.shape), result: BrowserScreenshot },
  'browser.click': { params: BrowserTabRef.extend(browserActions.click.shape), result: BrowserAction },
  'browser.type': { params: BrowserTabRef.extend(browserActions.type.shape), result: BrowserAction },
  'browser.press': { params: BrowserTabRef.extend(browserActions.press.shape), result: BrowserAction },
  'browser.hover': { params: BrowserTabRef.extend(browserActions.hover.shape), result: BrowserAction },
  'browser.scroll': { params: BrowserTabRef.extend(browserActions.scroll.shape), result: BrowserAction },
  'browser.select': { params: BrowserTabRef.extend(browserActions.select.shape), result: BrowserAction },
  'browser.wait': { params: BrowserTabRef.extend(browserActions.wait.shape), result: BrowserAction },
  // The page's console, errors and failed requests, since the tab opened or its last navigation.
  'browser.console': { params: BrowserTabRef.extend({ sinceNavigation: z.boolean().optional(), requestId: z.string().max(80).optional() }), result: BrowserConsole },
  'browser.close': { params: BrowserTabRef, result: Ok },
  // The user's side, from the app. status answers from the app's host, connecting when it is not.
  'browser.status': { params: z.object({}), result: BrowserStatus },
  // The conversation's tabs; this connection then receives browser.tabsChanged for it until it
  // unwatches, and may view and drive its tabs meanwhile.
  'browser.watch': { params: BrowserConversationRef, result: z.array(BrowserTab) },
  'browser.unwatch': { params: BrowserConversationRef, result: Ok },
  // Every tab there is, the user's own included, for the browser panel; then browser.tabsChanged
  // for all of them until unwatchAll.
  'browser.watchAll': { params: z.object({}), result: z.array(BrowserTab) },
  'browser.unwatchAll': { params: z.object({}), result: Ok },
  // Navigating a tab from the panel holds the agent's calls on it off for a few seconds; handBack
  // ends that at once. The panel's own size presets go through userViewport.
  'browser.userNavigate': { params: z.object({ tabId: BrowserTabId, to: BrowserNavigateTo }), result: BrowserTab },
  'browser.userViewport': { params: z.object({ tabId: BrowserTabId, viewport: BrowserViewport.nullable() }), result: BrowserTab },
  // For a conversation the connection watches, or, with none, a tab of the user's own.
  'browser.newTab': { params: z.object({ conversationId: z.string().uuid().optional(), url: BrowserUrl.optional() }), result: BrowserTab },
  'browser.closeTab': { params: z.object({ tabId: BrowserTabId }), result: Ok },
  'browser.handBack': { params: z.object({ tabId: BrowserTabId }), result: Ok },
  'browser.userScreenshot': { params: z.object({ tabId: BrowserTabId }), result: AttachmentInfo },
  'browser.shareTab': { params: z.object({ tabId: BrowserTabId, conversationId: z.string().uuid().nullable() }), result: BrowserTab },
  'browser.capture': { params: z.object({ tabId: BrowserTabId }).extend(BrowserCaptureOptions.shape), result: BrowserPageContext.nullable() },
  'browser.cancelCapture': { params: z.object({ tabId: BrowserTabId }), result: Ok },
  'browser.devtools': { params: z.object({ tabId: BrowserTabId }), result: Ok },
  'browser.userConsole': { params: z.object({ tabId: BrowserTabId, requestId: z.string().max(80).optional() }), result: BrowserConsole },
  // An upload in chunks; core checks and stores the image on commit.
  'attachments.begin': {
    params: z.object({ size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES) }),
    result: z.object({ uploadId: z.string() })
  },
  'attachments.append': {
    params: z.object({ uploadId: z.string().min(1).max(64), offset: z.number().int().nonnegative(), data: Base64Chunk }),
    result: Ok
  },
  'attachments.commit': { params: z.object({ uploadId: z.string().min(1).max(64) }), result: AttachmentInfo },
  'attachments.stat': { params: z.object({ id: AttachmentId }), result: AttachmentInfo },
  'attachments.read': {
    params: z.object({
      id: AttachmentId,
      offset: z.number().int().nonnegative(),
      length: z.number().int().min(1).max(ATTACHMENT_CHUNK_BYTES)
    }),
    result: z.object({ data: z.string() })
  },
  // Shells in the app's own terminal panel; their output flows through sessions.*.
  'ports.list': { params: z.object({}), result: PortList },
  'ports.stop': { params: PortRef, result: Ok },
  'terminals.list': { params: z.object({}), result: z.array(Terminal) },
  // colorPrompt: a zsh whose prompt the user never set gets one in colour, with the git branch.
  'terminals.open': { params: z.object({ cwd: z.string().optional(), colorPrompt: z.boolean().optional() }), result: Terminal },
  'terminals.close': { params: z.object({ id: z.string().uuid() }), result: Ok },
  // An agent's own terminals, called by Antumi's MCP server for the conversation it serves: run a
  // command in a new tab the user sees, read the end of what it printed, stop it. A conversation
  // reaches only the terminals it opened.
  'terminals.run': {
    params: z.object({ conversationId: z.string().uuid(), command: z.string().trim().min(1).max(4000), cwd: z.string().optional() }),
    result: TerminalRun
  },
  'terminals.read': {
    params: z.object({ conversationId: z.string().uuid(), id: z.string().uuid(), tail: z.number().int().min(200).max(50_000).optional() }),
    result: TerminalOutput
  },
  'terminals.stop': { params: z.object({ conversationId: z.string().uuid(), id: z.string().uuid() }), result: Ok },
  // Commands kept for the terminal panel, oldest first. Saving without an id adds one.
  'terminalCommands.list': { params: z.object({}), result: z.array(TerminalCommand) },
  'terminalCommands.save': { params: TerminalCommandFields.extend({ id: z.string().uuid().optional() }), result: TerminalCommand },
  'terminalCommands.delete': { params: z.object({ id: z.string().uuid() }), result: Ok },
  // Bookmarks for the built-in browser, oldest first, one per address: adding one already kept
  // returns that one. An import skips what is kept already, and what does not fit.
  'bookmarks.list': { params: z.object({}), result: z.array(Bookmark) },
  'bookmarks.add': { params: BookmarkFields, result: Bookmark },
  'bookmarks.delete': { params: z.object({ id: z.string().uuid() }), result: Ok },
  'bookmarks.import': { params: z.object({ bookmarks: z.array(BookmarkFields).max(MAX_BOOKMARKS) }), result: BookmarkImport },
  // The user's own chat commands, oldest first. Saving without an id adds one.
  'chatCommands.list': { params: z.object({}), result: z.array(SavedChatCommand) },
  'chatCommands.save': { params: ChatCommandFields.extend({ id: z.string().uuid().optional() }), result: SavedChatCommand },
  'chatCommands.delete': { params: z.object({ id: z.string().uuid() }), result: Ok },
  'sessions.attach': {
    params: SessionRef.extend({ fromOffset: z.number().int().nonnegative().optional() }),
    result: z.object({ buffer: z.string(), bufferStart: z.number().int(), endOffset: z.number().int(), exited: z.boolean() })
  },
  'sessions.detach': { params: SessionRef, result: Ok },
  'sessions.write': { params: SessionRef.extend({ data: z.string() }), result: Ok },
  'sessions.resize': {
    params: SessionRef.extend({
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000)
    }),
    result: Ok
  },
  // Project paths any task or conversation has used, most recent first; kept after they are gone.
  'projects.recent': { params: z.object({}), result: z.array(z.string()) },
  // Every worktree Antumi laid out, with what git says of each; sizes come as they are counted.
  'worktrees.list': { params: z.object({}), result: z.array(ManagedWorktree) },
  // Removes each worktree checkCleanWorktree allows, as it stands now; branches stay.
  'worktrees.clean': { params: z.object({ paths: z.array(z.string().min(1)).min(1).max(500) }), result: z.array(WorktreeCleanResult) },
  'projects.forget': { params: z.object({ path: z.string().min(1) }), result: Ok },
  // The project's .antumi/project.json as its checkout has it, or null when it has none.
  'projects.config': { params: z.object({ path: z.string().min(1) }), result: ProjectConfigInfo.nullable() },
  // Trusts the commands the user was shown, by their hash; ones changed since are refused again.
  'projects.trustConfig': { params: z.object({ path: z.string().min(1), hash: z.string().min(1).max(200) }), result: Ok },
  // Writes the project's .antumi/project.json as the user filled it in, its commands allowed as
  // written; with nothing in it, the file goes. Answers with what it now holds. Needs project-config-edit.
  'projects.writeConfig': { params: z.object({ path: z.string().min(1), config: ProjectConfig }), result: ProjectConfigInfo.nullable() },
  // A config to start the form from, read off the project's files (its lockfiles, a setup written
  // for another worktree tool), and what it was read from. Needs project-config-edit.
  'projects.suggestConfig': { params: z.object({ path: z.string().min(1) }), result: z.object({ config: ProjectConfig, from: z.array(z.string()) }) },
  // Files in these project folders whose path ends in `path` (a bare name, or a tail of one),
  // tracked or untracked but not ignored: absolute, the shallowest first, at most 20.
  'projects.findFile': {
    params: z.object({ roots: z.array(z.string().min(1)).min(1).max(20), path: z.string().min(1).max(1000) }),
    result: z.array(z.string())
  },
  // Files and folders in these project folders that fuzzily match `query`, tracked or untracked but
  // not ignored, the best first; an empty query gives each project's top level.
  'projects.searchFiles': {
    params: z.object({ roots: z.array(z.string().min(1)).min(1).max(20), query: z.string().max(200) }),
    result: z.array(ProjectFileMatch)
  },
  // What older clients call projects.recent / projects.forget.
  'repos.recent': { params: z.object({}), result: z.array(z.string()) },
  'repos.forget': { params: z.object({ path: z.string().min(1) }), result: Ok },
  'usage.list': { params: UsageParams, result: z.array(AgentUsage) },
  'usage.history': { params: UsageFilter, result: UsageHistory },
  'usage.scan': { params: z.object({}), result: UsageScanStatus },
  'usage.forecasts': { params: z.object({}), result: z.array(UsageForecast) },
  'usage.automation': { params: z.object({}), result: UsageAutomationState },
  'usage.configureAutomation': { params: UsageAutomationPolicy, result: UsageAutomationState },
  'usage.retryReset': { params: z.object({ id: z.string().min(1).max(300) }), result: UsageAutomationState },
  // Refetches now instead of waiting for the next poll; core rate-limits repeats.
  'usage.refresh': { params: UsageParams, result: z.array(AgentUsage) },
  // Spends one of the agent's resets where its credits say `usable`: the one `creditId` names, or
  // without one whichever the service picks. Then reads its usage again (usage.changed). The client
  // picks the request id and sends the same one on a retry, so a request that timed out is never
  // spent twice.
  'usage.useResetCredit': {
    params: z.object({ agent: AgentKind, account: AgentAccountId.optional(), requestId: z.string().uuid(), creditId: z.string().min(1).max(200).optional() }),
    result: z.object({ outcome: ResetCreditOutcome })
  },
  'agents.stats': { params: z.object({}), result: z.array(AgentStats) },
  'agents.conversationStats': { params: z.object({}), result: z.array(ConversationStats) },
  'dashboard.stats': { params: DashboardParams, result: DashboardStats },
  // Runs that start on their own once their time comes and their agent has quota again, one per
  // agent at a time, in list order: the open ones, then the recently settled. reorder takes the
  // open ones' ids in their new order; clear drops the settled ones from the list.
  'schedules.list': { params: z.object({}), result: ScheduledRunList },
  // Only task and conversation targets are the client's to create; core makes the resume runs.
  'schedules.create': { params: z.object({ target: RequestedTarget, notBefore: z.number().nullable() }), result: ScheduledRun },
  'schedules.update': {
    params: z.object({ id: z.string().uuid(), notBefore: z.number().nullable().optional(), text: z.string().trim().max(100000).optional() }),
    result: ScheduledRun
  },
  'schedules.reorder': { params: z.object({ ids: z.array(z.string().uuid()).max(500) }), result: Ok },
  'schedules.cancel': { params: z.object({ id: z.string().uuid() }), result: ScheduledRun },
  // Starts it now, without waiting for its time or its agent's quota.
  'schedules.runNow': { params: z.object({ id: z.string().uuid() }), result: ScheduledRun },
  'schedules.clear': { params: z.object({}), result: Ok },
  // Routines: rules that open a conversation on a schedule and tell it what to do, unattended.
  // Each occurrence becomes a scheduled run with the routine's id; the list carries only each
  // routine's latest run and how many are unread, runs pages through the rest, newest first.
  'routines.list': { params: z.object({}), result: RoutineList },
  'routines.create': { params: RoutineFields, result: Routine },
  'routines.update': { params: z.object({ id: z.string().uuid() }).merge(RoutineFields.partial()), result: Routine },
  'routines.delete': { params: z.object({ id: z.string().uuid() }), result: Ok },
  // Starts a run now, without waiting for the schedule or the quota; refused while one is at work.
  'routines.runNow': { params: z.object({ id: z.string().uuid() }), result: ScheduledRun },
  'routines.runs': {
    params: z.object({ routineId: z.string().uuid(), before: z.number().nullable().optional(), limit: z.number().int().min(1).max(50).default(50) }),
    result: ScheduledRunList
  },
  // The user looked at a run's result (its conversation), or at all of a routine's.
  'routines.markSeen': { params: z.object({ runId: z.string().uuid() }), result: Ok },
  'routines.markAllSeen': { params: z.object({ routineId: z.string().uuid() }), result: Ok },
  // Group chats, newest activity first. A member's conversation is a conversation of its own, with
  // the group chat's id on it; the chat behind each member's posts is read there.
  'discussions.list': { params: z.object({}), result: DiscussionList },
  'discussions.get': { params: DiscussionRef, result: Discussion },
  // Opens a conversation for each member and starts the first round at once.
  'discussions.create': { params: DiscussionCreate, result: Discussion },
  // Every post, oldest first.
  'discussions.posts': { params: DiscussionRef, result: z.array(DiscussionPost) },
  // The user's word. Naming members (mentions) asks only them, and they must be idle; otherwise it
  // goes to every member in the next round, and starts one when the discussion is not running.
  'discussions.post': {
    params: DiscussionRef.extend({ text: z.string().trim().min(1).max(20000), mentions: z.array(z.string().uuid()).max(5).default([]) }),
    result: DiscussionPost
  },
  // A new topic, once nothing is out (checkNewDiscussionTopic): every member answers it alone first,
  // with what was said before as background, then the rounds and the summary go as for the first.
  'discussions.newTopic': { params: DiscussionRef.extend({ text: z.string().trim().min(1).max(20000) }), result: DiscussionPost },
  // See checkDiscussionAction.
  'discussions.control': { params: DiscussionRef.extend({ action: DiscussionAction }), result: Discussion },
  'discussions.rename': { params: DiscussionRef.extend({ title: z.string().trim().min(1).max(200) }), result: Discussion },
  // See checkAddDiscussionMember and checkRemoveDiscussionMember. Needs discussion-members.
  'discussions.addMember': { params: DiscussionRef.extend({ member: DiscussionMemberFields }), result: Discussion },
  'discussions.removeMember': { params: DiscussionRef.extend({ memberId: z.string().uuid() }), result: Discussion },
  // Every project but the first, which stays (see checkEditDiscussionProjects). Needs discussion-projects.
  'discussions.setProjects': { params: DiscussionRef.extend({ projectPaths: z.array(z.string().trim().min(1)).min(1).max(MAX_TASK_REPOS) }), result: Discussion },
  'discussions.setPinned': { params: DiscussionRef.extend({ pinned: z.boolean() }), result: Discussion },
  // Puts a group chat away, read-only, or takes it out again (checkArchiveDiscussion). Needs
  // discussion-archive.
  'discussions.setArchived': { params: DiscussionRef.extend({ archived: z.boolean() }), result: Discussion },
  // Stops its members and deletes it with their conversations; their folders stay.
  'discussions.delete': { params: DiscussionRef, result: Ok },
  'sources.list': { params: z.object({}), result: z.array(SourceDescriptor) },
  // Non-secret settings only; changing one marked bindsCredential signs the instance out.
  'sources.saveSettings': {
    params: InstanceRef.extend({
      settings: z.record(z.string().max(32), z.string().max(4000)),
      enabled: z.boolean().optional()
    }),
    result: SourceDescriptor
  },
  // Starts a sign-in flow owned by this connection; prompts arrive as sources.loginPrompt. The
  // client picks the flow id, so it knows it before the first prompt can arrive.
  'sources.login': { params: InstanceRef.extend({ flowId: z.string().uuid() }), result: FlowRef },
  'sources.answer': { params: FlowRef.extend({ promptId: z.string().min(1).max(64), value: z.string().max(4000) }), result: Ok },
  'sources.cancelLogin': { params: FlowRef, result: Ok },
  // Forgets the stored credential; settings stay.
  'sources.disconnect': { params: InstanceRef, result: Ok },
  'sources.inbox': { params: z.object({}), result: z.array(SourceInbox) },
  'sources.refresh': { params: InstanceRef, result: SourceInbox },
  // Turns an issue into a pending task that carries the issue's text as a snapshot.
  'sources.import': { params: IssueRef.extend({ agent: AgentKind.nullable().optional() }), result: Task },
  // Opens a conversation to look into an issue, handed the issue's text the way a handoff is, in
  // a mode that reads and plans unless another is asked for.
  'sources.investigate': {
    params: IssueRef.extend({
      agent: AgentKind,
      projectPaths: z.array(z.string().trim().min(1)).max(MAX_TASK_REPOS),
      worktree: z.boolean().optional(),
      branch: z.string().trim().min(1).max(500).optional(),
      // What the user adds, shown as their first message.
      note: z.string().trim().max(100000).optional(),
      references: z.array(ChatReference).max(1000).optional(),
      allowBypass: AllowBypass,
      permissionMode: ChatPermissionMode.optional(),
      model: z.string().trim().min(1).max(200).optional(),
      effort: z.string().trim().min(1).max(200).optional(),
      modelProvider: ModelProviderId.optional()
    }),
    result: Conversation
  },
  'sources.dismiss': { params: IssueRef, result: SourceInbox },
  'sources.restore': { params: IssueRef, result: SourceInbox },
  // Fetches the task's issue again and replaces its snapshot.
  'sources.resync': { params: z.object({ taskId: z.string().min(1) }), result: Task }
} as const

export const rpcNotifications = {
  'usage.analyticsChanged': z.object({}),
  'git.changed': z.object({}),
  'system.awakeChanged': z.object({ status: ComputerAwakeStatus }),
  'system.chatSettingsChanged': z.object({ settings: ChatSettings }),
  // Every installed skills repository (skills.list) after one is installed, updated, rolled back or removed.
  'skills.changed': z.object({ repos: z.array(SkillRepo) }),
  // Every MCP server (mcpServers.list) after one is added, changed or removed.
  'mcpServers.changed': z.object({ servers: z.array(McpServer) }),
  // Every model provider (modelProviders.list) after one is added, changed or removed.
  'modelProviders.changed': z.object({ providers: z.array(ModelProvider) }),
  // The accounts (accounts.list) after one is added, signed in, changed, removed or made active.
  'accounts.changed': z.object({ accounts: AgentAccounts }),
  'system.agentCliChanged': z.object({ status: AgentCliStatus }),
  'system.environmentChanged': z.object({ environment: Environment }),
  // Entries just added to a stage's wire log; only to connections watching the conversation's.
  'debug.wireEntries': z.object({ conversationId: z.string(), stageId: z.string(), entries: z.array(WireEntry) }),
  // The whole list (schedules.list) whenever a run in it changes.
  'schedules.changed': z.object({ runs: ScheduledRunList }),
  // Every routine (routines.list) whenever one, or one of its runs, changes.
  'routines.changed': z.object({ routines: RoutineList }),
  // A group chat changed: its state, its members' status, or a post was added or settled.
  'agentProfiles.changed': z.object({ profile: AgentProfile }),
  'agentCalls.changed': z.object({ call: AgentCall }),
  'squads.changed': z.object({ squad: Squad }),
  'squads.runChanged': z.object({ run: SquadRun }),
  'discussions.changed': z.object({ discussion: Discussion }),
  'discussions.deleted': DiscussionRef,
  // Posts added or changed; to every connection, as there are few and they are short.
  'discussions.posts': z.object({ discussionId: z.string(), posts: z.array(DiscussionPost) }),
  'conversations.changed': z.object({ conversation: Conversation }),
  'conversations.deleted': ConversationRef,
  // A conversation's to-dos as they now stand; to every connection, as they are few and short.
  'todos.changed': z.object({ conversationId: z.string(), groups: TodoList }),
  // Items added or changed, newest revision each; only to connections watching the conversation.
  'conversations.chatItems': z.object({ conversationId: z.string(), items: ChatItemList }),
  // Text streamed onto an assistant or reasoning item the client already holds. Item ids are
  // unique within a stage only; an older core leaves the stage out.
  'conversations.chatDelta': z.object({ conversationId: z.string(), stageId: z.string().optional(), itemId: z.string(), append: z.string() }),
  'tasks.changed': z.object({ task: Task }),
  'tasks.deleted': z.object({ id: z.string() }),
  'sessions.data': z.object({ sessionId: z.string(), data: z.string(), offset: z.number().int() }),
  'sessions.exit': z.object({ sessionId: z.string(), exitCode: z.number() }),
  'usage.changed': z.object({ usage: AgentUsage }),
  'terminals.changed': z.object({ terminals: z.array(Terminal) }),
  'terminalCommands.changed': z.object({ commands: z.array(TerminalCommand) }),
  'bookmarks.changed': z.object({ bookmarks: z.array(Bookmark) }),
  'chatCommands.changed': z.object({ commands: z.array(SavedChatCommand) }),
  // The hosted browser: its status to every connection; a conversation's tabs to the connections
  // watching them (browser.watch).
  'browser.changed': z.object({ status: BrowserStatus }),
  'browser.tabsChanged': z.object({ conversationId: z.string().nullable(), tabs: z.array(BrowserTab) }),
  // Worktrees were cleaned, or their sizes counted: list them again.
  'worktrees.changed': z.object({}),
  'plugins.changed': z.object({ plugins: z.array(PluginInfo) }),
  'pets.changed': PetLibraryState,
  'sources.listChanged': z.object({ sources: z.array(SourceDescriptor) }),
  'sources.inboxChanged': z.object({ inbox: SourceInbox }),
  // Sent only to the connection that started the flow.
  'sources.loginPrompt': z.object({ flowId: z.string(), promptId: z.string(), prompt: LoginPrompt }),
  'sources.loginNotice': z.object({ flowId: z.string(), notice: LoginNotice }),
  'sources.loginFinished': z.object({
    flowId: z.string(),
    provider: SourceId,
    instance: SourceId,
    account: z.string().nullable(),
    problem: SourceProblem.nullable()
  })
} as const

export type RpcMethod = keyof typeof rpcMethods
export type RpcParams<M extends RpcMethod> = z.input<(typeof rpcMethods)[M]['params']>
export type RpcParsedParams<M extends RpcMethod> = z.output<(typeof rpcMethods)[M]['params']>
export type RpcResult<M extends RpcMethod> = z.output<(typeof rpcMethods)[M]['result']>

export type RpcNotificationName = keyof typeof rpcNotifications
export type RpcNotificationParams<N extends RpcNotificationName> = z.output<
  (typeof rpcNotifications)[N]
>

// Typed views: indexing these with a generic M yields M's own schema, where
// indexing the raw literals widens to the union of every method's schema.
export const rpcSchemas: {
  [M in RpcMethod]: { params: z.ZodType<RpcParsedParams<M>>; result: z.ZodType<RpcResult<M>> }
} = rpcMethods
export const rpcNotificationSchemas: {
  [N in RpcNotificationName]: z.ZodType<RpcNotificationParams<N>>
} = rpcNotifications

export function isRpcMethod(name: string): name is RpcMethod {
  return Object.hasOwn(rpcMethods, name)
}

export function isRpcNotificationName(name: string): name is RpcNotificationName {
  return Object.hasOwn(rpcNotifications, name)
}

export const RPC_ERROR = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  // Domain failures; `data.reason` carries a stable code the UI can localize.
  rejected: -32000
} as const

export const RpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number(),
  method: z.string(),
  params: z.unknown().optional()
})

// Order matters: z.unknown() accepts a missing key, so the error shape must be
// tried before the result shape or every error would parse as a result.
export const RpcFrame = z.union([
  RpcRequest,
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.number().nullable(),
    error: z.object({
      code: z.number(),
      message: z.string(),
      data: z.object({ reason: z.string() }).optional()
    })
  }),
  z.object({ jsonrpc: z.literal('2.0'), id: z.number(), result: z.unknown() }),
  z.object({ jsonrpc: z.literal('2.0'), method: z.string(), params: z.unknown() })
])
export type RpcFrame = z.infer<typeof RpcFrame>

// Written by core on startup; clients discover port and token from it.
export const CoreEndpoint = z.object({
  port: z.number().int(),
  token: z.string(),
  pid: z.number().int(),
  protocolVersion: z.number().int(),
  // The core's package version, so an app newer than the core serving its home can replace it.
  // Older cores leave it out, which reads as outdated.
  version: z.string().optional()
})
export type CoreEndpoint = z.infer<typeof CoreEndpoint>

export function coreUrl(endpoint: Pick<CoreEndpoint, 'port' | 'token'>): string {
  return `ws://127.0.0.1:${endpoint.port}/?token=${encodeURIComponent(endpoint.token)}`
}
