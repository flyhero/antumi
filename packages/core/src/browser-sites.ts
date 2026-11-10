import { DatabaseSync } from 'node:sqlite'
import type { BrowserSite } from '@antumi/protocol'

// Sites the user allowed the agents' browser in every conversation, by exact host name: allowing
// www.zhihu.com leaves zhuanlan.zhihu.com to ask. Rows live in `browser_sites`, which TaskStore's
// migrations create.
export class BrowserSiteStore {
  private readonly db: DatabaseSync

  constructor(file: string, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  close(): void {
    this.db.close()
  }

  allows(host: string): boolean {
    return this.db.prepare('SELECT 1 FROM browser_sites WHERE host = ?').get(host) !== undefined
  }

  allow(host: string): void {
    this.db.prepare('INSERT INTO browser_sites (host, allowed_at) VALUES (?, ?) ON CONFLICT(host) DO NOTHING').run(host, this.now())
  }

  forget(host: string): void {
    this.db.prepare('DELETE FROM browser_sites WHERE host = ?').run(host)
  }

  // Latest first.
  list(): BrowserSite[] {
    return this.db.prepare('SELECT host, allowed_at FROM browser_sites ORDER BY allowed_at DESC, host').all()
      .map((row) => ({ host: String(row.host), allowedAt: Number(row.allowed_at) }))
  }
}
