import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { PullRequestLink } from '@antumi/protocol'

const LinkRow = z.object({ data: z.string() })
const SuppressedRow = z.object({ suppressed: z.string() })
const Suppressed = z.array(z.number().int().positive())

// A task's pull requests, one per repo, as core last knew them. A number the user cut loose stays
// on the row without a link, so that looking the branch up never attaches it again. The schema is
// migrated by TaskStore before this connection opens.
export class PullRequestStore {
  private readonly db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000')
  }

  close(): void { this.db.close() }

  get(taskId: string, repoPath: string): PullRequestLink | null {
    const row = this.db.prepare("SELECT data FROM pull_requests WHERE task_id = ? AND repo_path = ? AND data <> ''").get(taskId, repoPath)
    return row ? PullRequestLink.parse(JSON.parse(LinkRow.parse(row).data)) : null
  }

  list(taskId: string): PullRequestLink[] {
    return this.db.prepare("SELECT data FROM pull_requests WHERE task_id = ? AND data <> '' ORDER BY repo_path").all(taskId)
      .map((row) => PullRequestLink.parse(JSON.parse(LinkRow.parse(row).data)))
  }

  // Every link whose pull request the host still has open, for the sweep that follows them.
  open(): PullRequestLink[] {
    return this.db.prepare("SELECT data FROM pull_requests WHERE data <> ''").all()
      .map((row) => PullRequestLink.parse(JSON.parse(LinkRow.parse(row).data)))
      .filter((link) => link.status === null || link.status.state === 'open')
  }

  put(link: PullRequestLink): void {
    this.db.prepare('INSERT INTO pull_requests(task_id, repo_path, data) VALUES (?, ?, ?) ON CONFLICT(task_id, repo_path) DO UPDATE SET data = excluded.data')
      .run(link.taskId, link.repoPath, JSON.stringify(PullRequestLink.parse(link)))
  }

  suppressed(taskId: string, repoPath: string): number[] {
    const row = this.db.prepare('SELECT suppressed FROM pull_requests WHERE task_id = ? AND repo_path = ?').get(taskId, repoPath)
    return row ? Suppressed.parse(JSON.parse(SuppressedRow.parse(row).suppressed)) : []
  }

  // Forgets the link and keeps its number out of the task's way from now on.
  unlink(taskId: string, repoPath: string): void {
    const link = this.get(taskId, repoPath)
    if (!link) return
    const suppressed = JSON.stringify([...new Set([...this.suppressed(taskId, repoPath), link.number])])
    this.db.prepare("UPDATE pull_requests SET data = '', suppressed = ? WHERE task_id = ? AND repo_path = ?").run(suppressed, taskId, repoPath)
  }
}
