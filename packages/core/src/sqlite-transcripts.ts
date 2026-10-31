import { DatabaseSync } from 'node:sqlite'
import { stat } from 'node:fs/promises'
import { object, string } from './transcript-values'

export function openTranscriptDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file, { readOnly: true })
  db.exec('PRAGMA busy_timeout=1000; PRAGMA query_only=ON; BEGIN')
  return db
}

export function transcriptTables(db: DatabaseSync): Set<string> {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => string(object(row).name)))
}

export function transcriptLocator(file: string): { database: string; id: string } {
  const split = file.lastIndexOf('#')
  if (split < 0) throw new Error('invalid transcript locator')
  return { database: file.slice(0, split), id: file.slice(split + 1) }
}

export async function transcriptDbExists(file: string): Promise<boolean> {
  try { return (await stat(file)).isFile() } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

export async function transcriptDbModifiedAt(file: string): Promise<number> {
  const main = await stat(file)
  const wal = await stat(`${file}-wal`).catch(() => null)
  return Math.max(main.mtimeMs, wal?.mtimeMs ?? 0)
}
