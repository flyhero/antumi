import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ChannelFields, type ChannelTaskFeedback, type SourceReport, type Task, type TaskChannelSource, type TaskStatus } from '@antumi/protocol'
import { ChannelStore, type StoredChannel } from './channel-store'
import { ChannelTaskCards, type CardClick, type CardOut } from './channel-task-cards'
import { ChannelTaskReports, type ReportPost } from './channel-task-reports'
import { Rejection } from './rejection'
import { TaskStore } from './task-store'

const PROFILE = '11111111-1111-4111-8111-111111111111'
const CHANNEL = '22222222-2222-4222-8222-222222222222'
const REQUEST = '33333333-3333-4333-8333-333333333333'
const DAY = 24 * 60 * 60_000

const Button = z.object({ tag: z.literal('button'), text: z.object({ content: z.string() }).loose(), behaviors: z.tuple([z.object({ value: z.object({ t: z.string() }) }).loose()]) }).loose()
// The buttons of a drawn card, by label, with the token each carries.
function buttons(content: unknown): Map<string, string> {
  const found = new Map<string, string>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    const button = Button.safeParse(node)
    if (button.success) found.set(button.data.text.content, button.data.behaviors[0].value.t)
    Object.values(node).forEach(walk)
  }
  walk(content)
  return found
}

// The cards over a real task store and channel store, with the reporter that hands them each move;
// what core would do on a click (start, accept, …) only moves the task here.
describe('task cards', () => {
  let root: string
  let tasks: TaskStore
  let store: ChannelStore
  let cards: ChannelTaskCards
  let reports: ChannelTaskReports
  let sends: CardOut[]
  let texts: ReportPost[]
  let calls: string[]
  let feedbackSeen: ChannelTaskFeedback[][]
  let startFails: unknown
  let draft: SourceReport | null
  let now: number
  let clicks: number

  const channel = (over: Partial<StoredChannel> = {}): StoredChannel => ({
    ...ChannelFields.parse({ profileId: PROFILE, platform: 'feishu', allowTaskCreation: true, reportTasks: true, allowedUsers: ['ou_asker', 'ou_owner'], allowedPlaces: ['oc_1'], allowDirect: true }),
    ownerUsers: ['ou_owner'], taskCards: { start: true, review: 'ownerOrAsker' },
    id: CHANNEL, profileId: PROFILE, platform: 'feishu', tenant: 'T1', tenantName: 'Acme', botUserId: 'ou_bot', createdAt: 1, updatedAt: 1, ...over
  })
  const source = (over: Partial<TaskChannelSource> = {}): TaskChannelSource => ({
    channelId: CHANNEL, requestId: REQUEST, conversationId: '44444444-4444-4444-8444-444444444444', platform: 'feishu',
    tenant: 'T1', asker: 'ou_asker', place: 'oc_1', messageId: 'om_1', thread: 'om_1', direct: false, text: '加一个导出按钮', createdAt: 1, ...over
  })
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0)) }
  // A status move as TaskService makes one, with its report.
  const move = (id: string, status: TaskStatus) => {
    const task = tasks.get(id)!
    tasks.update(id, { status }, reports.journal(task, status) ?? undefined)
    reports.taskMoved()
  }
  const collected = async (over: Partial<TaskChannelSource> = {}) => {
    const task = tasks.create('加导出', { details: '在订单列表加导出按钮。', repos: [{ path: '/Users/owner/app', worktreePath: null, branch: null, startRef: null, start: null }], channelSource: source(over) })
    reports.answered(task.channelSource!.requestId)
    await settle()
    return task
  }
  const latest = (kind: 'task' | 'review' | 'rework') => sends.findLast((out) => out.card.kind === kind)
  // A click on the button of the last card of a kind that still shows it.
  const press = async (kind: 'task' | 'review' | 'rework', label: string, user: string, form: Record<string, string> = {}, over: Partial<CardClick> = {}) => {
    const token = sends.filter((out) => out.card.kind === kind).map((out) => buttons(out.content).get(label)).findLast(Boolean)
    if (!token) throw new Error(`no ${label} on the ${kind} card`)
    clicks += 1
    const toast = await cards.click({ channelId: CHANNEL, eventKey: `card:${clicks}`, tenant: 'T1', user, place: 'oc_1', messageId: 'om_card', token, form, ...over })
    await settle()
    return toast
  }
  const handIn = async (task: Task) => {
    move(task.id, 'running')
    await settle()
    draft = { text: '订单列表加了导出按钮。', verification: '筛选后点导出。', updatedAt: 1 }
    move(task.id, 'review')
    await settle()
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-task-cards-'))
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    store = new ChannelStore(database)
    store.saveChannel(channel())
    sends = []
    texts = []
    calls = []
    feedbackSeen = []
    startFails = null
    draft = null
    now = 1_000_000
    clicks = 0
    cards = new ChannelTaskCards(store, {
      task: (id) => tasks.get(id),
      start: async (task) => {
        calls.push('start')
        if (startFails) throw startFails
        move(task.id, 'running')
      },
      cancel: async (id) => { calls.push('cancel'); move(id, 'abandoned') },
      accept: async (id) => { calls.push('accept'); move(id, 'done') },
      rework: async (id, reason) => { calls.push(`rework:${reason}`); move(id, 'running') },
      send: (out) => sends.push(out),
      clean: async (_channel, _task, text) => text.replaceAll('/Users/owner', '~'),
      feedbackChanged: (_id, list) => feedbackSeen.push(list)
    }, () => now)
    reports = new ChannelTaskReports(store, {
      task: (id) => tasks.get(id),
      tasksOf: (requestId) => tasks.list().filter((each) => each.channelSource?.requestId === requestId),
      ready: () => true,
      cards,
      draft: () => draft,
      lastReply: () => null,
      condense: async () => null,
      pullRequests: () => [{ url: 'https://github.com/acme/app/pull/7' }],
      post: async (post) => { texts.push(post); return true },
      changed: () => {}
    }, () => now)
  })

  afterEach(() => {
    reports.close()
    store.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('are only for a channel that asks for them, names an owner, and is on a platform with cards', () => {
    expect(cards.active(channel())).toBe(true)
    expect(cards.active(channel({ taskCards: null }))).toBe(false)
    expect(cards.active(channel({ ownerUsers: [] }))).toBe(false)
    expect(cards.active(channel({ platform: 'slack' }))).toBe(false)
    expect(cards.active(channel({ platform: 'lark' }))).toBe(true)
  })

  it('posts the task card under the request once it is answered, and starts the task for the owner alone', async () => {
    const task = await collected()
    expect(sends).toHaveLength(1)
    expect(sends[0]).toMatchObject({ op: 'card', channelId: CHANNEL, card: { kind: 'task', place: 'oc_1', thread: 'om_1', recipient: null } })
    const shown = JSON.stringify(sends[0]?.content)
    expect([...buttons(sends[0]?.content).keys()]).toEqual(['开始执行', '不做'])
    expect(shown).toContain('提出：<at id=ou_asker></at>')
    expect(shown).toContain('项目：app')
    expect(shown).not.toContain(task.id.slice(9))
    reports.answered(REQUEST)
    await settle()
    expect(sends).toHaveLength(1)

    expect(await press('task', '开始执行', 'ou_asker')).toEqual({ kind: 'warning', text: '只有主人能开始执行。' })
    expect(calls).toEqual([])
    expect(await press('task', '开始执行', 'ou_owner')).toEqual({ kind: 'success', text: '已开始执行。' })
    expect(calls).toEqual(['start'])
    expect(tasks.get(task.id)?.status).toBe('running')
    // The asker sees it start on the card: no plain post repeats it.
    expect(sends.at(-1)).toMatchObject({ op: 'update', card: { kind: 'task' } })
    expect(JSON.stringify(sends.at(-1)?.content)).toContain('由 <at id=ou_owner></at> 在卡片上开始')
    expect(buttons(sends.at(-1)?.content).size).toBe(0)
    expect(texts).toEqual([])
    expect(await press('task', '不做', 'ou_owner')).toEqual({ kind: 'info', text: '任务已经变了，卡片已更新。' })
  })

  it('says on the card why a start failed, and lets the owner click again', async () => {
    await collected()
    startFails = new Rejection('agent-capacity')
    expect(await press('task', '开始执行', 'ou_owner')).toEqual({ kind: 'error', text: '没能开始：执行的 Agent 没有空位了' })
    expect(JSON.stringify(sends.at(-1)?.content)).toContain('没能开始：执行的 Agent 没有空位了')
    startFails = null
    expect(await press('task', '开始执行', 'ou_owner')).toEqual({ kind: 'success', text: '已开始执行。' })
    expect(JSON.stringify(sends.at(-1)?.content)).not.toContain('没能开始')
  })

  it('cancels a task the owner declines', async () => {
    const task = await collected()
    expect(await press('task', '不做', 'ou_owner')).toEqual({ kind: 'success', text: '已取消这个任务。' })
    expect(tasks.get(task.id)?.status).toBe('abandoned')
    expect(JSON.stringify(sends.at(-1)?.content)).toContain('<at id=ou_owner></at> 选择不做')
    expect(texts.map((post) => post.text.split('：')[0])).toEqual(['主人取消了这个任务'])
  })

  it('hands the task in on a review card the asker accepts', async () => {
    const task = await collected()
    await handIn(task)
    const review = latest('review')
    expect(review).toMatchObject({ op: 'card', card: { kind: 'review', place: 'oc_1', thread: 'om_1' } })
    const shown = JSON.stringify(review?.content)
    expect(shown).toContain('订单列表加了导出按钮。')
    expect(shown).toContain('PR：https://github.com/acme/app/pull/7')
    expect(shown).toContain('<at id=ou_asker></at> 请验收')
    expect(texts).toEqual([])
    expect(await press('review', '通过', 'ou_asker')).toEqual({ kind: 'success', text: '已验收，任务完成。' })
    expect(tasks.get(task.id)?.status).toBe('done')
    expect(texts.map((post) => post.text.split('：')[0])).toEqual(['已完成'])
    const after = sends.filter((out) => out.op === 'update' && out.card.kind === 'review').at(-1)
    expect(JSON.stringify(after?.content)).toContain('<at id=ou_asker></at> 已验收')
    expect(buttons(after?.content).size).toBe(0)
  })

  it('keeps an asker\'s reason for the owner to decide on, and goes on at once with the owner\'s', async () => {
    const task = await collected()
    await handIn(task)
    expect(await press('review', '退回', 'ou_asker')).toEqual({ kind: 'warning', text: '退回要写原因。' })
    expect(await press('review', '退回', 'ou_asker', { reason: '按钮颜色不对' })).toEqual({ kind: 'success', text: '已退回，主人确认后会返工。' })
    expect(calls).toEqual([])
    expect(tasks.get(task.id)?.status).toBe('review')
    expect(cards.feedback(task.id)).toMatchObject([{ author: 'ou_asker', text: '按钮颜色不对', usedAt: null }])
    expect(feedbackSeen.at(-1)).toHaveLength(1)
    expect(latest('rework')).toMatchObject({ op: 'card', card: { kind: 'rework', place: 'oc_1', thread: 'om_1' } })
    expect(JSON.stringify(latest('rework')?.content)).toContain('<at id=ou_owner></at> 请决定是否返工')
    expect(JSON.stringify(sends.filter((out) => out.op === 'update' && out.card.kind === 'review').at(-1)?.content)).toContain('等主人决定是否返工')

    expect(await press('rework', '继续执行', 'ou_asker')).toEqual({ kind: 'warning', text: '只有主人能决定返工。' })
    expect(await press('rework', '继续执行', 'ou_owner')).toEqual({ kind: 'success', text: '已开始返工。' })
    expect(calls).toEqual(['rework:按钮颜色不对'])
    expect(tasks.get(task.id)?.status).toBe('running')
    expect(cards.feedback(task.id)[0]?.usedAt).toBe(now)

    draft = { text: '改了按钮颜色。', updatedAt: 2 }
    move(task.id, 'review')
    await settle()
    expect(await press('review', '退回', 'ou_owner', { reason: '还要加图标' })).toEqual({ kind: 'success', text: '已退回，正在返工。' })
    expect(calls).toEqual(['rework:按钮颜色不对', 'rework:还要加图标'])
    expect(cards.feedback(task.id).map((each) => [each.author, each.usedAt !== null])).toEqual([['ou_asker', true], ['ou_owner', true]])
  })

  it('goes on with the asker\'s reason from Antumi too', async () => {
    const task = await collected()
    await handIn(task)
    await press('review', '退回', 'ou_asker', { reason: '按钮颜色不对' })
    expect((await cards.continueTask(task.id))[0]?.usedAt).toBe(now)
    expect(calls).toEqual(['rework:按钮颜色不对'])
    await expect(cards.continueTask(task.id)).rejects.toMatchObject({ reason: 'invalid-transition' })
  })

  it('lets only the owner review where the channel says so', async () => {
    store.saveChannel(channel({ taskCards: { start: true, review: 'owner' } }))
    const task = await collected()
    await handIn(task)
    expect(JSON.stringify(latest('review')?.content)).toContain('<at id=ou_owner></at> 请验收')
    expect(await press('review', '通过', 'ou_asker')).toEqual({ kind: 'warning', text: '只有主人能验收。' })
    expect(await press('review', '通过', 'ou_owner')).toMatchObject({ kind: 'success' })
  })

  it('posts plain progress and no review card where reviews are not on cards', async () => {
    store.saveChannel(channel({ taskCards: { start: false, review: null } }))
    const task = await collected()
    expect([...buttons(sends[0]?.content).keys()]).toEqual(['不做'])
    expect(JSON.stringify(sends[0]?.content)).toContain('请主人在 Antumi 里开始。')
    move(task.id, 'running')
    await settle()
    move(task.id, 'review')
    await settle()
    expect(latest('review')).toBeUndefined()
    expect(texts.map((post) => post.text.split('：')[0])).toEqual(['已提交验收'])
  })

  it('refuses a click from another workspace, of a token it never gave or that ran out, and once cards are off', async () => {
    await collected()
    expect(await press('task', '开始执行', 'ou_owner', {}, { tenant: 'T2' })).toMatchObject({ kind: 'error', text: '不能处理其他组织的操作。' })
    expect(await cards.click({ channelId: CHANNEL, eventKey: 'card:x', tenant: 'T1', user: 'ou_owner', place: 'oc_1', messageId: 'om_card', token: 'made-up', form: {} })).toMatchObject({ kind: 'error', text: '这个按钮已失效。' })
    now += 31 * DAY
    expect(await press('task', '开始执行', 'ou_owner')).toMatchObject({ kind: 'error', text: '按钮已过期，请在 Antumi 里处理。' })
    now -= 31 * DAY
    store.saveChannel(channel({ taskCards: null }))
    expect(await press('task', '开始执行', 'ou_owner')).toMatchObject({ kind: 'error', text: '主人已关闭卡片操作，请在 Antumi 里处理。' })
    store.saveChannel(channel({ enabled: false }))
    expect(await press('task', '开始执行', 'ou_owner')).toMatchObject({ kind: 'error' })
    expect(calls).toEqual([])
  })

  it('sends the owner\'s cards to them directly when the request came in a direct chat, and tells the asker in plain posts', async () => {
    const task = await collected({ place: 'oc_dm', thread: null, direct: true, messageId: 'om_dm' })
    expect(sends[0]).toMatchObject({ op: 'card', card: { kind: 'task', place: 'user:ou_owner', recipient: 'ou_owner', thread: null } })
    await press('task', '开始执行', 'ou_owner')
    expect(texts).toMatchObject([{ place: 'oc_dm', thread: null, mention: 'ou_asker', text: expect.stringMatching(/^已开始执行/) }])
    await handIn(tasks.get(task.id)!)
    // Where the asker may review, the review card is theirs.
    expect(latest('review')).toMatchObject({ card: { place: 'oc_dm', recipient: null } })
  })

  it('does not draw a card again that has not changed, nor one too old to be', async () => {
    const task = await collected()
    const count = sends.length
    await cards.refresh(tasks.get(task.id)!, channel(), null)
    expect(sends).toHaveLength(count)
    now += 14 * DAY
    move(task.id, 'running')
    await settle()
    expect(sends.filter((out) => out.op === 'update')).toEqual([])
    // With no card to show it, the move is a plain post.
    expect(texts.map((post) => post.text.split('：')[0])).toEqual(['已开始执行'])
  })
})
