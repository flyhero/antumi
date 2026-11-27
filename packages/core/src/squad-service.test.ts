import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentProfile, agentDescriptor, type Squad, type SquadRun, type SquadWork } from '@antumi/protocol'
import { CredentialStore } from './credential-store'
import { ModelProviderStore } from './model-providers'
import { AttachmentStore } from './attachment-store'
import { ConversationService } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { ProjectRegistry } from './project-registry'
import { SquadService } from './squad-service'
import { SquadStore } from './squad-store'
import { TaskService } from './task-service'
import { TaskStore } from './task-store'

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
describe('squad execution', () => {
  let root: string
  let tasks: TaskStore
  let chatsStore: ConversationStore
  let projects: ProjectRegistry
  let daemon: ReturnType<typeof fakeChatDaemon>
  let chats: ConversationService
  let service: TaskService
  let squads: SquadService
  let store: SquadStore
  let squad: Squad
  let taskId: string
  const changed: SquadRun[] = []
  const complete = (sessionId: string, text = 'implemented and verified', failed = false) => {
    daemon.emit(sessionId, { type: 'assistant', uuid: `a-${sessionId}-${daemon.writes.length}`, message: { id: `m-${sessionId}-${daemon.writes.length}`, content: [{ type: 'text', text }] }, parent_tool_use_id: null })
    daemon.emit(sessionId, { type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, result: text, terminal_reason: failed ? 'error' : 'completed', duration_ms: 5 })
  }
  const waitFor = async (check: () => boolean) => { await expect.poll(check, { timeout: 5000 }).toBe(true) }
  const current = () => squads.runs(taskId)[0]!
  const leaderId = () => service.get(taskId).conversationId!
  const workSession = (work: SquadWork) => chats.get(work.conversationId!).sessionId!
  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-squad-')))
    const db = path.join(root, 'antumi.db')
    tasks = new TaskStore(db); chatsStore = new ConversationStore(db); projects = new ProjectRegistry(db)
    daemon = fakeChatDaemon()
    daemon.reply = () => {}
    const attachments = new AttachmentStore(path.join(root, 'attachments'))
    chats = new ConversationService(chatsStore, daemon, path.join(root, 'sessions'), (event) => {
      if (event.type === 'changed') { service.chatChanged(event.conversation); squads.conversationChanged(event.conversation) }
      else if (event.type === 'chatItems') squads.observe(event.conversationId, event.items)
      else if (event.type === 'planApproved') service.recordPlan(event.taskId, event.plan)
    }, projects, attachments)
    service = new TaskService(tasks, projects, path.join(root, 'worktrees'), () => {}, attachments, chats)
    store = new SquadStore(db)
    squads = new SquadService(store, service, chats, { squad: () => {}, run: (run) => changed.push(run) })
    service.setSquads(squads); chats.setSquadGuard((conversation) => squads.guardMember(conversation))
    chats.setCapacity({ maxConcurrentAgents: 20, agentConcurrency: { claude: 6 } }, () => squads.tick())
    daemon.deliver = (event) => {
      if (event.event === 'data') chats.handleData(event)
      else if (event.event === 'exit') chats.handleExit(event.sessionId, event.exitCode)
      else chats.handleStderr(event.sessionId, event.data)
    }
    const repo = path.join(root, 'project'); mkdirSync(repo)
    squad = squads.create({ name: 'Delivery', leaderId: id(1), instructions: 'Review before submitting.', members: [
      { id: id(1), name: 'Lead', agent: 'claude', capability: 'readOnly', role: 'coordinate' },
      { id: id(2), name: 'Build', agent: 'claude', capability: 'develop', role: 'implement' },
      { id: id(3), name: 'Second build', agent: 'claude', capability: 'develop', role: 'test' },
      { id: id(4), name: 'Review', agent: 'claude', capability: 'readOnly', role: 'review' }
    ] })
    taskId = service.create({ title: 'Feature', details: 'Acceptance criteria', repos: [repo], squadId: squad.id }).id
    changed.length = 0
  })
  afterEach(async () => {
    await squads.close(); projects.close(); chatsStore.close(); tasks.close()
    rmSync(root, { recursive: true, force: true })
  })
  async function start() { await service.start(taskId); return current() }
  async function dispatch(memberId: string, capability: SquadWork['capability'] = 'develop') {
    return squads.dispatch(leaderId(), memberId, 'Do this part and report validation', capability)
  }
  async function releaseLeader() { complete(chats.get(leaderId()).sessionId!, 'delegated'); await waitFor(() => current().works.some((work) => work.state === 'running')) }

  const withAgent = (memberId: string, agent: Squad['members'][number]['agent']) => ({
    ...squad, members: squad.members.map((member) => member.id === memberId ? { ...member, agent } : member)
  })

  it.each([[id(1), 'gemini'], [id(4), 'kimi']] as const)('refuses unsupported read-only members on create and update', (memberId, agent) => {
    const fields = withAgent(memberId, agent)
    const error = expect.objectContaining({ reason: 'squad-read-only-unsupported', message: expect.stringContaining(agentDescriptor(agent).label) })
    expect(() => squads.create(fields)).toThrow(error)
    expect(() => squads.update(squad.id, fields)).toThrow(error)
    expect(squads.list()).toEqual([squad])
  })

  it('allows Antigravity as squad leader, read-only member, or developer', () => {
    const antiLead = squads.create({ ...squad, name: 'Anti Lead', members: squad.members.map((member) =>
      member.id === id(1) || member.id === id(4) ? { ...member, agent: 'antigravity' } : member) })
    expect(antiLead.members[0]).toMatchObject({ agent: 'antigravity', capability: 'readOnly' })
    expect(antiLead.members[3]).toMatchObject({ agent: 'antigravity', capability: 'readOnly' })
  })

  it('validates the squad leader against readOnlyMode rather than developers permissionMode when starting', async () => {
    const validated: Array<{ agent: string; permissionMode?: string }> = []
    const original = chats.validateStartOptions.bind(chats)
    chats.validateStartOptions = async (agent, options, providerId) => {
      validated.push({ agent, permissionMode: options.permissionMode })
      return original(agent, options, providerId)
    }
    try {
      await squads.start(taskId, true, { permissionMode: 'bypass' })
      expect(validated.filter((entry) => entry.agent === 'claude').map((entry) => entry.permissionMode)).toEqual([
        'ask', 'bypass', 'bypass', 'ask', 'ask'
      ])
    } finally { chats.validateStartOptions = original }
  })

  it('allows Gemini as a developer and refuses to dispatch or retry read-only work on unsupported agents', async () => {
    const developer = squads.create(withAgent(id(2), 'gemini'))
    expect(developer.members[1]).toMatchObject({ agent: 'gemini', capability: 'develop' })
    const run = await start()
    store.saveRun({ ...run, squad: { ...developer, members: developer.members.map((member) => member.id === id(4) ? { ...member, agent: 'kimi' } : member) } })
    await expect(dispatch(id(2), 'readOnly')).rejects.toMatchObject({
      reason: 'squad-read-only-unsupported', message: expect.stringContaining('或选择开发测试')
    })
    await expect(dispatch(id(4), 'readOnly')).rejects.toMatchObject({
      reason: 'squad-read-only-unsupported', message: expect.not.stringContaining('或选择开发测试')
    })
    expect(current().works).toEqual([])
    const failedWork: SquadWork = {
      id: id(9), memberId: id(4), instruction: 'Inspect', capability: 'readOnly',
      conversationId: null, state: 'failed', result: null, error: 'unsupported', delivered: true, createdAt: 0, updatedAt: 0
    }
    store.patchRun(run.id, { works: [failedWork] })
    await expect(squads.retry(run.id, failedWork.id)).rejects.toMatchObject({ reason: 'squad-read-only-unsupported' })
    expect(current().works).toEqual([failedWork])
  })

  it('checks the linked profile instead of the saved agent when validating a read-only member', () => {
    const profile = AgentProfile.parse({ id: id(5), name: 'Linked', agent: 'gemini', capability: 'develop', createdAt: 0, updatedAt: 0, archivedAt: null })
    squads.setProfiles(() => profile)
    const link = (memberId: string) => ({ ...squad, members: squad.members.map((member) =>
      member.id === memberId ? { ...member, profileId: profile.id } : member) })
    expect(() => squads.create(link(id(1)))).toThrow(expect.objectContaining({ reason: 'squad-read-only-unsupported' }))
    expect(() => squads.update(squad.id, link(id(4)))).toThrow(expect.objectContaining({ reason: 'squad-read-only-unsupported' }))
    expect(squads.create(link(id(2))).members[1]?.profileId).toBe(profile.id)
  })

  it.each([[id(1), '队长「Lead」'], [id(4), '只读成员「Review」']] as const)('loads a legacy roster and blocks both launch paths before changing the task', async (memberId, role) => {
    const legacy = store.update(squad.id, withAgent(memberId, 'gemini'))
    expect(squads.list()).toEqual([legacy])
    const pending = service.get(taskId)
    for (const planFirst of [false, true]) {
      await expect(squads.start(taskId, false, {}, legacy.id, undefined, planFirst)).rejects.toMatchObject({
        reason: 'squad-read-only-unsupported', message: expect.stringContaining(role)
      })
      expect(squads.runs(taskId)).toEqual([])
      expect(service.get(taskId)).toEqual(pending)
      expect(daemon.spawns).toEqual([])
    }
  })

  it('loads a legacy run and refuses to resume its unsupported lead', async () => {
    const run = await start()
    await squads.control(run.id, 'stop')
    const paused = store.patchRun(run.id, { state: 'paused' })
    const legacy = store.saveRun({ ...paused, squad: withAgent(id(1), 'gemini') })
    expect(squads.runs(taskId)).toEqual([legacy])
    const spawnCount = daemon.spawns.length
    await expect(squads.resume(taskId)).rejects.toMatchObject({ reason: 'squad-read-only-unsupported' })
    expect(current()).toEqual(legacy)
    expect(daemon.spawns).toHaveLength(spawnCount)
  })

  it('runs both a custom team leader and its member on their configured provider', async () => {
    const credentials = new CredentialStore(path.join(root, 'credentials.json'))
    await credentials.load()
    const providers = new ModelProviderStore(path.join(root, 'model-providers.json'), credentials)
    await providers.load()
    chats.setModelProviders(providers)
    const provider = await providers.save({
      id: null, name: 'Team gateway', preset: 'custom', agents: ['claude'], apiKey: 'team-key',
      anthropic: { baseUrl: 'http://127.0.0.1:4000', auth: 'auth_token', env: {} }, openai: null,
      models: [{ id: 'team-model', label: null, contextWindow: null, maxOutput: null, efforts: [] }],
      defaultModel: 'team-model', smallModel: 'team-model'
    })
    squad = squads.update(squad.id, { ...squad, members: squad.members.map((member) => ({ ...member, modelProvider: provider.id, model: 'team-model' })) })
    await start()
    expect(chats.get(leaderId()).modelProvider).toBe(provider.id)
    await dispatch(id(2))
    await releaseLeader()
    const member = current().works[0]!
    expect(chats.get(member.conversationId!).modelProvider).toBe(provider.id)
    expect(daemon.spawns.every((spawn) => spawn.env?.ANTHROPIC_AUTH_TOKEN === 'team-key')).toBe(true)
    expect(daemon.spawns.every((spawn) => spawn.args.includes('team-model'))).toBe(true)
  })

  it('launches a read-only coordinator, binds MCP scope before first dispatch and freezes the roster', async () => {
    const run = await start()
    expect(chats.get(leaderId())).toMatchObject({ taskId, workspaceReadOnly: true, planOnly: false })
    expect(squads.roster(leaderId())?.leaderConversationId).toBe(leaderId())
    expect(daemon.spawns[0]?.args).toContain('--disallowedTools')
    // Read-only, yet not in plan mode, where Claude would propose a plan instead of handing work out.
    const args = daemon.spawns[0]?.args ?? []
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('manual')
    expect(daemon.spawns[0]?.args).not.toContain('--allow-dangerously-skip-permissions')
    await expect(chats.setOption(leaderId(), 'permissionMode', 'acceptEdits')).rejects.toMatchObject({ reason: 'squad-managed' })
    await expect(chats.setOption(leaderId(), 'model', 'haiku')).rejects.toMatchObject({ reason: 'squad-managed' })
    squads.update(squad.id, { ...squad, name: 'Changed', members: squad.members.map((member) => ({ ...member, role: 'new role' })) })
    expect(current().squad.name).toBe(run.squad.name)
    expect(current().squad.members[1]?.role).toBe('implement')
    expect(service.get(taskId).status).toBe('running')
  })

  it('serializes developers, runs analysis in parallel and reports each result once', async () => {
    await start()
    const first = await dispatch(id(2)); const second = await dispatch(id(3)); const review = await dispatch(id(4), 'readOnly')
    await releaseLeader()
    await waitFor(() => current().works.filter((work) => work.state === 'running').length === 2)
    expect(current().works.find((work) => work.id === second.id)?.state).toBe('queued')
    const runningFirst = current().works.find((work) => work.id === first.id)!
    const runningReview = current().works.find((work) => work.id === review.id)!
    expect(chats.get(runningReview.conversationId!).workspaceReadOnly).toBe(true)
    expect(chats.list()).toEqual([])
    expect(chats.list(true)).toHaveLength(1)
    expect(chats.list(true, true)).toHaveLength(3)
    complete(workSession(runningFirst)); complete(workSession(runningReview), 'reviewed')
    await waitFor(() => current().works.filter((work) => work.delivered).length === 2)
    expect(current().works.find((work) => work.id === second.id)?.state).toBe('queued')
    await releaseLeader()
    await waitFor(() => current().works.find((work) => work.id === second.id)?.state === 'running')
    expect(chats.get(runningFirst.conversationId!).sessionId).toBeNull()
    await squads.reconcile()
    expect(chats.messages(leaderId()).filter((message) => message.role === 'user' && message.text.includes('成员工作结果'))).toHaveLength(1)
  })

  it('releases the coordinator slot and advances with a capacity of one', async () => {
    chats.setCapacity({ maxConcurrentAgents: 1, agentConcurrency: { claude: 1 } }, () => squads.tick())
    await start(); const work = await dispatch(id(2)); await releaseLeader()
    expect(chats.get(leaderId()).sessionId).toBeNull()
    expect((await service.inUse()).has(taskId)).toBe(true)
    await expect(service.releaseAgent(taskId)).rejects.toMatchObject({ reason: 'worktree-in-use' })
    complete(workSession(current().works.find((each) => each.id === work.id)!))
    await waitFor(() => current().works[0]?.delivered === true)
    expect(chats.get(leaderId()).chat?.turn).toBe('running')
    expect(chats.get(current().works[0]!.conversationId!).sessionId).toBeNull()
  })

  it('never treats a failed worker as success and retries in a fresh work record', async () => {
    await start(); await dispatch(id(2)); await releaseLeader()
    daemon.exit(workSession(current().works[0]!), 1)
    await waitFor(() => current().works[0]?.state === 'failed')
    await waitFor(() => current().works[0]?.delivered === true)
    await expect(squads.finish(leaderId(), 'Done')).rejects.toMatchObject({ reason: 'squad-work-unfinished' })
    const retry = await squads.retry(current().id, current().works[0]!.id)
    expect(retry.works).toHaveLength(2)
    expect(retry.works[0]?.state).toBe('cancelled')
    expect(retry.works[1]).toMatchObject({ state: 'queued', conversationId: null, delivered: false })
    expect(retry.works[0]?.id).not.toBe(retry.works[1]?.id)
  })

  it('moves to review only after explicit submission and a successful leader turn', async () => {
    await start()
    complete(chats.get(leaderId()).sessionId!, 'thinking')
    await squads.reconcile()
    expect(service.get(taskId).status).toBe('running')
    await chats.send(leaderId(), 'Submit after verification')
    await squads.finish(leaderId(), 'Implemented; tests passed')
    expect(service.get(taskId).status).toBe('running')
    complete(chats.get(leaderId()).sessionId!, 'submitted')
    await waitFor(() => service.get(taskId).status === 'review')
    expect(current()).toMatchObject({ state: 'review', summary: 'Implemented; tests passed' })
    expect(service.get(taskId).status).not.toBe('done')
  })

  it('pauses rather than submitting when the leader fails after asking to finish', async () => {
    await start(); await squads.finish(leaderId(), 'Done')
    daemon.exit(chats.get(leaderId()).sessionId!, 1)
    await waitFor(() => current().state === 'paused')
    expect(service.get(taskId).status).toBe('running')
  })

  it('stops members and the queue, blocks reopening a retired member and resumes on the snapshot', async () => {
    await start(); await dispatch(id(2)); await dispatch(id(3)); await releaseLeader()
    const memberConversationId = current().works[0]!.conversationId!
    await squads.control(current().id, 'stop')
    expect(current().state).toBe('paused')
    expect(current().works.every((work) => work.state === 'cancelled')).toBe(true)
    expect(chats.get(memberConversationId).sessionId).toBeNull()
    await expect(chats.continue(memberConversationId)).rejects.toMatchObject({ reason: 'squad-managed' })
    squads.archive(squad.id, true)
    await squads.control(current().id, 'resume')
    expect(current().state).toBe('running')
    expect(chats.get(leaderId()).workspaceReadOnly).toBe(true)
  })

  it('rejects dispatch by members, developer work by readers and execution with unfinished dependencies', async () => {
    await start()
    await expect(dispatch(id(4))).rejects.toMatchObject({ reason: 'squad-member-invalid' })
    await dispatch(id(2)); await releaseLeader()
    await expect(squads.dispatch(current().works[0]!.conversationId!, id(3), 'bypass leader', 'develop')).rejects.toMatchObject({ reason: 'squad-not-leader' })
    await service.cancel(taskId, undefined)
    const dependency = service.create({ title: 'Dependency' })
    const task = service.create({ title: 'Blocked', repos: service.get(taskId).repos.map((repo) => repo.path), dependsOn: [dependency.id], squadId: squad.id })
    await expect(service.start(task.id)).rejects.toMatchObject({ reason: 'dependencies-unfinished' })
  })

  it('keeps independent worktrees for multiple repositories and shares them with the member', async () => {
    const repoPaths = ['api', 'web'].map((name) => {
      const repo = path.join(root, name); mkdirSync(repo); writeFileSync(path.join(repo, 'README.md'), name)
      execFileSync('git', ['init', '-q', repo]); execFileSync('git', ['-C', repo, 'add', 'README.md'])
      execFileSync('git', ['-C', repo, '-c', 'user.name=test', '-c', 'user.email=test@test', 'commit', '-qm', 'initial'])
      return repo
    })
    service.update({ id: taskId, repos: repoPaths })
    await start(); await dispatch(id(2)); await releaseLeader()
    const task = service.get(taskId)
    expect(task.repos.every((repo) => repo.worktreePath && repo.worktreePath !== repo.path)).toBe(true)
    expect(new Set(task.repos.map((repo) => repo.worktreePath)).size).toBe(2)
    expect(chats.get(current().works[0]!.conversationId!).projectPaths).toEqual(task.repos.map((repo) => repo.worktreePath))
  })

  it('transfers a waiting plan without authorizing the original planner to execute', async () => {
    service.update({ id: taskId, squadId: null, agent: 'claude' })
    await service.start(taskId)
    const conversationId = leaderId()
    const session = chats.get(conversationId).sessionId!
    daemon.emit(session, { type: 'control_request', request_id: 'plan-transfer', request: {
      subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: '# Accepted implementation' }, tool_use_id: 'plan-tool'
    } })
    await waitFor(() => chats.get(conversationId).chat?.turn === 'awaiting')
    const item = chats.chatPage(conversationId).items.find((entry) => entry.kind === 'approval' && entry.requestId === 'plan-transfer')!
    const started = await squads.start(taskId, false, { permissionMode: 'ask' }, squad.id, { stageId: item.stageId, requestId: 'plan-transfer' })
    expect(started.plan).toMatchObject({ approved: true, markdown: '# Accepted implementation' })
    expect(started.conversationId).toBe(conversationId)
    expect(chats.get(conversationId).workspaceReadOnly).toBe(true)
    expect(daemon.killed.some((entry) => entry.sessionId === session)).toBe(true)
    expect(daemon.written(session).filter((frame) => JSON.stringify(frame).includes('"behavior":"allow"'))).toEqual([])
  })

  it('has the leader plan with the user first, then lead on from that same planning', async () => {
    const planned = await squads.start(taskId, false, { permissionMode: 'acceptEdits' }, squad.id, undefined, true)
    expect(planned).toMatchObject({ status: 'pending', squadId: squad.id, agent: 'claude', launch: { permissionMode: 'acceptEdits' } })
    expect(squads.runs(taskId)).toEqual([])
    const conversationId = leaderId()
    expect(chats.get(conversationId)).toMatchObject({ planOnly: true, agent: 'claude' })
    // No run yet: the planning leader has no squad tools to hand work out with.
    expect(squads.roster(conversationId)).toBeNull()
    const planning = chats.get(conversationId).sessionId!
    const brief = JSON.stringify(daemon.written(planning))
    expect(brief).toContain('你是队长')
    expect(brief).toContain('Second build')
    const planningArgs = daemon.spawns.at(-1)!.args
    const providerSession = planningArgs[planningArgs.indexOf('--session-id') + 1]
    daemon.emit(planning, { type: 'assistant', uuid: 'a-plan', message: { id: 'm-plan', content: [{ type: 'text', text: 'Read the code; here is the split.' }] }, parent_tool_use_id: null })
    daemon.emit(planning, { type: 'control_request', request_id: 'leader-plan', request: {
      subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: '# Build does it, Review checks it' }, tool_use_id: 'plan-tool'
    } })
    await waitFor(() => chats.get(conversationId).chat?.turn === 'awaiting')
    expect(service.get(taskId).awaitingInput).toBe(true)
    const item = chats.chatPage(conversationId).items.find((entry) => entry.kind === 'approval' && entry.requestId === 'leader-plan')!
    const started = await squads.start(taskId, false, { permissionMode: 'acceptEdits' }, squad.id, { stageId: item.stageId, requestId: 'leader-plan' })
    expect(started).toMatchObject({ status: 'running', conversationId, plan: { approved: true, markdown: '# Build does it, Review checks it' } })
    expect(current()).toMatchObject({ state: 'running', leaderConversationId: conversationId, permissionMode: 'acceptEdits' })
    expect(chats.get(conversationId)).toMatchObject({ workspaceReadOnly: true, planOnly: false, chatOptions: { permissionMode: agentDescriptor('claude').readOnlyMode } })
    // The leader goes on from its own planning session rather than a fresh one.
    const leading = daemon.spawns.at(-1)!.args
    expect(leading.slice(leading.indexOf('--resume'), leading.indexOf('--resume') + 2)).toEqual(['--resume', providerSession])
    await waitFor(() => JSON.stringify(daemon.written(chats.get(conversationId).sessionId!)).includes('只负责协调'))
    expect(daemon.written(planning).filter((frame) => JSON.stringify(frame).includes('"behavior":"allow"'))).toEqual([])
  })

  it('hands a leader that moves into the worktree its planning together with its brief', async () => {
    const repo = path.join(root, 'git-project')
    execFileSync('git', ['init', '-q', '-b', 'main', repo])
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'])
    taskId = service.create({ title: 'Moved', details: 'Acceptance criteria', repos: [repo], squadId: squad.id }).id
    await squads.start(taskId, false, { permissionMode: 'ask' }, squad.id, undefined, true)
    const conversationId = leaderId()
    const planning = chats.get(conversationId).sessionId!
    daemon.emit(planning, { type: 'assistant', uuid: 'a-moved', message: { id: 'm-moved', content: [{ type: 'text', text: 'Split: Build, then Review.' }] }, parent_tool_use_id: null })
    daemon.emit(planning, { type: 'control_request', request_id: 'moved-plan', request: {
      subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: '# Build, then Review' }, tool_use_id: 'plan-tool'
    } })
    await waitFor(() => chats.get(conversationId).chat?.turn === 'awaiting')
    const item = chats.chatPage(conversationId).items.find((entry) => entry.kind === 'approval' && entry.requestId === 'moved-plan')!
    await squads.start(taskId, false, { permissionMode: 'ask' }, squad.id, { stageId: item.stageId, requestId: 'moved-plan' })
    expect(current().state).toBe('running')
    const leading = chats.get(conversationId).sessionId!
    expect(chats.get(conversationId).workspacePath).not.toBe(realpathSync(repo))
    // One turn: the handoff of its planning, with the brief in it, so it leads rather than plans again.
    const sent = daemon.written(leading).filter((frame) => JSON.stringify(frame).includes('"type":"user"'))
    expect(sent).toHaveLength(1)
    expect(JSON.stringify(sent[0])).toContain('handoffs')
    expect(JSON.stringify(sent[0])).toContain('只负责协调')
  })

  it('picks a stopped planning leader up again as planning, not as a squad run', async () => {
    await squads.start(taskId, false, { permissionMode: 'ask' }, squad.id, undefined, true)
    const conversationId = leaderId()
    await chats.stop(conversationId)
    const resumed = await service.resumeChat(taskId)
    expect(resumed.status).toBe('pending')
    expect(chats.get(conversationId)).toMatchObject({ planOnly: true, workspaceReadOnly: false })
    expect(squads.runs(taskId)).toEqual([])
  })

  it('coordinates a Codex developer from a Claude leader through their native protocols', async () => {
    squads.update(squad.id, { ...squad, members: squad.members.map((member) => member.id === id(2) ? { ...member, agent: 'codex' } : member) })
    await start(); await dispatch(id(2))
    const sessionId = `pipe-${daemon.spawns.length + 1}`
    const asked = (method: string) => daemon.written(sessionId).some((frame) => JSON.stringify(frame).includes(`"method":"${method}"`))
    complete(chats.get(leaderId()).sessionId!, 'delegated to Codex')
    await waitFor(() => asked('initialize'))
    daemon.emit(sessionId, { id: 'antumi-init', result: {} })
    await waitFor(() => asked('thread/start'))
    daemon.emit(sessionId, { id: 'antumi-thread', result: { thread: { id: 'codex-thread' } } })
    await waitFor(() => current().works[0]?.state === 'running')
    await waitFor(() => asked('turn/start'))
    const frame = daemon.written(sessionId).find((entry) => typeof entry === 'object' && entry !== null && Reflect.get(entry, 'method') === 'turn/start')
    if (typeof frame !== 'object' || frame === null) throw new Error('missing turn request')
    daemon.emit(sessionId, { id: Reflect.get(frame, 'id'), result: { turn: { id: 'codex-turn', status: 'inProgress' } } })
    daemon.emit(sessionId, { method: 'item/completed', params: { threadId: 'codex-thread', turnId: 'codex-turn', item: { type: 'agentMessage', id: 'codex-result', text: 'Codex implemented and tested the change', phase: 'final_answer' } } })
    daemon.emit(sessionId, { method: 'turn/completed', params: { threadId: 'codex-thread', turn: { id: 'codex-turn', status: 'completed', error: null } } })
    await waitFor(() => current().works[0]?.delivered === true)
    expect(current().works[0]).toMatchObject({ state: 'completed', result: 'Codex implemented and tested the change' })
    expect(chats.get(current().works[0]!.conversationId!).agent).toBe('codex')
    expect(chats.get(leaderId()).agent).toBe('claude')
  })

  it('restores live work from persistence without spawning a second developer', async () => {
    await start(); await dispatch(id(2)); await releaseLeader()
    const sessionId = workSession(current().works[0]!)
    const before = daemon.spawns.length
    await squads.close()
    squads = new SquadService(new SquadStore(path.join(root, 'antumi.db')), service, chats, { squad: () => {}, run: () => {} })
    service.setSquads(squads)
    await squads.reconcile()
    expect(workSession(current().works[0]!)).toBe(sessionId)
    expect(daemon.spawns).toHaveLength(before)
    complete(sessionId)
    await waitFor(() => current().works[0]?.delivered === true)
  })

  it('deduplicates a persisted result batch even when delivery acknowledgement was lost', async () => {
    await start(); await dispatch(id(2)); await releaseLeader()
    complete(workSession(current().works[0]!))
    await waitFor(() => current().works[0]?.delivered === true)
    const message = chats.messages(leaderId()).findLast((entry) => entry.role === 'user' && entry.eventKey.startsWith('chat:squad-results:'))!
    const ref = message.eventKey.slice('chat:'.length, -':user'.length)
    const persisted = new SquadStore(path.join(root, 'antumi.db'))
    persisted.patchRun(current().id, { delivery: { id: ref, workIds: [current().works[0]!.id], text: message.text }, works: current().works.map((work) => ({ ...work, delivered: false })) })
    persisted.close()
    await squads.close()
    squads = new SquadService(new SquadStore(path.join(root, 'antumi.db')), service, chats, { squad: () => {}, run: () => {} })
    service.setSquads(squads)
    complete(chats.get(leaderId()).sessionId!, 'considering next step')
    await squads.reconcile()
    expect(current().delivery).toBeNull()
    expect(current().works[0]?.delivered).toBe(true)
    expect(chats.messages(leaderId()).filter((entry) => entry.eventKey === message.eventKey)).toHaveLength(1)
  })

  it('keeps work open while its member waits for approval and makes the task actionable', async () => {
    await start(); await dispatch(id(2)); await releaseLeader()
    const work = current().works[0]!
    daemon.emit(workSession(work), { type: 'control_request', request_id: 'edit-approval', request: {
      subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: path.join(root, 'project', 'new.ts'), content: 'new code' }, tool_use_id: 'edit-tool'
    } })
    await waitFor(() => current().works[0]?.state === 'awaiting')
    expect(service.get(taskId).awaitingInput).toBe(true)
    await expect(squads.finish(leaderId(), 'Done')).rejects.toMatchObject({ reason: 'squad-work-unfinished' })
    await chats.respond(work.conversationId!, 'edit-approval', { decision: 'allow' })
    complete(workSession(work))
    await waitFor(() => current().works[0]?.state === 'completed')
  })

  it('preserves task work on cancellation, allows reopening and deletes only owned records', async () => {
    await start(); await dispatch(id(2)); await releaseLeader()
    const conversationId = current().works[0]!.conversationId!
    await service.cancel(taskId, 'paused delivery')
    expect(service.get(taskId).status).toBe('abandoned')
    const reopened = service.reopen(taskId)
    if (reopened.status === 'pending') await service.start(taskId)
    else await service.resumeChat(taskId)
    expect(service.get(taskId).status).toBe('running')
    await service.delete(taskId)
    expect(() => chats.get(conversationId)).toThrow()
    expect(squads.list()).toHaveLength(1)
    expect(() => service.get(taskId)).toThrow()
  })
})
