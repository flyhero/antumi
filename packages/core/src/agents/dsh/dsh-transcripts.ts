import os from 'node:os'
import path from 'node:path'
import { fileTranscriptSource, type FileTranscriptParser } from '../../file-transcript-source'
import { TranscriptBuilder, transcriptImages } from '../../transcript-builder'
import { array, contentText, json, number, object, string, timestamp } from '../../transcript-values'

export function dshSessionsRoot(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  const configured = env.DSH_HOME?.trim() ? env.DSH_HOME : path.join(home, '.dsh')
  const root = configured.startsWith('~/') ? path.join(home, configured.slice(2)) : configured
  return path.join(root, 'sessions')
}

function attachmentParts(content: unknown, file: string): unknown[] {
  return array(content).map((raw) => {
    const part = object(raw)
    const hex = /^sha256:([\da-f]{64})$/i.exec(string(object(part.attachment).attachmentId))?.[1]
    return part.type === 'image' && hex ? { ...part, path: path.join(path.resolve(file, '../../../..'), 'attachments', 'v1', 'objects', hex.slice(0, 2), hex) } : part
  })
}

export const parseDshTranscript: FileTranscriptParser = async (lines, _file, modifiedAt, attachments) => {
  const records = lines.map((line) => object(json(line)))
  const header = records[0]
  if (!header || header.type !== 'session' || !string(header.id) || !string(header.cwd) || header.origin === 'subagent' || (number(header.delegationDepth) ?? 0) > 0) return null
  if (![0, 1, 2, 3, 4].includes(number(header.version) ?? -1)) throw new Error('DeepSeek Harness 会话版本不受支持')
  const cwd = string(header.cwd)
  const builder = new TranscriptBuilder()
  for (const row of records.slice(1)) {
    const data = object(row.data)
    if (['user/message', 'assistant/message', 'tool/call', 'tool/result'].includes(string(row.type)) && !Number.isSafeInteger(number(row.seq))) throw new Error('DeepSeek Harness 会话记录缺少序号')
    const at = timestamp(row.time, timestamp(header.createdAt, modifiedAt))
    const id = String(row.seq)
    const message = object(data.message)
    if (row.type === 'user/message') {
      if (object(data.source).kind !== 'user') continue
      const parts = attachmentParts(data.content, _file)
      builder.user(id, contentText(data.content), at, await transcriptImages(parts, cwd, attachments, builder, at))
    } else if (row.type === 'assistant/message') {
      for (const [index, raw] of array(message.content ?? data.content).entries()) {
        const part = object(raw)
        if (part.type === 'text') builder.assistant(`${id}:${index}`, string(part.text), at)
        else if (part.type === 'reasoning' || part.type === 'thinking') builder.assistant(`${id}:${index}`, string(part.text) || string(part.thinking), at, true)
        else if (part.type === 'tool-call') builder.tool(string(part.id) || string(part.callId), string(part.name), json(part.arguments) ?? part.arguments, null, at, 'pending')
      }
    } else if (row.type === 'tool/call') builder.tool(string(data.callId), string(data.name), json(data.arguments) ?? data.arguments, null, at, 'pending')
    else if (row.type === 'tool/result') builder.result(string(message.toolCallId) || string(message.callId) || string(data.callId), contentText(message.content ?? data.content) || message.content || data.content, at, message.isError === true || data.isError === true,
      await transcriptImages(attachmentParts(message.content ?? data.content, _file), cwd, attachments, builder, at))
    else if (row.type === 'turn/end') builder.finish(data.reason === 'interrupted' || data.interrupted === true ? 'interrupted' : data.reason === 'error' ? 'failed' : 'completed')
  }
  return { sessionId: string(header.id), cwd, startedAt: timestamp(header.createdAt, modifiedAt), transcript: builder.build() }
}

export function dshTranscripts(root: () => string = () => dshSessionsRoot()) {
  return fileTranscriptSource(root, (name) => /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(name), parseDshTranscript, (files) => {
    const generations = new Map<string, typeof files[number]>()
    for (const file of files) {
      const previous = generations.get(path.dirname(file.file))
      const generation = (name: string) => Number(/\.v(\d+)\./.exec(name)?.[1] ?? 0)
      if (!previous || generation(file.file) > generation(previous.file) || (generation(file.file) === generation(previous.file) && file.file.endsWith('.jsonl'))) generations.set(path.dirname(file.file), file)
    }
    return [...generations.values()]
  })
}
