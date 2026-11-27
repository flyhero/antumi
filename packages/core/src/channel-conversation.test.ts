import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentProfile, type ConversationChannel } from '@antumi/protocol'
import { AttachmentStore } from './attachment-store'
import { ConversationService, type ConversationEvent } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { ProjectRegistry } from './project-registry'
import { TaskStore } from './task-store'

// A conversation opened for someone asking from a chat platform (docs/CHANNELS.md).
describe('a channel conversation', () => {
  let root: string
  let tasks: TaskStore
  let store: ConversationStore
  let projects: ProjectRegistry
  let daemon: ReturnType<typeof fakeChatDaemon>
  let service: ConversationService
  let events: ConversationEvent[]

  const channel: ConversationChannel = { channelId: '22222222-2222-4222-8222-222222222222', platform: 'slack', asker: 'U1', place: 'C1' }
  const profile = AgentProfile.parse({
    id: '11111111-1111-4111-8111-111111111111', name: '答疑', instructions: '回答不超过 100 字。', agent: 'claude', capability: 'develop',
    skills: [{ source: 'x', name: 'y' }].slice(0, 0), mcpServers: ['mine'], archivedAt: null, createdAt: 1, updatedAt: 1
  })
  const open = (agent: 'claude' | 'cursor' = 'claude') => service.create(agent, [], undefined, { channel, profile, title: 'U1: 怎么登录' })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-channel-conversation-'))
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    store = new ConversationStore(database)
    projects = new ProjectRegistry(database)
    daemon = fakeChatDaemon()
    events = []
    mkdirSync(path.join(root, 'attachments'), { recursive: true })
    service = new ConversationService(store, daemon, path.join(root, 'sessions'), (event) => events.push(event), projects, new AttachmentStore(path.join(root, 'attachments')), () => ({ command: 'node', args: ['mcp.mjs', '--full'] }), path.join(root, 'worktrees'))
    service.setChannelTools({ mcp: (id) => ({ command: 'node', args: ['mcp.mjs', '--conversation', id, '--tool-set', 'channel'] }), tools: () => ['project_list', 'project_read'] })
    service.setUserMcpProvider(() => [{ name: 'mine', type: 'stdio', command: 'user-mcp', args: [] }])
    service.setSkillsProvider(async () => ({ dir: '/skills/bundle' }))
    service.setKnowledgeBase({ path: '/vault', write: true })
    daemon.deliver = (event) => {
      if (event.event === 'data') service.handleData(event)
      else if (event.event === 'exit') service.handleExit(event.sessionId, event.exitCode)
      else service.handleStderr(event.sessionId, event.data)
    }
  })

  afterEach(() => {
    projects.close()
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('starts locked down, in a folder of its own, with a clean environment', async () => {
    const conversation = await open()
    expect(conversation).toMatchObject({ channel, workspaceReadOnly: true, projectPaths: [], title: 'U1: 怎么登录', titleLocked: true })
    expect(conversation.workspacePath).toBe(path.join(root, 'sessions', conversation.id, 'workspace'))
    expect(daemon.spawns).toHaveLength(1)
    expect(daemon.clean.has(0)).toBe(true)
    const { args, cwd } = daemon.spawns[0]!
    expect(cwd).toBe(conversation.workspacePath)
    expect(args).toEqual(expect.arrayContaining(['--restricted', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome']))
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__antumi__project_list,mcp__antumi__project_read')
    expect(args[args.indexOf('--mcp-config') + 1]).toContain('"--tool-set","channel"')
    const said = JSON.stringify(args)
    for (const kept of ['user-mcp', '/skills/bundle', '/vault', '--add-dir', '--plugin-dir', '--append-system-prompt', '--full', 'dangerously']) expect(said, kept).not.toContain(kept)
  })

  it('makes the rules and the agent\'s own instructions its whole system prompt', async () => {
    await open()
    const { args } = daemon.spawns[0]!
    const prompt = args[args.indexOf('--system-prompt') + 1]!
    expect(prompt).toContain('提问的人不是这台电脑的主人')
    expect(prompt).toContain('你是「答疑」。\n回答不超过 100 字。')
    expect(prompt.indexOf('提问的人不是')).toBeLessThan(prompt.indexOf('回答不超过 100 字'))
  })

  it('is in no list and no search, yet found by its id', async () => {
    const conversation = await open()
    const stage = service.stages(conversation.id).at(-1)!
    store.addMessage({ conversationId: conversation.id, stageId: stage.id, role: 'user', agent: 'claude', text: 'needle in the haystack', eventKey: 'k1', complete: true })
    expect(service.list(true, true, true)).toEqual([])
    expect(service.search('needle', true)).toEqual([])
    expect(store.idleSince(Date.now() + 1000)).toEqual([])
    expect(service.get(conversation.id).channel).toEqual(channel)
  })

  it('refuses an agent that cannot be locked down', async () => {
    await expect(open('cursor')).rejects.toMatchObject({ reason: 'agent-no-lockdown' })
    expect(daemon.spawns).toHaveLength(0)
  })

  it('cannot be forked, handed off or given projects', async () => {
    const conversation = await open()
    await expect(service.handoff(conversation.id, 'codex', '', true)).rejects.toMatchObject({ reason: 'channel-managed' })
    await expect(service.fork(conversation.id, service.stages(conversation.id)[0]!.id, 'u:x')).rejects.toMatchObject({ reason: 'channel-managed' })
    await expect(service.setAdditionalProjects(conversation.id, [root])).rejects.toMatchObject({ reason: 'channel-managed' })
    await expect(service.create('claude', [root], undefined, { channel, profile })).rejects.toMatchObject({ reason: 'invalid-params' })
  })

  it('denies at once whatever its agent asks for', async () => {
    const conversation = await open()
    const sessionId = service.get(conversation.id).sessionId!
    daemon.reply = () => {}
    await service.send(conversation.id, 'read /etc/passwd', [], false, false, 'r1')
    daemon.emit(sessionId, { type: 'control_request', request_id: 'ask-1', request: { subtype: 'can_use_tool', tool_name: 'mcp__antumi__browser_navigate', input: { url: 'https://example.com' }, tool_use_id: 'toolu_1' } })
    await settle()
    const answered = daemon.written(sessionId).map((frame) => JSON.stringify(frame)).find((frame) => frame.includes('"request_id":"ask-1"'))
    expect(answered).toContain('"behavior":"deny"')
    expect(service.get(conversation.id).chat?.request ?? null).toBeNull()
  })

  it('gives the answer to the message sent with a ref', async () => {
    const conversation = await open()
    const sessionId = service.get(conversation.id).sessionId!
    daemon.reply = () => {}
    await service.send(conversation.id, '怎么登录', [], false, false, 'r1')
    expect(service.replyOf(conversation.id, 'r1')).toBe('')
    daemon.emit(sessionId, { type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-5', content: [{ type: 'text', text: '在 auth.ts 第 3 行。' }] } })
    daemon.emit(sessionId, { type: 'result', subtype: 'success', is_error: false, result: '在 auth.ts 第 3 行。', duration_ms: 1 })
    expect(service.replyOf(conversation.id, 'r1')).toBe('在 auth.ts 第 3 行。')
    expect(service.replyOf(conversation.id, 'other')).toBe('')
  })
})
