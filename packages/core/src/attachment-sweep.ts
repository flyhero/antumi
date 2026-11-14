import { createReadStream } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { ATTACHMENT_ID_PATTERN } from '@antumi/protocol'

// Letting go of stored images nothing refers to any more (docs/ARCHITECTURE.md, 附件). A reference is
// any mention of an image's id in what core keeps: a row of any table, or a conversation's logs. What
// only a client holds, a draft's picture not sent yet, core cannot see, so an image goes only once it
// has been left alone a while; storing the same picture again marks it fresh (AttachmentStore).

// A drafted picture not sent yet is out of core's sight: the user sweeping keeps a week's worth, a
// deletion freeing what it used only the last hour's, the same picture stored again counting as new.
export const SWEEP_GRACE_MS = 7 * 86_400_000
export const FREED_ATTACHMENT_GRACE_MS = 60 * 60_000

const MENTION = new RegExp(ATTACHMENT_ID_PATTERN.source.replace(/^\^|\$$/g, ''), 'g')
const EXTENSIONS = ['.png', '.jpg', '.gif', '.webp']
// A conversation's folder also holds a workspace Antumi made and MCP configs: only its logs are read.
const LOG_FOLDERS = ['stages', 'wire', 'handoffs']

export type AttachmentUsage = { files: number; bytes: number; unusedFiles: number; unusedBytes: number }
export type SweepResult = { files: number; bytes: number }

export type AttachmentSweeperOptions = {
  // The attachment store's folder, the sessions folder, and the database file.
  attachments: string
  sessions: string
  database: string
  // The conversations there are: a pasted-text folder for any other is left over.
  conversations: () => readonly string[]
  now?: () => number
}

function mentions(text: string, into: Set<string>): void {
  for (const match of text.matchAll(MENTION)) into.add(match[0])
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(full)
    return entry.isFile() ? [full] : []
  }))
  return found.flat()
}

// Line by line: a wire log can run to hundreds of megabytes.
async function mentionsIn(file: string, into: Set<string>): Promise<void> {
  const lines = readline.createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Number.POSITIVE_INFINITY })
  for await (const line of lines) {
    if (line.includes('.png') || line.includes('.jpg') || line.includes('.gif') || line.includes('.webp')) mentions(line, into)
  }
}

export class AttachmentSweeper {
  private readonly now: () => number
  // One pass at a time: deletions in a row wait for the pass before them.
  private running: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: AttachmentSweeperOptions) {
    this.now = options.now ?? Date.now
  }

  // What a conversation's logs mention, read before they go.
  async mentionedBy(conversationId: string): Promise<Set<string>> {
    const found = new Set<string>()
    for (const folder of LOG_FOLDERS) {
      for (const file of await files(path.join(this.options.sessions, conversationId, folder))) await mentionsIn(file, found)
    }
    return found
  }

  async usage(graceMs: number): Promise<AttachmentUsage> {
    return this.serially(async () => {
      const stored = await this.stored()
      const unused = await this.unused(stored, graceMs)
      const pasted = await this.leftoverPastes(graceMs)
      return {
        files: stored.length,
        bytes: stored.reduce((sum, file) => sum + file.size, 0),
        unusedFiles: unused.length + pasted.length,
        unusedBytes: [...unused, ...pasted].reduce((sum, file) => sum + file.size, 0)
      }
    })
  }

  // Removes what nothing refers to and nobody touched for `graceMs`; with `only`, just those images,
  // as after a conversation or task that used them is deleted.
  async sweep(graceMs: number, only?: ReadonlySet<string>): Promise<SweepResult> {
    return this.serially(async () => {
      const stored = (await this.stored()).filter((file) => !only || only.has(file.id))
      if (only && stored.length === 0) return { files: 0, bytes: 0 }
      const gone = [...await this.unused(stored, graceMs), ...(only ? [] : await this.leftoverPastes(graceMs))]
      await Promise.all(gone.map((file) => rm(file.path, { recursive: true, force: true })))
      return { files: gone.length, bytes: gone.reduce((sum, file) => sum + file.size, 0) }
    })
  }

  private serially<T>(work: () => Promise<T>): Promise<T> {
    const next = this.running.then(work, work)
    this.running = next.catch(() => {})
    return next
  }

  private async stored(): Promise<{ id: string; path: string; size: number; touchedAt: number }[]> {
    const names = await readdir(this.options.attachments).catch(() => [])
    const found = await Promise.all(names.filter((name) => ATTACHMENT_ID_PATTERN.test(name)).map(async (name) => {
      const file = path.join(this.options.attachments, name)
      const info = await stat(file).catch(() => null)
      return info?.isFile() ? [{ id: name, path: file, size: info.size, touchedAt: info.mtimeMs }] : []
    }))
    return found.flat()
  }

  private async unused<T extends { id: string; touchedAt: number }>(stored: readonly T[], graceMs: number): Promise<T[]> {
    const settled = stored.filter((file) => this.now() - file.touchedAt >= graceMs)
    if (settled.length === 0) return []
    const referenced = await this.references()
    return settled.filter((file) => !referenced.has(file.id))
  }

  // Every id core's data mentions. The database is read row by row through SQL, not as a file: a
  // deleted row lingers in its pages, and would keep a deleted task's images forever.
  private async references(): Promise<Set<string>> {
    const found = new Set<string>()
    const db = new DatabaseSync(this.options.database, { readOnly: true })
    try {
      const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all()
      for (const table of tables) {
        const name = String(table.name)
        const quoted = `"${name.replace(/"/g, '""')}"`
        const columns = db.prepare(`PRAGMA table_info(${quoted})`).all().map((column) => String(column.name))
        for (const column of columns) {
          const field = `"${column.replace(/"/g, '""')}"`
          const where = EXTENSIONS.map(() => `instr(CAST(${field} AS TEXT), ?) > 0`).join(' OR ')
          for (const row of db.prepare(`SELECT CAST(${field} AS TEXT) AS value FROM ${quoted} WHERE ${where}`).iterate(...EXTENSIONS)) {
            if (typeof row.value === 'string') mentions(row.value, found)
          }
        }
      }
    } finally {
      db.close()
    }
    const conversations = await readdir(this.options.sessions).catch(() => [])
    for (const conversation of conversations) {
      for (const folder of LOG_FOLDERS) {
        for (const file of await files(path.join(this.options.sessions, conversation, folder))) await mentionsIn(file, found)
      }
    }
    return found
  }

  // Pasted text kept for a conversation that no longer exists.
  private async leftoverPastes(graceMs: number): Promise<{ path: string; size: number }[]> {
    const root = path.join(this.options.attachments, 'pasted')
    const live = new Set(this.options.conversations())
    const folders = await readdir(root, { withFileTypes: true }).catch(() => [])
    const found = await Promise.all(folders.filter((entry) => entry.isDirectory() && !live.has(entry.name)).map(async (entry) => {
      const folder = path.join(root, entry.name)
      const inside = await files(folder)
      const infos = await Promise.all(inside.map((file) => stat(file).catch(() => null)))
      const newest = Math.max(0, ...infos.map((info) => info?.mtimeMs ?? 0))
      if (this.now() - newest < graceMs) return []
      return [{ path: folder, size: infos.reduce((sum, info) => sum + (info?.size ?? 0), 0) }]
    }))
    return found.flat()
  }
}
