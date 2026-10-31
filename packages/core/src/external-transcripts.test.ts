import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { zstdCompressSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AttachmentStore } from './attachment-store'
import { pngBytes } from './image-fixtures'
import { piSessionsRoot, piTranscripts } from './agents/pi/pi-transcripts'
import { kimiTranscripts } from './agents/kimi/kimi-transcripts'
import { geminiTranscripts } from './agents/gemini/gemini-transcripts'
import { dshTranscripts } from './agents/dsh/dsh-transcripts'
import { opencodeTranscripts } from './agents/opencode/opencode-transcripts'
import { cursorCliTranscripts } from './agents/cursor/cursor-cli-transcripts'
import { cursorDesktopTranscripts, cursorDesktopUserDir } from './agents/cursor/cursor-desktop-transcripts'
import { cursorTranscripts } from './agents/cursor/cursor-transcripts'
import { antigravityTranscripts } from './agents/antigravity/antigravity-transcripts'
import type { TranscriptSource } from './agent-transcripts'

let root: string
let cwd: string
let attachments: AttachmentStore
const id = 'efcc01f0-8833-47c5-9db6-ac7e817fa845'
function save(file: string, value: string | Uint8Array): string { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value); return file }
function jsonl(file: string, records: unknown[]): string { return save(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n') }
function dbAt(file: string): DatabaseSync { mkdirSync(path.dirname(file), { recursive: true }); return new DatabaseSync(file) }
async function only(source: TranscriptSource) { const summaries = await source.scan(); expect(summaries).toHaveLength(1); return { summary: summaries[0]!, transcript: await source.read(summaries[0]!.file, attachments) } }
function vi(value: number): number[] { const bytes: number[] = []; do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(value ? byte + 128 : byte) } while (value); return bytes }
function pb(...fields: Array<[number, string | number | Uint8Array]>): Buffer {
  return Buffer.concat(fields.map(([field, value]) => typeof value === 'number' ? Buffer.from([...vi(field * 8), ...vi(value)]) : (() => {
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
    return Buffer.concat([Buffer.from([...vi(field * 8 + 2), ...vi(bytes.length)]), bytes])
  })()))
}
beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'antumi-external-')); cwd = path.join(root, 'project'); mkdirSync(cwd); const dir = path.join(root, 'attachments'); mkdirSync(dir); attachments = new AttachmentStore(dir) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('external transcript sources', () => {
  it('reads Pi current ancestry, custom title, tool errors and a durable image', async () => {
    const sessions = path.join(root, 'pi')
    const file = jsonl(path.join(sessions, 'bucket', 'session.jsonl'), [
      { type: 'session', id, cwd, version: 3, timestamp: '2026-10-01T00:00:00Z' },
      { type: 'message', id: 'u', parentId: null, message: { role: 'user', content: [{ type: 'text', text: 'Fix it' }, { type: 'image', data: Buffer.from(pngBytes(4, 3)).toString('base64') }] } },
      { type: 'message', id: 'abandoned', parentId: 'u', message: { role: 'assistant', content: [{ type: 'text', text: 'Abandoned branch' }] } },
      { type: 'message', id: 'a', parentId: 'u', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'Inspect' }, { type: 'toolCall', id: 'call', name: 'bash', arguments: { command: 'test' } }] } },
      { type: 'message', id: 'r', parentId: 'a', message: { role: 'toolResult', toolCallId: 'call', isError: true, content: [{ type: 'text', text: 'failed test' }] } },
      { type: 'session_info', id: 'name', parentId: 'r', name: 'My fix' }
    ])
    const before = readFileSync(file)
    const { summary, transcript } = await only(piTranscripts(() => sessions))
    expect(summary).toMatchObject({ sessionId: id, nativeSessionId: file, title: 'My fix', named: true, cwd })
    expect(transcript.entries).toEqual(expect.arrayContaining([expect.objectContaining({ item: expect.objectContaining({ kind: 'tool', status: 'failed', output: 'failed test' }) })]))
    expect(JSON.stringify(transcript)).not.toContain('Abandoned branch')
    const user = transcript.entries.find((entry) => entry.item.kind === 'user')?.item
    expect(user).toMatchObject({ images: [expect.objectContaining({ width: 4, height: 3 })] })
    expect(readFileSync(file)).toEqual(before)
    expect(piSessionsRoot({ PI_CODING_AGENT_DIR: '/custom', PI_CODING_AGENT_SESSION_DIR: '~/history' }, '/home/user')).toBe('/home/user/history')
  })

  it('reads Kimi Node history and excludes injected prompts', async () => {
    const home = path.join(root, 'kimi')
    jsonl(path.join(home, 'session_index.jsonl'), [{ sessionId: id, workDir: cwd }])
    save(path.join(home, 'sessions', 'bucket', id, 'state.json'), JSON.stringify({ title: 'Kimi fix', createdAt: 100 }))
    jsonl(path.join(home, 'sessions', 'bucket', id, 'agents', 'main', 'wire.jsonl'), [
      { type: 'turn.prompt', time: 100, promptId: 'u', origin: { kind: 'user' }, input: [{ type: 'text', text: 'Fix Kimi' }] },
      { type: 'context.append_message', time: 101, message: { role: 'user', content: 'Duplicate prompt' } },
      { type: 'context.append_loop_event', time: 102, event: { type: 'tool.call', toolCallId: 'read', name: 'Read', args: { path: 'file' } } },
      { type: 'context.append_loop_event', time: 103, event: { type: 'tool.result', toolCallId: 'read', result: { output: 'source' } } },
      { type: 'context.append_loop_event', time: 104, event: { type: 'content.part', part: { type: 'text', text: 'Fixed' } } },
      { type: 'turn.prompt', time: 105, origin: { kind: 'notification' }, input: [{ type: 'text', text: 'background notification' }] }
    ])
    const { summary, transcript } = await only(kimiTranscripts(() => home))
    expect(summary).toMatchObject({ sessionId: id, cwd, title: 'Kimi fix' })
    expect(transcript.messages.map((message) => message.text)).toEqual(['Fix Kimi', 'Fixed'])
    expect(transcript.entries.find((entry) => entry.item.kind === 'tool')?.item).toMatchObject({ output: 'source', status: 'done' })
  })

  it('replays Gemini replacement snapshots and rewinds without resurrecting old messages', async () => {
    const home = path.join(root, 'gemini')
    jsonl(path.join(home, 'tmp', 'project-alias', 'chats', 'session-test.jsonl'), [
      { sessionId: id, projectHash: 'project-alias', startTime: '2026-10-01T00:00:00Z' },
      { $set: { directories: [cwd], messages: [{ id: 'u', type: 'user', content: 'Fix Gemini' }, { id: 'old', type: 'gemini', content: 'Obsolete' }] } },
      { $rewindTo: 'old' },
      { id: 'a', type: 'gemini', content: 'Draft', toolCalls: [{ id: 'stale', name: 'read' }] },
      { id: 'a', type: 'gemini', content: 'Final' },
      { $set: { summary: 'Gemini fix' } }
    ])
    const { summary, transcript } = await only(geminiTranscripts(() => home))
    expect(summary).toMatchObject({ title: 'Gemini fix', cwd, nativeSessionId: null })
    expect(transcript.messages.map((message) => message.text)).toEqual(['Fix Gemini', 'Final'])
    expect(transcript.entries.some((entry) => entry.item.kind === 'tool')).toBe(false)
  })

  it('reads Gemini legacy JSON and project index aliases', async () => {
    const home = path.join(root, 'gemini')
    save(path.join(home, 'projects.json'), JSON.stringify({ projects: { [cwd]: 'alias' } }))
    save(path.join(home, 'history', 'alias', 'chats', 'session-old.json'), JSON.stringify({ sessionId: id, messages: [{ id: 'u', type: 'user', content: 'Legacy' }, { id: 'a', type: 'gemini', content: 'Reply' }] }))
    expect((await only(geminiTranscripts(() => home))).transcript.messages.map((message) => message.text)).toEqual(['Legacy', 'Reply'])
  })

  it('reads the latest DeepSeek generation and concatenated compressed frames', async () => {
    const sessions = path.join(root, 'dsh')
    jsonl(path.join(sessions, 'bucket', id, 'session.jsonl'), [{ type: 'session', version: 0, id, cwd, createdAt: 100 }, { type: 'user/message', seq: 0, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Old generation' }] } }])
    const records = [
      { type: 'session', version: 4, id, cwd, createdAt: 100, isSeeded: false },
      { type: 'user/message', seq: 0, time: 100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Current generation' }] } },
      { type: 'user/message', seq: 1, time: 101, data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: 'injected' }] } },
      { type: 'tool/call', seq: 2, time: 102, data: { callId: 'c', name: 'bash', arguments: '{"command":"test"}' } },
      { type: 'tool/result', seq: 3, time: 103, data: { message: { toolCallId: 'c', content: [{ type: 'text', text: 'passed' }] } } },
      { type: 'assistant/message', seq: 4, time: 104, data: { message: { content: [{ type: 'text', text: 'Done' }] } } }
    ]
    save(path.join(sessions, 'bucket', id, 'session.v4.jsonl.zstd'), Buffer.concat(records.map((record) => zstdCompressSync(JSON.stringify(record) + '\n'))))
    const { transcript } = await only(dshTranscripts(() => sessions))
    expect(transcript.messages.map((message) => message.text)).toEqual(['Current generation', 'Done'])
    expect(transcript.entries.find((entry) => entry.item.kind === 'tool')?.item).toMatchObject({ status: 'done', output: 'passed' })
  })

  it('reconciles OpenCode 1/2 copies and imports structured 2.x tools', async () => {
    const file = path.join(root, 'opencode.db')
    const db = dbAt(file)
    db.exec(`CREATE TABLE session(id TEXT, parent_id TEXT, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
      CREATE TABLE message(id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE part(id TEXT, message_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE session_v2(id TEXT, parent_id TEXT, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
      CREATE TABLE session_message(id TEXT, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, data TEXT);`)
    db.prepare('INSERT INTO session VALUES (?, NULL, ?, ?, 100, 101)').run('ses_opaque', cwd, 'Legacy')
    db.prepare('INSERT INTO session_v2 VALUES (?, NULL, ?, ?, 100, 200)').run('ses_opaque', cwd, 'Current')
    db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)').run('u', 'ses_opaque', 'user', 0, 100, JSON.stringify({ content: [{ type: 'text', text: 'Fix OpenCode' }] }))
    db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)').run('a', 'ses_opaque', 'assistant', 1, 200, JSON.stringify({ content: [{ type: 'tool', id: 't', name: 'shell', state: { status: 'completed', input: { command: 'test' }, content: [{ type: 'text', text: 'passed' }] } }, { type: 'text', text: 'Done' }] }))
    db.close()
    const before = readFileSync(file)
    const { summary, transcript } = await only(opencodeTranscripts(() => file))
    expect(summary).toMatchObject({ sessionId: 'ses_opaque', title: 'Current' })
    expect(transcript.messages.map((message) => message.text)).toEqual(['Fix OpenCode', 'Done'])
    expect(transcript.entries.find((entry) => entry.item.kind === 'tool')?.item).toMatchObject({ output: 'passed', name: 'shell' })
    expect(readFileSync(file)).toEqual(before)
  })

  it.each([true, false])('reads Cursor desktop with header table=%s and keeps bubble order', async (modern) => {
    const userDir = path.join(root, 'cursor-desktop')
    const file = path.join(userDir, 'globalStorage', 'state.vscdb')
    const db = dbAt(file)
    db.exec('CREATE TABLE cursorDiskKV(key TEXT PRIMARY KEY, value TEXT)')
    const state = { name: 'Desktop fix', createdAt: 100, lastUpdatedAt: 200, workspaceIdentifier: { uri: { fsPath: cwd } }, fullConversationHeadersOnly: [{ bubbleId: 'u', type: 1 }, { bubbleId: 't', type: 2 }, { bubbleId: 'a', type: 2 }] }
    if (modern) {
      db.exec('CREATE TABLE composerHeaders(composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isSubagent INTEGER, value TEXT)')
      db.prepare('INSERT INTO composerHeaders VALUES (?, ?, 100, 200, 0, ?)').run(id, 'workspace', JSON.stringify(state))
    }
    const put = db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)')
    put.run(`composerData:${id}`, JSON.stringify(state))
    put.run(`bubbleId:${id}:a`, JSON.stringify({ type: 2, text: 'Final', createdAt: '2026-10-01T00:00:02Z' }))
    put.run(`bubbleId:${id}:u`, JSON.stringify({ type: 1, text: 'Fix desktop', createdAt: '2026-10-01T00:00:00Z' }))
    put.run(`bubbleId:${id}:t`, JSON.stringify({ type: 2, toolFormerData: { name: 'read_file_v2', toolCallId: 'read', params: '{"targetFile":"app.ts"}', result: 'source', status: 'completed' } }))
    db.close()
    const before = readFileSync(file)
    const { summary, transcript } = await only(cursorDesktopTranscripts(() => userDir))
    expect(summary).toMatchObject({ sessionId: `desktop:${id}`, nativeSessionId: null, source: 'desktop', cwd })
    expect(transcript.entries.map((entry) => entry.item.kind)).toEqual(['user', 'tool', 'assistant', 'turn'])
    expect(transcript.messages.map((message) => message.text)).toEqual(['Fix desktop', 'Final'])
    expect(readFileSync(file)).toEqual(before)
  })

  it('decodes Cursor CLI blob DAG and preserves source identity', async () => {
    const home = path.join(root, 'cursor-cli')
    const file = path.join(home, 'chats', 'cwd-hash', id, 'store.db')
    const db = dbAt(file)
    db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE blobs(id TEXT PRIMARY KEY, data BLOB)')
    const rootId = Buffer.from('11', 'hex'), turnId = Buffer.from('22', 'hex'), userId = Buffer.from('33', 'hex'), stepId = Buffer.from('44', 'hex')
    db.prepare('INSERT INTO meta VALUES (?, ?)').run('0', Buffer.from(JSON.stringify({ latestRootBlobId: rootId.toString('hex'), name: 'CLI fix', createdAt: 100 })).toString('hex'))
    const put = db.prepare('INSERT INTO blobs VALUES (?, ?)')
    put.run(rootId.toString('hex'), pb([8, turnId], [21, pb([1, cwd])]))
    put.run(turnId.toString('hex'), pb([1, pb([1, userId], [2, stepId])]))
    put.run(userId.toString('hex'), pb([1, 'Fix CLI']))
    put.run(stepId.toString('hex'), pb([1, pb([1, 'CLI reply'])]))
    db.close()
    const { summary, transcript } = await only(cursorCliTranscripts(() => home))
    expect(summary).toMatchObject({ sessionId: id, source: 'cli', clockless: true })
    expect(transcript.messages.map((message) => message.text)).toEqual(['Fix CLI', 'CLI reply'])
    const broken: TranscriptSource = { scan: async () => { throw new Error('locked') }, read: async () => ({ entries: [], messages: [] }) }
    const combined = cursorTranscripts(cursorCliTranscripts(() => home), broken)
    expect(await combined.scan()).toHaveLength(1)
    expect(combined.diagnostics?.()).toHaveLength(1)
  })

  it('decodes Antigravity ACP steps and correlates tool results', async () => {
    const sessions = path.join(root, 'antigravity')
    const file = path.join(sessions, `${id}.db`)
    save(path.join(sessions, `${id}.meta`), JSON.stringify({ cwd }))
    const db = dbAt(file)
    db.exec('CREATE TABLE steps(idx INTEGER PRIMARY KEY, step_payload BLOB)')
    const put = db.prepare('INSERT INTO steps VALUES (?, ?)')
    put.run(0, pb([19, pb([1, 'Fix Antigravity'])]))
    put.run(1, pb([20, pb([3, 'Inspect'], [7, pb([1, 'call'], [2, 'run_command'], [3, '{"command":"test"}'])])]))
    put.run(2, pb([5, pb([4, pb([1, 'call'], [2, 'run_command'])])], [28, pb([1, 'test'], [4, 'passed'])]))
    put.run(3, pb([20, pb([1, 'Done'])]))
    db.close()
    const { summary, transcript } = await only(antigravityTranscripts(() => sessions))
    expect(summary).toMatchObject({ sessionId: id, cwd })
    expect(transcript.messages.map((message) => message.text)).toEqual(['Fix Antigravity', 'Done'])
    expect(transcript.entries.filter((entry) => entry.item.kind === 'tool')).toHaveLength(1)
    expect(transcript.entries.find((entry) => entry.item.kind === 'tool')?.item).toMatchObject({ status: 'done', output: 'passed' })
  })

  it('returns no histories for absent stores on all supported sources', async () => {
    const absent = () => path.join(root, 'absent')
    for (const source of [piTranscripts(absent), kimiTranscripts(absent), geminiTranscripts(absent), dshTranscripts(absent), opencodeTranscripts(absent), cursorCliTranscripts(absent), cursorDesktopTranscripts(absent), antigravityTranscripts(absent)]) expect(await source.scan()).toEqual([])
    expect(cursorDesktopUserDir('win32', 'C:\\Users\\test', { APPDATA: 'C:\\Roaming' })).toContain('Cursor')
  })

  it('keeps tool-returned images after their source file is removed', async () => {
    const sessions = path.join(root, 'pi')
    const image = save(path.join(root, 'screenshot.png'), pngBytes(4, 3))
    jsonl(path.join(sessions, 'session.jsonl'), [
      { type: 'session', id, cwd, version: 3 },
      { type: 'message', id: 'u', parentId: null, message: { role: 'user', content: 'Take a screenshot' } },
      { type: 'message', id: 'call', parentId: 'u', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'shot', name: 'browser', arguments: {} }] } },
      { type: 'message', id: 'result', parentId: 'call', message: { role: 'toolResult', toolCallId: 'shot', content: [{ type: 'text', text: 'captured' }, { type: 'image', path: image }] } }
    ])
    const { transcript } = await only(piTranscripts(() => sessions))
    const item = transcript.entries.find((entry) => entry.item.kind === 'tool')?.item
    expect(item).toMatchObject({ output: 'captured', images: [expect.objectContaining({ width: 4, height: 3 })] })
    rmSync(image)
    if (item?.kind === 'tool') expect(await attachments.info(item.images![0]!.id)).toMatchObject({ width: 4, height: 3 })
  })

  it('keeps image-only prompts and records unavailable images without downloading', async () => {
    const sessions = path.join(root, 'pi')
    jsonl(path.join(sessions, 'session.jsonl'), [
      { type: 'session', id, cwd, version: 3 },
      { type: 'message', id: 'u', parentId: null, message: { role: 'user', content: [{ type: 'image', url: 'https://invalid.example/image.png' }] } }
    ])
    const source = piTranscripts(() => sessions)
    const { summary, transcript } = await only(source)
    expect(transcript.entries.find((entry) => entry.item.kind === 'user')?.item).toMatchObject({ text: '[图片]' })
    expect(transcript.entries.filter((entry) => entry.item.kind === 'notice')).toHaveLength(1)
    const repeated = await source.read(summary.file, attachments)
    expect(repeated.entries.map((entry) => entry.item.id)).toEqual(transcript.entries.map((entry) => entry.item.id))
  })

})
