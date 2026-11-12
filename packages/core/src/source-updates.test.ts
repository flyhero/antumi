import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceComment, SourceCommentOptions, SourceCommentPage, SourceDelivery, SourceSnapshot, SourceUpdateTarget } from '@antumi/protocol'
import { SourceUpdates, type SourceUpdateOwner, type SourceDeliveryReceipt } from './source-updates'
import { SourceUpdateStore } from './source-update-store'
import { TaskStore } from './task-store'

const comment = (id: string, createdAt = 1000): SourceComment => ({ id, createdAt, updatedAt: null, author: 'Ann', url: 'https://example.test/D-1', markdown: `comment ${id}`, truncated: false })
const target: SourceUpdateTarget = { kind: 'conversation', id: 'one' }
const source = { provider: 'demo', instance: 'default', key: 'D-1', name: 'Demo', url: 'https://example.test/D-1' }
const baseline: SourceSnapshot = { markdown: 'original', images: [], fetchedAt: 1000, commentState: { comments: [comment('old')], checkpoint: { createdAt: 1000, ids: ['old'] } } }

describe('watched issue updates', () => {
  let root: string
  let tasks: TaskStore
  let store: SourceUpdateStore
  let updates: SourceUpdates
  let owners: SourceUpdateOwner[]
  let comments: SourceComment[]
  let now: number
  let binding: string
  let failPage: boolean
  let changes: number
  const send = vi.fn<(owner: SourceUpdateOwner, delivery: SourceDelivery) => Promise<SourceDeliveryReceipt>>()
  const receipts = new Map<string, SourceDeliveryReceipt>()
  let snapshot: SourceSnapshot
  let changedSnapshot: SourceSnapshot | null
  let fetchedImages: string[]
  function make() {
    return new SourceUpdates(store, { updateConnection: () => ({ binding, supported: true,
      fetch: async () => snapshot,
      image: async (ref: { id: string; name: string }) => {
        fetchedImages.push(ref.id)
        return ref.id === 'broken' ? null : { id: `stored-${ref.id}`, name: ref.name, width: 1, height: 1 }
      },
      comments: async (options: SourceCommentOptions): Promise<SourceCommentPage> => {
        changes++
        if (failPage) throw new Error('page failed')
        const eligible = comments.filter((comment) => comment.createdAt > options.checkpoint.createdAt || (comment.createdAt === options.checkpoint.createdAt && !options.checkpoint.ids.includes(comment.id)))
        const offset = Number(options.continuation ?? 0)
        const createdAt = Math.max(options.checkpoint.createdAt, ...comments.map((comment) => comment.createdAt))
        return { comments: eligible.slice(offset, offset + 100), continuation: eligible.length > offset + 100 ? String(offset + 100) : null,
          checkpoint: { createdAt, ids: comments.filter((comment) => comment.createdAt === createdAt).map((comment) => comment.id) } }
      }
    }) }, { owners: () => owners, snapshot: (_target, next) => { changedSnapshot = next }, send,
      receipt: (delivery) => receipts.get(delivery.ref) ?? null, changed: () => {} }, () => now)
  }
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-source-updates-'))
    tasks = new TaskStore(path.join(root, 'test.db'))
    store = new SourceUpdateStore(path.join(root, 'test.db'))
    owners = [{ target, source, snapshot: baseline, active: true, conversationId: 'chat', sendBlocker: null }]
    comments = [comment('old')]
    snapshot = baseline
    changedSnapshot = null
    fetchedImages = []
    now = 100_000
    binding = 'original-binding'
    changes = 0
    failPage = false
    receipts.clear()
    send.mockReset().mockResolvedValue({ state: 'queued' })
    updates = make()
    updates.initial(target, source, baseline)
  })
  afterEach(async () => { await updates.close(); store.close(); tasks.close(); rmSync(root, { recursive: true, force: true }); vi.useRealTimers() })

  it('syncs automatically without waking the agent, and keeps seen separate from sent', async () => {
    comments.push(comment('new'))
    await updates.poll()
    expect(updates.summary(target)).toMatchObject({ unread: 1, pending: 1 })
    expect(send).not.toHaveBeenCalled()
    updates.seen(target, updates.summary(target).through)
    expect(updates.summary(target)).toMatchObject({ unread: 0, pending: 1 })
    const requestId = randomUUID()
    const sent = await updates.send(target, requestId, updates.summary(target).through)
    expect(sent.commentIds).toEqual(['new'])
    expect(sent.text).toContain('<untrusted-source')
    await updates.send(target, requestId, 999)
    expect(send).toHaveBeenCalledTimes(1)
    expect(updates.summary(target).pending).toBe(0)
  })
  it('fetches a comment’s images only when sending it, and says which did not come', async () => {
    comments.push({ ...comment('pictured'), images: [{ id: 'shot', name: 'shot.png' }, { id: 'broken', name: 'gone.png' }] })
    await updates.poll()
    expect(fetchedImages).toEqual([])
    const requestId = randomUUID()
    const sent = await updates.send(target, requestId, updates.summary(target).through)
    expect(fetchedImages).toEqual(['shot', 'broken'])
    expect(sent.imageIds).toEqual(['stored-shot'])
    expect(sent.text).toContain('评论里的 1 张图片附在这条消息里')
    expect(sent.text).toContain('还有 1 张图片没能下载')
    expect(send.mock.calls[0]?.[1].imageIds).toEqual(['stored-shot'])
  })
  it('recovers durable cursors and receipts after a restart', async () => {
    comments.push(comment('new', 2000))
    await updates.refresh(target)
    await updates.send(target, randomUUID(), updates.summary(target).through)
    await updates.close()
    store.close()
    store = new SourceUpdateStore(path.join(root, 'test.db'))
    updates = make()
    now += 20_000
    await updates.refresh(target)
    expect(updates.page(target).comments).toHaveLength(1)
    expect(updates.summary(target).pending).toBe(0)
  })
  it('releases cancelled batches without replaying comments already in another batch', async () => {
    comments.push(comment('new', 2000))
    await updates.refresh(target)
    const batch = await updates.send(target, randomUUID(), updates.summary(target).through)
    receipts.set(batch.ref, { state: 'cancelled' })
    updates.changed()
    expect(updates.summary(target).pending).toBe(1)
    await updates.send(target, randomUUID(), updates.summary(target).through)
    expect(send).toHaveBeenCalledTimes(2)
    expect(updates.summary(target).pending).toBe(0)
  })
  it('serializes simultaneous clicks from different windows', async () => {
    comments.push(comment('new'))
    await updates.refresh(target)
    const results = await Promise.allSettled([updates.send(target, randomUUID(), 999), updates.send(target, randomUUID(), 999)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('keeps the original checkpoint after a failed page and catches up more than twenty comments', async () => {
    comments.push(...Array.from({ length: 150 }, (_, id) => comment(`new-${id}`, 2000)))
    failPage = true
    await updates.refresh(target)
    expect(store.items()[0]?.checkpoint).toEqual(baseline.commentState?.checkpoint)
    failPage = false
    now += 20_000
    await updates.refresh(target)
    expect(updates.summary(target).pending).toBe(150)
    expect(updates.page(target).comments).toHaveLength(50)
    expect(updates.page(target, updates.page(target).next ?? undefined).comments).toHaveLength(50)
  })
  it('records comments actually included in a task’s initial context without sending another message', async () => {
    comments.push(comment('included', 2000), comment('not-in-the-snapshot', 3000))
    await updates.refresh(target)
    const prepared = updates.prepareInitial(target, 'chat', 'full initial task prompt', ['included'])
    expect(prepared?.commentIds).toEqual(['included'])
    expect(updates.summary(target).pending).toBe(1)
    expect(send).not.toHaveBeenCalled()
    if (!prepared) throw new Error('missing initial batch')
    receipts.set(prepared.ref, { state: 'submitted' })
    updates.changed()
    expect(updates.page(target).deliveries[0]?.state).toBe('submitted')
  })

  it('polls at startup and every fifteen minutes while never sending to the agent', async () => {
    vi.useFakeTimers()
    comments.push(comment('startup', 2000))
    updates.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(updates.summary(target).pending).toBe(1)
    comments.push(comment('later', 3000))
    now += 15 * 60_000
    await vi.advanceTimersByTimeAsync(15 * 60_000 - 1)
    expect(updates.summary(target).pending).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(updates.summary(target).pending).toBe(2)
    expect(send).not.toHaveBeenCalled()
  })

  it('starts a new baseline for a redone task while retaining earlier delivery history', async () => {
    comments.push(comment('before-redo', 2000))
    await updates.refresh(target)
    expect(updates.summary(target).pending).toBe(1)
    owners[0]!.generation = 'next-attempt'
    expect(updates.summary(target).pending).toBe(0)
    comments.push(comment('after-redo', 2000))
    now += 20_000
    await updates.refresh(target)
    expect(updates.page(target).comments.map((comment) => comment.id)).toEqual(['after-redo'])
  })

  it('keeps images from a later full fetch during a background text-only refresh', async () => {
    const image = { id: `${'a'.repeat(64)}.png`, name: 'new.png', width: 16, height: 16 }
    updates.initial(target, source, { ...baseline, images: [image], imagesFetchedAt: 5000 })
    snapshot = { ...baseline, markdown: 'updated text', images: [] }
    await updates.refresh(target)
    expect(store.items()[0]?.snapshot?.images).toEqual([image])
    expect(store.items()[0]?.snapshot?.imagesFetchedAt).toBe(5000)
  })

  it('preserves comments beyond the batch limit for another manual send', async () => {
    comments.push(...Array.from({ length: 150 }, (_, id) => comment(`new-${id}`, 2000)))
    await updates.refresh(target)
    expect((await updates.send(target, randomUUID(), updates.summary(target).through)).commentIds).toHaveLength(100)
    expect(updates.summary(target).pending).toBe(50)
    expect((await updates.send(target, randomUUID(), updates.summary(target).through)).commentIds).toHaveLength(50)
    expect(updates.summary(target).pending).toBe(0)
  })

  it('continues after ten pages without advancing the complete checkpoint too early', async () => {
    vi.useFakeTimers()
    comments.push(...Array.from({ length: 1100 }, (_, id) => comment(`new-${id}`, 2000)))
    await updates.refresh(target)
    expect(updates.summary(target).pending).toBe(1000)
    expect(store.items()[0]?.checkpoint).toEqual(baseline.commentState?.checkpoint)
    await vi.advanceTimersByTimeAsync(1000)
    expect(updates.summary(target).pending).toBe(1100)
    expect(store.items()[0]?.checkpoint?.createdAt).toBe(2000)
  })

  it('does not retry an old failed batch after another window sent its comments', async () => {
    comments.push(comment('new'))
    await updates.refresh(target)
    send.mockRejectedValueOnce(new Error('failed to start'))
    const original = randomUUID()
    expect((await updates.send(target, original, 999)).state).toBe('failed')
    await updates.send(target, randomUUID(), 999)
    await expect(updates.send(target, original, 999)).rejects.toMatchObject({ reason: 'source-comments-already-sent' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('notifies a queued-to-submitted transition without exposing the stored prompt', async () => {
    comments.push(comment('new'))
    await updates.refresh(target)
    const batch = await updates.send(target, randomUUID(), 999)
    const revision = updates.summary(target).revision
    receipts.set(batch.ref, { state: 'submitted' })
    updates.changed()
    expect(updates.summary(target).revision).not.toBe(revision)
    expect(updates.page(target).deliveries[0]?.state).toBe('submitted')
    expect(updates.page(target).deliveries[0]).not.toHaveProperty('text')
  })

  it('pauses local archived targets but does not depend on inbox membership', async () => {
    owners[0]!.active = false
    comments.push(comment('closed-issue-comment'))
    await updates.poll()
    expect(changes).toBe(0)
    owners[0]!.active = true
    await updates.poll()
    expect(updates.summary(target).pending).toBe(1)
  })
  it('does not let a new target skip an older target’s pending comments', async () => {
    comments.push(comment('new', 2000))
    const other: SourceUpdateTarget = { kind: 'task', id: 'task' }
    owners.push({ target: other, source, snapshot: { ...baseline, commentState: { comments, checkpoint: { createdAt: 2000, ids: ['new'] } } }, active: true, conversationId: null, sendBlocker: 'no chat' })
    updates.summaries()
    await updates.poll()
    expect(updates.summary(target).pending).toBe(1)
    expect(updates.summary(other).pending).toBe(0)
    expect(changes).toBe(1)
  })
  it('sets the baseline when a preparing conversation joins an already watched issue', async () => {
    const other = { kind: 'conversation', id: 'preparing' } as const
    owners.push({ target: other, source, snapshot: null, active: false, conversationId: 'other', sendBlocker: null })
    updates.summaries()
    comments.push(comment('new', 2000))
    updates.initial(other, source, { ...baseline, commentState: { comments, checkpoint: { createdAt: 2000, ids: ['new'] } } })
    owners[1]!.active = true
    await updates.poll()
    expect(updates.summary(target).pending).toBe(1)
    expect(updates.summary(other).pending).toBe(0)
  })

  it('updates task text while preserving images and refuses to send when its state blocks it', async () => {
    owners[0] = { ...owners[0]!, target: { kind: 'task', id: 'task' }, sendBlocker: 'continue the task first' }
    const taskTarget = owners[0].target
    snapshot = { ...baseline, markdown: 'updated' }
    await updates.refresh(taskTarget)
    expect(changedSnapshot).toMatchObject({ markdown: 'updated' })
    await expect(updates.send(taskTarget, randomUUID(), 999)).rejects.toThrow('continue the task first')
    expect(send).not.toHaveBeenCalled()
  })
  it('never sends a watched issue key to a different source binding', async () => {
    binding = 'another-site'
    await updates.refresh(target)
    expect(changes).toBe(0)
    expect(updates.summary(target).active).toBe(false)
  })
  it('preserves the preview boundary when a newer comment arrives before sending', async () => {
    comments.push(comment('first', 2000))
    await updates.refresh(target)
    const through = updates.summary(target).through
    comments.push(comment('second', 3000))
    now += 20_000
    await updates.refresh(target)
    const batch = await updates.send(target, randomUUID(), through)
    expect(batch.commentIds).toEqual(['first'])
    expect(updates.summary(target).pending).toBe(1)
  })
})
