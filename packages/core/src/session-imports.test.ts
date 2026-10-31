import { mkdirSync, mkdtempSync, realpathSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Transcript, TranscriptSummary } from './agent-transcripts'
import { AttachmentStore } from './attachment-store'
import { ConversationService, type ConversationEvent } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { ProjectRegistry } from './project-registry'
import { SessionImports } from './session-imports'
import { TaskStore } from './task-store'

const SESSION = '0b6c1f9e-6a7d-4d0e-9f43-2a51c3e1b001'

// A turn of the session as its transcript gives it: the prompt, the reply, the turn closing.
function turn(ref: string, at: number, prompt: string, reply: string): Transcript {
  return {
    entries: [
      { at, item: { id: `u:${ref}`, kind: 'user', text: prompt, images: [] } },
      { at: at + 1, item: { id: `c:${ref}:0`, kind: 'assistant', text: reply, streaming: false } },
      { at: at + 1, item: { id: `turn:${ref}`, kind: 'turn', state: 'completed', error: null, durationMs: 1, usage: null, providerRef: `${ref}-reply` } }
    ],
    messages: [{ at, role: 'user', text: prompt, ref }, { at: at + 1, role: 'assistant', text: reply, ref }]
  }
}
const joined = (...parts: Transcript[]): Transcript => ({ entries: parts.flatMap((part) => part.entries), messages: parts.flatMap((part) => part.messages) })

describe('SessionImports', () => {
  let root: string
  let project: string
  let tasks: TaskStore
  let store: ConversationStore
  let projects: ProjectRegistry
  let daemon: ReturnType<typeof fakeChatDaemon>
  let service: ConversationService
  let events: ConversationEvent[]
  let summaries: TranscriptSummary[]
  let transcripts: Map<string, Transcript>
  let imports: SessionImports

  const summary = (sessionId: string, extra: Partial<TranscriptSummary> = {}): TranscriptSummary =>
    ({ sessionId, cwd: project, title: 'Fix the build', named: false, firstPrompt: 'Fix the build', startedAt: 1, modifiedAt: 1_000, file: sessionId, ...extra })

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-session-imports-'))
    project = path.join(root, 'app')
    mkdirSync(project)
    mkdirSync(path.join(root, 'attachments'))
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    store = new ConversationStore(database)
    projects = new ProjectRegistry(database)
    daemon = fakeChatDaemon()
    events = []
    service = new ConversationService(store, daemon, path.join(root, 'sessions'), (event) => events.push(event), projects, new AttachmentStore(path.join(root, 'attachments')))
    daemon.deliver = (event) => {
      if (event.event === 'data') service.handleData(event)
      else if (event.event === 'exit') service.handleExit(event.sessionId, event.exitCode)
      else service.handleStderr(event.sessionId, event.data)
    }
    summaries = [summary(SESSION)]
    transcripts = new Map([[SESSION, turn('u1', 100, 'Fix the build', 'Fixed.')]])
    const origin = { agent: 'claude' as const, transcripts: { scan: async () => summaries, read: async (file: string) => transcripts.get(file)! } }
    imports = new SessionImports(store, service, path.join(root, 'home'), [origin], [])
    service.setImportHooks({ before: (id, agent, nativeId) => imports.beforeResume(id, agent, nativeId), after: (id) => imports.afterResume(id) })
  })

  afterEach(() => {
    projects.close()
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('imports a session as a conversation that resumes it in its own folder', async () => {
    expect(await imports.list()).toEqual([expect.objectContaining({ agent: 'claude', sessionId: SESSION, status: 'new', conversationId: null, problem: null })])
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    expect(imported).toMatchObject({ agent: 'claude', title: 'Fix the build', titleLocked: false, workspacePath: realpathSync(project), sessionId: null })
    const [stage] = service.stages(imported!.id)
    expect(stage).toMatchObject({ providerSessionId: SESSION, endedAt: expect.any(Number) })
    expect(service.stageChatItems(imported!.id, stage!.id).filter((item) => item.kind !== 'state').map((item) => [item.kind, item.id])).toEqual([['user', 'u:u1'], ['assistant', 'c:u1:0'], ['turn', 'turn:u1']])
    expect(service.messages(imported!.id).map(({ role, text }) => [role, text])).toEqual([['user', 'Fix the build'], ['assistant', 'Fixed.']])
    expect(await imports.list()).toEqual([expect.objectContaining({ status: 'imported', conversationId: imported!.id })])

    await service.continue(imported!.id)
    expect(daemon.spawns.at(-1)).toMatchObject({ command: 'claude', cwd: realpathSync(project) })
    expect(daemon.spawns.at(-1)?.args).toEqual(expect.arrayContaining(['--resume', SESSION]))
  })

  it('brings in what the terminal added since, not what ran here', async () => {
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    await service.continue(imported!.id)
    const ran = service.stages(imported!.id).at(-1)!
    await service.stop(imported!.id)
    const later = Date.now() + 60_000
    transcripts.set(SESSION, joined(turn('u1', 100, 'Fix the build', 'Fixed.'), turn('here', ran.startedAt, 'Asked in Antumi', 'Answered here'), turn('u2', later, 'Asked in the terminal', 'Answered there')))
    summaries = [summary(SESSION, { modifiedAt: later + 1 })]
    expect(await imports.list()).toEqual([expect.objectContaining({ status: 'updated', conversationId: imported!.id })])

    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    const stages = service.stages(imported!.id)
    expect(stages).toHaveLength(3)
    expect(stages.at(-1)).toMatchObject({ providerSessionId: SESSION })
    expect(service.stageChatItems(imported!.id, stages.at(-1)!.id).flatMap((item) => (item.kind === 'user' ? [item.text] : []))).toEqual(['Asked in the terminal'])
    expect(await imports.list()).toEqual([expect.objectContaining({ status: 'imported' })])
    // Nothing new: importing again changes nothing.
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    expect(service.stages(imported!.id)).toHaveLength(3)
  })

  it("leaves out Antumi's own sessions and those in its folders", async () => {
    const own = await service.create('claude', [project])
    const ownSession = service.stages(own.id)[0]!.providerSessionId!
    const home = path.join(root, 'home', 'worktrees', 'x')
    mkdirSync(home, { recursive: true })
    summaries = [summary(SESSION), summary(ownSession), summary('1e0c0b45-2a0b-4c8e-8a39-6c2a0d4f9d10', { cwd: home })]
    expect((await imports.list()).map((session) => session.sessionId)).toEqual([SESSION])
  })

  it('refuses a session whose folder is gone, or one it does not list', async () => {
    summaries = [summary(SESSION, { cwd: path.join(root, 'gone') })]
    expect(await imports.list()).toEqual([expect.objectContaining({ problem: 'missing-cwd' })])
    await expect(imports.import([{ agent: 'claude', sessionId: SESSION }])).rejects.toMatchObject({ reason: 'invalid-workspace' })
    await expect(imports.import([{ agent: 'claude', sessionId: '../../etc/passwd' }])).rejects.toMatchObject({ reason: 'invalid-params' })
    await expect(imports.import([{ agent: 'codex', sessionId: SESSION }])).rejects.toMatchObject({ reason: 'session-not-found' })
  })

  it('accepts opaque scanned ids and separates a desktop import from native resume', async () => {
    const external = `desktop:${SESSION}`
    summaries = [summary(external, { nativeSessionId: null, source: 'desktop' })]
    transcripts.set(external, turn('desktop-user', 100, 'Continue the desktop work', 'Prior answer'))
    const [imported] = await imports.import([{ agent: 'claude', sessionId: external }])
    expect(service.stages(imported!.id)[0]?.providerSessionId).toBeNull()
    expect((await imports.list())[0]).toMatchObject({ continuation: 'handoff', source: 'desktop' })
    await service.continue(imported!.id)
    expect(daemon.spawns.at(-1)?.args).not.toContain('--resume')
    const handoffs = path.join(root, 'sessions', imported!.id, 'handoffs')
    expect(readFileSync(path.join(handoffs, readdirSync(handoffs)[0]!), 'utf8')).toContain('Continue the desktop work')
  })

  it('adds messages with identical timestamps once, including after a restart', async () => {
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    transcripts.set(SESSION, joined(turn('u1', 100, 'Fix the build', 'Fixed.'), turn('u2', 100, 'Same timestamp', 'Later reply')))
    summaries[0]!.modifiedAt = 2000
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    imports = new SessionImports(store, service, path.join(root, 'home'), [{ agent: 'claude', transcripts: { scan: async () => summaries, read: async () => transcripts.get(SESSION)! } }], [])
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    expect(service.messages(imported!.id).map((message) => message.text)).toEqual(['Fix the build', 'Fixed.', 'Same timestamp', 'Later reply'])
    expect(service.stages(imported!.id)).toHaveLength(2)
  })

  it('updates a partial reply and tool result in their original stage without duplicates', async () => {
    const partial = turn('u1', 100, 'Fix the build', 'Draft')
    partial.entries.splice(1, 0, { at: 100, item: { id: 'tool:read', kind: 'tool', name: 'Read', title: 'app.ts', input: null, output: null, status: 'interrupted', diffs: [] } })
    transcripts.set(SESSION, partial)
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    const stage = service.stages(imported!.id)[0]!
    service.stageChatItems(imported!.id, stage.id)
    const complete = turn('u1', 100, 'Fix the build', 'Final reply')
    complete.entries.splice(1, 0, { at: 100, item: { id: 'tool:read', kind: 'tool', name: 'Read', title: 'app.ts', input: null, output: 'file contents', status: 'done', diffs: [] } })
    transcripts.set(SESSION, complete)
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    expect(service.stages(imported!.id)).toHaveLength(1)
    expect(service.messages(imported!.id).map((message) => message.text)).toEqual(['Fix the build', 'Final reply'])
    const items = service.stageChatItems(imported!.id, stage.id)
    expect(items.find((item) => item.kind === 'tool')).toMatchObject({ status: 'done', output: 'file contents', revision: 2 })
    expect(items.filter((item) => item.kind === 'assistant')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'importedItems').at(-1)?.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'assistant', text: 'Final reply', revision: 2 })]))
    expect(events.some((event) => event.type === 'chatItems')).toBe(false)
  })

  it('excludes native-resume writes even when the provider has no per-turn clock', async () => {
    summaries[0]!.clockless = true
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    await service.continue(imported!.id)
    transcripts.set(SESSION, joined(turn('u1', 100, 'Fix the build', 'Fixed.'), turn('native', 100, 'Asked here', 'Answered here')))
    summaries[0]!.modifiedAt = 2000
    await service.stop(imported!.id)
    await imports.list()
    transcripts.set(SESSION, joined(transcripts.get(SESSION)!, turn('terminal', 100, 'Asked outside', 'Answered outside')))
    summaries[0]!.modifiedAt = 3000
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    expect(service.messages(imported!.id).map((message) => message.text)).toEqual(['Fix the build', 'Fixed.', 'Asked outside', 'Answered outside'])
  })

  it('rejects importing into a running conversation and reports independent scan failures', async () => {
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    await service.continue(imported!.id)
    await expect(imports.import([{ agent: 'claude', sessionId: SESSION }])).rejects.toMatchObject({ reason: 'conversation-running' })
    const broken = new SessionImports(store, service, path.join(root, 'home'), [
      { agent: 'claude', transcripts: { scan: async () => summaries, read: async () => transcripts.get(SESSION)! } },
      { agent: 'cursor', transcripts: { scan: async () => { throw new Error('locked') }, read: async () => ({ entries: [], messages: [] }) } }
    ], [])
    expect(await broken.list()).toHaveLength(1)
    expect(broken.diagnostics()).toEqual([expect.objectContaining({ agent: 'cursor' })])
  })


  it('seeds pre-upgrade imports from saved stages without duplicating history', async () => {
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    const legacy = new DatabaseSync(path.join(root, 'antumi.db'))
    legacy.exec('DELETE FROM session_import_items')
    legacy.close()
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    expect(service.stages(imported!.id)).toHaveLength(1)
    expect(service.messages(imported!.id).map((message) => message.text)).toEqual(['Fix the build', 'Fixed.'])
    expect(store.importedItems('claude', SESSION).length).toBeGreaterThan(0)
  })


  it('deduplicates aliases of the same source session before presenting selection', async () => {
    summaries.push(summary(SESSION, { title: 'Newer copy', modifiedAt: 2000 }))
    expect(await imports.list()).toEqual([expect.objectContaining({ title: 'Newer copy' })])
  })


  it('inserts a newly completed reply before its existing turn marker, also after replay', async () => {
    const initial = turn('u1', 100, 'Fix the build', '')
    initial.entries = initial.entries.filter((entry) => entry.item.kind !== 'assistant')
    initial.messages = initial.messages.filter((message) => message.role === 'user')
    transcripts.set(SESSION, initial)
    const [imported] = await imports.import([{ agent: 'claude', sessionId: SESSION }])
    const stage = service.stages(imported!.id)[0]!
    transcripts.set(SESSION, turn('u1', 100, 'Fix the build', 'The completed reply'))
    await imports.import([{ agent: 'claude', sessionId: SESSION }])
    const read = () => service.stageChatItems(imported!.id, stage.id).filter((item) => item.kind !== 'state').map((item) => item.kind)
    expect(read()).toEqual(['user', 'assistant', 'turn'])
    expect(read()).toEqual(['user', 'assistant', 'turn'])
    expect(service.stages(imported!.id)).toHaveLength(1)
    expect(events.filter((event) => event.type === 'importedItems').at(-1)).toMatchObject({ replaceStage: stage.id })
  })

})
