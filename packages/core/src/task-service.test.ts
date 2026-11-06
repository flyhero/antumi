import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Task, Terminal } from '@antumi/protocol'
import { AgentRunStore } from './agent-run-store'
import { AttachmentStore } from './attachment-store'
import { ConversationService } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { gifBytes, pngBytes } from './image-fixtures'
import { ProjectRegistry } from './project-registry'
import { CredentialStore } from './credential-store'
import { ModelProviderStore } from './model-providers'
import { TaskService, type TaskEvent } from './task-service'
import { TaskStore } from './task-store'
import { ScheduleService } from './schedule-service'
import { ProjectConfigStore } from './project-config'
import { WorktreeSetup } from './worktree-setup'

// A message to a Claude chat agent: its text, after any images as blocks of their own.
const UserMessage = z.object({
  type: z.literal('user'),
  message: z.object({ content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]) })
})

function userText(frame: unknown): string[] {
  const parsed = UserMessage.safeParse(frame)
  if (!parsed.success) return []
  const { content } = parsed.data.message
  return typeof content === 'string' ? [content] : content.flatMap((block) => (block.text === undefined ? [] : [block.text]))
}

// What Claude prints when a turn is over.
const turnEnd = { type: 'result', subtype: 'success', is_error: false, result: 'done', terminal_reason: 'completed', duration_ms: 5 }

describe('TaskService', () => {
  let dir: string
  let store: TaskStore
  let conversationsStore: ConversationStore
  let projects: ProjectRegistry
  let attachments: AttachmentStore
  let runs: AgentRunStore
  let daemon: ReturnType<typeof fakeChatDaemon>
  let conversations: ConversationService
  let events: TaskEvent[]
  let service: TaskService
  let schedules: ScheduleService | null
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-test-'))
    const database = path.join(dir, 'antumi.db')
    store = new TaskStore(database)
    conversationsStore = new ConversationStore(database)
    projects = new ProjectRegistry(database)
    runs = new AgentRunStore(database)
    attachments = new AttachmentStore(dir)
    daemon = fakeChatDaemon()
    events = []
    schedules = null
    // Wired as main.ts wires them: the conversation service runs each task's chat and reports back.
    conversations = new ConversationService(conversationsStore, daemon, path.join(dir, 'sessions'),
      (event) => {
        if (event.type === 'changed') service.chatChanged(event.conversation)
        else if (event.type === 'planApproved') service.recordPlan(event.taskId, event.plan)
      },
      projects, attachments)
    const target = conversations
    daemon.deliver = (event) => {
      if (event.event === 'data') target.handleData(event)
      else if (event.event === 'exit') target.handleExit(event.sessionId, event.exitCode)
      else target.handleStderr(event.sessionId, event.data)
    }
    service = new TaskService(store, projects, path.join(dir, 'worktrees'), (event) => {
      events.push(event)
      if (event.type === 'changed') { if (!event.sourceOnly) schedules?.taskChanged(event.task) }
      else schedules?.taskDeleted(event.id)
    }, attachments, conversations, runs)
  })

  it('marks background source snapshots as data-only without changing the task status', () => {
    const task = service.create({ title: 'Imported issue' })
    const before = daemon.spawns.length
    const updated = service.setSnapshot(task.id, { markdown: 'new comment', images: [], fetchedAt: 1000 }, true)
    expect(updated.status).toBe('pending')
    expect(daemon.spawns.length).toBe(before)
    expect(events.at(-1)).toMatchObject({ type: 'changed', sourceOnly: true })
  })

  afterEach(async () => {
    if (schedules) {
      await schedules.tick()
      await schedules.stop()
    }
    runs.close()
    projects.close()
    conversationsStore.close()
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function git(repo: string, ...args: string[]): string {
    return execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      encoding: 'utf8'
    }).trim()
  }

  function initRepo(name: string): string {
    const repo = path.join(dir, name)
    execFileSync('git', ['init', '-q', repo])
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'init')
    return repo
  }

  function readyTask(title: string, repos: string[]) {
    const task = service.create({ title })
    return service.update({ id: task.id, details: 'x', repos, agent: 'claude' })
  }

  function automaticQueue(): ScheduleService {
    schedules = new ScheduleService(path.join(dir, 'antumi.db'), {
      tasks: {
        get: (id) => store.get(id),
        autoRuns: () => store.list('pending').filter((task) => task.autoRun),
        disableAutoRun: (id) => { service.update({ id, autoRun: false }) },
        scheduleBlocker: (id) => service.scheduleBlocker(id),
        start: (id, allowBypass, unattended) => service.start(id, allowBypass, unattended),
        resumeChat: (id, allowBypass) => service.resumeChat(id, allowBypass)
      },
      conversations,
      usage: { list: () => [], refresh: async () => [] },
      mode: () => 'acceptEdits',
      emit: () => {},
      limitChanged: () => {},
      routines: { pass: async () => {}, get: () => null, pickAgent: () => 'claude', runChanged: () => {} }
    })
    return schedules
  }

  it('automatically starts in a worktree after the final dependency is accepted, with no client or second start', async () => {
    const first = service.create({ title: 'First' })
    const second = service.create({ title: 'Second' })
    const task = readyTask('Next', [initRepo('automatic-chain')])
    const queue = automaticQueue()
    service.update({ id: task.id, dependsOn: [first.id, second.id], autoRun: true })
    await queue.tick()
    expect(queue.list()).toHaveLength(1)
    service.move(first.id, 'done')
    await queue.tick()
    expect(service.get(task.id).status).toBe('pending')
    service.move(second.id, 'done')
    await queue.tick()
    expect(service.get(task.id)).toMatchObject({ status: 'running', autoRun: false })
    expect(service.get(task.id).repos[0]?.worktreePath).toBeTruthy()
    expect(conversations.get(service.get(task.id).conversationId ?? '').chatOptions?.permissionMode).toBe('acceptEdits')
    expect(told(task.id)).toContain('Next')
    expect(queue.list()).toHaveLength(1)
    expect(queue.list()[0]?.status).toBe('started')
    await Promise.all([queue.tick(), queue.tick()])
    expect(conversationsStore.list().filter((conversation) => conversation.taskId === task.id)).toHaveLength(1)
  })

  it('cancels an automatic queue entry and persists the switch change through the real task service', async () => {
    const dependency = service.create({ title: 'First' })
    const task = readyTask('Next', [initRepo('automatic-cancel')])
    const queue = automaticQueue()
    service.update({ id: task.id, dependsOn: [dependency.id], autoRun: true })
    await queue.tick()
    queue.cancel(queue.list()[0]?.id ?? '')
    expect(service.get(task.id).autoRun).toBe(false)
    service.move(dependency.id, 'done')
    await queue.tick()
    expect(service.get(task.id).status).toBe('pending')
    expect(queue.list()).toHaveLength(1)
    expect(queue.list()[0]?.status).toBe('cancelled')
  })

  it('arms automatic execution only on a configured pending task and disarms it when dependencies are removed', () => {
    const dependency = service.create({ title: 'First' })
    const task = readyTask('Next', [initRepo('auto-run')])
    expect(() => service.update({ id: task.id, autoRun: true })).toThrow('missing-dependencies')
    expect(service.update({ id: task.id, dependsOn: [dependency.id], autoRun: true }).autoRun).toBe(true)
    expect(service.update({ id: task.id, title: 'Renamed' }).autoRun).toBe(true)
    expect(service.update({ id: task.id, dependsOn: [] }).autoRun).toBe(false)
    expect(() => service.update({ id: task.id, dependsOn: [dependency.id], agent: 'cursor', autoRun: true })).toThrow('agent-unattended-unsupported')
    expect(service.get(task.id).agent).toBe('claude')
  })

  it('disarms automatic execution when configuration becomes invalid or a prerequisite is deleted', async () => {
    const dependency = service.create({ title: 'First' })
    const task = readyTask('Next', [initRepo('auto-invalidation')])
    service.update({ id: task.id, dependsOn: [dependency.id], autoRun: true })
    expect(service.update({ id: task.id, agent: null }).autoRun).toBe(false)
    service.update({ id: task.id, agent: 'claude', autoRun: true })
    await service.delete(dependency.id)
    expect(service.get(task.id)).toMatchObject({ autoRun: false, dependsOn: [] })
  })

  it('clears the automatic trigger on a manual start and does not rearm when redone', async () => {
    const dependency = service.move(service.create({ title: 'First' }).id, 'done')
    const task = readyTask('Next', [initRepo('auto-start')])
    service.update({ id: task.id, dependsOn: [dependency.id], autoRun: true })
    await service.start(task.id)
    expect(service.get(task.id).autoRun).toBe(false)
    service.move(task.id, 'done')
    await service.redo(task.id, undefined)
    expect(service.get(task.id)).toMatchObject({ status: 'pending', autoRun: false })
  })

  const exitPlanMode = (requestId: string) => ({
    type: 'control_request', request_id: requestId,
    request: { subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: '# Plan' }, tool_use_id: `toolu_${requestId}` }
  })
  const sessionOf = (taskId: string) => conversations.get(service.get(taskId).conversationId ?? '').sessionId ?? ''
  // What the task's agent has been told in its current session.
  const told = (taskId: string) => daemon.written(sessionOf(taskId)).flatMap(userText).join('\n\n')

  // Hands a task in once its agent's turn is over.
  it('enriches the first task prompt with source context and keeps its delivery ref', async () => {
    const task = readyTask('Source context', [initRepo('source-context')])
    const ref = 'source-comments:initial-context'
    service.setSourcePrompt(async (_task, _conversationId, text) => ({ text: `${text}\n\nSOURCE_CONTEXT_INCLUDED`, ref }))
    const started = await service.start(task.id)
    await settle()
    const messages = conversations.messages(started.conversationId!).filter((message) => message.role === 'user')
    expect(messages.at(-1)?.text).toContain('SOURCE_CONTEXT_INCLUDED')
    expect(conversations.sourceDeliveryReceipt(started.conversationId!, ref, 'prepared')).toEqual({ state: 'submitted' })
  })

  async function handIn(taskId: string): Promise<Task> {
    await settle()
    return service.submit(taskId)
  }

  // A message to a task's chat, as the chat view sends one: the task readies its agent first.
  async function message(taskId: string, text: string): Promise<void> {
    const task = await service.resumeChat(taskId)
    await conversations.send(task.conversationId ?? '', text)
  }

  it('creates pending tasks and keeps them pending while details are written', () => {
    const task = service.create({ title: 'Refactor login' })
    expect(task.status).toBe('pending')

    const updated = service.update({ id: task.id, details: 'Switch to OAuth device flow' })
    expect(updated.status).toBe('pending')
    expect(events.map((e) => e.type)).toEqual(['changed', 'changed'])
  })

  it('refuses a full-capacity task before preparing its worktree', async () => {
    const repo = initRepo('capacity-project')
    const task = readyTask('Wait for capacity', [repo])
    conversations.setCapacity({ maxConcurrentAgents: 1, agentConcurrency: { claude: 1 } }, () => {})
    await conversations.create('claude', [])

    await expect(service.start(task.id)).rejects.toMatchObject({ reason: 'agent-capacity' })
    expect(service.get(task.id).status).toBe('pending')
    expect(existsSync(path.join(dir, 'worktrees', task.id))).toBe(false)
  })

  it('creates a task with repos, agent, dependencies and details in one call', () => {
    const base = service.create({ title: 'Base' })
    events = []
    const task = service.create({
      title: 'Full',
      details: 'x',
      repos: [dir, dir],
      dependsOn: [base.id.slice(0, 8)],
      agent: 'codex'
    })
    expect(task).toMatchObject({
      details: 'x',
      agent: 'codex',
      dependsOn: [base.id],
      repos: [{ path: dir, worktreePath: null, branch: null }]
    })
    expect(events).toHaveLength(1)
    expect(projects.recent()).toContain(dir)
  })

  it('creates nothing when a field is invalid', () => {
    expect(() => service.create({ title: 'Bad', repos: ['relative/path'] })).toThrow(/absolute/)
    expect(() => service.create({ title: 'Bad', dependsOn: ['ffffffff'] })).toThrow(/no task/)
    expect(service.list()).toEqual([])
  })

  it('resolves short id prefixes and rejects unknown ones', () => {
    const task = service.create({ title: 'A' })
    expect(service.get(task.id.slice(0, 8)).id).toBe(task.id)
    expect(() => service.get('ffffffff')).toThrow(/no task/)
  })

  it('starts a single repo inside its own worktree and waits for review once handed in', async () => {
    const repo = initRepo('app')
    const task = service.create({ title: 'Add dark mode' })
    service.update({ id: task.id, details: 'Use CSS tokens', repos: [repo], agent: 'claude' })

    const running = await service.start(task.id)
    const short = task.id.slice(0, 8)
    expect(running.status).toBe('running')
    expect(running.repos).toEqual([{
      path: repo,
      worktreePath: path.join(dir, 'worktrees', short, 'app'),
      branch: `antumi/${short}-add-dark-mode`,
      startRef: null,
      // No origin here: the branch starts from what the repo has checked out, and says why.
      start: { ref: git(repo, 'symbolic-ref', '--short', 'HEAD'), commit: git(repo, 'rev-parse', 'HEAD'), note: 'no-remote-default', at: expect.any(Number) }
    }])
    expect(daemon.spawns[0]).toMatchObject({ command: 'claude', cwd: realpathSync(running.repos[0]?.worktreePath ?? '') })
    expect(told(task.id)).toContain('Add dark mode\n\nUse CSS tokens')

    expect((await handIn(task.id)).status).toBe('review')
    expect(service.move(task.id, 'done').status).toBe('done')
  })

  it('carries a task out unattended in the mode given, without planning first, but only once it can run', async () => {
    const repo = initRepo('app')
    const first = service.create({ title: 'Schema' })
    service.update({ id: first.id, repos: [repo], agent: 'claude' })
    const task = service.create({ title: 'Add dark mode' })
    service.update({ id: task.id, details: 'Use CSS tokens', repos: [repo], agent: 'claude', dependsOn: [first.id] })
    expect(service.scheduleBlocker(task.id)).toBe('dependencies-unfinished')
    await expect(service.start(task.id, undefined, 'acceptEdits')).rejects.toMatchObject({ reason: 'dependencies-unfinished' })
    service.update({ id: task.id, dependsOn: [] })
    expect(service.scheduleBlocker(task.id)).toBeNull()

    const running = await service.start(task.id, undefined, 'bypass')
    expect(running.status).toBe('running')
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
    expect(told(task.id)).toContain('无人值守')
    expect(told(task.id)).not.toContain('我确认之后再开始修改代码')
  })

  it('starts with the selected model, effort and mode, keeping them across a restart', async () => {
    // Populate the catalog from a fake stage, without probing an installed CLI.
    await conversations.create('claude', [])
    const task = readyTask('Small edit', [initRepo('app')])
    const running = await service.start(task.id, false, undefined, { permissionMode: 'acceptEdits', model: 'sonnet', effort: 'high' })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--permission-mode', 'acceptEdits', '--model', 'sonnet', '--effort', 'high']))
    expect(told(task.id)).toContain('直接开始实现')
    expect(told(task.id)).not.toContain('我确认之后再开始修改代码')
    expect(told(task.id)).not.toContain('无人值守')
    await settle()
    await conversations.stopForTask(task.id)
    await service.resumeChat(task.id)
    expect(conversations.get(running.conversationId ?? '').chatOptions).toMatchObject({ permissionMode: 'acceptEdits', model: 'sonnet', effort: 'high' })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--permission-mode', 'acceptEdits', '--model', 'sonnet', '--effort', 'high']))
  })

  it('keeps what a start by hand chose, and a scheduled run takes its model and effort but not its mode', async () => {
    await conversations.create('claude', [])
    const repo = initRepo('app')
    const planned = readyTask('Plan first', [repo])
    await service.start(planned.id, false, undefined, { permissionMode: 'plan', model: 'sonnet' })
    expect(store.get(planned.id)?.launch).toEqual({ permissionMode: 'plan', model: 'sonnet' })

    const task = readyTask('Nightly', [repo])
    expect(service.update({ id: task.id, launch: { permissionMode: 'plan', model: 'sonnet', effort: 'high' } }).launch)
      .toEqual({ permissionMode: 'plan', model: 'sonnet', effort: 'high' })
    await service.start(task.id, undefined, 'acceptEdits')
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--permission-mode', 'acceptEdits', '--model', 'sonnet', '--effort', 'high']))
    expect(store.get(task.id)?.launch.permissionMode).toBe('plan')
  })

  it('forgets the launch when the agent changes, and keeps it through a redo', async () => {
    const task = readyTask('Switch agents', [initRepo('app')])
    service.update({ id: task.id, launch: { permissionMode: 'acceptEdits', model: 'sonnet' } })
    expect(service.update({ id: task.id, agent: 'claude' }).launch).toEqual({ permissionMode: 'acceptEdits', model: 'sonnet' })
    store.update(task.id, { status: 'done' })
    expect((await service.redo(task.id, undefined)).launch).toEqual({ permissionMode: 'acceptEdits', model: 'sonnet' })
    const other = readyTask('Other agent', [initRepo('lib')])
    service.update({ id: other.id, launch: { model: 'sonnet' } })
    expect(service.update({ id: other.id, agent: 'codex' }).launch).toEqual({})
  })

  it('rejects invalid selections before creating a task worktree or conversation', async () => {
    await conversations.create('claude', [])
    const task = readyTask('Invalid config', [initRepo('app')])
    for (const options of [
      { model: 'missing-model' },
      { model: 'haiku', effort: 'high' },
      { permissionMode: 'readOnly' as const },
      { permissionMode: 'bypass' as const }
    ]) {
      await expect(service.start(task.id, false, undefined, options)).rejects.toMatchObject({ reason: 'chat-option-invalid' })
    }
    expect(service.get(task.id)).toMatchObject({ status: 'pending', conversationId: null, repos: [{ worktreePath: null }] })
    expect(existsSync(path.join(dir, 'worktrees', task.id.slice(0, 8)))).toBe(false)
  })

  it('rejects direct execution while dependencies are unfinished, but accepts a planning model', async () => {
    await conversations.create('claude', [])
    const repo = initRepo('app')
    const dependency = readyTask('Schema', [repo])
    const task = service.update({ id: readyTask('Use schema', [repo]).id, dependsOn: [dependency.id] })
    await expect(service.start(task.id, false, undefined, { permissionMode: 'acceptEdits' })).rejects.toMatchObject({ reason: 'dependencies-unfinished' })
    expect(service.get(task.id).conversationId).toBeNull()
    const planning = await service.start(task.id, false, undefined, { permissionMode: 'plan', model: 'sonnet', effort: 'low' })
    expect(planning.status).toBe('pending')
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--model', 'sonnet', '--effort', 'low']))
    await settle()
    // Whoever takes over a task still waiting on others only plans it too.
    await expect(service.handoff(task.id, 'codex', '', undefined, { permissionMode: 'acceptEdits' })).rejects.toMatchObject({ reason: 'chat-option-invalid' })
    service.move(dependency.id, 'done')
    const running = await service.start(task.id)
    expect(running.status).toBe('running')
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--model', 'sonnet', '--effort', 'low']))
  })

  it('honors an explicitly allowed bypass mode without forcing a plan', async () => {
    const task = readyTask('Trusted edit', [initRepo('app')])
    await service.start(task.id, true, undefined, { permissionMode: 'bypass' })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
    expect(told(task.id)).toContain('直接开始实现')
  })

  describe('run records', () => {
    const verdicts = (taskId: string) => runs.forTask(taskId).map(({ kind, endedBy, outcome }) => ({ kind, endedBy, outcome }))

    it('keeps each run, how it ended, and the user accepting the result', async () => {
      const task = readyTask('Accept me', [initRepo('app')])
      expect(runs.forTask(task.id)).toEqual([])
      await service.start(task.id)
      expect(runs.forTask(task.id)).toMatchObject([{ kind: 'run', agent: 'claude', endedAt: null, outcome: null }])
      await handIn(task.id)
      service.move(task.id, 'done')
      expect(runs.forTask(task.id)).toMatchObject([{ endedBy: 'submit', outcome: 'accepted' }])
    })

    it('marks a run sent back by a message, and the last one given up by a redo', async () => {
      const task = readyTask('Redo me', [initRepo('app')])
      await service.start(task.id)
      await handIn(task.id)
      await message(task.id, 'again')
      await handIn(task.id)
      await service.redo(task.id, 'wrong approach')
      await settle()
      expect(verdicts(task.id)).toEqual([
        { kind: 'run', endedBy: 'submit', outcome: 'continued' },
        { kind: 'continue', endedBy: 'submit', outcome: 'redone' }
      ])
    })

    it('keeps an accepted run accepted when the task reopens, and a run closed mid-way out of the verdicts', async () => {
      const task = readyTask('Reopen me', [initRepo('app')])
      await service.start(task.id)
      await handIn(task.id)
      service.move(task.id, 'done')
      await service.resumeChat(task.id)
      service.move(task.id, 'done')
      expect(verdicts(task.id)).toEqual([
        { kind: 'run', endedBy: 'submit', outcome: 'accepted' },
        { kind: 'continue', endedBy: 'closed', outcome: 'closed' }
      ])
    })
  })

  it('starts a task\'s branch where it picked, which it may change only until the branch exists', async () => {
    const repo = initRepo('app')
    const other = initRepo('web')
    git(repo, 'branch', 'release/2.4')
    const release = git(repo, 'rev-parse', 'release/2.4')
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'main moved on')
    const task = readyTask('Patch release', [repo, other])

    const picked = service.update({ id: task.id, starts: [{ path: repo, ref: 'refs/heads/release/2.4' }] })
    expect(picked.repos.map((each) => each.startRef)).toEqual(['refs/heads/release/2.4', null])
    expect(() => service.update({ id: task.id, starts: [{ path: repo, ref: 'release/2.4' }] })).toThrow(expect.objectContaining({ reason: 'invalid-start' }))
    expect(() => service.update({ id: task.id, starts: [{ path: dir, ref: null }] })).toThrow(expect.objectContaining({ reason: 'repo-not-found' }))
    // Reordering the projects keeps what each picked.
    expect(service.update({ id: task.id, repos: [other, repo] }).repos.map((each) => each.startRef)).toEqual([null, 'refs/heads/release/2.4'])
    service.update({ id: task.id, repos: [repo, other] })

    const options = await service.startOptions(task.id)
    expect(options.map((each) => [each.path, each.git, each.fallback])).toEqual([[repo, true, null], [other, true, null]])
    expect(options[0]?.refs).toContain('refs/heads/release/2.4')

    const running = await service.start(task.id)
    expect(git(running.repos[0]!.worktreePath!, 'rev-parse', 'HEAD')).toBe(release)
    expect(running.repos[0]?.start).toMatchObject({ ref: 'release/2.4', commit: release, note: null })
    await handIn(task.id)
    expect(() => service.update({ id: task.id, starts: [{ path: repo, ref: null }] })).toThrow(expect.objectContaining({ reason: 'branch-exists' }))
    // A redo starts the same branches again, from the same picks.
    service.move(task.id, 'done')
    const redone = await service.redo(task.id, undefined)
    expect(redone.repos.map((each) => [each.startRef, each.branch])).toEqual(running.repos.map((each) => [each.startRef, each.branch]))
    expect(git(redone.repos[0]!.worktreePath!, 'rev-parse', 'HEAD')).toBe(release)
    expect(redone.repos[0]?.start).toMatchObject({ ref: 'release/2.4', commit: release })
  })

  it('gives the agent a reference project to read only, with no worktree, until it is made one to edit', async () => {
    const repo = initRepo('app')
    const other = initRepo('web')
    const task = readyTask('Touch one, read the other', [repo, other])
    service.update({ id: task.id, starts: [{ path: other, ref: 'HEAD' }] })

    expect(() => service.update({ id: task.id, references: [{ path: repo, reference: true }] })).toThrow(expect.objectContaining({ reason: 'primary-reference' }))
    // Only read where it is, it drops the start picked for its branch.
    const picked = service.update({ id: task.id, references: [{ path: other, reference: true }] })
    expect(picked.repos.map((each) => [Boolean(each.reference), each.startRef])).toEqual([[false, null], [true, null]])
    expect(service.get(task.id).repos[1]?.reference).toBe(true)
    expect(() => service.update({ id: task.id, starts: [{ path: other, ref: 'HEAD' }] })).toThrow(expect.objectContaining({ reason: 'repo-reference' }))

    const running = await service.start(task.id)
    expect(running.repos[1]).toMatchObject({ worktreePath: null, branch: null, reference: true })
    const chat = conversations.get(running.conversationId!)
    expect(chat.projectPaths).toEqual([realpathSync(running.repos[0]!.worktreePath!)])
    expect(chat.referencePaths).toEqual([realpathSync(other)])
    expect(daemon.spawns.at(-1)?.args.join(' ')).toContain(`Edit(/${realpathSync(other)}/**)`)
    expect((await service.branches(task.id)).map((head) => head.path)).toEqual([repo])
    await handIn(task.id)

    // Made one to edit, it gets its worktree on the next start.
    const edited = service.update({ id: task.id, references: [{ path: other, reference: false }], starts: [{ path: other, ref: 'HEAD' }] })
    expect(edited.repos[1]).toMatchObject({ startRef: 'HEAD' })
    expect(edited.repos[1]?.reference).toBeFalsy()
  })

  it('lets a cleaned worktree go, and lays it out again from its branch when the task goes on', async () => {
    const repo = initRepo('app')
    const task = readyTask('Clean me', [repo])
    // The agent is still at work on its first message.
    daemon.reply = () => {}
    const run = await service.start(task.id)
    const worktree = run.repos[0]!.worktreePath!
    git(worktree, 'commit', '-q', '--allow-empty', '-m', 'work')

    // An agent at work keeps its worktree; an idle one is stopped for it to go.
    await expect(service.releaseAgent(task.id)).rejects.toMatchObject({ reason: 'worktree-in-use' })
    const session = sessionOf(task.id)
    daemon.emit(session, turnEnd)
    await handIn(task.id)
    service.move(task.id, 'done')
    await service.releaseAgent(task.id)
    expect(daemon.killed).toEqual([{ sessionId: session, force: false }])
    git(repo, 'worktree', 'remove', worktree)
    service.forgetWorktree(task.id, worktree)
    expect(service.get(task.id).repos[0]).toMatchObject({ worktreePath: null, branch: run.repos[0]!.branch })
    const resumed = await service.resumeChat(task.id)
    expect(resumed.repos[0]?.worktreePath).toBe(worktree)
    expect(git(worktree, 'log', '-1', '--format=%s')).toBe('work')
  })

  it('reads a task\'s changes from its worktree, and diffs only the task\'s own repos', async () => {
    const repo = initRepo('app')
    const task = readyTask('Add theme', [repo])
    expect((await service.changes(task.id))[0]).toMatchObject({ base: null, files: [] })
    const running = await service.start(task.id)
    writeFileSync(path.join(running.repos[0]!.worktreePath!, 'theme.css'), 'body {}\n')
    expect((await service.changes(task.id))[0]?.files).toEqual([
      { path: 'theme.css', oldPath: null, kind: 'untracked', additions: null, deletions: null }
    ])
    expect((await service.diff(task.id, repo, 'theme.css')).diff).toContain('+body {}')
    await expect(service.diff(task.id, dir, 'theme.css')).rejects.toMatchObject({ reason: 'repo-not-found' })
  })

  it('reads branches from the task\'s worktrees only, once its start has made them', async () => {
    const repo = initRepo('app')
    const task = readyTask('Add dark mode', [repo])
    expect(await service.branches(task.id)).toEqual([{ path: repo, branch: null, detached: false }])
    const running = await service.start(task.id)
    writeFileSync(path.join(running.repos[0]!.worktreePath!, 'theme.css'), '')
    expect(await service.branches(task.id)).toEqual([
      { path: repo, branch: running.repos[0]!.branch, detached: false, upstream: null, ahead: 0, behind: 0, changes: 1 }
    ])
  })

  it('attaches images in order, checks each file, and carries them into a redo', async () => {
    const first = await attachments.put(pngBytes(40, 30))
    const second = await attachments.put(gifBytes(8, 8))
    const task = await service.createTask({ title: 'Fix layout', images: [{ id: first.id, name: '登录页' }] })
    expect(task.images).toEqual([{ id: first.id, name: '登录页', width: 40, height: 30 }])

    const [a, b] = await Promise.all([
      service.addImages(task.id, [{ id: second.id, name: '' }]),
      service.addImages(task.id, [{ id: first.id, name: 'again' }])
    ])
    expect([a, b].map((each) => each.images.length)).toContain(2)
    expect(service.get(task.id).images.map((image) => image.id)).toEqual([first.id, second.id])
    await expect(service.addImages(task.id, [{ id: `${'c'.repeat(64)}.png`, name: '' }])).rejects.toMatchObject({
      reason: 'attachment-not-found'
    })
    await expect(service.createTask({ title: 'x', images: [{ id: `${'c'.repeat(64)}.png`, name: '' }] })).rejects.toMatchObject({
      reason: 'attachment-not-found'
    })
    expect(service.list().map((each) => each.title)).toEqual(['Fix layout'])

    expect(service.updateImage(task.id, second.id, ' 弹窗 ').images[1]?.name).toBe('弹窗')
    store.update(task.id, { status: 'done' })
    expect((await service.redo(task.id, undefined)).images.map((image) => image.name)).toEqual(['登录页', '弹窗'])
    expect(service.removeImage(task.id, first.id).images.map((image) => image.id)).toEqual([second.id])
  })

  it('points the agent at the images, the user\'s first and an issue\'s fenced off', async () => {
    const repo = initRepo('app')
    const mine = await attachments.put(pngBytes(40, 30))
    const theirs = await attachments.put(gifBytes(8, 8))
    const source = { provider: 'jira', instance: 'default', name: 'Jira', key: 'PROJ-7', url: 'https://acme.atlassian.net/browse/PROJ-7' }
    const snapshot = { markdown: '见截图', fetchedAt: 0, images: [{ id: theirs.id, name: 'shot.gif', width: 8, height: 8 }] }
    const task = service.importTask({ title: 'Fix', agent: 'claude', source, snapshot })
    await service.addImages(task.id, [{ id: mine.id, name: '登录页' }])
    service.update({ id: task.id, repos: [repo] })

    await service.start(task.id)
    const prompt = told(task.id)
    expect(prompt).toContain(`任务附了 1 张图片，开始前先用读取文件的工具查看（如果它们已经附在这条消息里，直接看即可）：\n- 图 1 登录页：${path.join(dir, mine.id)}`)
    expect(prompt).toMatch(new RegExp(`<untrusted-source[^>]*>[\\s\\S]*- shot.gif：${path.join(dir, theirs.id).replace(/[.]/g, '\\.')}[\\s\\S]*</untrusted-source>`))
    // The user's image goes along with the message too; the issue's only by path.
    const [first] = daemon.written(sessionOf(task.id)).filter((frame) => userText(frame).length > 0)
    expect(JSON.stringify(first).match(/"type":"image"/g)).toHaveLength(1)
    const args = daemon.spawns.at(-1)?.args ?? []
    const [mineRule, theirsRule, pastedRule] = args[args.indexOf('--allowedTools') + 1]?.split(',') ?? []
    expect([mineRule, theirsRule]).toEqual([`Read(/${path.join(dir, mine.id)})`, `Read(/${path.join(dir, theirs.id)})`])
    // And what the user pastes into the conversation as files, in its own folder.
    expect(pastedRule).toMatch(/\/pasted\/[0-9a-f-]{36}\/\*\*\)$/)
  })

  it('puts the issue key of an imported task into its branch, where Jira looks for it', async () => {
    const repo = initRepo('app')
    const source = { provider: 'jira', instance: 'default', name: 'Jira', key: 'PROJ-7', url: 'https://acme.atlassian.net/browse/PROJ-7' }
    const task = service.importTask({ title: '菜单分类排序', agent: 'claude', source, snapshot: { markdown: 'x', fetchedAt: 0, images: [] } })
    service.update({ id: task.id, repos: [repo] })

    const running = await service.start(task.id)
    expect(running.repos[0]?.branch).toBe(`antumi/PROJ-7-${task.id.slice(0, 8)}`)
    expect(told(task.id)).toContain('这个任务来自 Jira PROJ-7')
  })

  it('names the branch of a task titled in Chinese in English words from its agent, made ahead of the start', async () => {
    const asked: string[] = []
    let answer: (words: string | null) => void = () => {}
    service.setBranchNamer(async (agent, title) => {
      asked.push(`${agent}:${title}`)
      return title === '修复登录超时' ? 'fix-login-timeout' : new Promise((resolve) => { answer = resolve })
    })
    const repo = initRepo('app')
    // A title git can name a branch after asks nothing.
    service.create({ title: 'Add dark mode', agent: 'claude' })
    const task = service.create({ title: '修复登录超时', repos: [repo] })
    expect(asked).toEqual([])
    service.update({ id: task.id, agent: 'claude' })
    await settle()
    expect(service.get(task.id).slug).toBe('fix-login-timeout')

    // Words for the old title go with it; a start waits for those of the new one.
    service.update({ id: task.id, title: '修复登出' })
    expect(service.get(task.id).slug).toBeNull()
    const starting = service.start(task.id)
    await settle()
    answer('fix-logout')
    const running = await starting
    expect(running.repos[0]?.branch).toBe(`antumi/${task.id.slice(0, 8)}-fix-logout`)
    expect(asked).toEqual(['claude:修复登录超时', 'claude:修复登出'])
  })

  it('works in place for a plain folder workspace', async () => {
    const folder = path.join(dir, 'notes')
    mkdirSync(folder)
    const running = await service.start(readyTask('Tidy notes', [folder]).id)
    expect(running.repos[0]?.worktreePath).toBeNull()
    expect(daemon.spawns[0]?.cwd).toBe(realpathSync(folder))
  })

  it('works in the primary worktree with isolated additional repos', async () => {
    const api = initRepo('api')
    const web = initRepo('web')
    const task = readyTask('Rename user id', [api, web])

    const running = await service.start(task.id)
    const taskDir = path.join(dir, 'worktrees', task.id.slice(0, 8))
    expect(running.repos.map((repo) => repo.worktreePath)).toEqual([path.join(taskDir, 'api'), path.join(taskDir, 'web')])
    expect(daemon.spawns[0]?.cwd).toBe(realpathSync(path.join(taskDir, 'api')))
    const args = daemon.spawns[0]?.args ?? []
    expect(args[args.indexOf('--add-dir') + 1]).toBe(realpathSync(path.join(taskDir, 'web')))
    expect(git(path.join(taskDir, 'web'), 'branch', '--show-current')).toBe(running.repos[1]?.branch)
    expect(told(task.id)).toContain(`主项目：.（${path.join(taskDir, 'api')}） ← ${api}`)
    for (const repo of running.repos) {
      writeFileSync(path.join(repo.worktreePath!, 'draft.txt'), repo.path)
      expect(existsSync(path.join(repo.path, 'draft.txt'))).toBe(false)
      expect((await service.diff(task.id, repo.path, 'draft.txt')).diff).toContain(`+${repo.path}`)
    }
    expect((await service.changes(task.id)).map((repo) => repo.files.length)).toEqual([1, 1])
  })

  it('rejects project edits while a start or a resume is under way', async () => {
    const api = initRepo('api')
    const web = initRepo('web')
    const task = readyTask('Starting', [api, web])
    const starting = service.start(task.id)
    expect(() => service.update({ id: task.id, repos: [web, api] })).toThrow(expect.objectContaining({ reason: 'run-in-progress' }))
    await starting
    await handIn(task.id)
    const resuming = service.resumeChat(task.id)
    expect(() => service.update({ id: task.id, repos: [] })).toThrow(expect.objectContaining({ reason: 'run-in-progress' }))
    await resuming
  })

  it('rejects changes to a cancelled task through the service', async () => {
    const task = readyTask('Cancelled', [initRepo('api')])
    await service.cancel(task.id, undefined)
    expect(() => service.update({ id: task.id, repos: [] })).toThrow(expect.objectContaining({ reason: 'task-abandoned' }))
  })

  it('cancels a task any time before it is accepted, and reopens it where its work stands', async () => {
    const idle = readyTask('Never mind', [initRepo('api')])
    expect(await service.cancel(idle.id, '不需要了')).toMatchObject({ status: 'abandoned', abandonReason: '不需要了' })
    await expect(service.cancel(idle.id, undefined)).rejects.toMatchObject({ reason: 'task-cancelled' })
    expect(service.reopen(idle.id)).toMatchObject({ status: 'pending', abandonReason: null })
    expect(() => service.reopen(idle.id)).toThrow(expect.objectContaining({ reason: 'not-cancelled' }))

    const working = readyTask('Half way', [initRepo('app')])
    const run = await service.start(working.id)
    await settle()
    await service.cancel(working.id, undefined)
    // Its agent stops; its chat and worktree stay, for it to come back to.
    expect(conversations.get(run.conversationId ?? '').sessionId).toBeNull()
    expect(existsSync(run.repos[0]?.worktreePath ?? '')).toBe(true)
    expect(service.reopen(working.id).status).toBe('review')
    service.move(working.id, 'done')
    await expect(service.cancel(working.id, undefined)).rejects.toMatchObject({ reason: 'task-done' })
  })

  it('refuses a plain folder next to other repos', async () => {
    const folder = path.join(dir, 'notes')
    mkdirSync(folder)
    const task = readyTask('Mixed', [initRepo('api'), folder])
    await expect(service.start(task.id)).rejects.toMatchObject({ reason: 'repo-not-git' })
    expect(daemon.spawns).toEqual([])
  })

  it('keeps repos fixed while the agent runs', async () => {
    const task = readyTask('Locked', [initRepo('api')])
    await service.start(task.id)
    expect(() => service.update({ id: task.id, repos: [] })).toThrow(expect.objectContaining({ reason: 'task-running' }))
  })

  it('changes its primary project only until its chat starts, and a redo starts afresh in that order', async () => {
    const api = initRepo('api')
    const web = initRepo('web')
    const task = readyTask('Primary', [api, web])
    const updated = service.update({ id: task.id, repos: [web, api] })
    expect(updated.repos.map((repo) => repo.path)).toEqual([web, api])
    const reopened = new TaskStore(path.join(dir, 'antumi.db'))
    try {
      expect(reopened.get(task.id)?.repos).toEqual(updated.repos)
    } finally {
      reopened.close()
    }

    const running = await service.start(task.id)
    const [primary, additional] = running.repos.map((repo) => repo.worktreePath ?? '')
    expect(daemon.spawns[0]?.cwd).toBe(realpathSync(primary ?? ''))
    const args = daemon.spawns[0]?.args ?? []
    expect(args[args.indexOf('--add-dir') + 1]).toBe(realpathSync(additional ?? ''))
    writeFileSync(path.join(primary ?? '', 'draft.txt'), 'keep me')
    // Its chat holds on to the primary from here on.
    await handIn(task.id)
    expect(() => service.update({ id: task.id, repos: [api, web] })).toThrow(expect.objectContaining({ reason: 'primary-fixed' }))

    // A redo starts over in the same worktrees, in the same order; what was left there is kept.
    const redo = await service.redo(task.id, undefined)
    expect(redo.repos.map((repo) => repo.path)).toEqual([web, api])
    expect(existsSync(path.join(primary ?? '', 'draft.txt'))).toBe(false)
    const kept = `${running.repos[0]?.branch}-try1`
    expect(redo.attempts[0]?.branches).toEqual([{ path: web, branch: kept }])
    expect(git(web, 'show', `${kept}:draft.txt`)).toBe('keep me')
    await service.start(redo.id)
    expect(daemon.spawns.at(-1)?.cwd).toBe(realpathSync(primary ?? ''))
  })

  it('hands its chat to another agent once its agent is idle, which goes on from what was said', async () => {
    const repo = initRepo('app')
    const running = await service.start(readyTask('Hand on', [repo]).id)
    await expect(service.handoff(running.id, 'claude', '')).rejects.toMatchObject({ reason: 'conversation-same-agent' })
    daemon.reply = () => {}
    await conversations.send(running.conversationId ?? '', 'still going')
    await expect(service.handoff(running.id, 'codex', '')).rejects.toMatchObject({ reason: 'chat-busy' })
    daemon.emit(sessionOf(running.id), turnEnd)
    await settle()
    const reviewing = await handIn(running.id)
    // Answers Codex's start like app-server: the handshake, then its thread.
    const handing = service.handoff(reviewing.id, 'codex', 'Check the tests')
    const codexSession = `pipe-${daemon.spawns.length + 1}`
    const asked = (method: string) => daemon.written(codexSession).some((frame) => JSON.stringify(frame).includes(`"method":"${method}"`))
    while (!asked('initialize')) await settle()
    daemon.emit(codexSession, { id: 'antumi-init', result: {} })
    while (!asked('thread/start')) await settle()
    daemon.emit(codexSession, { id: 'antumi-thread', result: { thread: { id: 'thread-1' } } })
    const handed = await handing
    expect(handed).toMatchObject({ agent: 'codex', status: 'running' })
    expect(conversations.get(handed.conversationId ?? '').agent).toBe('codex')
    const file = /移交文件 (\S+?)，/.exec(JSON.stringify(daemon.written(codexSession)))?.[1] ?? ''
    expect(readFileSync(file, 'utf8')).toEqual(expect.stringContaining('Check the tests'))
    expect(readFileSync(file, 'utf8')).toEqual(expect.stringContaining('still going'))
  })

  it('lets its chat drop an additional project, leaving that worktree on disk', async () => {
    const api = initRepo('api')
    const web = initRepo('web')
    const running = await service.start(readyTask('Drop one', [api, web]).id)
    await handIn(running.id)
    expect(service.update({ id: running.id, repos: [api] }).repos).toEqual([running.repos[0]])
    await service.resumeChat(running.id)
    expect(daemon.spawns).toHaveLength(2)
    expect(daemon.spawns.at(-1)?.args).not.toContain('--add-dir')
    expect(existsSync(running.repos[1]?.worktreePath ?? '')).toBe(true)
  })

  it('reserves existing same-name worktrees when its chat takes another project', async () => {
    for (const name of ['first', 'second', 'third']) mkdirSync(path.join(dir, name))
    const first = initRepo('first/app')
    const second = initRepo('second/app')
    const third = initRepo('third/app')
    const running = await service.start(readyTask('Same names', [first, second]).id)
    await handIn(running.id)
    // The new project comes before one whose worktree already took the next free name.
    service.update({ id: running.id, repos: [first, third, second] })
    const resumed = await service.resumeChat(running.id)
    expect([resumed.repos[0], resumed.repos[2]]).toEqual(running.repos)
    expect(new Set(resumed.repos.map((repo) => repo.worktreePath)).size).toBe(3)
    expect(git(resumed.repos[1]?.worktreePath ?? '', 'rev-parse', '--git-common-dir')).toBe(git(third, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
    expect(conversations.get(resumed.conversationId ?? '').projectPaths).toEqual(resumed.repos.map((repo) => realpathSync(repo.worktreePath ?? '')))
  })

  it('redoes a finished task in place: pending again on its branch started over, the work so far kept', async () => {
    const repo = initRepo('app')
    const task = readyTask('Attempt', [repo])
    const dependent = service.update({ id: service.create({ title: 'Later' }).id, dependsOn: [task.id] })
    await expect(service.redo(task.id, undefined)).rejects.toMatchObject({ reason: 'not-done' })

    const run = await service.start(task.id)
    const worktree = run.repos[0]?.worktreePath ?? ''
    const branch = run.repos[0]?.branch ?? ''
    git(worktree, 'commit', '-q', '--allow-empty', '-m', 'first go')
    writeFileSync(path.join(worktree, 'wip.txt'), 'half done')
    await handIn(task.id)
    const redone = await service.redo(task.id, '方向错了')

    expect(redone).toMatchObject({
      id: task.id, status: 'pending', plan: null, conversationId: run.conversationId,
      attempts: [{ reason: '方向错了', branches: [{ path: repo, branch: `${branch}-try1` }] }],
      repos: [{ worktreePath: worktree, branch }]
    })
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(git(worktree, 'status', '--porcelain')).toBe('')
    expect(git(repo, 'log', '-2', '--format=%s', `${branch}-try1`)).toBe('Antumi：第 1 次尝试里没提交的改动\nfirst go')
    expect(service.get(dependent.id).dependsOn).toEqual([task.id])
    await expect(service.redo(task.id, undefined)).rejects.toMatchObject({ reason: 'not-done' })
  })

  it('starts a redo afresh in its own chat, told why and where the last go is', async () => {
    const repo = initRepo('app')
    const task = readyTask('Attempt', [repo])
    const run = await service.start(task.id)
    git(run.repos[0]?.worktreePath ?? '', 'commit', '-q', '--allow-empty', '-m', 'first go')
    await handIn(task.id)
    await service.redo(task.id, '不该改表结构')
    const spawned = daemon.spawns.length

    const redone = await service.start(task.id)
    expect(daemon.spawns.length).toBe(spawned + 1)
    expect(redone).toMatchObject({ status: 'running', conversationId: run.conversationId, repos: [{ branch: run.repos[0]?.branch }] })
    expect(told(task.id)).toContain(`这个任务是从头重做：上一次尝试已放弃，原因是：不该改表结构。它的改动在分支 ${run.repos[0]?.branch}-try1 上`)
  })

  it('waits for dependencies, then starts from the branch they left behind', async () => {
    const repo = initRepo('app')
    const first = readyTask('Add api', [repo])
    const second = service.update({ id: readyTask('Use api', [repo]).id, dependsOn: [first.id.slice(0, 8)] })
    expect(second.dependsOn).toEqual([first.id])

    const firstRun = await service.start(first.id)
    const firstRepo = firstRun.repos[0]
    git(firstRepo?.worktreePath ?? '', 'commit', '-q', '--allow-empty', '-m', 'api from first')
    await handIn(first.id)
    // Under review the first task may still have failed: the second only plans, laying out nothing.
    expect(await service.start(second.id)).toMatchObject({ status: 'pending', repos: [{ worktreePath: null, branch: null }] })
    await settle()
    service.move(first.id, 'done')

    const secondRun = await service.start(second.id)
    expect(git(secondRun.repos[0]?.worktreePath ?? '', 'log', '--format=%s')).toContain('api from first')
    expect(told(second.id)).toContain(`${firstRepo?.branch}，本任务的分支从它拉出`)
  })

  it('starts from HEAD when several dependencies left branches in the same repo', async () => {
    const repo = initRepo('app')
    const done = async (title: string) => {
      const task = readyTask(title, [repo])
      const run = await service.start(task.id)
      git(run.repos[0]?.worktreePath ?? '', 'commit', '-q', '--allow-empty', '-m', `from ${title}`)
      await handIn(task.id)
      service.move(task.id, 'done')
      return run
    }
    const first = await done('first')
    const second = await done('second')
    const task = service.update({ id: readyTask('both', [repo]).id, dependsOn: [first.id, second.id] })

    const run = await service.start(task.id)
    const log = git(run.repos[0]?.worktreePath ?? '', 'log', '--format=%s')
    expect(log).not.toContain('from first')
    expect(log).not.toContain('from second')
    const prompt = told(task.id)
    expect(prompt).toContain(first.repos[0]?.branch)
    expect(prompt).toContain(second.repos[0]?.branch)
    expect(prompt).not.toContain('本任务的分支从它拉出')
  })

  it('tells whether a finished dependency has landed in the code being planned', async () => {
    const repo = initRepo('app')
    const first = readyTask('Add api', [repo])
    const firstRun = await service.start(first.id)
    git(firstRun.repos[0]?.worktreePath ?? '', 'commit', '-q', '--allow-empty', '-m', 'api')
    await handIn(first.id)

    // Nothing picked: planning reads the dependency's branch, which the task will stack on.
    const stacked = service.update({ id: readyTask('Use api', [repo]).id, dependsOn: [first.id] })
    await service.start(stacked.id)
    expect(told(stacked.id)).toContain('已执行但还没验收，结果可能还要改')
    expect(told(stacked.id)).toContain('改动已在当前代码里')

    // What the project has checked out is read where it is, which has the work only once it is merged.
    const here = readyTask('Use api here', [repo])
    service.update({ id: here.id, dependsOn: [first.id], starts: [{ path: repo, ref: 'HEAD' }] })
    await service.start(here.id)
    expect(daemon.spawns.at(-1)?.cwd).toBe(realpathSync(repo))
    expect(told(here.id)).toContain('上的改动还没进当前代码')
  })

  it('plans in a checkout of the start with no branch of its own, which goes once the task runs', async () => {
    const origin = initRepo('origin')
    const repo = path.join(dir, 'clone')
    execFileSync('git', ['clone', '-q', origin, repo])
    git(repo, 'checkout', '-q', '-b', 'feature/mine')
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'mine')
    const dependency = service.create({ title: 'First' })
    const task = service.update({ id: readyTask('Plan it', [repo]).id, dependsOn: [dependency.id] })
    const taskBranches = () => git(repo, 'branch', '--list', 'antumi/*')

    await service.start(task.id)
    const checkout = path.join(dir, 'worktrees', task.id.slice(0, 8), '.planning', 'clone')
    expect(daemon.spawns.at(-1)?.cwd).toBe(realpathSync(checkout))
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(git(repo, 'rev-parse', 'origin/HEAD'))
    expect(git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD')
    expect(taskBranches()).toBe('')
    expect(told(task.id)).toContain('的只读副本，任务分支将从这里拉出')
    await settle()

    store.update(dependency.id, { status: 'done' })
    const running = await service.start(task.id)
    expect(existsSync(checkout)).toBe(false)
    expect(existsSync(running.repos[0]!.worktreePath!)).toBe(true)
    expect(git(repo, 'worktree', 'list')).not.toContain('.planning')
  })

  it('rejects dependency loops, including on itself', () => {
    const a = service.create({ title: 'A' })
    const b = service.create({ title: 'B' })
    service.update({ id: b.id, dependsOn: [a.id] })
    expect(() => service.update({ id: a.id, dependsOn: [b.id] })).toThrow(
      expect.objectContaining({ reason: 'dependency-cycle' })
    )
    expect(() => service.update({ id: a.id, dependsOn: [a.id] })).toThrow(
      expect.objectContaining({ reason: 'dependency-cycle' })
    )
  })

  it('drops a deleted task from its dependents and tells clients', async () => {
    const a = service.create({ title: 'A' })
    const b = service.update({ id: service.create({ title: 'B' }).id, dependsOn: [a.id] })
    events = []
    await service.delete(a.id)
    expect(service.get(b.id).dependsOn).toEqual([])
    expect(events).toEqual([
      { type: 'deleted', id: a.id },
      { type: 'changed', task: service.get(b.id) }
    ])
  })

  it('remembers projects added to any task, even after the task is gone', async () => {
    const task = service.create({ title: 'A' })
    service.update({ id: task.id, repos: [dir] })
    await service.delete(task.id)
    expect(projects.recent()).toEqual([dir])
  })

  it('starts a runnable task in its worktree, planning first, and keeps the plan it approves', async () => {
    const task = readyTask('Chat me', [initRepo('app')])
    const started = await service.start(task.id)
    expect(started.status).toBe('running')
    const worktree = started.repos[0]?.worktreePath ?? ''
    expect(worktree).not.toBe('')
    expect(daemon.spawns.at(-1)).toMatchObject({ command: 'claude', cwd: realpathSync(worktree) })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--permission-mode', 'plan']))
    expect(told(task.id)).toContain('然后给出实现计划')
    expect(conversations.list()).toEqual([])

    daemon.emit(sessionOf(task.id), exitPlanMode('plan-1'))
    await settle()
    await conversations.respond(started.conversationId ?? '', 'plan-1', { decision: 'allowForSession' })
    expect(service.get(task.id).plan).toMatchObject({ markdown: '# Plan', agent: 'claude', approved: true, requestId: 'plan-1' })
  })

  it('starts a task on the provider its launch names, which its conversation then keeps', async () => {
    const credentials = new CredentialStore(path.join(dir, 'credentials.json'))
    await credentials.load()
    const providers = new ModelProviderStore(path.join(dir, 'model-providers.json'), credentials)
    await providers.load()
    conversations.setModelProviders(providers)
    const { id: providerId } = await providers.save({
      id: null, name: 'Gateway', preset: 'custom', agents: ['claude'], apiKey: 'sk-task-key',
      anthropic: { baseUrl: 'http://127.0.0.1:4000', auth: 'auth_token', env: {} }, openai: null,
      models: [{ id: 'gw-big', label: null, contextWindow: null, maxOutput: null, efforts: [] }], defaultModel: 'gw-big', smallModel: 'gw-big'
    })
    const task = readyTask('On a provider', [initRepo('app')])
    const started = await service.start(task.id, undefined, undefined, { modelProvider: providerId })
    expect(daemon.spawns.at(-1)?.env).toMatchObject({ ANTHROPIC_AUTH_TOKEN: 'sk-task-key' })
    expect(conversations.get(started.conversationId ?? '')).toMatchObject({ modelProvider: providerId, route: { reason: 'served' } })
    expect(service.get(task.id).launch.modelProvider).toBe(providerId)
    // A launch saved later keeps the conversation's provider; a start naming another is refused.
    expect(service.update({ id: task.id, launch: { permissionMode: 'ask', modelProvider: null } }).launch.modelProvider).toBe(providerId)
    const again = { cwd: started.repos[0]?.worktreePath ?? '', extraDirs: [], planOnly: false, session: 'resume' as const }
    await expect(conversations.startForTask({ id: task.id, title: task.title, agent: 'claude' }, { ...again, modelProvider: null })).rejects.toMatchObject({ reason: 'model-provider-fixed' })
  })

  it('takes a task by the id prefix the CLI names it by', async () => {
    const task = readyTask('Chat me', [initRepo('app')])
    const prefix = task.id.slice(0, 8)
    const started = await service.start(prefix)
    expect(started.repos[0]?.worktreePath).toBeTruthy()
    expect(conversations.get(started.conversationId ?? '').taskId).toBe(task.id)
    await settle()
    expect(service.submit(prefix).status).toBe('review')
    expect((await service.resumeChat(prefix)).status).toBe('running')
  })

  it('works in the primary project and reaches the others as additional directories', async () => {
    const api = initRepo('api')
    const web = initRepo('web')
    const dependency = readyTask('First', [api])
    const created = service.create({ title: 'Both' })
    const task = service.update({ id: created.id, details: 'x', repos: [web, api], agent: 'claude', dependsOn: [dependency.id] })

    // Planning reads the projects where they are, the primary one as the cwd.
    await service.start(task.id)
    expect(daemon.spawns.at(-1)).toMatchObject({ cwd: realpathSync(web) })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--add-dir', realpathSync(api)]))

    store.update(dependency.id, { status: 'done' })
    const running = await service.start(task.id)
    const [primary, additional] = running.repos.map((repo) => realpathSync(repo.worktreePath ?? ''))
    expect(daemon.spawns.at(-1)).toMatchObject({ cwd: primary })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--add-dir', additional]))
    expect(conversations.get(running.conversationId ?? '').projectPaths).toEqual([primary, additional])
  })

  it('keeps a chat task\'s primary project and lets its agent take the projects added meanwhile', async () => {
    const api = initRepo('api')
    const web = initRepo('web')
    const dependency = readyTask('First', [api])
    const created = service.create({ title: 'Both' })
    const task = service.update({ id: created.id, details: 'x', repos: [api], agent: 'claude', dependsOn: [dependency.id] })
    await service.start(task.id)
    await settle()
    const spawned = daemon.spawns.length

    expect(() => service.update({ id: task.id, repos: [web, api] })).toThrow(expect.objectContaining({ reason: 'primary-fixed' }))
    expect(() => service.update({ id: task.id, repos: [] })).toThrow(expect.objectContaining({ reason: 'primary-fixed' }))
    // An additional project reaches the agent with the next message.
    service.update({ id: task.id, repos: [api, web] })
    await service.resumeChat(task.id)
    expect(daemon.spawns).toHaveLength(spawned + 1)
    expect(daemon.spawns.at(-1)).toMatchObject({ cwd: realpathSync(api) })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--resume', '--add-dir', realpathSync(web)]))
    // Nothing changed since: the agent is kept.
    await service.resumeChat(task.id)
    expect(daemon.spawns).toHaveLength(spawned + 1)
  })

  it('adds up a chat run\'s turns when it is handed in, and starts another when it goes on', async () => {
    daemon.reply = (sessionId, text) => {
      daemon.emit(sessionId, { type: 'assistant', message: { id: `msg-${text}`, content: [{ type: 'text', text: 'ok' }] }, parent_tool_use_id: null })
      daemon.emit(sessionId, {
        type: 'result', subtype: 'success', is_error: false, result: 'ok', terminal_reason: 'completed', duration_ms: 30,
        usage: { input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 20 }
      })
    }
    const task = readyTask('Count me', [initRepo('app')])
    const started = await service.start(task.id)
    await settle()
    await conversations.send(started.conversationId ?? '', 'more')
    await settle()
    service.submit(task.id)
    const [run] = runs.forTask(task.id)
    // Input counts cached tokens too, as the chat's own turn usage does; the model is the stage's.
    expect(run).toMatchObject({ kind: 'run', endedBy: 'submit', model: 'sonnet', inputTokens: 300, outputTokens: 40, totalTokens: 340, workMs: 60 })

    await service.resumeChat(task.id)
    expect(runs.forTask(task.id).map(({ kind, outcome }) => [kind, outcome])).toEqual([['run', 'continued'], ['continue', null]])
  })

  it('keeps a chat task running when its agent goes, hands it in when the user says, and goes on by message', async () => {
    const repo = initRepo('app')
    const task = readyTask('Chat me', [repo])
    const started = await service.start(task.id)
    await settle()
    // The first turn is over: the agent waits on the user.
    expect(service.get(task.id).awaitingInput).toBe(true)
    daemon.exit(sessionOf(task.id), 0)
    await settle()
    expect(service.get(task.id)).toMatchObject({ status: 'running', awaitingInput: true })

    const resumed = await service.resumeChat(task.id)
    expect(resumed.status).toBe('running')
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--resume']))
    daemon.reply = () => {}
    await conversations.send(started.conversationId ?? '', 'still going')
    await settle()
    expect(() => service.submit(task.id)).toThrow(expect.objectContaining({ reason: 'agent-working' }))
    daemon.exit(sessionOf(task.id), 0)
    await settle()
    expect(service.submit(task.id).status).toBe('review')

    // Going on from review lays out a worktree the user removed and reopens the task.
    const worktree = service.get(task.id).repos[0]?.worktreePath ?? ''
    git(repo, 'worktree', 'remove', '--force', worktree)
    const reopened = await service.resumeChat(task.id)
    expect(reopened.status).toBe('running')
    expect(existsSync(worktree)).toBe(true)
  })

  it('only plans while a dependency is unfinished, keeps the plan, and carries it out once it is done', async () => {
    const repo = initRepo('app')
    const dependency = readyTask('First', [repo])
    const second = service.create({ title: 'Second' })
    const task = service.update({ id: second.id, details: 'x', repos: [repo], agent: 'claude', dependsOn: [dependency.id] })
    const planning = await service.start(task.id)
    expect(planning).toMatchObject({ status: 'pending', repos: [{ worktreePath: null, branch: null }] })
    expect(git(repo, 'branch', '--list', 'antumi/*')).toBe('')
    expect(daemon.spawns.at(-1)).toMatchObject({ cwd: realpathSync(repo) })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--disallowedTools']))
    expect(told(task.id)).toContain('这次只读代码、讨论和规划')
    await expect(service.start(task.id)).rejects.toMatchObject({ reason: 'planning' })

    daemon.emit(sessionOf(task.id), exitPlanMode('plan-1'))
    await settle()
    const [stage] = conversations.stages(planning.conversationId ?? '')
    const saved = await service.savePlan(task.id, stage?.id ?? '', 'plan-1')
    expect(saved.plan).toMatchObject({ markdown: '# Plan', approved: false, stageId: stage?.id })

    store.update(dependency.id, { status: 'done' })
    const running = await service.start(task.id)
    expect(running.status).toBe('running')
    expect(running.repos[0]?.worktreePath).toBeTruthy()
    const args = daemon.spawns.at(-1)?.args ?? []
    expect(args).not.toContain('--resume')
    expect(args).not.toContain('--disallowedTools')
    expect(told(task.id)).toContain('<saved-plan>')
  })

  it('goes on from review with a note, redoes in the same chat, and deletes the chat with its task', async () => {
    const task = readyTask('Chat me', [initRepo('app')])
    const started = await service.start(task.id)
    await settle()
    service.submit(task.id)
    await message(task.id, 'rename the button')
    expect(service.get(task.id).status).toBe('running')
    expect(told(task.id)).toContain('rename the button')
    await settle()
    service.submit(task.id)
    const redone = await service.redo(task.id, 'wrong approach')
    expect(redone.conversationId).toBe(started.conversationId)
    await settle()
    await service.delete(task.id)
    expect(() => conversations.get(started.conversationId ?? '')).toThrow(expect.objectContaining({ reason: 'conversation-not-found' }))
    expect(existsSync(started.repos[0]?.worktreePath ?? '')).toBe(true)
  })

  describe('with a project config', () => {
    // Runs nothing: setup and check end with the codes the test sets.
    function projectTerminals() {
      const ran: { cwd: string; command: string; purpose: string | undefined }[] = []
      const codes: Record<string, number> = {}
      const commands = new Map<string, string>()
      // Holds every command until released, so a test sees what happens while one runs.
      let release: () => void = () => {}
      let held: Promise<void> = Promise.resolve()
      return {
        ran,
        codes,
        hold: () => { held = new Promise((resolve) => { release = resolve }) },
        release: () => release(),
        run: async (conversationId: string, cwd: string, command: string, options: { purpose?: 'setup' | 'check' } = {}): Promise<Terminal> => {
          ran.push({ cwd, command, purpose: options.purpose })
          const id = randomUUID()
          commands.set(id, command)
          return { id, sessionId: command, cwd, title: command, createdAt: 0, conversationId, command }
        },
        waitForExit: async (id: string) => { await held; return codes[commands.get(id) ?? ''] ?? 0 },
        read: async (_: string, id: string) => ({ id, command: '', output: 'test failed: login.spec', truncated: false, running: false, exitCode: 1 }),
        kill: async () => {}
      }
    }

    function configured(name: string): string {
      const repo = initRepo(name)
      mkdirSync(path.join(repo, '.antumi'))
      writeFileSync(path.join(repo, '.antumi', 'project.json'), JSON.stringify({ copy: ['.env'], setup: 'pnpm install', check: 'pnpm test' }))
      writeFileSync(path.join(repo, '.env'), 'TOKEN=1')
      return repo
    }

    it('asks for trust first, sets the worktree up before the agent hears of it, and checks before review', async () => {
      const configs = new ProjectConfigStore(path.join(dir, 'project-trust.json'))
      const terminals = projectTerminals()
      service.setWorktreeSetup(new WorktreeSetup(configs, terminals))
      const repo = configured('app')
      const task = readyTask('Set up', [repo])

      await expect(service.start(task.id)).rejects.toMatchObject({ reason: 'project-config-untrusted' })
      expect(service.get(task.id).repos[0]?.worktreePath).toBeNull()
      await configs.trust(repo, (await configs.info(repo))?.hash ?? '')

      terminals.hold()
      const starting = service.start(task.id)
      while (terminals.ran.length === 0) await settle()
      await settle()
      // The agent is up but has nothing to answer yet: the task runs, and is not waiting on the user,
      // even as the agent reports itself idle.
      service.chatChanged(conversations.get(service.get(task.id).conversationId ?? ''))
      expect(service.get(task.id)).toMatchObject({ status: 'running', awaitingInput: false })
      expect(told(task.id)).toBe('')
      terminals.release()
      await starting
      await settle()
      const worktree = service.get(task.id).repos[0]?.worktreePath ?? ''
      expect(readFileSync(path.join(worktree, '.env'), 'utf8')).toBe('TOKEN=1')
      expect(terminals.ran).toEqual([{ cwd: worktree, command: 'pnpm install', purpose: 'setup' }])
      expect(told(task.id)).toContain('`pnpm test`')

      terminals.codes['pnpm test'] = 1
      await expect(service.submitChecked(task.id)).rejects.toMatchObject({ reason: 'check-failed' })
      expect(service.get(task.id).status).toBe('running')
      await settle()
      expect(told(task.id)).toContain('test failed: login.spec')

      terminals.codes['pnpm test'] = 0
      expect((await service.submitChecked(task.id)).status).toBe('review')
      expect(terminals.ran.filter((run) => run.purpose === 'check')).toHaveLength(2)
    })
  })
})
