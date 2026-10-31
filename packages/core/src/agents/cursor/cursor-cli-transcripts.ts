import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import type { AttachmentStore } from '../../attachment-store'
import { findFiles, titleOf, type TranscriptSource, type TranscriptSummary } from '../../agent-transcripts'
import { TranscriptBuilder, transcriptImages } from '../../transcript-builder'
import { json, number, object, string } from '../../transcript-values'
import { openTranscriptDb, transcriptDbModifiedAt } from '../../sqlite-transcripts'
import { protoAllBytes, protoBytes, protoFields, protoNumber, protoPreview, protoText } from '../../transcript-protobuf'

export const cursorConfigHome = (env: NodeJS.ProcessEnv = process.env, home = os.homedir()) => env.CURSOR_CONFIG_DIR || (env.XDG_CONFIG_HOME ? path.join(env.XDG_CONFIG_HOME, 'cursor') : path.join(home, '.cursor'))
const EMPTY = new Uint8Array()
const TOOLS: Readonly<Record<number, string>> = { 1: 'shell', 3: 'delete', 4: 'glob', 5: 'grep', 8: 'read', 9: 'update_todos', 10: 'read_todos', 12: 'edit', 13: 'ls', 14: 'read_lints', 15: 'mcp', 16: 'sem_search', 17: 'create_plan', 18: 'web_search', 19: 'task', 20: 'list_mcp_resources', 21: 'read_mcp_resource', 23: 'ask_question', 24: 'fetch', 25: 'switch_mode', 28: 'generate_image', 61: 'pi_read', 62: 'pi_bash', 63: 'pi_edit', 64: 'pi_write' }

function blob(db: DatabaseSync, id: Uint8Array): Uint8Array | null {
  const row = db.prepare('SELECT data FROM blobs WHERE id = ?').get(Buffer.from(id).toString('hex'))
  return row?.data instanceof Uint8Array ? row.data : null
}
const resolveBlob = (db: DatabaseSync, id: Uint8Array) => blob(db, id) ?? id
function metadata(db: DatabaseSync): Record<string, unknown> {
  const raw = db.prepare("SELECT value FROM meta WHERE key = '0'").get()?.value
  const value = typeof raw === 'string' ? raw : raw instanceof Uint8Array ? Buffer.from(raw).toString('utf8') : ''
  return object(json(/^[\da-f]+$/i.test(value) ? Buffer.from(value, 'hex').toString('utf8') : value))
}
function userText(db: DatabaseSync, user: Uint8Array): string {
  const large = protoBytes(user, 18)
  return protoText(user, 1) || (large ? Buffer.from(blob(db, large) ?? EMPTY).toString('utf8') : '') || protoText(user, 8)
}
function localPath(value: string): string {
  try { return value.startsWith('file:') ? fileURLToPath(value) : value } catch { return '' }
}

function decodeTool(db: DatabaseSync, payload: Uint8Array, fallbackId: string, at: number, builder: TranscriptBuilder): void {
  const variant = protoFields(payload).find((field) => field.field !== 57 && field.value instanceof Uint8Array)
  if (!variant || !(variant.value instanceof Uint8Array)) return
  const args = protoBytes(variant.value, 1) ?? EMPTY
  const result = protoBytes(variant.value, 2)
  const id = protoText(payload, 57) || fallbackId
  const name = TOOLS[variant.field] ?? `cursor_tool_${variant.field}`
  if (!TOOLS[variant.field]) builder.notice('cursor-tool-format', '部分 Cursor 工具使用通用字段预览，原始字段可能无法完整还原。', at)
  let input: Record<string, unknown> = protoPreview(args)
  let output: unknown = result ? protoPreview(result) : null
  let state = result ? protoBytes(result, 2) ? 'failed' : 'completed' : 'pending'
  if (variant.field === 1 || variant.field === 62) {
    input = { command: protoText(args, 1), cwd: protoText(args, 2) }
    if (result) {
      const success = protoBytes(result, 1)
      const failure = protoBytes(result, 2)
      const body = success ?? failure
      if (body) output = protoText(body, success ? 10 : 9) || [protoText(body, 5), protoText(body, 6)].filter(Boolean).join('\n')
      if (failure || (body && (protoNumber(body, 3) ?? 0) !== 0)) state = 'failed'
      if (!body) state = 'failed'
    }
  } else if ([3, 8, 12, 13, 61, 63, 64].includes(variant.field)) {
    input = { path: protoText(args, 1), ...protoPreview(args) }
    if (result) {
      const success = protoBytes(result, 1)
      if (success) {
        const content = protoBytes(success, 10)
        output = variant.field === 12 ? protoText(success, 5) || protoText(success, 8) || protoPreview(success)
          : protoText(success, 1) || (content ? Buffer.from(blob(db, content) ?? content).toString('utf8') : protoPreview(success))
      } else state = 'failed'
    }
  }
  builder.tool(id, name, input, output, at, state)
}

async function readStore(file: string, modifiedAt: number, attachments?: AttachmentStore, summaryOnly = false) {
  const db = openTranscriptDb(file)
  try {
    const meta = metadata(db)
    if (meta.subagentInfo) return null
    const rootId = string(meta.latestRootBlobId)
    if (!/^[\da-f]+$/i.test(rootId)) return null
    const root = blob(db, Buffer.from(rootId, 'hex'))
    if (!root) throw new Error('Cursor 根记录缺失')
    const sidecar = object(json(await readFile(path.join(path.dirname(file), 'meta.json'), 'utf8').catch(() => '{}')))
    const repo = protoBytes(root, 21)
    const cwd = string(sidecar.cwd) || (repo ? protoText(repo, 1) : '') || localPath(protoAllBytes(root, 9).map((item) => Buffer.from(item).toString('utf8')).at(-1) ?? '')
    const startedAt = number(meta.createdAt) ?? protoNumber(root, 26) ?? modifiedAt
    const builder = new TranscriptBuilder()
    const turns = protoAllBytes(root, 8)
    const timings = protoAllBytes(root, 14)
    for (const [index, ref] of turns.entries()) {
      const turnId = Buffer.from(ref).toString('hex')
      const turn = resolveBlob(db, ref)
      const agentTurn = protoBytes(turn, 1)
      const at = timings[index] ? protoNumber(timings[index], 2) ?? startedAt : startedAt
      if (!agentTurn) {
        const shell = protoBytes(turn, 2)
        const commandRef = shell ? protoBytes(shell, 1) : null
        const outputRef = shell ? protoBytes(shell, 2) : null
        const command = commandRef ? protoText(resolveBlob(db, commandRef), 1) : ''
        if (!command) continue
        const output = outputRef ? resolveBlob(db, outputRef) : null
        builder.user(turnId, `! ${command}`, at)
        if (summaryOnly) break
        builder.tool(`shell:${turnId}`, 'shell', { command }, output ? [protoText(output, 1), protoText(output, 2)].filter(Boolean).join('\n') : null,
          at, !output ? 'pending' : (protoNumber(output, 3) ?? 0) !== 0 ? 'failed' : 'completed')
        continue
      }
      const userRef = protoBytes(agentTurn, 1)
      if (userRef) {
        const user = resolveBlob(db, userRef)
        const images = protoAllBytes(user, 3).flatMap((attachment) => {
          const image = protoBytes(attachment, 1)
          const id = image ? protoBytes(image, 1) : null
          const data = id ? blob(db, id) : null
          return data ? [{ type: 'image', data: Buffer.from(data).toString('base64') }] : []
        })
        builder.user(turnId, userText(db, user) || (summaryOnly && images.length ? '[图片]' : ''), at, summaryOnly ? [] : await transcriptImages(images, cwd, attachments, builder, at))
      }
      if (summaryOnly && builder.transcript.messages.length) break
      for (const [stepIndex, stepRef] of protoAllBytes(agentTurn, 2).entries()) {
        const step = resolveBlob(db, stepRef)
        const id = `${turnId}:${Buffer.from(stepRef).toString('hex') || stepIndex}`
        const assistant = protoBytes(step, 1)
        const thought = protoBytes(step, 3)
        const tool = protoBytes(step, 2)
        if (assistant) builder.assistant(id, protoText(assistant, 1), at)
        if (thought) builder.assistant(id, protoText(thought, 1), at, true)
        if (tool) decodeTool(db, tool, id, at, builder)
      }
    }
    return { sessionId: path.basename(path.dirname(file)), cwd, title: string(meta.name) || string(sidecar.title), named: Boolean(string(meta.name)), startedAt, clockless: timings.length === 0, transcript: builder.build() }
  } finally { db.close() }
}

export function cursorCliTranscripts(home: () => string = () => cursorConfigHome()): TranscriptSource {
  const warnings: string[] = []
  return {
    diagnostics: () => [...warnings],
    async scan() {
      warnings.length = 0
      const roots = [path.join(home(), 'chats'), path.join(home(), 'acp-sessions')]
      const files = (await Promise.all(roots.map((root) => findFiles(root, 2, (name) => name === 'store.db')))).flat()
      const result: TranscriptSummary[] = []
      for (const file of files) {
        try {
          const modifiedAt = await transcriptDbModifiedAt(file.file)
          const parsed = await readStore(file.file, modifiedAt, undefined, true)
          const prompt = parsed?.transcript.messages.find((message) => message.role === 'user')?.text
          if (parsed?.cwd && prompt) result.push({ ...parsed, title: parsed.title || titleOf(prompt), firstPrompt: titleOf(prompt, 200), modifiedAt, file: file.file, source: 'cli' })
        } catch { warnings.push(`无法读取 Cursor CLI 会话：${file.file}`) }
      }
      return result
    },
    async read(file, attachments) {
      const parsed = await readStore(file, await transcriptDbModifiedAt(file), attachments)
      if (!parsed) throw new Error('Cursor 会话为空或格式不受支持')
      return parsed.transcript
    }
  }
}
