import { readFile, stat } from 'node:fs/promises'
import type { AttachmentStore } from './attachment-store'
import { findFiles, readLines, SummaryCache, titleOf, type Transcript, type TranscriptSource, type TranscriptSummary } from './agent-transcripts'
import { TranscriptBuilder } from './transcript-builder'
import { json } from './transcript-values'

export type ParsedTranscript = {
  sessionId: string
  cwd: string
  title?: string
  named?: boolean
  startedAt: number
  nativeSessionId?: string | null
  clockless?: boolean
  transcript: Transcript
}
export type FileTranscriptParser = (lines: string[], file: string, modifiedAt: number, attachments?: AttachmentStore) => Promise<ParsedTranscript | null>

export async function transcriptLines(file: string, limit = Infinity): Promise<string[]> {
  if (file.endsWith('.json')) return [await readFile(file, 'utf8')]
  const lines: string[] = []
  let failure: unknown
  await readLines(file, (line) => { lines.push(line); return true }, limit, (error) => { failure = error })
  if (failure) throw failure
  return lines
}

export function fileTranscriptSource(root: () => string, wanted: (name: string) => boolean, parse: FileTranscriptParser, select: (files: Awaited<ReturnType<typeof findFiles>>) => Awaited<ReturnType<typeof findFiles>> = (files) => files, dependencies: (file: string) => readonly string[] = () => []): TranscriptSource {
  const cache = new SummaryCache()
  const warnings: string[] = []
  return {
    diagnostics: () => [...warnings],
    async scan() {
      warnings.length = 0
      try { await stat(root()) } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
        throw error
      }
      const files = select(await findFiles(root(), 5, wanted, (name) => name === 'subagents'))
      const result: TranscriptSummary[] = []
      // Bound decompression and JSON parsing concurrency even for a large history.
      for (const file of files) {
        try {
          const revision = (await Promise.all(dependencies(file.file).map(async (dependency) => {
            const info = await stat(dependency).catch(() => null)
            return `${info?.mtimeMs}:${info?.size}`
          }))).join('|')
          const summary = await cache.get({ ...file, revision }, async () => {
            const parsed = await parse(await transcriptLines(file.file, 256 * 1024), file.file, file.mtimeMs)
            const prompt = parsed?.transcript.messages.find((message) => message.role === 'user')?.text
            if (!parsed || !parsed.cwd || !parsed.transcript.entries.some((entry) => entry.item.kind === 'user')) return null
            return { sessionId: parsed.sessionId, cwd: parsed.cwd, title: parsed.title?.trim() || titleOf(prompt ?? '会话'), named: parsed.named ?? false,
              firstPrompt: titleOf(prompt ?? '[图片]', 200), startedAt: parsed.startedAt, modifiedAt: file.mtimeMs, file: file.file,
              ...(parsed.nativeSessionId !== undefined ? { nativeSessionId: parsed.nativeSessionId } : {}), ...(parsed.clockless ? { clockless: true } : {}) }
          })
          if (summary) result.push(summary)
        } catch { warnings.push(`无法读取会话记录：${file.file}`) }
      }
      return result
    },
    async read(file, attachments) {
      const info = await stat(file)
      const lines = await transcriptLines(file)
      const parsed = await parse(lines, file, info.mtimeMs, attachments)
      if (!parsed) throw new Error('会话记录为空或格式不受支持')
      if (lines.some((line) => line.trim() && json(line) === null)) {
        const warning = new TranscriptBuilder()
        warning.notice('damaged-records', '来源中有无法解析的记录，已保留其他可读取的历史。', parsed.startedAt)
        parsed.transcript.entries.push(...warning.transcript.entries)
      }
      return parsed.transcript
    }
  }
}
