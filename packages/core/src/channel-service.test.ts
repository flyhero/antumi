import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentProfile, MAX_CHANNEL_ANSWER_CHARS, type Channel } from '@antumi/protocol'
import { AttachmentStore } from './attachment-store'
import type { ChannelAction, ChannelEvent, ChannelGatewayToCore, CoreToChannelGateway } from './channel-gateway-ipc'
import { ChannelService, type ChannelServiceOptions } from './channel-service'
import { ChannelStore } from './channel-store'
import { ConversationService } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { CredentialStore } from './credential-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { pngBytes } from './image-fixtures'
import { ProjectRegistry } from './project-registry'
import { Rejection } from './rejection'
import { TaskStore } from './task-store'
import { TaskService } from './task-service'
import { CHANNEL_TOOL_NAMES } from './channel-tools'

// The whole of core's side: a real conversation service on a fake agent, a real store, and a
// gateway that is only the messages core sends it and the ones the test hands back.
describe('ChannelService', () => {
  let root: string
  let repo: string
  let tasks: TaskStore
  let conversationStore: ConversationStore
  let projects: ProjectRegistry
  let store: ChannelStore
  let credentials: CredentialStore
  let daemon: ReturnType<typeof fakeChatDaemon>
  let conversations: ConversationService
  let channels: ChannelService
  let toGateway: CoreToChannelGateway[]
  let fromGateway: (message: ChannelGatewayToCore) => void
  let gatewayExit: () => void
  let launches: number
  let now: number
  let profiles: AgentProfile[]
  let announced: Channel[][]
  let channel: Channel
  let seq: number
  let keepImage: ChannelServiceOptions['keepImage']
  // Reports whose posts the outbox finished with, as the reporter is told.
  let reported: string[]
  // Clicks on cards handed to what answers them.
  let clicked: ChannelAction[]

  const profile = AgentProfile.parse({ id: '11111111-1111-4111-8111-111111111111', name: '答疑', instructions: '简短回答。', agent: 'claude', audience: 'channels', archivedAt: null, createdAt: 1, updatedAt: 1 })
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0)) }
  const sent = <T extends CoreToChannelGateway['type']>(type: T) => toGateway.flatMap((message) => (message.type === type ? [message as Extract<CoreToChannelGateway, { type: T }>] : []))
  const posts = () => sent('deliver').filter((message) => message.op === 'post').map((message) => message.text)
  // Posts go one at a time to a place: each is confirmed for the next to leave.
  const deliverAll = async () => {
    const done = new Set<string>()
    for (let round = 0; round < 60; round++) {
      const next = sent('deliver').find((message) => !done.has(message.outboxId))
      if (!next) break
      done.add(next.outboxId)
      fromGateway({ type: 'delivered', outboxId: next.outboxId, ok: true, platformId: `p-${done.size}`, retryAfterMs: null, error: null })
      // Past the pause the platform asks for between two posts in one place.
      now += 2000
      channels.tick()
      await settle()
    }
  }
  const event = (over: Partial<ChannelEvent> = {}): ChannelEvent => {
    seq += 1
    return { channelId: channel.id, eventKey: `Ev${seq}`, kind: 'mention', tenant: 'T1', place: 'C1', thread: null, messageId: `m${seq}`, user: 'U1', ignorable: false, text: '登录在哪实现的？', images: [], otherFiles: 0, ...over }
  }
  const ask = async (over: Partial<ChannelEvent> = {}) => {
    const asked = event(over)
    fromGateway({ type: 'event', ...asked })
    await settle()
    return asked
  }

  beforeEach(async () => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-channel-service-')))
    repo = path.join(root, 'app')
    mkdirSync(path.join(repo, 'src'), { recursive: true })
    writeFileSync(path.join(repo, 'src', 'auth.ts'), 'export function login() {}\n')
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init'], { cwd: repo })
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    conversationStore = new ConversationStore(database)
    projects = new ProjectRegistry(database)
    projects.remember([repo])
    store = new ChannelStore(database)
    credentials = new CredentialStore(path.join(root, 'credentials.json'))
    await credentials.load()
    daemon = fakeChatDaemon()
    mkdirSync(path.join(root, 'attachments'), { recursive: true })
    const attachments = new AttachmentStore(path.join(root, 'attachments'))
    conversations = new ConversationService(conversationStore, daemon, path.join(root, 'sessions'), (change) => {
      // As core's main routes them.
      if (change.type === 'changed' && change.conversation.channel && change.conversation.sessionId === null) channels.conversationEnded(change.conversation.id)
      if (change.type === 'deleted') channels.conversationEnded(change.id)
      if (change.type === 'chatItems') channels.conversationItems(change.conversationId, change.items)
    }, projects, attachments, null)
    conversations.setChannelTools({ mcp: (id) => ({ command: 'node', args: ['mcp.mjs', '--conversation', id, '--tool-set', 'channel'] }), tools: CHANNEL_TOOL_NAMES })
    daemon.deliver = (delivered) => {
      if (delivered.event === 'data') conversations.handleData(delivered)
      else if (delivered.event === 'exit') conversations.handleExit(delivered.sessionId, delivered.exitCode)
      else conversations.handleStderr(delivered.sessionId, delivered.data)
    }
    toGateway = []
    launches = 0
    now = new Date(2026, 10, 15, 10, 0, 0).getTime()
    seq = 0
    profiles = [profile]
    announced = []
    keepImage = (bytes) => attachments.put(bytes)
    reported = []
    clicked = []
    channels = new ChannelService(store, {
      reports: { posted: (id) => reported.push(id), list: () => [], answered: () => {} },
      cards: { click: async (event) => { clicked.push(event); return { kind: 'success', text: '已开始执行。' } }, feedback: () => [], continueTask: async () => [] },
      conversations, credentials,
      tasks: new TaskService(tasks, projects, path.join(root, 'worktrees'), () => {}, attachments, conversations),
      profile: (id) => profiles.find((each) => each.id === id) ?? null,
      recentProjects: () => projects.recent(),
      isRepo: async (dir) => dir === repo,
      keepImage: (bytes) => keepImage(bytes),
      changed: (list) => announced.push(list),
      identity: async () => 'owner@example.com',
      now: () => now,
      home: '/Users/owner',
      launch: (onMessage, onExit) => {
        launches += 1
        fromGateway = onMessage
        gatewayExit = onExit
        return { send: (message) => toGateway.push(message), stop: () => {} }
      }
    })
    channels.start()
    channel = await channels.save({ profileId: profile.id, platform: 'slack', projectPaths: [repo], allowedUsers: ['U1', 'U2'], allowedPlaces: ['C1'], allowDirect: true, dailyPerUser: 3, dailyTotal: 5, credentials: { appToken: 'xapp-1', botToken: 'xoxb-1' } })
    fromGateway({ type: 'state', channelId: channel.id, state: 'connected', error: null, tenant: 'T1', tenantName: 'Acme', botUserId: 'B1' })
  })

  afterEach(() => {
    channels.stop()
    store.close()
    projects.close()
    conversationStore.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('keeps credentials to itself and hands them to the gateway alone', async () => {
    expect(channel).toMatchObject({ stored: ['appToken', 'botToken'], state: 'connecting' })
    expect(JSON.stringify(announced)).not.toContain('xoxb-1')
    expect(JSON.stringify(channels.list())).not.toContain('xapp-1')
    expect(launches).toBe(1)
    expect(sent('channels').at(-1)?.channels).toEqual([{ id: channel.id, platform: 'slack', credentials: { appToken: 'xapp-1', botToken: 'xoxb-1' } }])
    expect(channels.list()[0]).toMatchObject({ state: 'connected', tenant: 'T1', tenantName: 'Acme', botUserId: 'B1' })
    // Saved again without them, they stay; the workspace found on connecting stays too.
    const again = await channels.save({ id: channel.id, profileId: profile.id, platform: 'slack', projectPaths: [repo], allowedUsers: ['U1'], allowedPlaces: ['C1'] })
    expect(again).toMatchObject({ stored: ['appToken', 'botToken'], tenant: 'T1', allowedUsers: ['U1'] })
  })

  it('refuses a project that is not a recent git repo, a token the wrong way round, and an agent that cannot be locked down', async () => {
    const base = { profileId: profile.id, platform: 'slack' as const }
    await expect(channels.save({ ...base, projectPaths: ['/etc'] })).rejects.toMatchObject({ reason: 'channel-project-not-recent' })
    await expect(channels.save({ ...base, credentials: { appToken: 'xoxb-swapped' } })).rejects.toMatchObject({ reason: 'channel-credential-invalid' })
    profiles = [{ ...profile, agent: 'cursor' }]
    await expect(channels.save(base)).rejects.toMatchObject({ reason: 'agent-no-lockdown' })
    profiles = [{ ...profile, audience: 'user' }]
    await expect(channels.save(base)).rejects.toMatchObject({ reason: 'profile-not-for-channels' })
  })

  it('says a daemon from before clean starts fails every question, and keeps the reason on the one that failed', async () => {
    const readiness = (daemon: ChannelServiceOptions['daemon']) => new ChannelService(store, { conversations, credentials, profile: () => profile, recentProjects: () => [repo], isRepo: async () => true, keepImage: async () => ({ id: 'x' }), changed: () => {}, daemon }).readiness()
    expect(await readiness(async () => ({ cleanPipe: false, pid: 42 }))).toEqual({ daemon: 'outdated', pid: 42 })
    expect(await readiness(async () => ({ cleanPipe: true, pid: 42 }))).toEqual({ daemon: 'ready', pid: 42 })
    expect(await readiness(async () => { throw new Error('no daemon') })).toEqual({ daemon: 'unavailable', pid: null })
    const real = daemon.request.bind(daemon)
    vi.spyOn(daemon, 'request').mockImplementation(async (method, params) => {
      if (method === 'spawnPipeClean') throw new Rejection('unknown-method')
      return real(method, params)
    })
    await ask()
    await deliverAll()
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ state: 'failed', errorReason: 'daemon-outdated' })
  })

  it('keeps a project it already reads once that is no longer recent, but adds no other', async () => {
    projects.forget(repo)
    const base = { id: channel.id, profileId: profile.id, platform: 'slack' as const, allowedUsers: ['U1'], allowedPlaces: ['C1'] }
    expect(await channels.save({ ...base, enabled: false, projectPaths: [repo] })).toMatchObject({ enabled: false, projectPaths: [repo] })
    await expect(channels.save({ ...base, projectPaths: [repo, '/etc'] })).rejects.toMatchObject({ reason: 'channel-project-not-recent' })
  })

  it('answers a mention in its thread, from a locked-down conversation of the asker\'s own', async () => {
    const asked = await ask()
    expect(sent('accepted')).toEqual([{ type: 'accepted', channelId: channel.id, eventKey: asked.eventKey }])
    await deliverAll()
    expect(sent('deliver').map(({ op, place, thread, target, text, emoji }) => ({ op, place, thread, target, text, emoji }))).toEqual([
      { op: 'react', place: 'C1', thread: null, target: asked.messageId, text: null, emoji: 'eyes' },
      { op: 'post', place: 'C1', thread: asked.messageId, target: null, text: 'echo: 登录在哪实现的？', emoji: null }
    ])
    const [request] = channels.requests(channel.id, null, 10).items
    expect(request).toMatchObject({ asker: 'U1', place: 'C1', direct: false, text: '登录在哪实现的？', state: 'answered', refusal: null })
    const conversation = conversations.get(request!.conversationId!)
    expect(conversation).toMatchObject({ channel: { channelId: channel.id, platform: 'slack', asker: 'U1', place: 'C1' }, workspaceReadOnly: true, projectPaths: [] })
    expect(conversation.profile).toMatchObject({ name: '答疑', skills: [], mcpServers: [], callableProfiles: [] })
    expect(daemon.clean.has(0)).toBe(true)
    expect(conversations.list(true, true, true)).toEqual([])
  })

  it('keeps a dual-entry developer restricted on the channel and leaves its local settings intact', async () => {
    const both = AgentProfile.parse({ ...profile, audience: 'both', capability: 'develop', delegationMode: 'bypass',
      skills: [{ repo: 'local', skill: 'dangerous' }], mcpServers: ['local-only'], callableProfiles: [profile.id], callableSquads: [profile.id] })
    profiles = [both]
    await channels.save({ ...channel })
    await ask()
    const request = channels.requests(channel.id, null, 10).items[0]!
    const conversation = conversations.get(request.conversationId!)
    expect(conversation).toMatchObject({ workspaceReadOnly: true, projectPaths: [], profile: { capability: 'readOnly', delegationMode: null, skills: [], mcpServers: [], callableProfiles: [], callableSquads: [] } })
    expect(profiles[0]).toEqual(both)
    const command = daemon.spawns[0]!
    expect(command.args).toContain('--restricted')
    expect(command.args[command.args.indexOf('--tools') + 1]).toBe('')
  })

  it('takes an event once, however often it is delivered', async () => {
    const asked = await ask()
    fromGateway({ type: 'event', ...asked })
    fromGateway({ type: 'event', ...asked })
    await settle()
    await deliverAll()
    expect(sent('accepted')).toHaveLength(3)
    expect(channels.requests(channel.id, null, 10).items).toHaveLength(1)
    expect(posts()).toEqual(['echo: 登录在哪实现的？'])
    expect(daemon.spawns).toHaveLength(1)
  })

  it('lets nobody ask who is not named, in a place not named, or from another workspace, and tells them once', async () => {
    await ask({ user: 'U9' })
    await ask({ user: 'U9' })
    await ask({ place: 'C9' })
    await ask({ tenant: 'T2' })
    await ask({ ignorable: true })
    await ask({ user: 'B1' })
    await deliverAll()
    expect(daemon.spawns).toHaveLength(0)
    expect(channels.requests(channel.id, null, 10).items).toEqual([])
    expect(posts()).toEqual(['你没有向我提问的权限。要开通，把你的 ID `U9` 和这里的 ID `C1` 发给我的主人。', '你没有向我提问的权限。要开通，把你的 ID `U1` 和这里的 ID `C9` 发给我的主人。'])
    expect(store.outcomes(channel.id)).toEqual(['refused:acl', 'refused:acl', 'refused:acl', 'dropped:tenant', 'dropped:ignorable', 'dropped:ignorable'])
  })

  it('takes a direct message only where direct messages are let', async () => {
    await ask({ kind: 'direct', place: 'D1' })
    await deliverAll()
    expect(sent('deliver').filter((message) => message.op === 'post')[0]).toMatchObject({ place: 'D1', thread: null, text: 'echo: 登录在哪实现的？' })
    await channels.save({ id: channel.id, profileId: profile.id, platform: 'slack', projectPaths: [repo], allowedUsers: ['U1'], allowedPlaces: ['C1'], allowDirect: false })
    await ask({ kind: 'direct', place: 'D1' })
    expect(store.outcomes(channel.id).at(-1)).toBe('refused:acl')
  })

  it('stops at each asker\'s count for the day, then at the channel\'s, and starts over the next day', async () => {
    for (let i = 0; i < 3; i++) await ask()
    await ask()
    for (let i = 0; i < 2; i++) await ask({ user: 'U2' })
    await ask({ user: 'U2' })
    await deliverAll()
    const states = channels.requests(channel.id, null, 20).items.reverse().map((request) => `${request.asker}:${request.state}:${request.refusal ?? ''}`)
    expect(states).toEqual(['U1:answered:', 'U1:answered:', 'U1:answered:', 'U1:refused:quota', 'U2:answered:', 'U2:answered:', 'U2:refused:quota'])
    expect(posts().filter((text) => /次数.*用完/.test(text ?? ''))).toEqual(['你今天的提问次数用完了，明天再来。', '今天的提问次数已经用完了，明天再来。'])
    now += 24 * 60 * 60_000
    await ask()
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ state: 'answered' })
  })

  it('goes on in the same conversation within a thread, and gives another asker there one of their own', async () => {
    const first = await ask()
    await ask({ thread: first.messageId, text: '那登出呢？' })
    await ask({ thread: first.messageId, user: 'U2', text: '把上面的回答再说一遍' })
    await ask({ text: '另一个问题' })
    await deliverAll()
    const [a, b, other, fresh] = channels.requests(channel.id, null, 10).items.reverse()
    expect(b!.conversationId).toBe(a!.conversationId)
    expect(other!.conversationId).not.toBe(a!.conversationId)
    expect(fresh!.conversationId).not.toBe(a!.conversationId)
    expect(conversations.get(other!.conversationId!).channel?.asker).toBe('U2')
    // Each answer goes under the thread it was asked in.
    expect(sent('deliver').filter((message) => message.op === 'post').map((message) => message.thread)).toEqual([first.messageId, first.messageId, first.messageId, 'm4'])
  })

  it('starts a direct chat over once it has been left a while', async () => {
    await ask({ kind: 'direct', place: 'D1' })
    await ask({ kind: 'direct', place: 'D1' })
    now += 5 * 60 * 60_000
    await ask({ kind: 'direct', place: 'D1' })
    const ids = channels.requests(channel.id, null, 10).items.reverse().map((request) => request.conversationId)
    expect(ids[1]).toBe(ids[0])
    expect(ids[2]).not.toBe(ids[0])
  })

  it('runs no more at once than the channel allows, and the rest in turn', async () => {
    daemon.reply = () => {}
    await ask({ text: 'one' })
    await ask({ text: 'two' })
    await ask({ text: 'three' })
    const states = () => channels.requests(channel.id, null, 10).items.reverse().map((request) => request.state)
    expect(states()).toEqual(['running', 'running', 'queued'])
    const first = channels.requests(channel.id, null, 10).items.at(-1)!
    const sessionId = conversations.get(first.conversationId!).sessionId!
    daemon.emit(sessionId, { type: 'assistant', uuid: 'u1', message: { id: 'm1', content: [{ type: 'text', text: 'done one' }] }, parent_tool_use_id: null })
    daemon.emit(sessionId, { type: 'result', subtype: 'success', is_error: false, result: 'done one', terminal_reason: 'completed', duration_ms: 5 })
    await settle()
    expect(states()).toEqual(['answered', 'running', 'running'])
  })

  it('waits for a place when the agent has none free, and starts when one frees', async () => {
    conversations.setCapacity({ maxConcurrentAgents: 0, agentConcurrency: {} }, () => channels.tick())
    await ask()
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ state: 'queued' })
    conversations.setCapacity({ maxConcurrentAgents: 5, agentConcurrency: {} }, () => channels.tick())
    channels.tick()
    await settle()
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ state: 'answered' })
  })

  it('hides what must not be said and what would ping the chat', async () => {
    daemon.reply = (sessionId) => {
      const text = `见 ${repo}/src/auth.ts，问 owner@example.com，密钥 ghp_abcdefghijklmnopqrstuvwxyz0123 <!channel>`
      daemon.emit(sessionId, { type: 'assistant', uuid: 'u1', message: { id: 'm1', content: [{ type: 'text', text }] }, parent_tool_use_id: null })
      daemon.emit(sessionId, { type: 'result', subtype: 'success', is_error: false, result: text, terminal_reason: 'completed', duration_ms: 5 })
    }
    await ask()
    await deliverAll()
    expect(posts()).toEqual(['见 app/src/auth.ts，问 [已隐藏]，密钥 [已隐藏] &lt;!channel&gt;', '（回答里有疑似密钥的内容，已隐藏）'])
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ redacted: true })
  })

  it('posts a long answer in pieces and never more than the ceiling', async () => {
    daemon.reply = (sessionId) => {
      const text = `${'很长的一段。'.repeat(700)}\n\n${'x'.repeat(MAX_CHANNEL_ANSWER_CHARS)}`
      daemon.emit(sessionId, { type: 'assistant', uuid: 'u1', message: { id: 'm1', content: [{ type: 'text', text }] }, parent_tool_use_id: null })
      daemon.emit(sessionId, { type: 'result', subtype: 'success', is_error: false, result: text, terminal_reason: 'completed', duration_ms: 5 })
    }
    await ask()
    await deliverAll()
    const pieces = posts()
    expect(pieces.length).toBeGreaterThan(2)
    expect(pieces.every((piece) => (piece?.length ?? 0) <= 3500)).toBe(true)
    expect(pieces.join('').length).toBeLessThan(MAX_CHANNEL_ANSWER_CHARS + 200)
    expect(pieces.at(-1)).toContain('回答过长，已截断')
  })

  it('says so when the agent fails, and when it runs too long', async () => {
    daemon.reply = (sessionId) => daemon.emit(sessionId, { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom: /secret/path', duration_ms: 5 })
    await ask()
    await deliverAll()
    expect(posts()).toEqual(['现在答不了，请稍后再试。'])
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ state: 'failed', error: 'boom: /secret/path' })
  })

  it('keeps a startup failure for the owner without posting its diagnostic to colleagues', async () => {
    vi.spyOn(conversations, 'create').mockRejectedValueOnce(new Error('pi lists no model glm-5.2; sk-123456789012345678901234'))
    await ask()
    await deliverAll()
    const reader = new ChannelStore(path.join(root, 'antumi.db'))
    try {
      expect(reader.requests(channel.id, null, 1)[0]).toMatchObject({
        state: 'failed', conversationId: null, startedAt: null, error: 'pi lists no model glm-5.2; [已隐藏]'
      })
    } finally { reader.close() }
    expect(posts()).toEqual(['现在答不了，请稍后再试。'])
  })

  it('fetches pictures only for a question that passed, and sends them with it', async () => {
    const image = { ref: 'F1', name: 'error.png', mime: 'image/png', bytes: 100 }
    await ask({ user: 'U9', images: [image] })
    expect(sent('fetch')).toEqual([])
    daemon.reply = () => {}
    const asked = await ask({ images: [image, { ref: 'F2', name: 'big.png', mime: 'image/png', bytes: 50 * 1024 * 1024 }, { ref: 'F3', name: 'a.pdf', mime: 'application/pdf', bytes: 10 }], otherFiles: 1 })
    const [request] = channels.requests(channel.id, null, 1).items
    expect(sent('fetch')).toEqual([{ type: 'fetch', requestId: request!.id, channelId: channel.id, images: ['F1'] }])
    expect(request).toMatchObject({ state: 'queued' })
    expect(daemon.spawns).toHaveLength(0)
    const png = Buffer.from(pngBytes(8, 8))
    fromGateway({ type: 'image', requestId: request!.id, ref: 'F1', data: png.subarray(0, 20).toString('base64'), done: false, error: null })
    fromGateway({ type: 'image', requestId: request!.id, ref: 'F1', data: png.subarray(20).toString('base64'), done: true, error: null })
    await settle()
    const running = channels.requests(channel.id, null, 1).items[0]!
    expect(running).toMatchObject({ state: 'running', images: 1 })
    const frames = JSON.stringify(daemon.written(conversations.get(running.conversationId!).sessionId!))
    expect(frames).toContain('"type":"image"')
    expect(frames).toContain(asked.text)
  })

  it('waits for a picture being saved when the next one fails, and sends it', async () => {
    const png = Buffer.from(pngBytes(8, 8))
    const put = keepImage
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    keepImage = (bytes) => gate.then(() => put(bytes))
    daemon.reply = () => {}
    await ask({ images: [{ ref: 'F1', name: 'a.png', mime: 'image/png', bytes: 100 }, { ref: 'F2', name: 'b.png', mime: 'image/png', bytes: 100 }] })
    const [request] = channels.requests(channel.id, null, 1).items
    fromGateway({ type: 'image', requestId: request!.id, ref: 'F1', data: png.toString('base64'), done: true, error: null })
    fromGateway({ type: 'image', requestId: request!.id, ref: 'F2', data: '', done: true, error: 'http 403' })
    await settle()
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ state: 'queued', images: 0 })
    expect(daemon.spawns).toHaveLength(0)
    release()
    await settle()
    const running = channels.requests(channel.id, null, 1).items[0]!
    expect(running).toMatchObject({ state: 'running', images: 1 })
    expect(JSON.stringify(daemon.written(conversations.get(running.conversationId!).sessionId!))).toContain('"type":"image"')
  })

  it('leaves the store alone for a picture saved after the service stopped', async () => {
    const png = Buffer.from(pngBytes(8, 8))
    let release: () => void = () => {}
    keepImage = () => new Promise((resolve) => { release = () => resolve({ id: 'late' }) })
    await ask({ images: [{ ref: 'F1', name: 'a.png', mime: 'image/png', bytes: 100 }] })
    const [request] = channels.requests(channel.id, null, 1).items
    fromGateway({ type: 'image', requestId: request!.id, ref: 'F1', data: png.toString('base64'), done: true, error: null })
    await settle()
    channels.stop()
    const update = vi.spyOn(store, 'updateRequest')
    release()
    await settle()
    expect(update).not.toHaveBeenCalled()
  })

  it('goes on without a picture that could not be had, and says so', async () => {
    await ask({ images: [{ ref: 'F1', name: 'error.png', mime: 'image/png', bytes: 100 }] })
    const [request] = channels.requests(channel.id, null, 1).items
    fromGateway({ type: 'image', requestId: request!.id, ref: 'F1', data: '', done: true, error: 'http 403' })
    await settle()
    await deliverAll()
    expect(posts()).toEqual(['echo: 登录在哪实现的？\n\n有 1 张图片没读到。'])
  })

  it('runs a tool over the channel\'s projects for its conversation, and writes down what was read', async () => {
    daemon.reply = () => {}
    await ask()
    const [request] = channels.requests(channel.id, null, 1).items
    const read = await channels.callTool(request!.conversationId!, 'project_read', { path: 'app/src/auth.ts' })
    expect(read).toEqual({ text: '1\texport function login() {}', isError: false })
    expect((await channels.callTool(request!.conversationId!, 'project_read', { path: 'app/../../etc/passwd' })).isError).toBe(true)
    expect(channels.toolCalls(request!.id).map(({ tool, target }) => ({ tool, target }))).toEqual([
      { tool: 'project_read', target: 'app/src/auth.ts:1-1' },
      { tool: 'project_read', target: '{"path":"app/../../etc/passwd"} ✗' }
    ])
    const own = await conversations.create('claude', [])
    await expect(channels.callTool(own.id, 'project_read', { path: 'app/src/auth.ts' })).rejects.toMatchObject({ reason: 'channel-not-found' })
  })

  it('posts a task report as it does an answer, naming the asker on its first piece, and says when its posts are done', async () => {
    const task = tasks.create('加导出', { repos: [{ path: repo, worktreePath: path.join(root, 'worktrees', 'app'), branch: 'antumi/x', startRef: null, start: null }] })
    const reportId = '55555555-5555-4555-8555-555555555555'
    const text = `已提交验收：#1 加导出\n\n改在 ${path.join(root, 'worktrees', 'app', 'src', 'export.ts')}，有问题找 owner@example.com。\n\n${'长'.repeat(4000)}`
    expect(await channels.postReport({ channelId: channel.id, reportId, place: 'C1', thread: '1.2', text, mention: 'U1', task })).toBe(true)
    await deliverAll()
    const delivered = sent('deliver')
    expect(delivered.length).toBeGreaterThan(1)
    expect(delivered.map((each) => each.mention)).toEqual(['U1', ...delivered.slice(1).map(() => null)])
    expect(delivered.every((each) => each.place === 'C1' && each.thread === '1.2')).toBe(true)
    expect(delivered[0]?.text).toContain('app/src/export.ts')
    expect(delivered.map((each) => each.text).join('')).not.toMatch(/owner@example\.com|worktrees/)
    expect(reported.filter((id) => id === reportId)).toHaveLength(delivered.length)
    expect(await channels.postReport({ channelId: '66666666-6666-4666-8666-666666666666', reportId, place: 'C1', thread: null, text: 'x', mention: null, task })).toBe(false)
  })

  it('answers a click on a card once, however often the platform sends it', async () => {
    const click = { type: 'action' as const, channelId: channel.id, eventKey: 'card:ev1', tenant: 'T1', user: 'U9', place: 'C1', messageId: 'm-card', token: 'tok', form: {} }
    fromGateway(click)
    await settle()
    fromGateway(click)
    await settle()
    expect(clicked).toHaveLength(1)
    expect(clicked[0]).toMatchObject({ user: 'U9', token: 'tok' })
    expect(sent('actionReply').map((reply) => reply.toast)).toEqual([{ kind: 'success', text: '已开始执行。' }, { kind: 'info', text: '已经处理过了。' }])
  })

  it('posts a card, and draws it again on the message it became; one whose post was lost is not drawn', async () => {
    const at = now
    const card = { id: '77777777-7777-4777-8777-777777777777', taskId: 't1', channelId: channel.id, kind: 'task' as const, place: 'C1', thread: '1.1', recipient: null, feedbackId: null, summary: [], notice: null, messageId: null, rendered: null, createdAt: at, updatedAt: at }
    store.addCard(card)
    channels.sendCard({ op: 'card', channelId: channel.id, reportId: null, card, content: { drawn: 1 } })
    await deliverAll()
    expect(sent('deliver').at(-1)).toMatchObject({ op: 'card', place: 'C1', thread: '1.1', card: { drawn: 1 }, recipient: null })
    expect(sent('deliver').at(-1)).not.toHaveProperty('cardId')
    const messageId = store.card(card.id)?.messageId
    expect(messageId).toMatch(/^p-/)
    channels.sendCard({ op: 'update', channelId: channel.id, reportId: null, card, content: { drawn: 2 } })
    await deliverAll()
    expect(sent('deliver').at(-1)).toMatchObject({ op: 'update', target: messageId, card: { drawn: 2 } })

    const lost = { ...card, id: '88888888-8888-4888-8888-888888888888' }
    store.addCard(lost)
    channels.sendCard({ op: 'update', channelId: channel.id, reportId: null, card: lost, content: { drawn: 3 } })
    await deliverAll()
    expect(sent('deliver').filter((each) => each.op === 'update')).toHaveLength(1)
  })

  it('collects one pending task per message with a trusted origin and no extra agent run', async () => {
    channel = await channels.save({ ...channel, allowTaskCreation: true })
    daemon.reply = () => {}
    const asked = await ask({ text: '修复登录失败，并增加回归测试。' })
    const [request] = channels.requests(channel.id, null, 1).items
    const before = daemon.spawns.length
    const input = { title: '修复登录失败', details: '登录失败时显示正确提示；验收：增加回归测试。', projects: ['app'] }
    const [first, retry] = await Promise.all([
      channels.callTool(request!.conversationId!, 'task_create', input),
      channels.callTool(request!.conversationId!, 'task_create', { ...input, title: '不同标题的重试' })
    ])
    expect(first.isError).toBe(false)
    expect(retry).toEqual(first)
    expect(tasks.list()).toHaveLength(1)
    expect(tasks.list()[0]).toMatchObject({
      title: input.title, details: input.details, status: 'pending', autoRun: false, agent: null, conversationId: null,
      repos: [{ path: repo, worktreePath: null, branch: null }],
      channelSource: { channelId: channel.id, requestId: request!.id, conversationId: request!.conversationId, platform: 'slack', asker: 'U1', place: 'C1', messageId: asked.messageId, thread: asked.messageId, direct: false, text: asked.text }
    })
    expect(daemon.spawns).toHaveLength(before)
    expect(channels.toolCalls(request!.id).filter((call) => call.tool === 'task_create')).toHaveLength(2)

    // A duplicate platform delivery with a different event key is still the same message.
    daemon.emit(conversations.get(request!.conversationId!).sessionId!, { type: 'result', subtype: 'success', is_error: false, result: '已记录', terminal_reason: 'completed', duration_ms: 5 })
    await settle()
    now += 1
    await ask({ eventKey: 'different-delivery', messageId: asked.messageId })
    const newer = channels.requests(channel.id, null, 1).items[0]!
    expect((await channels.callTool(newer.conversationId!, 'task_create', input)).isError).toBe(false)
    expect(tasks.list()).toHaveLength(1)
  })

  it('refuses task collection unless enabled, scoped to projects and owned by an active allowed request', async () => {
    daemon.reply = () => {}
    await ask()
    const [request] = channels.requests(channel.id, null, 1).items
    const input = { title: '修复登录', details: '修复项目登录失败。', projects: ['app'] }
    const call = (args: unknown = input) => channels.callTool(request!.conversationId!, 'task_create', args)
    expect(await call()).toMatchObject({ isError: true })
    channel = await channels.save({ ...channel, allowTaskCreation: true })
    for (const projects of [['/etc'], ['app/..'], ['other'], []]) expect(await call({ ...input, projects })).toMatchObject({ isError: true })
    for (const extra of [{ autoRun: true }, { agent: 'claude' }, { source: { asker: 'owner' } }]) expect(await call({ ...input, ...extra })).toMatchObject({ isError: true })
    channel = await channels.save({ ...channel, allowedUsers: ['U2'] })
    expect(await call()).toMatchObject({ isError: true })
    channel = await channels.save({ ...channel, allowedUsers: ['U1'], allowedPlaces: [] })
    expect(await call()).toMatchObject({ isError: true })
    channel = await channels.save({ ...channel, allowedPlaces: ['C1'], enabled: false })
    expect(await call()).toMatchObject({ isError: true })
    channel = await channels.save({ ...channel, enabled: true, allowTaskCreation: false })
    expect(await call()).toMatchObject({ isError: true })
    channel = await channels.save({ ...channel, allowTaskCreation: true })
    store.updateRequest(request!.id, { state: 'answered' })
    expect(await call()).toMatchObject({ isError: true })
    expect(tasks.list()).toEqual([])
  })

  it('keeps task permission on saves from older clients, and denies a direct chat once revoked', async () => {
    channel = await channels.save({ ...channel, allowTaskCreation: true })
    const { allowTaskCreation: _permission, ...older } = channel
    expect((await channels.save(older)).allowTaskCreation).toBe(true)
    daemon.reply = () => {}
    await ask({ kind: 'direct', place: 'D1' })
    const [request] = channels.requests(channel.id, null, 1).items
    channel = await channels.save({ ...channel, allowDirect: false })
    expect(await channels.callTool(request!.conversationId!, 'task_create', { title: 'Fix', details: 'Fix login', projects: ['app'] })).toMatchObject({ isError: true })
    expect(tasks.list()).toEqual([])
  })

  it('tries a failed post again, in order, and gives up after a few', async () => {
    await ask()
    const [mark] = sent('deliver')
    fromGateway({ type: 'delivered', outboxId: mark!.outboxId, ok: false, platformId: null, retryAfterMs: null, error: 'missing_scope' })
    await settle()
    const [, answer] = sent('deliver')
    expect(answer).toMatchObject({ op: 'post', text: 'echo: 登录在哪实现的？' })
    for (let attempt = 0; attempt < 5; attempt++) {
      const tries = sent('deliver').filter((message) => message.outboxId === answer!.outboxId)
      expect(tries).toHaveLength(attempt + 1)
      fromGateway({ type: 'delivered', outboxId: answer!.outboxId, ok: false, platformId: null, retryAfterMs: 1000, error: 'ratelimited' })
      now += 2000
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
    expect(store.outboxStates()).toEqual([{ op: 'react', state: 'failed', text: null }, { op: 'post', state: 'failed', text: 'echo: 登录在哪实现的？' }])
  }, 15_000)

  it('starts the gateway again when it dies, and tells it the channels again', async () => {
    gatewayExit()
    expect(channels.list()[0]).toMatchObject({ state: 'connecting' })
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(launches).toBe(2)
    expect(sent('channels').at(-1)?.channels).toHaveLength(1)
  })

  it('ends what the last core left running, and removes a channel with all that was asked of it', async () => {
    daemon.reply = () => {}
    await ask()
    const [request] = channels.requests(channel.id, null, 1).items
    channels.stop()
    channels = new ChannelService(store, {
      conversations, credentials, profile: () => profile, recentProjects: () => [repo], isRepo: async () => true, keepImage: async () => ({ id: 'x' }), changed: () => {}, now: () => now,
      launch: (onMessage) => { fromGateway = onMessage; return { send: (message) => toGateway.push(message), stop: () => {} } }
    })
    channels.start()
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ id: request!.id, state: 'failed', refusal: 'restarted' })
    expect(await channels.remove(channel.id)).toEqual([])
    expect(credentials.get('channel-slack', channel.id)).toBeNull()
    expect(() => conversations.get(request!.conversationId!)).toThrow()
    expect(channels.hasChannels(profile.id)).toBe(false)
  })
})
