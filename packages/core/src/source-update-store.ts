import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { CommentCheckpoint, SourceComment, SourceDelivery, SourceSnapshot, SourceUpdateTarget, TaskSource } from '@antumi/protocol'

export const SourceItem = z.object({
  id: z.string(), source: TaskSource, binding: z.string(), snapshot: SourceSnapshot.nullable(),
  checkpoint: CommentCheckpoint.nullable(), continuation: z.string().nullable(),
  refreshedAt: z.number().nullable(), attemptedAt: z.number(), failures: z.number(),
  retryAt: z.number(), blocked: z.boolean(), problem: z.string().nullable()
})
export type SourceItem = z.infer<typeof SourceItem>
export const SourceTargetRecord = z.object({
  target: SourceUpdateTarget, itemId: z.string(), watching: z.boolean(),
  baseline: CommentCheckpoint.nullable(), seen: z.number(), generation: z.string().default('')
})
export type SourceTargetRecord = z.infer<typeof SourceTargetRecord>
export const StoredComment = SourceComment.extend({ sequence: z.number() })
export type StoredComment = z.infer<typeof StoredComment>
const JsonRow = z.object({ data: z.string() })
const targetKey = (target: SourceUpdateTarget) => `${target.kind}:${target.id}`

// The schema is migrated by TaskStore before this connection opens.
export class SourceUpdateStore {
  private readonly db: DatabaseSync
  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000')
  }
  close(): void { this.db.close() }
  private read<T>(table: string, schema: z.ZodType<T>): T[] {
    return this.db.prepare(`SELECT data FROM ${table}`).all().map((row) => schema.parse(JSON.parse(JsonRow.parse(row).data)))
  }
  items(): SourceItem[] { return this.read('source_items', SourceItem) }
  targets(): SourceTargetRecord[] { return this.read('source_targets', SourceTargetRecord) }
  deliveries(): SourceDelivery[] { return this.read('source_deliveries', SourceDelivery) }
  item(id: string): SourceItem | undefined { const row = this.db.prepare('SELECT data FROM source_items WHERE id=?').get(id); return row ? SourceItem.parse(JSON.parse(JsonRow.parse(row).data)) : undefined }
  target(target: SourceUpdateTarget): SourceTargetRecord | undefined { const row = this.db.prepare('SELECT data FROM source_targets WHERE id=?').get(targetKey(target)); return row ? SourceTargetRecord.parse(JSON.parse(JsonRow.parse(row).data)) : undefined }
  saveItem(item: SourceItem): void {
    this.db.prepare('INSERT INTO source_items(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id, JSON.stringify(SourceItem.parse(item)))
  }
  saveTarget(target: SourceTargetRecord): void {
    this.db.prepare('INSERT INTO source_targets(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(targetKey(target.target), JSON.stringify(SourceTargetRecord.parse(target)))
  }
  saveDelivery(delivery: SourceDelivery): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO source_deliveries(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(delivery.id, JSON.stringify(SourceDelivery.parse(delivery)))
      for (const id of delivery.commentIds) this.db.prepare('INSERT OR IGNORE INTO source_delivery_comments(delivery_id,comment_id) VALUES (?,?)').run(delivery.id, id)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  comments(itemId: string): StoredComment[] {
    return this.db.prepare('SELECT sequence,data FROM source_comments WHERE item_id=? ORDER BY sequence').all(itemId)
      .map((row) => StoredComment.parse({ ...SourceComment.parse(JSON.parse(JsonRow.parse(row).data)), sequence: row.sequence }))
  }
  saveComments(itemId: string, comments: readonly SourceComment[]): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const insert = this.db.prepare('INSERT INTO source_comments(item_id,external_id,data) VALUES (?,?,?) ON CONFLICT(item_id,external_id) DO UPDATE SET data=excluded.data')
      for (const comment of comments) insert.run(itemId, comment.id, JSON.stringify(SourceComment.parse(comment)))
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
}
