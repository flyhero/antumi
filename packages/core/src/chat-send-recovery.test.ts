import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { AGENT_KINDS, agentDescriptor, DSH_MODES, DSH_RUNTIME_VERSION, type AgentKind, type ChatReference } from '@antumi/protocol'
import { adapterOf } from './agents'
import { ChatHost } from './chat-host'
import { ChatLog, parseChatRecord } from './chat-log'
import { AttachmentStore } from './attachment-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { Rejection } from './rejection'
import type { ChatRecord, ChatStageOptions } from './chat-driver'

const agentsRoot = fileURLToPath(new URL('./agents', import.meta.url))
const providers = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.modelProviders.length > 0)

// Use each adapter's recorded handshake; no CLI, credentials or network service is started.
function bootstrap(kind: AgentKind, options: ChatStageOptions): ChatRecord[] {
  const adapter = adapterOf(kind)
  if (kind === 'dsh') {
    const driver = adapter.createDriver('stage', options)
    const records: ChatRecord[] = []
    const apply = (record: ChatRecord) => { records.push(record); driver.apply(record) }
    const due = () => driver.due().forEach((frame) => apply({ dir: 'out', at: records.length, frame }))
    const receive = (frame: unknown) => apply({ dir: 'in', at: records.length, frame })
    const model = JSON.stringify(['test', 'model'])
    const configs = [
      { id: 'model', category: 'model', name: 'Model', currentValue: model, options: [{ value: model, name: 'Test model' }] },
      { id: 'antumi.permissionMode', category: 'mode', name: 'Mode', currentValue: 'ask', options: DSH_MODES.map((value) => ({ value, name: value })) }
    ]
    due()
    receive({ id: 'dsh-init', result: { protocolVersion: 1, _meta: { antumiDshRuntime: DSH_RUNTIME_VERSION } } })
    due()
    receive({ id: 'dsh-session', result: { sessionId: 'session', configOptions: configs } })
    due()
    receive({ id: 'dsh-models', result: { models: [{ value: model, name: 'Test model', configOptions: [] }] } })
    due()
    if (!driver.ready()) throw new Error('DSH handshake did not finish')
    return records
  }
  const dir = path.join(agentsRoot, kind, 'fixtures')
  const files = readdirSync(dir).filter((file) => file.endsWith('.jsonl'))
    .sort((a, b) => Number(!a.endsWith('-session.jsonl')) - Number(!b.endsWith('-session.jsonl')))
  for (const file of files) {
    const driver = adapter.createDriver('stage', options)
    const records: ChatRecord[] = []
    for (const line of readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      const record = parseChatRecord(line)
      if (!record) continue
      records.push(record)
      driver.apply(record)
      if (driver.ready() && driver.activity() === 'idle') {
        try { driver.send('hello'); return records } catch { /* Wait for pending initial options. */ }
      }
    }
  }
  throw new Error(`No ready handshake fixture for ${kind}`)
}

async function opened(kind: AgentKind) {
  const root = mkdtempSync(path.join(tmpdir(), 'antumi-send-recovery-'))
  mkdirSync(path.join(root, 'attachments'))
  const options: ChatStageOptions = { cwd: '/work/repo', extraDirs: [], resume: null, mcp: { command: 'node', args: ['/antumi/mcp.mjs'] } }
  const stage = { conversationId: 'probe', stageId: 'stage', agent: kind, options }
  const initial = bootstrap(kind, options)
  ChatLog.of(root, stage.conversationId, stage.stageId).append(initial)
  const daemon = fakeChatDaemon()
  daemon.answerInit = false
  daemon.reply = () => {}
  const host = new ChatHost(daemon, root, new AttachmentStore(path.join(root, 'attachments')), {
    items: () => {}, delta: () => {}, messages: () => {}, provider: () => {}, activity: () => {}, offset: () => {}, usage: () => {}
  })
  daemon.deliver = (event) => {
    if (event.event === 'data') host.handleData(event.sessionId, event.offset, event.data)
    else if (event.event === 'exit') host.handleExit(event.sessionId, event.exitCode)
  }
  const { sessionId } = await daemon.request('spawnPipe', { command: 'test', args: [], cwd: root, env: {} })
  await host.open(stage, sessionId, 0, true)
  const cleanup = () => { host.forget(sessionId, stage.stageId); rmSync(root, { recursive: true, force: true }) }
  return { root, stage, initial, daemon, host, sessionId, cleanup }
}

describe('provider agents share reliable failure handling', () => {
  it.each([false, true])('keeps a refused steer retry distinct from its earlier write receipt (send now: %s)', async (now) => {
    const { stage, daemon, host, sessionId, cleanup } = await opened('codex')
    try {
      await host.send(stage.conversationId, 'first')
      daemon.emit(sessionId, { id: 'antumi-turn-1', result: { turn: { id: 'turn-1' } } })
      await host.send(stage.conversationId, 'steer', [], false, true, 'steer')
      daemon.emit(sessionId, { id: 'antumi-steer-1', error: { code: -32600, message: 'no active turn' } })
      expect(host.items(stage).find((item) => item.kind === 'state')).toMatchObject({ queue: [{ ref: 'steer' }] })
      vi.spyOn(daemon, 'request').mockRejectedValueOnce(new Rejection('session-not-found'))
      if (now) await expect(host.sendQueued(stage.conversationId, 'steer', true)).rejects.toMatchObject({ reason: 'session-not-found' })
      else {
        daemon.emit(sessionId, { method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      expect(host.undelivered(stage, 'steer')).toBe(true)
      expect(host.owns(sessionId)).toBe(false)
      expect(host.items(stage).find((item) => item.kind === 'state')).toMatchObject({ queue: [{ ref: 'steer', held: true }] })
    } finally { cleanup() }
  })

  it('does not repeat a submitted Codex steer before its user item arrives, including after replay', async () => {
    const { stage, daemon, host, sessionId, cleanup } = await opened('codex')
    try {
      await host.send(stage.conversationId, 'first')
      daemon.emit(sessionId, { id: 'antumi-turn-1', result: { turn: { id: 'turn-1' } } })
      await host.send(stage.conversationId, 'steer', [], false, true, 'steer')
      expect(host.items(stage).find((item) => item.id === 'u:steer')).toBeUndefined()
      expect(host.submitted(stage, 'steer')).toBe(true)
      const writes = daemon.written(sessionId).length
      await host.send(stage.conversationId, 'steer', [], false, true, 'steer')
      expect(daemon.written(sessionId)).toHaveLength(writes)
      host.forget(sessionId, stage.stageId)
      expect(host.submitted(stage, 'steer')).toBe(true)
      await host.open(stage, sessionId, 0, true)
      await host.send(stage.conversationId, 'steer', [], false, true, 'steer')
      expect(daemon.written(sessionId)).toHaveLength(writes)
    } finally { cleanup() }
  })

  it.each([false, true])('ignores an old Codex completion while a newer delivery is uncertain (started: %s)', async (started) => {
    const { stage, daemon, host, sessionId, cleanup } = await opened('codex')
    try {
      await host.send(stage.conversationId, 'first', [], false, false, 'first')
      daemon.emit(sessionId, { method: 'turn/started', params: { turn: { id: 'old' } } })
      daemon.emit(sessionId, { method: 'turn/completed', params: { turn: { id: 'old', status: 'completed' } } })
      vi.spyOn(daemon, 'request').mockRejectedValueOnce(new Rejection('daemon-unavailable'))
      await expect(host.send(stage.conversationId, 'second', [], false, false, 'second')).rejects.toMatchObject({ reason: 'delivery-uncertain' })
      if (started) daemon.emit(sessionId, { method: 'turn/started', params: { turn: { id: 'new' } } })
      daemon.emit(sessionId, { method: 'turn/started', params: { turn: { id: 'old' } } })
      daemon.emit(sessionId, { method: 'turn/completed', params: { turn: { id: 'old', status: 'completed' } } })
      if (started) daemon.emit(sessionId, { method: 'turn/completed', params: { turn: { id: 'other', status: 'completed' } } })
      expect(host.activity(stage.conversationId)).toBe('running')
      expect(() => host.assertDelivery(stage, 'second')).toThrow(expect.objectContaining({ reason: 'delivery-uncertain' }))
      daemon.emit(sessionId, { method: 'turn/started', params: { turn: { id: 'new' } } })
      daemon.emit(sessionId, { method: 'turn/completed', params: { turn: { id: 'new', status: 'completed' } } })
      expect(host.activity(stage.conversationId)).toBe('idle')
      expect(host.items(stage).find((item) => item.id === 'u:second')).toMatchObject({ delivery: 'submitted' })
      expect(() => host.assertDelivery(stage, 'second')).not.toThrow()
    } finally { cleanup() }
  })

  it.each([false, true])('confirms an uncertain steer when Codex later acknowledges it (queued: %s)', async (queued) => {
    const { stage, daemon, host, sessionId, cleanup } = await opened('codex')
    try {
      await host.send(stage.conversationId, 'first')
      daemon.emit(sessionId, { id: 'antumi-turn-1', result: { turn: { id: 'turn-1' } } })
      if (queued) await host.send(stage.conversationId, 'steer', [], true, false, 'steer')
      const request = daemon.request
      vi.spyOn(daemon, 'request').mockImplementationOnce(async (method, params) => {
        await request(method, params)
        throw new Rejection('daemon-unavailable')
      })
      const send = queued ? host.sendQueued(stage.conversationId, 'steer', true) : host.send(stage.conversationId, 'steer', [], false, true, 'steer')
      await expect(send).rejects.toMatchObject({ reason: 'delivery-uncertain' })
      const before = daemon.written(sessionId).length
      await expect(host.send(stage.conversationId, 'steer', [], false, true, 'steer')).rejects.toMatchObject({ reason: 'delivery-uncertain' })
      if (queued) {
        await expect(host.sendQueued(stage.conversationId, 'steer')).rejects.toMatchObject({ reason: 'delivery-uncertain' })
        await expect(host.sendQueued(stage.conversationId, 'steer', true)).rejects.toMatchObject({ reason: 'delivery-uncertain' })
        expect(host.items(stage).find((item) => item.kind === 'state')).toMatchObject({ queue: [{ ref: 'steer', held: true }] })
      }
      expect(daemon.written(sessionId)).toHaveLength(before)
      daemon.emit(sessionId, { id: 'antumi-steer-1', result: {} })
      expect(() => host.assertDelivery(stage, 'steer')).not.toThrow()
      expect(host.items(stage).find((item) => item.id === 'u:steer')).toMatchObject({ delivery: 'submitted' })
    } finally { cleanup() }
  })
  it.each(providers)('%s closes a missing session and permits an explicitly rejected ref on a new stage', async (kind) => {
    const { root, stage, initial, daemon, host, sessionId, cleanup } = await opened(kind)
    try {
      const before = daemon.written(sessionId).length
      const references: ChatReference[] = [{ start: 0, end: 5, target: { kind: 'file', path: '/retry', relative: null } }]
      vi.spyOn(daemon, 'request').mockRejectedValueOnce(new Rejection('session-not-found'))
      await expect(host.send(stage.conversationId, 'retry', [], false, false, 'retry', references)).rejects.toMatchObject({ reason: 'session-not-found' })
      expect(daemon.written(sessionId)).toHaveLength(before)
      expect(host.activity(stage.conversationId)).toBeNull()
      expect(host.undelivered(stage, 'retry')).toBe(true)
      expect(host.items(stage).find((item) => item.id === 'u:retry')).toMatchObject({ references })
      const notice = host.items(stage).find((item) => item.id === 'send-failed:retry')
      expect(notice).toMatchObject({ kind: 'notice', level: 'error', action: { kind: 'retryTurn' } })
      const next = { ...stage, stageId: 'next' }
      ChatLog.of(root, stage.conversationId, next.stageId).append(initial)
      const spawned = await daemon.request('spawnPipe', { command: 'test', args: [], cwd: root, env: {} })
      await host.open(next, spawned.sessionId, 0, true)
      const writes = daemon.written(spawned.sessionId).length
      await host.send(stage.conversationId, 'retry', [], false, false, 'retry')
      expect(daemon.written(spawned.sessionId)).toHaveLength(writes + 1)
      expect(host.undelivered(next, 'retry')).toBe(false)
      host.forget(spawned.sessionId, next.stageId)
    } finally { cleanup() }
  })

  it.each(providers)('%s never resends when a successful write loses its reply', async (kind) => {
    const { stage, daemon, host, sessionId, cleanup } = await opened(kind)
    try {
      const request = daemon.request
      const before = daemon.written(sessionId).length
      vi.spyOn(daemon, 'request').mockImplementationOnce(async (method, params) => {
        await request(method, params)
        throw new Rejection('daemon-unavailable')
      })
      await expect(host.send(stage.conversationId, 'once', [], false, false, 'once')).rejects.toMatchObject({ reason: 'delivery-uncertain' })
      await expect(host.send(stage.conversationId, 'once', [], false, false, 'once')).rejects.toMatchObject({ reason: 'delivery-uncertain' })
      expect(daemon.written(sessionId)).toHaveLength(before + 1)
      expect(host.undelivered(stage, 'once')).toBe(false)
      expect(host.owns(sessionId)).toBe(true)
      expect(host.items(stage).find((item) => item.id === 'send-failed:once')).toMatchObject({ level: 'error' })
      expect(host.items(stage).find((item) => item.id === 'send-failed:once')).not.toHaveProperty('action')
      host.handleExit(sessionId, 143)
      expect(() => host.assertDelivery(stage, 'once')).toThrow(expect.objectContaining({ reason: 'delivery-uncertain' }))
    } finally { cleanup() }
  })

  it.each(providers)('%s gets a silence warning without an automatic stop or resend', async (kind) => {
    vi.useFakeTimers()
    const { stage, daemon, host, sessionId, cleanup } = await opened(kind)
    try {
      await host.send(stage.conversationId, 'think', [], false, false, 'silent')
      const writes = daemon.written(sessionId).length
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(host.items(stage).find((item) => item.id === 'silent:silent')).toMatchObject({ level: 'warning' })
      expect(host.activity(stage.conversationId)).toBe('running')
      expect(daemon.written(sessionId)).toHaveLength(writes)
      expect(daemon.killed).toHaveLength(0)
    } finally { cleanup(); vi.useRealTimers() }
  })
})
