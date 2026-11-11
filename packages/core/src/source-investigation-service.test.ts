import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoInvestigationConfig, Conversation, type SourceIssue } from '@antumi/protocol'
import { TaskStore } from './task-store'
import { SourceInvestigationStore, type InvestigationRun } from './source-investigation-store'
import { SourceInvestigationService, type InvestigationSnapshot } from './source-investigation-service'

const issue = (key: string): SourceIssue => ({ key, title: `Bug ${key}`, url: `https://example.test/${key}`, status: 'Open', statusCategory: 'todo', type: 'Bug', priority: null, updatedAt: null })
const enabled = AutoInvestigationConfig.parse({ enabled: true, agent: 'cursor', projectPaths: ['/project'], note: 'Check related tests', model: 'model', effort: 'high' })

describe('automatic source investigations', () => {
  let dir: string
  let tasks: TaskStore
  let store: SourceInvestigationStore
  let service: SourceInvestigationService
  let clock: number
  let snapshots: Map<string, InvestigationSnapshot>
  let conversations: Map<string, Conversation>
  let idle: Set<string>
  let receipts: Map<string, 'submitted' | 'uncertain'>
  let capacity: boolean
  let availability: string | null
  let validation: Promise<void> | null
  let launched: InvestigationRun[]
  let retried: InvestigationRun[]
  let recoveredImages: string[]
  const snapshot = () => snapshots.get('demo/default')!
  function makeService() {
    service = new SourceInvestigationService(store, {
      snapshot: (provider, instance) => snapshots.get(`${provider}/${instance}`) ?? null,
      validate: async () => { if (validation) await validation }, available: () => availability, capacity: () => capacity,
      getConversation: (id) => conversations.get(id) ?? null,
      idle: (id) => idle.has(id), receipt: (id) => receipts.get(id) ?? null,
      launch: async (run) => {
        launched.push(run)
        conversations.set(run.id, Conversation.parse({ id: run.id, title: run.title, titleLocked: true, agent: run.config?.agent,
          workspacePath: '/project', projectPaths: ['/project'], managedWorkspace: false, sessionId: null,
          createdAt: clock, updatedAt: clock, autoInvestigationId: run.id,
          preparing: { step: 'issue', error: null } }))
      },
      retry: async (run) => { retried.push(run); edit(run.id, { preparing: { step: 'issue', error: null } }) },
      resumeImages: async (run) => { recoveredImages.push(run.id) },
      changed: () => {}
    }, () => clock)
  }
  function edit(id: string, patch: Partial<Conversation>) {
    const current = conversations.get(id)
    if (!current) throw new Error('missing conversation')
    conversations.set(id, { ...current, ...patch })
  }
  async function discover(...keys: string[]) {
    snapshots.set('demo/default', { ...snapshot(), issues: keys.map(issue), refreshedAt: ++clock })
    service.accept(snapshot())
    await service.tick()
  }
  async function begin(id: string) {
    edit(id, { preparing: null, sessionId: `session-${id}`, chat: { turn: 'running' } })
    receipts.set(id, 'submitted')
    service.submitted(id)
    await service.tick()
  }
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-auto-investigation-'))
    tasks = new TaskStore(path.join(dir, 'core.db'))
    store = new SourceInvestigationStore(path.join(dir, 'core.db'))
    clock = new Date(2026, 10, 11, 12).getTime()
    snapshots = new Map([['demo/default', { provider: 'demo', instance: 'default', binding: 'demo-account', scope: 'mine', issues: [issue('D-1')], handled: new Set(), healthy: true, refreshedAt: clock }]])
    conversations = new Map(); idle = new Set(); receipts = new Map(); capacity = true; availability = null; validation = null; launched = []; retried = []; recoveredImages = []
    makeService()
    service.reconciled()
  })
  afterEach(async () => { await service.stop(); tasks.close(); rmSync(dir, { recursive: true, force: true }) })

  it('baselines raw existing issues, discovers once, and never recreates a deleted conversation', async () => {
    await service.save('demo', 'default', enabled)
    expect(store.seen('demo-account', 'D-1')).toBe(true)
    expect(launched).toHaveLength(0)
    await discover('D-1', 'D-2')
    expect(launched).toHaveLength(1)
    const run = launched[0]!
    expect(run.config).toMatchObject({ agent: 'cursor', model: 'model', effort: 'high', note: enabled.note })
    await discover('D-1', 'D-2')
    expect(store.runs()).toHaveLength(1)
    conversations.delete(run.id)
    await service.tick()
    await discover('D-1', 'D-2')
    expect(launched).toHaveLength(1)
    expect(store.run(run.id)?.status).toBe('cancelled')
  })

  it('does not baseline a failed sync and ignores imported, dismissed and manually investigated discoveries', async () => {
    snapshots.set('demo/default', { ...snapshot(), healthy: false })
    await service.save('demo', 'default', enabled)
    service.accept(snapshot())
    expect(service.info('demo', 'default').summary.baselineReady).toBe(false)
    snapshots.set('demo/default', { ...snapshot(), healthy: true })
    await discover('D-1', 'D-2')
    expect(launched).toHaveLength(0)
    snapshots.set('demo/default', { ...snapshot(), handled: new Set(['D-3', 'D-4', 'D-5']) })
    await discover('D-1', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6')
    expect(store.runs().filter((run) => run.status === 'skipped')).toHaveLength(3)
    expect(launched.map((run) => run.key)).toEqual(['D-6'])
  })

  it('holds one active slot, releases it for user input, and retains normal Agent capacity', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2', 'D-3', 'D-4')
    expect(launched).toHaveLength(1)
    const first = launched[0]!
    await begin(first.id)
    await service.tick()
    expect(launched).toHaveLength(1)
    edit(first.id, { chat: { turn: 'awaiting' } })
    capacity = false
    await service.tick()
    expect(store.run(first.id)?.status).toBe('waiting-user')
    expect(launched).toHaveLength(1)
    capacity = true
    await service.tick()
    expect(launched).toHaveLength(2)
    service.takeover(first.id)
    expect(store.run(first.id)?.status).toBe('handed-over')
    expect(service.owns(first.id)).toBe(false)
  })

  it('limits new conversations per local calendar day and waits for late images', async () => {
    await service.save('demo', 'default', { ...enabled, dailyLimit: 1 })
    await discover('D-1', 'D-2', 'D-3')
    const first = launched[0]!
    await begin(first.id)
    idle.add(first.id)
    service.images(first.id, true)
    await service.tick()
    expect(store.run(first.id)?.status).toBe('running')
    service.images(first.id, false)
    await service.tick()
    expect(store.run(first.id)?.status).toBe('completed')
    expect(launched).toHaveLength(1)
    expect(service.info('demo', 'default').summary).toMatchObject({ today: 1, queued: 1, reason: 'daily-limit' })
    clock = service.info('demo', 'default').summary.resetsAt
    await service.tick()
    expect(launched).toHaveLength(2)
  })

  it('persists the baseline and original instructions, recovering the same conversation after restart', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const run = launched[0]!
    await service.stop()
    store = new SourceInvestigationStore(path.join(dir, 'core.db'))
    edit(run.id, { preparing: { step: 'issue', error: 'interrupted', reason: 'investigation-interrupted' } })
    makeService(); service.reconciled(); await service.tick()
    expect(store.run(run.id)?.status).toBe('retry-wait')
    clock = store.run(run.id)?.retryAt ?? clock
    await service.tick()
    expect(retried).toHaveLength(1)
    expect(retried[0]?.id).toBe(run.id)
    expect(retried[0]?.config?.note).toBe(enabled.note)
    expect(launched).toHaveLength(1)
    expect(service.info('demo', 'default').summary.today).toBe(1)
  })

  it('backs off preparation failures and caps retries without creating another conversation', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const id = launched[0]!.id
    for (const delay of [60_000, 5 * 60_000, 15 * 60_000]) {
      const failedAt = clock
      service.failure(id, 'source-request-failed', 'network')
      expect(store.run(id)?.retryAt).toBe(failedAt + delay)
      clock = failedAt + delay
      await service.tick()
    }
    service.failure(id, 'source-request-failed', 'network')
    expect(store.run(id)).toMatchObject({ status: 'failed', canRetry: true, attempts: 4 })
    expect(launched).toHaveLength(1)
    expect(retried).toHaveLength(3)
    service.retry(id); await service.tick()
    expect(retried).toHaveLength(4)
    expect(service.info('demo', 'default').summary.today).toBe(1)
  })

  it('never resubmits an uncertain or already submitted opening instruction', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const id = launched[0]!.id
    edit(id, { preparing: null, sessionId: 'live', chat: { turn: 'idle' } })
    receipts.set(id, 'uncertain')
    await service.tick()
    expect(store.run(id)).toMatchObject({ status: 'failed', reason: 'delivery-uncertain', canRetry: false })
    expect(() => service.retry(id)).toThrow()
    await discover('D-1', 'D-2')
    expect(launched).toHaveLength(1)
  })

  it('rebaselines changed queries and re-enabled settings while retaining historical deduplication', async () => {
    await service.save('demo', 'default', enabled)
    capacity = false
    await discover('D-1', 'D-2')
    expect(store.runs()[0]?.status).toBe('queued')
    service.reset('demo', 'default')
    snapshots.set('demo/default', { ...snapshot(), scope: 'new-query' })
    await discover('D-1', 'D-2', 'D-3')
    expect(store.runs()).toHaveLength(1)
    expect(store.runs()[0]?.status).toBe('cancelled')
    await service.save('demo', 'default', { ...enabled, enabled: false })
    await discover('D-1', 'D-2', 'D-3', 'D-4')
    await service.save('demo', 'default', enabled)
    capacity = true
    await discover('D-1', 'D-2', 'D-3', 'D-4', 'D-5')
    expect(launched.map((run) => run.key)).toEqual(['D-5'])
  })

  it('separates identical issue keys belonging to different source accounts', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const first = launched[0]!
    await begin(first.id); idle.add(first.id); await service.tick()
    snapshots.set('demo/default', { ...snapshot(), binding: 'other-account', issues: [issue('D-1')] })
    service.accept(snapshot()); await service.tick()
    await discover('D-1', 'D-2')
    expect(launched).toHaveLength(2)
    expect(launched[0]?.binding).not.toBe(launched[1]?.binding)
  })

  it('rolls back discovery and queued work together when persistence fails', async () => {
    await service.save('demo', 'default', enabled)
    const spy = vi.spyOn(store, 'saveRun').mockImplementationOnce(() => { throw new Error('disk full') })
    await discover('D-1', 'D-2')
    expect(store.seen('demo-account', 'D-2')).toBe(false)
    expect(store.runs()).toHaveLength(0)
    expect(service.info('demo', 'default').summary.reason).toBe('storage-failed')
    spy.mockRestore()
    await discover('D-1', 'D-2')
    expect(launched).toHaveLength(1)
  })

  it('round-robins source instances and preserves cancelled keys', async () => {
    await service.save('demo', 'default', enabled)
    snapshots.set('other/default', { ...snapshot(), provider: 'other', binding: 'other' })
    await service.save('other', 'default', enabled)
    capacity = false
    await discover('D-1', 'D-2', 'D-3')
    const other = snapshots.get('other/default')!
    snapshots.set('other/default', { ...other, issues: [issue('D-1'), issue('D-2')] })
    service.accept(snapshots.get('other/default')!); await service.tick()
    const queued = store.runs('demo', 'default')[0]!
    service.cancel(queued.id)
    capacity = true; await service.tick()
    const first = launched[0]!
    await begin(first.id); idle.add(first.id); await service.tick()
    expect(launched.map((run) => run.provider)).toEqual(['demo', 'other'])
    await discover('D-1', 'D-2', 'D-3')
    expect(store.run(queued.id)?.status).toBe('cancelled')
  })

  it.each(['cancel', 'disable'])('does not resurrect queued work %s while asynchronous validation is running', async (action) => {
    await service.save('demo', 'default', enabled)
    capacity = false
    await discover('D-1', 'D-2')
    let release = () => {}
    validation = new Promise<void>((resolve) => { release = resolve })
    capacity = true
    const starting = service.tick()
    await Promise.resolve()
    if (action === 'cancel') service.cancel(store.runs()[0]!.id)
    else await service.save('demo', 'default', { ...enabled, enabled: false })
    release()
    await starting
    expect(launched).toHaveLength(0)
    expect(store.runs()[0]?.status).toBe('cancelled')
  })

  it('keeps a renamed key bound to its original run across retries and later syncs', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const id = launched[0]!.id
    service.canonical(id, 'D-20')
    service.canonical(id, 'D-20')
    expect(service.issue('demo', 'default', 'D-20')?.id).toBe(id)
    await discover('D-1', 'D-20')
    expect(store.runs()).toHaveLength(1)
  })

  it('removes deleted waiting conversations from history links without rediscovering them', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const id = launched[0]!.id
    await begin(id)
    edit(id, { chat: { turn: 'awaiting' } }); await service.tick()
    conversations.delete(id); service.deleted(id)
    await discover('D-1', 'D-2')
    expect(store.run(id)).toMatchObject({ status: 'cancelled', conversationId: null, reason: 'conversation-deleted' })
    expect(launched).toHaveLength(1)
  })

  it('recovers an attached process with no opening receipt while ignoring live preparation gaps', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const id = launched[0]!.id
    service.preparation(id, true)
    edit(id, { preparing: null, sessionId: 'attached', chat: { turn: 'idle' } })
    await service.tick()
    expect(retried).toHaveLength(0)
    service.preparation(id, false)
    await service.tick()
    expect(retried).toHaveLength(1)
    expect(launched).toHaveLength(1)
  })

  it('recovers interrupted late image downloads without resubmitting the initial instruction', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2')
    const id = launched[0]!.id
    await begin(id)
    service.images(id, true)
    idle.add(id)
    await service.stop()
    store = new SourceInvestigationStore(path.join(dir, 'core.db'))
    makeService(); service.reconciled(); await service.tick()
    expect(recoveredImages).toEqual([id])
    expect(launched).toHaveLength(1)
    expect(retried).toHaveLength(0)
    expect(store.run(id)).toMatchObject({ status: 'completed', imagesPending: false })
  })

  it('pauses the source after expired credentials instead of creating a failed conversation for every queued issue', async () => {
    await service.save('demo', 'default', enabled)
    await discover('D-1', 'D-2', 'D-3')
    service.failure(launched[0]!.id, 'source-auth-failed', 'Sign in again')
    await service.tick()
    expect(launched).toHaveLength(1)
    expect(service.info('demo', 'default').summary.reason).toBe('source-auth-failed')
    await discover('D-1', 'D-2', 'D-3')
    expect(launched).toHaveLength(2)
  })
})
