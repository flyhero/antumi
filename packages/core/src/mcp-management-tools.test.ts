import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CORE_FEATURES, MANAGEMENT_READ_TOOLS, MANAGEMENT_TOOLS, SquadRun, Task, createRpcClient, rpcSchemas,
  type Conversation, type RpcConnection, type SkillRepo
} from '@antumi/protocol'
import { antumiReadTools } from './agent-command'
import { AgentProfileService } from './agent-profile-service'
import { AgentProfileStore } from './agent-profile-store'
import { AttachmentStore } from './attachment-store'
import { ChatCommandStore } from './chat-commands'
import { ConversationService } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { managementToolsOverCore } from './mcp-management-tools'
import { createMcpHandler } from './mcp-server'
import { ProjectRegistry } from './project-registry'
import { RoutineService } from './routine-service'
import { ScheduleService } from './schedule-service'
import { SkillsLibrary } from './skills-library'
import { SquadStore } from './squad-store'
import { TaskStore } from './task-store'

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const Frame = z.object({ id: z.number(), method: z.string(), params: z.unknown() })
const team = {
  name: 'Delivery', leaderId: id(1), members: [
    { id: id(1), name: 'Lead', agent: 'claude', capability: 'readOnly' },
    { id: id(2), name: 'Developer', agent: 'codex', capability: 'develop' }
  ]
}
const command = { name: 'review', description: 'Review changes', prompt: 'Review $ARGUMENTS', projectPath: null }
const routine = { title: 'Daily review', schedule: { kind: 'daily', time: '09:00' }, target: { kind: 'new', agent: 'claude', projectPaths: [], text: 'Review changes' } }

describe('Antumi management MCP', () => {
  let root: string
  let tasks: TaskStore
  let conversationStore: ConversationStore
  let projects: ProjectRegistry
  let conversations: ConversationService
  let profiles: AgentProfileService
  let squads: SquadStore
  let commands: ChatCommandStore
  let schedules: ScheduleService
  let routines: RoutineService
  let skills: SkillsLibrary
  let rpc: RpcConnection
  let conversationId: string
  let patch: Partial<Conversation>
  let squadRun: SquadRun | null
  let task: Task
  let tools: Awaited<ReturnType<typeof managementToolsOverCore>>
  let calls: Array<{ method: string; params: unknown }>
  let skillChanges: Array<readonly SkillRepo[]>

  const withCore = async <T>(action: (connection: RpcConnection) => Promise<T>) => action(rpc)
  const use = (name: string, args: Record<string, unknown> = {}) => tools.find((entry) => entry.spec.name === name)!.run(args)
  const output = (result: { content: Array<{ text: string }> }) => result.content.map((part) => part.text).join('')

  beforeEach(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-mcp-management-'))
    const file = path.join(root, 'antumi.db')
    tasks = new TaskStore(file)
    conversationStore = new ConversationStore(file)
    projects = new ProjectRegistry(file)
    conversations = new ConversationService(conversationStore, fakeChatDaemon(), path.join(root, 'sessions'), () => {}, projects, new AttachmentStore(path.join(root, 'attachments')))
    conversationId = (await conversations.create('claude', [], false, { deferStart: true, permissionMode: 'ask' })).id
    profiles = new AgentProfileService(new AgentProfileStore(file), conversations, { profile: () => {}, call: () => {} })
    squads = new SquadStore(file)
    commands = new ChatCommandStore(file, () => {})
    schedules = new ScheduleService(file, {
      tasks: { get: (id) => tasks.get(id), scheduleBlocker: () => null, start: async () => { throw new Error('not expected to start') }, resumeChat: async () => { throw new Error('not expected to resume') } },
      conversations, usage: { list: () => [], refresh: async () => [] }, mode: () => 'acceptEdits', emit: () => {}, limitChanged: () => {},
      routines: { pass: async () => {}, get: (id) => routines.get(id), pickAgent: () => 'claude', runChanged: () => {} }
    })
    routines = new RoutineService(file, { schedules, conversations, usage: { list: () => [] }, emit: () => {} })
    skillChanges = []
    skills = new SkillsLibrary(path.join(root, 'skills'), (repos) => { skillChanges.push(repos) }, { allowFileUrls: true })
    patch = {}
    squadRun = null
    task = Task.parse({ id: 'task', title: 'Work', details: '', status: 'running', repos: [], dependsOn: [], agent: 'claude', createdAt: 0, updatedAt: 0 })
    calls = []
    const answer = async (method: string, raw: unknown): Promise<unknown> => {
      calls.push({ method, params: raw })
      switch (method) {
        case 'conversations.get': return { ...conversations.get(rpcSchemas['conversations.get'].params.parse(raw).id), ...patch }
        case 'tasks.get': return task
        case 'squads.roster': return squadRun
        case 'agentProfiles.list': return profiles.list()
        case 'agentProfiles.save': {
          const { id, ...fields } = rpcSchemas['agentProfiles.save'].params.parse(raw)
          return profiles.save(fields, id)
        }
        case 'squads.list': return squads.list()
        case 'squads.create': return squads.create(rpcSchemas['squads.create'].params.parse(raw))
        case 'chatCommands.list': return commands.list()
        case 'chatCommands.save': return commands.save(rpcSchemas['chatCommands.save'].params.parse(raw))
        case 'schedules.list': return schedules.list()
        case 'schedules.create': {
          const { target, notBefore } = rpcSchemas['schedules.create'].params.parse(raw)
          return schedules.create(target, notBefore)
        }
        case 'routines.list': return routines.list()
        case 'routines.create': return routines.create(rpcSchemas['routines.create'].params.parse(raw))
        case 'skills.list': return skills.list()
        case 'skills.search': return [{ url: 'https://example.com/owner/skills', source: 'owner/skills', skills: ['notes'], installs: 12 }]
        case 'skills.install': return skills.install(rpcSchemas['skills.install'].params.parse(raw).url)
        case 'skills.setActivation': {
          const { id, activation } = rpcSchemas['skills.setActivation'].params.parse(raw)
          return skills.setActivation(id, activation)
        }
        default: throw new Error(`Unexpected method: ${method}`)
      }
    }
    const client = createRpcClient((text) => {
      const frame = Frame.parse(JSON.parse(text))
      void answer(frame.method, frame.params).then(
        (result) => client.receive(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result })),
        (error: unknown) => client.receive(JSON.stringify({ jsonrpc: '2.0', id: frame.id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } }))
      )
    })
    rpc = { ...client, features: [...CORE_FEATURES], close: () => {}, closed: new Promise(() => {}) }
    tools = await managementToolsOverCore(withCore, conversationId)
    calls.length = 0
  })

  afterEach(async () => {
    await schedules.stop()
    routines.stop()
    await profiles.close()
    commands.close()
    squads.close()
    projects.close()
    conversationStore.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('exposes the new tools through MCP and exempts only queries from approval', async () => {
    const handler = createMcpHandler({ preview: async () => {}, management: tools })
    const listed = await handler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(listed?.result).toMatchObject({ tools: expect.arrayContaining(Object.values(MANAGEMENT_TOOLS).map((name) => expect.objectContaining({ name }))) })
    for (const entry of tools) {
      const readOnly = MANAGEMENT_READ_TOOLS.includes(entry.spec.name)
      expect(antumiReadTools(true).includes(entry.spec.name)).toBe(readOnly)
      expect(entry.spec.annotations.readOnlyHint).toBe(readOnly)
      expect(entry.spec.annotations.idempotentHint).toBe(readOnly || entry.spec.name === MANAGEMENT_TOOLS.skillSetActivation)
    }
    const called = await handler(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: MANAGEMENT_TOOLS.profileCreate, arguments: { name: 'Reviewer', agent: 'claude' } } }))
    expect(called?.result).toMatchObject({ isError: false })
    expect(profiles.list()).toMatchObject([{ name: 'Reviewer', capability: 'readOnly', model: null }])
  })

  it('creates and lists profiles, teams and commands without allowing overwrite', async () => {
    expect((await use(MANAGEMENT_TOOLS.profileCreate, { name: 'Reviewer', agent: 'claude' })).isError).toBe(false)
    const profile = profiles.list()[0]!
    expect((await use(MANAGEMENT_TOOLS.profileCreate, { name: 'Changed', agent: 'claude', id: profile.id })).isError).toBe(true)
    expect(output(await use(MANAGEMENT_TOOLS.profileCreate, { name: 'reviewer', agent: 'codex' }))).toContain('已有同名智能体')
    expect(profiles.list()).toHaveLength(1)
    expect(output(await use(MANAGEMENT_TOOLS.profileList))).toContain(profile.id)
    expect((await use(MANAGEMENT_TOOLS.squadCreate, team)).isError).toBe(false)
    expect(output(await use(MANAGEMENT_TOOLS.squadList))).toContain(squads.list()[0]!.id)
    expect((await use(MANAGEMENT_TOOLS.commandCreate, command)).isError).toBe(false)
    const saved = commands.list()[0]!
    expect(output(await use(MANAGEMENT_TOOLS.commandList))).toContain(saved.id)
    expect((await use(MANAGEMENT_TOOLS.commandCreate, { ...command, id: saved.id, prompt: 'Overwrite' })).isError).toBe(true)
    expect(output(await use(MANAGEMENT_TOOLS.commandCreate, command))).toContain('已经有 /review')
    expect(commands.list()).toEqual([saved])
    expect((await use(MANAGEMENT_TOOLS.commandCreate, { ...command, projectPath: root })).isError).toBe(false)
  })

  it('returns scheduled status and routine next-run time from the existing services', async () => {
    const notBefore = Date.now() + 86_400_000
    const target = { kind: 'conversation', conversationId, text: 'Continue tomorrow' }
    const scheduled = await use(MANAGEMENT_TOOLS.scheduleCreate, { target, notBefore })
    expect(scheduled.isError).toBe(false)
    expect(JSON.parse(output(scheduled))).toMatchObject({ target, notBefore, status: 'waiting' })
    expect(output(await use(MANAGEMENT_TOOLS.scheduleList))).toContain(schedules.list()[0]!.id)
    expect((await use(MANAGEMENT_TOOLS.routineCreate, routine)).isError).toBe(false)
    expect(routines.list()[0]).toMatchObject({ title: routine.title, schedule: routine.schedule, target: routine.target, enabled: true, nextRunAt: expect.any(Number) })
    expect(output(await use(MANAGEMENT_TOOLS.routineList))).toContain(routines.list()[0]!.id)
    const missing = await use(MANAGEMENT_TOOLS.scheduleCreate, { target: { kind: 'task', taskId: 'missing' }, notBefore })
    expect(missing.isError).toBe(true)
    expect(schedules.list()).toHaveLength(1)
    const noPrompt = await use(MANAGEMENT_TOOLS.routineCreate, { ...routine, target: { ...routine.target, text: '' } })
    expect(output(noPrompt)).toContain('instruction')
    expect(routines.list()).toHaveLength(1)
  })

  it('searches and installs skills without activation, then explicitly enables selected skills', async () => {
    const found = await use(MANAGEMENT_TOOLS.skillSearch, { query: ' notes ' })
    expect(found.isError).toBe(false)
    expect(output(found)).toContain('owner/skills')
    expect(calls.find((call) => call.method === 'skills.search')?.params).toEqual({ query: 'notes' })
    const upstream = path.join(root, 'owner', 'notes')
    execFileSync('git', ['init', '-q', '-b', 'main', upstream])
    writeFileSync(path.join(upstream, 'SKILL.md'), '---\nname: notes\ndescription: Take notes.\n---\n')
    execFileSync('git', ['-C', upstream, 'add', 'SKILL.md'])
    execFileSync('git', ['-C', upstream, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial'])
    const url = pathToFileURL(upstream).href
    const installed = await use(MANAGEMENT_TOOLS.skillInstall, { url })
    expect(installed.isError).toBe(false)
    const repo = skills.list()[0]!
    expect(repo.activation).toEqual({ mode: 'selected', skills: [], agents: null })
    expect(output(await use(MANAGEMENT_TOOLS.skillList))).toContain(repo.id)
    expect((await use(MANAGEMENT_TOOLS.skillInstall, { url })).isError).toBe(true)
    const activation = { mode: 'selected', skills: ['notes'], agents: ['claude'] }
    expect((await use(MANAGEMENT_TOOLS.skillSetActivation, { id: repo.id, activation })).isError).toBe(false)
    expect(skills.list()[0]?.activation).toEqual(activation)
    expect(skillChanges).toHaveLength(2)
    const second = path.join(root, 'owner', 'other')
    mkdirSync(second)
    execFileSync('git', ['clone', '-q', '--', upstream, second])
    expect((await use(MANAGEMENT_TOOLS.skillInstall, { url: pathToFileURL(second).href })).isError).toBe(false)
    const conflict = await use(MANAGEMENT_TOOLS.skillSetActivation, { id: 'owner-other', activation })
    expect(conflict.isError).toBe(true)
    expect(output(conflict)).toContain('notes')
    expect(skills.list()[1]?.activation?.skills).toEqual([])
    expect((await use(MANAGEMENT_TOOLS.skillInstall, { url: 'http://example.com/unsafe' })).isError).toBe(true)
  })

  it.each([
    [MANAGEMENT_TOOLS.profileCreate, { name: '', agent: 'claude' }],
    [MANAGEMENT_TOOLS.squadCreate, { ...team, leaderId: id(2) }],
    [MANAGEMENT_TOOLS.squadCreate, { ...team, members: [team.members[0], team.members[0]] }],
    [MANAGEMENT_TOOLS.scheduleCreate, { target: { kind: 'resume', conversationId: id(3) }, notBefore: null }],
    [MANAGEMENT_TOOLS.routineCreate, { ...routine, schedule: { kind: 'daily', time: '25:00' } }],
    [MANAGEMENT_TOOLS.skillSearch, { query: ' ' }],
    [MANAGEMENT_TOOLS.skillInstall, { url: '' }],
    [MANAGEMENT_TOOLS.skillSetActivation, { id: 'repo', activation: { mode: 'selected', skills: ['INVALID!'], agents: null } }],
    [MANAGEMENT_TOOLS.commandCreate, { ...command, name: '/bad' }]
  ])('rejects invalid %s arguments before making any RPC call', async (name, args) => {
    const result = await use(name, args)
    expect(result.isError).toBe(true)
    expect(output(result)).toContain('参数不对')
    expect(calls).toEqual([])
  })

  it.each<Partial<Conversation>>([
    { planOnly: true }, { workspaceReadOnly: true },
    { chatOptions: { permissionMode: 'plan', model: null, effort: null } },
    { chatOptions: { permissionMode: 'readOnly', model: null, effort: null } }
  ])('offers queries only for restricted mode %j and rechecks a running server', async (restriction) => {
    patch = restriction
    const readOnly = await managementToolsOverCore(withCore, conversationId)
    expect(readOnly.map((entry) => entry.spec.name)).toEqual(MANAGEMENT_READ_TOOLS)
    expect((await use(MANAGEMENT_TOOLS.profileCreate, { name: 'Forbidden', agent: 'claude' })).isError).toBe(true)
    expect(profiles.list()).toEqual([])
    expect((await use(MANAGEMENT_TOOLS.profileList)).isError).toBe(false)
    expect(calls.some((call) => call.method === 'agentProfiles.save')).toBe(false)
  })

  it('keeps a planning launch query-only and rejects guessed write calls at the MCP boundary', async () => {
    const planning = await managementToolsOverCore(withCore, conversationId, true)
    expect(planning.map((entry) => entry.spec.name)).toEqual(MANAGEMENT_READ_TOOLS)
    const handler = createMcpHandler({ preview: async () => {}, management: tools, planOnly: true })
    const result = await handler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: MANAGEMENT_TOOLS.profileCreate, arguments: { name: 'Forbidden', agent: 'claude' } } }))
    expect(result?.error?.code).toBe(-32602)
    expect(profiles.list()).toEqual([])
  })

  it.each<Partial<Conversation>>([
    { parentConversationId: id(3) }, { discussionId: id(3) }, { squadRunId: id(3) },
    { routineId: id(3) }, { helperOf: id(3) }, { archivedAt: 1 }
  ])('excludes managed or archived conversations %j at startup and at call time', async (restriction) => {
    patch = restriction
    expect(await managementToolsOverCore(withCore, conversationId)).toEqual([])
    expect((await use(MANAGEMENT_TOOLS.profileList)).isError).toBe(true)
    expect((await use(MANAGEMENT_TOOLS.commandCreate, command)).isError).toBe(true)
    expect(commands.list()).toEqual([])
  })

  it('excludes task leaders both during team planning and after a team run exists', async () => {
    patch = { taskId: task.id, planOnly: true }
    task = { ...task, squadId: id(7) }
    expect(await managementToolsOverCore(withCore, conversationId)).toEqual([])
    expect((await use(MANAGEMENT_TOOLS.profileList)).isError).toBe(true)
    task = { ...task, squadId: null }
    squadRun = SquadRun.parse({ id: id(5), taskId: task.id, leaderConversationId: conversationId, state: 'running', permissionMode: 'ask', allowBypass: false, summary: null, works: [], createdAt: 0, updatedAt: 0,
      squad: { ...team, id: id(7), archivedAt: null, createdAt: 0, updatedAt: 0 } })
    expect(await managementToolsOverCore(withCore, conversationId)).toEqual([])
    expect((await use(MANAGEMENT_TOOLS.profileList)).isError).toBe(true)
  })

  it('omits unsupported features and refuses old tools after reconnecting to an older core', async () => {
    rpc = { ...rpc, features: ['chat-commands', 'skills-library'] }
    const supported = await managementToolsOverCore(withCore, conversationId)
    expect(supported.map((entry) => entry.spec.name)).toEqual([
      MANAGEMENT_TOOLS.skillList, MANAGEMENT_TOOLS.skillInstall, MANAGEMENT_TOOLS.commandList, MANAGEMENT_TOOLS.commandCreate
    ])
    expect((await use(MANAGEMENT_TOOLS.profileCreate, { name: 'Forbidden', agent: 'claude' })).isError).toBe(true)
    expect(calls.some((call) => call.method === 'agentProfiles.save')).toBe(false)
    rpc = { ...rpc, features: [] }
    expect(await managementToolsOverCore(withCore, conversationId)).toEqual([])
  })

  it('fails closed if the conversation can no longer be read', async () => {
    conversationStore.delete(conversationId)
    expect((await use(MANAGEMENT_TOOLS.commandCreate, command)).isError).toBe(true)
    expect(commands.list()).toEqual([])
  })
})
