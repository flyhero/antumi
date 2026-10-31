import type { TranscriptSource } from '../../agent-transcripts'
import path from 'node:path'
import { cursorCliTranscripts } from './cursor-cli-transcripts'
import { cursorDesktopTranscripts } from './cursor-desktop-transcripts'

export function cursorTranscripts(cli = cursorCliTranscripts(), desktop = cursorDesktopTranscripts()): TranscriptSource {
  let warnings: string[] = []
  return {
    diagnostics: () => [...warnings],
    async scan() {
      warnings = []
      const found = await Promise.all([cli, desktop].map(async (source) => {
        try {
          const sessions = await source.scan()
          warnings.push(...(source.diagnostics?.() ?? []))
          return sessions
        } catch { warnings.push(source === desktop ? '无法读取 Cursor 桌面历史，请检查权限及数据库版本。' : '无法读取 Cursor CLI 历史。'); return [] }
      }))
      return found.flat()
    },
    read: (file, attachments) => (path.basename(file) === 'store.db' ? cli : desktop).read(file, attachments)
  }
}
