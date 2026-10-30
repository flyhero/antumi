import { AgentProfileStore } from './agent-profile-store'
import { AgentProfileService } from './agent-profile-service'
import { AgentCliMaintenance } from './agent-cli-maintenance'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { AGENT_KINDS, agentDescriptor, PROTOCOL_VERSION, quotaVerdict, usageAccount, usageReadable, type AgentKind, type AgentUsage, type ChatItem } from '@antumi/protocol'
import packageJson from '../package.json' with { type: 'json' }
import { removeCoreEndpoint, antumiPaths, writeCoreEndpoint } from '@antumi/protocol/node'
import { adapterOf } from './agents'
import { EnvironmentService } from './environment-check'
import { AgentRunStore } from './agent-run-store'
import { ChatTurnStore } from './chat-turn-store'
import { SmallModelStore } from './small-model-store'
import { AttachmentStore } from './attachment-store'
import { AttachmentUploads } from './attachment-uploads'
import { watchBrowserHostFile } from './browser-host-file'
import { BrowserService, WATCH_ALL } from './browser-service'
import { CredentialStore } from './credential-store'
import { DaemonClient } from './daemon-client'
import { PluginService } from './plugin-service'
import { ProjectStar } from './project-star'
import { PetLibrary } from './pet-library'
import { createRpcHandlers } from './rpc-handlers'
import { SessionImports } from './session-imports'
import { SquadService } from './squad-service'
import { SquadStore } from './squad-store'
import { TodoStore } from './todo-store'
import { DiscussionService } from './discussion-service'
import { startRpcServer, type RpcServer } from './rpc-server'
import { TaskService } from './task-service'
import { ProjectRegistry } from './project-registry'
import { GitFavoriteStore } from './git-favorite-store'
import { TaskStore } from './task-store'
import { UsageLimitResumes } from './usage-limit-resume'
import { ScheduleService } from './schedule-service'
import { RoutineService } from './routine-service'
import { UsageService } from './usage-service'
import { UsageAnalytics } from './usage-analytics'
import type { ScanRoot } from './usage-scan'
import { UsageAutomation } from './usage-automation'
import { cursorHistoryReader } from './cursor-usage-history'
import { warmAccount } from './quota-warmup'
import type { ResetCreditUse, UsageSource } from './usage-source'
import { antumiChatMcpServer, userMcpServer } from './antumi-mcp-server'
import { SourceConfigStore } from './source-config'
import { LoginFlows } from './source-login-flow'
import { migrateLegacyJira } from './source-migration'
import { SourceService } from './source-service'
import { ConversationStore } from './conversation-store'
import { ConversationService } from './conversation-service'
import { TerminalCommandStore } from './terminal-commands'
import { BookmarkStore } from './bookmarks'
import { BrowserHistoryStore } from './browser-history'
import { ChatCommandStore } from './chat-commands'
import { ShellPrompt } from './shell-prompt'
import { TerminalService } from './terminal-service'
import { ProjectConfigStore } from './project-config'
import { WorktreeSetup } from './worktree-setup'
import { WorktreeService } from './worktree-service'
import { AwakeConfigStore } from './awake-config'
import { ComputerAwakeService } from './computer-awake-service'
import { ChatSettingsStore } from './chat-settings'
import { ConversationAutoArchive } from './conversation-auto-archive'
import { ResetAnnouncements } from './reset-announcements'
import { SkillsLibrary } from './skills-library'
import { McpServerStore } from './mcp-servers'
import { ModelProviderStore } from './model-providers'
import { AgentAccountStore } from './agent-accounts'
import { knowledgeBaseSkills } from './skills-recommended'
import { WireLog } from './wire-log'
import { timestampConsole } from './log-timestamps'
import { useSystemProxy } from './system-proxy'

timestampConsole()
await useSystemProxy()
const paths = antumiPaths()
await mkdir(paths.home, { recursive: true, mode: 0o700 })
await mkdir(paths.worktrees, { recursive: true })
await mkdir(paths.attachments, { recursive: true, mode: 0o700 })
await mkdir(paths.sessions, { recursive: true, mode: 0o700 })
await mkdir(paths.browser, { recursive: true, mode: 0o700 })
await mkdir(paths.skills, { recursive: true, mode: 0o700 })

// TaskStore first: its migrations create every table the other stores read.
const store = new TaskStore(paths.database)
const projects = new ProjectRegistry(paths.database)
const gitFavorites = new GitFavoriteStore(paths.database)
const daemon = new DaemonClient(paths.daemonSocket)
const conversationsStore = new ConversationStore(paths.database)
const runs = new AgentRunStore(paths.database)
// Reads its turns from the conversations, which are built below; nothing is read until they run.
const turns = new ChatTurnStore(paths.database, {
  facts: (id, stageId) => conversations.stageFacts(id, stageId),
  stages: () => conversations.chatStageRefs(),
  items: (id, stageId) => conversations.stageChatItems(id, stageId)
})
const smallModels = new SmallModelStore(paths.database)
smallModels.recoverQuick()
const attachments = new AttachmentStore(paths.attachments)
let server: RpcServer | null = null
let awake: ComputerAwakeService | null = null
const refreshAwake = () => awake?.refresh(conversations.workingCount(), schedules.openCount())

const notifyChatItems = (conversationId: string, items: ChatItem[]) =>
  [...(server?.connections ?? [])].filter((c) => c.watching.has(conversationId)).forEach((c) => c.notify('conversations.chatItems', { conversationId, items }))

const wire = new WireLog(paths.sessions, (conversationId, stageId, entries) =>
  [...(server?.connections ?? [])].filter((c) => c.wiring.has(conversationId)).forEach((c) => c.notify('debug.wireEntries', { conversationId, stageId, entries }))
)

// Each conversation's to-dos; they go with it.
const todos = new TodoStore(paths.database, (conversationId, groups) => server?.broadcast('todos.changed', { conversationId, groups }))

// Built before the task service, which runs its chat tasks in it; each hands the other its events.
const conversations = new ConversationService(
  conversationsStore, daemon, paths.sessions,
  (event) => {
    const watchers = (id: string) => [...(server?.connections ?? [])].filter((c) => c.watching.has(id))
    if (event.type === 'changed') {
      server?.broadcast('conversations.changed', { conversation: event.conversation })
      // A task's conversation says whether its agent waits on the user.
      service.chatChanged(event.conversation)
      schedules.conversationChanged(event.conversation)
      routines.conversationChanged(event.conversation)
      discussions.conversationChanged(event.conversation)
      squads.conversationChanged(event.conversation)
      profiles.tick()
      refreshAwake()
    } else if (event.type === 'deleted') {
      server?.broadcast('conversations.deleted', { id: event.id })
      smallModels.interruptConversation(event.id)
      schedules.conversationDeleted(event.id)
      sources.tasksChanged()
      todos.drop(event.id)
      void browser.closeForConversation(event.id)
    }
    else if (event.type === 'prompt') {
      const helper = conversations.get(event.conversationId)
      if (helper.helperOf) smallModels.begin({
        id: `${event.stageId}/turn:${event.ref}`, kind: 'helper', agent: helper.agent,
        model: helper.chatOptions?.model ?? null, conversationId: helper.id,
        baseline: conversations.costBaseline(helper.helperOf),
        unpriced: Boolean(conversations.stages(helper.id).find((stage) => stage.id === event.stageId)?.route)
      })
    } else if (event.type === 'chatItems') {
      limits.observe(event.conversationId, event.items)
      schedules.observe(event.conversationId, event.items)
      turns.observe(event.conversationId, event.items)
      smallModels.observe(event.items)
      for (const id of new Set(event.items.map((item) => item.stageId))) {
        const stage = conversationsStore.stage(id)
        if (stage) analytics.observe(stage, event.items.filter((item) => item.stageId === id))
      }
      routines.observe(event.conversationId, event.items)
      discussions.observe(event.conversationId, event.items)
      squads.observe(event.conversationId, event.items)
      if (event.items.some((item) => item.kind === 'turn')) profiles.tick()
      notifyChatItems(event.conversationId, limits.decorate(smallModels.decorate(event.items)))
    } else if (event.type === 'planApproved') {
      service.recordPlan(event.taskId, event.plan)
    } else if (event.type === 'usage') {
      usage.report(event.agent, event.account, event.report)
    } else {
      const { conversationId, stageId, itemId, append } = event
      watchers(conversationId).forEach((c) => c.notify('conversations.chatDelta', { conversationId, stageId, itemId, append }))
    }
  },
  projects,
  attachments,
  // Read at each agent start, so turning history or to-dos off holds from the next start.
  (id) => antumiChatMcpServer(paths.home, id, { history: chatSettings.current().readHistory, todos: chatSettings.current().userTodos }),
  paths.worktrees,
  wire
)

const browserHistory = new BrowserHistoryStore(paths.database, () => server?.broadcast('browserHistory.changed', {}))
const browser = new BrowserService(
  paths,
  attachments,
  (id, host, url) => conversations.askHost(id, host, url),
  (event) => {
    if (event.type === 'status') server?.broadcast('browser.changed', { status: event.status })
    else if (event.type === 'downloads') {
      for (const connection of server?.connections ?? []) if (connection.browsing.has(WATCH_ALL)) connection.notify('browser.downloadsChanged', { downloads: event.downloads })
    }
    else {
      const { conversationId, tabs } = event
      browserHistory.record(conversationId, tabs)
      ;[...(server?.connections ?? [])]
        .filter((c) => c.browsing.has(WATCH_ALL) || (conversationId !== null && c.browsing.has(conversationId)))
        .forEach((c) => c.notify('browser.tabsChanged', { conversationId, tabs }))
    }
  }
)
// The desktop app runs the browser; core follows its host file to connect, and connects now in
// case the app is already up. Earlier versions kept a Chromium download and profile beside it.
watchBrowserHostFile(paths.browserHostFile, () => browser.hostFileChanged())
browser.hostFileChanged()
for (const stale of ['ms-playwright', 'profile']) {
  const dir = path.join(paths.browser, stale)
  void stat(dir).then(() => rm(dir, { recursive: true, force: true }).then(() => console.log(`[antumi-core] removed ${dir}: the browser now runs in the app`)), () => {})
}

const service = new TaskService(
  store,
  projects,
  paths.worktrees,
  (event) => {
    if (event.type === 'changed') {
      server?.broadcast('tasks.changed', { task: event.task })
      schedules.taskChanged(event.task)
      refreshAwake()
    } else {
      server?.broadcast('tasks.deleted', { id: event.id })
      schedules.taskDeleted(event.id)
      sources.tasksChanged()
    }
  },
  attachments,
  conversations,
  runs
)

const sourceConfig = new SourceConfigStore(paths.sourcesConfig)
const credentials = new CredentialStore(paths.credentials)
await sourceConfig.load()
await credentials.load()
await migrateLegacyJira(paths.legacyJiraConfig, sourceConfig, credentials).catch((error: unknown) =>
  console.error('[antumi-core] migrating jira.json failed; it stays in place:', error)
)
const sources = new SourceService([], sourceConfig, credentials, new LoginFlows(), service, store, attachments, {
  inboxChanged: (inbox) => server?.broadcast('sources.inboxChanged', { inbox }),
  listChanged: (list) => server?.broadcast('sources.listChanged', { sources: list })
})
sources.setConversations(conversations)

const plugins = new PluginService(path.join(paths.home, 'plugins'), packageJson.version, sources, sourceConfig, [],
  (plugins) => server?.broadcast('plugins.changed', { plugins }))
await plugins.load()
const pets = new PetLibrary(path.join(paths.home, 'pets'), {
  developmentDirectory: process.env.ANTUMI_PET_DIRECTORY,
  changed: (state) => server?.broadcast('pets.changed', state)
})
await pets.load()

const usageSources: Partial<Record<AgentKind, UsageSource>> = {}
const resetCreditUses: Partial<Record<AgentKind, ResetCreditUse>> = {}
const signedIn: Partial<Record<AgentKind, () => Promise<boolean>>> = {}
for (const kind of AGENT_KINDS) {
  const adapter = adapterOf(kind)
  const source = adapter.usage
  if (source) usageSources[kind] = async (home) => {
    const account = accounts.homes().find((entry) => entry.agent === kind && entry.home === home)
    if (account) await accounts.refreshIdentity(kind, account.id)
    return source(home)
  }
  if (adapter.useResetCredit) resetCreditUses[kind] = adapter.useResetCredit
  const check = adapter.signedIn
  // The account its next process starts on.
  if (check) signedIn[kind] = () => check(accounts.home(kind, accounts.activeOf(kind)))
}

const usage = new UsageService(usageSources, (entry) => {
  server?.connections.forEach((connection) => {
    if (usageReadable(connection.usageKinds, entry)) connection.notify('usage.changed', { usage: entry })
  })
  accounts.notePlan(entry.agent, usageAccount(entry), entry.plan)
  accounts.observeUsage(usage.list(), Date.now())
},
Date.now,
resetCreditUses,
() => accounts.homes()
)
const analytics = new UsageAnalytics(paths.database, {
  roots: () => accounts.homes().flatMap((account): ScanRoot[] => {
    const source = adapterOf(account.agent).usageTranscripts
    return source ? [{ agent: source.format, home: source.home(account.home) }] : []
  }),
  opencode: () => [process.env.OPENCODE_DB || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'opencode', 'opencode.db')],
  accounts: () => accounts.list(), stages: (session) => conversationsStore.usageStages(session),
  changed: () => server?.broadcast('usage.analyticsChanged', {}), cursor: cursorHistoryReader()
})
usage.decorateWith((entry) => analytics.withRates(entry))
// Each agent's quota as what runs on it next sees it: its active account's, or, every account
// being spent, the one that lifts first, which it will move to then.
const standingUsage = {
  list: () => AGENT_KINDS.flatMap((agent) => {
    const readings = usage.list().filter((entry) => entry.agent === agent)
    const active = readings.find((entry) => usageAccount(entry) === accounts.activeOf(agent))
    if (!active || !accounts.autoSwitching() || quotaVerdict(active, Date.now()).state !== 'exhausted') return active ? [active] : []
    const lifts = (entry: AgentUsage) => quotaVerdict(entry, Date.now()).window?.resetsAt ?? Number.POSITIVE_INFINITY
    const signedIn = new Set(accounts.list().accounts.filter((account) => account.agent === agent && account.signedIn).map((account) => account.id))
    return [readings.filter((entry) => signedIn.has(usageAccount(entry))).reduce((first, entry) => (lifts(entry) < lifts(first) ? entry : first), active)]
  }),
  refresh: async () => { await usage.refresh(); return standingUsage.list() }
}

const schedules = new ScheduleService(paths.database, {
  beforeQuotaWait: (agent) => automation.ensureQuota(agent),
  tasks: {
    get: (id) => store.get(id),
    autoRuns: () => store.list('pending').filter((task) => task.autoRun),
    disableAutoRun: (id) => { service.update({ id, autoRun: false }) },
    scheduleBlocker: (id) => service.scheduleBlocker(id),
    start: (id, allowBypass, unattended) => service.start(id, allowBypass, unattended),
    resumeChat: (id, allowBypass) => service.resumeChat(id, allowBypass)
  },
  conversations,
  usage: standingUsage,
  mode: () => chatSettings.current().unattendedMode,
  emit: (runs) => {
    server?.broadcast('schedules.changed', { runs })
    refreshAwake()
  },
  limitChanged: (conversationId, limit) => limits.announce(conversationId, limit),
  routines: {
    pass: () => routines.pass(),
    get: (id) => routines.get(id),
    pickAgent: (routine) => routines.pickAgent(routine),
    runChanged: (run) => routines.runChanged(run)
  }
})
const automation = new UsageAutomation(paths.database, {
  accounts: () => accounts.list(), usage: () => usage.list(), refresh: (agent, account) => usage.readAccount(agent, account),
  switchAccount: (agent, account) => accounts.switchFrom(agent, account, usage.list(), Date.now()),
  consume: (agent, account, request, credit) => usage.useResetCredit(agent, request, credit, account),
  warmup: async (agent, account) => {
    const identity = accounts.list().accounts.find((entry) => entry.agent === agent && entry.id === account)?.email ?? null
    const startedAt = Date.now()
    await warmAccount(daemon, accounts, agent, account, (metering) => analytics.quick({ agent, account, identity, startedAt, metering, unpriced: false }, 'warmup'))
  },
  restored: (agent) => schedules.quotaRestored(agent)
})
// Speaks for the scheduler on the usage-limit cards; built after it, called only once runs change.
const limits = new UsageLimitResumes(schedules, conversations, standingUsage, notifyChatItems, Date.now, (agent, spent) => accounts.switchFrom(agent, spent, usage.list(), Date.now()))
// Makes the scheduler's runs for what comes due; built after it, called only from its passes.
const routines = new RoutineService(paths.database, {
  schedules,
  conversations,
  usage: standingUsage,
  emit: (list) => server?.broadcast('routines.changed', { routines: list })
})

// Group chats run their members as conversations; built after them, called only once one changes.
const discussions = new DiscussionService(paths.database, {
  conversations,
  events: {
    changed: (discussion) => server?.broadcast('discussions.changed', { discussion }),
    deleted: (id) => server?.broadcast('discussions.deleted', { id }),
    posts: (discussionId, posts) => server?.broadcast('discussions.posts', { discussionId, posts })
  }
})

const squads = new SquadService(new SquadStore(paths.database), service, conversations, {
  squad: (squad) => server?.broadcast('squads.changed', { squad }),
  run: (run) => server?.broadcast('squads.runChanged', { run })
}, (id) => terminals.stopForConversation(id))
const profiles = new AgentProfileService(new AgentProfileStore(paths.database), conversations, {
  profile: (profile) => server?.broadcast('agentProfiles.changed', { profile }),
  call: (call) => {
    server?.broadcast('agentCalls.changed', { call })
    conversations.refreshDelegation(call.parentId)
  }
}, (id) => terminals.stopForConversation(id), (conversation) => !conversation.taskId || !service.get(conversation.taskId).squadId)
service.setSquads(squads)
conversations.setSquadGuard((conversation) => { squads.guardMember(conversation); profiles.guard(conversation) })
squads.setProfiles((id) => profiles.get(id))
conversations.setCallCleanup((id) => profiles.cancelForParent(id))
service.setDelegationBusy((id) => profiles.busy(id))
conversations.setDelegationStatus((id) => profiles.summary(id))
conversations.setDelegationAvailable((id) => profiles.available(id).length > 0)

const terminals = new TerminalService(paths.database, daemon, (list) => server?.broadcast('terminals.changed', { terminals: list }), Date.now, new ShellPrompt(path.join(paths.home, 'shell')))
// Looked for where the daemon looks: it was started with the same PATH as core.
const environment = new EnvironmentService({
  pathEnv: process.env.PATH ?? '',
  platform: process.platform,
  signedIn,
  changed: (environment) => server?.broadcast('system.environmentChanged', { environment })
})

const cliMaintenance = new AgentCliMaintenance(paths.database, {
  environment, daemon, terminals,
  changed: (status) => server?.broadcast('system.agentCliChanged', { status }),
  invalidate: async (agent) => { conversations.invalidateCli(agent); await accounts.refresh(agent) }
})

terminals.onBeforeCloseUpgrade(() => cliMaintenance.reconcile())

const accounts = new AgentAccountStore(paths.agentAccounts, paths.agentAccountHomes, {
  signIn: (argv, env, title, agent) => terminals.signIn(argv, env, title, agent),
  waitForExit: (id) => terminals.waitForExit(id),
  accountChanged: (agent, id, removed) => {
    if (removed) usage.forget(agent, id)
    else void usage.readAccount(agent, id)
    void environment.check(true).catch(() => {})
  },
  changed: (list) => server?.broadcast('accounts.changed', { accounts: list })
})
await accounts.load()
conversations.setAccounts(accounts)
const projectConfigs = new ProjectConfigStore(paths.projectTrust)
const worktreeSetup = new WorktreeSetup(projectConfigs, terminals)
service.setWorktreeSetup(worktreeSetup)
conversations.setWorktreeSetup(worktreeSetup)
const terminalCommands = new TerminalCommandStore(paths.database, (commands) => server?.broadcast('terminalCommands.changed', { commands }))
const bookmarks = new BookmarkStore(paths.database, (list) => server?.broadcast('bookmarks.changed', { bookmarks: list }))
const chatCommands = new ChatCommandStore(paths.database, (commands) => server?.broadcast('chatCommands.changed', { commands }))
const worktrees = new WorktreeService(paths.worktrees, service, () => server?.broadcast('worktrees.changed', {}), conversations)
awake = new ComputerAwakeService(daemon, new AwakeConfigStore(paths.awakeConfig), (status) =>
  server?.broadcast('system.awakeChanged', { status })
)
const chatSettings = new ChatSettingsStore(paths.chatSettings, (settings) => {
  conversations.setPromptSuggestions(settings.promptSuggestions)
  conversations.setTitleNaming(settings.titleNaming ?? 'off')
  conversations.setUserBrowser(settings.userBrowser ?? true)
  conversations.setUserTodos(settings.userTodos ?? true)
  conversations.setKnowledgeBase(settings.knowledgeBase ?? null)
  conversations.setCapacity(settings, () => { void schedules.tick(); squads.tick(); profiles.tick() })
  wire.setEnabled(settings.wireLog ?? false)
  void autoArchive.sweep()
  announcements.settingsChanged()
  server?.broadcast('system.chatSettingsChanged', { settings })
})
const announcements = new ResetAnnouncements(
  () => chatSettings.current().resetAnnouncements,
  (agent, resets) => usage.setGlobalResets(agent, resets)
)
usage.onManualRefresh(() => void announcements.refresh())
const autoArchive = new ConversationAutoArchive(
  () => chatSettings.current().autoArchiveDays,
  (before) => conversationsStore.idleSince(before),
  (id) => conversations.setArchived(id, true)
)
// Before the daemon connects: a chat stage it still runs is taken back with these settings.
const skills = new SkillsLibrary(paths.skills, (repos) => server?.broadcast('skills.changed', { repos: [...repos] }), { legacySkills: () => knowledgeBaseSkills(chatSettings.current().knowledgeBase ?? null) })
await skills.load()
const mcpServers = new McpServerStore(paths.mcpServers, credentials, (servers) => server?.broadcast('mcpServers.changed', { servers: [...servers] }))
await mcpServers.load()
const modelProviders = new ModelProviderStore(paths.modelProviders, credentials, (providers) => server?.broadcast('modelProviders.changed', { providers }))
await modelProviders.load()
conversations.setModelProviders(modelProviders)
// Handed through Antumi's launcher, so no secret is in an agent's command line or Antumi's logs.
conversations.setUserMcpProvider((agent, readOnly, selected) => agentDescriptor(agent).capabilities.userMcp ? mcpServers.forAgent(agent).filter((server) => selected == null || selected.includes(server.name)).map((server) => userMcpServer(paths.home, server, readOnly)) : [])
// Explicit activation takes precedence over the legacy, knowledge-base-provided selection.
conversations.setSkillsProvider(async (agent, selected) => {
  if (!agentDescriptor(agent).capabilities.skills) return null
  const bundle = await (selected == null ? skills.bundleForAgent(agent) : skills.bundleFor(selected))
  return bundle ? { dir: bundle.dir } : null
})
const initialChatSettings = await chatSettings.load()
conversations.setPromptSuggestions(initialChatSettings.promptSuggestions)
conversations.setTitleNaming(initialChatSettings.titleNaming)
conversations.setUserBrowser(initialChatSettings.userBrowser)
conversations.setUserTodos(initialChatSettings.userTodos)
conversations.setKnowledgeBase(initialChatSettings.knowledgeBase)
conversations.setCapacity(initialChatSettings, () => { void schedules.tick(); squads.tick(); profiles.tick() })
wire.setEnabled(initialChatSettings.wireLog)

daemon.onEvent((event) => {
  const { sessionId } = event
  const attached = [...(server?.connections ?? [])].filter((c) => c.attached.has(sessionId))
  if (event.event === 'data') {
    conversations.handleData(event)
    attached.forEach((c) => c.notify('sessions.data', { sessionId, data: event.data, offset: event.offset }))
  } else if (event.event === 'exit') {
    const installation = terminals.list().some((terminal) => terminal.sessionId === sessionId && !terminal.conversationId && terminal.command)
    attached.forEach((c) => c.notify('sessions.exit', { sessionId, exitCode: event.exitCode }))
    conversations.handleExit(sessionId, event.exitCode)
    terminals.handleExit(sessionId, event.exitCode)
    if (installation) void environment.check(true).catch((error: unknown) => console.error('[antumi-core] post-install detection failed', error))
    // An agent that ended is when the numbers most likely moved.
    void usage.refresh()
    refreshAwake()
  } else {
    conversations.handleStderr(sessionId, event.data)
  }
})

daemon.onConnect(() => {
  awake?.reconnect()
  const listedAt = Date.now()
  daemon
    .request('list', {})
    .then(async ({ sessions }) => {
      await cliMaintenance.reconcile(sessions)
      await conversations.reconcile(sessions, listedAt)
      await smallModels.recoverHelpers({ stages: () => conversations.chatStageRefs(), items: (id, stageId) => conversations.stageChatItems(id, stageId) })
      terminals.reconcile(sessions)
      await discussions.reconcile()
      await squads.reconcile()
      await profiles.reconcile()
      void environment.check(true).catch((error: unknown) => console.error('[antumi-core] agent discovery failed', error))
      // What came due while core or the daemon was away goes now, not at the next tick.
      await schedules.tick()
    })
    .catch((error) => console.error('[antumi-core] reconcile failed', error))
})

const token = randomBytes(32).toString('hex')
server = await startRpcServer({
  port: Number(process.env.ANTUMI_PORT ?? 0),
  token,
  handlers: createRpcHandlers(service, conversations, projects, gitFavorites, daemon, usage, sources, {
    store: attachments,
    uploads: new AttachmentUploads(attachments)
  }, terminals, worktrees, browser, awake, terminalCommands, limits, runs, turns, chatSettings, environment, schedules, chatCommands, routines, discussions, wire, () => server?.broadcast('git.changed', {}), squads, todos, plugins, skills, mcpServers, smallModels, projectConfigs, modelProviders, new SessionImports(conversationsStore, conversations, paths.home), accounts, cliMaintenance, analytics, automation, pets, new ProjectStar(sources), profiles, bookmarks, browserHistory)
})
await writeCoreEndpoint({ port: server.port, token, pid: process.pid, protocolVersion: PROTOCOL_VERSION, version: packageJson.version })
daemon.start()
await awake.start()
refreshAwake()
usage.start()
analytics.start()
automation.start()
announcements.start()
routines.start()
schedules.start()
autoArchive.start()
environment.start()
refreshAwake()
// Stages that ended before turns were kept, counted once in the background.
void turns.catchUp().catch((error: unknown) => console.error('[antumi-core] counting earlier chat turns failed:', error))
void analytics.catchUp((stage) => conversations.stageChatItems(stage.conversationId, stage.id), smallModels.endedSince(0))
  .catch((error: unknown) => console.error('[antumi-core] rebuilding usage history failed:', error))
sources.start()
// Idle chat agents are checked for once a minute, so one goes within a minute of its limit.
setInterval(() => void conversations.releaseIdle(), 60_000).unref()
// Wire logs are for looking at soon after: a week on, they go.
wire.prune()
setInterval(() => wire.prune(), 6 * 60 * 60_000).unref()
console.log(`[antumi-core] listening on 127.0.0.1:${server.port} (home ${paths.home})`)

let shuttingDown = false
async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  announcements.stop()
  await schedules.stop()
  await automation.close()
  await usage.stop()
  await analytics.close()
  routines.stop()
  autoArchive.stop()
  await profiles.close()
  await squads.close()
  discussions.close()
  sources.stop()
  await plugins.close()
  await pets.close()
  await sources.pause(sources.list().map((source) => source.provider))
  awake?.stop()
  cliMaintenance.close()
  daemon.stop()
  await server?.close()
  await removeCoreEndpoint(process.pid)
  store.close()
  conversationsStore.close()
  runs.close()
  turns.close()
  smallModels.close()
  projects.close()
  gitFavorites.close()
  bookmarks.close()
  browserHistory.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
