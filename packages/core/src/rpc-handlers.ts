import type { AgentProfileService } from './agent-profile-service'
import type { AgentCliMaintenance } from './agent-cli-maintenance'
import { suggestForProject } from './project-config-suggest'
import { EMPTY_BASELINE, type SmallModelStore } from './small-model-store'
import { GitService } from './git-service'
import type { GitFavoriteStore } from './git-favorite-store'
import { agentDescriptor, CORE_FEATURES, PROTOCOL_VERSION, type ChatItem } from '@antumi/protocol'
import packageJson from '../package.json' with { type: 'json' }
import type { AgentRunStore } from './agent-run-store'
import type { ChatTurnStore } from './chat-turn-store'
import type { AttachmentStore } from './attachment-store'
import type { AttachmentUploads } from './attachment-uploads'
import type { BrowserService } from './browser-service'
import type { SessionHost } from './daemon-client'
import { findFiles, searchFiles } from './file-search'
import { ConversationFiles } from './conversation-files'
import type { ProjectRegistry } from './project-registry'
import { Rejection } from './rejection'
import type { PluginService } from './plugin-service'
import type { PetLibrary } from './pet-library'
import type { SourceService } from './source-service'
import type { RpcHandlers } from './rpc-server'
import type { TaskService } from './task-service'
import type { UsageLimitResumes } from './usage-limit-resume'
import { readableUsage, type UsageService } from './usage-service'
import type { ConversationService } from './conversation-service'
import type { TerminalCommandStore } from './terminal-commands'
import type { ChatCommandStore } from './chat-commands'
import type { TerminalService } from './terminal-service'
import type { ProjectConfigStore } from './project-config'
import type { WorktreeService } from './worktree-service'
import type { ComputerAwakeService } from './computer-awake-service'
import type { ChatSettingsStore } from './chat-settings'
import type { EnvironmentService } from './environment-check'
import type { ScheduleService } from './schedule-service'
import type { RoutineService } from './routine-service'
import type { SquadService } from './squad-service'
import type { TodoStore } from './todo-store'
import type { DiscussionService } from './discussion-service'
import { AgentTerminals } from './agent-terminals'
import { AgentCliInstaller } from './agent-cli-installation'
import { dashboardSince, summarizeDashboard } from './dashboard-stats'
import { PortService } from './port-service'
import type { WireLog } from './wire-log'
import { cleanSlug, slugPrompt } from './branch-slug'
import { cleanCommitMessage, commitContext, commitMessagePrompt } from './commit-message'
import { QuickRequests } from './quick-request'
import { TranslationService } from './translation-service'
import { inspectKnowledgeFolder, readObsidianVaults } from './obsidian-vaults'
import type { SkillsLibrary } from './skills-library'
import { searchSkills } from './skills-search'
import type { McpServerStore } from './mcp-servers'
import type { ModelProviderStore } from './model-providers'
import type { AgentAccountStore } from './agent-accounts'
import type { SessionImports } from './session-imports'
import type { UsageAnalytics } from './usage-analytics'
import type { UsageAutomation } from './usage-automation'
import type { ProjectStar } from './project-star'

const OK = { ok: true } as const

export function createRpcHandlers(
  service: TaskService,
  conversations: ConversationService,
  projects: ProjectRegistry,
  gitFavorites: GitFavoriteStore,
  sessions: SessionHost,
  usage: UsageService,
  sources: SourceService,
  attachments: { store: AttachmentStore; uploads: AttachmentUploads },
  terminals: TerminalService,
  worktrees: WorktreeService,
  browser: BrowserService,
  awake: ComputerAwakeService,
  terminalCommands: TerminalCommandStore,
  limits: UsageLimitResumes,
  runs: AgentRunStore,
  turns: ChatTurnStore,
  chatSettings: ChatSettingsStore,
  environment: EnvironmentService,
  schedules: ScheduleService,
  chatCommands: ChatCommandStore,
  routines: RoutineService,
  discussions: DiscussionService,
  wire: WireLog,
  gitChanged: () => void = () => {},
  squads?: SquadService,
  todos?: TodoStore,
  plugins?: PluginService,
  skills?: SkillsLibrary,
  mcpServers?: McpServerStore,
  smallModels?: SmallModelStore,
  projectConfigs?: ProjectConfigStore,
  modelProviders?: ModelProviderStore,
  sessionImports?: SessionImports,
  accounts?: AgentAccountStore,
  cliMaintenance?: AgentCliMaintenance,
  analytics?: UsageAnalytics,
  automation?: UsageAutomation,
  pets?: PetLibrary,
  projectStar?: ProjectStar,
  profiles?: AgentProfileService
): RpcHandlers {
  const profileService = () => {
    if (!profiles) throw new Rejection('profile-unavailable')
    return profiles
  }
  const petLibrary = (): PetLibrary => {
    if (!pets) throw new Rejection('pets-unavailable')
    return pets
  }
  const maintenance = (): AgentCliMaintenance => {
    if (!cliMaintenance) throw new Rejection('agent-cli-maintenance-unavailable')
    return cliMaintenance
  }
  const git = new GitService(service, conversations, gitFavorites, gitChanged)
  const requireProjectConfigs = (): ProjectConfigStore => {
    if (!projectConfigs) throw new Rejection('project-config-unavailable')
    return projectConfigs
  }
  conversations.setGitGuard((dirs) => git.guardAgent(dirs))
  service.setGitGuard((dirs) => git.guardAgent(dirs))
  conversations.setGitPreparation((dirs, run) => git.withRepositories(dirs, run))
  worktrees.setGitRemoval((dirs, run) => git.withRepositoryLock(dirs, run))
  const files = new ConversationFiles((id) => conversations.get(id))
  const quick = new QuickRequests({
    catalog: (agent) => conversations.chatCatalog(agent),
    accounting: smallModels,
    account: async (agent) => {
      const launch = await accounts?.launch(agent)
      return launch ? { ...launch, identity: accounts?.list().accounts.find((entry) => entry.agent === agent && entry.id === launch.id)?.email ?? null } : null
    },
    observe: (facts) => analytics?.quick(facts)
  })
  const translations = new TranslationService(quick)
  conversations.setTitleGenerator(async (conversation, prompt) => (await quick.ask(conversation.agent, prompt,
    chatSettings.current().titleModels[conversation.agent], {
      kind: 'title', conversationId: conversation.id, baseline: () => conversations.costBaseline(conversation.id)
    }, conversations.quickProvider(conversation.id))).text)
  service.setBranchNamer(async (agent, title, modelProvider) => cleanSlug((await quick.ask(agent, slugPrompt(title), undefined, undefined,
    modelProvider ? conversations.quickProviderFor(modelProvider, agent) : undefined)).text))
  const cliInstaller = new AgentCliInstaller(environment, terminals)
  const ports = new PortService(sessions, () => ({ terminals: terminals.list(), conversations: conversations.listAll(), tasks: service.list() }))
  // An agent's own terminals: run in the conversation's folder unless it names another, and
  // asked about in the chat where the agent asks nothing for Antumi's MCP tools.
  const agentTerminals = new AgentTerminals(
    (id) => {
      const conversation = conversations.get(id)
      return { agent: conversation.agent, cwd: conversation.workspacePath }
    },
    (id, cwd, command) => terminals.run(id, cwd, command),
    (id, command, cwd) => conversations.askTerminal(id, command, cwd)
  )
  // A page of chat items as clients see them: a usage limit with what core means to do about it.
  const page = (result: { items: ChatItem[]; before: string | null }) => ({ ...result, items: limits.decorate(smallModels?.decorate(result.items) ?? result.items) })
  // The user going on with a conversation themselves: core no longer continues it after a limit.
  const userActed = async <T>(id: string, act: () => Promise<T>): Promise<T> => {
    conversations.attend(id)
    const since = limits.mark()
    const result = await act()
    limits.cancelFor(id, since)
    return result
  }
  const squadService = () => {
    if (!squads) throw new Rejection('squad-unavailable')
    return squads
  }
  const skillsLibrary = () => {
    if (!skills) throw new Rejection('skills-unavailable')
    return skills
  }
  const mcpServerStore = () => {
    if (!mcpServers) throw new Rejection('mcp-unavailable')
    return mcpServers
  }
  const accountStore = () => {
    if (!accounts) throw new Rejection('accounts-unavailable')
    return accounts
  }
  const imports = () => {
    if (!sessionImports) throw new Rejection('session-import-unavailable')
    return sessionImports
  }
  const modelProviderStore = () => {
    if (!modelProviders) throw new Rejection('model-providers-unavailable')
    return modelProviders
  }
  const pluginService = () => {
    if (!plugins) throw new Rejection('plugins-unavailable', '当前 core 不支持插件')
    return plugins
  }
  // A conversation's to-dos, once it is known to be one.
  const todosOf = (id: string) => {
    if (!todos) throw new Rejection('todos-unavailable')
    conversations.get(id)
    return todos
  }
  return {
    'support.starStatus': () => projectStar?.check() ?? { state: 'unavailable' },
    'support.star': ({ identity }) => projectStar?.star(identity) ?? { ok: false, problem: 'unavailable' },
    'plugins.recommended': () => pluginService().recommended(),
    'plugins.installRecommended': ({ id }) => pluginService().installRecommended(id),
    'plugins.list': () => pluginService().list(),
    'plugins.install': ({ source }) => pluginService().install(source),
    'plugins.update': ({ id }) => pluginService().update(id),
    'plugins.setEnabled': ({ id, enabled }) => pluginService().setEnabled(id, enabled),
    'plugins.rollback': ({ id, version }) => pluginService().rollback(id, version),
    'plugins.uninstall': async ({ id }) => { await pluginService().uninstall(id); return OK },
    'agentProfiles.list': () => profileService().list(),
    'agentProfiles.save': ({ id, ...fields }) => profileService().save(fields, id),
    'agentProfiles.archive': ({ id, archived }) => profileService().archive(id, archived),
    'agentProfiles.available': ({ id }) => profileService().available(id),
    'agentCalls.list': ({ id }) => profileService().calls(id),
    'agentCalls.dispatch': ({ id, profileId, instruction, ref }) => profileService().dispatch(id, profileId, instruction, ref),
    'agentCalls.cancel': ({ id, callId }) => profileService().cancel(id, callId),
    'squads.list': () => squadService().list(),
    'squads.create': (fields) => squadService().create(fields),
    'squads.update': ({ id, ...fields }) => squadService().update(id, fields),
    'squads.archive': ({ id, archived }) => squadService().archive(id, archived),
    'squads.activeRuns': () => squadService().activeRuns(),
    'squads.runs': ({ id }) => squadService().runs(id),
    'squads.start': ({ id, squadId, plan, planFirst, permissionMode, allowBypass }) => squadService().start(id, allowBypass, { permissionMode }, squadId, plan, planFirst),
    'squads.control': ({ id, action }) => squadService().control(id, action),
    'squads.retry': ({ id, workId }) => squadService().retry(id, workId),
    'squads.roster': ({ id }) => squadService().roster(id),
    'squads.dispatch': ({ id, memberId, instruction, capability, retryOf }) => squadService().dispatch(id, memberId, instruction, capability, retryOf),
    'squads.finish': async ({ id, summary }) => { await squadService().finish(id, summary); return OK },
    'git.status': (target) => git.status(target),
    'git.favorite': async ({ ref, favorite, ...target }) => { await git.favorite(target, ref, favorite); return OK },
    'git.history': ({ ref, offset, query, tips, ...target }) => git.history(target, ref, offset, query, tips),
    'git.detail': ({ sha, parent, ...target }) => git.detail(target, sha, parent),
    'git.containing': ({ sha, ...target }) => git.containing(target, sha),
    'git.diff': ({ base, sha, file, ...target }) => git.diff(target, base, sha, file),
    'git.compare': ({ ref, direct, ...target }) => git.compare(target, ref, direct),
    'git.execute': ({ action, ...target }) => git.execute(target, action),
    'git.outgoing': ({ remote, name, ...target }) => git.outgoing(target, remote, name),
    'git.commitMessage': async ({ model, ...target }) => {
      const { agent, dir } = git.writer(target)
      const context = await commitContext(dir)
      const conversationId = target.kind === 'conversation' ? target.id : service.get(target.id).conversationId
      const answer = await quick.ask(agent, commitMessagePrompt(context), model, {
        kind: 'commitMessage', conversationId,
        baseline: () => conversationId ? conversations.costBaseline(conversationId) : EMPTY_BASELINE
      }, conversationId ? conversations.quickProvider(conversationId) : undefined)
      return { message: cleanCommitMessage(answer.text), model: answer.model }
    },
    'pets.list': ({ refresh }) => petLibrary().list(refresh),
    'pets.install': ({ id }) => petLibrary().install(id),
    'pets.cancel': ({ id }) => { petLibrary().cancel(id); return OK },
    'pets.remove': ({ id }) => petLibrary().remove(id),
    'pets.read': ({ id }) => petLibrary().read(id),
    'system.hello': () => ({ protocolVersion: PROTOCOL_VERSION, serverVersion: packageJson.version, features: CORE_FEATURES.filter((feature) => (feature !== 'agent-profiles' || Boolean(profiles)) && (feature !== 'project-star' || Boolean(projectStar)) && (feature !== 'pets' || Boolean(pets)) && (feature !== 'squads' || Boolean(squads)) && (!['plugins', 'plugin-recommendations'].includes(feature) || Boolean(plugins)) && (!['skills-library', 'skills-search', 'skills-activation'].includes(feature) || Boolean(skills)) && (feature !== 'mcp-servers' || Boolean(mcpServers)) && (feature !== 'small-model-stats' || Boolean(smallModels)) && (feature !== 'model-providers' || Boolean(modelProviders)) && (feature !== 'agent-accounts' || Boolean(accounts))) }),
    'files.resolve': ({ conversationId, path }) => files.resolve(conversationId, path),
    'files.read': ({ conversationId, path }) => files.read(conversationId, path),
    'files.list': ({ conversationId, path }) => files.list(conversationId, path),
    'files.write': ({ conversationId, path, text, expectedMtimeMs }) => files.write(conversationId, path, text, expectedMtimeMs),
    'system.awakeStatus': () => awake.status(),
    'system.setAwakeMode': ({ mode }) => awake.setMode(mode),
    'system.chatSettings': () => chatSettings.current(),
    'system.setChatSettings': (patch) => chatSettings.update(patch),
    'knowledge.vaults': () => readObsidianVaults(),
    'knowledge.inspect': ({ path }) => inspectKnowledgeFolder(path),
    'skills.list': () => [...skillsLibrary().list()],
    'skills.recommended': () => [...skillsLibrary().recommended()],
    'skills.search': ({ query }) => { skillsLibrary(); return searchSkills(query) },
    'skills.install': ({ url }) => skillsLibrary().install(url),
    'skills.setActivation': ({ id, activation }) => skillsLibrary().setActivation(id, activation),
    'skills.readme': async ({ id }) => ({ text: await skillsLibrary().readme(id) }),
    'skills.checkUpdate': ({ id }) => skillsLibrary().checkUpdate(id),
    'skills.update': ({ id, commit, allowUnavailable }) => skillsLibrary().update(id, commit, allowUnavailable),
    'skills.rollback': ({ id }) => skillsLibrary().rollback(id),
    'skills.remove': async ({ id }) => { await skillsLibrary().remove(id); return OK },
    'mcpServers.list': () => [...mcpServerStore().list()],
    'mcpServers.save': (input) => mcpServerStore().save(input),
    'mcpServers.setEnabled': ({ name, enabled }) => mcpServerStore().setEnabled(name, enabled),
    'mcpServers.remove': async ({ name }) => { await mcpServerStore().remove(name); return OK },
    'mcpServers.probe': ({ name }) => mcpServerStore().probe(name),
    'mcpServers.importable': () => mcpServerStore().importable(),
    'mcpServers.import': ({ items, agents }) => mcpServerStore().import(items, agents),
    'sessionImports.list': async () => ({ sessions: await imports().list() }),
    'sessionImports.import': async ({ sessions }) => ({ conversations: await imports().import(sessions) }),
    'modelProviders.list': () => modelProviderStore().list(),
    'modelProviders.save': (input) => modelProviderStore().save(input),
    'modelProviders.remove': async ({ id }) => { await modelProviderStore().remove(id); return OK },
    'modelProviders.probe': ({ id }) => modelProviderStore().probe(id),
    'accounts.list': () => accountStore().list(),
    'accounts.add': ({ agent, label }) => accountStore().add(agent, label),
    'accounts.login': ({ agent, id }) => accountStore().login(agent, id),
    'accounts.rename': ({ agent, id, label }) => accountStore().rename(agent, id, label),
    'accounts.remove': async ({ agent, id }) => { await accountStore().remove(agent, id); return OK },
    'accounts.activate': ({ agent, id }) => accountStore().activate(agent, id),
    'accounts.setAutoSwitch': ({ autoSwitch }) => accountStore().setAutoSwitch(autoSwitch),
    'debug.wire': ({ id, stageId, before }) => {
      const known = new Map(conversations.stages(id).map((stage) => [stage.id, stage]))
      const stages = wire.stages(id)
        .map((found) => {
          const stage = known.get(found.stageId)
          return {
            stageId: found.stageId,
            agent: stage?.agent ?? null,
            startedAt: stage?.startedAt ?? found.createdAt,
            endedAt: stage ? stage.endedAt : null,
            bytes: found.bytes,
            file: wire.file(id, found.stageId)
          }
        })
        .sort((a, b) => b.startedAt - a.startedAt)
      const shown = stages.find((stage) => stage.stageId === stageId) ?? stages[0]
      if (!shown) return { stages, stageId: null, entries: [], before: null }
      return { stages, stageId: shown.stageId, ...wire.page(id, shown.stageId, before) }
    },
    'debug.watchWire': ({ id }, connection) => {
      conversations.get(id)
      connection.wiring.add(id)
      return OK
    },
    'debug.unwatchWire': ({ id }, connection) => { connection.wiring.delete(id); return OK },
    'debug.wireUsage': () => wire.usage(),
    'debug.clearWire': () => wire.clear(),
    'system.agentCliStatus': ({ agent, refresh }) => maintenance().list(agent, refresh),
    'system.upgradeAgentCli': ({ agent }) => maintenance().upgrade(agent),
    'system.cancelAgentCliUpgrade': ({ agent }) => maintenance().cancel(agent),
    'system.environment': ({ refresh }) => environment.check(refresh ?? false),
    'system.installAgentCli': ({ agent }) => cliInstaller.install(agent),
    'tasks.list': ({ status }) => service.list(status),
    'tasks.get': ({ id }) => service.get(id),
    'tasks.create': (params) => service.createTask(params),
    'tasks.update': (params) => service.update(params),
    'tasks.startOptions': ({ id }) => service.startOptions(id),
    'tasks.move': async ({ id, status }) => {
      if (service.isLaunching(id)) throw new Rejection('run-in-progress')
      if (service.get(id).squadId && status === 'done') await squads?.cancel(id)
      return service.move(id, status)
    },
    'tasks.redo': ({ id, reason }) => service.redo(id, reason),
    'tasks.cancel': ({ id, reason }) => service.cancel(id, reason),
    'tasks.reopen': ({ id }) => service.reopen(id),
    'tasks.start': ({ id, allowBypass, ...options }) => service.start(id, allowBypass, undefined, options),
    // Going on by hand in a task's chat is the user acting there, as in a free conversation.
    'tasks.resumeChat': ({ id, allowBypass }) => {
      const { conversationId } = service.get(id)
      return conversationId ? userActed(conversationId, () => service.resumeChat(id, allowBypass)) : service.resumeChat(id, allowBypass)
    },
    'tasks.submit': ({ id }) => service.submitChecked(id),
    'tasks.handoff': ({ id, agent, note, allowBypass, permissionMode, model, effort }) => service.handoff(id, agent, note, allowBypass, { permissionMode, model, effort }),
    'tasks.savePlan': ({ id, stageId, requestId }) => service.savePlan(id, stageId, requestId),
    'tasks.delete': async ({ id }) => {
      await service.delete(id)
      return OK
    },
    'tasks.addImages': ({ id, images }) => service.addImages(id, images),
    'tasks.updateImage': ({ id, attachmentId, name }) => service.updateImage(id, attachmentId, name),
    'tasks.removeImage': ({ id, attachmentId }) => service.removeImage(id, attachmentId),
    'tasks.branches': ({ id }) => service.branches(id),
    'tasks.changes': ({ id }) => service.changes(id),
    'tasks.diff': ({ id, repo, file }) => service.diff(id, repo, file),
    'conversations.list': ({ includeTasks, includeSquads, includeDelegates }) => conversations.list(includeTasks, includeSquads, includeDelegates),
    'conversations.get': ({ id }) => conversations.get(id),
    'conversations.configuration': ({ id }) => conversations.configuration(id),
    'conversations.helper': ({ id }) => conversations.helper(id),
    'conversations.create': ({ agent, projectPaths, worktree, branch, allowBypass, permissionMode, model, effort, deferStart, helperOf, modelProvider, profileId }) => {
      const profile = profileId ? profileService().get(profileId) : undefined
      if (profile && (profile.agent !== agent || helperOf)) throw new Rejection('invalid-params', '智能体配置与会话不匹配')
      return conversations.create(agent, projectPaths, allowBypass, { permissionMode: profile?.capability === 'readOnly' ? agentDescriptor(agent).readOnlyMode : permissionMode,
        model: model ?? profile?.model ?? undefined, effort: effort ?? profile?.effort ?? undefined, worktree, branch, deferStart, helperOf,
        modelProvider: profile?.modelProvider ?? modelProvider, profile })
    },
    'conversations.chatCatalog': ({ agent, modelProvider }) => conversations.chatCatalog(agent, modelProvider),
    'conversations.translate': ({ id, text, to, model }) => translations.translate(conversations.get(id).agent, text, to, model, { kind: 'translation', conversationId: id, baseline: () => conversations.costBaseline(id) }, conversations.quickProvider(id)),
    'conversations.setAdditionalProjects': ({ id, projectPaths }) => conversations.setAdditionalProjects(id, projectPaths),
    'conversations.rename': ({ id, title }) => conversations.rename(id, title),
    'conversations.setPinned': ({ id, pinned }) => conversations.setPinned(id, pinned),
    'todos.list': ({ id }) => todosOf(id).list(id),
    'todos.open': () => {
      if (!todos) throw new Rejection('todos-unavailable')
      return todos.open()
    },
    'todos.add': ({ id, ...group }) => todosOf(id).add(id, group),
    'todos.check': ({ id, groupId, itemId, done }) => todosOf(id).check(id, groupId, itemId, done),
    'todos.edit': ({ id, groupId, itemId, text }) => todosOf(id).edit(id, groupId, itemId, text),
    'todos.remove': ({ id, groupId, itemId }) => todosOf(id).remove(id, groupId, itemId),
    'conversations.setArchived': ({ id, archived }) => conversations.setArchived(id, archived),
    'conversations.continue': ({ id, allowBypass }) => userActed(id, () => { profiles?.guardUser(id, true); squads?.guardUser(id, true); return conversations.continue(id, allowBypass) }),
    'conversations.handoff': ({ id, agent, note, stopRunning, allowBypass, permissionMode, model, effort }) => conversations.handoff(id, agent, note, stopRunning, allowBypass, { permissionMode, model, effort }),
    'conversations.fork': ({ id, stageId, itemId }) => conversations.fork(id, stageId, itemId),
    'conversations.setOption': async ({ id, option, value }) => { profiles?.guardUser(id, true); squads?.guardUser(id, true); await conversations.setOption(id, option, value); return OK },
    'conversations.send': ({ id, text, images, queue, steer, ref }) => userActed(id, async () => { profiles?.guardUser(id, true); squads?.guardUser(id, true); await conversations.send(id, text, images, queue, steer, ref); return OK }),
    'conversations.cancelQueued': ({ id, ref }) => { conversations.cancelQueued(id, ref); return OK },
    'conversations.sendQueued': ({ id, ref, now }) => userActed(id, async () => { await conversations.sendQueued(id, ref, now); return OK }),
    'conversations.setUsageLimitAutoContinue': ({ id, stageId, itemId, autoContinue }) => {
      limits.setAutoContinue(id, stageId, itemId, autoContinue)
      return OK
    },
    'conversations.retryUsageLimit': async ({ id, stageId, itemId }) => { await limits.retry(id, stageId, itemId); return OK },
    'conversations.retryTurn': async ({ id, stageId, itemId }) => { await conversations.retryTurn(id, stageId, itemId); return OK },
    'conversations.interrupt': async ({ id }) => {
      const child = conversations.get(id)
      if (child.agentCallId && child.parentConversationId) { await profiles?.cancel(child.parentConversationId, child.agentCallId); return OK }
      await profiles?.cancelForParent(id)
      const run = squads?.roster(id)
      if (run?.leaderConversationId === id && run.state === 'running') await squads?.control(run.id, 'stop')
      else await conversations.interrupt(id)
      return OK
    },
    'conversations.stopBackground': async ({ id, itemId }) => { await conversations.stopBackground(id, itemId); return OK },
    'conversations.respond': async ({ id, requestId, ...answer }) => { squads?.guardUser(id); conversations.attend(id); await conversations.respond(id, requestId, answer); return OK },
    // Read after subscribing, so an item that changes in between reaches the client either way.
    'conversations.watchChat': ({ id }, connection) => {
      connection.watching.add(id)
      return page(conversations.chatPage(id))
    },
    'conversations.unwatchChat': ({ id }, connection) => { connection.watching.delete(id); return OK },
    'conversations.chatItems': ({ id, before }) => page(conversations.chatPage(id, before)),
    // Any idle time will do: Infinity is past every agent's last activity.
    'conversations.releaseIdle': async () => ({ released: await conversations.releaseIdle(Infinity) }),
    'conversations.stop': ({ id }) => userActed(id, async () => {
      const child = conversations.get(id)
      if (child.agentCallId && child.parentConversationId) { await profiles?.cancel(child.parentConversationId, child.agentCallId); return conversations.get(id) }
      await profiles?.cancelForParent(id)
      const run = squads?.roster(id)
      if (run?.leaderConversationId === id && run.state === 'running') await squads?.control(run.id, 'stop')
      return conversations.stop(id)
    }),
    'conversations.delete': async ({ id }) => { profiles?.guardUser(id, true); await profiles?.cancelForParent(id); squads?.guardUser(id, true); await conversations.delete(id); return OK },
    'conversations.messages': ({ id }) => conversations.messages(id),
    'conversations.stages': ({ id }) => conversations.stages(id),
    'conversations.branches': ({ id }) => conversations.branches(id),
    'conversations.branchOptions': ({ id }) => conversations.branchOptions(id),
    'projects.branches': ({ path }) => conversations.projectBranchOptions(path),
    'conversations.switchBranch': async ({ id, project, ref }) => { await git.execute({ kind: 'conversation', id, project }, { kind: 'switch', ref }); return conversations.get(id) },
    'conversations.createBranch': async ({ id, project, name }) => { await git.execute({ kind: 'conversation', id, project }, { kind: 'create', name, ref: 'HEAD', checkout: true }); return conversations.get(id) },
    'conversations.commitPush': async ({ id, project, message }) => { const result = await git.execute({ kind: 'conversation', id, project }, { kind: 'commit', message, push: true }); return { commit: result.commit ?? '', branch: result.branch ?? '', upstream: result.upstream ?? '' } },
    'conversations.commit': async ({ id, project, message }) => { const result = await git.execute({ kind: 'conversation', id, project }, { kind: 'commit', message, push: false }); return { commit: result.commit ?? '', branch: result.branch ?? '' } },
    'conversations.push': async ({ id, project }) => { const result = await git.execute({ kind: 'conversation', id, project }, { kind: 'push' }); return { branch: result.branch ?? '', upstream: result.upstream ?? '' } },
    'conversations.search': ({ query }) => conversations.search(query),
    'conversations.changes': ({ id }) => conversations.changes(id),
    'conversations.diff': ({ id, project, file }) => conversations.diff(id, project, file),
    // The agent's side: its MCP server is launched for one conversation and names it here. The
    // token in core.json already grants everything, so this scopes correctness, not trust.
    'browser.tabs': ({ conversationId }) => browser.tabsOf(conversationId),
    'browser.open': ({ conversationId, url, viewport }) => browser.open(conversationId, url, viewport),
    'browser.navigate': ({ conversationId, tabId, to, viewport }) => browser.navigate(conversationId, tabId, to, viewport),
    'browser.setViewport': ({ conversationId, tabId, viewport }) => browser.setViewport(conversationId, tabId, viewport),
    'browser.snapshot': ({ conversationId, tabId }) => browser.snapshot(conversationId, tabId),
    'browser.screenshot': ({ conversationId, tabId, ...options }) => browser.screenshot(conversationId, tabId, options),
    'browser.click': ({ conversationId, tabId, ...params }) => browser.click(conversationId, tabId, params),
    'browser.type': ({ conversationId, tabId, ...params }) => browser.type(conversationId, tabId, params),
    'browser.press': ({ conversationId, tabId, ...params }) => browser.press(conversationId, tabId, params),
    'browser.hover': ({ conversationId, tabId, ...params }) => browser.hover(conversationId, tabId, params),
    'browser.scroll': ({ conversationId, tabId, ...params }) => browser.scroll(conversationId, tabId, params),
    'browser.select': ({ conversationId, tabId, ...params }) => browser.select(conversationId, tabId, params),
    'browser.wait': ({ conversationId, tabId, ...params }) => browser.wait(conversationId, tabId, params),
    'browser.console': ({ conversationId, tabId, sinceNavigation }) => browser.console(conversationId, tabId, sinceNavigation ?? false),
    'browser.close': async ({ conversationId, tabId }) => {
      await browser.close(conversationId, tabId)
      return OK
    },
    // The user's side.
    'browser.status': () => browser.status(),
    'browser.watch': ({ conversationId }, connection) => browser.watch(connection, conversationId),
    'browser.unwatch': ({ conversationId }, connection) => {
      browser.unwatch(connection, conversationId)
      return OK
    },
    'browser.watchAll': (_params, connection) => browser.watchAll(connection),
    'browser.unwatchAll': (_params, connection) => {
      browser.unwatchAll(connection)
      return OK
    },
    'browser.userNavigate': ({ tabId, to }, connection) => browser.userNavigate(connection, tabId, to),
    'browser.userViewport': ({ tabId, viewport }, connection) => browser.userViewport(connection, tabId, viewport),
    'browser.newTab': ({ conversationId, url }, connection) => browser.newTab(connection, conversationId ?? null, url),
    'browser.closeTab': async ({ tabId }, connection) => {
      await browser.closeTab(connection, tabId)
      return OK
    },
    'browser.handBack': ({ tabId }, connection) => {
      browser.handBack(connection, tabId)
      return OK
    },
    'browser.userScreenshot': ({ tabId }, connection) => browser.userScreenshot(connection, tabId),
    'attachments.begin': ({ size }, connection) => ({ uploadId: attachments.uploads.begin(connection, size) }),
    'attachments.append': ({ uploadId, offset, data }, connection) => {
      attachments.uploads.append(connection, uploadId, offset, data)
      return OK
    },
    'attachments.commit': ({ uploadId }, connection) => attachments.uploads.commit(connection, uploadId),
    'attachments.stat': async ({ id }) => {
      const info = await attachments.store.info(id)
      if (!info) {
        throw new Rejection('attachment-not-found', `no image ${id}`)
      }
      return info
    },
    'attachments.read': async ({ id, offset, length }) => ({
      data: Buffer.from(await attachments.store.read(id, offset, length)).toString('base64')
    }),
    'ports.list': () => ports.list(),
    'ports.stop': async (ref) => { await ports.stop(ref); return OK },
    'terminals.list': () => terminals.list(),
    'terminals.open': ({ cwd, colorPrompt }) => terminals.open(cwd, colorPrompt),
    'terminals.run': ({ conversationId, command, cwd }) => {
      if (conversations.get(conversationId).workspaceReadOnly) throw new Rejection('read-only-workspace')
      return agentTerminals.run(conversationId, command, cwd)
    },
    'terminals.read': ({ conversationId, id, tail }) => terminals.read(conversationId, id, tail),
    'terminals.stop': async ({ conversationId, id }) => {
      await terminals.stop(conversationId, id)
      return OK
    },
    'terminals.close': async ({ id }) => {
      await terminals.kill(id)
      return OK
    },
    'terminalCommands.list': () => terminalCommands.list(),
    'terminalCommands.save': (params) => terminalCommands.save(params),
    'terminalCommands.delete': ({ id }) => {
      terminalCommands.delete(id)
      return OK
    },
    'chatCommands.list': () => chatCommands.list(),
    'chatCommands.save': (params) => chatCommands.save(params),
    'chatCommands.delete': ({ id }) => {
      chatCommands.delete(id)
      return OK
    },
    'sessions.attach': async ({ sessionId, fromOffset }, connection) => {
      connection.attached.add(sessionId)
      try {
        const { buffer, bufferStart, endOffset, exited, io } = await sessions.request('attach', { sessionId })
        // An agent's output is JSON for core, not a terminal to draw; keystrokes would reach its stdin.
        if (io === 'pipe') throw new Rejection('chat-session', 'this session runs in chat mode')
        const start = Math.max(bufferStart, Math.min(fromOffset ?? bufferStart, endOffset))
        return { buffer: buffer.slice(start - bufferStart), bufferStart: start, endOffset, exited }
      } catch (error) {
        connection.attached.delete(sessionId)
        throw error
      }
    },
    'sessions.detach': ({ sessionId }, connection) => {
      connection.attached.delete(sessionId)
      return OK
    },
    // Keystrokes go to the terminal panel's shells only: anything else the daemon runs is an agent
    // or the browser, reading JSON on its stdin.
    'sessions.write': async ({ sessionId, data }) => {
      if (!terminals.owns(sessionId)) throw new Rejection('chat-session', 'this session runs in chat mode')
      await sessions.request('write', { sessionId, data })
      return OK
    },
    'sessions.resize': async ({ sessionId, cols, rows }) => {
      if (!terminals.owns(sessionId)) return OK
      await sessions.request('resize', { sessionId, cols, rows })
      return OK
    },
    'projects.recent': () => projects.recent(),
    'worktrees.list': () => worktrees.list(),
    'worktrees.clean': ({ paths }) => worktrees.clean(paths),
    'projects.findFile': ({ roots, path }) => findFiles(roots, path),
    'projects.searchFiles': ({ roots, query }) => searchFiles(roots, query),
    'projects.forget': ({ path }) => {
      projects.forget(path)
      return OK
    },
    'projects.config': ({ path }) => requireProjectConfigs().info(path),
    'projects.writeConfig': ({ path, config }) => requireProjectConfigs().write(path, config),
    'projects.suggestConfig': ({ path }) => suggestForProject(path),
    'projects.trustConfig': async ({ path, hash }) => {
      await requireProjectConfigs().trust(path, hash)
      return OK
    },
    'repos.recent': () => projects.recent(),
    'repos.forget': ({ path }) => {
      projects.forget(path)
      return OK
    },
    'usage.list': ({ windowKinds }, connection) => readableUsage(connection.usageKinds, windowKinds, usage.list()),
    'usage.refresh': async ({ windowKinds }, connection) => readableUsage(connection.usageKinds, windowKinds, await usage.requestRefresh()),
    'usage.history': (filter) => { if (!analytics) throw new Rejection('usage-unavailable'); return analytics.history(filter) },
    'usage.scan': async () => { if (!analytics) throw new Rejection('usage-unavailable'); await analytics.scan(); return analytics.status() },
    'usage.forecasts': () => analytics?.forecasts(usage.list()) ?? [],
    'usage.automation': () => automation?.state() ?? { policies: [], recent: [] },
    'usage.configureAutomation': (policy) => { if (!automation) throw new Rejection('usage-unavailable'); return automation.configure(policy) },
    'usage.retryReset': async ({ id }) => { if (!automation) throw new Rejection('usage-unavailable'); return automation.retry(id) },
    'usage.useResetCredit': async ({ agent, account, requestId, creditId }) => ({ outcome: automation
      ? await automation.manual(agent, account ?? 'default', requestId, creditId) : await usage.useResetCredit(agent, requestId, creditId, account) }),
    'agents.stats': () => runs.stats(),
    'agents.conversationStats': () => turns.stats(),
    'dashboard.stats': ({ includeSmallModels, ...params }) => {
      const options = { ...params, now: Date.now() }
      const since = dashboardSince(options)
      return summarizeDashboard(runs.endedSince(since), turns.endedSince(since), options, includeSmallModels ? smallModels?.statsSince(since) : undefined)
    },
    'schedules.list': () => schedules.list(),
    'schedules.create': ({ target, notBefore }) => schedules.create(target, notBefore),
    'schedules.update': ({ id, notBefore, text }) => schedules.update(id, { notBefore, text }),
    'schedules.reorder': ({ ids }) => { schedules.reorder(ids); return OK },
    'schedules.cancel': ({ id }) => schedules.cancel(id),
    'schedules.runNow': ({ id }) => schedules.runNow(id),
    'schedules.clear': () => { schedules.clear(); return OK },
    'routines.list': () => routines.list(),
    'routines.create': (fields) => routines.create(fields),
    'routines.update': ({ id, ...patch }) => routines.update(id, patch),
    'routines.delete': ({ id }) => { routines.delete(id); return OK },
    'routines.runNow': ({ id }) => routines.runNow(id),
    'routines.runs': ({ routineId, before, limit }) => routines.runs(routineId, before ?? null, limit),
    'routines.markSeen': ({ runId }) => { routines.markSeen(runId); return OK },
    'routines.markAllSeen': ({ routineId }) => { routines.markAllSeen(routineId); return OK },
    'discussions.list': () => discussions.list(),
    'discussions.get': ({ id }) => discussions.get(id),
    'discussions.create': (fields) => discussions.create(fields),
    'discussions.posts': ({ id }) => discussions.posts(id),
    'discussions.post': ({ id, text, mentions }) => discussions.post(id, text, mentions),
    'discussions.newTopic': ({ id, text }) => discussions.newTopic(id, text),
    'discussions.control': ({ id, action }) => discussions.control(id, action),
    'discussions.rename': ({ id, title }) => discussions.rename(id, title),
    'discussions.addMember': ({ id, member }) => discussions.addMember(id, member),
    'discussions.removeMember': ({ id, memberId }) => discussions.removeMember(id, memberId),
    'discussions.setProjects': ({ id, projectPaths }) => discussions.setProjects(id, projectPaths),
    'discussions.setPinned': ({ id, pinned }) => discussions.setPinned(id, pinned),
    'discussions.setArchived': ({ id, archived }) => discussions.setArchived(id, archived),
    'discussions.delete': async ({ id }) => { await discussions.delete(id); return OK },
    'sources.list': () => sources.list(),
    'sources.saveSettings': (params) => sources.saveSettings(params),
    'sources.login': ({ provider, instance, flowId }, connection) => ({
      flowId: sources.login(connection, provider, instance, flowId)
    }),
    'sources.answer': ({ flowId, promptId, value }, connection) => {
      sources.answer(connection, flowId, promptId, value)
      return OK
    },
    'sources.cancelLogin': ({ flowId }, connection) => {
      sources.cancelLogin(connection, flowId)
      return OK
    },
    'sources.disconnect': async ({ provider, instance }) => {
      await sources.disconnect(provider, instance)
      return OK
    },
    'sources.inbox': () => sources.inboxes(),
    'sources.refresh': ({ provider, instance }) => sources.refresh(provider, instance),
    'sources.import': ({ provider, instance, key, agent }) => sources.import(provider, instance, key, agent ?? null),
    'sources.investigate': ({ provider, instance, key, ...options }) => sources.investigate(provider, instance, key, options),
    'sources.dismiss': ({ provider, instance, key }) => sources.dismiss(provider, instance, key),
    'sources.restore': ({ provider, instance, key }) => sources.restore(provider, instance, key),
    'sources.resync': ({ taskId }) => sources.resync(taskId)
  }
}
