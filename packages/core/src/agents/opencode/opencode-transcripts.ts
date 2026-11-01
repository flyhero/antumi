import os from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { AttachmentStore } from '../../attachment-store'
import { titleOf, type TranscriptSource, type TranscriptSummary } from '../../agent-transcripts'
import { TranscriptBuilder, transcriptImages } from '../../transcript-builder'
import { array, contentText, json, number, object, string, timestamp } from '../../transcript-values'
import { openTranscriptDb, transcriptDbExists, transcriptLocator, transcriptTables } from '../../sqlite-transcripts'

type StoredSession = { row: Record<string, unknown>; version: 'legacy' | 'v2' }

export const opencodeSessionDb = (env: NodeJS.ProcessEnv = process.env, home = os.homedir()) => path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'opencode', 'opencode.db')

function sessions(db: DatabaseSync): StoredSession[] {
  const tables = transcriptTables(db)
  const found = new Map<string, StoredSession>()
  for (const version of ['v2', 'legacy'] as const) {
    const table = version === 'v2' ? 'session_v2' : 'session'
    if (!tables.has(table) || !tables.has(version === 'v2' ? 'session_message' : 'message') || (version === 'legacy' && !tables.has('part'))) continue
    for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
      const id = string(row.id)
      const previous = found.get(id)
      if (!previous || (number(row.time_updated) ?? 0) >= (number(previous.row.time_updated) ?? 0)) found.set(id, { row, version })
    }
  }
  if (!found.size && !tables.has('session') && !tables.has('session_v2')) throw new Error('OpenCode 会话数据库格式不受支持')
  return [...found.values()].filter(({ row }) => !row.parent_id && !row.time_deleted && !row.time_archived)
}

async function readSession(db: DatabaseSync, session: StoredSession, attachments?: AttachmentStore) {
  const { row, version } = session
  const builder = new TranscriptBuilder()
  const messages = version === 'v2'
    ? db.prepare('SELECT * FROM session_message WHERE session_id = ? ORDER BY seq').all(string(row.id))
    : db.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY time_created, rowid').all(string(row.id))
  for (const message of messages) {
    const data = object(json(message.data))
    const role = string(data.role) || string(message.type)
    if (role !== 'user' && role !== 'assistant') continue
    const id = string(message.id)
    const at = timestamp(object(data.time).created, number(message.time_created) ?? number(row.time_created) ?? 0)
    const parts = version === 'v2' ? array(data.parts ?? data.content).map((part, index) => ({ id: `${id}:${index}`, data: object(part) }))
      : db.prepare('SELECT id, data FROM part WHERE message_id = ? ORDER BY time_created, rowid').all(id).map((part) => ({ id: string(part.id), data: object(json(part.data)) }))
    if (role === 'user') {
      if (data.synthetic === true || object(data.semantics).uiVisibility === 'hidden') continue
      const visible = parts.filter((part) => part.data.synthetic !== true && part.data.ignored !== true)
      builder.user(id, visible.filter((part) => part.data.type === 'text').map((part) => string(part.data.text)).join('\n') || contentText(data.text), at,
        await transcriptImages(visible.map((part) => part.data.type === 'file' && string(part.data.mime).startsWith('image/') ? { ...part.data, type: 'image' } : part.data), string(row.directory), attachments, builder, at))
      continue
    }
    for (const part of parts) {
      if (part.data.type === 'text' || part.data.type === 'reasoning') builder.assistant(part.id, string(part.data.text), at, part.data.type === 'reasoning')
      else if (part.data.type === 'tool' || part.data.type === 'tool-call') {
        const state = object(part.data.state)
        builder.tool(string(part.data.callID) || string(part.data.id) || part.id, string(part.data.tool) || string(part.data.name), state.input ?? part.data.input,
          state.output ?? state.error ?? (state.content ? contentText(state.content) : part.data.output), at, string(state.status) || string(part.data.status),
          await transcriptImages(array(state.content).map((value) => object(value).type === 'file' && string(object(value).mime).startsWith('image/') ? { ...object(value), type: 'image' } : value), string(row.directory), attachments, builder, at))
      }
    }
  }
  return builder.build()
}

export function opencodeTranscripts(file: () => string = () => opencodeSessionDb()): TranscriptSource {
  return {
    async scan() {
      if (!await transcriptDbExists(file())) return []
      const db = openTranscriptDb(file())
      try {
        const summaries: TranscriptSummary[] = []
        for (const session of sessions(db)) {
          // Listing reads only the first user message, never tool outputs.
          const { row, version } = session
          const first = version === 'v2'
            ? db.prepare("SELECT data FROM session_message WHERE session_id = ? AND type = 'user' ORDER BY seq LIMIT 1").get(string(row.id))
            : db.prepare("SELECT p.data FROM message m JOIN part p ON p.message_id = m.id WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'user' AND json_extract(p.data, '$.type') = 'text' ORDER BY m.time_created, p.time_created LIMIT 1").get(string(row.id))
          if (!first) continue
          const data = object(json(first.data))
          const prompt = string(data.text) || contentText(data.parts ?? data.content)
          summaries.push({ sessionId: string(row.id), cwd: string(row.directory), title: string(row.title) || titleOf(prompt), named: false, firstPrompt: titleOf(prompt, 200),
            startedAt: number(row.time_created) ?? 0, modifiedAt: number(row.time_updated) ?? 0, file: `${file()}#${string(row.id)}` })
        }
        return summaries
      } finally { db.close() }
    },
    async read(locator, attachments) {
      const { database, id } = transcriptLocator(locator)
      const db = openTranscriptDb(database)
      try {
        const session = sessions(db).find((candidate) => candidate.row.id === id)
        if (!session) throw new Error('OpenCode 会话已不存在')
        return await readSession(db, session, attachments)
      } finally { db.close() }
    }
  }
}
