import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { WechatRemoteNotification, WechatRemoteNotifications } from '@antumi/protocol'

const BindingRow = z.object({
  credential: z.string(), version: z.string(), conversation: z.string().nullable(),
  enabled: z.number().transform(Boolean), since: z.number(), cursor: z.string(), reauth: z.number().transform(Boolean),
  allowed: z.string().transform((value) => z.array(z.string().uuid()).parse(JSON.parse(value))),
  notifications: z.string().transform((value) => WechatRemoteNotifications.parse(JSON.parse(value)))
})
export type WechatBinding = z.infer<typeof BindingRow>
export type WechatInput = { id: string; text: string; received: number }
const InboxRow = z.object({ id: z.string(), text: z.string().nullable(), received: z.number(), state: z.string() })
// The original approval column also holds the code for a question.
const OutboxRow = z.object({ id: z.string(), text: z.string(), expires: z.number(), approval: z.string().nullable(), notification: WechatRemoteNotification.nullable() })

export class WechatRemoteStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA busy_timeout = 5000')
  }

  binding(): WechatBinding | null {
    const row = this.db.prepare('SELECT * FROM wechat_remote_binding').get()
    return row ? BindingRow.parse(row) : null
  }

  replace(binding: WechatBinding | null): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM wechat_remote_binding; DELETE FROM wechat_remote_inbox; DELETE FROM wechat_remote_outbox')
      if (binding) this.db.prepare('INSERT INTO wechat_remote_binding (singleton, credential, version, conversation, enabled, since, cursor, reauth, allowed, notifications) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        binding.credential, binding.version, binding.conversation, Number(binding.enabled), binding.since, binding.cursor, Number(binding.reauth), JSON.stringify(binding.allowed), JSON.stringify(binding.notifications))
    })
  }

  setAllowed(version: string, allowed: readonly string[]): void {
    this.db.prepare('UPDATE wechat_remote_binding SET allowed = ? WHERE version = ?').run(JSON.stringify(allowed), version)
  }

  setNotification(version: string, notifications: WechatRemoteNotifications, kind: WechatRemoteNotification): void {
    this.transaction(() => {
      this.db.prepare('UPDATE wechat_remote_binding SET notifications = ? WHERE version = ?').run(JSON.stringify(notifications), version)
      if (!notifications[kind]) this.db.prepare("UPDATE wechat_remote_outbox SET state = 'rejected', text = '' WHERE notification = ? AND state = 'queued'").run(kind)
    })
  }

  receive(version: string, cursor: string | undefined, inputs: readonly WechatInput[]): void {
    this.transaction(() => {
      if (this.binding()?.version !== version) return
      const insert = this.db.prepare("INSERT OR IGNORE INTO wechat_remote_inbox VALUES (?, ?, ?, 'queued')")
      for (const item of inputs) insert.run(item.id, item.received, item.text)
      if (cursor) this.db.prepare('UPDATE wechat_remote_binding SET cursor = ? WHERE version = ?').run(cursor, version)
    })
  }

  inbox(state: 'queued' | 'acting' | 'waiting') {
    return this.db.prepare('SELECT * FROM wechat_remote_inbox WHERE state = ? ORDER BY rowid').all(state).map((row) => InboxRow.parse(row))
  }

  isWaiting(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM wechat_remote_inbox WHERE id = ? AND state IN ('acting', 'waiting')").get(id))
  }

  inputState(id: string, state: 'acting' | 'waiting' | 'handled'): void {
    this.db.prepare("UPDATE wechat_remote_inbox SET state = ?, text = CASE WHEN ? = 'acting' THEN text ELSE NULL END WHERE id = ? AND state != 'handled'")
      .run(state, state, id)
  }

  reply(id: string, parts: readonly string[], expires: number, due: number, approval: string | null, ref?: string, notification?: WechatRemoteNotification): void {
    this.transaction(() => {
      const insert = this.db.prepare("INSERT OR IGNORE INTO wechat_remote_outbox (id, text, expires, due, state, approval, notification) VALUES (?, ?, ?, ?, 'queued', ?, ?)")
      for (const [index, text] of parts.entries()) insert.run(`${id}:${index}`, text, expires, due, approval, notification ?? null)
      if (ref) this.inputState(ref, 'handled')
    })
  }

  nextReply(now: number) {
    const row = this.db.prepare("SELECT * FROM wechat_remote_outbox WHERE state = 'queued' AND due <= ? AND expires > ? ORDER BY rowid LIMIT 1").get(now, now)
    return row ? OutboxRow.parse(row) : null
  }

  replyState(id: string, state: 'sending' | 'accepted' | 'unknown' | 'rejected' | 'queued', due?: number): void {
    this.db.prepare("UPDATE wechat_remote_outbox SET state = ?, due = COALESCE(?, due), text = CASE WHEN ? IN ('sending', 'queued') THEN text ELSE '' END WHERE id = ?")
      .run(state, due ?? null, state, id)
  }

  cancelApproval(code: string): void {
    this.db.prepare("UPDATE wechat_remote_outbox SET state = 'rejected', text = '' WHERE approval = ? AND state = 'queued'").run(code)
  }

  cancelAllApprovals(): void {
    this.db.exec("UPDATE wechat_remote_outbox SET state = 'rejected', text = '' WHERE approval IS NOT NULL AND state = 'queued'")
  }

  recover(): void {
    this.db.exec("UPDATE wechat_remote_outbox SET state = 'unknown', text = '' WHERE state = 'sending'")
    this.cancelAllApprovals()
  }

  sweep(now: number): void {
    this.db.prepare("UPDATE wechat_remote_outbox SET state = 'rejected', text = '' WHERE state = 'queued' AND expires <= ?").run(now)
    this.db.prepare('DELETE FROM wechat_remote_outbox WHERE expires < ?').run(now - 86_400_000)
    this.db.prepare("DELETE FROM wechat_remote_inbox WHERE received < ? AND state = 'handled'").run(now - 86_400_000)
  }

  close(): void { this.db.close() }

  private transaction(act: () => void): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      act()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
