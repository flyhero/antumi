import { DatabaseSync } from 'node:sqlite'

// Overrides include false so unmarking a default survives a restart.
export class GitFavoriteStore {
  private readonly db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  close(): void { this.db.close() }

  list(repository: string): Set<string> {
    const refs = new Set(['refs/heads/main', 'refs/heads/master'])
    for (const row of this.db.prepare('SELECT ref, favorite FROM git_favorites WHERE repository = ?').all(repository)) {
      if (row.favorite === 1) refs.add(String(row.ref))
      else refs.delete(String(row.ref))
    }
    return refs
  }

  set(repository: string, ref: string, favorite: boolean): void {
    this.db.prepare('INSERT INTO git_favorites(repository, ref, favorite) VALUES (?, ?, ?) ON CONFLICT(repository, ref) DO UPDATE SET favorite = excluded.favorite')
      .run(repository, ref, favorite ? 1 : 0)
  }

  rename(repository: string, ref: string, next: string): void {
    if (ref === next) return
    const favorite = this.list(repository).has(ref)
    this.db.exec('BEGIN')
    try {
      this.set(repository, next, favorite)
      this.set(repository, ref, false)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
