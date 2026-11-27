import { randomUUID } from 'node:crypto'
import {
  MAX_SOURCE_REPORT,
  SOURCE_REPORT_LIMIT,
  MAX_WRITEBACK_COMMENT,
  pickTransition,
  sourceOwnership,
  type SourceOwnership,
  type SourceReport,
  type SourceTransitions,
  type SourceUpdateTarget,
  type SourceWrite,
  type SourceWriteback as WritebackView,
  type SourceWritePlan,
  type SourceWriteTrigger,
  type Task,
  type TaskSource,
  type TaskStatus,
  type WritebackOptions
} from '@antumi/protocol'
import { Rejection } from './rejection'
import type { SourceService } from './source-service'
import { itemKey, type SourceWritebackStore, type StoredIntent } from './source-writeback-store'
import type { ReportAudience } from './source-report-prompt'
import type { TaskWriteLink } from './task-store'

// Writing back to the issue a task or an investigation came from: by hand, or by the source's rules
// as the task starts, goes for review and is accepted. See docs/SOURCE-WRITEBACK.md. A rule's write
// starts as an intent saved with the task's status change, and is worked out when delivered, from
// the issue as it then is: whose it is, its type's lane, where it can go (docs/SOURCE-AUTOMATION.md).

export type WritebackOwner = { target: SourceUpdateTarget; source: TaskSource; conversationId: string | null; status?: TaskStatus }
type Hooks = {
  owner(target: SourceUpdateTarget): WritebackOwner | null
  // The agent's last complete reply in a conversation, for a rule's comment with no summary.
  lastReply(conversationId: string): string | null
  // A comment an agent's words go into, made fit for the tracker: no secret, no path of this machine.
  sanitize?(owner: WritebackOwner, text: string): string
  defer?(target: SourceUpdateTarget, trigger: Trigger): boolean
  // A target with no issue whose summary is still wanted: a task from a chat platform, reported in its thread.
  reportable?(target: SourceUpdateTarget): boolean
  changed(view: WritebackView): void
}
type Sources = Pick<SourceService, 'writer' | 'writebackFor' | 'writebackWanted'>
export type Condense = (conversationId: string, platform: string, reply: string, guidance: string, audience?: ReportAudience) => Promise<string | null>
type Writer = NonNullable<ReturnType<SourceService['writer']>>
type Trigger = Exclude<SourceWriteTrigger, 'manual'>

// Failures that say the tracker refused, so the write did not happen.
const DEFINITE = new Set(['source-auth-failed', 'source-forbidden', 'source-not-found', 'source-bad-query', 'source-invalid-settings', 'source-not-configured'])

const TRIGGER: Partial<Record<TaskStatus, Trigger>> = { running: 'start', review: 'review', done: 'done' }
// How long after each failed try a status move is tried again, before it is given up on.
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000]

// The stage a status change brings a task from an issue to, if any. Going on after review is not
// a start.
export function intentFor(before: Pick<Task, 'status' | 'source'>, status: TaskStatus): Trigger | null {
  const trigger = TRIGGER[status]
  return trigger && before.source && !(trigger === 'start' && before.status !== 'pending') ? trigger : null
}

// What the guard found and where the rule came from, kept on each record a rule makes.
type Mark = { guard: SourceOwnership; lane: string }

export class SourceWriteback {
  // One write at a time per issue, rules and the user alike, in the order asked.
  private readonly queues = new Map<string, Promise<unknown>>()
  // The last reply rewritten as a summary by the small model; null when that cannot be done.
  private condense: Condense | undefined
  private readonly delivering = new Set<number>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(
    private readonly store: SourceWritebackStore,
    private readonly sources: Sources,
    private readonly hooks: Hooks,
    private readonly now: () => number = Date.now
  ) {
    store.settleInterrupted(now())
  }

  view(target: SourceUpdateTarget): WritebackView {
    const owner = this.hooks.owner(target)
    const writer = owner && this.sources.writer(owner.source)
    const reportable = this.hooks.reportable?.(target) ?? false
    return { target, supported: !!writer, comments: writer?.comments ?? true, report: this.store.report(target), writes: this.store.writes(target), ...(reportable ? { reportable } : {}) }
  }

  setCondenser(condense: Condense): void { this.condense = condense }

  // The summary the agent drafted, for whoever else posts it (a chat platform's thread).
  draft(target: SourceUpdateTarget): SourceReport | null {
    return this.store.report(target)
  }

  // An agent's last reply shortened by the small model into a summary; null when it cannot be.
  async condenseFor(conversationId: string, platform: string, reply: string, guidance: string, audience: ReportAudience): Promise<string | null> {
    return await this.condense?.(conversationId, platform, reply, guidance, audience) ?? null
  }

  ownComments(source: TaskSource): ReadonlySet<string> {
    return this.store.postedComments(source.provider, source.instance, source.key)
  }

  async transitions(target: SourceUpdateTarget): Promise<SourceTransitions> {
    const { writer } = this.require(target)
    return writer.transitions()
  }

  transition(target: SourceUpdateTarget, id: string): Promise<SourceWrite> {
    const { owner, writer } = this.require(target)
    return this.queued(owner.source, async () => {
      const transitions = await writer.transitions()
      const option = transitions.options.find((each) => each.id === id)
      if (!option) throw new Rejection('source-writeback-stale', '事项的状态已经变了，请重新选择')
      return (await this.moveTo(owner, writer, option, 'manual')).write
    })
  }

  comment(target: SourceUpdateTarget, markdown: string): Promise<SourceWrite> {
    const text = markdown.trim()
    if (!text) throw new Rejection('source-writeback-empty', '评论不能为空')
    if (text.length > MAX_WRITEBACK_COMMENT) throw new Rejection('source-writeback-too-long', `评论最多 ${MAX_WRITEBACK_COMMENT} 字`)
    const { owner, writer } = this.require(target)
    if (!writer.comments) throw new Rejection('source-writeback-no-comments', '这个来源不支持发评论')
    return this.queued(owner.source, () => this.post(owner, writer, text, 'manual', 'user'))
  }

  // Tries a write again that failed or whose result is unknown. A status is chosen afresh, so a
  // move the tracker already made is not made twice.
  retry(id: string): Promise<SourceWrite> {
    const write = this.store.write(id)
    if (!write) throw new Rejection('source-write-not-found')
    if (write.state !== 'failed' && write.state !== 'uncertain') throw new Rejection('source-write-not-retryable', '只能重试失败或结果待确认的写入')
    const { owner, writer } = this.require(write.target)
    return this.queued(owner.source, async () => {
      if (write.intentId !== undefined) {
        const intent = this.store.intent(write.intentId)
        if (!intent) throw new Rejection('source-write-not-retryable', '这次回写已经处理过了')
        this.store.saveIntent({ ...intent, attempts: 0, nextAt: this.now() })
        const retried = this.save({ ...write, state: 'skipped', reason: '已重新投递', updatedAt: this.now() })
        await this.deliverNow(owner, { ...intent, attempts: 0 })
        this.schedule()
        return retried
      }
      // The same write id again, so a tracker that dedupes by it (Linear) finds a comment that did go.
      if (write.kind === 'comment') return this.send(writer, this.save({ ...write, state: 'pending', reason: null, updatedAt: this.now() }))
      this.save({ ...write, state: 'skipped', reason: '已重试', updatedAt: this.now() }, false)
      return (await this.moveByNames(owner, writer, write.detail, write.trigger)).write
    })
  }

  saveReport(target: SourceUpdateTarget, text: string, result: Pick<SourceReport, 'outcome' | 'verification' | 'question' | 'blocker'> = {}): WritebackView {
    if (!this.hooks.owner(target) && !this.hooks.reportable?.(target)) throw new Rejection('source-none', '这个会话不是从来源事项来的')
    const report = text.trim().slice(0, MAX_SOURCE_REPORT)
    if (!report) throw new Rejection('source-writeback-empty', '总结不能为空')
    if (report.length > SOURCE_REPORT_LIMIT) throw new Rejection('source-report-too-long', `总结有 ${report.length} 字，超过 ${SOURCE_REPORT_LIMIT} 字。请压缩到 2 到 4 句、300 字以内，去掉过程、commit 号和本地路径，再调用一次。`)
    const extra = Object.fromEntries(Object.entries(result).flatMap(([key, value]) => (typeof value === 'string' && value.trim() ? [[key, value.trim()]] : [])))
    this.store.saveReport(target, { text: report, updatedAt: this.now(), ...extra })
    return this.emit(target)
  }

  // For TaskService to save with a status change, in its transaction: the task's move and the note
  // that it is still to be written back are both there after a crash, or neither is.
  journal(before: Task, status: TaskStatus): TaskWriteLink | null {
    const trigger = intentFor(before, status)
    return trigger ? this.store.intentLink(before.id, trigger, this.now()) : null
  }

  // A task's status changed and its intent is saved: deliver what is due, in the background. The
  // result, failure included, is only recorded; the task's move never waits on the tracker.
  taskMoved(): void {
    void this.drain()
  }

  // Delivers every intent that is due, also the ones a restart or a failed try left behind.
  async drain(): Promise<void> {
    if (this.closed) return
    const due = this.store.dueIntents(this.now()).filter((intent) => !this.delivering.has(intent.id))
    await Promise.all(due.map(async (intent) => {
      this.delivering.add(intent.id)
      try {
        await this.deliver(intent)
      } catch (error) {
        console.error(`[antumi-core] writing back for task ${intent.taskId} failed:`, error instanceof Error ? error.message : error)
        this.store.dropIntent(intent.id)
      } finally {
        this.delivering.delete(intent.id)
      }
    }))
    this.schedule()
  }

  close(): void {
    this.closed = true
    clearTimeout(this.timer)
  }

  private schedule(): void {
    clearTimeout(this.timer)
    const next = this.store.nextIntentAt()
    if (next === null || this.closed) return
    this.timer = setTimeout(() => void this.drain(), Math.max(1000, next - this.now()))
    this.timer.unref()
  }

  // What the rules would write at a stage the task has not reached. Nothing is written, and the
  // small model is not asked: a comment with no summary yet is said to be written later.
  async plan(target: SourceUpdateTarget, trigger: Trigger): Promise<SourceWritePlan> {
    const { owner, writer } = this.require(target)
    const facts = await writer.transitions()
    const { lane, off, rules, options } = this.sources.writebackFor(owner.source.provider, owner.source.instance, facts)
    const guard = sourceOwnership(facts)
    const rule = rules[trigger]
    const actions: SourceWritePlan['actions'] = []
    if (!off && rule.status) {
      const blocked = trigger === 'start' && this.started(target) ? '开始执行时已经改过一次' : statusBlock(guard, facts, options)
      const picked = blocked ? null : pickTransition(facts, rule.status)
      actions.push(blocked ? { kind: 'status', detail: rule.status, will: false, reason: blocked }
        : !picked ? { kind: 'status', detail: rule.status, will: false, reason: unreachable(rule.status, facts) }
        : 'skip' in picked ? { kind: 'status', detail: rule.status, will: false, reason: skipped(picked.skip, facts) }
        : { kind: 'status', detail: picked.option.name, will: true, reason: null })
    }
    if (!off && 'comment' in rule && rule.comment) {
      const report = this.store.report(target)
      const text = report ? this.composed(owner, report) : ''
      const blocked = guard === 'other' ? notMine(facts)
        : trigger === 'done' && this.commented(target) ? '提交验收时已经发过总结'
        : report && this.posted(target, text) ? '同样的总结已经发过' : null
      actions.push({ kind: 'comment', detail: text, will: !blocked, reason: blocked ?? (report ? null : '还没有总结，到时会把 Agent 最后一条回复压缩成总结') })
    }
    return { target, trigger, ownership: guard, dryRun: options.dryRun, lane, off, status: facts.status, actions }
  }

  private async deliver(intent: StoredIntent): Promise<void> {
    const target: SourceUpdateTarget = { kind: 'task', id: intent.taskId }
    const owner = this.hooks.owner(target)
    // The task is gone or no longer from an issue, or no rule asks for anything at this stage.
    if (!owner || !this.sources.writebackWanted(owner.source.provider, owner.source.instance, intent.trigger)) return this.store.dropIntent(intent.id)
    if (this.hooks.defer?.(target, intent.trigger)) {
      this.store.saveIntent({ ...intent, nextAt: this.now() + 60_000 })
      return
    }
    await this.queued(owner.source, () => this.deliverNow(owner, intent))
  }

  private async deliverNow(owner: WritebackOwner, intent: StoredIntent): Promise<void> {
    const saved = this.store.intent(intent.id)
    if (!saved) return
    intent = saved
    const { trigger } = intent
    const current = this.hooks.owner(owner.target)
    if (!current || current.status === 'abandoned') return this.store.dropIntent(intent.id)
    const writer = this.sources.writer(owner.source)
    // Not signed in, or its plugin is being changed: worth waiting for, then given up on.
    if (!writer) return this.again(intent) ? undefined : this.giveUp(owner, intent, '来源没有连接，没有回写')
    let facts: SourceTransitions
    try {
      facts = await writer.transitions()
    } catch (error) {
      return !refused(error) && this.again(intent) ? undefined : this.giveUp(owner, intent, reasonOf(error))
    }
    const latest = this.hooks.owner(owner.target)
    if (!latest || latest.status === 'abandoned') return this.store.dropIntent(intent.id)
    // A newer stage supersedes the old status, but its summary can still be due.
    if (latest.status !== undefined && TRIGGER[latest.status] !== trigger) {
      intent = { ...intent, statusDone: true }
      if (intent.lastWrite) {
        const previous = this.store.write(intent.lastWrite)
        if (previous) this.save({ ...previous, state: 'skipped', reason: '任务已离开这个阶段，不再回写旧状态', updatedAt: this.now() })
      }
    }
    const { lane, off, rules, options } = this.sources.writebackFor(owner.source.provider, owner.source.instance, facts)
    if (off) return this.store.dropIntent(intent.id)
    const rule = rules[trigger]
    const mark: Mark = { guard: sourceOwnership(facts), lane }
    let pending = false
    if (rule.status && !intent.statusDone && !(trigger === 'start' && this.started(owner.target))) {
      const blocked = statusBlock(mark.guard, facts, options)
      if (blocked) this.save(this.record(owner, 'status', trigger, rule.status, null, { state: 'skipped', reason: blocked, ...mark }))
      else {
        const previous = intent.lastWrite ? this.store.write(intent.lastWrite) : undefined
        if (previous?.state === 'failed') this.save({ ...previous, state: 'skipped', reason: `已自动重试（${previous.reason ?? '失败'}）`, updatedAt: this.now() }, false)
        const moved = await this.moveByNames(owner, writer, rule.status, trigger, { facts, mark, dryRun: options.dryRun, attempts: intent.attempts })
        if (moved.again && intent.attempts < RETRY_MS.length) {
          pending = true
          intent = { ...intent, lastWrite: moved.write.id }
        }
      }
    }
    intent = { ...intent, statusDone: !pending }
    this.store.saveIntent(intent)
    if ('comment' in rule && rule.comment && !intent.commentDone) {
      if (mark.guard === 'other') this.save(this.record(owner, 'comment', trigger, '', null, { state: 'skipped', reason: notMine(facts), ...mark }))
      // A comment made for this very change, before a restart: once is enough.
      else if (!this.store.ruleWrites(owner.target).some((write) => write.kind === 'comment' && write.trigger === trigger && write.createdAt >= intent.createdAt && (write.state === 'sent' || write.state === 'uncertain'))
        && !(trigger === 'done' && this.commented(owner.target))) {
        try {
          await this.ruleComment(owner, writer, trigger, rules.guidance, mark, options.dryRun)
        } catch (error) {
          return !refused(error) && this.again(intent) ? undefined : this.giveUp(owner, intent, reasonOf(error))
        }
      }
    }
    if (!pending) return this.store.dropIntent(intent.id)
    this.store.saveIntent({ ...intent, commentDone: true, attempts: intent.attempts + 1, nextAt: this.now() + (RETRY_MS[intent.attempts] ?? 0) })
  }

  // Puts an intent off that could not be worked out yet; false once it has had its tries.
  private again(intent: StoredIntent): boolean {
    if (intent.attempts >= RETRY_MS.length) return false
    this.store.saveIntent({ ...intent, attempts: intent.attempts + 1, nextAt: this.now() + (RETRY_MS[intent.attempts] ?? 0) })
    return true
  }

  private giveUp(owner: WritebackOwner, intent: StoredIntent, reason: string): void {
    const write = this.record(owner, intent.statusDone ? 'comment' : 'status', intent.trigger, '', null, { state: 'failed', reason, attempts: intent.attempts })
    this.save({ ...write, intentId: intent.id })
    // Keep enough to resolve the lane and both actions after reconnecting, without polling forever.
    this.store.suspendIntent(intent)
  }

  private started(target: SourceUpdateTarget): boolean {
    return this.store.ruleWrites(target).some((write) => write.trigger === 'start' && write.kind === 'status' && write.state === 'sent')
  }

  private commented(target: SourceUpdateTarget): boolean {
    return this.store.ruleWrites(target).some((write) => write.kind === 'comment' && (write.state === 'sent' || write.state === 'uncertain'))
  }

  private posted(target: SourceUpdateTarget, text: string): boolean {
    return this.store.ruleWrites(target).some((write) => write.kind === 'comment' && write.detail === text && (write.state === 'sent' || write.state === 'uncertain'))
  }

  // The summary as it is posted: how to verify the work as a paragraph of its own, and nothing of
  // this machine in either.
  private composed(owner: WritebackOwner, report: SourceReport): string {
    const text = [report.text, report.verification].filter(Boolean).join('\n\n')
    return this.hooks.sanitize?.(owner, text) ?? text
  }

  private async ruleComment(owner: WritebackOwner, writer: Writer, trigger: Trigger, guidance: string, mark: Mark, dryRun: boolean): Promise<SourceWrite> {
    if (!writer.comments) return this.save(this.record(owner, 'comment', trigger, '', null, { state: 'skipped', reason: '这个来源不支持发评论', ...mark }))
    const report = this.store.report(owner.target)
    const text = report ? this.composed(owner, report) : ''
    // Handed in again with the same summary: once is enough. A rewritten one goes out.
    if (report && this.posted(owner.target, text)) return this.save(this.record(owner, 'comment', trigger, text, 'report', { state: 'skipped', reason: '同样的总结已经发过', ...mark }))
    if (report) return this.guardedPost(owner, writer, text, trigger, 'report', mark, dryRun)
    // A reply is written for the user, headings, steps and questions and all: never posted as it
    // is, only as the small model rewrites it, and nothing when that fails.
    const reply = owner.conversationId ? this.hooks.lastReply(owner.conversationId)?.trim() : null
    if (!reply || !owner.conversationId) return this.save(this.record(owner, 'comment', trigger, '', null, { state: 'skipped', reason: 'Agent 没有写总结，也没有可用的回复，没有发评论', ...mark }))
    const condensed = await this.condense?.(owner.conversationId, owner.source.name, reply, guidance).catch((error: unknown) => {
      console.error('[antumi-core] condensing the last reply for an issue failed:', error instanceof Error ? error.message : error)
      return null
    }) ?? null
    if (condensed) return this.guardedPost(owner, writer, this.hooks.sanitize?.(owner, condensed) ?? condensed, trigger, 'last-reply', mark, dryRun)
    return this.save(this.record(owner, 'comment', trigger, '', null, { state: 'skipped', reason: 'Agent 没有写总结，最后一条回复也没能压缩成总结，没有发评论', ...mark }))
  }

  private async guardedPost(owner: WritebackOwner, writer: Writer, text: string, trigger: Trigger, origin: SourceWrite['origin'], mark: Mark, dryRun: boolean): Promise<SourceWrite> {
    // A transition can hand the issue to somebody else; condensation can take time too.
    const facts = await writer.transitions()
    const fresh = { ...mark, guard: sourceOwnership(facts) }
    if (fresh.guard === 'other') return this.save(this.record(owner, 'comment', trigger, '', null, { state: 'skipped', reason: notMine(facts), ...fresh }))
    return this.post(owner, writer, text, trigger, origin, fresh, dryRun)
  }

  // again: the move failed in a way another try may mend. A rule passes what it already read of
  // the issue; by hand it is read here.
  private async moveByNames(owner: WritebackOwner, writer: Writer, names: string, trigger: SourceWriteTrigger, rule?: { facts: SourceTransitions; mark: Mark; dryRun: boolean; attempts: number }): Promise<{ write: SourceWrite; again: boolean }> {
    const extra = rule ? { ...rule.mark, ...(rule.attempts ? { attempts: rule.attempts } : {}) } : {}
    let transitions = rule?.facts
    if (!transitions) {
      try {
        transitions = await writer.transitions()
      } catch (error) {
        return { write: this.save(this.record(owner, 'status', trigger, names, null, { state: 'failed', reason: reasonOf(error) })), again: false }
      }
    }
    const picked = pickTransition(transitions, names)
    if (!picked) return { write: this.save(this.record(owner, 'status', trigger, names, null, { state: 'skipped', reason: unreachable(names, transitions), ...extra })), again: false }
    if ('skip' in picked) return { write: this.save(this.record(owner, 'status', trigger, names, null, { state: 'skipped', reason: skipped(picked.skip, transitions), result: transitions.status, ...extra })), again: false }
    if (rule?.dryRun) return { write: this.save(this.record(owner, 'status', trigger, picked.option.name, null, { state: 'skipped', reason: DRY_RUN, planned: true, ...extra })), again: false }
    return this.moveTo(owner, writer, picked.option, trigger, extra)
  }

  private async moveTo(owner: WritebackOwner, writer: Writer, option: SourceTransitions['options'][number], trigger: SourceWriteTrigger, extra: Partial<SourceWrite> = {}): Promise<{ write: SourceWrite; again: boolean }> {
    const write = this.save(this.record(owner, 'status', trigger, option.name, null, { state: 'pending', ...extra }))
    try {
      const result = await writer.transition(option.id)
      return { write: this.save({ ...write, state: 'sent', result: result.status, updatedAt: this.now() }), again: false }
    } catch (error) {
      // A move is safe to try again: the next one reads where the issue is first.
      return { write: this.save({ ...write, state: 'failed', reason: reasonOf(error), updatedAt: this.now() }), again: !refused(error) }
    }
  }

  private async post(owner: WritebackOwner, writer: Writer, text: string, trigger: SourceWriteTrigger, origin: SourceWrite['origin'], mark?: Mark, dryRun = false): Promise<SourceWrite> {
    if (dryRun) return this.save(this.record(owner, 'comment', trigger, text, origin, { state: 'skipped', reason: DRY_RUN, planned: true, ...mark }))
    return this.send(writer, this.save(this.record(owner, 'comment', trigger, text, origin, { state: 'pending', ...mark })))
  }

  // A comment's write id is its record's id, the same on every try.
  private async send(writer: Writer, write: SourceWrite): Promise<SourceWrite> {
    try {
      const result = await writer.comment(write.detail, write.id)
      return this.save({ ...write, state: 'sent', result: result.id, url: result.url, updatedAt: this.now() })
    } catch (error) {
      // A comment that may have gone through is not posted again unasked: a duplicate is worse.
      return this.save({ ...write, state: refused(error) ? 'failed' : 'uncertain', reason: reasonOf(error), updatedAt: this.now() })
    }
  }

  private record(owner: WritebackOwner, kind: SourceWrite['kind'], trigger: SourceWriteTrigger, detail: string, origin: SourceWrite['origin'], fields: Pick<SourceWrite, 'state'> & Partial<Pick<SourceWrite, 'reason' | 'result' | 'guard' | 'lane' | 'planned' | 'attempts'>>): SourceWrite {
    const at = this.now()
    const { provider, instance, key } = owner.source
    return { id: randomUUID(), target: owner.target, provider, instance, key, kind, trigger, detail, origin, result: null, url: null, reason: null, createdAt: at, updatedAt: at, ...fields }
  }

  private save(write: SourceWrite, emit = true): SourceWrite {
    this.store.saveWrite(write)
    if (emit) this.emit(write.target)
    return write
  }

  private emit(target: SourceUpdateTarget): WritebackView {
    const view = this.view(target)
    this.hooks.changed(view)
    return view
  }

  private require(target: SourceUpdateTarget): { owner: WritebackOwner; writer: Writer } {
    const owner = this.hooks.owner(target)
    if (!owner) throw new Rejection('source-none', '这个任务或会话不是从来源事项来的')
    const writer = this.sources.writer(owner.source)
    if (!writer) throw new Rejection('source-writeback-unavailable', '来源不支持回写，或还没有连接')
    return { owner, writer }
  }

  private queued<T>(source: TaskSource, run: () => Promise<T>): Promise<T> {
    const key = itemKey(source)
    const result = (this.queues.get(key) ?? Promise.resolve()).catch(() => {}).then(run)
    const tail = result.catch(() => {})
    this.queues.set(key, tail)
    void tail.then(() => { if (this.queues.get(key) === tail) this.queues.delete(key) })
    return result
  }
}

const DRY_RUN = '演练模式，没有写入'

const refused = (error: unknown) => error instanceof Rejection && DEFINITE.has(error.reason)
const unreachable = (names: string, transitions: SourceTransitions) => `没有可流转到的状态「${names}」，当前是「${transitions.status}」`
const skipped = (skip: 'already' | 'backwards', transitions: SourceTransitions) => skip === 'already' ? `已经是「${transitions.status}」` : `当前「${transitions.status}」比目标更靠后，不往回改`
const holders = (facts: SourceTransitions) => (facts.assignees ?? []).map((user) => user.name || user.id).join('、')
const notMine = (facts: SourceTransitions) => `事项现在归 ${holders(facts)}，不归你，没有改动`

// Why a rule leaves the status alone: the issue is someone else's, or shared and the source does
// not count that as the user's. One of no one's, or one the plugin cannot say whose, goes ahead.
function statusBlock(guard: SourceOwnership, facts: SourceTransitions, options: WritebackOptions): string | null {
  if (guard === 'other') return notMine(facts)
  return guard === 'shared' && !options.sharedCounts ? `事项同时分配给了 ${holders(facts)}，没有改状态` : null
}

function reasonOf(error: unknown): string {
  if (error instanceof Rejection && error.reason === 'source-forbidden') return `没有写权限：${error.message}`
  return error instanceof Error ? error.message : String(error)
}
