import { spawn as spawnProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ModelProviderInput } from '@antumi/protocol'
import { AttachmentStore } from '../../attachment-store'
import { ConversationService } from '../../conversation-service'
import { ConversationStore } from '../../conversation-store'
import { CredentialStore } from '../../credential-store'
import { fakeChatDaemon } from '../../fake-chat-agent'
import { ModelProviderStore } from '../../model-providers'
import { ProjectRegistry } from '../../project-registry'
import { Rejection } from '../../rejection'
import { TaskStore } from '../../task-store'

const KEY = 'sk-zcode-provider-secret-42'
const Frame = z.looseObject({ id: z.string().optional(), method: z.string().optional(), params: z.looseObject({ type: z.string().optional(), commandId: z.string().optional(), payload: z.looseObject({}).optional() }).optional() })
const Spawn = z.object({ command: z.string(), args: z.array(z.string()), env: z.record(z.string(), z.string()) })
let root: string
let sessions: string
let store: ConversationStore
let tasks: TaskStore
let projects: ProjectRegistry
let service: ConversationService
let providers: ModelProviderStore
let daemon: ReturnType<typeof fakeChatDaemon>
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)) }

const glm = (): ModelProviderInput => ({
  id: null, name: 'GLM', preset: 'custom', agents: ['zcode'], apiKey: KEY,
  anthropic: { baseUrl: 'http://127.0.0.1:4000/api/anthropic', auth: 'auth_token', env: {} }, openai: null,
  models: [{ id: 'glm-5.3', label: 'GLM-5.3', contextWindow: 1_000_000, maxOutput: null, efforts: [] }],
  defaultModel: 'glm-5.3', smallModel: 'glm-5.3'
})

// Answers as `zcode app-server` does, far enough for a stage to open and take a turn.
const configs = new Map<string, Record<string, unknown>>()
function zcode(sessionId: string, text: string): void {
  const config = configs.get(sessionId) ?? { mode: 'build', planEnabled: false }
  configs.set(sessionId, config)
  for (const line of text.split('\n').filter(Boolean)) {
    const frame = Frame.parse(JSON.parse(line))
    const emit = (body: unknown) => queueMicrotask(() => daemon.emit(sessionId, body))
    const topic = (payload: unknown, toSeq: number) => emit({ method: 'v4/conversation/frame', params: { kind: 'complete', topic: 'conversation/sess_z', logicalFrameId: `lf-${toSeq}`, frame: { topic: 'conversation/sess_z', fromSeq: toSeq - 1, toSeq, payload } } })
    if (frame.params?.type === 'createSession') {
      Object.assign(config, frame.params.payload?.config)
      emit({ id: frame.id, result: { status: 'accepted', result: { type: 'createSession', sessionId: 'sess_z' } } })
    } else if (frame.method === 'v4/conversation/subscribe') {
      emit({ id: frame.id, result: { ack: { subscriptionId: 's', mode: 'snapshot', logEpoch: 'e' } } })
      topic({ kind: 'snapshot', snapshot: { sessionId: 'sess_z', revision: 1, control: { phase: 'draft' }, config, rows: { window: [] } } }, 1)
    } else if (frame.method === 'session/read') {
      emit({ id: frame.id, result: { settings: { model: { available: [], current: null } }, slashCommands: [] } })
    } else if (frame.params?.type === 'sendText') {
      const source = frame.params.commandId
      emit({ id: frame.id, result: { status: 'accepted', result: { type: 'inputAccepted' } } })
      topic({ kind: 'deltas', deltas: [
        { op: 'row.appended', row: { rowId: 1, kind: 'turnHeader', state: 'running', origin: 'userInput', sourceCommandId: source, startedAt: 1 } },
        { op: 'row.appended', row: { rowId: 2, kind: 'userInput', text: 'hi', origin: 'realUser', sourceCommandId: source } },
        { op: 'row.appended', row: { rowId: 3, kind: 'assistantText', text: 'hello from GLM', state: 'complete' } },
        { op: 'row.upserted', row: { rowId: 1, kind: 'turnHeader', state: 'completedSuccess', origin: 'userInput', sourceCommandId: source, startedAt: 1, endedAt: 5 } }
      ] }, 2)
    }
  }
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'antumi-zcode-conversation-'))
  sessions = path.join(root, 'sessions')
  const database = path.join(root, 'antumi.db')
  tasks = new TaskStore(database); store = new ConversationStore(database); projects = new ProjectRegistry(database)
  mkdirSync(path.join(root, 'attachments'))
  daemon = fakeChatDaemon()
  service = new ConversationService(store, daemon, sessions, () => {}, projects, new AttachmentStore(path.join(root, 'attachments')), (id) => ({ command: 'node', args: ['mcp', '--conversation', id] }))
  daemon.deliver = (event) => {
    if (event.event === 'data') service.handleData(event)
    else if (event.event === 'exit') service.handleExit(event.sessionId, event.exitCode)
    else service.handleStderr(event.sessionId, event.data)
  }
  const request = daemon.request
  daemon.request = async (method, params) => {
    const result = await request(method, params)
    if (method === 'write') {
      const write = z.object({ sessionId: z.string(), data: z.string() }).parse(params)
      zcode(write.sessionId, write.data)
    }
    return result
  }
  const credentials = new CredentialStore(path.join(root, 'credentials.json'))
  await credentials.load()
  providers = new ModelProviderStore(path.join(root, 'model-providers.json'), credentials)
  await providers.load()
  service.setModelProviders(providers)
})

afterEach(() => { projects.close(); store.close(); tasks.close(); rmSync(root, { recursive: true, force: true }) })

const spawn = (index = -1) => Spawn.parse(daemon.spawns.at(index))
const launchOf = (conversationId: string, stageId: string) => path.join(sessions, conversationId, 'launch', stageId)

describe('ZCode on a model provider', () => {
  it.skipIf(process.platform === 'win32')('runs on a provider file of the stage own, gone once the process exits', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    const stage = store.activeStage(created.id)!
    const dir = launchOf(created.id, stage.id)
    const { args, env } = spawn()
    expect(args).toEqual(['app-server', '--stdio'])
    expect(env).toMatchObject({ ZCODE_DATA_BASE_DIR: dir, ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: path.join(dir, '.zcode', 'v2', 'provider_config.json'), ANTUMI_MODEL_PROVIDER: providerId })
    // The key is in the file alone: not on the command line, not in the environment.
    expect([...args, ...Object.values(env)].join(' ')).not.toContain(KEY)
    const file = env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE!
    expect(statSync(dir).mode & 0o777).toBe(0o700)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(file, 'utf8')).config.providerConfigRules.providerRules[0].config).toMatchObject({ access: { apiKey: KEY }, api: { type: 'anthropic-messages', baseUrl: 'http://127.0.0.1:4000/api/anthropic' } })
    expect(daemon.written(created.sessionId!)[0]).toMatchObject({ params: { payload: { config: { provider: `antumi-${providerId}`, model: 'glm-5.3' } } } })
    await service.send(created.id, 'hi')
    await settle()
    expect(service.chatPage(created.id).items.filter((item) => item.kind === 'assistant').map((item) => item.kind === 'assistant' && item.text)).toEqual(['hello from GLM'])
    await service.stop(created.id)
    // Removed as the exit comes in, without holding the stop up.
    for (let i = 0; i < 100 && existsSync(dir); i++) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(existsSync(dir)).toBe(false)
  })

  it('writes nothing for a stage on ZCode own models', async () => {
    const created = await service.create('zcode', [root])
    expect(spawn().env.ZCODE_DATA_BASE_DIR).toBeUndefined()
    expect(existsSync(path.join(sessions, created.id, 'launch'))).toBe(false)
  })

  it('removes what a start wrote when the daemon refused it, and keeps it when the answer was lost', async () => {
    const { id: providerId } = await providers.save(glm())
    const request = daemon.request
    let failWith: Rejection | null = new Rejection('spawn-failed', 'no such file')
    daemon.request = async (method, params) => {
      if (method === 'spawnPipe' && failWith) throw failWith
      return request(method, params)
    }
    const created = await service.create('zcode', [root], undefined, { deferStart: true, modelProvider: providerId })
    await expect(service.continue(created.id)).rejects.toThrow('no such file')
    expect(readLaunches(created.id)).toEqual([])
    failWith = new Rejection('daemon-unavailable', 'daemon disconnected')
    await expect(service.continue(created.id)).rejects.toThrow('daemon disconnected')
    expect(readLaunches(created.id)).toHaveLength(1)
    failWith = null
  })

  it('sweeps what no process names once the daemon is back, and keeps the rest', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    const live = launchOf(created.id, store.activeStage(created.id)!.id)
    const orphan = launchOf(created.id, 'stage-gone')
    const named = launchOf(created.id, 'stage-leaving')
    mkdirSync(orphan, { recursive: true })
    mkdirSync(named, { recursive: true })
    service.inspectLaunches = async (dirs) => new Set(dirs.filter((dir) => dir === named))
    await service.reconcile([{ sessionId: created.sessionId!, exited: false, exitCode: null, io: 'pipe', agent: 'zcode' }])
    expect([existsSync(live), existsSync(orphan), existsSync(named)]).toEqual([true, false, true])
    // Looked at again once the process that named it is gone.
    service.inspectLaunches = async () => new Set()
    await service.reconcile([{ sessionId: created.sessionId!, exited: false, exitCode: null, io: 'pipe', agent: 'zcode' }])
    expect([existsSync(live), existsSync(named)]).toEqual([true, false])
  })

  it('where no process can be seen (Windows), waits a grace per folder, and keeps one an unclaimed agent may hold', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    const ended = launchOf(created.id, store.activeStage(created.id)!.id)
    const orphan = launchOf(created.id, 'start-in-doubt')
    mkdirSync(orphan, { recursive: true })
    service.inspectLaunches = async () => null
    const unclaimed = { sessionId: 'pipe-unclaimed', exited: false, exitCode: null, io: 'pipe' as const }
    // The clock stands still for the grace; the daemon's list is from after every start here.
    const LISTED_LATER = Number.MAX_SAFE_INTEGER
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    try {
      // The daemon restarted: the stage's own session is gone from its list.
      await service.reconcile([unclaimed], LISTED_LATER)
      expect([existsSync(ended), existsSync(orphan)]).toEqual([true, true])
      clock.mockReturnValue(1_000_000 + 31_000)
      await service.reconcile([unclaimed], LISTED_LATER)
      // Past its grace; the one no stage owns stays while an agent nobody claims runs.
      expect([existsSync(ended), existsSync(orphan)]).toEqual([false, true])
      await service.reconcile([], LISTED_LATER)
      expect(existsSync(orphan)).toBe(true)
      clock.mockReturnValue(1_000_000 + 62_000)
      await service.reconcile([], LISTED_LATER)
      expect(existsSync(orphan)).toBe(false)
    } finally {
      clock.mockRestore()
    }
  })

  it('leaves a folder a process may still use when the conversation goes, until none does', async () => {
    const { id: providerId } = await providers.save(glm())
    const request = daemon.request
    daemon.request = async (method, params) => {
      if (method === 'spawnPipe') throw new Rejection('daemon-unavailable', 'daemon disconnected')
      return request(method, params)
    }
    const created = await service.create('zcode', [root], undefined, { deferStart: true, modelProvider: providerId })
    await expect(service.continue(created.id)).rejects.toThrow('daemon disconnected')
    daemon.request = request
    // The daemon started it after all: the process names the folder.
    service.inspectLaunches = async (dirs) => new Set(dirs)
    await service.delete(created.id)
    expect(readLaunches(created.id)).toHaveLength(1)
    service.inspectLaunches = async () => new Set()
    await service.reconcile([])
    expect(readLaunches(created.id)).toEqual([])
  })

  it('keeps the folder of a start under way however the sweep runs meanwhile', async () => {
    const { id: providerId } = await providers.save(glm())
    const request = daemon.request
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    daemon.request = async (method, params) => {
      if (method === 'spawnPipe') await held
      return request(method, params)
    }
    const created = await service.create('zcode', [root], undefined, { deferStart: true, modelProvider: providerId })
    const starting = service.continue(created.id)
    for (let i = 0; i < 50 && !readLaunches(created.id).length; i++) await settle()
    expect(readLaunches(created.id)).toHaveLength(1)
    await service.reconcile([])
    expect(readLaunches(created.id)).toHaveLength(1)
    release()
    await starting
    expect(readLaunches(created.id)).toHaveLength(1)
  })

  it('goes once the daemon says its process exited while core was away', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    expect(readLaunches(created.id)).toHaveLength(1)
    await service.reconcile([{ sessionId: created.sessionId!, exited: true, exitCode: 0, io: 'pipe', agent: 'zcode' }])
    expect(readLaunches(created.id)).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('keeps one a restarted daemon no longer knows while a process still names it', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    const dir = launchOf(created.id, store.activeStage(created.id)!.id)
    // The old process, still leaving: started with the folder in its environment.
    const leaving = spawnProcess(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { env: { ...process.env, ZCODE_DATA_BASE_DIR: dir }, stdio: 'ignore' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    try {
      await service.reconcile([])
      expect(existsSync(dir)).toBe(true)
      // Nor does deleting the conversation take it from under the process.
      await service.delete(created.id)
      expect(existsSync(dir)).toBe(true)
    } finally {
      leaving.kill()
    }
    await new Promise((resolve) => leaving.once('exit', resolve))
    await service.reconcile([])
    expect(existsSync(dir)).toBe(false)
  })

  it('leaves alone a stage started after the daemon listed its sessions', async () => {
    const listedAt = Date.now() - 1000
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    await service.reconcile([], listedAt)
    expect(store.get(created.id)?.sessionId).toBe(created.sessionId)
    expect(readLaunches(created.id)).toHaveLength(1)
  })

  it('stops a process whose start failed after it was spawned, its folder kept until it exits', async () => {
    const { id: providerId } = await providers.save(glm())
    // Raw data is recorded once the process runs, and the disk is full by then.
    Reflect.set(service, 'wire', { record: (_conversation: string, _stage: string, inputs: Array<{ text: string }>) => { if (inputs[0]?.text.includes('process-spawned')) throw new Error('ENOSPC') } })
    await expect(service.create('zcode', [root], undefined, { modelProvider: providerId })).rejects.toThrow('ENOSPC')
    expect(daemon.killed).toEqual([{ sessionId: 'pipe-1', force: true }])
    const conversationId = store.list()[0]!.id
    expect(readLaunches(conversationId)).toHaveLength(1)
    service.handleExit('pipe-1', 0)
    await expect.poll(() => readLaunches(conversationId)).toEqual([])
  })

  it('stops, once the daemon is back, an agent no conversation holds, however core lost track of it', async () => {
    const { id: providerId } = await providers.save(glm())
    vi.spyOn(Reflect.get(service, 'chats'), 'open').mockRejectedValue(new Rejection('daemon-unavailable', 'daemon disconnected'))
    const request = daemon.request
    daemon.request = async (method, params) => {
      if (method === 'kill') throw new Rejection('daemon-unavailable', 'daemon disconnected')
      return request(method, params)
    }
    await expect(service.create('zcode', [root], undefined, { modelProvider: providerId })).rejects.toThrow('daemon disconnected')
    daemon.request = request
    const conversationId = store.list()[0]!.id
    const owner = `conversation:${conversationId}`
    service.inspectLaunches = async () => new Set()
    // A core started afresh knows the process by the owner the daemon reports, nothing else.
    const fresh = new ConversationService(store, daemon, sessions, () => {}, projects, new AttachmentStore(path.join(root, 'attachments')))
    fresh.inspectLaunches = async () => new Set()
    await fresh.reconcile([{ sessionId: 'pipe-1', exited: false, exitCode: null, io: 'pipe', agent: 'zcode', owner }])
    expect(daemon.killed).toEqual([{ sessionId: 'pipe-1', force: true }])
    // Not one a conversation holds, nor one whose start is still under way, nor another's.
    daemon.killed.length = 0
    vi.restoreAllMocks()
    const running = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    Reflect.get(service, 'launching').set(conversationId, 'zcode')
    await service.reconcile([
      { sessionId: running.sessionId!, exited: false, exitCode: null, io: 'pipe', agent: 'zcode', owner: `conversation:${running.id}` },
      { sessionId: 'pipe-starting', exited: false, exitCode: null, io: 'pipe', agent: 'zcode', owner },
      { sessionId: 'pipe-terminal', exited: false, exitCode: null, io: 'pipe', owner: `terminal:${conversationId}` }
    ])
    expect(daemon.killed).toEqual([])
  })

  it('stops a process whose stage could not be recorded', async () => {
    const { id: providerId } = await providers.save(glm())
    vi.spyOn(store, 'attachStage').mockImplementation(() => { throw new Error('SQLITE_FULL') })
    await expect(service.create('zcode', [root], undefined, { modelProvider: providerId })).rejects.toThrow('SQLITE_FULL')
    expect(daemon.killed).toEqual([{ sessionId: 'pipe-1', force: true }])
  })

  it('starts nothing on a conversation being deleted', async () => {
    const created = await service.create('zcode', [root], undefined, { deferStart: true })
    Reflect.get(service, 'retiring').add(created.id)
    await expect(service.continue(created.id)).rejects.toThrow()
    expect(daemon.spawns).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('tries again the folder of an exited process that would not go', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    const dir = launchOf(created.id, store.activeStage(created.id)!.id)
    service.inspectLaunches = async () => new Set()
    chmodSync(path.dirname(dir), 0o500)
    try {
      service.handleExit(created.sessionId!, 0)
      for (let i = 0; i < 100 && !Reflect.get(service, 'doubtTimer'); i++) await new Promise((resolve) => setTimeout(resolve, 10))
      expect(existsSync(dir)).toBe(true)
      expect(Reflect.get(service, 'doubtTimer')).not.toBeNull()
    } finally {
      chmodSync(path.dirname(dir), 0o700)
      clearTimeout(Reflect.get(service, 'doubtTimer'))
    }
  })

  it('leaves alone a stage begun before the daemon listed its sessions but spawned after', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    const listedAt = Date.now() + 500
    Reflect.get(service, 'launches').get(created.sessionId).at = listedAt + 500
    await service.reconcile([], listedAt)
    expect(store.activeStage(created.id)?.endedAt).toBeNull()
    expect(store.get(created.id)?.sessionId).toBe(created.sessionId)
    expect(readLaunches(created.id)).toHaveLength(1)
  })

  it('removes the folder of a process the daemon says exited, however reopening its chat fails', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    vi.spyOn(Reflect.get(service, 'chats'), 'open').mockRejectedValue(new Error('ENOSPC'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Reflect.get(service, 'launches').clear()
    await service.reconcile([{ sessionId: created.sessionId!, exited: true, exitCode: 0, io: 'pipe', agent: 'zcode' }])
    expect(readLaunches(created.id)).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('tries again a folder that would not go, and the rest with it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const stuck = launchOf('c-gone', 's-gone')
    mkdirSync(stuck, { recursive: true })
    service.inspectLaunches = async () => new Set()
    chmodSync(path.dirname(stuck), 0o500)
    try {
      await service.reconcile([])
      expect(existsSync(stuck)).toBe(true)
      // Looked at again later, not given up on.
      expect(Reflect.get(service, 'doubtTimer')).not.toBeNull()
    } finally {
      chmodSync(path.dirname(stuck), 0o700)
    }
    await service.reconcile([])
    expect(existsSync(stuck)).toBe(false)
    expect(Reflect.get(service, 'doubtTimer')).toBeNull()
  })

  it('takes the launch folder with the conversation', async () => {
    const { id: providerId } = await providers.save(glm())
    const created = await service.create('zcode', [root], undefined, { modelProvider: providerId })
    await service.delete(created.id)
    await settle()
    expect(existsSync(path.join(sessions, created.id))).toBe(false)
  })
})

function readLaunches(conversationId: string): string[] {
  const dir = path.join(sessions, conversationId, 'launch')
  return existsSync(dir) ? readdirSync(dir) : []
}
