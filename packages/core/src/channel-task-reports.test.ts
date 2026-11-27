import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChannelFields, shortTaskId, type ChannelTaskReport, type SourceReport, type Task, type TaskChannelSource, type TaskStatus } from '@antumi/protocol'
import { ChannelStore, type StoredChannel } from './channel-store'
import { ChannelTaskReports, stageOf, type ReportPost } from './channel-task-reports'
import { TaskStore } from './task-store'

const PROFILE = '11111111-1111-4111-8111-111111111111'
const CHANNEL = '22222222-2222-4222-8222-222222222222'

describe('stageOf', () => {
  it('names the moves the asker hears of, and no other', () => {
    const cases: [TaskStatus, TaskStatus, string | null][] = [
      ['pending', 'running', 'start'], ['review', 'running', 'rework'], ['running', 'running', null], ['running', 'review', 'review'],
      ['review', 'done', 'done'], ['running', 'done', 'done'], ['pending', 'done', 'closed'], ['running', 'abandoned', 'abandoned'],
      ['review', 'pending', null], ['abandoned', 'pending', null], ['abandoned', 'review', null], ['done', 'done', null]
    ]
    for (const [from, to, stage] of cases) expect(stageOf(from, to), `${from} → ${to}`).toBe(stage)
  })
})

// The reporter over a real task store and channel store; the channel service's part (formatting
// and the outbox) is only what it is handed.
describe('channel task reports', () => {
  let root: string
  let tasks: TaskStore
  let store: ChannelStore
  let reports: ChannelTaskReports
  let posts: ReportPost[]
  let changes: ChannelTaskReport[][]
  let accepting: boolean
  let draft: SourceReport | null
  let reply: string | null
  let condensed: string | null
  let pullRequests: { url: string }[]
  // The conversation a task's agent runs in, which core finds from the conversation's side.
  let conversationId: string | null
  let now: number

  const channel = (over: Partial<StoredChannel> = {}): StoredChannel => ({
    ...ChannelFields.parse({ profileId: PROFILE, platform: 'feishu', allowTaskCreation: true, reportTasks: true }),
    id: CHANNEL, profileId: PROFILE, platform: 'feishu', tenant: 'T1', tenantName: 'Acme', botUserId: 'ou_bot', createdAt: 1, updatedAt: 1, ...over
  })
  const source = (over: Partial<TaskChannelSource> = {}): TaskChannelSource => ({
    channelId: CHANNEL, requestId: '33333333-3333-4333-8333-333333333333', conversationId: '44444444-4444-4444-8444-444444444444', platform: 'feishu',
    tenant: 'T1', asker: 'ou_asker', place: 'oc_1', messageId: 'om_1', thread: 'om_1', direct: false, text: '加一个导出按钮', createdAt: 1, ...over
  })
  // A status move as TaskService makes it: the note saved in the move's transaction.
  const move = (task: Task, status: TaskStatus): Task => tasks.update(task.id, { status }, reports.journal(task, status) ?? undefined)
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0)) }

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-channel-reports-'))
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    store = new ChannelStore(database)
    store.saveChannel(channel())
    posts = []
    changes = []
    accepting = true
    draft = null
    reply = null
    condensed = null
    pullRequests = []
    conversationId = null
    now = 1000
    reports = new ChannelTaskReports(store, {
      task: (id) => {
        const task = tasks.get(id)
        return task && { ...task, conversationId }
      },
      draft: () => draft,
      lastReply: () => reply,
      condense: async () => condensed,
      pullRequests: () => pullRequests,
      post: async (post) => {
        if (!accepting) return false
        posts.push(post)
        return true
      },
      changed: (_taskId, list) => changes.push(list)
    }, () => now++)
  })

  afterEach(() => {
    reports.close()
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('notes nothing for a task from no channel, or from one that keeps its tasks\' progress to itself', () => {
    const own = tasks.create('本地任务')
    expect(reports.journal(own, 'running')).toBeNull()
    store.saveChannel(channel({ reportTasks: undefined }))
    const quiet = tasks.create('加导出', { channelSource: source() })
    move(quiet, 'running')
    expect(reports.list(quiet.id)).toEqual([])
  })

  it('saves the note with the move, then posts it under the answer the request had', async () => {
    const task = tasks.create('加导出', { channelSource: source() })
    move(task, 'running')
    expect(reports.list(task.id)).toMatchObject([{ stage: 'start', state: 'pending', channelId: CHANNEL }])
    await reports.drain()
    expect(posts).toMatchObject([{ channelId: CHANNEL, place: 'oc_1', thread: 'om_1', text: `已开始执行：#${shortTaskId(task.id)} 加导出`, mention: null }])
    expect(posts[0]?.reportId).toBe(reports.list(task.id)[0]?.id)
    expect(reports.list(task.id)[0]?.state).toBe('queued')
    expect(changes.at(-1)?.[0]?.state).toBe('queued')
  })

  it('hands in the agent\'s summary with its pull requests, naming the asker', async () => {
    const task = move(tasks.create('加导出', { channelSource: source() }), 'running')
    draft = { text: '列表页加了导出按钮，导出当前筛选的结果。', verification: '在订单列表筛选后点导出。', updatedAt: 1 }
    pullRequests = [{ url: 'https://github.com/acme/app/pull/12' }]
    move(task, 'review')
    await reports.drain()
    expect(posts.at(-1)).toMatchObject({
      mention: 'ou_asker',
      text: `已提交验收：#${shortTaskId(task.id)} 加导出\n\n列表页加了导出按钮，导出当前筛选的结果。\n\n在订单列表筛选后点导出。\n\nPR：https://github.com/acme/app/pull/12`
    })
  })

  it('shortens the last reply when the agent drafted nothing, and says only that it was handed in when that fails', async () => {
    const task = tasks.create('加导出', { channelSource: source() })
    conversationId = 'chat-1'
    const running = move(task, 'running')
    reply = '## 改动\n- 加了导出\n要不要我推送？'
    condensed = '加了导出按钮。'
    const review = move(running, 'review')
    await reports.drain()
    expect(posts.at(-1)?.text).toBe(`已提交验收：#${shortTaskId(task.id)} 加导出\n\n加了导出按钮。`)
    condensed = null
    move(move(review, 'running'), 'review')
    await reports.drain()
    expect(posts.at(-1)?.text).toBe(`已提交验收：#${shortTaskId(task.id)} 加导出`)
    expect(posts.map((post) => post.text.split('：')[0])).toEqual(['已开始执行', '已提交验收', '已开始返工', '已提交验收'])
  })

  it('names the asker in a direct chat and posts at its top; one saved before it knew its thread goes under its message', async () => {
    const direct = tasks.create('直聊', { channelSource: source({ thread: null, direct: true, place: 'oc_dm' }) })
    const older = tasks.create('旧任务', { channelSource: source({ thread: undefined, direct: undefined, messageId: 'om_old' }) })
    move(direct, 'running')
    move(older, 'running')
    await reports.drain()
    expect(posts).toMatchObject([{ place: 'oc_dm', thread: null, mention: 'ou_asker' }, { place: 'oc_1', thread: 'om_old', mention: null }])
  })

  it('does not post what the channel no longer allows, and says why', async () => {
    const task = tasks.create('加导出', { channelSource: source() })
    const cases: [Partial<StoredChannel>, string][] = [[{ enabled: false }, 'channel-off'], [{ reportTasks: false }, 'reports-off'], [{ tenant: 'T2' }, 'tenant-changed']]
    let current = task
    for (const [over, reason] of cases) {
      current = move(current, current.status === 'running' ? 'review' : 'running')
      store.saveChannel(channel(over))
      await reports.drain()
      expect(reports.list(task.id).at(-1)).toMatchObject({ state: 'skipped', reason })
      store.saveChannel(channel())
    }
    expect(posts).toEqual([])
  })

  it('waits while there is nowhere to hand a report to, then posts it', async () => {
    const task = tasks.create('加导出', { channelSource: source() })
    move(task, 'running')
    accepting = false
    await reports.drain()
    expect(reports.list(task.id)[0]?.state).toBe('pending')
    accepting = true
    reports.taskMoved()
    await settle()
    expect(reports.list(task.id)[0]?.state).toBe('queued')
  })

  it('is sent once every post of it is, failed once one is given up on, skipped when its channel goes', async () => {
    const task = tasks.create('加导出', { channelSource: source() })
    const running = move(task, 'running')
    move(running, 'review')
    await reports.drain()
    const [started, handedIn] = reports.list(task.id)
    const outbox = (id: string, reportId: string) => store.addOutbox({ id, channelId: CHANNEL, requestId: null, reportId, op: 'post', payload: { place: 'oc_1', thread: 'om_1', target: null, text: 'x', emoji: null } }, now)
    outbox('55555555-5555-4555-8555-555555555555', started!.id)
    outbox('66666666-6666-4666-8666-666666666666', handedIn!.id)
    outbox('77777777-7777-4777-8777-777777777777', handedIn!.id)
    store.outboxSent('55555555-5555-4555-8555-555555555555', 'om_2')
    reports.posted(started!.id)
    store.outboxSent('66666666-6666-4666-8666-666666666666', 'om_3')
    reports.posted(handedIn!.id)
    expect(reports.list(task.id).map((each) => each.state)).toEqual(['sent', 'queued'])
    store.outboxRetry('77777777-7777-4777-8777-777777777777', null)
    reports.posted(handedIn!.id)
    expect(reports.list(task.id)[1]).toMatchObject({ state: 'failed', reason: 'platform-refused' })

    const later = move(move(tasks.create('另一个', { channelSource: source({ messageId: 'om_9' }) }), 'running'), 'review')
    await reports.drain()
    store.removeChannel(CHANNEL)
    expect(reports.list(later.id).map((each) => [each.state, each.reason])).toEqual([['skipped', 'channel-removed'], ['skipped', 'channel-removed']])
    expect(reports.list(task.id).map((each) => each.state)).toEqual(['sent', 'failed'])
  })
})
