import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_WRITEBACK, NO_WRITEBACK_OPTIONS, pickTransition, resolveLane, Task, type SourceTransitions, type SourceUpdateTarget, type SourceWritebackConfig, type TaskSource, type WritebackLane, type WritebackOptions } from '@antumi/protocol'
import { Rejection } from './rejection'
import { intentFor, SourceWriteback } from './source-writeback'
import { SourceWritebackStore } from './source-writeback-store'
import { TaskStore } from './task-store'

const source: TaskSource = { provider: 'demo', instance: 'default', key: 'D-1', name: 'Demo', url: 'https://example.test/D-1' }
const target: SourceUpdateTarget = { kind: 'task', id: 'task-1' }
const task = (status: Task['status']) => Task.parse({ id: 'task-1', title: 'Fix login', details: '', status, repos: [], dependsOn: [], agent: null, source, createdAt: 1, updatedAt: 1 })
const open: SourceTransitions = {
  status: 'Open', statusCategory: 'todo', type: { id: 'work', name: 'Work' },
  options: [{ id: '21', name: 'In Progress', action: 'Start', category: 'doing' }, { id: '31', name: 'In Review', category: 'doing' }, { id: '41', name: 'Done', category: 'done' }]
}

describe('pickTransition', () => {
  it('takes the first name that matches one option, by status or by action, ignoring case', () => {
    expect(pickTransition(open, 'Missing | in review')).toEqual({ option: open.options[1] })
    expect(pickTransition(open, 'start')).toEqual({ option: open.options[0] })
  })
  it('skips a status the issue is in, or one behind it, and leaves an ambiguous name alone', () => {
    expect(pickTransition(open, 'open')).toEqual({ skip: 'already' })
    expect(pickTransition({ status: 'Closed', statusCategory: 'done', options: [{ id: '1', name: 'In Progress', category: 'doing' }] }, 'In Progress')).toEqual({ skip: 'backwards' })
    // A status of no known kind, from done, may be a reopening.
    expect(pickTransition({ status: 'Closed', statusCategory: 'done', options: [{ id: '1', name: 'Reopened', category: 'unknown' }] }, 'Reopened')).toEqual({ skip: 'backwards' })
    expect(pickTransition({ status: 'Open', statusCategory: 'todo', options: [{ id: '1', name: 'Triage', category: 'unknown' }] }, 'Triage')).toEqual({ option: { id: '1', name: 'Triage', category: 'unknown' } })
    expect(pickTransition({ ...open, options: [{ id: '1', name: 'Done', action: 'Resolve', category: 'done' }, { id: '2', name: 'Done', action: 'Close', category: 'done' }] }, 'Done')).toBeNull()
  })
})

describe('source writeback', () => {
  let root: string
  let tasks: TaskStore
  let store: SourceWritebackStore
  let writeback: SourceWriteback
  let rules: SourceWritebackConfig
  let transitions: SourceTransitions
  let comments: { markdown: string; writeId: string }[]
  let moves: string[]
  let commentFailure: Error | null
  let reply: string | null
  let now: number
  let lanes: WritebackLane[]
  let options: WritebackOptions
  let connected: boolean
  let transitionFailures: number
  let currentStatus: Task['status'] | undefined

  const writer = {
    comments: true,
    transitions: async () => transitions,
    transition: async (id: string) => {
      if (transitionFailures > 0) { transitionFailures--; throw new Error('socket hang up') }
      moves.push(id)
      const option = transitions.options.find((each) => each.id === id)!
      transitions = { ...transitions, status: option.name, statusCategory: option.category }
      return { status: option.name, statusCategory: option.category }
    },
    comment: async (markdown: string, writeId: string) => {
      if (commentFailure) throw commentFailure
      comments.push({ markdown, writeId })
      return { id: `c-${comments.length}`, url: `https://example.test/D-1#c-${comments.length}` }
    }
  }
  // The source's side as SourceService gives it: the lane for what the issue is, and the options.
  const sources = {
    writer: () => (connected ? writer : null),
    writebackFor: (_id: string, _instance: string, issue: Pick<SourceTransitions, 'type' | 'scope'>) => ({ ...resolveLane({ ...EMPTY_WRITEBACK, guidance: rules.guidance }, [{ typeId: 'work', name: 'Work', mode: 'on', start: rules.start, review: rules.review, done: rules.done }, ...lanes], [], issue), options }),
    writebackWanted: () => true
  }
  const make = () => new SourceWriteback(store, sources, {
    owner: (ref) => (ref.kind === 'task' && ref.id === 'task-1' ? { target: ref, source, conversationId: 'chat-1', ...(currentStatus ? { status: currentStatus } : {}) } : null),
    lastReply: () => reply,
    sanitize: (_owner, text) => text.replaceAll('/Users/ann', '~'),
    changed: () => {}
  }, () => now++)
  // A status change as TaskService makes it: the intent saved, then the listener.
  const moved = (before: Task, after: Task) => {
    const trigger = intentFor(before, after.status)
    if (trigger) store.addIntent(after.id, trigger, now++)
    writeback.taskMoved()
  }
  const settled = async () => { for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve)) }

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-source-writeback-'))
    tasks = new TaskStore(path.join(root, 'test.db'))
    store = new SourceWritebackStore(path.join(root, 'test.db'))
    rules = EMPTY_WRITEBACK
    transitions = open
    comments = []
    moves = []
    commentFailure = null
    reply = 'Fixed the redirect after sign-in.'
    now = 1000
    lanes = []
    options = NO_WRITEBACK_OPTIONS
    connected = true
    transitionFailures = 0
    currentStatus = undefined
    writeback = make()
  })
  afterEach(() => { writeback.close(); store.close(); tasks.close(); rmSync(root, { recursive: true, force: true }) })

  it('moves the issue by hand to a status it offers, and refuses one it no longer does', async () => {
    const write = await writeback.transition(target, '21')
    expect(write).toMatchObject({ kind: 'status', trigger: 'manual', state: 'sent', detail: 'In Progress', result: 'In Progress' })
    await expect(writeback.transition(target, '99')).rejects.toThrow(Rejection)
  })

  it('posts a comment by hand and takes its id as Antumi’s own', async () => {
    const write = await writeback.comment(target, '  Looks good  ')
    expect(write).toMatchObject({ kind: 'comment', state: 'sent', detail: 'Looks good', origin: 'user', result: 'c-1' })
    expect(comments[0]?.writeId).toBe(write.id)
    expect([...writeback.ownComments(source)]).toEqual(['c-1'])
  })

  it('follows the rules as the task starts, goes for review and is accepted', async () => {
    rules = { start: { status: 'In Progress' }, review: { status: 'In Review', comment: true }, done: { status: 'Done', comment: true }, guidance: '' }
    writeback.saveReport(target, 'Fixed the redirect; see PR #12.')
    moved(task('pending'), task('running'))
    await settled()
    moved(task('running'), task('review'))
    await settled()
    moved(task('review'), task('done'))
    await settled()
    expect(moves).toEqual(['21', '31', '41'])
    // Done does not post again what review already did.
    expect(comments.map((comment) => comment.markdown)).toEqual(['Fixed the redirect; see PR #12.'])
    expect(writeback.view(target).writes.find((write) => write.kind === 'comment')).toMatchObject({ trigger: 'review', origin: 'report' })
  })

  it('starts once: going on after review or starting a redo moves nothing', async () => {
    rules = { ...EMPTY_WRITEBACK, start: { status: 'In Progress' } }
    moved(task('pending'), task('running'))
    await settled()
    transitions = open
    moved(task('review'), task('running'))
    moved(task('pending'), task('running'))
    await settled()
    expect(moves).toEqual(['21'])
  })

  it('records a status it cannot reach, or one behind the issue, as skipped', async () => {
    rules = { ...EMPTY_WRITEBACK, start: { status: 'Doing' } }
    moved(task('pending'), task('running'))
    await settled()
    expect(writeback.view(target).writes[0]).toMatchObject({ state: 'skipped', reason: expect.stringContaining('Doing') })
    rules = { ...EMPTY_WRITEBACK, review: { status: 'In Progress', comment: false } }
    transitions = { type: { id: 'work', name: 'Work' }, status: 'Done', statusCategory: 'done', options: [{ id: '21', name: 'In Progress', category: 'doing' }] }
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual([])
    expect(writeback.view(target).writes[0]).toMatchObject({ state: 'skipped', reason: expect.stringContaining('不往回改') })
  })

  it('posts the last reply only as the small model condenses it, never as it is', async () => {
    const asked: string[][] = []
    writeback.setCondenser(async (conversationId, platform, text, guidance) => { asked.push([conversationId, platform, text, guidance]); return 'Login returns to the page you were on.' })
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true }, guidance: 'Write in English' }
    moved(task('running'), task('review'))
    await settled()
    expect(asked).toEqual([['chat-1', 'Demo', 'Fixed the redirect after sign-in.', 'Write in English']])
    expect(comments[0]?.markdown).toBe('Login returns to the page you were on.')
    expect(writeback.view(target).writes[0]).toMatchObject({ origin: 'last-reply' })
  })

  it('posts no comment when the reply cannot be condensed', async () => {
    writeback.setCondenser(async () => null)
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true } }
    moved(task('running'), task('review'))
    await settled()
    expect(comments).toEqual([])
    expect(writeback.view(target).writes[0]).toMatchObject({ kind: 'comment', state: 'skipped', reason: expect.stringContaining('压缩') })
  })

  it('sends a summary past the limit back to the agent to shorten', () => {
    expect(() => writeback.saveReport(target, 'x'.repeat(601))).toThrow(/601 字/)
    expect(writeback.view(target).report).toBeNull()
  })

  it('posts nothing, and says so, when there is neither a summary nor a reply', async () => {
    reply = null
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true } }
    moved(task('running'), task('review'))
    await settled()
    expect(comments).toEqual([])
    expect(writeback.view(target).writes[0]).toMatchObject({ kind: 'comment', state: 'skipped' })
  })

  it('does not post a comment twice when its result is unknown, but retries it when asked', async () => {
    commentFailure = new Error('socket hang up')
    const write = await writeback.comment(target, 'Ready for review')
    expect(write).toMatchObject({ state: 'uncertain', reason: 'socket hang up' })
    commentFailure = null
    const again = await writeback.retry(write.id)
    // The same record and write id, so a tracker deduping by it finds a comment that did go.
    expect(again).toMatchObject({ id: write.id, state: 'sent', detail: 'Ready for review' })
    expect(comments.map((comment) => comment.writeId)).toEqual([write.id])
    expect(writeback.view(target).writes).toHaveLength(1)
  })

  it('posts the summary once when the task is accepted before its review comment went out', async () => {
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true }, done: { status: '', comment: true } }
    writeback.saveReport(target, 'Fixed the redirect.')
    moved(task('running'), task('review'))
    moved(task('review'), task('done'))
    await settled()
    expect(comments.map((comment) => comment.markdown)).toEqual(['Fixed the redirect.'])
  })

  it('posts a summary again on a second hand-in only when it was rewritten', async () => {
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true } }
    writeback.saveReport(target, 'Fixed the redirect.')
    moved(task('running'), task('review'))
    await settled()
    moved(task('running'), task('review'))
    await settled()
    expect(comments).toHaveLength(1)
    expect(writeback.view(target).writes[0]).toMatchObject({ state: 'skipped', reason: '同样的总结已经发过' })
    writeback.saveReport(target, 'Fixed the redirect, and kept the query string.')
    moved(task('running'), task('review'))
    await settled()
    expect(comments.map((comment) => comment.markdown)).toEqual(['Fixed the redirect.', 'Fixed the redirect, and kept the query string.'])
  })

  it('takes a refusal from the tracker as a failure, and a token without write access as such', async () => {
    commentFailure = new Rejection('source-forbidden', 'token is read-only')
    const write = await writeback.comment(target, 'Ready for review')
    expect(write).toMatchObject({ state: 'failed', reason: '没有写权限：token is read-only' })
  })

  it('skips a rule’s comment, and refuses one by hand, where the tracker takes none', async () => {
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true } }
    const statusOnly = new SourceWriteback(store, { ...sources, writer: () => ({ ...writer, comments: false }) }, {
      owner: (ref) => ({ target: ref, source, conversationId: 'chat-1', ...(currentStatus ? { status: currentStatus } : {}) }), lastReply: () => reply, changed: () => {}
    }, () => now++)
    expect(statusOnly.view(target).comments).toBe(false)
    expect(() => statusOnly.comment(target, 'hello')).toThrow(Rejection)
    store.addIntent('task-1', 'review', now++)
    statusOnly.taskMoved()
    await settled()
    expect(comments).toEqual([])
    expect(statusOnly.view(target).writes[0]).toMatchObject({ kind: 'comment', state: 'skipped' })
  })

  const me = { id: 'u-1', name: 'Ann' }
  const qa = { id: 'u-2', name: 'Bo' }
  const handIn: SourceWritebackConfig = { ...EMPTY_WRITEBACK, start: { status: 'In Progress' }, review: { status: 'In Review', comment: true } }

  it('leaves an issue that is someone else’s alone, status and comment both', async () => {
    rules = handIn
    transitions = { ...open, viewer: me, assignees: [qa] }
    writeback.saveReport(target, 'Fixed the redirect.')
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual([])
    expect(comments).toEqual([])
    const writes = writeback.view(target).writes
    expect(writes).toHaveLength(2)
    expect(writes.every((write) => write.state === 'skipped' && write.guard === 'other' && write.reason?.includes('Bo'))).toBe(true)
  })

  it('only comments on an issue shared with others, unless the source counts that as the user’s', async () => {
    rules = handIn
    transitions = { ...open, viewer: me, assignees: [me, qa] }
    writeback.saveReport(target, 'Fixed the redirect.')
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual([])
    expect(comments).toHaveLength(1)
    options = { ...NO_WRITEBACK_OPTIONS, sharedCounts: true }
    writeback.saveReport(target, 'Fixed the redirect, again.')
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual(['31'])
  })

  it('writes to an issue that is the user’s, no one’s, or of unknown ownership, and says which on the record', async () => {
    rules = { ...EMPTY_WRITEBACK, review: { status: 'In Review', comment: false } }
    const cases: [Partial<SourceTransitions>, string][] = [[{ viewer: me, assignees: [me] }, 'sole'], [{ viewer: me, assignees: [] }, 'unassigned'], [{}, 'unknown']]
    for (const [facts, guard] of cases) {
      store.addIntent('task-1', 'review', now++)
      transitions = { ...open, ...facts }
      writeback.taskMoved()
      await settled()
      expect(writeback.view(target).writes[0]).toMatchObject({ state: 'sent', guard, lane: 'work' })
    }
    expect(moves).toEqual(['31', '31', '31'])
  })

  it('takes a type’s lane over the source’s rules, and writes nothing for a type that is off', async () => {
    rules = handIn
    lanes = [{ typeId: 'bug', name: 'Bug', mode: 'on', review: { status: 'Done', comment: false } }, { typeId: 'pr', name: 'PR', mode: 'off' }]
    transitions = { ...open, type: { id: 'bug', name: 'Bug' } }
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual(['41'])
    expect(comments).toEqual([])
    expect(writeback.view(target).writes[0]).toMatchObject({ lane: 'bug', detail: 'Done' })
    transitions = { ...open, type: { id: 'pr', name: 'PR' } }
    moved(task('pending'), task('running'))
    await settled()
    expect(moves).toEqual(['41'])
    expect(writeback.view(target).writes).toHaveLength(1)
  })

  it('goes through every step of a dry run but the write itself', async () => {
    rules = handIn
    options = { ...NO_WRITEBACK_OPTIONS, dryRun: true }
    writeback.saveReport(target, 'Fixed the redirect.')
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual([])
    expect(comments).toEqual([])
    const [comment, status] = writeback.view(target).writes
    expect(status).toMatchObject({ kind: 'status', state: 'skipped', planned: true, detail: 'In Review' })
    expect(comment).toMatchObject({ kind: 'comment', state: 'skipped', planned: true, detail: 'Fixed the redirect.' })
    // What a dry run recorded stands in for nothing: the real run still writes.
    options = NO_WRITEBACK_OPTIONS
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual(['31'])
    expect(comments).toHaveLength(1)
  })

  it('tries a failed status move again later, keeps the comment to one, and gives up in the end', async () => {
    rules = handIn
    writeback.saveReport(target, 'Fixed the redirect.')
    transitionFailures = 2
    moved(task('running'), task('review'))
    await settled()
    expect(comments).toHaveLength(1)
    expect(writeback.view(target).writes.find((write) => write.kind === 'status')).toMatchObject({ state: 'failed', reason: 'socket hang up' })
    // Not before its time.
    await writeback.drain()
    expect(transitionFailures).toBe(1)
    now += 60_000
    await writeback.drain()
    now += 5 * 60_000
    await writeback.drain()
    expect(moves).toEqual(['31'])
    expect(comments).toHaveLength(1)
    const statuses = writeback.view(target).writes.filter((write) => write.kind === 'status')
    expect(statuses.map((write) => write.state)).toEqual(['sent', 'skipped', 'skipped'])
    expect(statuses[0]).toMatchObject({ attempts: 2 })
    expect(store.dueIntents(Number.MAX_SAFE_INTEGER)).toEqual([])

    transitionFailures = 9
    transitions = open
    rules = { ...EMPTY_WRITEBACK, done: { status: 'Done', comment: false } }
    moved(task('review'), task('done'))
    await settled()
    for (const wait of [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]) { now += wait; await writeback.drain() }
    expect(transitionFailures).toBe(5)
    expect(writeback.view(target).writes.find((write) => write.trigger === 'done' && write.state === 'failed')).toMatchObject({ attempts: 3 })
    expect(store.dueIntents(Number.MAX_SAFE_INTEGER)).toEqual([])
  })

  it('delivers what a stop left unwritten, once, and not a comment that had already gone', async () => {
    rules = handIn
    writeback.saveReport(target, 'Fixed the redirect.')
    // Core stopped after the task's move was saved and before anything was written.
    store.addIntent('task-1', 'review', now++)
    const restarted = make()
    await restarted.drain()
    await restarted.drain()
    expect(moves).toEqual(['31'])
    expect(comments).toHaveLength(1)
    // And stopped again with the comment sent but the intent still there.
    store.addIntent('task-1', 'review', now - 5)
    transitions = open
    await make().drain()
    expect(comments).toHaveLength(1)
  })

  it('waits for a source that is not connected, and says so when it never is', async () => {
    rules = { ...EMPTY_WRITEBACK, start: { status: 'In Progress' } }
    connected = false
    moved(task('pending'), task('running'))
    await settled()
    expect(writeback.view(target).writes).toEqual([])
    connected = true
    now += 60_000
    await writeback.drain()
    expect(moves).toEqual(['21'])
    connected = false
    transitions = open
    store.addIntent('task-1', 'review', now++)
    rules = { ...EMPTY_WRITEBACK, review: { status: 'In Review', comment: false } }
    for (const wait of [0, 60_000, 5 * 60_000, 15 * 60_000]) { now += wait; await writeback.drain() }
    expect(writeback.view(target).writes[0]).toMatchObject({ state: 'failed', reason: '来源没有连接，没有回写' })
  })

  it('posts how to verify the work as its own paragraph, with nothing of this machine in it', async () => {
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true } }
    writeback.saveReport(target, 'Fixed in /Users/ann/app/login.js.', { outcome: 'delivered', verification: 'Sign out on /settings, sign in again.', question: '  ' })
    expect(writeback.view(target).report).toMatchObject({ outcome: 'delivered', verification: 'Sign out on /settings, sign in again.' })
    expect(writeback.view(target).report).not.toHaveProperty('question')
    moved(task('running'), task('review'))
    await settled()
    expect(comments[0]?.markdown).toBe('Fixed in ~/app/login.js.\n\nSign out on /settings, sign in again.')
  })

  it('says beforehand what a stage would write, and why it would not', async () => {
    rules = handIn
    transitions = { ...open, viewer: me, assignees: [me] }
    expect(await writeback.plan(target, 'review')).toMatchObject({
      ownership: 'sole', lane: 'work', off: false, dryRun: false, status: 'Open',
      actions: [{ kind: 'status', detail: 'In Review', will: true, reason: null }, { kind: 'comment', detail: '', will: true, reason: expect.stringContaining('最后一条回复') }]
    })
    writeback.saveReport(target, 'Fixed the redirect.')
    transitions = { ...open, viewer: me, assignees: [qa] }
    const plan = await writeback.plan(target, 'review')
    expect(plan.ownership).toBe('other')
    expect(plan.actions.map((action) => action.will)).toEqual([false, false])
    expect(moves).toEqual([])
    expect(writeback.view(target).writes).toEqual([])
  })

  it('makes an intent only of a change that brings a task from an issue to a stage', () => {
    expect(intentFor(task('pending'), 'running')).toBe('start')
    expect(intentFor(task('review'), 'running')).toBeNull()
    expect(intentFor(task('running'), 'review')).toBe('review')
    expect(intentFor(task('review'), 'done')).toBe('done')
    expect(intentFor(task('running'), 'abandoned')).toBeNull()
    expect(intentFor({ ...task('pending'), source: null }, 'running')).toBeNull()
  })

  it('settles a write left pending by a stop as uncertain', () => {
    store.saveWrite({ id: '6f1d3a0e-5d0c-4c1f-8f3a-2f2b8f0b6c11', target, provider: 'demo', instance: 'default', key: 'D-1', kind: 'comment', trigger: 'manual', detail: 'x', origin: 'user', state: 'pending', result: null, url: null, reason: null, createdAt: 1, updatedAt: 1 })
    const restarted = new SourceWriteback(store, sources, { owner: () => null, lastReply: () => null, changed: () => {} })
    expect(restarted).toBeDefined()
    expect(store.write('6f1d3a0e-5d0c-4c1f-8f3a-2f2b8f0b6c11')).toMatchObject({ state: 'uncertain' })
  })
  it('does not let an old start retry overwrite a successful review, including after restart', async () => {
    rules = handIn
    currentStatus = 'running'
    transitionFailures = 1
    moved(task('pending'), task('running'))
    await settled()
    currentStatus = 'review'
    moved(task('running'), task('review'))
    await settled()
    expect(transitions.status).toBe('In Review')
    writeback.close()
    writeback = make()
    now += 60_000
    await writeback.drain()
    expect(moves).toEqual(['31'])
    expect(store.dueIntents(Number.MAX_SAFE_INTEGER)).toEqual([])
    expect(writeback.view(target).writes.find((write) => write.trigger === 'start')).toMatchObject({ state: 'skipped' })
  })

  it('does not deliver a delayed stage after the task was abandoned', async () => {
    rules = handIn
    currentStatus = 'abandoned'
    store.addIntent('task-1', 'review', now++)
    await writeback.drain()
    expect(moves).toEqual([])
    expect(comments).toEqual([])
  })

  it('checks ownership again when a transition hands the issue to QA', async () => {
    rules = handIn
    transitions = { ...open, viewer: me, assignees: [me] }
    writeback.saveReport(target, 'Fixed the redirect.')
    const original = writer.transition
    writer.transition = async (id) => {
      const result = await original(id)
      transitions = { ...transitions, assignees: [qa] }
      return result
    }
    try {
      moved(task('running'), task('review'))
      await settled()
      expect(moves).toEqual(['31'])
      expect(comments).toEqual([])
      expect(writeback.view(target).writes[0]).toMatchObject({ kind: 'comment', state: 'skipped', guard: 'other' })
    } finally { writer.transition = original }
  })

  it('checks ownership after condensing the last reply', async () => {
    rules = { ...EMPTY_WRITEBACK, review: { status: '', comment: true } }
    transitions = { ...open, viewer: me, assignees: [me] }
    writeback.setCondenser(async () => {
      transitions = { ...transitions, assignees: [qa] }
      return 'Fixed the redirect.'
    })
    moved(task('running'), task('review'))
    await settled()
    expect(comments).toEqual([])
    expect(writeback.view(target).writes[0]).toMatchObject({ state: 'skipped', guard: 'other' })
  })

  it.each([false, true])('can resume an exhausted outage after restart (comment only: %s)', async (commentOnly) => {
    rules = { ...EMPTY_WRITEBACK, review: { status: commentOnly ? '' : 'In Review', comment: true } }
    writeback.saveReport(target, 'Fixed the redirect.')
    connected = false
    moved(task('running'), task('review'))
    await settled()
    for (const wait of [60_000, 5 * 60_000, 15 * 60_000]) { now += wait; await writeback.drain() }
    const failed = writeback.view(target).writes.find((write) => write.state === 'failed')!
    expect(failed.intentId).toBeDefined()
    expect(store.nextIntentAt()).toBeNull()
    expect(store.dueIntents(Number.MAX_SAFE_INTEGER)).toEqual([])
    writeback.close()
    writeback = make()
    connected = true
    await writeback.retry(failed.id)
    expect(moves).toEqual(commentOnly ? [] : ['31'])
    expect(comments.map((comment) => comment.markdown)).toEqual(['Fixed the redirect.'])
    expect(store.intent(failed.intentId!)).toBeUndefined()
  })

  it('keeps the review summary when acceptance overtakes its queued delivery', async () => {
    rules = handIn
    currentStatus = 'done'
    writeback.saveReport(target, 'Fixed the redirect.')
    store.addIntent('task-1', 'review', now++)
    await writeback.drain()
    expect(moves).toEqual([])
    expect(comments.map((comment) => comment.markdown)).toEqual(['Fixed the redirect.'])
  })

  it('keeps the successful status when the ownership refresh fails before a comment', async () => {
    rules = handIn
    writeback.saveReport(target, 'Fixed the redirect.')
    const original = writer.transitions
    let reads = 0
    writer.transitions = async () => {
      if (++reads === 2) throw new Error('socket hang up')
      return transitions
    }
    try {
      moved(task('running'), task('review'))
      await settled()
      expect(moves).toEqual(['31'])
      expect(comments).toEqual([])
      expect(store.dueIntents(Number.MAX_SAFE_INTEGER)[0]).toMatchObject({ statusDone: true, commentDone: false })
      now += 60_000
      await writeback.drain()
      expect(moves).toEqual(['31'])
      expect(comments).toHaveLength(1)
    } finally { writer.transitions = original }
  })

  it('holds hand-in writes until automatic repair has completed delivery', async () => {
    rules = handIn
    writeback.close()
    let delivering = true
    writeback = new SourceWriteback(store, sources, {
      owner: (ref) => ({ target: ref, source, conversationId: 'chat-1' }), lastReply: () => reply, changed: () => {},
      defer: () => delivering
    }, () => now++)
    writeback.saveReport(target, 'Fixed the redirect.')
    moved(task('running'), task('review'))
    await settled()
    expect(moves).toEqual([]); expect(comments).toEqual([])
    delivering = false; now += 60_000
    await writeback.drain()
    expect(moves).toEqual(['31']); expect(comments).toHaveLength(1)
  })

})

describe('a summary for a task from a chat platform', () => {
  let root: string
  let tasks: TaskStore
  let store: SourceWritebackStore

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-writeback-chat-'))
    tasks = new TaskStore(path.join(root, 'antumi.db'))
    store = new SourceWritebackStore(path.join(root, 'antumi.db'))
  })

  afterEach(() => {
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('is drafted and kept though there is no issue, and only where it is reported', () => {
    const chatTask: SourceUpdateTarget = { kind: 'task', id: 'chat-task' }
    const writeback = new SourceWriteback(store, { writer: () => null, writebackFor: () => { throw new Error('no issue') }, writebackWanted: () => false }, {
      owner: () => null,
      reportable: (ref) => ref.kind === 'task' && ref.id === 'chat-task',
      lastReply: () => null,
      changed: () => {}
    })
    const view = writeback.saveReport(chatTask, '导出按钮已经加上。', { outcome: 'delivered' })
    expect(view).toMatchObject({ supported: false, reportable: true, report: { text: '导出按钮已经加上。', outcome: 'delivered' } })
    expect(writeback.draft(chatTask)?.text).toBe('导出按钮已经加上。')
    expect(() => writeback.saveReport({ kind: 'task', id: 'other' }, 'x')).toThrow(Rejection)
    expect(writeback.view({ kind: 'task', id: 'other' }).reportable).toBeUndefined()
  })
})
