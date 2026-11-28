import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatReference, ChatItem } from '@antumi/protocol'
import type { StageMessage } from './chat-driver'
import type { UsageReport } from './usage-source'
import { ChatHost, STEER_TIMING, type ChatSink, type ChatStage } from './chat-host'
import { AttachmentStore } from './attachment-store'
import { ChatLog } from './chat-log'
import { fakeChatDaemon } from './fake-chat-agent'
import { pngBytes } from './image-fixtures'
import { WireLog } from './wire-log'
import { Rejection } from './rejection'

const STAGE: ChatStage = {
  conversationId: 'conversation-1',
  stageId: 'stage-1',
  agent: 'claude',
  options: { cwd: '/work/repo', extraDirs: [], resume: null }
}

function recordingSink() {
  const items: ChatItem[] = []
  const messages: StageMessage[] = []
  const offsets: number[] = []
  const usage: UsageReport[] = []
  let activityChanges = 0
  const sink: ChatSink = {
    items: (_conversationId, changed) => items.push(...changed),
    delta: () => {},
    messages: (_stage, added) => messages.push(...added),
    provider: () => {},
    activity: () => { activityChanges++ },
    offset: (_stageId, end) => offsets.push(end),
    usage: (_stage, report) => usage.push(report)
  }
  return { sink, items, messages, offsets, usage, activity: () => activityChanges }
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))
// The stage's state item is not part of the conversation's flow.
const kinds = (items: ChatItem[]) => items.filter((item) => item.kind !== 'state').map((item) => item.kind)
const canUseTool = (requestId: string) => ({
  type: 'control_request',
  request_id: requestId,
  request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' }, tool_use_id: 'toolu_1' }
})

describe('ChatHost', () => {
  let root: string
  let daemon: ReturnType<typeof fakeChatDaemon>
  let attachments: AttachmentStore

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-chat-host-'))
    mkdirSync(path.join(root, 'attachments'))
    attachments = new AttachmentStore(path.join(root, 'attachments'))
    daemon = fakeChatDaemon()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  async function started(sink: ChatSink = recordingSink().sink) {
    const host = new ChatHost(daemon, root, attachments, sink)
    daemon.deliver = (event) => {
      if (event.event === 'data') host.handleData(event.sessionId, event.offset, event.data)
      if (event.event === 'exit') host.handleExit(event.sessionId, event.exitCode)
    }
    const { sessionId } = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    await host.open(STAGE, sessionId, 0, true)
    return { host, sessionId }
  }

  it('shows what an ended stage left asking as no longer waiting', () => {
    // An agent killed while core was down leaves no exit behind to close what it asked.
    ChatLog.of(root, STAGE.conversationId, STAGE.stageId).append([{ dir: 'in', at: 1, frame: canUseTool('req-1') }])
    const host = new ChatHost(daemon, root, attachments, recordingSink().sink)
    const resolution = (stage: ChatStage) => host.items(stage).find((item) => item.kind === 'approval')
    expect(resolution(STAGE)).toMatchObject({ resolution: null })
    expect(resolution({ ...STAGE, ended: true })).toMatchObject({ resolution: 'cancelled' })
  })

  it('initializes the agent, then carries a message and its reply', async () => {
    const recorded = recordingSink()
    const { host, sessionId } = await started(recorded.sink)
    expect(daemon.written(sessionId)).toEqual([
      { type: 'control_request', request_id: 'antumi-init', request: { subtype: 'initialize', perTaskStopAffordance: true } },
      { type: 'control_request', request_id: 'antumi-settings', request: { subtype: 'get_settings' } }
    ])

    const reply = daemon.reply
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'hello')
    expect(host.activity(STAGE.conversationId)).toBe('running')
    reply(sessionId, 'hello')
    expect(host.activity(STAGE.conversationId)).toBe('idle')
    expect(kinds(host.items(STAGE))).toEqual(['user', 'assistant', 'turn'])
    expect(recorded.messages.map((message) => [message.role, message.text])).toEqual([['user', 'hello'], ['assistant', 'echo: hello']])
    expect(recorded.offsets.at(-1)).toBe(daemon.sessions.get(sessionId)?.output.length)
  })

  it('accepts a stop arriving after the turn has already ended', async () => {
    const { host, sessionId } = await started()
    await host.send(STAGE.conversationId, 'hello')
    await flushMicrotasks()
    expect(host.activity(STAGE.conversationId)).toBe('idle')
    const sent = daemon.written(sessionId).length
    await expect(host.interrupt(STAGE.conversationId)).resolves.toBeUndefined()
    expect(daemon.written(sessionId)).toHaveLength(sent)
    await host.send(STAGE.conversationId, 'next')
    await flushMicrotasks()
    expect(host.items(STAGE).filter((item) => item.kind === 'user')).toHaveLength(2)
  })

  it('picks a stage up after a restart without reading or sending anything twice', async () => {
    const first = recordingSink()
    const { host, sessionId } = await started(first.sink)
    await host.send(STAGE.conversationId, 'hello')
    await flushMicrotasks()
    daemon.reply = (id) => daemon.emit(id, canUseTool('req-1'))
    await host.send(STAGE.conversationId, 'list the files')
    await flushMicrotasks()
    const before = host.items(STAGE)
    const sent = daemon.written(sessionId).length

    // A new core: same log on disk, the daemon still holds all of the session's output.
    const second = recordingSink()
    const restarted = new ChatHost(daemon, root, attachments, second.sink)
    daemon.deliver = (event) => {
      if (event.event === 'data') restarted.handleData(event.sessionId, event.offset, event.data)
    }
    await restarted.open(STAGE, sessionId, first.offsets.at(-1) ?? 0, false)
    expect(restarted.items(STAGE).map(({ revision: _revision, ...item }) => item))
      .toEqual(before.map(({ revision: _revision, ...item }) => item))
    expect(daemon.written(sessionId)).toHaveLength(sent)
    expect(restarted.activity(STAGE.conversationId)).toBe('awaiting')

    await restarted.respond(STAGE.conversationId, 'req-1', { decision: 'allow' })
    expect(daemon.written(sessionId).at(-1)).toMatchObject({ type: 'control_response', response: { request_id: 'req-1' } })
    expect(restarted.items(STAGE).find((item) => item.kind === 'approval')).toMatchObject({ resolution: 'allowed' })
  })

  it('tells of a stage it picks up after a restart even when it is idle as it was', async () => {
    const first = recordingSink()
    const { host, sessionId } = await started(first.sink)
    await host.send(STAGE.conversationId, 'hello')
    await flushMicrotasks()

    // A client that listed the conversation before the stage was open has it without a chat.
    const second = recordingSink()
    const restarted = new ChatHost(daemon, root, attachments, second.sink)
    await restarted.open(STAGE, sessionId, first.offsets.at(-1) ?? 0, false)
    expect(restarted.activity(STAGE.conversationId)).toBe('idle')
    expect(second.activity()).toBe(1)
  })

  it('tells of the oldest open request, and tells again when one of several is answered', async () => {
    const recorded = recordingSink()
    const { host } = await started(recorded.sink)
    const pwd = { ...canUseTool('req-2'), request: { ...canUseTool('req-2').request, input: { command: 'pwd' }, tool_use_id: 'toolu_2' } }
    daemon.reply = (id) => {
      daemon.emit(id, canUseTool('req-1'))
      daemon.emit(id, pwd)
    }
    await host.send(STAGE.conversationId, 'list the files')
    await flushMicrotasks()
    expect(host.request(STAGE.conversationId)).toMatchObject({ requestId: 'req-1', kind: 'approval', tool: 'Bash', title: 'ls', open: 2 })
    expect(host.request(STAGE.conversationId)?.decisions).toContain('allow')

    const told = recorded.activity()
    await host.respond(STAGE.conversationId, 'req-1', { decision: 'allow' })
    expect(host.activity(STAGE.conversationId)).toBe('awaiting')
    expect(host.request(STAGE.conversationId)).toMatchObject({ requestId: 'req-2', title: 'pwd', open: 1 })
    expect(recorded.activity()).toBeGreaterThan(told)
  })

  it('tells what a running turn is on, and tells again when it moves on', async () => {
    const recorded = recordingSink()
    const { host, sessionId } = await started(recorded.sink)
    const toolUse = (id: string, command: string) => ({ type: 'assistant', message: { id: `m-${id}`, content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } })
    daemon.reply = (id) => daemon.emit(id, toolUse('toolu_1', 'pnpm test'))
    await host.send(STAGE.conversationId, 'run the tests')
    await flushMicrotasks()
    expect(host.activity(STAGE.conversationId)).toBe('running')
    expect(host.doing(STAGE.conversationId)).toEqual({ tool: 'Bash', title: 'pnpm test' })
    const told = recorded.activity()
    daemon.emit(sessionId, toolUse('toolu_2', 'pnpm lint'))
    await flushMicrotasks()
    expect(host.doing(STAGE.conversationId)).toEqual({ tool: 'Bash', title: 'pnpm lint' })
    expect(recorded.activity()).toBeGreaterThan(told)
  })

  it('holds output that arrives while it reads the buffer, and feeds it once, in order', async () => {
    const host = new ChatHost(daemon, root, attachments, recordingSink().sink)
    const { sessionId } = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    daemon.answerInit = false
    const init = `${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'antumi-init' } })}\n`
    const assistant = `${JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'early' }] } })}\n`
    const session = daemon.sessions.get(sessionId)!
    session.output = init
    const opening = host.open(STAGE, sessionId, 0, true)
    // Both chunks arrive before the attach reply; the first is also in the buffer attach returns.
    host.handleData(sessionId, 0, init)
    session.output += assistant
    host.handleData(sessionId, init.length, assistant)
    await opening
    expect(host.items(STAGE).filter((item) => item.kind === 'assistant').map((item) => item.kind === 'assistant' && item.text)).toEqual(['early'])
  })

  const stateOf = (host: ChatHost) => host.items(STAGE).find((item) => item.kind === 'state')
  const userFrames = (sessionId: string) => daemon.written(sessionId).filter((frame) => JSON.stringify(frame).includes('"type":"user"'))
  const finish = (sessionId: string, terminal: 'completed' | 'aborted_streaming') =>
    daemon.emit(sessionId, { type: 'result', subtype: terminal === 'completed' ? 'success' : 'error_during_execution', is_error: terminal !== 'completed', terminal_reason: terminal })

  it('sends a message whose sender names its ref at most once', async () => {
    const { host, sessionId } = await started()
    await host.send(STAGE.conversationId, 'go on', [], false, false, 'usage-limit:1')
    await flushMicrotasks()
    await host.send(STAGE.conversationId, 'go on', [], false, false, 'usage-limit:1')
    expect(userFrames(sessionId)).toHaveLength(1)
    expect(host.items(STAGE).filter((item) => item.kind === 'user').map((item) => item.id)).toEqual(['u:usage-limit:1'])
  })

  it('leaves a disconnected send retryable instead of logging it as already sent', async () => {
    const { host, sessionId } = await started()
    vi.spyOn(daemon, 'assertConnected').mockImplementationOnce(() => { throw new Error('offline') })
    await expect(host.send(STAGE.conversationId, 'try again', [], false, false, 'retry')).rejects.toThrow('offline')
    expect(host.items(STAGE).filter((item) => item.kind === 'user')).toEqual([])
    expect(ChatLog.of(root, STAGE.conversationId, STAGE.stageId).read().records.some((record) => record.dir === 'out' && record.ref === 'retry')).toBe(false)
    await host.send(STAGE.conversationId, 'try again', [], false, false, 'retry')
    expect(userFrames(sessionId)).toHaveLength(1)
    expect(host.items(STAGE).filter((item) => item.kind === 'user')).toHaveLength(1)
  })

  it('does not resend a logged message when only the daemon write reply is lost', async () => {
    const { host, sessionId } = await started()
    const request = daemon.request
    vi.spyOn(daemon, 'request').mockImplementationOnce(async (method, params) => {
      await request(method, params)
      throw new Error('reply lost')
    })
    await expect(host.send(STAGE.conversationId, 'once', [], false, false, 'retry')).resolves.toBeUndefined()
    await host.send(STAGE.conversationId, 'once', [], false, false, 'retry')
    expect(userFrames(sessionId)).toHaveLength(1)
  })

  it('rejects a second live process for a conversation instead of routing messages to the first', async () => {
    const { host, sessionId } = await started()
    const second = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    await expect(host.open({ ...STAGE, stageId: 'second' }, second.sessionId, 0, true)).rejects.toMatchObject({ reason: 'chat-process-running' })
    await host.send(STAGE.conversationId, 'original')
    expect(userFrames(sessionId)).toHaveLength(1)
    expect(userFrames(second.sessionId)).toHaveLength(0)
  })

  it('retires a confirmed missing live when opening a replacement', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    const request = daemon.request
    vi.spyOn(daemon, 'request').mockImplementation(async (method, params) => {
      if (method === 'attach' && 'sessionId' in params && params.sessionId === sessionId) throw new Rejection('session-not-found')
      return request(method, params)
    })
    const second = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    await host.open({ ...STAGE, stageId: 'replacement' }, second.sessionId, 0, true)
    expect(host.owns(sessionId)).toBe(false)
    expect(host.items(STAGE).find((item) => item.kind === 'turn')).toMatchObject({ state: 'interrupted' })
    await host.send(STAGE.conversationId, 'new')
    expect(userFrames(second.sessionId)).toHaveLength(1)
  })

  it('holds uncertain queued sends and never replays them when the queue is released', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    await host.send(STAGE.conversationId, 'second', [], true, false, 'second')
    await host.send(STAGE.conversationId, 'third', [], true, false, 'third')
    const request = daemon.request
    vi.spyOn(daemon, 'request').mockImplementationOnce(async (method, params) => {
      await request(method, params)
      throw new Rejection('daemon-unavailable')
    })
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(stateOf(host)).toMatchObject({ queue: [{ ref: 'second', held: true }, { ref: 'third', held: true }] })
    await expect(host.sendQueued(STAGE.conversationId, 'second')).rejects.toMatchObject({ reason: 'delivery-uncertain' })
    await expect(host.sendQueued(STAGE.conversationId, 'second', true)).rejects.toMatchObject({ reason: 'delivery-uncertain' })
    expect(stateOf(host)).toMatchObject({ queue: expect.arrayContaining([expect.objectContaining({ ref: 'second' })]) })
    // An actual cancellation response proves the agent received it; an exit alone would not.
    finish(sessionId, 'aborted_streaming')
    await host.sendQueued(STAGE.conversationId, 'second')
    expect(userFrames(sessionId)).toHaveLength(2)
    expect(stateOf(host)).toMatchObject({ queue: [{ ref: 'third', held: true }] })
    host.forget(sessionId, STAGE.stageId)
  })

  it('keeps a queued message and its references when the daemon disconnects before dispatch', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    const references: ChatReference[] = [{ start: 0, end: 4, target: { kind: 'file', path: '/file', relative: null } }]
    await host.send(STAGE.conversationId, 'file', [], true, false, 'queued', references)
    await host.send(STAGE.conversationId, 'later', [], true, false, 'later')
    vi.spyOn(daemon, 'assertConnected').mockImplementation(() => { throw new Rejection('daemon-unavailable') })
    finish(sessionId, 'completed')
    expect(stateOf(host)).toMatchObject({ queue: [{ ref: 'queued', text: 'file', held: true, references }, { ref: 'later', held: true }] })
    expect(host.items(STAGE).filter((item) => item.kind === 'notice')).toMatchObject([{ level: 'error', text: expect.stringContaining('排队的消息没能发出') }])
  })

  it.each([false, true])('keeps the order when a middle queued message fails (send now: %s)', async (now) => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    for (const ref of ['second', 'third', 'fourth']) await host.send(STAGE.conversationId, ref, [], true, false, ref)
    if (!now) finish(sessionId, 'aborted_streaming')
    vi.spyOn(daemon, 'request').mockRejectedValueOnce(new Rejection('daemon-unavailable'))
    const send = host.sendQueued(STAGE.conversationId, 'third', now)
    if (now) await expect(send).rejects.toMatchObject({ reason: 'delivery-uncertain' })
    else await send
    await flushMicrotasks()
    expect(stateOf(host)).toMatchObject({ queue: [
      { ref: 'second', held: true }, { ref: 'third', held: true }, { ref: 'fourth', held: true }
    ] })
    const log = ChatLog.of(root, STAGE.conversationId, STAGE.stageId)
    expect(log.read().records.filter((record) => record.dir === 'queue').at(-1)).toMatchObject({ ref: 'fourth', held: true })
    host.forget(sessionId, STAGE.stageId)
    expect(stateOf(host)).toMatchObject({ queue: [
      { ref: 'second', held: true }, { ref: 'third', held: true }, { ref: 'fourth', held: true }
    ] })
  })

  it.each(['daemon-unavailable', 'session-not-found'])('keeps a real agent confirmation when the write later fails with %s', async (reason) => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    const request = daemon.request
    vi.spyOn(daemon, 'request').mockImplementationOnce(async (method, params) => {
      await request(method, params)
      finish(sessionId, 'completed')
      throw new Rejection(reason)
    })
    await expect(host.send(STAGE.conversationId, 'confirmed', [], false, false, 'confirmed')).resolves.toBeUndefined()
    expect(host.items(STAGE).find((item) => item.id === 'u:confirmed')).toMatchObject({ delivery: 'submitted' })
    expect(host.items(STAGE).find((item) => item.id === 'send-failed:confirmed')).toBeUndefined()
    expect(host.undelivered(STAGE, 'confirmed')).toBe(false)
    expect(host.owns(sessionId)).toBe(reason !== 'session-not-found')
    host.forget(sessionId, STAGE.stageId)
  })

  it('publishes a rejected send even if the process exit arrived first', async () => {
    const recorded = recordingSink()
    const { host, sessionId } = await started(recorded.sink)
    vi.spyOn(daemon, 'request').mockImplementationOnce(async () => {
      host.handleExit(sessionId, 143)
      throw new Rejection('session-not-found')
    })
    await expect(host.send(STAGE.conversationId, 'not delivered', [], false, false, 'rejected')).rejects.toMatchObject({ reason: 'session-not-found' })
    expect(recorded.items.find((item) => item.id === 'send-failed:rejected')).toMatchObject({ kind: 'notice', level: 'error', action: { kind: 'retryTurn' } })
    expect(recorded.items.findLast((item) => item.id === 'u:rejected')).toMatchObject({ delivery: 'undelivered' })
    expect(host.owns(sessionId)).toBe(false)
  })

  it('restores a failed queued message ahead of messages added while its write was pending', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    await host.send(STAGE.conversationId, 'second', [], true, false, 'second')
    let rejectWrite: (error: Error) => void = () => {}
    const pending = new Promise<never>((_resolve, reject) => { rejectWrite = reject })
    vi.spyOn(daemon, 'request').mockImplementationOnce(() => pending)
    const send = host.sendQueued(STAGE.conversationId, 'second', true)
    const rejected = expect(send).rejects.toMatchObject({ reason: 'delivery-uncertain' })
    await host.send(STAGE.conversationId, 'third', [], true, false, 'third')
    rejectWrite(new Rejection('daemon-unavailable'))
    await rejected
    expect(stateOf(host)).toMatchObject({ queue: [{ ref: 'second', held: true }, { ref: 'third', held: true }] })
    host.forget(sessionId, STAGE.stageId)
  })

  it('warns about silence without stopping or resending, and clears the warning after output', async () => {
    vi.useFakeTimers()
    try {
      const { host, sessionId } = await started()
      daemon.reply = () => {}
      await host.send(STAGE.conversationId, 'think', [], false, false, 'silent')
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(host.items(STAGE).find((item) => item.id === 'silent:silent')).toMatchObject({ level: 'warning', text: expect.stringContaining('5 分钟') })
      expect(host.activity(STAGE.conversationId)).toBe('running')
      expect(daemon.killed).toHaveLength(0)
      expect(userFrames(sessionId)).toHaveLength(1)
      daemon.emit(sessionId, { type: 'assistant', message: { id: 'response', content: [{ type: 'text', text: 'progress' }] } })
      expect(host.items(STAGE).find((item) => item.id === 'silent:silent')).toMatchObject({ level: 'info', text: 'Agent 已有新的进展。' })
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      finish(sessionId, 'completed')
      expect(host.items(STAGE).find((item) => item.id === 'silent:silent')).toMatchObject({ level: 'info', text: '这一轮已结束。' })
      host.forget(sessionId, STAGE.stageId)
    } finally { vi.useRealTimers() }
  })

  it.each(['tool', 'approval'] as const)('does not warn while waiting on a %s', async (kind) => {
    vi.useFakeTimers()
    try {
      const { host, sessionId } = await started()
      daemon.reply = () => {}
      await host.send(STAGE.conversationId, 'run', [], false, false, 'busy')
      if (kind === 'approval') daemon.emit(sessionId, canUseTool('approval'))
      else daemon.emit(sessionId, { type: 'assistant', message: { id: 'tool', content: [{ type: 'tool_use', id: 'long', name: 'Bash', input: { command: 'sleep 600' } }] } })
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(host.items(STAGE).some((item) => item.id === 'silent:busy')).toBe(false)
      expect(daemon.killed).toHaveLength(0)
      host.forget(sessionId, STAGE.stageId)
    } finally { vi.useRealTimers() }
  })

  it('passes on the limits the agent reports while it runs', async () => {
    const recorded = recordingSink()
    const { sessionId } = await started(recorded.sink)
    daemon.emit(sessionId, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.5, resetsAt: null } } } })
    expect(recorded.usage).toEqual([{ at: expect.any(Number), windows: [expect.objectContaining({ kind: 'session', usedPercent: 50 })], refresh: false }])
  })

  it('persists queue moves and sends the new first message after the current turn', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'working')
    for (const ref of ['first', 'second', 'third']) await host.send(STAGE.conversationId, ref, [], true, false, ref)
    host.moveQueued(STAGE.conversationId, 'third', 'up')
    host.moveQueued(STAGE.conversationId, 'first', 'down')
    expect(stateOf(host)).toMatchObject({ queue: [{ ref: 'third' }, { ref: 'first' }, { ref: 'second' }] })
    expect(userFrames(sessionId)).toHaveLength(1)
    const replayed = new ChatHost(daemon, root, attachments, recordingSink().sink)
    expect(replayed.items(STAGE).find((item) => item.kind === 'state')).toMatchObject({
      queue: [{ ref: 'third' }, { ref: 'first' }, { ref: 'second' }]
    })
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(userFrames(sessionId)).toHaveLength(2)
    expect(JSON.stringify(userFrames(sessionId)[1])).toContain('third')
    expect(() => host.moveQueued(STAGE.conversationId, 'third', 'up')).toThrow('no message is waiting')
    expect(stateOf(host)).toMatchObject({ queue: [{ ref: 'first' }, { ref: 'second' }] })
  })

  it('sends a message queued during a turn once the turn completes', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    await host.send(STAGE.conversationId, 'second', [], true)
    expect(stateOf(host)).toMatchObject({ queued: { text: 'second', held: false } })
    expect(userFrames(sessionId)).toHaveLength(1)
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(userFrames(sessionId).map((frame) => JSON.stringify(frame))).toEqual([
      expect.stringContaining('first'),
      expect.stringContaining('second')
    ])
    expect(stateOf(host)).toMatchObject({ queued: null })
    expect(host.items(STAGE).filter((item) => item.kind === 'user').map((item) => item.kind === 'user' && item.text)).toEqual(['first', 'second'])
  })

  it('counts a turn over when it ends, though a command it started runs on in the background', async () => {
    const { host, sessionId } = await started()
    daemon.reply = (id) => {
      daemon.emit(id, { type: 'assistant', uuid: 'uuid-1', message: { id: 'msg-1', content: [{ type: 'tool_use', id: 'toolu_bg', name: 'Bash', input: { command: 'pnpm dev', run_in_background: true } }] }, parent_tool_use_id: null })
      daemon.emit(id, { type: 'system', subtype: 'task_started', task_id: 'task-1', tool_use_id: 'toolu_bg', task_type: 'local_bash', is_backgrounded: true })
    }
    await host.send(STAGE.conversationId, 'start the server')
    await flushMicrotasks()
    expect(host.turnOver(STAGE.conversationId)).toBe(false)
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(host.turnOver(STAGE.conversationId)).toBe(true)
    expect(host.idle(STAGE.conversationId)).toBe(false)
  })

  it('sends a message at once between turns, though a command runs on in the background', async () => {
    const { host, sessionId } = await started()
    daemon.reply = (id) => {
      daemon.emit(id, { type: 'assistant', uuid: 'uuid-1', message: { id: 'msg-1', content: [{ type: 'tool_use', id: 'toolu_bg', name: 'Bash', input: { command: 'pnpm dev', run_in_background: true } }] }, parent_tool_use_id: null })
      daemon.emit(id, { type: 'system', subtype: 'task_started', task_id: 'task-1', tool_use_id: 'toolu_bg', task_type: 'local_bash', is_backgrounded: true })
    }
    await host.send(STAGE.conversationId, 'start the server')
    await flushMicrotasks()
    expect(host.betweenTurns(STAGE.conversationId)).toBe(false)
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(host.activity(STAGE.conversationId)).toBe('running')
    expect(host.betweenTurns(STAGE.conversationId)).toBe(true)
    daemon.reply = () => {}
    // Steered or queued, it goes as a new turn's message rather than waiting on the command.
    await host.send(STAGE.conversationId, 'is it up?', [], true, true)
    expect(userFrames(sessionId).map((frame) => JSON.stringify(frame))).toEqual([expect.stringContaining('start the server'), expect.stringContaining('is it up?')])
    expect(stateOf(host)).toMatchObject({ queued: null })
  })

  it('stops a background task on its own, and refuses what is not running in the background', async () => {
    const { host, sessionId } = await started()
    daemon.reply = (id) => {
      daemon.emit(id, { type: 'assistant', uuid: 'uuid-1', message: { id: 'msg-1', content: [{ type: 'tool_use', id: 'toolu_bg', name: 'Bash', input: { command: 'sleep 300', run_in_background: true } }] }, parent_tool_use_id: null })
      daemon.emit(id, { type: 'system', subtype: 'task_started', task_id: 'task-1', tool_use_id: 'toolu_bg', task_type: 'local_bash', is_backgrounded: true })
      daemon.emit(id, { type: 'result', subtype: 'success', is_error: false, result: 'started', terminal_reason: 'completed', duration_ms: 5 })
    }
    await host.send(STAGE.conversationId, 'run it')
    await flushMicrotasks()
    await expect(host.stopBackground(STAGE.conversationId, 't:nothing')).rejects.toMatchObject({ reason: 'chat-not-stoppable' })
    await host.stopBackground(STAGE.conversationId, 't:toolu_bg')
    expect(daemon.written(sessionId).at(-1)).toEqual({ type: 'control_request', request_id: 'antumi-stop-1', request: { subtype: 'stop_task', task_id: 'task-1' } })
  })

  it('holds a queued message after an interrupted turn until the user sends or drops it', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    await host.send(STAGE.conversationId, 'second', [], true)
    finish(sessionId, 'aborted_streaming')
    await flushMicrotasks()
    expect(stateOf(host)).toMatchObject({ queued: { text: 'second', held: true } })
    expect(userFrames(sessionId)).toHaveLength(1)
    await host.sendQueued(STAGE.conversationId)
    await flushMicrotasks()
    expect(userFrames(sessionId)).toHaveLength(2)
    finish(sessionId, 'completed')
    await host.send(STAGE.conversationId, 'third', [], true)
    finish(sessionId, 'aborted_streaming')
    host.cancelQueued(STAGE.conversationId)
    expect(stateOf(host)).toMatchObject({ queued: null, queue: [] })
    await expect(host.sendQueued(STAGE.conversationId)).rejects.toMatchObject({ reason: 'chat-nothing-queued' })
  })

  it('records accepted source deliveries and never queues the same ref twice', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    const ref = 'source-comments:batch'
    await host.send(STAGE.conversationId, 'new comments', [], true, false, ref)
    await host.send(STAGE.conversationId, 'new comments', [], true, false, ref)
    expect(stateOf(host)).toMatchObject({ queue: [{ ref }] })
    const state = stateOf(host)
    expect(state?.kind === 'state' ? state.queue : []).toHaveLength(1)
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(userFrames(sessionId)).toHaveLength(2)
    expect(ChatLog.of(root, STAGE.conversationId, STAGE.stageId).read().records.filter((record) => record.dir === 'receipt' && record.ref === ref)).toHaveLength(1)
  })

  it('sends queued messages one turn at a time, in the order they were written', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    await host.send(STAGE.conversationId, 'second', [], true)
    await host.send(STAGE.conversationId, 'third', [], true)
    expect(stateOf(host)).toMatchObject({ queued: { text: 'second' }, queue: [{ text: 'second', held: false }, { text: 'third', held: false }] })
    finish(sessionId, 'completed')
    await flushMicrotasks()
    // The second went out and started a turn; the third waits for that one.
    expect(userFrames(sessionId)).toHaveLength(2)
    expect(stateOf(host)).toMatchObject({ queue: [{ text: 'third' }] })
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(userFrames(sessionId)).toHaveLength(3)
    expect(stateOf(host)).toMatchObject({ queue: [] })
  })

  it('drops one queued message by its ref and sends another into the running turn at once', async () => {
    const { host, sessionId } = await started()
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    await host.send(STAGE.conversationId, 'second', [], true)
    await host.send(STAGE.conversationId, 'third', [], true)
    const state = stateOf(host)
    const [second, third] = state?.kind === 'state' ? state.queue : []
    host.cancelQueued(STAGE.conversationId, second!.ref)
    expect(stateOf(host)).toMatchObject({ queue: [{ text: 'third' }] })
    await host.sendQueued(STAGE.conversationId, third!.ref, true)
    // Into the running turn: a user item marked as steering, the turn still the first's.
    expect(userFrames(sessionId)).toHaveLength(2)
    expect(stateOf(host)).toMatchObject({ queue: [], steerable: true })
    expect(host.items(STAGE).filter((item) => item.kind === 'user')).toMatchObject([{ text: 'first' }, { text: 'third', steer: true }])
    expect(host.activity(STAGE.conversationId)).toBe('running')
  })

  describe('a message for the running turn alone', () => {
    const timing = { ...STEER_TIMING }
    beforeEach(() => { STEER_TIMING.settleMs = 40; STEER_TIMING.answerMs = 80 })
    afterEach(() => { Object.assign(STEER_TIMING, timing) })

    it('goes into the turn under way, which stays the same one', async () => {
      const { host, sessionId } = await started()
      daemon.reply = () => {}
      await host.send(STAGE.conversationId, 'first')
      await host.steerInto(STAGE.conversationId, 'not that file', [], 'steer-1')
      expect(userFrames(sessionId)).toHaveLength(2)
      expect(host.items(STAGE).filter((item) => item.kind === 'user')).toMatchObject([{ text: 'first' }, { id: 'u:steer-1', text: 'not that file', steer: true }])
      expect(host.activity(STAGE.conversationId)).toBe('running')
      expect(stateOf(host)).toMatchObject({ queue: [] })
      finish(sessionId, 'completed')
      expect(host.items(STAGE).filter((item) => item.kind === 'turn')).toHaveLength(1)
      // Sent again under the same ref, it is the same message.
      await host.steerInto(STAGE.conversationId, 'not that file', [], 'steer-1')
      expect(userFrames(sessionId)).toHaveLength(2)
    })

    it('is refused with no turn under way, starting none and queuing nothing', async () => {
      const { host, sessionId } = await started()
      await expect(host.steerInto(STAGE.conversationId, 'too early')).rejects.toMatchObject({ reason: 'chat-no-steer' })
      await host.send(STAGE.conversationId, 'first')
      await flushMicrotasks()
      expect(host.activity(STAGE.conversationId)).toBe('idle')
      await expect(host.steerInto(STAGE.conversationId, 'too late')).rejects.toMatchObject({ reason: 'chat-no-steer' })
      expect(userFrames(sessionId)).toHaveLength(1)
      expect(host.items(STAGE).filter((item) => item.kind === 'user')).toHaveLength(1)
      expect(stateOf(host)).toMatchObject({ queue: [] })
    })

    it('is refused between turns, where the agent would start a turn for it', async () => {
      const { host, sessionId } = await started()
      daemon.reply = () => {}
      await host.send(STAGE.conversationId, 'start the dev server')
      daemon.emit(sessionId, { type: 'assistant', uuid: 'a-bg', message: { id: 'm-bg', content: [{ type: 'tool_use', id: 'bg', name: 'Bash', input: { command: 'pnpm dev', run_in_background: true } }] }, parent_tool_use_id: null })
      daemon.emit(sessionId, { type: 'system', subtype: 'task_started', task_id: 'task-bg', tool_use_id: 'bg', task_type: 'local_bash', is_backgrounded: true })
      finish(sessionId, 'completed')
      expect(host.activity(STAGE.conversationId)).toBe('running')
      expect(host.betweenTurns(STAGE.conversationId)).toBe(true)
      await expect(host.steerInto(STAGE.conversationId, 'one more thing')).rejects.toMatchObject({ reason: 'chat-no-steer' })
      expect(userFrames(sessionId)).toHaveLength(1)
    })

    it('is refused by an agent that may run it after the turn', async () => {
      const host = new ChatHost(daemon, root, attachments, recordingSink().sink)
      const { sessionId } = await daemon.request('spawnPipe', { command: 'zcode', args: [], cwd: '/work/repo', env: {} })
      await host.open({ ...STAGE, agent: 'zcode' }, sessionId, 0, false)
      await expect(host.steerInto(STAGE.conversationId, 'not that file')).rejects.toMatchObject({ reason: 'chat-no-steer', message: expect.stringContaining('ZCode') })
    })

    it('holds the turn it went into as maybe not the last for a moment after it ends, and says when that is over', async () => {
      const recorded = recordingSink()
      const { host, sessionId } = await started(recorded.sink)
      daemon.reply = () => {}
      await host.send(STAGE.conversationId, 'first')
      expect(host.steerUnsettled(STAGE.conversationId)).toBe(false)
      await host.steerInto(STAGE.conversationId, 'not that file')
      // Still running: the turn itself is what is waited on.
      expect(host.steerUnsettled(STAGE.conversationId)).toBe(false)
      finish(sessionId, 'completed')
      expect(host.steerUnsettled(STAGE.conversationId)).toBe(true)
      const told = recorded.activity()
      await expect.poll(() => host.steerUnsettled(STAGE.conversationId), { timeout: 1000 }).toBe(false)
      expect(recorded.activity()).toBeGreaterThan(told)
    })

    it('does not hold a turn that took none', async () => {
      const { host, sessionId } = await started()
      daemon.reply = () => {}
      await host.send(STAGE.conversationId, 'first')
      await host.send(STAGE.conversationId, 'into the turn, as any chat takes it', [], false, true)
      finish(sessionId, 'completed')
      expect(host.steerUnsettled(STAGE.conversationId)).toBe(false)
    })
  })

  it('keeps a queued message across a restart and sends it when the turn ends', async () => {
    const first = recordingSink()
    const { host, sessionId } = await started(first.sink)
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    await host.send(STAGE.conversationId, 'second', [], true)
    const restarted = new ChatHost(daemon, root, attachments, recordingSink().sink)
    daemon.deliver = (event) => {
      if (event.event === 'data') restarted.handleData(event.sessionId, event.offset, event.data)
    }
    await restarted.open(STAGE, sessionId, first.offsets.at(-1) ?? 0, false)
    expect(stateOf(restarted)).toMatchObject({ queued: { text: 'second', held: false } })
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(userFrames(sessionId)).toHaveLength(2)
  })

  it('persists reference targets with queued and sent messages without changing the agent prompt', async () => {
    const first = recordingSink()
    const { host, sessionId } = await started(first.sink)
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'first')
    const text = 'look @src/a.ts'
    const references: ChatReference[] = [{ start: 5, end: text.length, target: { kind: 'file', path: '/work/repo/src/a.ts', relative: 'src/a.ts' } }]
    await host.send(STAGE.conversationId, text, [], true, false, 'with-reference', references)
    expect(stateOf(host)).toMatchObject({ queue: [{ text, references }] })
    const restarted = new ChatHost(daemon, root, attachments, recordingSink().sink)
    daemon.deliver = (event) => {
      if (event.event === 'data') restarted.handleData(event.sessionId, event.offset, event.data)
    }
    await restarted.open(STAGE, sessionId, first.offsets.at(-1) ?? 0, false)
    expect(stateOf(restarted)).toMatchObject({ queue: [{ references }] })
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(restarted.items(STAGE).find((item) => item.id === 'u:with-reference')).toMatchObject({ text, references })
    expect(userFrames(sessionId).at(-1)).toMatchObject({ message: { content: text } })
    const replayed = new ChatHost(daemon, root, attachments, recordingSink().sink)
    expect(replayed.items(STAGE).find((item) => item.id === 'u:with-reference')).toMatchObject({ text, references })
  })

  it('notes a hole in the output instead of reading half a frame', async () => {
    const host = new ChatHost(daemon, root, attachments, recordingSink().sink)
    const { sessionId } = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    daemon.answerInit = false
    await host.open(STAGE, sessionId, 0, false)
    host.handleData(sessionId, 500, `"text":"cut"}}\n${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-1' })}\n`)
    const [notice] = host.items(STAGE).filter((item) => item.kind === 'notice')
    expect(notice).toMatchObject({ level: 'warning' })
  })

  it('closes a stage when its agent exits and lets the daemon drop the output', async () => {
    const { host, sessionId } = await started()
    await host.send(STAGE.conversationId, 'hello')
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'again').catch(() => {})
    daemon.exit(sessionId, 1)
    expect(host.owns(sessionId)).toBe(false)
    expect(daemon.released).toContain(sessionId)
    expect(host.activity(STAGE.conversationId)).toBeNull()
    // Still readable from the log once the process is gone.
    expect(kinds(host.items(STAGE))).toContain('user')
  })

  it('fails the start with what the agent printed when it exits before initializing', async () => {
    const host = new ChatHost(daemon, root, attachments, recordingSink().sink)
    daemon.deliver = (event) => {
      if (event.event === 'exit') host.handleExit(event.sessionId, event.exitCode)
    }
    daemon.answerInit = false
    const { sessionId } = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    daemon.sessions.get(sessionId)!.stderr = 'Invalid API key · Please run /login'
    const opening = host.open(STAGE, sessionId, 0, true)
    queueMicrotask(() => daemon.exit(sessionId, 1))
    await expect(opening).rejects.toMatchObject({ reason: 'chat-start-failed', message: expect.stringContaining('Invalid API key') })
  })

  it('fails the start in plain text, without the colours the agent printed in', async () => {
    const host = new ChatHost(daemon, root, attachments, recordingSink().sink)
    daemon.deliver = (event) => {
      if (event.event === 'exit') host.handleExit(event.sessionId, event.exitCode)
    }
    daemon.answerInit = false
    const { sessionId } = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    daemon.sessions.get(sessionId)!.stderr = '\u001b[31mERROR\u001b[0m \u001b[2mInvalid API key\u001b[0m'
    const opening = host.open(STAGE, sessionId, 0, true)
    queueMicrotask(() => daemon.exit(sessionId, 1))
    await expect(opening).rejects.toMatchObject({ reason: 'chat-start-failed', message: 'ERROR Invalid API key' })
  })
  it('shows the agent a message\'s images and keeps only their names in the log', async () => {
    const recorded = recordingSink()
    const { host, sessionId } = await started(recorded.sink)
    const stored = await attachments.put(pngBytes(4, 3))
    const image = { id: stored.id, width: 4, height: 3 }
    daemon.reply = () => {}
    await host.send(STAGE.conversationId, 'what is this', [image])
    expect(userFrames(sessionId)[0]).toMatchObject({ message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png' } }, { type: 'text', text: 'what is this' }] } })
    const log = readFileSync(path.join(root, STAGE.conversationId, 'stages', `${STAGE.stageId}.jsonl`), 'utf8')
    expect(log).not.toContain('base64')
    expect(log).toContain(stored.id)
    expect(host.items(STAGE).find((item) => item.kind === 'user')).toMatchObject({ text: 'what is this', images: [image] })
    expect(recorded.messages[0]).toMatchObject({ role: 'user', text: 'what is this\n\n（附了 1 张图片）' })

    // Queued with an image, a message goes out with it once the turn ends, after a restart too.
    await host.send(STAGE.conversationId, '', [image], true)
    expect(stateOf(host)).toMatchObject({ queued: { text: '', images: [image] } })
    const restarted = new ChatHost(daemon, root, attachments, recordingSink().sink)
    daemon.deliver = (event) => {
      if (event.event === 'data') restarted.handleData(event.sessionId, event.offset, event.data)
    }
    await restarted.open(STAGE, sessionId, recorded.offsets.at(-1) ?? 0, false)
    finish(sessionId, 'completed')
    await flushMicrotasks()
    expect(userFrames(sessionId)).toHaveLength(2)
    expect(userFrames(sessionId)[1]).toMatchObject({ message: { content: [{ type: 'image' }] } })
    expect(restarted.items(STAGE).filter((item) => item.kind === 'user').at(-1)).toMatchObject({ text: '', images: [image] })
  })

  it('keeps every line in the wire log while it is on, as it went', async () => {
    const added: string[] = []
    const wire = new WireLog(root, (_conversationId, _stageId, entries) => added.push(...entries.map((entry) => entry.dir)))
    wire.setEnabled(true)
    const host = new ChatHost(daemon, root, attachments, recordingSink().sink, Date.now, wire)
    daemon.deliver = (event) => {
      if (event.event === 'data') host.handleData(event.sessionId, event.offset, event.data)
      if (event.event === 'exit') host.handleExit(event.sessionId, event.exitCode)
    }
    const { sessionId } = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    await host.open(STAGE, sessionId, 0, true)
    // What the chat log leaves out: a line that is no frame, and a stream event.
    daemon.print(sessionId, 'Warning: something odd\n')
    daemon.emit(sessionId, { type: 'stream_event', event: { type: 'content_block_delta' } })
    host.handleStderr(sessionId, 'debug: hello\n')
    daemon.exit(sessionId, 0)
    await flushMicrotasks()

    const { entries } = wire.page(STAGE.conversationId, STAGE.stageId)
    expect(entries[0]?.dir).toBe('stdin')
    expect(JSON.parse(entries[0]?.text ?? '')).toMatchObject({ request: { subtype: 'initialize' } })
    // The handshake goes both ways first; then the lines above, in order.
    expect(entries.slice(-4).map((entry) => [entry.dir, entry.text])).toEqual([
      ['stdout', 'Warning: something odd'],
      ['stdout', JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta' } })],
      ['stderr', 'debug: hello\n'],
      ['exit', '{"code":0}']
    ])
    expect(added).toEqual(entries.map((entry) => entry.dir))
  })

  it('keeps no wire log while it is off', async () => {
    const wire = new WireLog(root, () => {})
    const host = new ChatHost(daemon, root, attachments, recordingSink().sink, Date.now, wire)
    daemon.deliver = (event) => {
      if (event.event === 'data') host.handleData(event.sessionId, event.offset, event.data)
    }
    const { sessionId } = await daemon.request('spawnPipe', { command: 'claude', args: [], cwd: '/work/repo', env: {} })
    await host.open(STAGE, sessionId, 0, true)
    expect(wire.stages(STAGE.conversationId)).toEqual([])
  })
})
