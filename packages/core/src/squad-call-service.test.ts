import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Squad } from '@antumi/protocol'
import { AgentProfileService } from './agent-profile-service'
import { AgentProfileStore } from './agent-profile-store'
import { AttachmentStore } from './attachment-store'
import { ConversationService } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { ProjectRegistry } from './project-registry'
import { SquadCallService } from './squad-call-service'
import { SquadCallStore } from './squad-call-store'
import { SquadService } from './squad-service'
import { SquadStore } from './squad-store'
import { TaskService } from './task-service'
import { TaskStore } from './task-store'

describe('a chat invoking a team', () => {
  let root: string
  let repo: string
  let db: string
  let tasks: TaskStore
  let conversationStore: ConversationStore
  let projects: ProjectRegistry
  let chats: ConversationService
  let taskService: TaskService
  let squads: SquadService
  let profiles: AgentProfileService
  let calls: SquadCallService
  let store: SquadCallStore
  let daemon: ReturnType<typeof fakeChatDaemon>
  let parentId: string
  let squad: Squad
  let exhausted: boolean
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const commit = (cwd: string) => { git(cwd, 'add', '.'); git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'test') }
  const waitFor = async (check: () => boolean) => expect.poll(check, { timeout: 5000 }).toBe(true)
  beforeEach(async () => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-team-call-')))
    repo = path.join(root, 'app'); mkdirSync(repo)
    git(repo, 'init', '-q'); writeFileSync(path.join(repo, 'initial.txt'), 'initial'); commit(repo)
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
    git(repo, 'switch', '-qc', 'current-feature')
    writeFileSync(path.join(repo, 'feature.txt'), 'current feature'); commit(repo)
    db = path.join(root, 'antumi.db')
    tasks = new TaskStore(db); projects = new ProjectRegistry(db); conversationStore = new ConversationStore(db)
    daemon = fakeChatDaemon(); daemon.reply = () => {}
    const attachments = new AttachmentStore(path.join(root, 'attachments'))
    chats = new ConversationService(conversationStore, daemon, path.join(root, 'sessions'), (event) => {
      if (event.type === 'changed') { taskService?.chatChanged(event.conversation); squads?.conversationChanged(event.conversation) }
      if (event.type === 'chatItems') squads?.observe(event.conversationId, event.items)
      calls?.tick()
    }, projects, attachments)
    taskService = new TaskService(tasks, projects, path.join(root, 'worktrees'), () => calls?.tick(), attachments, chats)
    squads = new SquadService(new SquadStore(db), taskService, chats, { squad: () => {}, run: () => calls?.tick() })
    profiles = new AgentProfileService(new AgentProfileStore(db), chats, { profile: () => {}, call: () => {} })
    store = new SquadCallStore(db); exhausted = false
    calls = new SquadCallService(store, taskService, squads, chats, profiles, {
      changed: () => {}, trust: async () => {}, disabled: () => [],
      quota: () => ({ state: exhausted ? 'exhausted' : 'ok', window: null, stale: false })
    })
    squads.setProfiles((id) => profiles.get(id))
    squads.registerRunPolicy({ snapshot: (id) => calls.snapshot(id), brief: (id) => calls.brief(id), beforeStart: (id) => calls.beforeStart(id), beforeFinish: (run) => calls.beforeFinish(run), memberAllowed: (member) => calls.memberAllowed(member) })
    taskService.setSquads(squads); taskService.setWorkspaceStarts((id) => calls.starts(id))
    chats.setSquadGuard((conversation) => squads.guardMember(conversation))
    chats.setCapacity({ maxConcurrentAgents: 20, agentConcurrency: { claude: 10 } }, () => { squads.tick(); calls.tick() })
    daemon.deliver = (event) => {
      if (event.event === 'data') chats.handleData(event)
      else if (event.event === 'exit') chats.handleExit(event.sessionId, event.exitCode)
      else chats.handleStderr(event.sessionId, event.data)
    }
    squad = squads.create({ name: 'Delivery', leaderId: '11111111-1111-4111-8111-111111111111', members: [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Leader', agent: 'claude', capability: 'readOnly' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Developer', agent: 'claude', capability: 'develop' }
    ] })
    parentId = (await chats.create('claude', [repo], false, { permissionMode: 'auto' })).id
  })
  afterEach(async () => {
    await calls.close(); await squads.close(); await profiles.close()
    projects.close(); conversationStore.close(); tasks.close(); rmSync(root, { recursive: true, force: true })
  })
  const dispatch = () => calls.dispatch(parentId, squad.id, 'Implement feature and verify', 'feature-1')
  it('lists a legacy team with an unsupported read-only lead as unavailable and refuses to dispatch it', async () => {
    const legacyStore = new SquadStore(db)
    try {
      legacyStore.update(squad.id, { ...squad, members: squad.members.map((member) =>
        member.id === squad.leaderId ? { ...member, agent: 'gemini' } : member) })
    } finally { legacyStore.close() }
    const reason = expect.stringContaining('队长「Leader」使用的 Gemini CLI 不支持只读模式')
    expect(calls.targets(parentId)).toEqual([expect.objectContaining({ reason, permissionMode: null })])
    await expect(dispatch()).rejects.toMatchObject({ reason: 'squad-call-forbidden', message: reason })
    expect(store.list()).toEqual([])
    expect(tasks.list()).toEqual([])
  })

  it('creates one linked task, freezes the roster and starts from the actual caller commit', async () => {
    const call = await dispatch()
    squads.update(squad.id, { ...squad, name: 'Edited' })
    expect((await dispatch()).id).toBe(call.id)
    await expect(calls.dispatch(parentId, squad.id, 'Different work', 'feature-1')).rejects.toMatchObject({ reason: 'invalid-params' })
    await waitFor(() => store.get(call.id).state === 'running')
    const task = taskService.get(call.taskId)
    const run = squads.runs(task.id)[0]!
    expect(tasks.list()).toHaveLength(1)
    expect(run.squad.name).toBe('Delivery')
    expect(run.permissionMode).toBe(call.permissionMode)
    expect(task.repos[0]?.start?.commit).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(readFileSync(path.join(task.repos[0]!.worktreePath!, 'feature.txt'), 'utf8')).toBe('current feature')
    expect(chats.get(run.leaderConversationId!).workspaceReadOnly).toBe(true)
    expect(task.repos[0]!.worktreePath).not.toBe(repo)
  })
  it('rolls back a duplicate task-and-call transaction', async () => {
    const call = await dispatch()
    expect(() => tasks.create('Duplicate', {}, store.link({ ...call, id: randomUUID(), taskId: randomUUID() }))).toThrow()
    expect(tasks.list()).toHaveLength(1)
    expect(store.list()).toHaveLength(1)
  })
  it('isolates multiple writable repositories while preserving read-only references', async () => {
    const other = path.join(root, 'other'); mkdirSync(other)
    git(other, 'init', '-q'); writeFileSync(path.join(other, 'other.txt'), 'other'); commit(other)
    const reference = path.join(root, 'reference'); mkdirSync(reference)
    const parent = await chats.create('claude', [repo, other], false, { permissionMode: 'ask', referencePaths: [reference] })
    const call = await calls.dispatch(parent.id, squad.id, 'Across repositories', 'multi')
    await waitFor(() => store.get(call.id).state === 'running')
    const repos = taskService.get(call.taskId).repos
    expect(repos).toHaveLength(3)
    expect(repos.filter((entry) => !entry.reference).every((entry) => entry.worktreePath && entry.worktreePath !== entry.path)).toBe(true)
    expect(repos.find((entry) => entry.path === reference)).toMatchObject({ reference: true, worktreePath: null, branch: null })
  })
  it('does not silently change a queued call to a newer source commit', async () => {
    chats.setCapacity({ maxConcurrentAgents: 1 }, () => calls.tick())
    const call = await dispatch()
    expect(store.get(call.id).state).toBe('queued')
    writeFileSync(path.join(repo, 'later.txt'), 'later'); commit(repo)
    chats.setCapacity({ maxConcurrentAgents: 20 }, () => calls.tick())
    await waitFor(() => store.get(call.id).state === 'failed')
    expect(store.get(call.id).error).toContain('提交已改变')
    expect(tasks.list()).toHaveLength(1)
    expect(taskService.get(call.taskId).repos[0]?.worktreePath).toBeNull()
  })
  it('downgrades queued permissions when the parent becomes more restrictive', async () => {
    chats.setCapacity({ maxConcurrentAgents: 1 }, () => calls.tick())
    const call = await dispatch()
    await chats.setOption(parentId, 'permissionMode', 'ask')
    chats.setCapacity({ maxConcurrentAgents: 20 }, () => calls.tick())
    await waitFor(() => store.get(call.id).state === 'running')
    expect(squads.runs(call.taskId)[0]?.permissionMode).toBe('ask')
    expect(store.get(call.id).permissionMode).toBe('ask')
  })
  it.each(['ask', 'acceptEdits', 'bypass'])('passes the parent %s mode to developers while keeping the leader read-only', async (permissionMode) => {
    const parent = await chats.create('claude', [repo], true, { permissionMode })
    const call = await calls.dispatch(parent.id, squad.id, 'Implement feature', 'inherit')
    await waitFor(() => store.get(call.id).state === 'running')
    const run = squads.runs(call.taskId)[0]!
    const leader = chats.get(run.leaderConversationId!)
    expect(leader.workspaceReadOnly).toBe(true)
    expect(chats.allowsBypass(leader.id)).toBe(false)
    await squads.dispatch(leader.id, squad.members[1]!.id, 'Implement the feature', 'develop')
    daemon.emit(leader.sessionId!, { type: 'result', subtype: 'success', is_error: false, result: 'delegated', terminal_reason: 'completed', duration_ms: 5 })
    await waitFor(() => squads.runs(call.taskId)[0]?.works[0]?.state === 'running')
    const work = squads.runs(call.taskId)[0]!.works[0]!
    const developer = chats.get(work.conversationId!)
    expect(developer.workspaceReadOnly).toBe(false)
    expect(developer.chatOptions?.permissionMode).toBe(permissionMode)
    expect(chats.allowsBypass(developer.id)).toBe(permissionMode === 'bypass')
    if (permissionMode === 'bypass') expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--allow-dangerously-skip-permissions', '--permission-mode', 'bypassPermissions']))
  })
  it('inherits a newly selected bypass mode when a queued team starts', async () => {
    const parent = await chats.create('claude', [repo], true, { permissionMode: 'ask' })
    chats.setCapacity({ maxConcurrentAgents: 1 }, () => calls.tick())
    const call = await calls.dispatch(parent.id, squad.id, 'Implement feature', 'queued-bypass')
    expect(store.get(call.id).state).toBe('queued')
    await chats.setOption(parent.id, 'permissionMode', 'bypass')
    chats.setCapacity({ maxConcurrentAgents: 20 }, () => calls.tick())
    await waitFor(() => store.get(call.id).state === 'running')
    expect(store.get(call.id)).toMatchObject({ permissionMode: 'bypass', allowBypass: true })
    expect(squads.runs(call.taskId)[0]).toMatchObject({ permissionMode: 'bypass', allowBypass: true })
  })
  it('does not keep bypass permission after the parent allowance is revoked', async () => {
    const parent = await chats.create('claude', [repo], true, { permissionMode: 'bypass' })
    chats.setCapacity({ maxConcurrentAgents: 1 }, () => calls.tick())
    const call = await calls.dispatch(parent.id, squad.id, 'Implement feature', 'revoke-bypass')
    conversationStore.setChatOptions(parent.id, { allowBypass: false })
    chats.setCapacity({ maxConcurrentAgents: 20 }, () => calls.tick())
    await waitFor(() => store.get(call.id).state === 'running')
    expect(store.get(call.id)).toMatchObject({ permissionMode: 'acceptEdits', allowBypass: false })
    expect(squads.runs(call.taskId)[0]).toMatchObject({ permissionMode: 'acceptEdits', allowBypass: false })
  })
  it('keeps review work read-only when the parent allows everything', async () => {
    const parent = await chats.create('claude', [repo], true, { permissionMode: 'bypass' })
    const call = await calls.dispatch(parent.id, squad.id, 'Review feature', 'review-bypass')
    await waitFor(() => store.get(call.id).state === 'running')
    const run = squads.runs(call.taskId)[0]!
    const leader = chats.get(run.leaderConversationId!)
    await squads.dispatch(leader.id, squad.members[1]!.id, 'Review only', 'readOnly')
    daemon.emit(leader.sessionId!, { type: 'result', subtype: 'success', is_error: false, result: 'delegated', terminal_reason: 'completed', duration_ms: 5 })
    await waitFor(() => squads.runs(call.taskId)[0]?.works[0]?.state === 'running')
    const reviewer = chats.get(squads.runs(call.taskId)[0]!.works[0]!.conversationId!)
    expect(reviewer.workspaceReadOnly).toBe(true)
    expect(reviewer.chatOptions?.permissionMode).toBe('ask')
    expect(daemon.spawns.at(-1)?.args).not.toContain('--allow-dangerously-skip-permissions')
  })
  it('rejects untracked edits without leaving a task or a call', async () => {
    writeFileSync(path.join(repo, 'draft.txt'), 'uncommitted')
    await expect(dispatch()).rejects.toMatchObject({ reason: 'delegation-dirty' })
    expect(tasks.list()).toHaveLength(0); expect(store.list()).toHaveLength(0)
  })
  it('does not expand planning permissions or permit delegation from a channel', async () => {
    await chats.setOption(parentId, 'permissionMode', 'plan')
    expect(calls.targets(parentId)[0]?.reason).toContain('规划')
    await expect(dispatch()).rejects.toMatchObject({ reason: 'squad-call-forbidden' })
    conversationStore.setChannel(parentId, { channelId: squad.id, platform: 'slack', asker: 'u', place: 'p' })
    expect(calls.targets(parentId)).toEqual([])
    await expect(dispatch()).rejects.toMatchObject({ reason: 'squad-call-forbidden' })
  })
  it('requires an explicit team allow-list on a configured agent', async () => {
    const profile = profiles.save({ name: 'Role', agent: 'claude', capability: 'develop', audience: 'both' })
    const parent = await chats.create('claude', [repo], false, { profile, permissionMode: 'ask' })
    expect(calls.targets(parent.id)).toEqual([])
    const allowed = profiles.save({ ...profile, callableSquads: [squad.id] }, profile.id)
    const another = await chats.create('claude', [repo], false, { profile: allowed, permissionMode: 'ask' })
    expect(calls.targets(another.id).map((entry) => entry.squad.id)).toEqual([squad.id])
  })
  it('rejects exhausted leaders before creating a task', async () => {
    exhausted = true
    await expect(dispatch()).rejects.toMatchObject({ reason: 'squad-call-forbidden' })
    expect(tasks.list()).toHaveLength(0)
  })
  it('requires committed work before review and exposes real branches in the result', async () => {
    const call = await dispatch()
    await waitFor(() => store.get(call.id).state === 'running')
    const task = taskService.get(call.taskId)
    const run = squads.runs(task.id)[0]!
    const workspace = task.repos[0]!.worktreePath!
    writeFileSync(path.join(workspace, 'result.txt'), 'implemented')
    await expect(calls.beforeFinish(run)).rejects.toMatchObject({ reason: 'squad-work-uncommitted' })
    commit(workspace)
    await squads.finish(run.leaderConversationId!, 'Implemented and tested')
    const session = chats.get(run.leaderConversationId!).sessionId!
    daemon.emit(session, { type: 'result', subtype: 'success', is_error: false, result: 'done', terminal_reason: 'completed', duration_ms: 5 })
    await waitFor(() => store.get(call.id).state === 'review')
    expect(store.get(call.id)).toMatchObject({ version: 1, deliveredVersion: 0, outcomes: [{ source: repo, outcome: { commits: 1, changes: 0 } }] })
    expect(taskService.get(task.id).status).toBe('review')
    expect(calls.deliverySource().pending(parentId)).toHaveLength(1)
    calls.list(parentId, true)
    expect(calls.deliverySource().pending(parentId)).toHaveLength(0)
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(call.sources[0]!.base)
    git(repo, 'merge', '--ff-only', store.get(call.id).outcomes[0]!.outcome.head!)
    expect(readFileSync(path.join(repo, 'result.txt'), 'utf8')).toBe('implemented')
    expect(taskService.get(task.id).status).toBe('review')
  })
  it('keeps the team task alive when the source conversation is archived or deleted', async () => {
    const call = await dispatch()
    await waitFor(() => store.get(call.id).state === 'running')
    await chats.setArchived(parentId, true)
    expect(taskService.get(call.taskId).status).toBe('running')
    await chats.delete(parentId)
    expect(taskService.get(call.taskId).status).toBe('running')
    expect(squads.runs(call.taskId)[0]?.state).toBe('running')
  })
  it('cancels the task while retaining its worktree and branch', async () => {
    const call = await dispatch()
    await waitFor(() => store.get(call.id).state === 'running')
    const workspace = taskService.get(call.taskId).repos[0]!.worktreePath!
    await calls.cancel(parentId, call.id)
    expect(taskService.get(call.taskId).status).toBe('abandoned')
    expect(readFileSync(path.join(workspace, 'feature.txt'), 'utf8')).toBe('current feature')
    expect(store.get(call.id).state).toBe('cancelled')
  })
})
