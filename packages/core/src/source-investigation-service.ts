import { randomUUID } from 'node:crypto'
import {
  AutoInvestigationConfig, AutoInvestigationRun, agentDescriptor,
  type AutoInvestigationInfo, type AutoInvestigationSummary, type Conversation, type SourceIssue
} from '@antumi/protocol'
import { Rejection } from './rejection'
import { SourceInvestigationStore, investigationInstance, type InvestigationRun, type InvestigationSettings } from './source-investigation-store'

export type InvestigationSnapshot = {
  provider: string; instance: string; binding: string; scope: string
  issues: readonly SourceIssue[]; handled: ReadonlySet<string>; healthy: boolean; refreshedAt: number
}
type Deps = {
  snapshot(provider: string, instance: string): InvestigationSnapshot | null
  validate(config: AutoInvestigationConfig): Promise<void>
  available(config: AutoInvestigationConfig): string | null
  capacity(config: AutoInvestigationConfig): boolean
  getConversation(id: string): Conversation | null
  idle(id: string): boolean
  receipt(id: string, ref: string): 'submitted' | 'uncertain' | null
  launch(run: InvestigationRun): Promise<void>
  retry(run: InvestigationRun): Promise<void>
  resumeImages?(run: InvestigationRun): Promise<void>
  changed(provider: string, instance: string, info: AutoInvestigationInfo, run?: AutoInvestigationRun): void
}
const BACKOFF = [60_000, 5 * 60_000, 15 * 60_000]
const QUEUED = new Set(['queued', 'retry-wait'])
const ACTIVE = new Set(['preparing', 'running'])
const CONNECTION_BLOCKED = new Set(['source-auth-failed', 'source-not-configured', 'source-bad-query', 'source-invalid-settings'])
const FATAL = new Set(['invalid-configuration', 'source-not-found', 'source-forbidden', 'source-invalid-key', 'source-auth-failed', 'source-bad-query', 'source-not-configured', 'missing-repo', 'agent-unavailable', 'chat-option-invalid', 'model-provider-unavailable'])
const beginAt = (at: number) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime() }
const resetAt = (at: number) => { const d = new Date(at); d.setHours(24, 0, 0, 0); return d.getTime() }
export const investigationRef = (id: string) => `auto-investigate:${id}`

// A durable discovery ledger and one foreground investigation slot, separate from unattended runs.
export class SourceInvestigationService {
  private timer: ReturnType<typeof setInterval> | undefined
  private ticking: Promise<void> | null = null
  private rerun = false
  private ready = false
  private stopped = false
  private closed = false
  private lastInstance: string | null = null
  private readonly failures = new Map<string, string>()
  private readonly preparing = new Set<string>()
  private readonly imageDownloads = new Set<string>()
  constructor(readonly store: SourceInvestigationStore, private readonly deps: Deps, private readonly now: () => number = Date.now) {}

  start(): void {
    this.timer = setInterval(() => { void this.tick() }, 60_000)
    this.timer.unref()
  }
  async stop(): Promise<void> {
    if (this.closed) return
    this.suspend()
    await this.ticking
    this.store.close()
    this.closed = true
  }
  suspend(): void {
    this.stopped = true
    clearInterval(this.timer)
  }
  reconciled(): void { this.ready = true; void this.tick() }
  info(provider: string, instance: string): AutoInvestigationInfo {
    const setting = this.store.setting(provider, instance)
    const config = setting?.config ?? AutoInvestigationConfig.parse({})
    const { today, queued } = this.store.counts(provider, instance, beginAt(this.now()), resetAt(this.now()))
    let reason = setting?.reason ?? null
    let message = setting?.message ?? null
    const failure = this.failures.get(investigationInstance(provider, instance))
    if (failure) { reason = 'storage-failed'; message = failure }
    if (!reason && config.enabled && today >= config.dailyLimit) reason = 'daily-limit'
    const summary: AutoInvestigationSummary = {
      baselineReady: setting?.baselineReady ?? false, today,
      queued,
      reason, message, resetsAt: resetAt(this.now()), possiblyTruncated: setting?.possiblyTruncated ?? false
    }
    return { config, summary }
  }
  issue(provider: string, instance: string, key: string): AutoInvestigationRun | undefined {
    const binding = this.store.setting(provider, instance)?.binding
    const run = binding ? this.store.byIssue(binding, key) : null
    return run ? AutoInvestigationRun.parse(run) : undefined
  }
  list(provider: string, instance: string, cursor: string | undefined, limit: number) {
    const runs = this.store.runs(provider, instance)
    const offset = cursor === undefined ? 0 : runs.findIndex((run) => run.id === cursor) + 1
    if (cursor !== undefined && offset === 0) throw new Rejection('invalid-params', 'Invalid investigation cursor')
    const items = runs.slice(offset, offset + limit).map((run) => AutoInvestigationRun.parse(run))
    return { items, nextCursor: offset + items.length < runs.length ? items.at(-1)?.id ?? null : null }
  }
  async save(provider: string, instance: string, config: AutoInvestigationConfig): Promise<void> {
    if (config.enabled) {
      if (!config.agent || config.projectPaths.length === 0) throw new Rejection('invalid-params', '请选择排查项目和 Agent')
      if (agentDescriptor(config.agent).capabilities.readOnly === false) throw new Rejection('agent-unavailable', '该 Agent 不支持只读排查')
      await this.deps.validate(config)
    }
    const previous = this.store.setting(provider, instance)
    this.store.transaction(() => {
      this.store.saveSetting({ provider, instance, config, binding: previous?.binding ?? null, scope: previous?.scope ?? null,
        baselineReady: config.enabled && previous?.config.enabled ? previous.baselineReady : false,
        reason: null, message: null, possiblyTruncated: previous?.possiblyTruncated ?? false })
      if (!config.enabled) this.cancelPending(provider, instance)
    })
    this.failures.delete(investigationInstance(provider, instance))
    const snapshot = this.deps.snapshot(provider, instance)
    if (config.enabled && snapshot?.healthy) this.accept(snapshot)
    this.announce(provider, instance)
    void this.tick()
  }
  reset(provider: string, instance: string): void {
    const setting = this.store.setting(provider, instance)
    if (!setting) return
    this.store.transaction(() => {
      this.store.saveSetting({ ...setting, baselineReady: false, reason: null, message: null })
      this.cancelPending(provider, instance)
    })
    this.announce(provider, instance)
  }
  accept(snapshot: InvestigationSnapshot): void {
    const setting = this.store.setting(snapshot.provider, snapshot.instance)
    if (!setting?.config.enabled || !snapshot.healthy) return
    try {
      this.store.transaction(() => {
        const baseline = !setting.baselineReady || setting.binding !== snapshot.binding || setting.scope !== snapshot.scope
        if (baseline) this.cancelPending(snapshot.provider, snapshot.instance)
        for (const issue of snapshot.issues) {
          if (this.store.seen(snapshot.binding, issue.key)) continue
          const runId = baseline ? undefined : randomUUID()
          this.store.remember(snapshot.binding, issue.key, runId)
          if (baseline) continue
          const skipped = snapshot.handled.has(issue.key)
          const now = this.now()
          this.store.saveRun({ id: runId!, provider: snapshot.provider, instance: snapshot.instance, binding: snapshot.binding,
            scope: snapshot.scope, key: issue.key, title: issue.title, url: issue.url, status: skipped ? 'skipped' : 'queued',
            conversationId: null, config: null, submitted: false, imagesPending: false, aliases: [],
            reason: skipped ? 'already-handled' : null, message: null, attempts: 0, retryAt: null,
            createdAt: now, updatedAt: now, startedAt: null, canRetry: false })
        }
        this.store.saveSetting({ ...setting, binding: snapshot.binding, scope: snapshot.scope, baselineReady: true,
          reason: null, message: null, possiblyTruncated: snapshot.issues.length >= 200 })
      })
      this.failures.delete(investigationInstance(snapshot.provider, snapshot.instance))
      this.announce(snapshot.provider, snapshot.instance)
      void this.tick()
    } catch (error) {
      this.failures.set(investigationInstance(snapshot.provider, snapshot.instance), error instanceof Error ? error.message : String(error))
      console.error('[antumi-core] automatic investigation discovery failed:', error)
      this.announce(snapshot.provider, snapshot.instance)
    }
  }
  images(id: string, pending: boolean): void {
    if (pending) this.imageDownloads.add(id)
    else this.imageDownloads.delete(id)
    const run = this.store.run(id)
    if (run) this.update(run, { imagesPending: pending })
  }
  preparation(id: string, running: boolean): void {
    if (running) this.preparing.add(id)
    else if (this.preparing.delete(id)) this.changed()
  }
  canonical(id: string, key: string): void {
    const run = this.require(id)
    if (run.key === key || run.aliases.includes(key)) return
    if (this.store.seen(run.binding, key)) throw new Rejection('source-already-investigated', '问题已处理')
    this.store.transaction(() => {
      this.store.remember(run.binding, key, run.id)
      this.store.saveRun({ ...run, aliases: [...run.aliases, key] })
    })
  }
  submitted(id: string): void {
    const run = this.store.run(id)
    if (run && ACTIVE.has(run.status)) this.update(run, { submitted: true, status: 'running', startedAt: run.startedAt ?? this.now() })
    void this.tick()
  }
  created(id: string, at: number): void {
    const run = this.store.run(id)
    if (run && run.startedAt === null) this.update(run, { startedAt: at })
  }
  owns(id: string): boolean {
    const run = this.store.run(id)
    return !!run && ACTIVE.has(run.status)
  }
  managed(id: string): boolean {
    const run = this.store.run(id)
    return !!run && (ACTIVE.has(run.status) || run.status === 'waiting-user')
  }
  waiting(id: string, reason: string): void {
    const run = this.store.run(id)
    if (run && ACTIVE.has(run.status)) this.update(run, { status: 'waiting-user', reason, canRetry: false })
  }
  pending(id: string): InvestigationRun | null { return this.store.run(id) }
  takeover(id: string): void {
    const run = this.store.run(id)
    if (run?.conversationId && run.status !== 'handed-over') {
      this.update(run, { status: 'handed-over', canRetry: false, retryAt: null })
      void this.tick()
    }
  }
  deleted(id: string): void {
    const run = this.store.run(id)
    if (!run) return
    this.update(run, { status: ACTIVE.has(run.status) || run.status === 'waiting-user' || run.status === 'retry-wait' ? 'cancelled' : run.status,
      conversationId: null, reason: 'conversation-deleted', retryAt: null, canRetry: false })
    void this.tick()
  }
  failure(id: string, reason: string, message: string): void {
    const run = this.store.run(id)
    if (!run || !ACTIVE.has(run.status)) return
    if (CONNECTION_BLOCKED.has(reason)) {
      const setting = this.store.setting(run.provider, run.instance)
      if (setting) this.store.saveSetting({ ...setting, reason, message })
    }
    const receipt = this.deps.receipt(id, investigationRef(id))
    if (receipt || run.submitted) {
      this.update(run, { status: 'failed', reason: receipt === 'uncertain' ? 'delivery-uncertain' : reason, message, canRetry: false, retryAt: null })
    } else if (reason === 'source-already-investigated') {
      this.update(run, { status: 'skipped', reason: 'already-handled', message, retryAt: null })
    } else if (reason === 'agent-capacity') {
      this.update(run, { status: 'retry-wait', retryAt: this.now(), reason, message })
    } else if (!run.submitted && !FATAL.has(reason) && run.attempts <= BACKOFF.length) {
      this.update(run, { status: 'retry-wait', retryAt: this.now() + BACKOFF[run.attempts - 1]!, reason, message })
    } else {
      this.update(run, { status: 'failed', retryAt: null, reason, message, canRetry: !run.submitted })
    }
    void this.tick()
  }
  retry(id: string): AutoInvestigationRun {
    const run = this.require(id)
    if (!run.canRetry || run.submitted) throw new Rejection('invalid-params', '请打开会话继续处理')
    const setting = this.store.setting(run.provider, run.instance)
    if (!setting?.config.enabled || !setting.baselineReady || run.binding !== setting.binding || run.scope !== setting.scope) throw new Rejection('source-changed', '请检查来源和自动排查设置')
    this.store.saveSetting({ ...setting, reason: null, message: null })
    const next = this.update(run, { status: 'retry-wait', attempts: 0, retryAt: this.now(), canRetry: false, reason: null, message: null })
    void this.tick()
    return AutoInvestigationRun.parse(next)
  }
  cancel(id: string): AutoInvestigationRun {
    const run = this.require(id)
    if (!QUEUED.has(run.status)) throw new Rejection('invalid-params', '只能取消尚未开始的排查')
    return AutoInvestigationRun.parse(this.update(run, { status: 'cancelled', retryAt: null, canRetry: false }))
  }
  changed(): void { void this.tick() }
  tick(): Promise<void> {
    if (this.stopped || !this.ready) return Promise.resolve()
    if (this.ticking) { this.rerun = true; return this.ticking }
    const pass = async () => {
      do { this.rerun = false; await this.pass() } while (this.rerun && !this.stopped)
    }
    this.ticking = pass().catch((error: unknown) => console.error('[antumi-core] automatic investigation pass failed:', error))
      .finally(() => { this.ticking = null })
    return this.ticking
  }
  private async pass(): Promise<void> {
    for (const run of this.store.active()) this.observe(run)
    if (this.store.active().length > 0) return
    if (this.store.uncertain().some((run) => this.deps.getConversation(run.id)?.chat?.turn === 'running')) return
    const settings = this.store.settings().filter((entry) => entry.config.enabled && entry.baselineReady)
    const last = settings.findIndex((entry) => investigationInstance(entry.provider, entry.instance) === this.lastInstance)
    const ordered = [...settings.slice(last + 1), ...settings.slice(0, last + 1)]
    for (const setting of ordered) {
      if (this.stopped) return
      if (this.failures.has(investigationInstance(setting.provider, setting.instance)) || (setting.reason && CONNECTION_BLOCKED.has(setting.reason))) continue
      const snapshot = this.deps.snapshot(setting.provider, setting.instance)
      if (!snapshot?.healthy || snapshot.binding !== setting.binding || snapshot.scope !== setting.scope) continue
      const run = this.store.queued(setting.provider, setting.instance).reverse().find((entry) => entry.retryAt === null || entry.retryAt <= this.now())
      if (!run) continue
      if (run.binding !== snapshot.binding || run.scope !== snapshot.scope || !snapshot.issues.some((issue) => issue.key === run.key || run.aliases.includes(issue.key)) ||
        (!run.conversationId && snapshot.handled.has(run.key))) {
        this.update(run, { status: 'skipped', reason: 'already-handled', retryAt: null }); continue
      }
      const config = run.config ?? setting.config
      const blocked = this.deps.available(config)
      if (blocked) { this.block(setting, blocked); continue }
      if (!this.deps.capacity(config)) { this.block(setting, 'agent-capacity'); continue }
      if (!run.conversationId && this.info(run.provider, run.instance).summary.today >= setting.config.dailyLimit) {
        this.block(setting, 'daily-limit'); continue
      }
      try { await this.deps.validate(config) }
      catch (error) {
        this.store.saveSetting({ ...setting, reason: 'invalid-configuration', message: error instanceof Error ? error.message : String(error) })
        this.announce(setting.provider, setting.instance)
        continue
      }
      const current = this.store.run(run.id)
      const latest = this.store.setting(run.provider, run.instance)
      const connection = this.deps.snapshot(run.provider, run.instance)
      if (this.stopped || !current || !QUEUED.has(current.status) || !latest?.config.enabled || !connection?.healthy ||
        connection.binding !== run.binding || connection.scope !== run.scope) continue
      if (!run.config && JSON.stringify(latest.config) !== JSON.stringify(config)) { this.rerun = true; continue }
      this.block(setting, null)
      const next = this.update(run, { status: 'preparing', config, conversationId: run.id, attempts: run.attempts + 1,
        retryAt: null, reason: null, message: null, canRetry: false })
      this.lastInstance = investigationInstance(run.provider, run.instance)
      try {
        if (this.deps.getConversation(run.id)) await this.deps.retry(next)
        else await this.deps.launch(next)
        const current = this.require(run.id)
        const conversation = this.deps.getConversation(run.id)
        if (conversation && current.startedAt === null) this.update(current, { startedAt: conversation.createdAt })
      } catch (error) {
        const current = this.require(run.id)
        if (!this.deps.getConversation(run.id)) this.update(current, { conversationId: null })
        this.failure(run.id, error instanceof Rejection ? error.reason : 'request-failed', error instanceof Error ? error.message : String(error))
      }
      return
    }
  }
  private observe(run: InvestigationRun): void {
    if (this.preparing.has(run.id)) return
    const conversation = this.deps.getConversation(run.id)
    if (!conversation) {
      if (run.startedAt !== null) this.update(run, { status: 'cancelled', reason: 'conversation-deleted' })
      else this.update(run, { status: 'retry-wait', retryAt: this.now() })
      return
    }
    if (run.startedAt === null) run = this.update(run, { startedAt: conversation.createdAt })
    if (conversation.preparing?.error) {
      this.failure(run.id, conversation.preparing.reason ?? 'request-failed', conversation.preparing.error); return
    }
    if (conversation.preparing || conversation.starting) return
    const receipt = this.deps.receipt(run.id, investigationRef(run.id))
    if (receipt === 'uncertain') {
      this.update(run, { status: 'failed', reason: 'delivery-uncertain', canRetry: false }); return
    }
    if (!run.submitted && receipt === 'submitted') run = this.update(run, { submitted: true, status: 'running' })
    if (!run.submitted) {
      this.update(run, { status: 'retry-wait', reason: 'investigation-interrupted', retryAt: this.now() })
      return
    }
    if (conversation.chat?.turn === 'awaiting' || conversation.chat?.request) {
      this.update(run, { status: 'waiting-user', reason: 'user-input', canRetry: false }); return
    }
    if (conversation.sessionId === null) {
      this.update(run, { status: 'failed', reason: 'agent-exited', canRetry: false }); return
    }
    if (run.imagesPending && !this.imageDownloads.has(run.id)) {
      const snapshot = this.deps.snapshot(run.provider, run.instance)
      if (!snapshot?.healthy || snapshot.binding !== run.binding) return
      this.imageDownloads.add(run.id)
      void (this.deps.resumeImages?.(run) ?? Promise.resolve())
        .catch((error: unknown) => console.error('[antumi-core] recovering investigation images failed:', error))
        .finally(() => { this.images(run.id, false); this.changed() })
    }
    if (!run.imagesPending && this.deps.idle(run.id)) this.update(run, { status: 'completed', reason: null })
  }
  private block(setting: InvestigationSettings, reason: string | null): void {
    if (setting.reason === reason) return
    this.store.saveSetting({ ...setting, reason, message: null })
    this.announce(setting.provider, setting.instance)
  }
  private require(id: string): InvestigationRun {
    const run = this.store.run(id)
    if (!run) throw new Rejection('not-found', '排查记录不存在')
    return run
  }
  private cancelPending(provider: string, instance: string): void {
    for (const run of this.store.runs(provider, instance)) {
      if (QUEUED.has(run.status)) this.store.saveRun({ ...run, status: 'cancelled', retryAt: null, canRetry: false, updatedAt: this.now() })
    }
  }
  private update(run: InvestigationRun, patch: Partial<InvestigationRun>): InvestigationRun {
    const next = { ...run, ...patch, updatedAt: this.now() }
    this.store.saveRun(next)
    this.announce(run.provider, run.instance, next)
    return next
  }
  private announce(provider: string, instance: string, run?: InvestigationRun): void {
    this.deps.changed(provider, instance, this.info(provider, instance), run ? AutoInvestigationRun.parse(run) : undefined)
  }
}
