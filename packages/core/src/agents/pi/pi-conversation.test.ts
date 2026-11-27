import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { writePrivateJson } from '@antumi/protocol/node'
import { AttachmentStore } from '../../attachment-store'
import { ConversationService } from '../../conversation-service'
import { ConversationStore } from '../../conversation-store'
import { fakeChatDaemon } from '../../fake-chat-agent'
import { ProjectRegistry } from '../../project-registry'
import { TaskStore } from '../../task-store'
import { PI_CONFIG_ENV, PI_EXTENSION_SOURCE } from './pi-extension'

vi.mock('./pi-cli', async (original) => ({ ...await original<object>(), requirePi: vi.fn(async () => '/fake/pi'), piCatalog: vi.fn(async () => null) }))
const Frame = z.looseObject({ id: z.string().optional(), type: z.string(), message: z.string().optional() })
const Spawn = z.object({ command: z.string(), args: z.array(z.string()), env: z.record(z.string(), z.string()) })
const MODEL = { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'anthropic', reasoning: true, input: ['text', 'image'], contextWindow: 200000 }
let root: string
let tasks: TaskStore
let store: ConversationStore
let projects: ProjectRegistry
let service: ConversationService
let daemon: ReturnType<typeof fakeChatDaemon>
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'antumi-pi-conversation-'))
  vi.stubEnv('PI_CODING_AGENT_DIR', path.join(root, 'pi-account'))
  const database = path.join(root, 'antumi.db')
  tasks = new TaskStore(database); store = new ConversationStore(database); projects = new ProjectRegistry(database)
  mkdirSync(path.join(root, 'attachments'))
  daemon = fakeChatDaemon()
  service = new ConversationService(store, daemon, path.join(root, 'sessions'), () => {}, projects, new AttachmentStore(path.join(root, 'attachments')), (id) => ({ command: 'node', args: ['mcp', '--conversation', id] }))
  daemon.deliver = (event) => {
    if (event.event === 'data') service.handleData(event)
    else if (event.event === 'exit') service.handleExit(event.sessionId, event.exitCode)
    else service.handleStderr(event.sessionId, event.data)
  }
  const request = daemon.request
  daemon.request = async (method, params) => {
    const result = await request(method, params)
    // Pi registers Antumi's MCP server from the extension's config, which reports once listed.
    if (method === 'spawnPipe' || method === 'spawnPipeClean') {
      const config = z.object({ servers: z.object({ antumi: z.object({ args: z.array(z.string()) }) }) }).parse(JSON.parse(Spawn.parse(params).env[PI_CONFIG_ENV] ?? '{}'))
      const args = config.servers.antumi.args
      if (!args.includes('--ready-file')) throw new Error('missing MCP ready file')
      await writePrivateJson(args[args.indexOf('--ready-file') + 1]!, { ready: true })
    }
    if (method !== 'write') return result
    const write = z.object({ sessionId: z.string(), data: z.string() }).parse(params)
    const spawned = Spawn.parse(daemon.spawns[Number(write.sessionId.replace('pipe-', '')) - 1])
    // Its session file: the one resumed, or a new one for each process.
    const at = spawned.args.indexOf('--session')
    const sessionFile = at >= 0 ? spawned.args[at + 1] : `/home/user/.pi/agent/sessions/--work--/${write.sessionId}.jsonl`
    for (const line of write.data.split('\n').filter(Boolean)) {
      const frame = Frame.parse(JSON.parse(line))
      const emit = (body: unknown) => daemon.emit(write.sessionId, body)
      const respond = (data?: unknown) => queueMicrotask(() => emit({ id: frame.id, type: 'response', command: frame.type, success: true, ...(data === undefined ? {} : { data }) }))
      if (frame.type === 'get_state') respond({ model: MODEL, thinkingLevel: 'medium', sessionFile, sessionId: write.sessionId })
      else if (frame.type === 'get_available_models') respond({ models: [MODEL] })
      else if (frame.type === 'get_commands') respond({ commands: [] })
      else if (frame.type === 'prompt') {
        queueMicrotask(() => {
          emit({ id: frame.id, type: 'response', command: 'prompt', success: true, data: { disposition: 'started' } })
          emit({ type: 'message_end', message: { role: 'user', content: [{ type: 'text', text: frame.message }] } })
          emit({ type: 'message_start', message: { role: 'assistant', content: [] } })
          emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: `echo: ${frame.message}` }], provider: 'anthropic', model: MODEL.id, stopReason: 'stop', usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { total: 0.001 } } } })
          emit({ type: 'agent_end', messages: [] })
          emit({ type: 'agent_settled' })
        })
      }
    }
    return result
  }
})

afterEach(() => { vi.unstubAllEnvs(); projects.close(); store.close(); tasks.close(); rmSync(root, { recursive: true, force: true }) })

const spawn = (index: number) => Spawn.parse(daemon.spawns[index])
const turns = (id: string) => service.chatPage(id).items.filter((item) => item.kind === 'turn')

async function twoTurns(): Promise<string> {
  const created = await service.create('pi', [])
  await service.send(created.id, 'first'); await settle()
  await service.send(created.id, 'second'); await settle()
  expect(turns(created.id)).toHaveLength(2)
  return created.id
}

it('starts Pi in RPC mode with Antumi extension, written for this start, and its MCP server reporting once listed', async () => {
  const created = await service.create('pi', [])
  const { command, args, env } = spawn(0)
  expect(command).toBe('/fake/pi')
  expect(args.slice(0, 2)).toEqual(['--mode', 'rpc'])
  const extension = args[args.indexOf('--extension') + 1]!
  expect(existsSync(extension) && readFileSync(extension, 'utf8')).toBe(PI_EXTENSION_SOURCE)
  expect(JSON.parse(env[PI_CONFIG_ENV] ?? '{}')).toMatchObject({ mode: 'ask', servers: { antumi: { command: 'node', args: expect.arrayContaining(['--ready-on-list']) } } })
  await service.send(created.id, 'hello'); await settle()
  expect(service.chatPage(created.id).items.filter((item) => item.kind === 'assistant').map((item) => item.kind === 'assistant' && item.text)).toEqual(['echo: hello'])
})

it('starts a platform conversation with scoped project tools, a clean environment and MCP readiness intact', async () => {
  service.setChannelTools({ mcp: (id) => ({ command: 'node', args: ['mcp', '--conversation', id, '--tool-set', 'channel'] }), tools: () => ['project_list', 'project_read'] })
  const created = await service.create('pi', [], undefined, { channel: { channelId: '22222222-2222-4222-8222-222222222222', platform: 'slack', asker: 'U1', place: 'C1' } })
  const { args, env } = spawn(0)
  expect(daemon.clean.has(0)).toBe(true)
  expect(args).toEqual(expect.arrayContaining(['--no-builtin-tools', '--no-extensions', '--system-prompt']))
  expect(env.PI_CODING_AGENT_DIR).toContain(path.join('launch', service.stages(created.id)[0]!.id))
  expect(JSON.parse(env[PI_CONFIG_ENV] ?? '{}')).toMatchObject({ lockdown: true, mode: 'readOnly', readTools: ['mcp__antumi__project_list', 'mcp__antumi__project_read'], servers: { antumi: { args: expect.arrayContaining(['--tool-set', 'channel', '--ready-on-list']) } } })
  expect(service.list()).toEqual([])
  await service.send(created.id, 'hello', [], false, false, 'question')
  await settle()
  expect(service.replyOf(created.id, 'question')).toContain('hello')
})

it('forks its session whole from the latest turn', async () => {
  const source = await twoTurns()
  const last = turns(source).at(-1)!
  await service.fork(source, last.stageId, last.id)
  await settle()
  expect(spawn(1).args).toEqual(expect.arrayContaining(['--fork', '/home/user/.pi/agent/sessions/--work--/pipe-1.jsonl']))
})

it('starts a fork from an earlier turn afresh, with the chat up to it as a handoff', async () => {
  const source = await twoTurns()
  const first = turns(source)[0]!
  await service.fork(source, first.stageId, first.id)
  await settle()
  expect(spawn(1).args).not.toContain('--fork')
  expect(spawn(1).args).not.toContain('--session')
})
