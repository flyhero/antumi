import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { BROWSER_HISTORY_DAYS, BrowserHistoryEntry, MAX_BROWSER_HISTORY, type BrowserTab } from '@antumi/protocol'

const DAY_MS = 24 * 60 * 60 * 1000
// A page the agent's click or navigation started can land after its call returns (a redirect, a
// script's own navigation): until then it is still the agent's.
const AGENT_GRACE_MS = 3_000
// Who opened a row's page, as stored: a conversation's id, or '' for the user.
const USER = ''
const COLUMNS = "url, nullif(opened_by, '') AS conversationId, title, visited_at AS visitedAt, visits"

type HistoryTab = Pick<BrowserTab, 'id' | 'url' | 'title' | 'loading' | 'userOwned' | 'agentActing' | 'userDriving'>
type Seen = { group: string | null; url: string; title: string; by: string; actedAt: number }

// Rows live in `browser_history`, which TaskStore's migrations create, one per address and who
// opened it: each navigation goes to the agent whose call took the tab there, else to the user
// at the wheel, else to the tab's owner (a tab the user lent a conversation stays the user's).
export class BrowserHistoryStore {
  private readonly db: DatabaseSync
  // What each tab showed when last heard of, so a tab's update is a visit only when it went
  // somewhere; its title is the one taken for the page, which is only ever a loaded page's: while
  // a tab loads the next page, its title can already be that page's and its address not yet.
  private readonly seen = new Map<string, Seen>()

  constructor(
    file: string,
    private readonly emit: () => void,
    private readonly now: () => number = Date.now
  ) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  close(): void {
    this.db.close()
  }

  // Every tab of one owner (a conversation, or null for the user's), as the browser just told it.
  record(conversationId: string | null, tabs: readonly HistoryTab[]): void {
    for (const [id, seen] of this.seen) if (seen.group === conversationId && !tabs.some((tab) => tab.id === id)) this.seen.delete(id)
    const at = this.now()
    let changed = false
    for (const tab of tabs) {
      const was = this.seen.get(tab.id)
      const actedAt = tab.agentActing ? at : (was?.actedAt ?? -Infinity)
      const moved = was?.url !== tab.url
      const by = moved ? this.opener(conversationId, tab, at - actedAt < AGENT_GRACE_MS) : was.by
      const title = tab.loading ? '' : tab.title
      this.seen.set(tab.id, { group: conversationId, url: tab.url, title: title || (moved ? '' : was.title), by, actedAt })
      if (!/^https?:\/\//i.test(tab.url)) continue
      if (moved) {
        this.visit(tab.url, by, title, at)
        changed = true
      } else if (title && was.title !== title) {
        this.db.prepare('UPDATE browser_history SET title = ? WHERE url = ? AND opened_by = ?').run(title, tab.url, by)
        changed = true
      }
    }
    if (changed) this.emit()
  }

  private opener(conversationId: string | null, tab: HistoryTab, agentLately: boolean): string {
    if (conversationId === null) return USER
    if (agentLately) return conversationId
    if (tab.userDriving || tab.userOwned) return USER
    return conversationId
  }

  search(query: string, agents: boolean, limit: number, order: 'recent' | 'frequent' = 'recent'): BrowserHistoryEntry[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const where = [...(agents ? [] : ["opened_by = ''"]), ...words.map(() => "instr(lower(title || ' ' || url), ?) > 0")].join(' AND ')
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM browser_history ${where ? `WHERE ${where}` : ''} ORDER BY ${order === 'frequent' ? 'visits DESC, ' : ''}visited_at DESC, rowid DESC LIMIT ?`)
      .all(...words, limit)
      .map((row) => BrowserHistoryEntry.parse(row))
  }

  delete(url: string, conversationId: string | null): void {
    if (this.db.prepare('DELETE FROM browser_history WHERE url = ? AND opened_by = ?').run(url, conversationId ?? USER).changes > 0) this.emit()
  }

  clear(): void {
    if (this.db.prepare('DELETE FROM browser_history').run().changes > 0) this.emit()
  }

  private visit(url: string, by: string, title: string, at: number): void {
    this.db
      .prepare(`INSERT INTO browser_history (url, opened_by, title, visited_at, visits) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT (url, opened_by) DO UPDATE SET title = CASE WHEN excluded.title = '' THEN title ELSE excluded.title END, visited_at = excluded.visited_at, visits = visits + 1`)
      .run(url, by, title, at)
    this.db.prepare('DELETE FROM browser_history WHERE visited_at < ?').run(at - BROWSER_HISTORY_DAYS * DAY_MS)
    const { count } = z.object({ count: z.number() }).parse(this.db.prepare('SELECT count(*) AS count FROM browser_history').get())
    if (count > MAX_BROWSER_HISTORY) {
      this.db.prepare('DELETE FROM browser_history WHERE rowid IN (SELECT rowid FROM browser_history ORDER BY visited_at LIMIT ?)').run(count - MAX_BROWSER_HISTORY)
    }
  }
}
