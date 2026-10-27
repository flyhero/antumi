import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { Bookmark, MAX_BOOKMARKS, type BookmarkFields, type BookmarkImport } from '@antumi/protocol'
import { Rejection } from './rejection'

const SELECT = 'SELECT id, title, url, folder, created_at AS createdAt FROM bookmarks ORDER BY created_at, rowid'

// Rows live in `bookmarks`, which TaskStore's migrations create.
export class BookmarkStore {
  private readonly db: DatabaseSync

  constructor(
    file: string,
    private readonly emit: (bookmarks: Bookmark[]) => void,
    private readonly now: () => number = Date.now
  ) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  close(): void {
    this.db.close()
  }

  list(): Bookmark[] {
    return this.db.prepare(SELECT).all().map((row) => Bookmark.parse(row))
  }

  // An address kept already is not kept twice: the star on a page the user bookmarked elsewhere
  // just shows it is.
  add(fields: BookmarkFields): Bookmark {
    const kept = this.byUrl(fields.url)
    if (kept) return kept
    if (this.count() >= MAX_BOOKMARKS) throw new Rejection('bookmarks_full', `最多保存 ${MAX_BOOKMARKS} 个收藏`)
    this.insert(fields, this.now())
    this.changed()
    const added = this.byUrl(fields.url)
    if (!added) throw new Rejection('bookmark_not_found', '这个收藏已经被删除了')
    return added
  }

  // All in one go, so the clients hear of it once; what is kept already, or does not fit, is skipped.
  import(bookmarks: readonly BookmarkFields[]): BookmarkImport {
    let added = 0
    const at = this.now()
    this.db.exec('BEGIN')
    try {
      let room = MAX_BOOKMARKS - this.count()
      for (const bookmark of bookmarks) {
        if (room <= 0) break
        if (this.insert(bookmark, at)) {
          added += 1
          room -= 1
        }
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    if (added > 0) this.changed()
    return { added, skipped: bookmarks.length - added }
  }

  // Deleting one that is already gone is not an error: another window got there first.
  delete(id: string): void {
    if (this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id).changes > 0) this.changed()
  }

  private insert({ title, url, folder }: BookmarkFields, at: number): boolean {
    return this.db
      .prepare('INSERT OR IGNORE INTO bookmarks (id, title, url, folder, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), title, url, folder, at).changes > 0
  }

  private byUrl(url: string): Bookmark | null {
    const row = this.db.prepare('SELECT id, title, url, folder, created_at AS createdAt FROM bookmarks WHERE url = ?').get(url)
    return row ? Bookmark.parse(row) : null
  }

  private count(): number {
    return z.object({ count: z.number() }).parse(this.db.prepare('SELECT count(*) AS count FROM bookmarks').get()).count
  }

  private changed(): void {
    this.emit(this.list())
  }
}
