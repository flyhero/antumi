import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileTranscriptSource, type FileTranscriptParser } from '../../file-transcript-source'
import { TranscriptBuilder, transcriptImages } from '../../transcript-builder'
import { array, contentText, json, object, string, timestamp } from '../../transcript-values'

export const kimiHome = (env: NodeJS.ProcessEnv = process.env, home = os.homedir()) => env.KIMI_CODE_HOME || path.join(home, '.kimi-code')

export function kimiTranscripts(home: () => string = () => kimiHome()) {
  const parse: FileTranscriptParser = async (lines, file, modifiedAt, attachments) => {
    if (path.basename(path.dirname(file)) !== 'main') return null
    const sessionDir = path.resolve(file, '../../..')
    const sessionId = path.basename(sessionDir)
    const state = object(json(await readFile(path.join(sessionDir, 'state.json'), 'utf8')))
    const index = (await readFile(path.join(home(), 'session_index.jsonl'), 'utf8')).split('\n').map((line) => object(json(line)))
    const indexed = index.findLast((row) => row.sessionId === sessionId && string(row.workDir))
    const cwd = string(indexed?.workDir)
    if (!cwd) return null
    const builder = new TranscriptBuilder()
    for (const [position, line] of lines.entries()) {
      const row = object(json(line))
      const at = timestamp(row.time, modifiedAt)
      if (row.type === 'turn.prompt' || row.type === 'turn.steer') {
        const origin = object(row.origin)
        if (origin.kind && origin.kind !== 'user' && !(origin.kind === 'skill_activation' && origin.trigger === 'user-slash')) continue
        const input = array(row.input).filter((part) => !object(object(part).meta).source)
        const prompt = origin.kind === 'skill_activation' ? `/${string(origin.skillName)} ${string(origin.skillArgs)}`.trim() : contentText(input)
        builder.user(string(row.promptId) || string(row.messageId) || `prompt:${position}`, prompt, at, await transcriptImages(input, cwd, attachments, builder, at))
      } else if (row.type === 'context.append_loop_event') {
        const event = object(row.event)
        const part = object(event.part)
        if (event.type === 'content.part') builder.assistant(string(event.uuid) || `part:${position}`, string(part.text) || string(part.think), at, part.type === 'think')
        else if (event.type === 'tool.call') builder.tool(string(event.toolCallId), string(event.name), event.args, null, at, 'pending')
        else if (event.type === 'tool.result') {
          const result = object(event.result)
          builder.result(string(event.toolCallId), result.output, at, result.isError === true,
            await transcriptImages(result.output, cwd, attachments, builder, at))
        }
      } else if (row.type === 'turn.end') builder.finish(row.status === 'failed' ? 'failed' : row.status === 'interrupted' ? 'interrupted' : 'completed')
    }
    return { sessionId, cwd, title: string(state.title), named: Boolean(string(state.title)), startedAt: timestamp(state.createdAt, modifiedAt), transcript: builder.build() }
  }
  return fileTranscriptSource(() => path.join(home(), 'sessions'), (name) => name === 'wire.jsonl', parse, undefined,
    (file) => [path.join(home(), 'session_index.jsonl'), path.join(path.resolve(file, '../../..'), 'state.json')])
}
