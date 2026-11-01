import { readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import type { TranscriptSource, TranscriptSummary } from '../../agent-transcripts'
import { titleOf } from '../../agent-transcripts'
import { TranscriptBuilder, transcriptImages } from '../../transcript-builder'
import { array, json, number, object, string, timestamp } from '../../transcript-values'
import { openTranscriptDb, transcriptDbExists, transcriptLocator, transcriptTables } from '../../sqlite-transcripts'

export function cursorDesktopUserDir(platform: NodeJS.Platform = process.platform, home = os.homedir(), env: NodeJS.ProcessEnv = process.env): string {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Cursor', 'User')
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Cursor', 'User')
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Cursor', 'User')
}

function cell(db: DatabaseSync, key: string): Record<string, unknown> {
  const value = db.prepare('SELECT value FROM cursorDiskKV WHERE key = ?').get(key)?.value
  return object(json(value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : value))
}
function directory(value: unknown): string {
  const uri = object(value)
  const candidate = string(uri.fsPath) || string(uri.path) || string(value)
  try { return candidate.startsWith('file:') ? fileURLToPath(candidate) : candidate } catch { return '' }
}
function cwdOf(head: Record<string, unknown>, state: Record<string, unknown>, workspaces: ReadonlyMap<string, string>, workspaceId: string): string {
  return directory(object(head.workspaceIdentifier).uri) || directory(object(state.workspaceIdentifier).uri) ||
    directory(object(object(head.agentLocation).environment).uri) || directory(object(object(state.agentLocation).environment).uri) ||
    string(object(array(head.trackedGitRepos)[0]).repoPath) || string(object(array(state.trackedGitRepos)[0]).repoPath) || workspaces.get(workspaceId) || ''
}
function headers(db: DatabaseSync, id?: string): Record<string, unknown>[] {
  const tables = transcriptTables(db)
  if (!tables.has('cursorDiskKV')) throw new Error('Cursor 桌面数据库格式不受支持')
  if (tables.has('composerHeaders')) return id === undefined
    ? db.prepare('SELECT * FROM composerHeaders ORDER BY lastUpdatedAt DESC').all()
    : db.prepare('SELECT * FROM composerHeaders WHERE composerId = ?').all(id)
  const rows = id === undefined ? db.prepare("SELECT key, value FROM cursorDiskKV WHERE key GLOB 'composerData:*'").all()
    : db.prepare('SELECT key, value FROM cursorDiskKV WHERE key = ?').all(`composerData:${id}`)
  return rows.map((row) => ({
    composerId: string(row.key).slice('composerData:'.length), value: row.value
  }))
}
function bubbles(db: DatabaseSync, id: string, state: Record<string, unknown>): Record<string, unknown>[] {
  const rows = db.prepare('SELECT key, value FROM cursorDiskKV WHERE key >= ? AND key < ? ORDER BY rowid').all(`bubbleId:${id}:`, `bubbleId:${id};`)
  const byId = new Map(rows.map((row) => [string(row.key).slice(`bubbleId:${id}:`.length), object(json(row.value instanceof Uint8Array ? Buffer.from(row.value).toString('utf8') : row.value))]))
  const order = array(state.fullConversationHeadersOnly).map((header) => string(object(header).bubbleId)).filter(Boolean)
  return (order.length ? order : [...byId.keys()]).flatMap((bubbleId) => {
    const data = byId.get(bubbleId)
    return data ? [{ ...data, bubbleId }] : []
  })
}

export function cursorDesktopTranscripts(root: () => string = () => cursorDesktopUserDir()): TranscriptSource {
  const database = () => path.join(root(), 'globalStorage', 'state.vscdb')
  return {
    async scan() {
      if (!await transcriptDbExists(database())) return []
      const workspaces = new Map<string, string>()
      const workspaceRoot = path.join(root(), 'workspaceStorage')
      for (const name of await readdir(workspaceRoot).catch(() => [])) {
        const workspace = object(json(await readFile(path.join(workspaceRoot, name, 'workspace.json'), 'utf8').catch(() => '{}')))
        const cwd = directory(workspace.folder)
        if (cwd) workspaces.set(name, cwd)
      }
      const db = openTranscriptDb(database())
      try {
        const result: TranscriptSummary[] = []
        for (const row of headers(db)) {
          const id = string(row.composerId)
          const head = object(json(row.value instanceof Uint8Array ? Buffer.from(row.value).toString('utf8') : row.value))
          if (!id || row.isSubagent || head.isSubagent || head.isDraft || id === 'empty-state-draft') continue
          const state = cell(db, `composerData:${id}`)
          if (row.isArchived || head.isArchived || state.isArchived) continue
          const cwd = cwdOf(head, state, workspaces, string(row.workspaceId))
          if (!cwd) continue
          const firstHeader = array(state.fullConversationHeadersOnly).find((header) => object(header).type === 1)
          const first = firstHeader ? cell(db, `bubbleId:${id}:${string(object(firstHeader).bubbleId)}`) : object(json(db.prepare("SELECT value FROM cursorDiskKV WHERE key >= ? AND key < ? AND json_valid(value) AND json_extract(value, '$.type') = 1 ORDER BY rowid LIMIT 1").get(`bubbleId:${id}:`, `bubbleId:${id};`)?.value))
          const prompt = string(first.text)
          if (!prompt && !array(first.images).length) continue
          result.push({ sessionId: `desktop:${id}`, nativeSessionId: null, source: 'desktop', cwd,
            title: string(head.name) || string(state.name) || titleOf(prompt || '[图片]'), named: Boolean(string(head.name) || string(state.name)),
            firstPrompt: titleOf(prompt || '[图片]', 200), startedAt: timestamp(row.createdAt ?? head.createdAt ?? state.createdAt, timestamp(first.createdAt, 0)),
            modifiedAt: timestamp(row.lastUpdatedAt ?? head.lastUpdatedAt ?? state.lastUpdatedAt, timestamp(first.createdAt, 0)), file: `${database()}#${id}` })
        }
        return result
      } finally { db.close() }
    },
    async read(locator, attachments) {
      const { database: file, id } = transcriptLocator(locator)
      const db = openTranscriptDb(file)
      try {
        const state = cell(db, `composerData:${id}`)
        const row = headers(db, id)[0]
        if (!row) throw new Error('Cursor 会话已不存在')
        const head = object(json(row?.value instanceof Uint8Array ? Buffer.from(row.value).toString('utf8') : row?.value))
        if (row?.isArchived || head.isArchived || state.isArchived) throw new Error('Cursor 会话已归档，不能导入')
        const builder = new TranscriptBuilder()
        for (const row of bubbles(db, id, state)) {
          const at = timestamp(row.createdAt, number(state.createdAt) ?? 0)
          const bubbleId = string(row.bubbleId)
          if (row.type === 1) builder.user(bubbleId, string(row.text) || (array(row.images).length ? '[图片]' : ''), at, await transcriptImages(array(row.images).map((image) => ({ ...object(image), type: 'image' })), cwdOf({}, state, new Map(), ''), attachments, builder, at))
          else if (row.type === 2) {
            builder.assistant(bubbleId, string(row.text), at)
            builder.assistant(bubbleId, string(object(row.thinking).text), at, true)
            const tool = object(row.toolFormerData)
            if (string(tool.name) || string(tool.toolCallId)) builder.tool(string(tool.toolCallId) || bubbleId, string(tool.name) || `cursor_tool_${string(tool.tool) || number(tool.tool)}`, json(tool.params) ?? tool.params, tool.result, at, string(tool.status))
          }
        }
        return builder.build()
      } finally { db.close() }
    }
  }
}
