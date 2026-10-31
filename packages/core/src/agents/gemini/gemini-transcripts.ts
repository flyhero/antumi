import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileTranscriptSource, type FileTranscriptParser } from '../../file-transcript-source'
import { TranscriptBuilder, transcriptImages } from '../../transcript-builder'
import { array, contentText, json, object, string, timestamp } from '../../transcript-values'

export const geminiHistoryHome = (env: NodeJS.ProcessEnv = process.env, home = os.homedir()) => path.join(env.GEMINI_CLI_HOME || home, '.gemini')

export function geminiTranscripts(home: () => string = () => geminiHistoryHome()) {
  const parse: FileTranscriptParser = async (lines, file, modifiedAt, attachments) => {
    if (path.basename(path.dirname(file)) !== 'chats' || !path.basename(file).startsWith('session-')) return null
    let meta: Record<string, unknown> = {}
    const messages = new Map<string, Record<string, unknown>>()
    const absorb = (values: unknown) => array(values).forEach((value) => {
      const message = object(value)
      if (string(message.id)) messages.set(string(message.id), message)
    })
    for (const line of lines) {
      const row = object(json(line))
      if (string(row.$rewindTo)) {
        const ids = [...messages.keys()]
        const cut = ids.indexOf(string(row.$rewindTo))
        ids.slice(Math.max(cut, 0)).forEach((id) => messages.delete(id))
      } else if (string(row.id)) messages.set(string(row.id), row)
      else if (row.$set) {
        const set = object(row.$set)
        meta = { ...meta, ...set }
        if (Array.isArray(set.messages)) { messages.clear(); absorb(set.messages) }
      } else if (string(row.sessionId)) { meta = { ...meta, ...row }; absorb(row.messages) }
    }
    if (!string(meta.sessionId) || meta.kind === 'subagent') return null
    const projectDir = path.dirname(path.dirname(file))
    let cwd = string(meta.cwd) || string(array(meta.directories)[0])
    if (!cwd) cwd = (await readFile(path.join(projectDir, '.project_root'), 'utf8').catch(() => '')).trim()
    if (!cwd) {
      const projects = object(json(await readFile(path.join(home(), 'projects.json'), 'utf8').catch(() => '{}')))
      const alias = path.basename(projectDir)
      for (const [dir, value] of Object.entries(object(projects.projects))) {
        if (value === alias || object(value).name === alias) { cwd = dir; break }
      }
    }
    if (!cwd) return null
    const builder = new TranscriptBuilder()
    for (const [id, message] of messages) {
      const at = timestamp(message.timestamp, timestamp(meta.startTime, modifiedAt))
      if (message.type === 'user') {
        const text = contentText(message.content) || contentText(message.message)
        if (!text.trimStart().startsWith('<session_context>')) builder.user(id, text, at, await transcriptImages(message.content, cwd, attachments, builder, at))
      } else if (message.type === 'gemini' || message.type === 'assistant') {
        for (const [index, thought] of array(message.thoughts).entries()) builder.assistant(`${id}:thought:${index}`, string(object(thought).text) || string(object(thought).description), at, true)
        builder.assistant(id, contentText(message.content), at)
        for (const raw of array(message.toolCalls)) {
          const tool = object(raw)
          builder.tool(string(tool.id), string(tool.name), tool.args, tool.result, at, string(tool.status) || (tool.result != null ? 'completed' : 'pending'))
        }
      }
    }
    return { sessionId: string(meta.sessionId), cwd, title: string(meta.summary), nativeSessionId: null,
      startedAt: timestamp(meta.startTime, modifiedAt), transcript: builder.build() }
  }
  return fileTranscriptSource(home, (name) => /^session-.*\.jsonl?$/.test(name), parse, undefined,
    (file) => [path.join(home(), 'projects.json'), path.join(path.dirname(path.dirname(file)), '.project_root')])
}
