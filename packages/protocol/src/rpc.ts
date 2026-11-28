import { WechatRemoteNotification, WechatRemoteStatus } from './wechat-remote'
import { AgentProxySettings, AgentProxyStatus, AgentProxyTestResult } from './agent-proxy'
import { ProviderImportPreview, ProviderImportResult } from './provider-import'
import { z } from 'zod'
import { AutoInvestigationConfig, AutoInvestigationInfo, AutoInvestigationPage, AutoInvestigationRun, SourceFixInfo } from './source'
import { SourceCommentOptions, SourceCommentPage, SourceDeliveryInfo, SourceUpdateTarget, SourceUpdateSummary, SourceUpdates } from './source-comments'
import { MAX_SOURCE_REPORT, MAX_WRITEBACK_COMMENT, SOURCE_REPORT_LIMIT, SourceOutcome, SourceTaskProposal, SourceTransitions, SourceWrite, SourceWriteback, SourceWritePlan } from './source-writeback'
import { SourceWritebackConfig, WritebackLane, WritebackOptions } from './source-writeback-rules'
import { BrowserDownload, BrowserDownloadAction, BrowserUploadOptions } from './browser'
import { ChatReference } from './chat-reference'
import { AgentProfile, AgentProfileFields, AgentCall, AgentCallResumeCheck, AgentCallWorkspace, DelegationTarget, DirectAgentCall } from './agent-profile'
import { gitParams, GitProject, GitTarget, GitBranch, GitStatus, GitHistory, GitDetail, GitComparison, GitAction, GitResult, GitOutgoing } from './git'
import { AgentKind, MAX_DETAILS_LENGTH, MAX_TASK_REPOS, RepoStartOptions, Task, TaskStatus } from './task'
import { ATTACHMENT_CHUNK_BYTES, AttachmentId, AttachmentInfo, Base64Chunk, ImageRef, MAX_ATTACHMENT_BYTES, MAX_CHAT_IMAGES, MAX_TASK_IMAGES } from './attachments'
import { LoginNotice, LoginPrompt, SourceDescriptor, SourceId, SourceInbox, SourceIssuePreview, SourceProblem } from './source'
import { PluginId, PluginInfo, PluginInstallSource, PluginPageFiles, PluginPageId, PluginPageMethod, PluginVersion, RecommendedPlugin } from './plugin'
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
import { VisualizationFile } from './visualization'
import { ManagedWorktree, WorktreeCleanResult } from './worktree'
import { ProjectChoice } from './project-choice'
import { browserActions, BrowserAction, BrowserCaptureOptions, BrowserConsole, BrowserPageContext, BrowserNavigateTo, BrowserNavigation, BrowserScreenshot, BrowserScreenshotOptions, BrowserSnapshot, BrowserStatus, BrowserTab, BrowserTabId, BrowserUrl, BrowserViewport } from './browser'
import { ComputerAwakeMode, ComputerAwakeStatus } from './awake'
import { AgentCliStatus, AgentCliUpgrade } from './agent-cli'
import { Environment } from './environment'
import { RequestedTarget, ScheduledRun, ScheduledRunList } from './schedule'
import { Routine, RoutineFields, RoutineList } from './routine'
import { WireEntry, WirePage, WireUsage } from './wire'
import { Discussion, DiscussionAction, DiscussionCreate, DiscussionFormat, DiscussionFormatAsk, DiscussionList, DiscussionMemberFields, DiscussionPost } from './discussion'

import { SquadCall, SquadCallTarget } from './squad-call'
import { Squad, SquadFields, SquadRun, SquadWork, SquadPlanRef } from './squad'
import { KnowledgeFolder, KnowledgeVault } from './knowledge'
import { CommitSha, LocalSkillFolder, RecommendedSkillRepo, SkillActivation, SkillRepo, SkillRepoId, SkillSearchResult, SkillUpdateCheck } from './skills'
import { TodoList, TodoOwner, TodoText, TodoTitle } from './todos'
import { McpImportCandidate, McpImportItem, McpProbe, McpServer, McpServerInput, McpServerName } from './mcp'
import { ModelProvider, ModelProviderId, ModelProviderInput, ModelProviderModels, ModelProviderModelsQuery, ModelProviderProbe } from './model-provider'
import { AccountKey, AgentAccount, AgentAccountId, AgentAccounts } from './agent-account'
import { ExternalSession, ExternalSessionRef } from './session-import'
import { ProjectStarIdentity, ProjectStarResult, ProjectStarStatus } from './project-star'
import { AgentPullRequestRun, PullRequestDraft, PullRequestEligibility, PullRequestHandoffKind, PullRequestLink, PullRequestMergeMethod } from './pull-request'
import { Bookmark, BookmarkFields, BookmarkImport, MAX_BOOKMARKS } from './bookmarks'
import { BrowserHistoryEntry, BrowserHistorySearch } from './browser-history'
import { BrowserSite } from './browser-sites'
import { MOBILE_EXTRA_HOSTS_MAX, MobileAccess, MobileBridgeAddress, MobileExtraHost, MobilePairing, MobilePort, MobilePushUrl, MobileRelayServer, MobileRelaySetup, MobileStatus } from './mobile'
import { Channel, ChannelInput, ChannelReadiness, ChannelRequest, ChannelTaskFeedback, ChannelTaskReport, ChannelToolCall, ChannelToolSpec } from './channel'

// Bump only for breaking changes; additive optional fields keep the version.
export const PROTOCOL_VERSION = 20

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
const PullRequestTaskParams = z.object({ taskId: z.string().min(1) })
const PullRequestRepoParams = PullRequestTaskParams.extend({ repoPath: z.string().min(1) })
const PullRequestBase = z.string().trim().min(1).max(500)
const ConversationRef = z.object({ id: z.string().uuid() })
const DiscussionRef = z.object({ id: z.string().uuid() })
const FileScopeParams = z.object({ conversationId: z.string().uuid().optional(), roots: z.array(z.string().min(1).max(32_768)).min(1).max(20).optional() })
// The usage window kinds this client reads; an older client names none, and reads session and weekly.
const UsageParams = z.object({ windowKinds: z.array(z.string()).optional() })
// What core can do beyond this protocol version's baseline; an older core sends none.
// chat-options: a chat stage's permission mode, model and effort can be changed (conversations.setOption).
// chat-images: conversations.send takes images; an older core would drop them unnoticed.
// source-investigate-images: sources.investigate attaches uploaded images to the first instruction.
// source-issue-preview: reads an issue and its comments without importing or investigating it.
// source-auto-investigation: durable discovery, bounded automatic investigations in a picked permission mode, and history.
// source-hub-tasks: an automatic investigation is an ordinary conversation in the picked mode, told by
// its note (DEFAULT_INVESTIGATION_PROMPT when empty), and opens its issue's task with sources.createTask.
// conversation-projects: a conversation's additional projects can change (conversations.setAdditionalProjects).
// browser: core hosts a browser for chat agents (the browser.* methods).
// usage-limit: core continues a chat whose turn hit a usage limit once it lifts (usageLimit items).
// agent-stats: core keeps each task run and reports how each agent's went (agents.stats).
// conversation-stats: core keeps each chat turn and reports what each agent's cost (agents.conversationStats).
// prompt-suggestions: core keeps the chat settings (system.chatSettings) and reports a chat's suggested next message.
// environment: core checks for git and the agent CLIs on its path (system.environment).
// chat-commands: core keeps the user's own slash commands for the chat composer (chatCommands.*).
// chat-command-pins: a few of them can be pinned above the composer (chatCommands.pin).
// file-mentions: core searches projects' files and folders for the composer's @ menu (projects.searchFiles).
// file-preview: core resolves chat file references and reads their text (files.resolve, files.read).
// inline-visualizations: core reads a Codex reply's HTML within the owning stage's folders.
// archived-worktrees: worktrees.clean takes an archived conversation's worktree, which core lays out again
//   from its branch when the conversation is taken out; core cleans idle ones that hold nothing (worktreeCleanDays).
// file-editor: core lists project folders and saves edited project files (files.list, files.write).
// dashboard: core adds up runs and turns by day for the dashboard (dashboard.stats).
// git-commit-branches: core lists the branches holding a commit (git.containing).
// task-handoff: a task's chat can go to another agent (tasks.handoff), and one going on with another agent is handed the chat.
// handoff-model: a handoff takes the model and effort the agent starts in (conversations.handoff, tasks.handoff).
// handoff-mode: a handoff takes the permission mode the agent starts in, too.
// handoff-images: conversations.handoff and tasks.handoff attach images to the first message.
// handoff-provider: a handoff takes the model provider the agent runs on, null its own account.
// conversation-todos: core keeps each conversation's to-dos, which its agent writes too (todos.*).
// todo-overview: core gathers what is left to do across conversations, for the overview (todos.open).
// terminal-color-prompt: terminals.open takes colorPrompt, a prompt in colour for a zsh whose prompt the user never set.
// git-commit-actions: git.execute takes tag and detach, for a commit in the history.
// git-update: git.execute takes update, and status says when a rebase can be carried on.
// git-push-target: git.outgoing lists what a push sends; push takes from and keeps an upstream it has;
// git.execute takes track.
// git-favorites: git.favorite saves branch favorites, included in git.status, across a repository's worktrees.
// git-projects: git.openProject lists checkouts; git.* also accepts a project target without a chat.
// git-branch-browser: status includes commit tags, recent checkouts and task bindings.
// git-rebase: execute rebases the current ordinary branch onto a selected ref.
// git-cherry-pick: execute takes cherryPick and revert, and status says when one of them can be carried on.
// git-amend: execute's commit takes amend, which needs no changes to fold in.
// git-force-push: execute's push takes force, with a lease on the remote branch as last fetched.
// project-files: the files.* methods take project folders (roots) in place of a conversation, for the files panel
//   browsing a project no conversation is on.
// project-config: core copies files and runs setup in new worktrees and check before review, from a
// project's .antumi/project.json, once the user trusts its commands (projects.config, projects.trustConfig).
// project-config-edit: core writes that file as the user filled it in (projects.writeConfig), and
// suggests what to fill it with (projects.suggestConfig).
// conversation-references: history_read resolves explicit antumi://conversation/<id> references.
// chat-references: user messages and queues retain the composer's explicit reference targets.
// pasted-text: a long paste is uploaded as an attachment and kept as a text file the conversation's
//   agent reads without asking (attachments.commitText).
// pull-request-base-branches: lists the remote branches a task's PR can target.
// plugin-update-check: inspect installed plugin releases without installing them (plugins.checkUpdates).
// deferred-workspace: open before model and workspace preparation; continue may skip worktree setup.
// chat-queue-order: queued messages may move up or down (conversations.moveQueued).
// plugin-pages: a plugin may ship pages the desktop frames (PluginInfo.pages, plugins.pageFiles, plugins.pageCall; docs/PLUGINS.md).
export const CORE_FEATURES = ['provider-selection-v2', 'deferred-workspace', 'chat-queue-order', 'agent-proxy', 'squad-calls', 'mobile', 'wechat-remote', 'source-auto-investigation', 'chat-references', 'conversation-references', 'agent-profiles', 'pets', 'plugins', 'plugin-recommendations', 'plugin-packages', 'chat-options', 'chat-images', 'task-start', 'worktrees', 'conversation-branches', 'conversation-commit-push', 'find-file', 'conversation-projects', 'browser', 'browser-collaboration', 'browser-file-transfers', 'keep-awake', 'terminal-commands', 'bookmarks', 'browser-history', 'usage-limit', 'agent-stats', 'conversation-stats', 'prompt-suggestions', 'environment', 'conversation-pin', 'schedules', 'chat-commands', 'file-mentions', 'plan-modes', 'agent-terminals', 'schedule-images', 'dashboard', 'task-conversation-summaries', 'routines', 'ports', 'conversation-fork', 'conversation-configuration', 'conversation-commit-steps', 'conversation-worktrees', 'conversation-start-branch', 'wire-log', 'file-preview', 'deferred-conversation-start', 'agent-cli-installation', 'agent-cli-maintenance', 'task-launch-options', 'git-management', 'git-commit-branches', 'task-handoff', 'handoff-model', 'handoff-mode', 'task-launch', 'discussions', 'discussion-members', 'discussion-projects', 'discussion-topics', 'discussion-requirements', 'discussion-model-providers', 'task-cancel', 'task-redo-in-place', 'conversation-archive', 'discussion-archive', 'translate', 'commit-message', 'squads', 'squad-leader-planning', 'conversation-todos', 'knowledge-base', 'knowledge-base-kind', 'skills-library', 'skills-search', 'skills-activation', 'mcp-servers', 'source-investigate', 'source-investigate-images', 'source-issue-preview', 'todo-overview', 'conversation-helper', 'small-model-stats', 'terminal-color-prompt', 'git-commit-actions', 'file-editor', 'project-config', 'project-config-edit', 'model-providers', 'git-update', 'git-push-target', 'git-cherry-pick', 'git-amend', 'git-force-push', 'task-auto-run', 'session-import', 'agent-accounts', 'usage-analytics', 'task-references', 'release-idle-chats', 'project-star', 'git-favorites', 'project-files', 'git-projects', 'git-branch-browser', 'git-rebase', 'direct-agent-calls', 'discussion-formats', 'discussion-format-suggest', 'agent-call-resume', 'delegation-worktree', 'pasted-text', 'task-conversation-rows', 'inline-visualizations', 'archived-worktrees', 'model-provider-models', 'skills-local', 'model-provider-headers', 'provider-model-images', 'source-comments-v1', 'pull-requests', 'pull-request-base-branches', 'browser-sites', 'chat-command-pins', 'agent-profile-delegation-mode', 'attachment-sweep', 'mobile-handoff', 'channels', 'chat-catalog-problem', 'chat-catalog-refresh', 'channel-readiness', 'channel-tasks', 'plugin-pages', 'plugin-browser-sessions', 'account-keys', 'conversation-accounts', 'handoff-images', 'handoff-provider', 'source-writeback', 'cc-switch-import', 'plugin-update-check', 'source-writeback-lanes', 'source-writeback-per-type', 'source-auto-fix', 'source-agent-task-proposals', 'project-choices', 'project-suggestions', 'source-hub-tasks', 'draft-mention-targets', 'channel-task-reports', 'channel-task-cards', 'channel-platform-tools', 'channel-follow-ups', 'managed-steer', 'agent-call-redirect', 'delegation-chat'] as const
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
// discussion-model-providers: each discussion member may run on one of the user's model providers.
// translate: conversations.translate; commit-message: git.commitMessage.
// conversation-archive: conversations.setArchived, Conversation.archivedAt; discussion-archive: discussions.setArchived, Discussion.archivedAt.
// task-cancel: tasks.cancel and tasks.reopen; task-redo-in-place: tasks.redo keeps the task, its earlier goes in Task.attempts.
// deferred-conversation-start: create can return before launching; send takes a ref for safe retries.
// routines: core runs routines, rules that open a conversation on a schedule, and keeps their runs (routines.*). A
// client without it shows the conversations they opened among the others, since it does not read routineId.
// conversation-fork: a free conversation can be forked at one of its messages into a new one (conversations.fork).
// conversation-configuration: conversations.configuration returns settings for a fresh conversation.
// discussions: core runs group chats, agents discussing a topic in rounds (discussions.*).
// discussion-formats: discussions.create takes a format other than the round table (Discussion.format, DiscussionPost.stage).
// discussion-format-suggest: discussions.suggestFormat.
// agent-call-resume: agentCalls.resume and agentCalls.resumeCheck, AgentCall.attempt and resumedFrom, the antumi_agent_resume tool.
// managed-steer: conversations.send with steer alone goes into the running turn of a delegation's or a squad's member, and never starts one (AgentDescriptor.capabilities.managedSteer); agentCalls.steer does the same for the caller's agent, through the antumi_agent_steer tool.
// delegation-chat: conversations.send, conversations.continue and tasks.resumeChat go through while a delegated member edits directories the conversation shares, the message carrying a note for its agent (delegationWritingMessage); what core sends by itself is still refused with agent-call-writing.
// agent-call-redirect: agentCalls.redirect interrupts a member at work and has it go on in its own conversation with the user's note, never ending the call (AgentCall.redirects, resumedFrom.redirected).
// delegation-worktree: agentCalls.dispatch takes workspace; a developing member may work in a worktree of its own (AgentCall.workspace, AgentCall.worktree, ManagedWorktree.agentCall).
// agent-profile-delegation-mode: a developing profile may name the mode it works in when delegated to (AgentProfile.delegationMode).
// mobile-handoff: a phone may hand a free conversation to another agent (conversations.handoff in MOBILE_METHODS).
// channels: agents answer colleagues from chat platforms, locked down (channels.*, channelTools.call, Conversation.channel; docs/CHANNELS.md).
// channel-task-reports: a task from a chat platform is followed back in its thread (ChannelFields.reportTasks, channels.taskReports, channels.taskReportsChanged; docs/CHANNEL-LOOP.md).
// channel-follow-ups: in a thread the bot answered and only the asker spoke in, the asker goes on without a mention (ChannelFields.followUps).
// channel-platform-tools: a channel may give its agent the platform's own tools, used as the bot (ChannelFields.platformTools, docLocation, docAccess; channelTools.list).
// channel-task-cards: the owner starts it and the asker accepts or sends it back on the platform's cards (ChannelFields.ownerUsers and taskCards, channels.taskFeedback, channels.continueTask, channels.taskFeedbackChanged).
// wire-log: core can record what passes between it and chat agents (ChatSettings.wireLog) and serves it (debug.*).
// Whether a start may offer running with nothing asked and nothing sandboxed; the conversation
// keeps what its latest start said.
const AllowBypass = z.boolean().optional()
// The mode, model and effort an agent takes over with; absent keeps what it last ran in this chat.
const HandoffOptions = TaskLaunchOptions.pick({ permissionMode: true, model: true, effort: true }).extend({
  references: z.array(ChatReference).max(1000).optional(),
  images: z.array(AttachmentId).max(MAX_CHAT_IMAGES).optional(),
  // Becomes the conversation's (Conversation.modelProvider), and must serve the agent; null puts it
  // on its own account. Needs handoff-provider.
  modelProvider: ModelProviderId.nullable().optional()
})
// One page of a conversation's chat history; `before` fetches the page older than it, null when none is left.
// truncated: a limit cut the oldest stage of the page short, and paging back goes on before it.
const ChatPage = z.object({ items: ChatItemList, before: z.string().nullable(), truncated: z.boolean().optional() })
const ChatPageLimit = z.number().int().min(1).max(1000)
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
  'plugins.checkUpdates': { params: z.object({ refresh: z.boolean().optional() }), result: z.array(PluginInfo) },
  'plugins.install': { params: z.object({ source: PluginInstallSource }), result: PluginInfo },
  // The latest stable release's ZIP packages, so a project address can be installed without naming a file.
  'plugins.githubPackages': { params: z.object({ repository: PluginInstallSource.options[1].shape.repository }), result: z.object({ tag: z.string().min(1).max(128), packages: z.array(z.string().min(1).max(200)).min(1).max(50) }) },
  'plugins.update': { params: z.object({ id: PluginId }), result: PluginInfo },
  'plugins.setEnabled': { params: z.object({ id: PluginId, enabled: z.boolean() }), result: PluginInfo },
  'plugins.rollback': { params: z.object({ id: PluginId, version: PluginVersion }), result: PluginInfo },
  'plugins.uninstall': { params: z.object({ id: PluginId }), result: Ok },
  'plugins.pageFiles': { params: z.object({ id: PluginId, page: PluginPageId }), result: PluginPageFiles },
  'plugins.pageCall': { params: z.object({ id: PluginId, page: PluginPageId, method: PluginPageMethod, params: z.unknown() }), result: z.object({ result: z.unknown() }) },
  'agentProfiles.list': { params: z.object({}), result: z.array(AgentProfile) },
  'agentProfiles.save': { params: AgentProfileFields.extend({ id: z.string().uuid().optional() }), result: AgentProfile },
  'agentProfiles.archive': { params: z.object({ id: z.string().uuid(), archived: z.boolean() }), result: AgentProfile },
  'agentProfiles.available': { params: ConversationRef, result: z.array(AgentProfile) },
  // read: from the caller's own status tool, whose reading returns the finished results it sees.
  'agentCalls.list': { params: ConversationRef.extend({ read: z.boolean().optional() }), result: z.array(AgentCall) },
  // Profiles and ready agents a conversation can delegate to, with their quota (feature direct-agent-calls).
  'agentCalls.targets': { params: ConversationRef, result: z.array(DelegationTarget) },
  // A saved profile by profileId, or, on a core with direct-agent-calls, an agent as it is.
  'agentCalls.dispatch': { params: ConversationRef.extend({ profileId: z.string().uuid().optional(), ...DirectAgentCall.partial().shape, instruction: AgentCall.shape.instruction, ref: z.string().min(1).max(200).optional(), workspace: AgentCallWorkspace.optional() }), result: AgentCall },
  'agentCalls.cancel': { params: ConversationRef.extend({ callId: z.string().uuid() }), result: AgentCall },
  // A call that stopped short, taken up again in its own conversation where it left off, with what
  // the user adds; and, before that, what going on would mean. Needs agent-call-resume.
  'agentCalls.resumeCheck': { params: ConversationRef.extend({ callId: z.string().uuid() }), result: AgentCallResumeCheck },
  'agentCalls.resume': { params: ConversationRef.extend({ callId: z.string().uuid(), note: z.string().trim().max(4000).optional() }), result: AgentCall },
  // The caller passing a word on to its member at work: into the turn the member runs, as the
  // user's own message there goes, or refused with the reason. Needs managed-steer.
  'agentCalls.steer': { params: ConversationRef.extend({ callId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }), result: Ok },
  // Interrupts a member at work and puts its call back in the queue to go on, in the same
  // conversation, with the user's note: one step, so the caller is never told it was cancelled.
  // Needs agent-call-redirect.
  'agentCalls.redirect': { params: ConversationRef.extend({ callId: z.string().uuid(), note: z.string().trim().min(1).max(4000) }), result: AgentCall },
  'squadCalls.targets': { params: ConversationRef, result: z.array(SquadCallTarget) },
  'squadCalls.dispatch': { params: ConversationRef.extend({ squadId: z.string().uuid(), instruction: z.string().trim().min(1).max(20000), ref: z.string().min(1).max(200), images: z.array(AttachmentId).max(MAX_TASK_IMAGES).optional() }), result: SquadCall },
  'squadCalls.list': { params: ConversationRef.extend({ read: z.boolean().optional() }), result: z.array(SquadCall) },
  'squadCalls.cancel': { params: ConversationRef.extend({ callId: z.string().uuid() }), result: SquadCall },
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
  'git.openProject': { params: z.object({ path: z.string().min(1) }), result: GitProject },
  'git.status': { params: GitTarget, result: GitStatus },
  'git.favorite': { params: gitParams({ ref: GitBranch.shape.ref, favorite: z.boolean() }), result: Ok },
  'git.history': { params: gitParams({ ref: z.string(), query: z.string().max(500).default(''), offset: z.number().int().nonnegative().default(0), tips: z.array(z.string()).optional() }), result: GitHistory },
  'git.detail': { params: gitParams({ sha: z.string(), parent: z.string().optional() }), result: GitDetail },
  // The local and remote branches holding a commit, apart from its detail: on a large repository
  // walking every branch takes a moment the detail need not wait for.
  'git.containing': { params: gitParams({ sha: z.string() }), result: z.array(z.object({ name: z.string(), remote: z.boolean() })) },
  'git.diff': { params: gitParams({ base: z.string().nullable(), sha: z.string(), file: z.string() }), result: FileDiff },
  'git.compare': { params: gitParams({ ref: z.string(), direct: z.boolean().default(false) }), result: GitComparison },
  'git.execute': { params: gitParams({ action: GitAction }), result: GitResult },
  // Needs git-push-target.
  'git.outgoing': { params: gitParams({ remote: z.string().min(1).max(200), name: z.string().min(1).max(500) }), result: GitOutgoing },
  // A message for committing everything the repo holds, written by the target's agent from the diff,
  // the project's commit rules and its last commits, as a quick request on the model picked (else
  // its cheapest). Needs commit-message.
  'git.commitMessage': { params: gitParams({ model: z.string().trim().min(1).max(200).optional() }), result: z.object({ message: z.string(), model: z.string().nullable() }) },
  'system.hello': {
    params: z.object({
      protocolVersion: z.number().int(),
      // Core's phone gateway, for the paired phone this connection carries: core then holds it to
      // what MOBILE_METHODS lets that device do. Needs mobile.
      // channel-tools: Antumi's MCP server for a conversation opened for a chat platform's asker,
      // which then may call channelTools.call for that conversation and nothing else. Needs channels.
      client: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('mobile'), deviceId: z.string().min(1).max(100) }),
        z.object({ kind: z.literal('channel-tools'), conversationId: z.string().uuid() })
      ]).optional()
    }),
    result: z.object({
      protocolVersion: z.number().int(),
      serverVersion: z.string(),
      features: z.array(z.string()).optional(),
      // The home folder of the user core runs as, which project paths are under: core may run on
      // another machine than the app. Older cores leave it out.
      home: z.object({ path: z.string(), windows: z.boolean() }).optional()
    })
  },
  'system.awakeStatus': { params: z.object({}), result: ComputerAwakeStatus },
  'support.starStatus': { params: z.object({}), result: ProjectStarStatus },
  'support.star': { params: z.object({ identity: ProjectStarIdentity }), result: ProjectStarResult },
  // Each takes the conversation whose folders the files belong to, or the folders themselves
  // (feature project-files); one of the two.
  'files.resolve': { params: FileScopeParams.extend({ path: z.string().min(1).max(32_768) }), result: ResolvedFile.nullable() },
  'files.read': { params: FileScopeParams.extend({ path: z.string().min(1).max(32_768) }), result: FileRead },
  'visualizations.read': { params: z.object({ conversationId: z.string().uuid(), stageId: z.string().uuid(), path: z.string().min(1).max(32_768) }), result: VisualizationFile.nullable() },
  'files.list': { params: FileScopeParams.extend({ path: z.string().min(1).max(32_768) }), result: DirectoryListing },
  'files.write': {
    params: FileScopeParams.extend({ path: z.string().min(1).max(32_768), text: z.string().max(MAX_FILE_PREVIEW_BYTES), expectedMtimeMs: z.number().nullable() }),
    result: FileWrite
  },
  'system.setAwakeMode': { params: z.object({ mode: ComputerAwakeMode }), result: ComputerAwakeStatus },
  'system.agentProxyStatus': { params: z.object({ refresh: z.boolean().optional() }), result: AgentProxyStatus },
  'system.testAgentProxy': { params: z.object({ settings: AgentProxySettings.pick({ mode: true, manual: true }).optional(), targetUrl: z.string().trim().url().max(500).optional() }), result: AgentProxyTestResult },
  'system.chatSettings': { params: z.object({}), result: ChatSettings },
  'system.setChatSettings': { params: ChatSettings.partial(), result: ChatSettings },
  // The vaults Obsidian's registry lists on this machine, the open one first; none headless.
  'knowledge.vaults': { params: z.object({}), result: z.array(KnowledgeVault) },
  'knowledge.inspect': { params: z.object({ path: z.string().min(1).max(32_768) }), result: KnowledgeFolder },
  'skills.list': { params: z.object({}), result: z.array(SkillRepo) },
  'skills.recommended': { params: z.object({}), result: z.array(RecommendedSkillRepo) },
  // The skills in the folders agents load by themselves (~/.claude/skills and the like), as they are.
  'skills.local': { params: z.object({}), result: z.array(LocalSkillFolder) },
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
  // Native and desktop histories outside Antumi; importing again merges new and completed records.
  'sessionImports.list': { params: z.object({}), result: z.object({ sessions: z.array(ExternalSession), warnings: z.array(z.object({ agent: AgentKind, message: z.string() })).optional() }) },
  'sessionImports.import': { params: z.object({ sessions: z.array(ExternalSessionRef).min(1).max(100) }), result: z.object({ conversations: z.array(Conversation) }) },
  'modelProviders.previewCcSwitch': { params: z.object({ directory: z.string().trim().max(4096).optional() }), result: ProviderImportPreview },
  'modelProviders.importCcSwitch': { params: z.object({ token: z.string().min(1).max(100), ids: z.array(z.string().min(1).max(100)).min(1).max(500) }), result: ProviderImportResult },
  'modelProviders.list': { params: z.object({}), result: z.array(ModelProvider) },
  // Adds a provider (id null) or replaces one, from the next start of each agent on it.
  'modelProviders.save': { params: ModelProviderInput, result: ModelProvider },
  'modelProviders.remove': { params: z.object({ id: ModelProviderId }), result: Ok },
  // One small request per endpoint and model, as an agent would send it.
  'modelProviders.probe': { params: z.object({ id: ModelProviderId }), result: ModelProviderProbe },
  // The models the endpoints list, before or after the provider is saved.
  'modelProviders.fetchModels': { params: ModelProviderModelsQuery, result: ModelProviderModels },
  'accounts.list': { params: z.object({}), result: AgentAccounts },
  // Adds an account and signs it in, in a terminal (terminals.*) the user follows; the account is
  // there, signed out, until the sign-in ends well.
  // With key, for an agent that takes API keys (its descriptor's accountKeys): signed in with it at
  // once, and no terminal. Needs account-keys.
  'accounts.add': { params: z.object({ agent: AgentKind, label: z.string().trim().max(60).nullable(), key: AccountKey.optional() }), result: z.object({ account: AgentAccount, terminal: Terminal.optional() }) },
  // Replaces the API key, or the edition, of an account that signs in with one. Needs account-keys.
  'accounts.setKey': { params: AccountRef.extend({ key: AccountKey }), result: AgentAccount },
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
    params: TaskFields.extend({ title: TaskTitle, launch: TaskLaunchOptions.optional(), images: z.array(ImageRef).max(MAX_TASK_IMAGES).optional() }),
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
      // With deferStart, save model and workspace preparation for the first continue. Needs deferred-workspace.
      deferWorkspace: z.boolean().optional(),
      helperOf: z.string().uuid().optional(),
      model: z.string().trim().min(1).max(200).optional(),
      effort: z.string().trim().min(1).max(200).optional(),
      // The model provider it runs on (Conversation.modelProvider), which must serve the agent; a
      // helper runs on its parent's. Needs model-providers.
      modelProvider: ModelProviderId.optional(),
      // The account it runs on, kept for it (conversations.setAccount). Needs conversation-accounts.
      account: AgentAccountId.optional()
    }),
    result: Conversation
  },
  // What the agent offers a new chat: the models its latest chat stage listed, or, when it never
  // ran one, what it lists when asked; on a model provider, that provider's. null when it cannot
  // be asked.
  // With chat-catalog-refresh, an explicit refresh probes the CLI instead of reusing its last list.
  'conversations.chatCatalog': { params: z.object({ agent: AgentKind, modelProvider: ModelProviderId.optional(), refresh: z.boolean().optional() }), result: ChatCatalog.nullable() },
  // The same delegation choices before a conversation exists. Needs draft-mention-targets.
  'conversations.mentionTargets': {
    params: z.object({ profileId: z.string().uuid().optional(), permissionMode: ChatPermissionMode.optional(), allowBypass: z.boolean().optional() }),
    result: z.object({ agents: z.array(DelegationTarget), squads: z.array(SquadCallTarget) })
  },
  // Why the agent's last chatCatalog came back null, when it said: reason is a Rejection's, message
  // its own words. null when it listed models or failed without saying. Needs chat-catalog-problem.
  'conversations.chatCatalogProblem': { params: z.object({ agent: AgentKind }), result: z.object({ reason: z.string(), message: z.string() }).nullable() },
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
  'conversations.continue': { params: ConversationRef.extend({ allowBypass: AllowBypass, skipProjectSetup: z.boolean().optional() }), result: Conversation },
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
  // Moves a waiting message one place without releasing held messages.
  'conversations.moveQueued': { params: ConversationRef.extend({ ref: z.string().min(1), direction: z.enum(['up', 'down']) }), result: Ok },
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
  // The account its agent runs on from its next start, kept for the conversation; null follows the
  // agent's active account. An idle agent is stopped so the next message resumes it there.
  // Needs conversation-accounts.
  'conversations.setModelProvider': { params: ConversationRef.extend({ modelProvider: ModelProviderId.nullable() }), result: Conversation },
  'conversations.setAccount': { params: ConversationRef.extend({ account: AgentAccountId.nullable() }), result: Conversation },
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
  // limit: the latest that many items of the stage rather than all of it, before then naming the
  // rest; a stage has no cap of its own, which a phone cannot take in one go. Needs mobile.
  'conversations.watchChat': { params: ConversationRef.extend({ limit: ChatPageLimit.optional() }), result: ChatPage },
  'conversations.unwatchChat': { params: ConversationRef, result: Ok },
  'conversations.chatItems': { params: ConversationRef.extend({ before: z.string().uuid(), limit: ChatPageLimit.optional() }), result: ChatPage },
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
  // includeTasks: hits in tasks' chats too, for a client that lists them (feature task-conversation-rows).
  'conversations.search': { params: z.object({ query: z.string().trim().min(1).max(200), includeTasks: z.boolean().optional() }), result: z.array(ConversationSearchHit) },
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
  'browser.upload': { params: BrowserTabRef.extend(BrowserUploadOptions.shape), result: BrowserAction },
  'browser.downloads': { params: z.object({ conversationId: z.string().uuid().optional(), tabId: BrowserTabId.optional() }), result: z.array(BrowserDownload) },
  'browser.downloadAction': { params: z.object({ id: z.string().uuid(), action: BrowserDownloadAction }), result: Ok },
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
  // The upload as a text file for the conversation's agent to read, by its path on core's machine.
  'attachments.commitText': {
    params: z.object({ uploadId: z.string().min(1).max(64), conversationId: z.string().uuid() }),
    result: z.object({ path: z.string() })
  },
  'attachments.stat': { params: z.object({ id: AttachmentId }), result: AttachmentInfo },
  'attachments.read': {
    params: z.object({
      id: AttachmentId,
      offset: z.number().int().nonnegative(),
      length: z.number().int().min(1).max(ATTACHMENT_CHUNK_BYTES)
    }),
    result: z.object({ data: z.string() })
  },
  // How much the store holds, and how much of it nothing refers to and nobody touched for a week.
  // Reads every conversation's logs, so it takes a while. Needs attachment-sweep.
  'attachments.usage': { params: z.object({}), result: z.object({ files: z.number().int(), bytes: z.number(), unusedFiles: z.number().int(), unusedBytes: z.number() }) },
  // Removes those, and pasted text kept for conversations that are gone.
  'attachments.sweep': { params: z.object({}), result: z.object({ files: z.number().int(), bytes: z.number() }) },
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
  // close: agent tools stop and remove their tab together; omitted by older clients that keep logs.
  'terminals.stop': { params: z.object({ conversationId: z.string().uuid(), id: z.string().uuid(), close: z.boolean().optional() }), result: Ok.extend({ closed: z.boolean().optional() }) },
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
  // The pages the browser went to, latest or most visited first. Deleting names a page by its address and who opened it.
  'browserHistory.search': { params: BrowserHistorySearch, result: z.array(BrowserHistoryEntry) },
  'browserHistory.delete': { params: BrowserHistoryEntry.pick({ url: true, conversationId: true }), result: Ok },
  'browserHistory.clear': { params: z.object({}), result: Ok },
  // Sites allowed in every conversation (ALLOW_SITE_ALWAYS), and taking one back. Needs browser-sites.
  'browser.sites': { params: z.object({}), result: z.array(BrowserSite) },
  // The phone link (docs/MOBILE.md): the gateway, pairing and paired devices. Needs mobile.
  // Agents on chat platforms. Needs channels. A channel is saved whole; its credentials go in
  // and never come back (Channel.stored says which are kept).
  'channels.list': { params: z.object({ profileId: z.string().uuid().optional() }), result: z.array(Channel) },
  'channels.save': { params: ChannelInput, result: Channel },
  // With every question asked of it and the conversations they were answered in.
  'channels.remove': { params: z.object({ id: z.string().uuid() }), result: z.array(Channel) },
  // Newest first; `before` (a createdAt) pages back, null when none is left.
  'channels.requests': { params: z.object({ channelId: z.string().uuid(), before: z.number().optional(), limit: z.number().int().min(1).max(200).default(50) }), result: z.object({ items: z.array(ChannelRequest), before: z.number().nullable() }) },
  'channels.toolCalls': { params: z.object({ requestId: z.string().uuid() }), result: z.array(ChannelToolCall) },
  // Needs channel-readiness.
  'channels.readiness': { params: z.object({}), result: ChannelReadiness },
  // What was posted back in the thread a task came from, oldest first. Needs channel-task-reports.
  'channels.taskReports': { params: z.object({ taskId: z.string().min(1) }), result: z.array(ChannelTaskReport) },
  // Why it was sent back on a card, oldest first; and going on with the latest reason not yet
  // handed to its agent, as the owner's click would. Need channel-task-cards.
  'channels.taskFeedback': { params: z.object({ taskId: z.string().min(1) }), result: z.array(ChannelTaskFeedback) },
  'channels.continueTask': { params: z.object({ taskId: z.string().min(1) }), result: z.array(ChannelTaskFeedback) },
  // A tool of a locked-down agent, run by core over the projects its channel has. The only method
  // a channel-tools connection may call, and only for its own conversation.
  'channelTools.call': { params: z.object({ conversationId: z.string().uuid(), tool: z.string().min(1).max(100), arguments: z.unknown().optional() }), result: z.object({ text: z.string(), isError: z.boolean() }) },
  // The tools that conversation has now, as its MCP server lists them; a channel-tools connection's other method.
  'channelTools.list': { params: z.object({ conversationId: z.string().uuid() }), result: z.array(ChannelToolSpec) },
  'wechatRemote.status': { params: z.object({}), result: WechatRemoteStatus },
  'wechatRemote.beginPairing': { params: z.object({}), result: WechatRemoteStatus },
  'wechatRemote.cancelPairing': { params: z.object({ id: z.string().uuid() }), result: WechatRemoteStatus },
  'wechatRemote.submitPin': { params: z.object({ id: z.string().uuid(), pin: z.string().regex(/^\d{4,8}$/) }), result: WechatRemoteStatus },
  'wechatRemote.confirmPairing': { params: z.object({ id: z.string().uuid(), conversationId: z.string().uuid() }), result: WechatRemoteStatus },
  'wechatRemote.bindConversation': { params: z.object({ conversationId: z.string().uuid(), retainAllowed: z.boolean().optional() }), result: WechatRemoteStatus },
  'wechatRemote.setConversationAccess': { params: z.object({ conversationId: z.string().uuid(), allowed: z.boolean() }), result: WechatRemoteStatus },
  'wechatRemote.setNotification': { params: z.object({ kind: WechatRemoteNotification, enabled: z.boolean() }), result: WechatRemoteStatus },
  'wechatRemote.setEnabled': { params: z.object({ enabled: z.boolean() }), result: WechatRemoteStatus },
  'wechatRemote.remove': { params: z.object({}), result: WechatRemoteStatus },
  'mobile.status': { params: z.object({}), result: MobileStatus },
  'mobile.setEnabled': { params: z.object({ enabled: z.boolean() }), result: MobileStatus },
  'mobile.setPort': { params: z.object({ port: MobilePort }), result: MobileStatus },
  'mobile.setPushUrl': { params: z.object({ url: MobilePushUrl.nullable() }), result: MobileStatus },
  // Replaces the user's own addresses; phones learn them on their next connection.
  'mobile.setExtraHosts': { params: z.object({ hosts: z.array(MobileExtraHost).max(MOBILE_EXTRA_HOSTS_MAX) }), result: MobileStatus },
  // The relay through the user's own server: keys are made the first time and kept when the
  // server changes; removing it forgets them.
  'mobile.setRelay': { params: MobileRelayServer, result: MobileStatus },
  'mobile.removeRelay': { params: z.object({}), result: MobileStatus },
  'mobile.relaySetup': { params: z.object({}), result: MobileRelaySetup },
  // The bridge on the user's own server: its address, and the script that installs it there.
  'mobile.setBridge': { params: z.object({ address: MobileBridgeAddress }), result: MobileStatus },
  'mobile.removeBridge': { params: z.object({}), result: MobileStatus },
  'mobile.bridgeInstallScript': { params: z.object({}), result: z.object({ script: z.string() }) },
  // A new one-time code, replacing any open pairing. The gateway must be running.
  'mobile.beginPairing': { params: z.object({}), result: MobilePairing },
  'mobile.cancelPairing': { params: z.object({}), result: MobileStatus },
  // The user's answer once a phone completed the handshake: an access, or null to refuse it.
  'mobile.confirmPairing': { params: z.object({ pairingId: z.string().min(1).max(100), access: MobileAccess.nullable() }), result: MobileStatus },
  'mobile.setAccess': { params: z.object({ deviceId: z.string().min(1).max(100), access: MobileAccess }), result: MobileStatus },
  // Ends the device's connections at once; what it already sent stays done.
  'mobile.revoke': { params: z.object({ deviceId: z.string().min(1).max(100) }), result: MobileStatus },
  'browser.forgetSite': { params: BrowserSite.pick({ host: true }), result: Ok },
  // The user's own chat commands, oldest first. Saving without an id adds one.
  'chatCommands.list': { params: z.object({}), result: z.array(SavedChatCommand) },
  'chatCommands.save': { params: ChatCommandFields.extend({ id: z.string().uuid().optional() }), result: SavedChatCommand },
  'chatCommands.delete': { params: z.object({ id: z.string().uuid() }), result: Ok },
  'chatCommands.pin': { params: z.object({ id: z.string().uuid(), pinned: z.boolean() }), result: SavedChatCommand },
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
  // Cached checkout identities for immediate display, plus paths to refresh in the background.
  'projects.suggestions': { params: z.object({}), result: z.object({ paths: z.array(z.string()), choices: z.array(ProjectChoice) }) },
  // Checkout identity for project pickers; additive, needs project-choices.
  'projects.describe': { params: z.object({ paths: z.array(z.string().min(1)).max(100) }), result: z.array(ProjectChoice) },
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
  // The format a new group chat suits, judged from what was written by a member agent's small model
  // in one quick request. The page shows its own guess meanwhile. Needs discussion-format-suggest.
  'discussions.suggestFormat': { params: DiscussionFormatAsk, result: z.object({ format: DiscussionFormat, model: z.string().nullable() }) },
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
  'sources.saveAutoInvestigation': { params: InstanceRef.extend({ config: AutoInvestigationConfig }), result: SourceDescriptor },
  'sources.fix': { params: ConversationRef, result: SourceFixInfo.nullable() },
  // An automatic investigation opening its issue's task, by its source_task_create tool: checked,
  // created and queued to start at once, or refused with why. Needs source-hub-tasks.
  'sources.createTask': { params: ConversationRef.extend({ task: SourceTaskProposal }), result: Task },
  'sources.autoInvestigations': { params: InstanceRef.extend({ cursor: z.string().optional(), limit: z.number().int().min(1).max(100).default(30) }), result: AutoInvestigationPage },
  'sources.retryAutoInvestigation': { params: ConversationRef, result: AutoInvestigationRun },
  'sources.cancelAutoInvestigation': { params: ConversationRef, result: AutoInvestigationRun },
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
  'sources.updateSummaries': { params: z.object({}), result: z.array(SourceUpdateSummary) },
  'sources.updates': { params: z.object({ target: SourceUpdateTarget, before: z.number().int().positive().optional() }), result: SourceUpdates },
  'sources.refreshUpdates': { params: z.object({ target: SourceUpdateTarget }), result: SourceUpdateSummary },
  'sources.setWatching': { params: z.object({ target: SourceUpdateTarget, watching: z.boolean() }), result: SourceUpdateSummary },
  'sources.markUpdatesSeen': { params: z.object({ target: SourceUpdateTarget, through: z.number().int().nonnegative() }), result: SourceUpdateSummary },
  'sources.sendUpdates': { params: z.object({ target: SourceUpdateTarget, requestId: z.string().uuid(), through: z.number().int().nonnegative() }), result: SourceDeliveryInfo },
  'sources.inbox': { params: z.object({}), result: z.array(SourceInbox) },
  'sources.refresh': { params: InstanceRef, result: SourceInbox },
  // Read-only inbox details; images can follow the text. Needs source-issue-preview.
  'sources.issue': { params: IssueRef.extend({ images: z.boolean().optional() }), result: SourceIssuePreview },
  'sources.issueComments': { params: IssueRef.extend({ options: SourceCommentOptions }), result: SourceCommentPage },
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
      images: z.array(AttachmentId).max(MAX_CHAT_IMAGES).optional(),
      references: z.array(ChatReference).max(1000).optional(),
      allowBypass: AllowBypass,
      permissionMode: ChatPermissionMode.optional(),
      model: z.string().trim().min(1).max(200).optional(),
      effort: z.string().trim().min(1).max(200).optional(),
      modelProvider: ModelProviderId.optional()
    }),
    result: Conversation
  },
  // Fetches the issue of a conversation whose fetch failed or was cut off, and starts its agent on it.
  'sources.retryInvestigation': { params: z.object({ id: z.string().uuid() }), result: Conversation },
  'sources.dismiss': { params: IssueRef, result: SourceInbox },
  'sources.restore': { params: IssueRef, result: SourceInbox },
  // Fetches the task's issue again and replaces its snapshot.
  'sources.resync': { params: z.object({ taskId: z.string().min(1) }), result: Task },
  // Writing back to the issue a task or conversation came from (docs/SOURCE-WRITEBACK.md).
  'sources.writeback': { params: z.object({ target: SourceUpdateTarget }), result: SourceWriteback },
  'sources.writebackTransitions': { params: z.object({ target: SourceUpdateTarget }), result: SourceTransitions },
  'sources.writebackTransition': { params: z.object({ target: SourceUpdateTarget, id: z.string().min(1).max(500) }), result: SourceWrite },
  'sources.writebackComment': { params: z.object({ target: SourceUpdateTarget, markdown: z.string().min(1).max(MAX_WRITEBACK_COMMENT) }), result: SourceWrite },
  'sources.writebackRetry': { params: z.object({ id: z.string().uuid() }), result: SourceWrite },
  // lanes and options left out stay as they are, so a client from before them loses nothing.
  'sources.saveWriteback': { params: InstanceRef.extend({ config: SourceWritebackConfig, lanes: z.array(WritebackLane).max(50).optional(), options: WritebackOptions.optional() }), result: SourceDescriptor },
  // What the rules would write for a task at a stage it has not reached; writes nothing. Needs source-writeback-lanes.
  'sources.writebackPlan': { params: z.object({ target: SourceUpdateTarget, trigger: SourceWritePlan.shape.trigger }), result: SourceWritePlan },
  // The agent's summary for the issue, saved by its source_report tool; never posted by it.
  'sources.saveReport': {
    params: z.object({
      conversationId: z.string().min(1), text: z.string().min(1).max(MAX_SOURCE_REPORT),
      outcome: SourceOutcome.optional(),
      verification: z.string().max(SOURCE_REPORT_LIMIT).optional(), question: z.string().max(SOURCE_REPORT_LIMIT).optional(), blocker: z.string().max(SOURCE_REPORT_LIMIT).optional()
    }),
    result: SourceWriteback
  },
  // Pull requests for a task's branches (feature pull-requests): one per repo the task writes to.
  // check: whether each can have one opened, and the one it has. draft: a title and description
  // from the small model. create: pushes the branch when the remote lacks its commits, then opens
  // it; `from` is the branch the client saw, refused (git-branch-changed) when the worktree is on
  // another by now. refresh: asks the host again now. unlink: forgets the pull request, and never
  // attaches that one to the task again by its branch.
  'pullRequests.check': { params: PullRequestTaskParams.extend({ repoPath: z.string().min(1).optional() }), result: z.array(PullRequestEligibility) },
  'pullRequests.baseBranches': { params: PullRequestRepoParams, result: z.array(z.string()) },
  'pullRequests.draft': { params: PullRequestRepoParams.extend({ base: PullRequestBase }), result: PullRequestDraft },
  'pullRequests.create': {
    params: PullRequestRepoParams.extend({ base: PullRequestBase, title: z.string().trim().min(1).max(256), body: z.string().max(65_536), draft: z.boolean(), from: z.string().min(1).max(500) }),
    result: PullRequestLink
  },
  'pullRequests.list': { params: PullRequestTaskParams, result: z.array(PullRequestLink) },
  // Every task's, for a client just connected.
  'pullRequests.listAll': { params: z.object({}), result: z.array(PullRequestLink) },
  'pullRequests.refresh': { params: PullRequestTaskParams.extend({ repoPath: z.string().min(1).optional() }), result: z.array(PullRequestLink) },
  'pullRequests.unlink': { params: PullRequestRepoParams, result: Ok },
  // This client has the task's pull requests on screen, or no longer; core follows those often,
  // and any other still open, now and then.
  'pullRequests.watch': { params: PullRequestTaskParams.extend({ open: z.boolean() }), result: Ok },
  // Sends the failed checks or the review comments named into the task's chat for its agent to
  // work on; a task handed in goes back to running, as any message to it does. Refused while the
  // agent is mid-turn (chat-busy).
  'pullRequests.handoff': { params: PullRequestRepoParams.extend({ kind: PullRequestHandoffKind, ids: z.array(z.string().min(1).max(200)).min(1).max(50) }), result: Task },
  // Merges on the host, only while its head is still the commit the client saw; the remote branch
  // stays, as the worktree holds it.
  'pullRequests.merge': { params: PullRequestRepoParams.extend({ method: PullRequestMergeMethod, expectedHeadSha: z.string().regex(/^[0-9a-f]{40}$/) }), result: PullRequestLink },
  // An agent opening a pull request for its task, called by Antumi's MCP server for the
  // conversation it serves; the user confirms in the chat where the agent asks nothing itself.
  'pullRequests.agentCreate': {
    params: z.object({ conversationId: z.string().uuid(), repoPath: z.string().min(1).optional(), base: PullRequestBase.optional(), title: z.string().trim().min(1).max(256), body: z.string().max(65_536), draft: z.boolean() }),
    result: AgentPullRequestRun
  }
} as const

export const rpcNotifications = {
  'usage.analyticsChanged': z.object({}),
  // Every pull request of the task (pullRequests.list) after one is opened, refreshed or forgotten.
  'pullRequests.changed': z.object({ taskId: z.string(), links: z.array(PullRequestLink) }),
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
  'squadCalls.changed': z.object({ call: SquadCall }),
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
  'conversations.chatItems': z.object({ conversationId: z.string(), items: ChatItemList, replaceStage: z.string().optional() }),
  // Text streamed onto an assistant or reasoning item the client already holds. Item ids are
  // unique within a stage only; an older core leaves the stage out.
  'conversations.chatDelta': z.object({ conversationId: z.string(), stageId: z.string().optional(), itemId: z.string(), append: z.string() }),
  'tasks.changed': z.object({ task: Task }),
  'tasks.deleted': z.object({ id: z.string() }),
  'wechatRemote.changed': z.object({ status: WechatRemoteStatus }),
  'mobile.changed': z.object({ status: MobileStatus }),
  'channels.changed': z.object({ channels: z.array(Channel) }),
  'channels.taskReportsChanged': z.object({ taskId: z.string(), reports: z.array(ChannelTaskReport) }),
  'channels.taskFeedbackChanged': z.object({ taskId: z.string(), feedback: z.array(ChannelTaskFeedback) }),
  'sessions.data': z.object({ sessionId: z.string(), data: z.string(), offset: z.number().int() }),
  'sessions.exit': z.object({ sessionId: z.string(), exitCode: z.number() }),
  'usage.changed': z.object({ usage: AgentUsage }),
  'terminals.changed': z.object({ terminals: z.array(Terminal) }),
  'terminalCommands.changed': z.object({ commands: z.array(TerminalCommand) }),
  'bookmarks.changed': z.object({ bookmarks: z.array(Bookmark) }),
  // Only that it changed: a client asks again for what it shows.
  'browserHistory.changed': z.object({}),
  'chatCommands.changed': z.object({ commands: z.array(SavedChatCommand) }),
  // The hosted browser: its status to every connection; a conversation's tabs to the connections
  // watching them (browser.watch).
  'browser.changed': z.object({ status: BrowserStatus }),
  'browser.showTab': z.object({ tabId: z.string() }),
  'browser.tabsChanged': z.object({ conversationId: z.string().nullable(), tabs: z.array(BrowserTab) }),
  'browser.downloadsChanged': z.object({ downloads: z.array(BrowserDownload) }),
  // Worktrees were cleaned, or their sizes counted: list them again.
  'worktrees.changed': z.object({}),
  'plugins.changed': z.object({ plugins: z.array(PluginInfo) }),
  'pets.changed': PetLibraryState,
  'sources.listChanged': z.object({ sources: z.array(SourceDescriptor) }),
  'sources.autoInvestigationChanged': InstanceRef.extend({ info: AutoInvestigationInfo, run: AutoInvestigationRun.optional() }),
  'sources.updatesChanged': z.object({ summaries: z.array(SourceUpdateSummary) }),
  'sources.writebackChanged': z.object({ writeback: SourceWriteback }),
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
