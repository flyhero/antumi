import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelProvider, type AgentKind, type AgentProfile, type AgentUsage } from '@antumi/protocol'
import { AgentProfileService, delegatedMode, readyAgents, type ReadyAgent } from './agent-profile-service'
import { AgentProfileStore } from './agent-profile-store'
import { TaskStore } from './task-store'
import { ConversationStore } from './conversation-store'
import { ConversationService } from './conversation-service'
import { ProjectRegistry } from './project-registry'
import { AttachmentStore } from './attachment-store'
import { fakeChatDaemon } from './fake-chat-agent'

describe('reusable agent roles and delegated work', () => {
  let root: string
  let tasks: TaskStore
  let conversations: ConversationStore
  let projects: ProjectRegistry
  let daemon: ReturnType<typeof fakeChatDaemon>
  let chats: ConversationService
  let store: AgentProfileStore
  let profiles: AgentProfileService
  let reviewer: AgentProfile
  let parentId: string
  let ready: ReadyAgent[]
  let disabled: AgentKind[]
  let usage: AgentUsage[]
  const waitFor = async (check: () => boolean) => { await expect.poll(check, { timeout: 5000 }).toBe(true) }
  const complete = (sessionId: string, text = 'verified the change', failed = false) => {
    daemon.emit(sessionId, { type: 'assistant', uuid: `a-${sessionId}-${daemon.writes.length}`, message: { id: `m-${sessionId}-${daemon.writes.length}`, content: [{ type: 'text', text }] }, parent_tool_use_id: null })
    daemon.emit(sessionId, { type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, result: text, terminal_reason: failed ? 'error' : 'completed', duration_ms: 5 })
  }
  // A command the agent runs on in the background after its turn, as a dev server does.
  const background = (sessionId: string, id: string, command: string) => {
    daemon.emit(sessionId, { type: 'assistant', uuid: `a-${id}`, message: { id: `m-${id}`, content: [{ type: 'tool_use', id, name: 'Bash', input: { command, run_in_background: true } }] }, parent_tool_use_id: null })
    daemon.emit(sessionId, { type: 'system', subtype: 'task_started', task_id: `task-${id}`, tool_use_id: id, task_type: 'local_bash', is_backgrounded: true })
  }
  beforeEach(async () => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-profiles-')))
    const db = path.join(root, 'antumi.db')
    tasks = new TaskStore(db); conversations = new ConversationStore(db); projects = new ProjectRegistry(db)
    daemon = fakeChatDaemon(); daemon.reply = () => {}
    chats = new ConversationService(conversations, daemon, path.join(root, 'sessions'), (event) => {
      if (event.type === 'changed' || event.type === 'chatItems') profiles.tick()
    }, projects, new AttachmentStore(path.join(root, 'attachments')))
    store = new AgentProfileStore(db)
    ready = []; disabled = []; usage = []
    profiles = new AgentProfileService(store, chats, { profile: () => {}, call: () => {} }, undefined, undefined,
      { ready: () => ready, disabled: () => disabled, usage: () => usage })
    chats.setSquadGuard((conversation) => profiles.guard(conversation))
    chats.setCallCleanup((id) => profiles.cancelForParent(id))
    chats.setCapacity({ maxConcurrentAgents: 20, agentConcurrency: { claude: 6 } }, () => profiles.tick())
    daemon.deliver = (event) => {
      if (event.event === 'data') chats.handleData(event)
      else if (event.event === 'exit') chats.handleExit(event.sessionId, event.exitCode)
      else chats.handleStderr(event.sessionId, event.data)
    }
    reviewer = profiles.save({ name: 'Reviewer', agent: 'claude', capability: 'readOnly', instructions: 'Find defects with evidence.' })
    const repo = path.join(root, 'project'); mkdirSync(repo)
    parentId = (await chats.create('claude', [repo], false, { permissionMode: 'ask' })).id
  })
  afterEach(async () => {
    await profiles.close(); projects.close(); conversations.close(); tasks.close()
    rmSync(root, { recursive: true, force: true })
  })
  it('freezes role configuration, isolates history, hides the child and returns the result once', async () => {
    await chats.send(parentId, 'Implement a feature')
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review the changed files', 'review-1')
    profiles.save({ ...reviewer, instructions: 'New instructions' }, reviewer.id)
    complete(chats.get(parentId).sessionId!, 'delegated')
    await waitFor(() => store.call(call.id).state === 'running')
    const child = chats.get(call.conversationId)
    expect(child).toMatchObject({ parentConversationId: parentId, agentCallId: call.id, workspaceReadOnly: true, profile: { instructions: reviewer.instructions } })
    expect(chats.list().map((item) => item.id)).toEqual([parentId])
    const spawn = daemon.spawns.at(-1)!
    expect(spawn.args.join(' ')).toContain(reviewer.instructions)
    expect(chats.messages(child.id).some((message) => message.text === 'Implement a feature')).toBe(false)
    complete(child.sessionId!, 'Found a missing timeout')
    await waitFor(() => store.call(call.id).delivered)
    expect(store.call(call.id)).toMatchObject({ state: 'completed', result: 'Found a missing timeout' })
    expect(chats.get(child.id).sessionId).toBeNull()
    await profiles.reconcile()
    expect(chats.messages(parentId).filter((message) => message.text.includes('Found a missing timeout'))).toHaveLength(1)
    expect(await profiles.dispatch(parentId, reviewer.id, 'Review the changed files', 'review-1')).toMatchObject({ id: call.id })
  })
  it('limits role callers, refuses nested dispatch and caps a planning caller to read-only', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    conversations.setWorkspaceReadOnly(parentId, true)
    const call = await profiles.dispatch(parentId, developer.id, 'Analyze the implementation')
    expect(call.readOnly).toBe(true)
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(call.conversationId).workspaceReadOnly).toBe(true)
    await expect(profiles.dispatch(call.conversationId, reviewer.id, 'Nested work')).rejects.toMatchObject({ reason: 'agent-call-unavailable' })
    conversations.setProfile(parentId, profiles.save({ name: 'Restricted', agent: 'claude', callableProfiles: [] }))
    expect(profiles.available(parentId)).toEqual([])
    await expect(profiles.dispatch(parentId, reviewer.id, 'Not allowed')).rejects.toMatchObject({ reason: 'agent-call-forbidden' })
  })
  it('calls a ready agent without a profile, read-only unless asked, never from a profile caller', async () => {
    ready = [{ agent: 'claude', modelProvider: null }]
    expect(profiles.targets(parentId)).toEqual([
      { profileId: reviewer.id, name: 'Reviewer', description: '', agent: 'claude', capability: 'readOnly', readOnly: true, quota: { state: 'unknown', window: null, stale: false } },
      { profileId: null, name: 'Claude Code', description: '', agent: 'claude', capability: null, readOnly: true, quota: { state: 'unknown', window: null, stale: false }, modelProvider: null }
    ])
    const call = await profiles.dispatch(parentId, { agent: 'claude' }, 'Look into the failure', 'direct-1')
    expect(call).toMatchObject({ readOnly: true, profile: { agent: 'claude', name: 'Claude Code', instructions: '', capability: 'readOnly', modelProvider: null } })
    expect(profiles.list().some((profile) => profile.id === call.profile.id)).toBe(false)
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(call.conversationId)).toMatchObject({ parentConversationId: parentId, agentCallId: call.id, workspaceReadOnly: true })
    expect(await profiles.dispatch(parentId, { agent: 'claude' }, 'Look into the failure', 'direct-1')).toMatchObject({ id: call.id })
    await expect(profiles.dispatch(parentId, reviewer.id, 'Look into the failure', 'direct-1')).rejects.toMatchObject({ reason: 'invalid-params' })
    await expect(profiles.dispatch(parentId, { agent: 'codex' }, 'Not ready')).rejects.toMatchObject({ reason: 'agent-call-forbidden' })
    await profiles.cancelForParent(parentId)
    expect(await profiles.dispatch(parentId, { agent: 'claude', capability: 'develop' }, 'Fix it')).toMatchObject({ readOnly: false, permissionMode: 'ask' })
    await profiles.cancelForParent(parentId)
    conversations.setProfile(parentId, profiles.save({ name: 'Restricted', agent: 'claude', callableProfiles: [] }))
    expect(profiles.targets(parentId).filter((target) => target.profileId === null)).toEqual([])
    await expect(profiles.dispatch(parentId, { agent: 'claude' }, 'Not allowed')).rejects.toMatchObject({ reason: 'agent-call-forbidden' })
  })
  it('asks for develop from an agent that cannot work read-only', async () => {
    ready = [{ agent: 'gemini', modelProvider: null }]
    expect(profiles.targets(parentId).at(-1)).toMatchObject({ profileId: null, name: 'Gemini CLI', readOnly: false })
    await expect(profiles.dispatch(parentId, { agent: 'gemini' }, 'Read only')).rejects.toMatchObject({ reason: 'invalid-params' })
  })
  it('offers the agents that can start, on the provider that serves them where not signed in', () => {
    const tool = (name: 'claude' | 'codex' | 'cursor', fields: object) => ({ tool: name, status: 'ok' as const, version: '1.0.0', path: `/bin/${name}`, signedIn: false, ...fields })
    const environment = { checks: [tool('claude', {}), tool('codex', { signedIn: true }), tool('cursor', { status: 'missing' })], checkedAt: 0, searchPath: [] }
    const provider = ModelProvider.parse({ id: 'test', name: 'Test', preset: 'custom', anthropic: { baseUrl: 'https://api.example.com', auth: 'api_key', env: {} }, openai: null, models: [{ id: 'model', label: null, contextWindow: null, maxOutput: null, efforts: [] }], defaultModel: 'model', smallModel: 'model', agents: ['claude'], hasKey: true, revision: 0, createdAt: 0, updatedAt: 0 })
    expect(readyAgents(null, [], [])).toEqual([])
    expect(readyAgents(environment, [], [])).toEqual([{ agent: 'codex', modelProvider: null }])
    expect(readyAgents(environment, [provider], [])).toEqual([{ agent: 'claude', modelProvider: 'test' }, { agent: 'codex', modelProvider: null }])
    expect(readyAgents(environment, [provider], ['codex'])).toEqual([{ agent: 'claude', modelProvider: 'test' }])
  })
  it('delegates to nothing on an agent the user turned off', async () => {
    disabled = ['claude']
    expect(profiles.targets(parentId)).toEqual([])
    await expect(profiles.dispatch(parentId, reviewer.id, 'Review it')).rejects.toMatchObject({ reason: 'agent-call-forbidden' })
  })
  it('shows each target\'s quota and refuses one whose quota is used up', async () => {
    const resetsAt = Date.now() + 3_600_000
    const reading = (usedPercent: number, model: string | null = null): AgentUsage => ({ agent: 'claude', status: 'ok', plan: null, error: null, updatedAt: Date.now(), resetCredits: null,
      windows: [{ kind: 'session', model, usedPercent, windowMinutes: 300, resetsAt }] })
    ready = [{ agent: 'claude', modelProvider: null }, { agent: 'codex', modelProvider: 'test' }]
    usage = [reading(40)]
    expect(profiles.targets(parentId).map((target) => [target.name, target.quota.state, target.quota.window?.usedPercent ?? null])).toEqual([
      ['Reviewer', 'ok', 40], ['Claude Code', 'ok', 40], ['Codex', 'provider', null]
    ])
    usage = [reading(100)]
    await expect(profiles.dispatch(parentId, reviewer.id, 'Review it')).rejects.toMatchObject({ reason: 'agent-quota-exhausted' })
    await expect(profiles.dispatch(parentId, { agent: 'claude' }, 'Look into it')).rejects.toMatchObject({ reason: 'agent-quota-exhausted' })
    expect((await profiles.dispatch(parentId, { agent: 'codex' }, 'Look into it')).profile.modelProvider).toBe('test')
    // A cap on one model stops only a call that runs on it.
    usage = [reading(100, 'opus')]
    expect((await profiles.dispatch(parentId, { agent: 'claude', model: 'sonnet' }, 'Look into it')).state).toBe('queued')
    await expect(profiles.dispatch(parentId, { agent: 'claude', model: 'opus' }, 'Look into it')).rejects.toMatchObject({ reason: 'agent-quota-exhausted' })
  })
  it('lets a developing member work in the caller\'s mode, all-allowed included', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    expect((await profiles.dispatch(parentId, developer.id, 'Ask first')).permissionMode).toBe('ask')
    await profiles.cancelForParent(parentId)
    const repo = chats.get(parentId).projectPaths
    const trusted = (await chats.create('claude', repo, true, { permissionMode: 'bypass' })).id
    const call = await profiles.dispatch(trusted, developer.id, 'Implement it')
    expect(call).toMatchObject({ permissionMode: 'bypass', readOnly: false })
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(call.conversationId).chatOptions?.permissionMode).toBe('bypass')
    expect(chats.allowsBypass(call.conversationId)).toBe(true)
    expect((await profiles.dispatch(trusted, reviewer.id, 'Only read')).readOnly).toBe(true)
  })
  it('runs one developer at a time, prevents parent edits and cancels without deleting files', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    const first = await profiles.dispatch(parentId, developer.id, 'Implement part one')
    const second = await profiles.dispatch(parentId, developer.id, 'Implement part two')
    await waitFor(() => store.call(first.id).state === 'running')
    expect(store.call(second.id).state).toBe('queued')
    await expect(chats.send(parentId, 'Edit the same files')).rejects.toMatchObject({ reason: 'agent-call-writing' })
    await profiles.cancelForParent(parentId)
    expect(profiles.calls(parentId).map((call) => call.state)).toEqual(['cancelled', 'cancelled'])
    expect(chats.get(first.conversationId).sessionId).toBeNull()
    expect(profiles.calls(parentId).every((call) => call.delivered)).toBe(true)
  })
  it('returns results that come back together in one message, for one turn of the caller', async () => {
    const tester = profiles.save({ name: 'Tester', agent: 'claude', capability: 'readOnly' })
    const first = await profiles.dispatch(parentId, reviewer.id, 'Review it')
    const second = await profiles.dispatch(parentId, tester.id, 'Test it')
    await waitFor(() => [first, second].every((call) => store.call(call.id).state === 'running'))
    complete(chats.get(first.conversationId).sessionId!, 'Looks right')
    complete(chats.get(second.conversationId).sessionId!, 'Tests pass')
    await waitFor(() => [first, second].every((call) => store.call(call.id).delivered))
    const returned = chats.chatPage(parentId).items.filter((item) => item.kind === 'user' && item.id.startsWith('u:agent-result:'))
    expect(returned.map((item) => item.id)).toEqual([`u:agent-result:${first.id},${second.id}`])
    expect(chats.messages(parentId).filter((message) => message.text.includes('Looks right') && message.text.includes('Tests pass'))).toHaveLength(1)
  })
  it('does not send again a result the caller read through its status tool', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    const review = await profiles.dispatch(parentId, reviewer.id, 'Review it')
    const work = await profiles.dispatch(parentId, developer.id, 'Build it')
    await waitFor(() => [review, work].every((call) => store.call(call.id).state === 'running'))
    // Held while the developer edits; read in the meantime.
    complete(chats.get(review.conversationId).sessionId!, 'Looks right')
    await waitFor(() => store.call(review.id).state === 'completed')
    expect((await profiles.read(parentId)).find((call) => call.id === review.id)).toMatchObject({ result: 'Looks right', delivered: true })
    complete(chats.get(work.conversationId).sessionId!, 'Built')
    await waitFor(() => store.call(work.id).delivered)
    expect(chats.chatPage(parentId).items.filter((item) => item.kind === 'user' && item.id.startsWith('u:agent-result:')).map((item) => item.id)).toEqual([`u:agent-result:${work.id}`])
    expect(chats.messages(parentId).some((message) => message.text.includes('Looks right'))).toBe(false)
  })
  it('sends failures back to the parent instead of treating them as success', async () => {
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review')
    await waitFor(() => store.call(call.id).state === 'running')
    complete(chats.get(call.conversationId).sessionId!, 'Could not read the file', true)
    await waitFor(() => store.call(call.id).delivered)
    expect(store.call(call.id).state).toBe('failed')
    expect(chats.messages(parentId).some((message) => message.text.includes('"state":"failed"'))).toBe(true)
  })
  it('restores queued work and archived roles do not change its saved snapshot', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    await chats.send(parentId, 'Working')
    const call = await profiles.dispatch(parentId, developer.id, 'Build later')
    profiles.archive(developer.id, true)
    expect(profiles.available(parentId).map((profile) => profile.id)).toEqual([reviewer.id])
    await profiles.close()
    store = new AgentProfileStore(path.join(root, 'antumi.db'))
    profiles = new AgentProfileService(store, chats, { profile: () => {}, call: () => {} })
    complete(chats.get(parentId).sessionId!, 'ready')
    await profiles.reconcile()
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(call.conversationId).profile?.archivedAt).toBeNull()
  })

  it('returns work to a task conversation and preserves its planning constraint', async () => {
    const parent = await chats.startForTask({ id: 'task-1', title: 'Plan a feature', agent: 'claude' }, {
      cwd: chats.get(parentId).workspacePath, extraDirs: [], planOnly: true, session: 'new', permissionMode: 'plan'
    })
    const call = await profiles.dispatch(parent.id, reviewer.id, 'Analyze the API')
    await waitFor(() => store.call(call.id).state === 'running')
    complete(chats.get(call.conversationId).sessionId!, 'API analysis complete')
    await waitFor(() => store.call(call.id).delivered)
    expect(chats.get(parent.id)).toMatchObject({ taskId: 'task-1', planOnly: true })
    expect(chats.messages(parent.id).some((message) => message.text.includes('API analysis complete'))).toBe(true)
  })

  it('serializes writers across conversations sharing a directory while readers run together', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    const other = await chats.create('claude', chats.get(parentId).projectPaths, false, { permissionMode: 'ask' })
    const first = await profiles.dispatch(parentId, developer.id, 'Edit the module')
    await waitFor(() => store.call(first.id).state === 'running')
    const second = await profiles.dispatch(other.id, developer.id, 'Edit the same module')
    const reader = await profiles.dispatch(other.id, reviewer.id, 'Inspect the module')
    await waitFor(() => store.call(reader.id).state === 'running')
    expect(store.call(second.id).state).toBe('queued')
    await expect(chats.send(other.id, 'Edit while another writer runs')).rejects.toMatchObject({ reason: 'agent-call-writing' })
    await profiles.cancelForParent(parentId)
    profiles.tick()
    await waitFor(() => store.call(second.id).state === 'running')
    expect(chats.list(false, false, true).some((conversation) => conversation.id === second.conversationId)).toBe(true)
  })

  it('starts a developing member once the caller\'s turn ends, leaving the dev server it runs alone', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    await chats.send(parentId, 'Start the dev server, then get the module built')
    const session = chats.get(parentId).sessionId!
    background(session, 'bg-parent', 'pnpm dev')
    const call = await profiles.dispatch(parentId, developer.id, 'Build the module')
    await waitFor(() => store.call(call.id).waiting === 'parent')
    expect(store.call(call.id).state).toBe('queued')
    complete(session, 'delegated')
    await waitFor(() => store.call(call.id).state === 'running')
    expect(store.call(call.id).waiting).toBeNull()
    expect(chats.get(parentId)).toMatchObject({ sessionId: session, chat: { turn: 'running' } })
    complete(chats.get(call.conversationId).sessionId!, 'Built')
    await waitFor(() => store.call(call.id).delivered)
    expect(chats.get(parentId).sessionId).toBe(session)
    expect(chats.messages(parentId).some((message) => message.text.includes('Built'))).toBe(true)
  })

  it('starts a reading member while the caller works on, holding its result until the turn ends', async () => {
    await chats.send(parentId, 'Get a review, then keep going')
    const session = chats.get(parentId).sessionId!
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review the module')
    await waitFor(() => store.call(call.id).state === 'running')
    expect(store.call(call.id).waiting).toBeNull()
    expect(chats.get(parentId).chat?.turn).toBe('running')
    complete(chats.get(call.conversationId).sessionId!, 'No defects found')
    await waitFor(() => store.call(call.id).state === 'completed')
    await profiles.reconcile()
    expect(store.call(call.id).delivered).toBe(false)
    complete(session, 'Kept going')
    await waitFor(() => store.call(call.id).delivered)
    expect(chats.messages(parentId).some((message) => message.text.includes('No defects found'))).toBe(true)
  })

  it('frees an idle caller\'s slot while its members work', async () => {
    await chats.send(parentId, 'Get a review')
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review the module')
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(parentId).sessionId).not.toBeNull()
    complete(chats.get(parentId).sessionId!, 'delegated')
    await waitFor(() => chats.get(parentId).sessionId === null)
    expect(store.call(call.id).state).toBe('running')
  })

  it('stops the idle caller before starting a member that waited on its slot, in the one pass', async () => {
    await chats.send(parentId, 'Get a review')
    chats.setCapacity({ maxConcurrentAgents: 20, agentConcurrency: { claude: 1 } }, () => profiles.tick())
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review the module')
    await waitFor(() => store.call(call.id).waiting === 'capacity')
    // From here only the pass below runs, so the member can start in no other.
    vi.spyOn(profiles, 'tick').mockImplementation(() => {})
    complete(chats.get(parentId).sessionId!, 'delegated')
    await waitFor(() => chats.get(parentId).chat?.turn === 'idle')
    await profiles.reconcile()
    expect(chats.get(parentId).sessionId).toBeNull()
    expect(store.call(call.id)).toMatchObject({ state: 'running', waiting: null })
  })

  it('finishes a member that leaves a command running, stopping it and saying so', async () => {
    const call = await profiles.dispatch(parentId, reviewer.id, 'Check the preview')
    await waitFor(() => store.call(call.id).state === 'running')
    const child = chats.get(call.conversationId)
    background(child.sessionId!, 'bg-child', 'pnpm preview')
    complete(child.sessionId!, 'The preview is up on port 4173')
    await waitFor(() => store.call(call.id).delivered)
    expect(store.call(call.id).state).toBe('completed')
    expect(store.call(call.id).result).toMatch(/^The preview is up on port 4173\n\n.*pnpm preview/)
    expect(chats.get(child.id).sessionId).toBeNull()
  })

  it('lets an edit start beside a dev server another conversation runs, and tells the member of it', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    const other = await chats.create('claude', chats.get(parentId).projectPaths, false, { permissionMode: 'ask' })
    await chats.send(other.id, 'Run the dev server')
    const session = chats.get(other.id).sessionId!
    background(session, 'bg-other', 'pnpm dev --port 5173')
    const call = await profiles.dispatch(parentId, developer.id, 'Edit the module')
    await waitFor(() => store.call(call.id).waiting === 'writer')
    complete(session, 'The server runs')
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(other.id).sessionId).toBe(session)
    expect(chats.messages(call.conversationId).some((message) => message.role === 'user' && message.text.includes('- pnpm dev --port 5173'))).toBe(true)
  })

  it('says a member waits for a free slot', async () => {
    const other = await chats.create('claude', chats.get(parentId).projectPaths, false, { permissionMode: 'ask' })
    await chats.send(other.id, 'Busy elsewhere')
    chats.setCapacity({ maxConcurrentAgents: 20, agentConcurrency: { claude: 1 } }, () => profiles.tick())
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review the module')
    await waitFor(() => store.call(call.id).waiting === 'capacity')
    expect(store.call(call.id).state).toBe('queued')
  })

  it('shows a member back at work as soon as its request is answered', async () => {
    const call = await profiles.dispatch(parentId, reviewer.id, 'Inspect the module')
    await waitFor(() => store.call(call.id).state === 'running')
    const child = chats.get(call.conversationId)
    daemon.emit(child.sessionId!, { type: 'control_request', request_id: 'ask-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' }, tool_use_id: 'toolu_ask-1' } })
    await waitFor(() => store.call(call.id).state === 'awaiting')
    await chats.respond(child.id, 'ask-1', { decision: 'allow' })
    await waitFor(() => store.call(call.id).state === 'running')
    complete(child.sessionId!, 'Inspected')
    await waitFor(() => store.call(call.id).state === 'completed')
  })

  it('marks a vanished process as failed after reconciliation', async () => {
    const call = await profiles.dispatch(parentId, reviewer.id, 'Inspect the module')
    await waitFor(() => store.call(call.id).state === 'running')
    await chats.stop(call.conversationId)
    await profiles.reconcile()
    expect(store.call(call.id)).toMatchObject({ state: 'failed', delivered: true })
  })
  describe('a member in a worktree of its own', () => {
    let repo: string
    let developer: AgentProfile
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim()
    // What the member's conversation was sent first.
    const firstMessage = (conversationId: string) => chats.messages(conversationId).find((message) => message.role === 'user')?.text ?? ''
    beforeEach(async () => {
      repo = path.join(root, 'repo'); mkdirSync(repo)
      git(repo, 'init', '-q', '-b', 'main')
      writeFileSync(path.join(repo, 'a.txt'), 'a')
      git(repo, 'add', 'a.txt'); git(repo, 'commit', '-q', '-m', 'a')
      profiles.setWorkspaces({ root: path.join(root, 'worktrees'), setup: null })
      developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
      parentId = (await chats.create('claude', [repo], false, { permissionMode: 'ask' })).id
    })

    it('works beside other members and the caller, on a branch from the caller\'s commit, and reports what git holds', async () => {
      const head = git(repo, 'rev-parse', 'HEAD')
      const first = await profiles.dispatch(parentId, developer.id, 'Rename the module', 'wt-1', 'worktree')
      const second = await profiles.dispatch(parentId, developer.id, 'Rename the other module', 'wt-2', 'worktree')
      expect(first).toMatchObject({ workspace: 'worktree', worktree: null, readOnly: false })
      await waitFor(() => store.call(first.id).state === 'running' && store.call(second.id).state === 'running')
      const laid = store.call(first.id).worktree!
      expect(laid).toMatchObject({ source: repo, base: head, stage: 'ready', setupFailures: [], outcome: null, removed: false })
      expect(laid.dir.startsWith(path.join(root, 'worktrees'))).toBe(true)
      expect(git(laid.dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(laid.branch)
      expect(chats.get(first.conversationId).projectPaths).toEqual([laid.dir])
      expect(store.call(second.id).worktree!.dir).not.toBe(laid.dir)
      expect(firstMessage(first.conversationId)).toContain(`分支 \`${laid.branch}\``)
      // Neither member edits the caller's checkout: the caller goes on, and nothing reads as writing.
      expect(profiles.summary(parentId)).toMatchObject({ open: 2, writing: false })
      await chats.continue(parentId)
      await chats.send(parentId, 'Meanwhile, update the docs')
      expect(projects.recent()).not.toContain(laid.dir)
      // The member commits on its branch; its result carries what git says of it.
      writeFileSync(path.join(laid.dir, 'b.txt'), 'b')
      git(laid.dir, 'add', 'b.txt'); git(laid.dir, 'commit', '-q', '-m', 'b')
      writeFileSync(path.join(laid.dir, 'c.txt'), 'c')
      complete(chats.get(parentId).sessionId!, 'docs updated')
      complete(chats.get(first.conversationId).sessionId!, 'Renamed and committed')
      await waitFor(() => store.call(first.id).delivered)
      const done = store.call(first.id)
      expect(done.worktree!.outcome).toEqual({ branch: laid.branch, head: git(laid.dir, 'rev-parse', 'HEAD'), commits: 1, changes: 1, error: null })
      expect(done.result).toContain('Renamed and committed')
      expect(done.result).toContain(`（worktree 委派：分支 \`${laid.branch}\`，1 个提交，1 个未提交文件。有 1 个未提交文件留在 worktree 里`)
      const delivery = chats.messages(parentId).find((message) => message.eventKey.includes('agent-result:'))!
      expect(JSON.parse(delivery.text.split('\n')[1]!)).toMatchObject({ callId: first.id, worktree: { dir: laid.dir, branch: laid.branch, base: head, outcome: { commits: 1 } } })
      expect(store.call(second.id).state).toBe('running')
      await expect(profiles.resume(parentId, first.id)).rejects.toMatchObject({ reason: 'agent-call-resume-worktree' })
    })

    it('refuses one the caller cannot carry: a reader, an uncommitted checkout, a plain folder', async () => {
      await expect(profiles.dispatch(parentId, reviewer.id, 'Review', 'r', 'worktree')).rejects.toMatchObject({ reason: 'invalid-params' })
      writeFileSync(path.join(repo, 'draft.txt'), 'draft')
      await expect(profiles.dispatch(parentId, developer.id, 'Edit', 'e', 'worktree')).rejects.toMatchObject({ reason: 'delegation-dirty' })
      rmSync(path.join(repo, 'draft.txt'))
      const plain = (await chats.create('claude', [path.join(root, 'project')], false, { permissionMode: 'ask' })).id
      await expect(profiles.dispatch(plain, developer.id, 'Edit', 'e', 'worktree')).rejects.toMatchObject({ reason: 'invalid-params' })
      // The same reference with the other workspace is other work.
      await profiles.dispatch(parentId, developer.id, 'Edit', 'e', 'worktree')
      await expect(profiles.dispatch(parentId, developer.id, 'Edit', 'e')).rejects.toMatchObject({ reason: 'invalid-params' })
    })

    it('runs the project\'s setup in the worktree before the member starts, and tells it what failed', async () => {
      const ran: string[] = []
      profiles.setWorkspaces({ root: path.join(root, 'worktrees'), setup: {
        requireTrusted: async (paths) => paths.map((repoPath) => ({ repoPath, topLevel: repoPath, config: { setup: 'pnpm install' }, hash: 'h' })),
        setUp: async (conversationId, worktrees) => { ran.push(...worktrees.map((each) => each.dir)); expect(chats.get(conversationId).projectPaths).toEqual([worktrees[0]!.dir]); return ['在 worktree 运行 `pnpm install` 失败'] }
      } })
      const call = await profiles.dispatch(parentId, developer.id, 'Edit', 'e', 'worktree')
      await waitFor(() => store.call(call.id).state === 'running')
      expect(ran).toEqual([store.call(call.id).worktree!.dir])
      expect(store.call(call.id).worktree).toMatchObject({ stage: 'ready', setupFailures: ['在 worktree 运行 `pnpm install` 失败'] })
      expect(firstMessage(call.conversationId)).toContain('项目的 setup 没有全部成功')
    })

    it('reads the worktree when a call is cancelled, and lets the folder go only afterwards', async () => {
      const call = await profiles.dispatch(parentId, developer.id, 'Edit', 'e', 'worktree')
      await waitFor(() => store.call(call.id).state === 'running')
      expect(profiles.callOpen(call.id)).toBe(true)
      expect(profiles.worktreeCalls()).toEqual([{ dir: store.call(call.id).worktree!.dir, id: call.id, parentId, conversationId: call.conversationId, open: true }])
      await expect(profiles.confirmCallClosed(call.id)).rejects.toMatchObject({ reason: 'delegation-open' })
      await profiles.cancel(parentId, call.id)
      expect(store.call(call.id)).toMatchObject({ state: 'cancelled', worktree: { outcome: { commits: 0, changes: 0 } } })
      await profiles.confirmCallClosed(call.id)
      expect(store.call(call.id).worktree!.removed).toBe(false)
      await profiles.worktreeRemoved(call.id)
      expect(store.call(call.id).worktree!.removed).toBe(true)
      expect(profiles.worktreeCalls()).toEqual([])
    })

    // A setup that waits to be let go, telling whether it was called off meanwhile.
    const heldSetup = () => {
      let release = () => {}
      const held = new Promise<void>((resolve) => { release = resolve })
      const seen: { aborted: boolean }[] = []
      const setup = {
        requireTrusted: async (paths: readonly string[]) => paths.map((repoPath) => ({ repoPath, topLevel: repoPath, config: { setup: 'pnpm install' }, hash: 'h' })),
        setUp: async (_id: string, _worktrees: readonly { dir: string }[], _setups: readonly unknown[], signal?: AbortSignal) => {
          await held
          seen.push({ aborted: signal?.aborted ?? false })
          return signal?.aborted ? [] : ['setup failed']
        }
      }
      return { setup, release: () => release(), seen }
    }

    it('calls a setup off when the call is cancelled while it runs, and settles the stage so nothing shows it setting up', async () => {
      const { setup, release, seen } = heldSetup()
      profiles.setWorkspaces({ root: path.join(root, 'worktrees'), setup })
      const call = await profiles.dispatch(parentId, developer.id, 'Edit', 'e', 'worktree')
      await waitFor(() => store.call(call.id).worktree?.stage === 'setup')
      await profiles.cancel(parentId, call.id)
      expect(store.call(call.id)).toMatchObject({ state: 'cancelled', worktree: { stage: 'setup' } })
      release()
      await waitFor(() => store.call(call.id).worktree?.stage === 'ready')
      expect(seen).toEqual([{ aborted: true }])
      expect(store.call(call.id)).toMatchObject({ state: 'cancelled', worktree: { setupFailures: [] } })
    })

    it('runs a setup cut short by a restart again before the member starts', async () => {
      const { setup } = heldSetup()
      profiles.setWorkspaces({ root: path.join(root, 'worktrees'), setup })
      const call = await profiles.dispatch(parentId, developer.id, 'Edit', 'e', 'worktree')
      await waitFor(() => store.call(call.id).worktree?.stage === 'setup')
      // A new process finds the record mid-setup, with no setup of its own running.
      const ran: string[] = []
      const fresh = new AgentProfileService(store, chats, { profile: () => {}, call: () => {} }, undefined, undefined, { ready: () => ready, disabled: () => disabled, usage: () => usage })
      fresh.setWorkspaces({ root: path.join(root, 'worktrees'), setup: { ...setup, setUp: async (_id: string, worktrees: readonly { dir: string }[]) => { ran.push(...worktrees.map((each) => each.dir)); return ['second run failed'] } } })
      await fresh.reconcile()
      await waitFor(() => store.call(call.id).worktree?.stage === 'ready')
      expect(ran).toEqual([store.call(call.id).worktree!.dir])
      await waitFor(() => store.call(call.id).state === 'running')
      expect(firstMessage(call.conversationId)).toContain('second run failed')
    })

    it('stays queued while the repository is busy, and fails if the caller turned dirty meanwhile', async () => {
      let busy = true
      profiles.setGitLock(async (_dirs, run) => { if (busy) throw new (await import('./rejection')).Rejection('git-busy'); return run() })
      const call = await profiles.dispatch(parentId, developer.id, 'Edit', 'e', 'worktree')
      await waitFor(() => store.call(call.id).waiting === 'writer')
      expect(store.call(call.id)).toMatchObject({ state: 'queued', worktree: null })
      writeFileSync(path.join(repo, 'draft.txt'), 'draft')
      busy = false
      profiles.tick()
      await waitFor(() => store.call(call.id).state === 'failed')
      expect(store.call(call.id).error).toContain('未提交')
    })
  })
  describe('going on with a call that stopped short', () => {
    // What a session was sent, as text.
    const sent = (sessionId: string) => daemon.written(sessionId).flatMap((frame) => {
      const message = typeof frame === 'object' && frame !== null && Reflect.get(frame, 'type') === 'user' ? Reflect.get(frame, 'message') : null
      return message ? [String(Reflect.get(message, 'content'))] : []
    })
    const later = () => new Promise((resolve) => setTimeout(resolve, 5))

    it('goes on in its own conversation, telling it what changed since and the caller what came back', async () => {
      const call = await profiles.dispatch(parentId, reviewer.id, 'Review the reminder change')
      await waitFor(() => store.call(call.id).state === 'running')
      complete(chats.get(call.conversationId).sessionId!, 'the run broke', true)
      await waitFor(() => store.call(call.id).delivered)
      expect(store.call(call.id)).toMatchObject({ state: 'failed', attempt: 0 })
      expect(store.call(call.id).endedAt).not.toBeNull()
      // The caller goes on with the user for a turn before anyone comes back to the call.
      complete(chats.get(parentId).sessionId!, 'noted the failure')
      await later()
      await chats.send(parentId, 'rename the setting to reminderLead')
      complete(chats.get(parentId).sessionId!, 'renamed')
      expect(profiles.resumeCheck(parentId, call.id)).toEqual({ blocker: null, turnsSince: 1, redoneBy: null })

      const resumed = await profiles.resume(parentId, call.id, '接口改名了，按新名字看')
      expect(resumed).toMatchObject({ state: 'queued', attempt: 1, delivered: false, resumedFrom: { state: 'failed', error: 'the run broke', turnsSince: 1, note: '接口改名了，按新名字看' } })
      await waitFor(() => store.call(call.id).state === 'running')
      const child = chats.get(call.conversationId)
      expect(child.id).toBe(call.conversationId)
      const told = sent(child.sessionId!).at(-1) ?? ''
      expect(told).toContain('中断后主会话又进行了 1 轮')
      expect(told).toContain('用户补充：接口改名了，按新名字看')
      expect(told).toContain('Review the reminder change')

      complete(child.sessionId!, 'Found the overlap at midnight')
      await waitFor(() => store.call(call.id).delivered)
      expect(store.call(call.id)).toMatchObject({ state: 'completed', result: 'Found the overlap at midnight' })
      await waitFor(() => chats.messages(parentId).some((message) => message.text.includes('Found the overlap at midnight')))
      const back = chats.messages(parentId).findLast((message) => message.text.includes('Found the overlap at midnight'))?.text ?? ''
      expect(back).toContain('"resumed"')
      expect(back).toContain('"turnsSince":1')
      expect(back).toContain('Review the reminder change')
    })

    it('goes on after a cancel, and not with one done, never started, taken up too often, or editing past a read-only caller', async () => {
      const call = await profiles.dispatch(parentId, reviewer.id, 'Inspect the module')
      await waitFor(() => store.call(call.id).state === 'running')
      await profiles.cancel(parentId, call.id)
      expect(profiles.resumeCheck(parentId, call.id).blocker).toBeNull()
      await profiles.resume(parentId, call.id)
      await waitFor(() => store.call(call.id).state === 'running')
      expect(sent(chats.get(call.conversationId).sessionId!).at(-1)).toContain('你之前的工作被取消了')
      complete(chats.get(call.conversationId).sessionId!, 'inspected')
      await waitFor(() => store.call(call.id).state === 'completed')
      await expect(profiles.resume(parentId, call.id)).rejects.toMatchObject({ reason: 'agent-call-resume-completed' })

      store.patchCall(call.id, { state: 'failed', attempt: 3 })
      expect(profiles.resumeCheck(parentId, call.id).blocker).toBe('limit')
      store.patchCall(call.id, { attempt: 0, error: '成员启动中断，请重新委派' })
      expect(profiles.resumeCheck(parentId, call.id).blocker).toBe('not-started')
      store.patchCall(call.id, { error: 'error', readOnly: false })
      conversations.setWorkspaceReadOnly(parentId, true)
      expect(profiles.resumeCheck(parentId, call.id).blocker).toBe('read-only')
    })

    it('says when a later call already did the same work', async () => {
      const first = await profiles.dispatch(parentId, reviewer.id, 'Review it', 'first')
      await waitFor(() => store.call(first.id).state === 'running')
      complete(chats.get(first.conversationId).sessionId!, 'broke', true)
      await waitFor(() => store.call(first.id).delivered)
      complete(chats.get(parentId).sessionId!, 'will retry')
      await later()
      const again = await profiles.dispatch(parentId, reviewer.id, 'Review it', 'again')
      await waitFor(() => store.call(again.id).state === 'running')
      complete(chats.get(again.conversationId).sessionId!, 'reviewed')
      await waitFor(() => store.call(again.id).state === 'completed')
      expect(profiles.resumeCheck(parentId, first.id).redoneBy).toBe(again.id)
    })
  })
})

describe('delegatedMode', () => {
  const all = ['ask', 'acceptEdits', 'plan', 'auto', 'readOnly', 'bypass']
  it('keeps the caller\'s mode where the member has it', () => {
    for (const mode of ['ask', 'acceptEdits', 'auto', 'bypass']) expect(delegatedMode(mode, true, all)).toBe(mode)
    expect(delegatedMode(null, false, all)).toBe('ask')
  })
  it('falls to the next mode down the member has, never past what the caller was allowed', () => {
    expect(delegatedMode('auto', false, ['ask', 'acceptEdits', 'bypass'])).toBe('acceptEdits')
    expect(delegatedMode('bypass', true, ['ask', 'readOnly'])).toBe('ask')
    expect(delegatedMode('bypass', false, all)).toBe('acceptEdits')
  })
})
