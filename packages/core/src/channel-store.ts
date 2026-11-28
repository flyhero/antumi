import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { ChannelFields, ChannelPlatform, ChannelRequest, ChannelRequestState, ChannelTaskFeedback, ChannelTaskReport, TaskCards, type ChannelTaskReportState, type ChannelToolCall } from '@antumi/protocol'
import { WecomPost, WecomReply } from './channel-gateway-ipc'
import type { TaskWriteLink } from './task-store'

// Agents on chat platforms: who may ask, each question and what came of it, and what is still to
// be posted. The tables are TaskStore's migrations'. Credentials are not here (CredentialStore).

const StoredData = ChannelFields.omit({ profileId: true, platform: true }).extend({
  // A card setting saved in a shape since changed is no cards, rather than no channel.
  taskCards: TaskCards.nullable().optional().catch(null),
  tenant: z.string().nullable().catch(null),
  tenantName: z.string().nullable().catch(null),
  botUserId: z.string().nullable().catch(null)
})
export type StoredChannel = z.infer<typeof StoredData> & { id: string; profileId: string; platform: ChannelPlatform; createdAt: number; updatedAt: number }

export type ChannelThread = { id: string; channelId: string; threadKey: string; asker: string; conversationId: string | null; replyPlace: string; replyThread: string | null; lastAt: number }

export type StoredRequest = {
  id: string; channelId: string; threadId: string; asker: string; tenant: string; place: string; direct: boolean; messageId: string; text: string
  // Attachment ids of the pictures that came with it, and what to say after the answer.
  images: string[]; notes: string[]
  state: ChannelRequestState; refusal: string | null; redacted: boolean; conversationId: string | null; day: string
  error?: string | null
  errorReason?: string | null
  wecom?: WecomReply
  createdAt: number; startedAt: number | null; endedAt: number | null; totalTokens: number | null
}

// react: an emoji on a message · post: text · card: a card posted · update: a card posted before, redrawn.
export const OutboxOp = z.enum(['react', 'post', 'card', 'update'])
export type OutboxOp = z.infer<typeof OutboxOp>
// reportId: the task report it carries, if it is one (channel_task_reports).
export type OutboxRow = { id: string; channelId: string; requestId: string | null; reportId: string | null; op: OutboxOp; payload: OutboxPayload; attempts: number; nextAt: number; createdAt: number }
// mention: a platform user core names to be notified, never anything from an agent's words.
// card: the platform's own card, core-drawn; cardId: the card row it posts or redraws.
// recipient: a user whose direct chat with the bot it goes to, in place of a chat.
const OutboxPayload = z.object({
  place: z.string(), thread: z.string().nullable(), target: z.string().nullable(), text: z.string().nullable(), emoji: z.string().nullable(),
  mention: z.string().nullable().optional(), card: z.unknown().optional(), cardId: z.string().nullable().optional(), recipient: z.string().nullable().optional(), wecom: WecomPost.optional()
})

export type CardKind = 'task' | 'review' | 'rework'
// A card of a task as posted: where, what it held that is not the task's own (a review's summary,
// a rework's reason), what went wrong starting it, and what it was last drawn as.
export type StoredCard = {
  id: string; taskId: string; channelId: string; kind: CardKind; place: string; thread: string | null; recipient: string | null
  feedbackId: string | null; summary: string[]; notice: string | null; messageId: string | null; rendered: string | null; createdAt: number; updatedAt: number
}
export type CardAction = 'start' | 'decline' | 'accept' | 'reject' | 'continue'
export type StoredAction = { token: string; channelId: string; cardId: string; taskId: string; action: CardAction; createdAt: number; expiresAt: number; usedAt: number | null; usedBy: string | null }

function card(row: Record<string, unknown>): StoredCard {
  return {
    id: String(row.id), taskId: String(row.task_id), channelId: String(row.channel_id), kind: row.kind === 'review' || row.kind === 'rework' ? row.kind : 'task',
    place: String(row.place), thread: row.thread == null ? null : String(row.thread), recipient: row.recipient == null ? null : String(row.recipient),
    feedbackId: row.feedback_id == null ? null : String(row.feedback_id), summary: strings(row.summary), notice: row.notice == null ? null : String(row.notice),
    messageId: row.message_id == null ? null : String(row.message_id), rendered: row.rendered == null ? null : String(row.rendered), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)
  }
}

const CARD_ACTIONS: readonly CardAction[] = ['start', 'decline', 'accept', 'reject', 'continue']
function action(row: Record<string, unknown>): StoredAction | null {
  const kind = CARD_ACTIONS.find((each) => each === row.action)
  return kind ? {
    token: String(row.token), channelId: String(row.channel_id), cardId: String(row.card_id), taskId: String(row.task_id), action: kind,
    createdAt: Number(row.created_at), expiresAt: Number(row.expires_at), usedAt: row.used_at == null ? null : Number(row.used_at), usedBy: row.used_by == null ? null : String(row.used_by)
  } : null
}
export type OutboxPayload = z.infer<typeof OutboxPayload>

const strings = (raw: unknown): string[] => {
  try {
    return z.array(z.string()).parse(JSON.parse(String(raw)))
  } catch {
    return []
  }
}

function storedReply(raw: unknown): WecomReply | undefined {
  if (typeof raw !== 'string') return undefined
  try { return WecomReply.safeParse(JSON.parse(raw)).data } catch { return undefined }
}

const REQUEST_SELECT = `SELECT id, channel_id AS channelId, thread_id AS threadId, asker, tenant, place, direct, message_id AS messageId, text, images, notes,
  state, refusal, error, error_reason AS errorReason, redacted, conversation_id AS conversationId, day, created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt, total_tokens AS totalTokens, wecom_reply FROM channel_requests`

function request(row: Record<string, unknown>): StoredRequest {
  return {
    id: String(row.id), channelId: String(row.channelId), threadId: String(row.threadId ?? ''), asker: String(row.asker), tenant: String(row.tenant), place: String(row.place),
    direct: Boolean(row.direct), messageId: String(row.messageId), text: String(row.text), images: strings(row.images), notes: strings(row.notes),
    state: ChannelRequestState.catch('failed').parse(row.state), refusal: row.refusal == null ? null : String(row.refusal), redacted: Boolean(row.redacted),
    conversationId: row.conversationId == null ? null : String(row.conversationId), day: String(row.day), error: row.error == null ? null : String(row.error),
    errorReason: row.errorReason == null ? null : String(row.errorReason),
    createdAt: Number(row.createdAt), startedAt: row.startedAt == null ? null : Number(row.startedAt), endedAt: row.endedAt == null ? null : Number(row.endedAt),
    totalTokens: row.totalTokens == null ? null : Number(row.totalTokens),
    wecom: storedReply(row.wecom_reply)
  }
}

function thread(row: Record<string, unknown>): ChannelThread {
  return {
    id: String(row.id), channelId: String(row.channel_id), threadKey: String(row.thread_key), asker: String(row.asker), conversationId: row.conversation_id ? String(row.conversation_id) : null,
    replyPlace: String(row.reply_place), replyThread: row.reply_thread == null ? null : String(row.reply_thread), lastAt: Number(row.last_at)
  }
}

export class ChannelStore {
  private readonly db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  close(): void { this.db.close() }

  channels(): StoredChannel[] {
    return this.db.prepare('SELECT * FROM channels ORDER BY created_at').all().flatMap((row) => {
      const platform = ChannelPlatform.safeParse(row.platform)
      let data: z.infer<typeof StoredData>
      try { data = StoredData.parse(JSON.parse(String(row.data))) } catch { return [] }
      // One of a platform this build does not know is left alone, not shown.
      return platform.success ? [{ ...data, id: String(row.id), profileId: String(row.profile_id), platform: platform.data, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) }] : []
    })
  }

  channel(id: string): StoredChannel | null {
    return this.channels().find((each) => each.id === id) ?? null
  }

  saveChannel(channel: StoredChannel): void {
    const { id, profileId, platform, createdAt, updatedAt, ...data } = channel
    this.db.prepare(`INSERT INTO channels (id, profile_id, platform, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET profile_id = excluded.profile_id, data = excluded.data, updated_at = excluded.updated_at`).run(id, profileId, platform, JSON.stringify(data), createdAt, updatedAt)
  }

  // With everything asked of it; the conversations it opened are the caller's to delete.
  removeChannel(id: string): string[] {
    const conversations = this.db.prepare('SELECT DISTINCT conversation_id AS id FROM channel_threads WHERE channel_id = ? AND conversation_id != \'\'').all(id).map((row) => String(row.id))
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM channel_tool_calls WHERE request_id IN (SELECT id FROM channel_requests WHERE channel_id = ?)').run(id)
      for (const table of ['channel_requests', 'channel_threads', 'channel_events', 'channel_outbox']) this.db.prepare(`DELETE FROM ${table} WHERE channel_id = ?`).run(id)
      // The tasks it collected stay, with what was posted for them; what was still to go never will,
      // and its cards can no longer be redrawn or clicked.
      this.db.prepare("UPDATE channel_task_reports SET state = 'skipped', reason = 'channel-removed' WHERE channel_id = ? AND state IN ('pending', 'queued')").run(id)
      for (const table of ['channel_task_cards', 'channel_actions']) this.db.prepare(`DELETE FROM ${table} WHERE channel_id = ?`).run(id)
      this.db.prepare('DELETE FROM channels WHERE id = ?').run(id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return conversations
  }

  // True the first time an event is seen; a delivery repeated finds it taken.
  claimEvent(channelId: string, eventKey: string, now: number): boolean {
    return this.db.prepare('INSERT OR IGNORE INTO channel_events (channel_id, event_key, received_at, outcome) VALUES (?, ?, ?, ?)').run(channelId, eventKey, now, 'received').changes > 0
  }

  // What came of it, in a word, with none of what it said.
  eventOutcome(channelId: string, eventKey: string, outcome: string): void {
    this.db.prepare('UPDATE channel_events SET outcome = ? WHERE channel_id = ? AND event_key = ?').run(outcome, channelId, eventKey)
  }

  outcomes(channelId: string): string[] {
    return this.db.prepare('SELECT outcome FROM channel_events WHERE channel_id = ? ORDER BY rowid').all(channelId).map((row) => String(row.outcome))
  }

  thread(channelId: string, threadKey: string, asker: string): ChannelThread | null {
    const row = this.db.prepare('SELECT * FROM channel_threads WHERE channel_id = ? AND thread_key = ? AND asker = ?').get(channelId, threadKey, asker)
    return row ? thread(row) : null
  }

  threadById(id: string): ChannelThread | null {
    const row = this.db.prepare('SELECT * FROM channel_threads WHERE id = ?').get(id)
    return row ? thread(row) : null
  }

  // Everyone asking in one thread of a chat, and whether anyone else has spoken there.
  threadsAt(channelId: string, threadKey: string): { asker: string; bystanders: boolean }[] {
    return this.db.prepare('SELECT asker, bystanders FROM channel_threads WHERE channel_id = ? AND thread_key = ?').all(channelId, threadKey)
      .map((row) => ({ asker: String(row.asker), bystanders: Boolean(row.bystanders) }))
  }

  markBystanders(channelId: string, threadKey: string): void {
    this.db.prepare('UPDATE channel_threads SET bystanders = 1 WHERE channel_id = ? AND thread_key = ?').run(channelId, threadKey)
  }

  saveThread(next: ChannelThread): void {
    this.db.prepare(`INSERT INTO channel_threads (id, channel_id, thread_key, asker, conversation_id, reply_place, reply_thread, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET conversation_id = excluded.conversation_id, reply_place = excluded.reply_place, reply_thread = excluded.reply_thread, last_at = excluded.last_at`)
      .run(next.id, next.channelId, next.threadKey, next.asker, next.conversationId ?? '', next.replyPlace, next.replyThread, next.lastAt)
  }

  setThreadConversation(id: string, conversationId: string): void {
    this.db.prepare('UPDATE channel_threads SET conversation_id = ? WHERE id = ?').run(conversationId, id)
  }

  archiveThread(id: string): void {
    this.db.prepare('UPDATE channel_threads SET thread_key = ? WHERE id = ?').run(`expired:${id}`, id)
  }

  // Takes the question if the day still has room for it, counting and adding in one step so two at
  // once cannot both take the last place. What was turned away does not count.
  reserve(row: StoredRequest, limits: { perUser: number; total: number }, onAccepted: () => void = () => {}): 'ok' | 'user' | 'total' {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const count = (asker: string | null) => Number(this.db.prepare(`SELECT COUNT(*) AS n FROM channel_requests WHERE channel_id = ? AND day = ? AND state != 'refused' ${asker === null ? '' : 'AND asker = ?'}`)
        .get(...(asker === null ? [row.channelId, row.day] : [row.channelId, row.day, asker]))?.n ?? 0)
      const verdict = count(row.asker) >= limits.perUser ? 'user' : count(null) >= limits.total ? 'total' : 'ok'
      this.insertRequest(verdict === 'ok' ? row : { ...row, state: 'refused', refusal: 'quota' })
      if (verdict === 'ok') onAccepted()
      this.db.exec('COMMIT')
      return verdict
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  insertRequest(row: StoredRequest): void {
    this.db.prepare(`INSERT INTO channel_requests (id, channel_id, thread_id, asker, tenant, place, direct, message_id, text, images, notes, state, refusal, redacted, conversation_id, day, created_at, started_at, ended_at, total_tokens, wecom_reply)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      row.id, row.channelId, row.threadId, row.asker, row.tenant, row.place, Number(row.direct), row.messageId, row.text, JSON.stringify(row.images), JSON.stringify(row.notes),
      row.state, row.refusal, Number(row.redacted), row.conversationId, row.day, row.createdAt, row.startedAt, row.endedAt, row.totalTokens, row.wecom ? JSON.stringify(row.wecom) : null)
  }

  updateRequest(id: string, patch: Partial<Pick<StoredRequest, 'state' | 'refusal' | 'error' | 'errorReason' | 'redacted' | 'conversationId' | 'startedAt' | 'endedAt' | 'totalTokens' | 'images' | 'notes'>>): void {
    const columns: Record<string, string> = { state: 'state', refusal: 'refusal', error: 'error', errorReason: 'error_reason', redacted: 'redacted', conversationId: 'conversation_id', startedAt: 'started_at', endedAt: 'ended_at', totalTokens: 'total_tokens', images: 'images', notes: 'notes' }
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined)
    if (entries.length === 0) return
    const values = entries.map(([, value]) => (Array.isArray(value) ? JSON.stringify(value) : typeof value === 'boolean' ? Number(value) : value))
    this.db.prepare(`UPDATE channel_requests SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE id = ?`).run(...values, id)
  }

  request(id: string): StoredRequest | null {
    const row = this.db.prepare(`${REQUEST_SELECT} WHERE id = ?`).get(id)
    return row ? request(row) : null
  }

  // In the order they were asked.
  requestsIn(state: ChannelRequestState): StoredRequest[] {
    return this.db.prepare(`${REQUEST_SELECT} WHERE state = ? ORDER BY created_at, rowid`).all(state).map(request)
  }

  runningIn(conversationId: string): StoredRequest | null {
    const row = this.db.prepare(`${REQUEST_SELECT} WHERE conversation_id = ? AND state = 'running' ORDER BY started_at DESC LIMIT 1`).get(conversationId)
    return row ? request(row) : null
  }

  // Newest first, a page at a time, as clients show them.
  requests(channelId: string, before: number | null, limit: number): ChannelRequest[] {
    return this.db.prepare(`${REQUEST_SELECT.replace(' FROM channel_requests', ', (SELECT COUNT(*) FROM channel_tool_calls WHERE request_id = channel_requests.id) AS toolCalls FROM channel_requests')}
      WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(channelId, before ?? Number.MAX_SAFE_INTEGER, limit).map((row) => {
      const stored = request(row)
      return ChannelRequest.parse({
        id: stored.id, channelId: stored.channelId, asker: stored.asker, place: stored.place, direct: stored.direct, text: stored.text, images: stored.images.length, state: stored.state,
        refusal: stored.refusal, error: stored.error ?? null, errorReason: stored.errorReason ?? null, redacted: stored.redacted, conversationId: stored.conversationId, createdAt: stored.createdAt, startedAt: stored.startedAt, endedAt: stored.endedAt,
        totalTokens: stored.totalTokens, toolCalls: Number(row.toolCalls),
        delivery: this.delivery(stored.id)
      })
    })
  }

  private delivery(id: string): ChannelRequest['delivery'] {
    const rows = this.db.prepare(`SELECT state, delivery_error FROM channel_outbox WHERE request_id = ?
      AND op = 'post' AND COALESCE(json_extract(payload, '$.wecom.phase'), 'final') IN ('final', 'extra', 'notice') ORDER BY rowid`).all(id)
    if (!rows.length) return undefined
    const sent = rows.filter((row) => row.state === 'sent').length
    const total = rows.length
    const unknown = rows.find((row) => row.state === 'unknown')
    const failed = rows.find((row) => row.state === 'failed')
    const state = unknown ? 'unknown' : failed ? 'failed' : sent === total ? 'sent' : 'pending'
    const problem = unknown ?? failed
    return { state, sent, total, error: problem?.delivery_error == null ? null : String(problem.delivery_error) }
  }

  addToolCall(requestId: string, call: ChannelToolCall): void {
    this.db.prepare('INSERT INTO channel_tool_calls (request_id, tool, target, bytes, at, write) VALUES (?, ?, ?, ?, ?, ?)').run(requestId, call.tool, call.target, call.bytes, call.at, Number(call.write ?? false))
  }

  toolCalls(requestId: string): ChannelToolCall[] {
    return this.db.prepare('SELECT tool, target, bytes, at, write FROM channel_tool_calls WHERE request_id = ? ORDER BY id').all(requestId)
      .map((row) => ({ tool: String(row.tool), target: String(row.target), bytes: Number(row.bytes), at: Number(row.at), ...(row.write ? { write: true } : {}) }))
  }

  // The conversations a channel's askers have, to start again when what its agent may use changes.
  conversationsOf(channelId: string): string[] {
    return this.db.prepare('SELECT DISTINCT conversation_id AS id FROM channel_threads WHERE channel_id = ? AND conversation_id != \'\'').all(channelId).map((row) => String(row.id))
  }

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  addOutbox(row: { id: string; channelId: string; requestId: string | null; reportId?: string | null; op: OutboxOp; payload: OutboxPayload }, now: number): void {
    this.db.prepare('INSERT INTO channel_outbox (id, channel_id, request_id, report_id, op, payload, state, attempts, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, \'pending\', 0, ?, ?)')
      .run(row.id, row.channelId, row.requestId, row.reportId ?? null, row.op, JSON.stringify(row.payload), now, now)
  }

  // What is still to be posted, oldest first, whether or not its time has come: the order holds.
  pendingOutbox(): OutboxRow[] {
    return this.db.prepare("SELECT * FROM channel_outbox WHERE state IN ('pending', 'sending') ORDER BY created_at, rowid").all().flatMap((row) => {
      const job = this.outboxRow(row)
      return job ? [job] : []
    })
  }

  sendingOutbox(id: string): OutboxRow | null {
    const row = this.db.prepare("SELECT * FROM channel_outbox WHERE id = ? AND state = 'sending'").get(id)
    return row ? this.outboxRow(row) : null
  }

  private outboxRow(row: Record<string, unknown>): OutboxRow | null {
    let payload: OutboxPayload
    try { payload = OutboxPayload.parse(JSON.parse(String(row.payload))) } catch { return null }
    const op = OutboxOp.safeParse(row.op)
    if (!op.success) return null
    return {
      id: String(row.id), channelId: String(row.channel_id), requestId: row.request_id == null ? null : String(row.request_id),
      reportId: row.report_id == null ? null : String(row.report_id), op: op.data, payload,
      attempts: Number(row.attempts), nextAt: Number(row.next_at), createdAt: Number(row.created_at)
    }
  }

  outboxSending(id: string): void {
    this.db.prepare("UPDATE channel_outbox SET state = 'sending' WHERE id = ?").run(id)
  }

  abandonInflight(): string[] {
    const rows = this.db.prepare(`UPDATE channel_outbox SET state = 'unknown', delivery_error = 'channel-delivery-unconfirmed'
      WHERE state = 'sending' RETURNING report_id`).all()
    return [...new Set(rows.flatMap((row) => typeof row.report_id === 'string' ? [row.report_id] : []))]
  }

  outboxTerminal(id: string, state: 'failed' | 'unknown', error: string): void {
    this.db.prepare('UPDATE channel_outbox SET state = ?, delivery_error = ? WHERE id = ?').run(state, error, id)
  }

  outboxSent(id: string, platformId: string | null): void {
    this.db.prepare('UPDATE channel_outbox SET state = \'sent\', platform_id = ? WHERE id = ?').run(platformId, id)
  }

  // Tried again at nextAt, or given up on.
  outboxRetry(id: string, nextAt: number | null): void {
    if (nextAt === null) this.db.prepare('UPDATE channel_outbox SET state = \'failed\', attempts = attempts + 1 WHERE id = ?').run(id)
    else this.db.prepare('UPDATE channel_outbox SET state = \'pending\', attempts = attempts + 1, next_at = ? WHERE id = ?').run(nextAt, id)
  }

  outboxStates(): Array<{ op: string; state: string; text: string | null }> {
    return this.db.prepare('SELECT op, state, payload FROM channel_outbox ORDER BY created_at, rowid').all().map((row) => ({ op: String(row.op), state: String(row.state), text: OutboxPayload.safeParse(JSON.parse(String(row.payload))).data?.text ?? null }))
  }

  // Drops what is past keeping: events (only there to catch a repeat), then old questions with
  // what they read and what was posted for them. The conversations of the questions dropped are
  // returned, for those no question is left in.
  purge(eventsBefore: number, requestsBefore: number): string[] {
    this.db.prepare('DELETE FROM channel_events WHERE received_at < ?').run(eventsBefore)
    const old = this.db.prepare('SELECT DISTINCT conversation_id AS id FROM channel_requests WHERE created_at < ? AND conversation_id IS NOT NULL').all(requestsBefore).map((row) => String(row.id))
    this.db.prepare('DELETE FROM channel_tool_calls WHERE request_id IN (SELECT id FROM channel_requests WHERE created_at < ?)').run(requestsBefore)
    this.db.prepare('DELETE FROM channel_outbox WHERE state NOT IN (\'pending\', \'sending\') AND created_at < ?').run(requestsBefore)
    this.db.prepare('DELETE FROM channel_requests WHERE created_at < ?').run(requestsBefore)
    const emptied = old.filter((id) => !this.db.prepare('SELECT 1 FROM channel_requests WHERE conversation_id = ? LIMIT 1').get(id))
    for (const id of emptied) this.db.prepare('DELETE FROM channel_threads WHERE conversation_id = ?').run(id)
    // A task's reports, cards and feedback go with the task, not with the channel's records.
    for (const table of ['channel_task_reports', 'channel_task_cards', 'channel_actions', 'channel_task_feedback']) this.db.prepare(`DELETE FROM ${table} WHERE task_id NOT IN (SELECT id FROM tasks)`).run()
    this.db.prepare('DELETE FROM channel_actions WHERE expires_at < ?').run(requestsBefore)
    return emptied
  }

  addCard(next: StoredCard): void {
    this.db.prepare(`INSERT INTO channel_task_cards (id, task_id, channel_id, kind, place, thread, recipient, feedback_id, summary, notice, message_id, rendered, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(next.id, next.taskId, next.channelId, next.kind, next.place, next.thread, next.recipient, next.feedbackId,
      JSON.stringify(next.summary), next.notice, next.messageId, next.rendered, next.createdAt, next.updatedAt)
  }

  card(id: string): StoredCard | null {
    const row = this.db.prepare('SELECT * FROM channel_task_cards WHERE id = ?').get(id)
    return row ? card(row) : null
  }

  // Oldest first.
  cards(taskId: string): StoredCard[] {
    return this.db.prepare('SELECT * FROM channel_task_cards WHERE task_id = ? ORDER BY created_at, rowid').all(taskId).map(card)
  }

  updateCard(id: string, patch: Partial<Pick<StoredCard, 'messageId' | 'rendered' | 'notice'>>, now: number): void {
    const columns: Record<string, string> = { messageId: 'message_id', rendered: 'rendered', notice: 'notice' }
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined)
    if (entries.length === 0) return
    this.db.prepare(`UPDATE channel_task_cards SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...entries.map(([, value]) => value ?? null), now, id)
  }

  // Whether the post that made a card was given up on, so nothing can redraw it.
  cardLost(id: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM channel_outbox WHERE op = \'card\' AND state = \'failed\' AND json_extract(payload, \'$.cardId\') = ?').get(id)
  }

  addAction(next: StoredAction): void {
    this.db.prepare('INSERT INTO channel_actions (token, channel_id, card_id, task_id, action, created_at, expires_at, used_at, used_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(next.token, next.channelId, next.cardId, next.taskId, next.action, next.createdAt, next.expiresAt, next.usedAt, next.usedBy)
  }

  action(token: string): StoredAction | null {
    const row = this.db.prepare('SELECT * FROM channel_actions WHERE token = ?').get(token)
    return row ? action(row) : null
  }

  // A button of a card still to be clicked, to draw it again with the same token.
  openAction(cardId: string, kind: CardAction, now: number): StoredAction | null {
    const row = this.db.prepare('SELECT * FROM channel_actions WHERE card_id = ? AND action = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1').get(cardId, kind, now)
    return row ? action(row) : null
  }

  // Takes a token once: two clicks at once cannot both have it.
  useAction(token: string, by: string, now: number): boolean {
    return this.db.prepare('UPDATE channel_actions SET used_at = ?, used_by = ? WHERE token = ? AND used_at IS NULL').run(now, by, token).changes > 0
  }

  // Gives a token back, when what it asked for could not be done and may be tried again.
  releaseAction(token: string): void {
    this.db.prepare('UPDATE channel_actions SET used_at = NULL, used_by = NULL WHERE token = ?').run(token)
  }

  // Who last did this to a task from a card, if anyone did.
  usedAction(taskId: string, kind: CardAction): StoredAction | null {
    const row = this.db.prepare('SELECT * FROM channel_actions WHERE task_id = ? AND action = ? AND used_at IS NOT NULL ORDER BY used_at DESC LIMIT 1').get(taskId, kind)
    return row ? action(row) : null
  }

  addFeedback(next: ChannelTaskFeedback): void {
    this.db.prepare('INSERT INTO channel_task_feedback (id, task_id, channel_id, author, text, created_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(next.id, next.taskId, next.channelId, next.author, next.text, next.createdAt, next.usedAt)
  }

  // Oldest first.
  feedback(taskId: string): ChannelTaskFeedback[] {
    return this.db.prepare('SELECT id, task_id AS taskId, channel_id AS channelId, author, text, created_at AS createdAt, used_at AS usedAt FROM channel_task_feedback WHERE task_id = ? ORDER BY created_at, rowid')
      .all(taskId).map((row) => ChannelTaskFeedback.parse(row))
  }

  useFeedback(id: string, now: number): boolean {
    return this.db.prepare('UPDATE channel_task_feedback SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, id).changes > 0
  }

  // A task report for TaskStore to save with the status move it is about.
  reportLink(report: ChannelTaskReport): TaskWriteLink {
    return { write: (db) => { insertReport(db, report) } }
  }

  addReport(report: ChannelTaskReport): void {
    insertReport(this.db, report)
  }

  report(id: string): ChannelTaskReport | null {
    const row = this.db.prepare(`${REPORT_SELECT} WHERE id = ?`).get(id)
    return row ? ChannelTaskReport.parse(row) : null
  }

  // Oldest first, as the task went through them.
  reports(taskId: string): ChannelTaskReport[] {
    return this.db.prepare(`${REPORT_SELECT} WHERE task_id = ? ORDER BY created_at, rowid`).all(taskId).map((row) => ChannelTaskReport.parse(row))
  }

  reportsIn(state: ChannelTaskReportState): ChannelTaskReport[] {
    return this.db.prepare(`${REPORT_SELECT} WHERE state = ? ORDER BY created_at, rowid`).all(state).map((row) => ChannelTaskReport.parse(row))
  }

  settleReport(id: string, state: ChannelTaskReportState, reason: string | null, now: number): void {
    this.db.prepare('UPDATE channel_task_reports SET state = ?, reason = ?, updated_at = ? WHERE id = ?').run(state, reason, now, id)
  }

  // How the posts carrying a report stand: posted, given up on, or still to go.
  reportPosts(reportId: string): string[] {
    return this.db.prepare('SELECT state FROM channel_outbox WHERE report_id = ? ORDER BY created_at, rowid').all(reportId).map((row) => String(row.state))
  }
}

const REPORT_SELECT = 'SELECT id, task_id AS taskId, channel_id AS channelId, stage, state, reason, created_at AS createdAt, updated_at AS updatedAt FROM channel_task_reports'

function insertReport(db: DatabaseSync, report: ChannelTaskReport): void {
  db.prepare('INSERT INTO channel_task_reports (id, task_id, channel_id, stage, state, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(report.id, report.taskId, report.channelId, report.stage, report.state, report.reason, report.createdAt, report.updatedAt)
}
