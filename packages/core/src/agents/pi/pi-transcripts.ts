import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { CONTEXT_COMPACTED } from '@antumi/protocol'
import { fileTranscriptSource, type FileTranscriptParser } from '../../file-transcript-source'
import { TranscriptBuilder, transcriptImages } from '../../transcript-builder'
import { array, contentText, json, object, string, timestamp } from '../../transcript-values'

export function piSessionsRoot(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  const expand = (value: string) => value.startsWith('~/') ? path.join(home, value.slice(2)) : value
  const agent = expand(env.PI_CODING_AGENT_DIR || path.join(home, '.pi', 'agent'))
  if (env.PI_CODING_AGENT_SESSION_DIR) return expand(env.PI_CODING_AGENT_SESSION_DIR)
  try {
    const sessionDir = string(object(json(readFileSync(path.join(agent, 'settings.json'), 'utf8'))).sessionDir)
    if (sessionDir && path.isAbsolute(expand(sessionDir))) return expand(sessionDir)
  } catch { /* No custom session root. */ }
  return path.join(agent, 'sessions')
}

export const parsePiTranscript: FileTranscriptParser = async (lines, file, modifiedAt, attachments) => {
  const records = lines.map((line) => object(json(line)))
  const header = records.find((record) => record.type === 'session')
  if (!header || !string(header.id) || !string(header.cwd)) return null
  const entries = records.filter((record) => record.type !== 'session' && string(record.id))
  const byId = new Map(entries.map((entry) => [string(entry.id), entry]))
  const chain: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let entry = entries.at(-1)
  while (entry && !seen.has(string(entry.id))) {
    chain.push(entry); seen.add(string(entry.id))
    entry = byId.get(string(entry.parentId))
  }
  const builder = new TranscriptBuilder()
  const cwd = string(header.cwd)
  for (const record of chain.reverse()) {
    const id = string(record.id)
    const at = timestamp(record.timestamp, timestamp(header.timestamp, modifiedAt))
    if (record.type === 'bashExecution') {
      builder.user(`bash:${id}`, `! ${string(record.command)}`, at)
      builder.tool(id, 'bash', { command: record.command }, record.output, at, record.cancelled ? 'interrupted' : record.exitCode ? 'failed' : 'completed')
      builder.finish(record.cancelled ? 'interrupted' : 'completed')
    } else if (record.type === 'compaction') builder.put({ at, item: { id: `compact:${id}`, kind: 'notice', level: 'info', text: CONTEXT_COMPACTED } })
    else if (record.type === 'branch_summary' || (record.type === 'custom_message' && record.display !== false)) {
      const text = string(record.summary) || contentText(record.content)
      if (text) builder.put({ at, item: { id: `context:${id}`, kind: 'notice', level: 'info', text } })
    }
    if (record.type !== 'message') continue
    const message = object(record.message)
    if (message.role === 'user') builder.user(id, contentText(message.content), at, await transcriptImages(message.content, cwd, attachments, builder, at))
    else if (message.role === 'assistant') {
      for (const [index, raw] of array(message.content).entries()) {
        const part = object(raw)
        if (part.type === 'text') builder.assistant(`${id}:${index}`, string(part.text), at)
        else if (part.type === 'thinking') builder.assistant(`${id}:${index}`, string(part.thinking), at, true)
        else if (part.type === 'toolCall') builder.tool(string(part.id), string(part.name), part.arguments, null, at, 'pending')
      }
      if (message.stopReason === 'error' || message.stopReason === 'aborted') {
        if (string(message.errorMessage)) builder.notice(`error:${id}`, string(message.errorMessage), at)
        builder.finish(message.stopReason === 'error' ? 'failed' : 'interrupted')
      }
    } else if (message.role === 'toolResult') builder.result(string(message.toolCallId), contentText(message.content), at, message.isError === true,
      await transcriptImages(message.content, cwd, attachments, builder, at))
  }
  let name = records.findLast((record) => record.type === 'session_info' && string(record.name).trim())
  if (!name && !attachments) {
    const handle = await open(file, 'r').catch(() => null)
    if (handle) {
      try {
        const info = await handle.stat()
        if (info.size > 256 * 1024) {
          const tail = Buffer.alloc(64 * 1024)
          const { bytesRead } = await handle.read(tail, 0, tail.length, Math.max(0, info.size - tail.length))
          name = tail.subarray(0, bytesRead).toString('utf8').split('\n').map((line) => object(json(line))).findLast((record) => record.type === 'session_info' && string(record.name).trim())
        }
      } finally { await handle.close() }
    }
  }
  return { sessionId: string(header.id), cwd, nativeSessionId: file, title: name ? string(name.name) : undefined, named: Boolean(name),
    startedAt: timestamp(header.timestamp, modifiedAt), transcript: builder.build() }
}

export const piTranscripts = (root: () => string = () => piSessionsRoot()) => fileTranscriptSource(root, (name) => name.endsWith('.jsonl'), parsePiTranscript)
