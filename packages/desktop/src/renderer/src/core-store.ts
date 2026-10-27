import type { AgentProfile } from '@antumi/protocol'
import { mergeCliStatuses } from './agent-cli-state'
import { getLocale, t } from './i18n'
import { accountsSupported, activeAccount, isHelper, usageAccount, type AgentAccounts } from '@antumi/protocol'
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import {
  RpcError,
  USAGE_WINDOW_KINDS,
  connectRpc,
  coreUrl,
  type AgentCliStatus,
  type AgentKind,
  type AgentUsage,
  type ResetCreditOutcome,
  type LoginNotice,
  type LoginPrompt,
  type RpcConnection,
  type Routine,
  type RpcParams,
  type SourceDescriptor,
  type SourceInbox,
  type SourceProblem,
  type Task,
  type Terminal,
  type TerminalCommand,
  type Bookmark,
  type BookmarkFields,
  type BookmarkImport,
  type SavedChatCommand,
  type SkillRepo,
  type McpServer,
  type ModelProvider,
  type Conversation,
  type ConversationConfiguration,
  type ComputerAwakeStatus,
  type ChatSettings,
  type Environment,
  type ScheduledRun,
  type Discussion,
  type Squad,
  type SquadRun,
  type SquadPlanRef
} from '@antumi/protocol'
import { receiveChatDelta, receiveChatItems } from './chat-state'
import { forgetDiscussionPosts, receiveDiscussionPosts } from './discussions'
import { forgetFileTabs } from './file-tabs'
import { usePreferences } from './preferences'
import { closePane, panesAfterSelect, panesBeside, restorePanes, shownPanes, splitPanesOf, type SplitPanes } from './conversation-split'
import { activeInboxes, inboxKey } from './source-inboxes'
import type { BrowserStatus } from '@antumi/protocol'
import { focusBrowserConversation, focusBrowserTab, receiveBrowserTabs } from './browser-state'
import type { InspectorTab } from './components/Inspector'
import type { ChatEdit, InspectorFile } from './inspector-file'
import { resolveCoreEndpoint } from './core-endpoint'
import { reasonText } from './labels'
import { askProjectTrust } from './project-trust'
import { receiveTodos } from './conversation-todos'
import { openUtilityPanel, visibleUtilityPanelOrder, type UtilityPanelKind, type UtilityPanelsOpen } from './utility-panel-order'
import { exclusivePanels } from './side-panels'
import { actionableItems, type ActionableItem } from './attention'
import { overview, type Overview } from './overview'
import { attentionSummaryMode, fetchAttentionSummaries, replaySummaryChanges, type AttentionSummaryMode } from './attention-summaries'

export type OverviewFilter = null | 'mine' | 'todos' | 'running' | 'next' | 'unread'
export type OverviewPane = 'now' | 'stats'
export type RoutinesTab = 'routines' | 'schedules'

export type ConnectionState = 'waiting-for-core' | 'connecting' | 'connected'

// What the right-hand pane shows for the selected task.
// terminal: a task's agent in a terminal · chat: a task started in the chat view, in its chat
export type TaskView = 'detail' | 'chat'
export type Section = 'tasks' | 'conversations' | 'discussions' | 'squads'

// A sign-in this window started. The flow lives in core and ends if the connection drops.
export type LoginState = {
  provider: string
  instance: string
  name: string
  flowId: string
  prompt: { promptId: string; prompt: LoginPrompt } | null
  notices: LoginNotice[]
  // Set once core reports the flow finished.
  result: { account: string | null; problem: SourceProblem | null } | null
}

export type CoreState = {
  connection: ConnectionState
  rpc: RpcConnection | null
  tasks: Record<string, Task>
  conversations: Record<string, Conversation>
  // Conversations whose turn finished while the user was elsewhere, until they look.
  unseen: Readonly<Record<string, true>>
  section: Section
  selectedConversationId: string | null
  // The page a new conversation starts from while chats are the default (see ConversationDraft).
  conversationDraft: boolean
  // Group chats as core keeps them; empty on a core without them.
  agentProfiles: Record<string, AgentProfile>
  agentProfilesTab: 'profiles' | 'squads'
  draftProfileId: string | null
  squads: Record<string, Squad>
  squadRuns: Record<string, SquadRun>
  selectedSquadId: string | null
  squadDraft: boolean
  squadLaunch: boolean
  squadPlan: SquadPlanRef | null
  discussions: Record<string, Discussion>
  selectedDiscussionId: string | null
  // The page a new group chat starts from, and the group it copies, if any: a new object each time,
  // so the page starts over.
  discussionDraft: boolean
  discussionDraftFrom: { discussion: Discussion } | null
  // The projects the new-conversation page was last asked to start with; a new object each time, so
  // asking again applies again.
  conversationDraftProjects: { paths: readonly string[] } | null
  // The inbox issue the new conversation is to look into; null for an ordinary one.
  conversationDraftIssue: DraftIssue | null
  // A fresh settings snapshot; its key also keeps this composer's input separate from other drafts.
  conversationDraftFrom: { key: string; title: string; configuration: ConversationConfiguration } | null
  taskMemberConversationId: string | null
  selectedId: string | null
  view: TaskView
  // The inspector beside a task's terminal or chat, kept open from one task to the next, on the
  // tab last shown; a chat task's plan tab shows taskInspectorPlan (an item key; null: the newest).
  inspectorOpen: boolean
  taskInspectorTab: InspectorTab
  taskInspectorPlan: string | null
  // A conversation's, which the user opens, or a plan the agent proposes; on the tab last shown.
  conversationInspectorOpen: boolean
  conversationInspectorTab: InspectorTab
  // The plan its plan tab shows, by item key; null for the newest.
  conversationPlan: string | null
  gitRevision: number
  inspectorFile: InspectorFile | null
  // A turn's edit a chat should bring into view; seq tells a repeat of the same one apart.
  chatReveal: (ChatEdit & { seq: number }) | null
  // The hosted browser as core last reported it; null until core says, or on a core without one.
  browser: BrowserStatus | null
  awake: ComputerAwakeStatus | null
  // How chats run, as core keeps them; null until core says, or on a core without them.
  chatSettings: ChatSettings | null
  // What core found of git and the agent CLIs; null until it says, or on a core that does not look.
  agentCli: Partial<Record<AgentKind, AgentCliStatus>>
  environment: Environment | null
  newTaskOpen: boolean
  // What the new task dialog starts from when it opens on a task already begun, as the board's quick add hands over.
  newTaskDraft: NewTaskDraft | null
  taskLaunchId: string | null
  // Tasks whose start this window is waiting on: their chat shows that it is coming.
  startingTasks: readonly string[]
  settingsOpen: boolean
  // Which settings section to show when settings open; null keeps the first.
  settingsSection: string | null
  // The source inbox takes the right-hand pane instead of a task.
  inboxOpen: boolean
  // The inbox tab last shown, as an inboxKey; the tabs appear once two sources are signed in.
  inboxTab: string | null
  // So does the page of worktrees, over whatever else was shown there.
  worktreesOpen: boolean
  // And the page of what runs later: its routines, or its reservations (预约).
  routinesOpen: boolean
  routinesTab: RoutinesTab
  // The routines as core keeps them, each with how many of its runs the user has yet to look at;
  // empty on a core without them.
  routines: Routine[]
  overviewOpen: boolean
  // The getting-started guide stands in the overview's place until anything else is opened.
  guideOpen: boolean
  // What the overview shows: the work now, or the stats of the days before.
  overviewView: OverviewPane
  overviewFilter: OverviewFilter
  overviewScroll: number
  attentionSummaryMode: AttentionSummaryMode | null
  attentionSummaryLoading: boolean
  attentionSummaryError: string | null
  // What is scheduled to start later, open ones first in the order they go; empty from a core without.
  schedules: ScheduledRun[]
  error: string | null
  // null until core answers usage.list; an older core without it leaves it null. Each agent's
  // active account's reading; accountUsage holds every account's.
  usage: Partial<Record<AgentKind, AgentUsage>> | null
  accountUsage: AgentUsage[]
  // The agents' accounts (Settings → 账号), on a core that keeps them.
  accounts: AgentAccounts | null
  // The agent whose usage card to open, asked from outside the status bar (a quota notification);
  // the status bar clears it once open.
  usageCardAgent: AgentKind | null
  // null until core answers sources.list.
  sources: SourceDescriptor[] | null
  inboxes: Record<string, SourceInbox>
  // Shells in the app's terminal panel, oldest first. The panel only hides them; they keep running.
  terminals: Terminal[]
  terminalPanelOpen: boolean
  terminalMaximized: boolean
  portsPanelOpen: boolean
  portsMaximized: boolean
  // The browser panel in the shared utility dock: every tab there is, the user's own included.
  browserPanelOpen: boolean
  browserMaximized: boolean
  // Top to bottom among the utility panels that are open; reopening one moves it to the end.
  utilityPanelOrder: UtilityPanelKind[]
  activeTerminalId: string | null
  // Commands kept for the terminal panel, oldest first; empty from a core that keeps none.
  terminalCommands: TerminalCommand[]
  // Pages kept for the built-in browser, oldest first; empty from a core that keeps none.
  bookmarks: Bookmark[]
  // The user's own chat commands, oldest first; empty from a core that keeps none.
  chatCommands: SavedChatCommand[]
  // The skills repositories core installed; empty from a core without a library.
  skillRepos: SkillRepo[]
  // The user's MCP servers (Settings → MCP), on a core that keeps them.
  mcpServers: McpServer[]
  // The user's model providers (Settings → 服务商), on a core that keeps them.
  modelProviders: ModelProvider[]
  login: LoginState | null
}

export const useCore = create<CoreState>()(() => ({
  connection: 'connecting',
  rpc: null,
  tasks: {},
  conversations: {},
  unseen: {},
  section: 'tasks',
  selectedConversationId: null,
  conversationDraft: false,
  conversationDraftProjects: null,
  conversationDraftIssue: null,
  conversationDraftFrom: null,
  agentProfiles: {},
  agentProfilesTab: 'profiles',
  draftProfileId: null,
  squads: {},
  squadRuns: {},
  selectedSquadId: null,
  squadDraft: false,
  squadLaunch: false,
  squadPlan: null,
  discussions: {},
  selectedDiscussionId: null,
  discussionDraft: false,
  discussionDraftFrom: null,
  taskMemberConversationId: null,
  selectedId: null,
  view: 'detail',
  inspectorOpen: false,
  taskInspectorTab: 'changes',
  taskInspectorPlan: null,
  conversationInspectorOpen: false,
  conversationInspectorTab: 'changes',
  conversationPlan: null,
  gitRevision: 0,
  inspectorFile: null,
  chatReveal: null,
  browser: null,
  awake: null,
  chatSettings: null,
  agentCli: {},
  environment: null,
  newTaskOpen: false,
  newTaskDraft: null,
  taskLaunchId: null,
  startingTasks: [],
  settingsOpen: false,
  settingsSection: null,
  inboxOpen: false,
  inboxTab: null,
  worktreesOpen: false,
  routinesOpen: false,
  routinesTab: 'routines',
  overviewOpen: true,
  guideOpen: false,
  overviewView: 'now',
  overviewFilter: null,
  overviewScroll: 0,
  attentionSummaryMode: null,
  attentionSummaryLoading: true,
  attentionSummaryError: null,
  schedules: [],
  routines: [],
  error: null,
  usage: null,
  accountUsage: [],
  accounts: null,
  usageCardAgent: null,
  sources: null,
  inboxes: {},
  terminals: [],
  terminalPanelOpen: false,
  terminalMaximized: false,
  portsPanelOpen: false,
  portsMaximized: false,
  browserPanelOpen: false,
  browserMaximized: false,
  utilityPanelOrder: [],
  activeTerminalId: null,
  terminalCommands: [],
  bookmarks: [],
  chatCommands: [],
  skillRepos: [],
  mcpServers: [],
  modelProviders: [],
  login: null
}))

// One side of the room beside the content at a time: the terminal panel or an inspector.
useCore.subscribe((next, previous) => {
  const patch = exclusivePanels(next, previous)
  if (patch) useCore.setState(patch)
})

// A started task opens on its chat until it is closed: that is where the work happens. One under
// review opens with the inspector showing what the agent changed.
export function selectTask(id: string | null): void {
  useCore.setState((s) => {
    const task = id ? s.tasks[id] : undefined
    const review = task?.status === 'review'
    const chat = task?.conversationId && task.status !== 'done' && task.status !== 'abandoned'
    return {
      selectedId: id,
      taskMemberConversationId: null,
      inspectorFile: s.section === 'tasks' && s.selectedId === id ? s.inspectorFile : null,
      section: 'tasks',
      inboxOpen: false,
      worktreesOpen: false,
      routinesOpen: false,
      overviewOpen: false,
      settingsOpen: false,
      view: chat ? 'chat' : 'detail',
      inspectorOpen: review || s.inspectorOpen
    }
  })
}

export function setTaskInspectorTab(tab: InspectorTab): void {
  useCore.setState({ taskInspectorTab: tab })
}

export function showTaskChanges(): void {
  useCore.setState({ inspectorOpen: true, taskInspectorTab: 'changes', inspectorFile: null })
}

export function showInspectorFile(kind: InspectorFile['kind'], id: string, project: string, file: string, edit: ChatEdit | null = null): void {
  useCore.setState((s) => ({
    inspectorFile: { kind, id, project, file, revision: (s.inspectorFile?.revision ?? 0) + 1, edit },
    ...(kind === 'task'
      ? { inspectorOpen: true, taskInspectorTab: 'changes' as const }
      : { conversationInspectorOpen: true, conversationInspectorTab: 'changes' as const })
  }))
}

export function revealChatEdit(edit: ChatEdit): void {
  useCore.setState((s) => ({ chatReveal: { ...edit, seq: (s.chatReveal?.seq ?? 0) + 1 } }))
}

export function clearInspectorFile(): void {
  useCore.setState({ inspectorFile: null })
}

// One of a chat task's plans by item key, or null for its newest.
export function showTaskPlan(key: string | null): void {
  useCore.setState({ inspectorOpen: true, taskInspectorTab: 'plan', taskInspectorPlan: key })
}

// Older cores list only free conversations, so a task's view may still need its summary.
export async function loadConversation(id: string): Promise<void> {
  const conversation = await perform((rpc) => rpc.call('conversations.get', { id }))
  if (conversation) useCore.setState((s) => ({ conversations: { ...s.conversations, [conversation.id]: conversation } }))
}

export function setInspectorOpen(open: boolean): void {
  useCore.setState({ inspectorOpen: open })
}

export function setConversationInspectorOpen(open: boolean): void {
  useCore.setState({ conversationInspectorOpen: open })
}

export function setConversationInspectorTab(tab: InspectorTab): void {
  useCore.setState({ conversationInspectorTab: tab })
}

export function showConversationChanges(): void {
  useCore.setState({ conversationInspectorOpen: true, conversationInspectorTab: 'changes', inspectorFile: null })
}

// One of the conversation's plans by item key, or null for its newest.
export function showConversationPlan(key: string | null): void {
  useCore.setState({ conversationInspectorOpen: true, conversationInspectorTab: 'plan', conversationPlan: key })
}

type UtilityPanelState = Pick<CoreState, 'utilityPanelOrder' | 'browserPanelOpen' | 'terminalPanelOpen' | 'portsPanelOpen' | 'browserMaximized' | 'terminalMaximized' | 'portsMaximized'>

// The browser, terminal and ports panels as the dock's order says, which is what decides: those in
// it are open, and a maximized one stays so only while it is, and only if asked to.
function utilityPanels(s: CoreState, order: UtilityPanelKind[], keepMaximized: boolean): UtilityPanelState {
  const open = (panel: UtilityPanelKind) => order.includes(panel)
  return {
    utilityPanelOrder: order,
    browserPanelOpen: open('browser'),
    terminalPanelOpen: open('terminal'),
    portsPanelOpen: open('ports'),
    browserMaximized: keepMaximized && s.browserMaximized && open('browser'),
    terminalMaximized: keepMaximized && s.terminalMaximized && open('terminal'),
    portsMaximized: keepMaximized && s.portsMaximized && open('ports')
  }
}

function openPanels(s: CoreState): UtilityPanelsOpen {
  return { browser: s.browserPanelOpen, terminal: s.terminalPanelOpen, ports: s.portsPanelOpen }
}

// One panel brought up: below what is open, the top one going past two, and no other left
// maximized over it. Nothing changes for one already up.
function shownUtilityPanel(s: CoreState, panel: UtilityPanelKind): Partial<UtilityPanelState> {
  if (openPanels(s)[panel]) return {}
  return utilityPanels(s, openUtilityPanel(s.utilityPanelOrder, openPanels(s), panel), false)
}

function hiddenUtilityPanel(s: CoreState, panel: UtilityPanelKind): UtilityPanelState {
  return utilityPanels(s, visibleUtilityPanelOrder(s.utilityPanelOrder, openPanels(s)).filter((each) => each !== panel), true)
}

// Opens the browser panel on a conversation's tab: the one it has, or the one about to appear.
export function showBrowserPanel(conversationId: string | null): void {
  useCore.setState((s) => shownUtilityPanel(s, 'browser'))
  if (conversationId) focusBrowserConversation(conversationId)
}

// Opens the browser panel on one tab, from the page's card in the chat.
export function showBrowserTab(tabId: string): void {
  useCore.setState((s) => shownUtilityPanel(s, 'browser'))
  focusBrowserTab(tabId)
}

// A new terminal starts in the folder of whatever the user is looking at: a task's worktree, a
// conversation's project. Core falls back to home.
function contextFolder(s: CoreState): string | undefined {
  if (s.section === 'discussions') return (s.selectedDiscussionId ? s.discussions[s.selectedDiscussionId] : undefined)?.projectPaths[0]
  if (s.section === 'conversations') {
    const conversation = s.selectedConversationId ? s.conversations[s.selectedConversationId] : undefined
    return conversation && !conversation.managedWorkspace ? conversation.workspacePath : undefined
  }
  const repo = (s.selectedId ? s.tasks[s.selectedId] : undefined)?.repos[0]
  return repo ? repo.worktreePath ?? repo.path : undefined
}

// Keeps the tab the user was on while it exists, else the newest one.
function activeAmong(id: string | null, terminals: readonly Terminal[]): string | null {
  return terminals.some((terminal) => terminal.id === id) ? id : terminals.at(-1)?.id ?? null
}

export async function openTerminal(cwd = contextFolder(useCore.getState())): Promise<Terminal | null> {
  const colorPrompt = useCore.getState().rpc?.features.includes('terminal-color-prompt') ? { colorPrompt: usePreferences.getState().colorPrompt } : {}
  const terminal = await perform((rpc) => rpc.call('terminals.open', { cwd, ...colorPrompt }))
  if (terminal) {
    useCore.setState((s) => ({
      terminals: s.terminals.some((each) => each.id === terminal.id) ? s.terminals : [...s.terminals, terminal],
      activeTerminalId: terminal.id,
      ...shownUtilityPanel(s, 'terminal')
    }))
  }
  return terminal
}

export async function refreshAgentCli(agent?: AgentKind, refresh = false): Promise<void> {
  const statuses = await perform((rpc) => rpc.call('system.agentCliStatus', { agent, refresh }))
  if (statuses) useCore.setState((s) => ({ agentCli: mergeCliStatuses(s.agentCli, statuses) }))
}

export async function upgradeAgentCli(agent: AgentKind): Promise<void> {
  const result = await perform((rpc) => rpc.call('system.upgradeAgentCli', { agent }))
  if (!result) return
  useCore.setState((s) => ({ agentCli: mergeCliStatuses(s.agentCli, [result.status]) }))
  if (result.terminal) {
    const terminal = result.terminal
    useCore.setState((s) => ({ terminals: s.terminals.some((each) => each.id === terminal.id) ? s.terminals : [...s.terminals, terminal] }))
    showTerminal(terminal.id)
  }
}

export async function cancelAgentCliUpgrade(agent: AgentKind): Promise<void> {
  const status = await perform((rpc) => rpc.call('system.cancelAgentCliUpgrade', { agent }))
  if (status) useCore.setState((s) => ({ agentCli: mergeCliStatuses(s.agentCli, [status]) }))
}

export async function installAgentCli(agent: AgentKind): Promise<Terminal | null> {
  const terminal = await perform((rpc) => rpc.call('system.installAgentCli', { agent }))
  if (terminal) {
    useCore.setState((s) => ({
      terminals: s.terminals.some((each) => each.id === terminal.id) ? s.terminals : [...s.terminals, terminal],
      activeTerminalId: terminal.id,
      ...shownUtilityPanel(s, 'terminal')
    }))
  }
  return terminal
}

// Before an update on Windows, which needs every agent process gone: the idle ones go now, as they
// would after their idle wait. A core without it leaves them, and the install names them.
export async function releaseIdleChats(): Promise<void> {
  if (!useCore.getState().rpc?.features.includes('release-idle-chats')) return
  await perform((rpc) => rpc.call('conversations.releaseIdle', {}))
}

// The list updates when core says so, through terminals.changed.
export function closeTerminal(id: string): void {
  void perform((rpc) => rpc.call('terminals.close', { id }))
}

export function selectTerminal(id: string): void {
  useCore.setState({ activeTerminalId: id })
}

// Brings up the panel on one terminal, as an agent's tool card does for the command it started.
export function showTerminal(id: string): void {
  useCore.setState((s) => ({ activeTerminalId: id, ...shownUtilityPanel(s, 'terminal') }))
}

// Opening the panel with nothing in it starts a shell right away.
export async function toggleTerminalPanel(): Promise<void> {
  const { terminalPanelOpen, terminals } = useCore.getState()
  const open = !terminalPanelOpen
  useCore.setState((s) => (open ? shownUtilityPanel(s, 'terminal') : hiddenUtilityPanel(s, 'terminal')))
  if (open && terminals.length === 0) await openTerminal()
}

export function togglePortsPanel(): void {
  useCore.setState((s) => (s.portsPanelOpen ? hiddenUtilityPanel(s, 'ports') : shownUtilityPanel(s, 'ports')))
}

export function setPortsMaximized(maximized: boolean): void {
  useCore.setState({ portsMaximized: maximized, ...(maximized ? { terminalMaximized: false, browserMaximized: false } : {}) })
}

// The list updates when core says so, through terminalCommands.changed.
export function saveTerminalCommand(params: RpcParams<'terminalCommands.save'>): Promise<TerminalCommand | null> {
  return perform((rpc) => rpc.call('terminalCommands.save', params))
}

export function deleteTerminalCommand(id: string): void {
  void perform((rpc) => rpc.call('terminalCommands.delete', { id }))
}

// The list updates when core says so, through bookmarks.changed.
export function addBookmark(fields: BookmarkFields): void {
  void perform((rpc) => rpc.call('bookmarks.add', fields))
}

export function deleteBookmark(id: string): void {
  void perform((rpc) => rpc.call('bookmarks.delete', { id }))
}

// In slices, so a browser's thousands of bookmarks stay well under a message's size.
const IMPORT_SLICE = 500
export async function importBookmarks(bookmarks: readonly BookmarkFields[]): Promise<BookmarkImport | null> {
  const total: BookmarkImport = { added: 0, skipped: 0 }
  for (let at = 0; at < bookmarks.length; at += IMPORT_SLICE) {
    const slice = bookmarks.slice(at, at + IMPORT_SLICE)
    const result = await perform((rpc) => rpc.call('bookmarks.import', { bookmarks: slice }))
    if (!result) return null
    total.added += result.added
    total.skipped += result.skipped
  }
  return total
}

// The list updates when core says so, through chatCommands.changed.
export function saveChatCommand(params: RpcParams<'chatCommands.save'>): Promise<SavedChatCommand | null> {
  return perform((rpc) => rpc.call('chatCommands.save', params))
}

export function deleteChatCommand(id: string): void {
  void perform((rpc) => rpc.call('chatCommands.delete', { id }))
}

export function setTerminalMaximized(maximized: boolean): void {
  useCore.setState({ terminalMaximized: maximized, ...(maximized ? { browserMaximized: false, portsMaximized: false } : {}) })
}

export function toggleBrowserPanel(): void {
  useCore.setState((s) => (s.browserPanelOpen ? hiddenUtilityPanel(s, 'browser') : shownUtilityPanel(s, 'browser')))
}

export function setBrowserMaximized(maximized: boolean): void {
  useCore.setState({ browserMaximized: maximized, ...(maximized ? { terminalMaximized: false, portsMaximized: false } : {}) })
}

export function selectConversation(id: string | null): void {
  const s = useCore.getState()
  const current = s.section === 'conversations' ? s.selectedConversationId : null
  setSplitPanes(panesAfterSelect(savedPanes(), current, id))
  useCore.setState((s) => {
    const { [id ?? '']: _seen, ...unseen } = s.unseen
    return { selectedConversationId: id, section: 'conversations', inspectorFile: s.section === 'conversations' && s.selectedConversationId === id ? s.inspectorFile : null, settingsOpen: false, worktreesOpen: false, routinesOpen: false, overviewOpen: false, inboxOpen: false, conversationDraft: false, unseen }
  })
  if (id) markRoutineRunSeen(id)
}

function savedPanes(): SplitPanes | null {
  return splitPanesOf(usePreferences.getState().splitPanes)
}

function setSplitPanes(panes: SplitPanes | null): void {
  const saved = usePreferences.getState().splitPanes
  if (panes ? saved[0] !== panes[0] || saved[1] !== panes[1] : saved.length > 0) usePreferences.setState({ splitPanes: panes ? [...panes] : [] })
}

// The two conversations side by side while one of them is in front; otherwise null.
export function useSplitPanes(): SplitPanes | null {
  const saved = usePreferences((p) => p.splitPanes)
  const current = useCore((s) => (s.section === 'conversations' ? s.selectedConversationId : null))
  const exists = useCore((s) => saved.every((id) => s.conversations[id]))
  const panes = useMemo(() => splitPanesOf(saved), [saved, getLocale()])
  return exists ? shownPanes(panes, current) : null
}

function visiblePanes(s: CoreState): SplitPanes | null {
  return s.section === 'conversations' ? shownPanes(savedPanes(), s.selectedConversationId) : null
}

// Opens a conversation beside the one in front, which stays where it is; the new one comes forward.
export function openBeside(id: string): void {
  const s = useCore.getState()
  const current = s.section === 'conversations' ? s.selectedConversationId : null
  const panes = panesBeside(savedPanes(), current, id)
  if (!panes) return
  setSplitPanes(panes)
  selectConversation(id)
}

// Closing one column leaves the other on its own, remembered for ⌘\ to bring the pair back.
export function closeSplitPane(id: string): void {
  const panes = visiblePanes(useCore.getState())
  if (!panes) return
  usePreferences.setState({ splitPanes: [], splitLast: [...panes] })
  selectConversation(closePane(panes, id))
}

// ⌘\: two side by side become the one in front; one becomes a pair again with its last partner.
export function toggleSplit(): void {
  const s = useCore.getState()
  const panes = visiblePanes(s)
  const current = s.section === 'conversations' ? s.selectedConversationId : null
  if (panes && current) {
    closeSplitPane(panes[0] === current ? panes[1] : panes[0])
    return
  }
  if (!current) return
  const restored = restorePanes(current, usePreferences.getState().splitLast, s.conversations)
  if (restored) setSplitPanes(restored)
}

// ⌘1 / ⌘2: the column to bring to the front, its input taking the keyboard.
export function focusSplitPane(index: 0 | 1): boolean {
  const panes = visiblePanes(useCore.getState())
  if (!panes) return false
  selectConversation(panes[index])
  focusPaneInput(index)
  return true
}

export function focusPaneInput(index: 0 | 1): void {
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-split-pane="${index + 1}"] .chat-dock-composer .chat-input`)?.focus())
}

// Opening a routine's conversation is looking at its run, whose id the conversation shares; core
// keeps that, so every window and the dock count agree. Harmless on any other conversation.
export function markRoutineRunSeen(conversationId: string): void {
  const { conversations, rpc } = useCore.getState()
  if (!conversations[conversationId]?.routineId || !rpc?.features.includes('routines')) return
  void rpc.call('routines.markSeen', { runId: conversationId }).catch(() => {})
}

// A turn that was going and is now over, in a conversation the user is not looking at. A
// routine's conversation is left out: core keeps whether its run was looked at.
function finishedUnseen(s: CoreState, previous: Conversation | undefined, next: Conversation): boolean {
  if (next.delegation?.open || isHelper(next) || next.routineId || next.discussionId || next.squadRunId || next.parentConversationId) return false
  const working = previous?.chat?.turn === 'running' || previous?.chat?.turn === 'awaiting'
  // Both columns of a split are in view: neither one finishing is news.
  const looking = s.section === 'conversations' && (s.selectedConversationId === next.id || Boolean(visiblePanes(s)?.includes(next.id)))
  return working && next.chat?.turn !== 'running' && next.chat?.turn !== 'awaiting' && !looking
}

// An issue as the new-conversation page shows it: which inbox it is in, and what to call it.
export type DraftIssue = { provider: string; instance: string; key: string; title: string; url: string; source: string }

// `projects`: what the page starts with, as from a project's group; without, it starts with none.
// `issue`: the inbox issue the conversation is opened to look into.
export function openConversationDraft(projects?: readonly string[], issue: DraftIssue | null = null, from: CoreState['conversationDraftFrom'] = null): void {
  useCore.setState({ selectedConversationId: null, section: 'conversations', settingsOpen: false, worktreesOpen: false, routinesOpen: false, overviewOpen: false, inboxOpen: false, conversationDraft: true, conversationDraftProjects: projects ? { paths: [...projects] } : null, conversationDraftIssue: issue, conversationDraftFrom: from, draftProfileId: null })
}

export function useSourceInvestigateSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('source-investigate') ?? false)
}

export function closeConversationDraft(): void {
  openOverview()
}

const PAGES_CLOSED = { settingsOpen: false, worktreesOpen: false, routinesOpen: false, overviewOpen: false, inboxOpen: false } as const

export function selectSquad(id: string | null, draft = false): void {
  useCore.setState({ section: 'squads', agentProfilesTab: 'squads', selectedSquadId: id, squadDraft: draft, ...PAGES_CLOSED })
}

export function useSquadsSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('squads') ?? false)
}

export function selectDiscussion(id: string | null): void {
  useCore.setState({ selectedDiscussionId: id, section: 'discussions', discussionDraft: false, ...PAGES_CLOSED })
}

// from: a group whose members, projects and options the new one starts with.
export function openDiscussionDraft(from?: Discussion): void {
  useCore.setState({ selectedDiscussionId: null, section: 'discussions', discussionDraft: true, discussionDraftFrom: from ? { discussion: from } : null, ...PAGES_CLOSED })
}

export function closeDiscussionDraft(): void {
  openOverview()
}

// Whether core runs group chats (discussions.*).
export function useDiscussionsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('discussions') ?? false)
}

// A core that lets members join and leave a group chat midway, and one that changes its projects.
export function useDiscussionMembersSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('discussion-members') ?? false)
}

export function useDiscussionProjectsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('discussion-projects') ?? false)
}

export function useDiscussionRequirementsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('discussion-requirements') ?? false)
}

// Whether core writes a commit message with the target's agent (git.commitMessage).
export function useCommitMessageSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('commit-message') ?? false)
}

// Whether core translates a reply with the conversation's agent (conversations.translate).
export function useTranslateSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('translate') ?? false)
}

// Whether core puts conversations and group chats away (conversations.setArchived, discussions.setArchived).
export function useConversationArchiveSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('conversation-archive') ?? false)
}

export function useDiscussionArchiveSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('discussion-archive') ?? false)
}

// Whether core cancels and reopens tasks (tasks.cancel, tasks.reopen).
export function useTaskCancelSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('task-cancel') ?? false)
}

// Whether a redo keeps the task, starting it over in place, rather than making a new one.
export function useTaskRedoInPlace(): boolean {
  return useCore((s) => s.rpc?.features.includes('task-redo-in-place') ?? false)
}

// Whether core moves a group chat on to a new topic (discussions.newTopic).
export function useDiscussionTopicsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('discussion-topics') ?? false)
}

// A page of its own, as the overview is: an issue may become a task or be looked into in a
// conversation, so the inbox belongs to neither. The sidebar entry shows a failure in place of the
// count, so opening it then shows that failure.
export function setInboxOpen(open: boolean): void {
  useCore.setState((s) => open
    ? {
        inboxOpen: true,
        inboxTab: activeInboxes(s.sources, s.inboxes).find((entry) => entry.inbox.problem)?.key ?? s.inboxTab,
        section: 'tasks',
        selectedId: null,
        selectedConversationId: null,
        conversationDraft: false,
        settingsOpen: false,
        worktreesOpen: false,
        routinesOpen: false,
        overviewOpen: false
      }
    : OVERVIEW)
}

export function setInboxTab(key: string): void {
  useCore.setState({ inboxTab: key })
}

export function showView(view: TaskView): void {
  useCore.setState({ view })
}

export function setTaskStarting(id: string, starting: boolean): void {
  useCore.setState((s) => ({ startingTasks: starting ? [...s.startingTasks.filter((each) => each !== id), id] : s.startingTasks.filter((each) => each !== id) }))
}

// A task's start opens its chat at once: core fetches, lays out a checkout and starts the agent
// before its first message goes, which takes a while. A start that fails, its error shown, goes back
// to the details while the user is still on the task.
export async function openChatWhileStarting(taskId: string, start: () => Promise<unknown>): Promise<boolean> {
  selectTask(taskId)
  useCore.setState({ view: 'chat' })
  setTaskStarting(taskId, true)
  const started = await start()
  setTaskStarting(taskId, false)
  if (!started && useCore.getState().selectedId === taskId) useCore.setState({ view: 'detail' })
  return Boolean(started)
}

export type NewTaskDraft = { title: string; repos: readonly string[]; agent: AgentKind | null }

export function setNewTaskOpen(open: boolean, draft: NewTaskDraft | null = null): void {
  useCore.setState({ newTaskOpen: open, newTaskDraft: open ? draft : null })
}

export function setSettingsOpen(open: boolean, section: string | null = null): void {
  useCore.setState({ settingsOpen: open, settingsSection: section, ...(open ? { overviewOpen: false } : {}) })
}

export function setWorktreesOpen(open: boolean): void {
  useCore.setState(open ? { worktreesOpen: true, routinesOpen: false, overviewOpen: false, inboxOpen: false, settingsOpen: false } : OVERVIEW)
}

// The reservations are a tab of the routines' page: what runs once, beside what runs again.
export function setSchedulesOpen(open: boolean): void {
  setRoutinesOpen(open, 'schedules')
}

// Without a tab, the page opens on the one it was left on.
export function openUsageCard(agent: AgentKind | null): void {
  useCore.setState({ usageCardAgent: agent })
}

export function setRoutinesOpen(open: boolean, tab?: RoutinesTab): void {
  if (!open) return openOverview()
  useCore.setState({ routinesOpen: true, ...(tab ? { routinesTab: tab } : {}), worktreesOpen: false, overviewOpen: false, inboxOpen: false, settingsOpen: false })
}

export function useSchedulesOpen(): boolean {
  return useCore((s) => s.routinesOpen && s.routinesTab === 'schedules')
}

// The overview has no close of its own: it is what every other page leaves behind when it closes,
// but a task, which goes back to the task board.
const OVERVIEW = {
  overviewOpen: true, guideOpen: false, section: 'tasks', selectedId: null, selectedConversationId: null, conversationDraft: false, discussionDraft: false,
  squadDraft: false, inboxOpen: false, worktreesOpen: false, routinesOpen: false, settingsOpen: false
} as const

export function openOverview(): void {
  useCore.setState(OVERVIEW)
}

export function openGuide(): void {
  useCore.setState({ ...OVERVIEW, guideOpen: true })
}

export function useActionableItems(): ActionableItem[] {
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const mode = useCore((s) => s.attentionSummaryMode)
  const schedules = useCore((s) => s.schedules)
  const squadRuns = useCore((state) => state.squadRuns)
  return useMemo(() => actionableItems({ tasks, conversations, schedules, squadRuns }, mode === 'complete'), [tasks, conversations, schedules, squadRuns, mode, getLocale()])
}

export function setOverviewView(view: OverviewPane): void {
  useCore.setState({ overviewView: view, overviewScroll: 0 })
}

export function setOverviewFilter(filter: OverviewFilter): void {
  useCore.setState({ overviewFilter: filter, overviewScroll: 0 })
}

export function setOverviewScroll(scroll: number): void {
  useCore.setState({ overviewScroll: scroll })
}

export function useOverview(): Overview {
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const unseen = useCore((s) => s.unseen)
  const routines = useCore((s) => s.routines)
  const schedules = useCore((s) => s.schedules)
  const squadRuns = useCore((s) => s.squadRuns)
  const mode = useCore((s) => s.attentionSummaryMode)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return useMemo(() => overview({ tasks, conversations, unseen, routines, schedules, squadRuns, now,
    includeTaskSummaries: mode === 'complete' }), [tasks, conversations, unseen, routines, schedules, squadRuns, now, mode, getLocale()])
}

export function openAttentionItem(item: ActionableItem): void {
  if (item.target.kind === 'conversation') {
    if (useCore.getState().conversations[item.target.id]) selectConversation(item.target.id)
  } else {
    const task = useCore.getState().tasks[item.target.id]
    if (!task || task.status === 'done' || task.status === 'abandoned') return
    selectTask(task.id)
    const member = item.conversationId ? useCore.getState().conversations[item.conversationId] : null
    if (member?.squadRunId) useCore.setState({ taskMemberConversationId: member.id, view: 'chat', inspectorOpen: true, taskInspectorTab: 'squad' })
    if (task.status === 'review' && task.conversationId) showTaskChanges()
  }
}

export async function refreshAttentionSummaries(): Promise<void> {
  const { rpc, attentionSummaryLoading } = useCore.getState()
  if (!rpc || attentionSummaryLoading) return
  useCore.setState({ attentionSummaryLoading: true, attentionSummaryError: null, agentCli: {} })
  try {
    const conversations = await fetchAttentionSummaries(rpc)
    if (useCore.getState().rpc !== rpc) return
    useCore.setState((s) => ({
      conversations: attentionSummaryMode(rpc) === 'complete' ? conversations : {
        ...Object.fromEntries(Object.values(s.conversations).filter((c) => c.taskId).map((c) => [c.id, c])),
        ...conversations
      },
      attentionSummaryMode: attentionSummaryMode(rpc), attentionSummaryLoading: false, attentionSummaryError: null
    }))
  } catch (error) {
    if (useCore.getState().rpc === rpc) useCore.setState({ attentionSummaryLoading: false, attentionSummaryError: error instanceof Error ? error.message : String(error) })
  }
}

// Each agent's reading as what runs next spends it: its active account's.
function byAgent(usage: AgentUsage[], accounts: AgentAccounts | null): Partial<Record<AgentKind, AgentUsage>> {
  return Object.fromEntries(usage.filter((entry) => usageAccount(entry) === activeAccount(accounts, entry.agent)).map((entry) => [entry.agent, entry]))
}

function withUsage(list: AgentUsage[], accounts: AgentAccounts | null): Pick<CoreState, 'usage' | 'accountUsage'> {
  return { accountUsage: list, usage: byAgent(list, accounts) }
}

export async function refreshUsage(): Promise<void> {
  const usage = await perform((rpc) => rpc.call('usage.refresh', { windowKinds: [...USAGE_WINDOW_KINDS] }))
  if (usage) {
    useCore.setState((s) => withUsage(usage, s.accounts))
  }
}

// Signs in to a new account in the terminal panel, which opens on it.
export async function addAccount(agent: AgentKind, label: string | null): Promise<void> {
  const added = await perform((rpc) => rpc.call('accounts.add', { agent, label }))
  if (added) showTerminalOf(added.terminal)
}

export async function signInAccount(agent: AgentKind, id: string): Promise<void> {
  const terminal = await perform((rpc) => rpc.call('accounts.login', { agent, id }))
  if (terminal) showTerminalOf(terminal)
}

export async function renameAccount(agent: AgentKind, id: string, label: string | null): Promise<void> {
  await perform((rpc) => rpc.call('accounts.rename', { agent, id, label }))
}

export async function removeAccount(agent: AgentKind, id: string): Promise<void> {
  await perform((rpc) => rpc.call('accounts.remove', { agent, id }))
}

export async function activateAccount(agent: AgentKind, id: string): Promise<void> {
  const accounts = await perform((rpc) => rpc.call('accounts.activate', { agent, id }))
  if (accounts) useCore.setState((s) => ({ accounts, ...withUsage(s.accountUsage, accounts) }))
}

export async function setAccountAutoSwitch(autoSwitch: boolean): Promise<void> {
  const accounts = await perform((rpc) => rpc.call('accounts.setAutoSwitch', { autoSwitch }))
  if (accounts) useCore.setState((s) => ({ accounts, ...withUsage(s.accountUsage, accounts) }))
}

function showTerminalOf(terminal: Terminal): void {
  useCore.setState((s) => ({
    terminals: s.terminals.some((each) => each.id === terminal.id) ? s.terminals : [...s.terminals, terminal],
    activeTerminalId: terminal.id,
    ...shownUtilityPanel(s, 'terminal')
  }))
}

// Fails with core's own words, for the usage card to show beside the button pressed; the usage it
// reads again afterwards comes in as usage.changed.
export async function spendResetCredit(agent: AgentKind, requestId: string, creditId?: string, account?: string): Promise<ResetCreditOutcome> {
  const { rpc } = useCore.getState()
  if (!rpc) {
    throw new Error(t('coreStore.notConnectedToAntumiCore'))
  }
  return (await rpc.call('usage.useResetCredit', { agent, requestId, creditId, ...(account ? { account } : {}) })).outcome
}

function patchLogin(flowId: string, patch: (login: LoginState) => Partial<LoginState>): void {
  useCore.setState((s) => (s.login && s.login.flowId === flowId ? { login: { ...s.login, ...patch(s.login) } } : {}))
}

// The flow id is chosen here: its first prompt can arrive before the reply to sources.login.
export async function startLogin(provider: string, instance: string, name: string): Promise<void> {
  const flowId = crypto.randomUUID()
  useCore.setState({ login: { provider, instance, name, flowId, prompt: null, notices: [], result: null } })
  const started = await perform((rpc) => rpc.call('sources.login', { provider, instance, flowId }))
  if (!started) {
    useCore.setState((s) => (s.login?.flowId === flowId ? { login: null } : {}))
  }
}

export async function answerLogin(value: string): Promise<void> {
  const { login } = useCore.getState()
  if (!login?.prompt) {
    return
  }
  const { flowId } = login
  const { promptId } = login.prompt
  patchLogin(flowId, () => ({ prompt: null }))
  await perform((rpc) => rpc.call('sources.answer', { flowId, promptId, value }))
}

// Cancels a flow still running; after it finished this only closes the dialog.
export function closeLogin(): void {
  const { login } = useCore.getState()
  useCore.setState({ login: null })
  if (login && !login.result) {
    const { flowId } = login
    void perform((rpc) => rpc.call('sources.cancelLogin', { flowId }))
  }
}

// Whether the core this window talks to can switch a chat stage's permission mode, model and effort.
export function useChatOptionsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('chat-options') ?? false)
}

// Whether a chat message can carry images.
export function useChatImagesSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('chat-images') ?? false)
}

// Whether core can look a file up by name in the projects (projects.findFile).
export function useFindFileSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('find-file') ?? false)
}

// Whether core can search the projects for the composer's @ menu (projects.searchFiles).
// A core that sends a scheduled message's pictures with it.
export function useScheduleImagesSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('schedule-images') ?? false)
}

// A core that carries a plan out in any permission mode the stage offers, not only ask or edits.
export function usePlanModesSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('plan-modes') ?? false)
}

// A core that keeps the mode, model and effort a task starts in (Task.launch).
export function useTaskLaunchSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('task-launch') ?? false)
}

export function useFileMentionsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('file-mentions') ?? false)
}

// The task board stands where a task would: the tasks section with none open and no page over it.
export function useTaskBoardOpen(): boolean {
  return useCore((s) => s.section === 'tasks' && s.selectedId === null && !s.inboxOpen && !s.worktreesOpen
    && !s.routinesOpen && !s.overviewOpen && !s.settingsOpen)
}

// Whether a task's chat can go to another agent (tasks.handoff).
export function useTaskHandoffSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('task-handoff') ?? false)
}

// Whether a new conversation can work in worktrees of its projects rather than in them.
export function useConversationWorktreesSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('conversation-worktrees') ?? false)
}

export function useStartBranchSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('conversation-start-branch') ?? false)
}

// Whether core keeps conversations pinned to the top of the list.
export function useConversationPinSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('conversation-pin') ?? false)
}

export function useWorktreesSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('worktrees') ?? false)
}

// An older core keeps no starts, and would drop a picked one without a word.
// Whether core hosts a browser for chat agents.
// Core can record the raw traffic with chat agents (settings → 调试) and serves it to the inspector.
export function useWireLogSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('wire-log') ?? false)
}

// Whether the inspectors offer 原始数据: core keeps a wire log and the user has it on.
export function useWireLogShown(): boolean {
  const supported = useWireLogSupported()
  return useCore((s) => supported && (s.chatSettings?.wireLog ?? false))
}

export function useBrowserSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('browser') ?? false)
}

export function useKnowledgeBaseSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('knowledge-base') ?? false)
}

export function useProjectConfigEditSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('project-config-edit') ?? false)
}

export function useSkillsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('skills-library') ?? false)
}

export function useAccountsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('agent-accounts') ?? false)
}

export function useModelProvidersSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('model-providers') ?? false)
}

export function useSessionImportSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('session-import') ?? false)
}

export function useMcpServersSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('mcp-servers') ?? false)
}

export function useUsageLimitSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('usage-limit') ?? false)
}

export function useDashboardSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('dashboard') ?? false)
}

export async function setChatSettings(patch: Partial<ChatSettings>): Promise<void> {
  const settings = await perform((rpc) => rpc.call('system.setChatSettings', patch))
  if (settings) useCore.setState({ chatSettings: settings })
}

export function useEnvironmentSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('environment') ?? false)
}

// Looks at the machine again, for the user who has just installed something.
export async function refreshEnvironment(): Promise<void> {
  const environment = await perform((rpc) => rpc.call('system.environment', { refresh: true }))
  if (environment) useCore.setState({ environment })
}

export function useAwakeSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('keep-awake') ?? false)
}

export async function setAwakeMode(mode: ComputerAwakeStatus['mode']): Promise<void> {
  const status = await perform((rpc) => rpc.call('system.setAwakeMode', { mode }))
  if (status) useCore.setState({ awake: status })
}

export function useBookmarksSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('bookmarks') ?? false)
}

export function useTerminalCommandsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('terminal-commands') ?? false)
}

export function useChatCommandsSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('chat-commands') ?? false)
}

// Whether core starts tasks and conversations later on their own (schedules.*).
export function useSchedulesSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('schedules') ?? false)
}

// Whether core runs routines, rules that open a conversation on a schedule (routines.*).
export function useRoutinesSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('routines') ?? false)
}

export function useTaskStartSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('task-start') ?? false)
}

export function showError(message: string): void {
  useCore.setState({ error: message })
}

export function dismissError(): void {
  useCore.setState({ error: null })
}

// Runs an RPC action and turns a rejection into a visible, localized message.
export async function perform<T>(action: (rpc: RpcConnection) => Promise<T>): Promise<T | null> {
  const { rpc } = useCore.getState()
  if (!rpc) {
    useCore.setState({ error: t('coreStore.notConnectedToAntumiCore') })
    return null
  }
  try {
    return await withProjectTrust(rpc, action)
  } catch (error) {
    if (error === DECLINED) return null
    const message =
      error instanceof RpcError && error.reason
        ? reasonText(error.reason, error.message)
        : error instanceof Error
          ? error.message
          : String(error)
    useCore.setState({ error: message })
    return null
  }
}

const DECLINED = Symbol('declined')

// A start or submit refused until the user allows a project's setup and check is asked about and
// tried again; each project is asked at most once. Declining ends it without an error.
async function withProjectTrust<T>(rpc: RpcConnection, action: (rpc: RpcConnection) => Promise<T>): Promise<T> {
  const asked = new Set<string>()
  for (;;) {
    try {
      return await action(rpc)
    } catch (error) {
      if (!(error instanceof RpcError) || error.reason !== 'project-config-untrusted' || asked.has(error.message)) throw error
      asked.add(error.message)
      const info = await rpc.call('projects.config', { path: error.message })
      if (!info) throw error
      if (!info.trusted) {
        if (!(await askProjectTrust(info))) throw DECLINED
        await rpc.call('projects.trustConfig', { path: info.path, hash: info.hash })
      }
    }
  }
}

export function updateTask(id: string, patch: Omit<RpcParams<'tasks.update'>, 'id'>): Promise<Task | null> {
  return perform((rpc) => rpc.call('tasks.update', { id, ...patch }))
}

const RETRY_MS = 1000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// One loop for the app's lifetime; survives core restarts (new port and token). The card of
// waiting requests needs only tasks and chats: it asks for nothing else, and starts nothing (the
// browser host) that the main window already does.
export function startCoreConnection(scope: 'app' | 'requests' = 'app'): void {
  const full = scope === 'app'
  void (async () => {
    for (;;) {
      const endpoint = await resolveCoreEndpoint()
      if (!endpoint) {
        useCore.setState({ connection: 'waiting-for-core', rpc: null })
        await sleep(RETRY_MS)
        continue
      }
      try {
        useCore.setState({ connection: 'connecting' })
        const rpc = await connectRpc(coreUrl(endpoint))
        let initialized = false
        const taskChanges = new Map<string, Task | null>()
        const conversationChanges = new Map<string, Conversation | null>()
        let changedSchedules: ScheduledRun[] | null = null
        let changedRoutines: Routine[] | null = null
        const runChanges = new Map<string, SquadRun | null>()
        const squadChanges = new Map<string, Squad | null>()
        const profileChanges = new Map<string, AgentProfile | null>()
        rpc.on('agentProfiles.changed', ({ profile }) => {
          if (!initialized) profileChanges.set(profile.id, profile)
          useCore.setState((state) => ({ agentProfiles: { ...state.agentProfiles, [profile.id]: profile } }))
        })
        const discussionChanges = new Map<string, Discussion | null>()
        useCore.setState({ attentionSummaryLoading: true, attentionSummaryError: null, agentCli: {} })
        rpc.on('squads.changed', ({ squad }) => {
          if (!initialized) squadChanges.set(squad.id, squad)
          useCore.setState((state) => ({ squads: { ...state.squads, [squad.id]: squad } }))
        })
        rpc.on('squads.runChanged', ({ run }) => {
          if (!initialized) runChanges.set(run.id, run)
          useCore.setState((state) => ({ squadRuns: { ...state.squadRuns, [run.id]: run } }))
        })
        rpc.on('git.changed', () => useCore.setState((s) => ({ gitRevision: s.gitRevision + 1 })))
        rpc.on('tasks.changed', ({ task }) => {
          if (!initialized) taskChanges.set(task.id, task)
          useCore.setState((s) => ({ tasks: { ...s.tasks, [task.id]: task } }))
        })
        rpc.on('tasks.deleted', ({ id }) => {
          if (!initialized) taskChanges.set(id, null)
          useCore.setState((s) => {
            const { [id]: _removed, ...tasks } = s.tasks
            return { tasks, squadRuns: Object.fromEntries(Object.entries(s.squadRuns).filter(([, run]) => run.taskId !== id)), selectedId: s.selectedId === id ? null : s.selectedId }
          })
        })
        rpc.on('conversations.changed', ({ conversation }) => {
          if (!initialized) conversationChanges.set(conversation.id, conversation)
          useCore.setState((s) => ({
            conversations: { ...s.conversations, [conversation.id]: conversation },
            ...(finishedUnseen(s, s.conversations[conversation.id], conversation) ? { unseen: { ...s.unseen, [conversation.id]: true } } : {})
          }))
        })
        rpc.on('conversations.deleted', ({ id }) => {
          forgetFileTabs(id)
          // A column whose conversation went leaves the other on its own, in front where it was.
          const panes = savedPanes()
          const other = panes?.includes(id) ? closePane(panes, id) : null
          if (panes?.includes(id)) usePreferences.setState({ splitPanes: [], splitLast: [] })
          if (!initialized) conversationChanges.set(id, null)
          useCore.setState((s) => {
            const { [id]: _removed, ...conversations } = s.conversations
            return { conversations, selectedConversationId: s.selectedConversationId === id ? other : s.selectedConversationId }
          })
        })
        rpc.on('conversations.chatItems', ({ conversationId, items }) => receiveChatItems(conversationId, items))
        rpc.on('conversations.chatDelta', ({ conversationId, stageId, itemId, append }) => receiveChatDelta(conversationId, stageId, itemId, append))
        rpc.on('browser.changed', ({ status }) => useCore.setState({ browser: status }))
        rpc.on('system.awakeChanged', ({ status }) => useCore.setState({ awake: status }))
        rpc.on('system.chatSettingsChanged', ({ settings }) => useCore.setState({ chatSettings: settings }))
        rpc.on('system.agentCliChanged', ({ status }) => useCore.setState((s) => ({ agentCli: mergeCliStatuses(s.agentCli, [status]) })))
        rpc.on('system.environmentChanged', ({ environment }) => useCore.setState({ environment }))
        rpc.on('browser.tabsChanged', ({ conversationId, tabs }) => receiveBrowserTabs(conversationId, tabs))
        rpc.on('usage.changed', ({ usage }) =>
          useCore.setState((s) => withUsage([...s.accountUsage.filter((entry) => entry.agent !== usage.agent || usageAccount(entry) !== usageAccount(usage)), usage], s.accounts))
        )
        rpc.on('accounts.changed', ({ accounts }) => useCore.setState((s) => ({
          accounts,
          // A reading of an account removed goes with it.
          ...withUsage(s.accountUsage.filter((entry) => !accountsSupported(entry.agent) || accounts.accounts.some((each) => each.agent === entry.agent && each.id === usageAccount(entry))), accounts)
        })))
        rpc.on('sources.listChanged', ({ sources }) => useCore.setState({ sources }))
        // The last shell exiting puts the panel away, as closing the last tab would.
        rpc.on('terminals.changed', ({ terminals }) =>
          useCore.setState((s) => ({
            terminals,
            activeTerminalId: activeAmong(s.activeTerminalId, terminals),
            ...(terminals.length === 0 && s.terminalPanelOpen ? hiddenUtilityPanel(s, 'terminal') : {})
          }))
        )
        rpc.on('terminalCommands.changed', ({ commands }) => useCore.setState({ terminalCommands: commands }))
        rpc.on('bookmarks.changed', ({ bookmarks }) => useCore.setState({ bookmarks }))
        rpc.on('chatCommands.changed', ({ commands }) => useCore.setState({ chatCommands: commands }))
        rpc.on('skills.changed', ({ repos }) => useCore.setState({ skillRepos: repos }))
        rpc.on('mcpServers.changed', ({ servers }) => useCore.setState({ mcpServers: servers }))
        rpc.on('modelProviders.changed', ({ providers }) => useCore.setState({ modelProviders: providers }))
        rpc.on('schedules.changed', ({ runs }) => {
          if (!initialized) changedSchedules = runs
          useCore.setState({ schedules: runs })
        })
        rpc.on('routines.changed', ({ routines }) => {
          if (!initialized) changedRoutines = routines
          useCore.setState({ routines })
        })
        rpc.on('discussions.changed', ({ discussion }) => {
          if (!initialized) discussionChanges.set(discussion.id, discussion)
          useCore.setState((s) => ({ discussions: { ...s.discussions, [discussion.id]: discussion } }))
        })
        rpc.on('discussions.deleted', ({ id }) => {
          if (!initialized) discussionChanges.set(id, null)
          forgetDiscussionPosts(id)
          useCore.setState((s) => {
            const { [id]: _removed, ...discussions } = s.discussions
            return { discussions, selectedDiscussionId: s.selectedDiscussionId === id ? null : s.selectedDiscussionId }
          })
        })
        rpc.on('discussions.posts', ({ discussionId, posts }) => receiveDiscussionPosts(discussionId, posts))
        rpc.on('todos.changed', ({ conversationId, groups }) => receiveTodos(conversationId, groups))
        rpc.on('sources.inboxChanged', ({ inbox }) =>
          useCore.setState((s) => ({ inboxes: { ...s.inboxes, [inboxKey(inbox)]: inbox } }))
        )
        rpc.on('sources.loginPrompt', ({ flowId, promptId, prompt }) => patchLogin(flowId, () => ({ prompt: { promptId, prompt } })))
        rpc.on('sources.loginNotice', ({ flowId, notice }) => patchLogin(flowId, (login) => ({ notices: [...login.notices, notice] })))
        rpc.on('sources.loginFinished', ({ flowId, account, problem }) =>
          patchLogin(flowId, () => ({ prompt: null, result: { account, problem } }))
        )
        const tasks = await rpc.call('tasks.list', {})
        let conversations: Record<string, Conversation> | null = null
        let summaryError: string | null = null
        try {
          conversations = await fetchAttentionSummaries(rpc)
        } catch (error) {
          summaryError = error instanceof Error ? error.message : String(error)
        }
        const usage = full ? await rpc.call('usage.list', { windowKinds: [...USAGE_WINDOW_KINDS] }).catch(() => null) : null
        const sources = full ? await rpc.call('sources.list', {}) : []
        const modelProviders = full && rpc.features.includes('model-providers') ? await rpc.call('modelProviders.list', {}) : []
        const inboxes = full ? await rpc.call('sources.inbox', {}) : []
        const terminals = full ? await rpc.call('terminals.list', {}).catch(() => []) : []
        const terminalCommands = full && rpc.features.includes('terminal-commands') ? await rpc.call('terminalCommands.list', {}).catch(() => []) : []
        // Asked only of a core that has one, and never waited for: it starts the host when it is down.
        if (full && rpc.features.includes('browser')) void rpc.call('browser.status', {}).then((status) => useCore.setState({ browser: status })).catch(() => {})
        if (full && rpc.features.includes('bookmarks')) void rpc.call('bookmarks.list', {}).then((bookmarks) => useCore.setState({ bookmarks })).catch(() => {})
        if (full && rpc.features.includes('keep-awake')) void rpc.call('system.awakeStatus', {}).then((awake) => useCore.setState({ awake })).catch(() => {})
        // What is left to do everywhere, for the overview; todos.changed keeps it current.
        if (full && rpc.features.includes('todo-overview')) void rpc.call('todos.open', {}).then((open) => open.forEach(({ conversationId, groups }) => receiveTodos(conversationId, groups))).catch(() => {})
        if (full && rpc.features.includes('prompt-suggestions')) void rpc.call('system.chatSettings', {}).then((chatSettings) => useCore.setState({ chatSettings })).catch(() => {})
        const schedules = full && rpc.features.includes('schedules') ? await rpc.call('schedules.list', {}).catch(() => []) : []
        const routines = full && rpc.features.includes('routines') ? await rpc.call('routines.list', {}).catch(() => []) : []
        const activeSquadRuns = full && rpc.features.includes('squads') ? await rpc.call('squads.activeRuns', {}) : []
        const agentProfiles = full && rpc.features.includes('agent-profiles') ? await rpc.call('agentProfiles.list', {}) : []
        const squads = full && rpc.features.includes('squads') ? await rpc.call('squads.list', {}) : []
        const discussions = full && rpc.features.includes('discussions') ? await rpc.call('discussions.list', {}).catch(() => []) : []
        if (full && rpc.features.includes('chat-commands')) void rpc.call('chatCommands.list', {}).then((chatCommands) => useCore.setState({ chatCommands })).catch(() => {})
        if (full && rpc.features.includes('skills-library')) void rpc.call('skills.list', {}).then((skillRepos) => useCore.setState({ skillRepos })).catch(() => {})
        if (full && rpc.features.includes('mcp-servers')) void rpc.call('mcpServers.list', {}).then((mcpServers) => useCore.setState({ mcpServers })).catch(() => {})
        const accounts = full && rpc.features.includes('agent-accounts') ? await rpc.call('accounts.list', {}).catch(() => null) : null
        if (full && rpc.features.includes('environment')) void rpc.call('system.environment', {}).then((environment) => useCore.setState({ environment })).catch(() => {})
        useCore.setState((s) => ({
          rpc,
          connection: 'connected',
          tasks: replaySummaryChanges(tasks, taskChanges),
          conversations: replaySummaryChanges(Object.values(conversations ?? s.conversations), conversationChanges),
          schedules: changedSchedules ?? schedules,
          routines: changedRoutines ?? routines,
          agentProfiles: replaySummaryChanges(agentProfiles, profileChanges),
          squads: replaySummaryChanges(squads, squadChanges),
          squadRuns: replaySummaryChanges(activeSquadRuns, runChanges),
          discussions: replaySummaryChanges(discussions, discussionChanges),
          attentionSummaryMode: attentionSummaryMode(rpc),
          attentionSummaryLoading: false,
          attentionSummaryError: summaryError,
          accounts,
          ...(usage ? withUsage(usage, accounts) : { usage: null, accountUsage: [] }),
          sources,
          modelProviders,
          inboxes: Object.fromEntries(inboxes.map((inbox) => [inboxKey(inbox), inbox])),
          terminals,
          activeTerminalId: activeAmong(s.activeTerminalId, terminals),
          terminalCommands,
          ...(s.inboxOpen && !inboxes.some((inbox) => inbox.active) ? OVERVIEW : {})
        }))
        initialized = true
        taskChanges.clear()
        conversationChanges.clear()
        await rpc.closed
      } catch {
        // Fall through to retry; the badge already shows we're not connected.
      }
      // A sign-in belongs to the connection that started it; core has dropped it.
      useCore.setState({ rpc: null, connection: 'connecting', login: null, environment: null })
      await sleep(RETRY_MS)
    }
  })()
}
