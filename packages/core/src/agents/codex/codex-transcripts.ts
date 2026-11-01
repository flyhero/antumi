import path from 'node:path'
import { CODEX_IMAGE_GENERATION, CODEX_IMAGE_VIEW, CONTEXT_COMPACTED } from '@antumi/protocol'
import { z } from 'zod'
import { clip, type ChatItemBody } from '../../chat-items'
import { findFiles, parseLine, readHead, readLines, SummaryCache, timeOf, titleOf, type Transcript, type TranscriptEntry, type TranscriptMessage, type TranscriptSource, type TranscriptSummary } from '../../agent-transcripts'
import { codexDefaultHome } from './codex-account'
import { CODEX_CLIENT_NAME, commandDescription, diffOf, unwrapShell } from './codex-app-server'
import { openTranscriptDb, transcriptTables } from '../../sqlite-transcripts'

// Codex keeps each thread in sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl, older ones
// packed as .jsonl.zst: a session_meta line first, then what the model saw (response_item) and
// what happened (event_msg), each item of a turn reported as it completed.
const ROLLOUT = /^rollout-.+\.jsonl(\.zst)?$/

const Line = z.looseObject({ timestamp: z.string().optional(), type: z.string(), payload: z.unknown() })
const Meta = z.looseObject({
  id: z.string(),
  cwd: z.string(),
  timestamp: z.string().optional(),
  // A subagent's or Codex's own thread (a review, a compaction) names where it came from as an object.
  source: z.unknown().optional(),
  thread_source: z.string().nullish(),
  originator: z.string().nullish()
})
const Text = z.looseObject({ type: z.string().optional(), text: z.string().optional() })
const Message = z.looseObject({ type: z.literal('message'), role: z.string(), content: z.array(Text).catch([]) })
const Event = z.looseObject({ type: z.string(), turn_id: z.string().optional(), item: z.unknown().optional(), last_agent_message: z.string().nullish() })
const Item = z.looseObject({
  type: z.string(),
  id: z.string(),
  content: z.array(Text).catch([]).optional(),
  summary_text: z.array(z.string()).catch([]).optional(),
  text: z.string().optional(),
  command: z.union([z.array(z.string()), z.string()]).optional(),
  parsed_cmd: z.array(z.looseObject({ type: z.string(), name: z.string().nullish(), path: z.string().nullish(), query: z.string().nullish() })).catch([]).optional(),
  aggregated_output: z.string().nullish(),
  stdout: z.string().nullish(),
  exit_code: z.number().nullish(),
  status: z.string().optional(),
  changes: z.record(z.string(), z.looseObject({ type: z.string(), content: z.string().optional(), unified_diff: z.string().optional() })).catch({}).optional(),
  server: z.string().optional(),
  tool: z.string().optional(),
  arguments: z.unknown().optional(),
  result: z.looseObject({ content: z.array(Text).catch([]) }).nullish().catch(null),
  error: z.unknown().optional(),
  query: z.string().nullish(),
  path: z.string().optional(),
  // An Extension item says what it was: a web search, or a picture drawn and saved.
  kind: z.string().optional(),
  revisedPrompt: z.string().nullish(),
  savedPath: z.string().nullish(),
  failure: z.union([z.string(), z.looseObject({ message: z.string().optional() })]).nullish().catch(null)
})
type Item = z.infer<typeof Item>
const Args = z.record(z.string(), z.unknown()).catch({})

// What Codex sends as the user's but the user never typed: the instructions and context it adds.
const SCAFFOLDING = ['<', '# AGENTS.md', '# Context from my IDE setup', '# In app browser:', '# Browser comments:', '# Files mentioned by the user:', '# Diff comments:', '# Selected text:', '# Review findings:', 'You are Codex']

function textOf(parts: ReadonlyArray<z.infer<typeof Text>> | undefined): string {
  return (parts ?? []).flatMap((part) => (part.text ? [part.text] : part.type === 'image' || part.type === 'local_image' || part.type === 'input_image' ? ['[图片]'] : [])).join('\n').trim()
}

function userPrompt(payload: unknown): string | null {
  const message = Message.safeParse(payload)
  if (!message.success || message.data.role !== 'user') return null
  const text = textOf(message.data.content)
  return text && !SCAFFOLDING.some((prefix) => text.startsWith(prefix)) ? text : null
}

// The thread a user started, by hand or by `codex exec`: not a subagent, review or compaction, and
// not one Antumi itself opened.
export function codexUserThread(payload: unknown): z.infer<typeof Meta> | null {
  const meta = Meta.safeParse(payload)
  if (!meta.success) return null
  const { source, thread_source: threadSource, originator } = meta.data
  if (typeof source !== 'string' || (threadSource != null && threadSource !== 'user') || originator === CODEX_CLIENT_NAME) return null
  return meta.data
}

async function summarizeCodexRollout(file: string, mtimeMs: number, titles: ReadonlyMap<string, string>): Promise<TranscriptSummary | null> {
  const head: { meta: z.infer<typeof Meta> | null; prompt: string | null; lines: number } = { meta: null, prompt: null, lines: 0 }
  await readHead(file, (text) => {
    const line = Line.safeParse(parseLine(text))
    if (head.lines++ === 0) {
      head.meta = line.success && line.data.type === 'session_meta' ? codexUserThread(line.data.payload) : null
      return head.meta !== null
    }
    if (!line.success) return true
    if (line.data.type === 'response_item') head.prompt ??= userPrompt(line.data.payload)
    else if (line.data.type === 'event_msg') {
      const event = Event.safeParse(line.data.payload)
      const item = event.success && event.data.type === 'item_completed' ? Item.safeParse(event.data.item) : null
      if (item?.success && item.data.type === 'UserMessage') head.prompt ??= textOf(item.data.content) || null
    }
    return head.prompt === null
  })
  const { meta, prompt } = head
  if (!meta) return null
  const named = titles.get(meta.id)
  const firstPrompt = prompt ?? named
  if (firstPrompt === undefined) return null
  return {
    sessionId: meta.id,
    cwd: meta.cwd,
    title: named ?? titleOf(firstPrompt),
    named: false,
    firstPrompt: titleOf(firstPrompt, 200),
    startedAt: timeOf(meta.timestamp) ?? mtimeMs,
    modifiedAt: mtimeMs,
    file
  }
}

function command(item: Item): string {
  const { command: raw } = item
  if (typeof raw === 'string') return unwrapShell(raw)
  if (!raw?.length) return ''
  const [shell = '', flag, script] = raw
  return raw.length === 3 && script !== undefined && /(?:^|\/)(?:ba|z|da|k)?sh$/.test(shell) && (flag === '-lc' || flag === '-c') ? script : raw.join(' ')
}

// Codex's reading of a command, in the names its app server gives the same thing.
function actions(item: Item) {
  return item.parsed_cmd?.map((action) => ({ ...action, type: action.type === 'list_files' ? 'listFiles' : action.type }))
}

function status(item: Item): 'done' | 'failed' | 'denied' | 'interrupted' {
  if (item.status === 'declined') return 'denied'
  if (item.status === 'failed' || item.error) return 'failed'
  if (item.status === 'in_progress' || item.status === 'inProgress') return 'interrupted'
  return item.exit_code !== null && item.exit_code !== undefined && item.exit_code !== 0 ? 'failed' : 'done'
}

// An item of a turn as Antumi's chat shows the same item from Codex's app server.
function itemBody(item: Item, id: string): ChatItemBody | null {
  switch (item.type) {
    case 'AgentMessage': {
      const text = textOf(item.content)
      return text ? { id: `m:${id}`, kind: 'assistant', text, streaming: false } : null
    }
    case 'Plan':
      return item.text?.trim() ? { id: `m:${id}`, kind: 'assistant', text: item.text, streaming: false } : null
    case 'Reasoning': {
      const text = (item.summary_text ?? []).join('\n')
      return text.trim() ? { id: `r:${id}`, kind: 'reasoning', text, streaming: false } : null
    }
    case 'CommandExecution': {
      const line = command(item)
      const output = item.aggregated_output ?? item.stdout ?? ''
      const settled = status(item)
      return {
        id: `t:${id}`,
        kind: 'tool',
        name: 'commandExecution',
        title: line,
        description: commandDescription(actions(item)),
        input: line,
        status: settled,
        ...(settled === 'done' || settled === 'failed' ? { execution: { status: settled === 'done' ? 'completed' : 'failed', exitCode: item.exit_code ?? null } } : {}),
        output: output ? clip(output) : null,
        diffs: []
      }
    }
    case 'FileChange': {
      const changes = Object.entries(item.changes ?? {}).map(([file, change]) => ({ path: file, kind: { type: change.type }, diff: change.unified_diff ?? change.content ?? '' }))
      return { id: `t:${id}`, kind: 'tool', name: 'fileChange', title: changes.map((change) => change.path).join(', '), input: null, status: status(item), output: null, diffs: changes.map(diffOf) }
    }
    case 'McpToolCall': {
      const args = Args.parse(item.arguments ?? {})
      const first = Object.values(args).find((value) => typeof value === 'string')
      const output = textOf(item.result?.content)
      return {
        id: `t:${id}`,
        kind: 'tool',
        name: `${item.server ?? 'mcp'}.${item.tool ?? 'tool'}`,
        title: typeof first === 'string' ? first.split('\n')[0]! : '',
        input: Object.keys(args).length ? clip(JSON.stringify(args, null, 2), 4000) : null,
        status: status(item),
        output: output ? clip(output) : null,
        diffs: []
      }
    }
    case 'Extension':
      if (item.kind === 'image_gen.generation') {
        const failure = typeof item.failure === 'string' ? item.failure : item.failure?.message ?? null
        return { id: `t:${id}`, kind: 'tool', name: CODEX_IMAGE_GENERATION, title: item.savedPath ?? '', input: item.revisedPrompt ? clip(item.revisedPrompt, 4000) : null, status: item.status === 'failed' || failure !== null ? 'failed' : 'done', output: failure, diffs: [] }
      }
      return item.query ? { id: `t:${id}`, kind: 'tool', name: 'webSearch', title: item.query, input: null, status: 'done', output: null, diffs: [] } : null
    case 'WebSearch':
      return item.query ? { id: `t:${id}`, kind: 'tool', name: 'webSearch', title: item.query, input: null, status: 'done', output: null, diffs: [] } : null
    case 'ImageView':
      return item.path ? { id: `t:${id}`, kind: 'tool', name: CODEX_IMAGE_VIEW, title: item.path.replace(/^file:\/\//, ''), input: null, status: 'done', output: null, diffs: [] } : null
    case 'ContextCompaction':
      return { id: `n:${id}`, kind: 'notice', level: 'info', text: CONTEXT_COMPACTED }
    default:
      return null
  }
}

// A Codex thread as Antumi's chat shows one, from the items each turn reported as they completed;
// a rollout from before Codex reported them shows its messages alone.
export function codexTranscript(texts: readonly string[]): Transcript {
  const lines = texts.flatMap((text) => {
    const parsed = Line.safeParse(parseLine(text))
    return parsed.success ? [parsed.data] : []
  })
  const entries: TranscriptEntry[] = []
  const messages: TranscriptMessage[] = []
  const reported = lines.some((line) => line.type === 'event_msg' && Event.safeParse(line.payload).data?.type === 'item_completed')
  type Turn = { id: string; ref: string | null; startedAt: number; endedAt: number; reply: string | null; state: 'completed' | 'interrupted' | null }
  const turns = new Map<string, Turn>()
  const order: Turn[] = []
  const turnOf = (id: string, at: number): Turn => {
    let turn = turns.get(id)
    if (!turn) {
      turn = { id, ref: null, startedAt: at, endedAt: at, reply: null, state: null }
      turns.set(id, turn)
      order.push(turn)
    }
    turn.endedAt = Math.max(turn.endedAt, at)
    return turn
  }
  let fallback = 0
  for (const line of lines) {
    const at = timeOf(line.timestamp) ?? 0
    if (!reported) {
      const message = Message.safeParse(line.payload)
      if (line.type !== 'response_item' || !message.success) continue
      const ref = `m${++fallback}`
      if (message.data.role === 'assistant') {
        const text = textOf(message.data.content)
        if (text) entries.push({ at, item: { id: `m:${ref}`, kind: 'assistant', text, streaming: false } })
      } else {
        const text = userPrompt(line.payload)
        if (text === null) continue
        entries.push({ at, item: { id: `u:${ref}`, kind: 'user', text, images: [] } })
        messages.push({ at, role: 'user', text, ref })
      }
      continue
    }
    if (line.type !== 'event_msg') continue
    const event = Event.safeParse(line.payload)
    if (!event.success || !event.data.turn_id) continue
    const turn = turnOf(event.data.turn_id, at)
    if (event.data.type === 'task_complete') {
      turn.state = 'completed'
      if (event.data.last_agent_message?.trim()) turn.reply = event.data.last_agent_message
      continue
    }
    if (event.data.type === 'turn_aborted') {
      turn.state = 'interrupted'
      continue
    }
    if (event.data.type !== 'item_completed') continue
    const item = Item.safeParse(event.data.item)
    if (!item.success) continue
    // Item ids count from one in each process that ran the thread: the turn keeps them apart.
    const id = `${turn.id}:${item.data.id}`
    if (item.data.type === 'UserMessage') {
      const text = textOf(item.data.content)
      if (!text) continue
      turn.ref ??= id
      entries.push({ at, item: { id: `u:${id}`, kind: 'user', text, images: [] } })
      messages.push({ at, role: 'user', text, ref: id })
      continue
    }
    const body = itemBody(item.data, id)
    if (body) entries.push({ at, item: body })
    if (body?.kind === 'assistant') turn.reply = body.text
  }
  for (const turn of order) {
    // A turn that never reported ending stopped with its process.
    entries.push({ at: turn.endedAt, item: { id: `turn:${turn.id}`, kind: 'turn', state: turn.state ?? 'interrupted', error: null, durationMs: turn.endedAt - turn.startedAt, usage: null, providerRef: turn.id } })
    if (turn.ref && turn.reply) messages.push({ at: turn.endedAt, role: 'assistant', text: turn.reply, ref: turn.ref })
  }
  return { entries: entries.sort((a, b) => a.at - b.at), messages: messages.sort((a, b) => a.at - b.at) }
}

// The names Codex gave its threads, kept apart from the rollouts and written once it has one.
async function threadNames(home: string): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const Entry = z.looseObject({ id: z.string(), thread_name: z.string().nullish() })
  await readLines(path.join(home, 'session_index.jsonl'), (text) => {
    const entry = Entry.safeParse(parseLine(text))
    if (entry.success && entry.data.thread_name?.trim()) names.set(entry.data.id, entry.data.thread_name.trim())
    return true
  })
  return names
}

async function archivedThreads(home: string): Promise<Set<string>> {
  const files = await findFiles(home, 0, (name) => /^state_\d+\.sqlite$/.test(name))
  const version = (file: string) => Number(/state_(\d+)\.sqlite$/.exec(file)?.[1])
  const latest = files.sort((a, b) => version(b.file) - version(a.file))[0]
  if (!latest) return new Set()
  const db = openTranscriptDb(latest.file)
  try {
    if (!transcriptTables(db).has('threads') || !db.prepare('PRAGMA table_info(threads)').all().some((column) => column.name === 'archived')) return new Set()
    return new Set(db.prepare('SELECT id FROM threads WHERE archived = 1').all().map((row) => z.string().parse(row.id)))
  } finally { db.close() }
}

export function codexTranscripts(home: () => string = () => codexDefaultHome()): TranscriptSource {
  const cache = new SummaryCache()
  return {
    scan: async () => {
      const root = home()
      const [files, titles, archived] = await Promise.all([findFiles(path.join(root, 'sessions'), 3, (name) => ROLLOUT.test(name)), threadNames(root), archivedThreads(root)])
      // A rollout Codex has not packed yet is the one it still writes to.
      const plain = new Set(files.filter((file) => !file.file.endsWith('.zst')).map((file) => file.file))
      const current = files.filter((file) => !file.file.endsWith('.zst') || !plain.has(file.file.slice(0, -'.zst'.length)))
      const summaries = await Promise.all(current.map(async (file) => {
        const summary = await cache.get(file, () => summarizeCodexRollout(file.file, file.mtimeMs, titles))
        // Codex names a thread some time after it starts: the name may be newer than the summary.
        const named = summary ? titles.get(summary.sessionId) : undefined
        return summary && named ? { ...summary, title: named } : summary
      }))
      return summaries.flatMap((summary) => (summary && !archived.has(summary.sessionId) ? [summary] : []))
    },
    read: async (file) => {
      const relative = path.relative(path.join(home(), 'sessions'), file)
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Codex 会话已归档或不在活动会话目录中')
      const texts: string[] = []
      await readLines(file, (text) => {
        texts.push(text)
        return true
      })
      const first = Line.safeParse(parseLine(texts[0] ?? ''))
      const thread = first.success && first.data.type === 'session_meta' ? codexUserThread(first.data.payload) : null
      if (thread && (await archivedThreads(home())).has(thread.id)) throw new Error('Codex 会话已归档，不能导入')
      return codexTranscript(texts)
    }
  }
}
