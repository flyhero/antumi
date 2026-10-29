import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

vi.mock('./gemini-cli', () => ({ requireGemini: async () => '/fake/gemini', geminiCatalog: async () => null, geminiSignedIn: async () => true, geminiHome: () => '/unused', geminiAuthType: async () => 'gemini-api-key', detectGemini: async () => null, geminiInstallation: () => null }))
const Frame = z.looseObject({ id: z.union([z.number(), z.string()]).optional(), method: z.string().optional(), params: z.unknown().optional() })
const modes = { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }, { id: 'autoEdit', name: 'Auto Edit' }, { id: 'plan', name: 'Plan' }, { id: 'yolo', name: 'YOLO' }] }
let root: string
let tasks: TaskStore
let store: ConversationStore
let projects: ProjectRegistry
let daemon: ReturnType<typeof fakeChatDaemon>
let service: ConversationService
let sessions: number
let failNext: boolean
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
function serve() {
  const next = new ConversationService(store, daemon, path.join(root, 'sessions'), () => {}, projects, new AttachmentStore(path.join(root, 'attachments')), (id) => ({ command: 'node', args: ['mcp', '--conversation', id] }))
  daemon.deliver = (event) => {
    if (event.event === 'data') next.handleData(event)
    else if (event.event === 'exit') next.handleExit(event.sessionId, event.exitCode)
    else next.handleStderr(event.sessionId, event.data)
  }
  return next
}
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'antumi-gemini-conversation-'))
  const database = path.join(root, 'antumi.db')
  tasks = new TaskStore(database); store = new ConversationStore(database); projects = new ProjectRegistry(database)
  mkdirSync(path.join(root, 'attachments'))
  daemon = fakeChatDaemon(); sessions = 0; failNext = false
  service = serve()
  const request = daemon.request
  daemon.request = async (method, params) => {
    const result = await request(method, params)
    if (method !== 'write') return result
    const write = z.object({ sessionId: z.string(), data: z.string() }).parse(params)
    for (const line of write.data.split('\n').filter(Boolean)) {
      const frame = Frame.parse(JSON.parse(line))
      const reply = (body: unknown) => queueMicrotask(() => daemon.emit(write.sessionId, { id: frame.id, result: body }))
      if (frame.method === 'initialize') reply({ protocolVersion: 1, agentCapabilities: { loadSession: true } })
      else if (frame.method === 'session/new') {
        const mcp = z.object({ mcpServers: z.array(z.object({ args: z.array(z.string()) })) }).parse(frame.params).mcpServers[0]!
        await writePrivateJson(mcp.args[mcp.args.indexOf('--ready-file') + 1]!, { ready: true })
        reply({ sessionId: `gemini-session-${++sessions}`, modes })
      } else if (frame.method === 'session/set_mode') reply({})
      else if (frame.method === 'session/prompt') {
        const prompt = z.object({ sessionId: z.string(), prompt: z.array(z.object({ text: z.string() })) }).parse(frame.params)
        if (failNext) { failNext = false; queueMicrotask(() => daemon.emit(write.sessionId, { id: frame.id, error: { code: 500, message: 'fixture failure' } })); continue }
        queueMicrotask(() => {
          daemon.emit(write.sessionId, { method: 'session/update', params: { sessionId: prompt.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Gemini response' } } } })
          daemon.emit(write.sessionId, { id: frame.id, result: { stopReason: 'end_turn' } })
        })
      }
    }
    return result
  }
})
afterEach(() => { projects.close(); store.close(); tasks.close(); rmSync(root, { recursive: true, force: true }) })
const opening = (sessionId: string) => daemon.written(sessionId).map((frame) => Frame.parse(frame)).filter((frame) => ['session/new', 'session/load', 'session/fork'].includes(frame.method ?? ''))
const prompts = (sessionId: string) => daemon.written(sessionId).map((frame) => Frame.parse(frame)).filter((frame) => frame.method === 'session/prompt')
function handoff(sessionId: string) {
  const text = JSON.stringify(prompts(sessionId))
  return readFileSync(/移交文件 (\S+?)，/.exec(text)?.[1] ?? '', 'utf8')
}

it('keeps the live Gemini session for consecutive turns, and hands history to a new native session after stop', async () => {
  const created = await service.create('gemini', [root])
  await service.send(created.id, 'First question'); await settle()
  await service.send(created.id, 'Second question'); await settle()
  expect(daemon.spawns).toHaveLength(1)
  await service.stop(created.id)
  await service.continue(created.id); await settle()
  expect(opening('pipe-2').map((frame) => frame.method)).toEqual(['session/new'])
  expect(handoff('pipe-2')).toContain('First question')
  expect(handoff('pipe-2')).toContain('Second question')
  expect(service.stages(created.id).at(-1)?.providerSessionId).toBe('gemini-session-2')
})

it('uses a history handoff after a process exit and core restart', async () => {
  const created = await service.create('gemini', [root])
  await service.send(created.id, 'Keep this context'); await settle()
  daemon.exit(created.sessionId!, 1)
  service = serve()
  await service.continue(created.id); await settle()
  expect(opening('pipe-2').map((frame) => frame.method)).toEqual(['session/new'])
  expect(handoff('pipe-2')).toContain('Keep this context')
})

it('forks from a turn through a fresh session and carries only history up to the selected turn', async () => {
  const created = await service.create('gemini', [root])
  await service.send(created.id, 'Keep first'); await settle()
  const first = service.chatPage(created.id).items.find((item) => item.kind === 'turn')!
  await service.send(created.id, 'Later question'); await settle()
  await service.fork(created.id, first.stageId, first.id); await settle()
  expect(opening('pipe-2').map((frame) => frame.method)).toEqual(['session/new'])
  expect(handoff('pipe-2')).toContain('Keep first')
  expect(handoff('pipe-2')).not.toContain('Later question')
})

it('keeps a failed turn visible and sends a manually retried prompt once after restarting', async () => {
  const created = await service.create('gemini', [root])
  await service.send(created.id, 'Previous context'); await settle()
  failNext = true
  await service.send(created.id, 'Retry this once'); await settle()
  expect(service.chatPage(created.id).items.findLast((item) => item.kind === 'turn')).toMatchObject({ state: 'failed', error: 'fixture failure' })
  await service.stop(created.id)
  await service.continue(created.id); await settle()
  await service.send(created.id, 'Retry this once'); await settle()
  expect(opening('pipe-2').map((frame) => frame.method)).toEqual(['session/new'])
  expect(handoff('pipe-2')).toContain('Previous context')
  expect(JSON.stringify(prompts('pipe-2')).match(/Retry this once/g)).toHaveLength(1)
})
