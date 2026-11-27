import { randomUUID } from 'node:crypto'
import { channelPlatform, shortTaskId, type ChannelTaskReport, type ChannelTaskStage, type SourceReport, type Task, type TaskStatus } from '@antumi/protocol'
import type { ChannelStore } from './channel-store'
import type { ChannelTaskCards } from './channel-task-cards'
import type { TaskWriteLink } from './task-store'

// A task collected from a chat platform, followed back in the thread it came from
// (docs/CHANNEL-LOOP.md): each status move is noted in the move's own transaction, then worked out
// and handed to the channel's outbox, which posts it as it does an answer. The task never waits on it.

// Where a report goes and what it says; the channel service makes it fit to post.
export type ReportPost = { channelId: string; reportId: string; place: string; thread: string | null; text: string; mention: string | null; task: Task }

type Hooks = {
  task(id: string): Task | null
  // The tasks a question collected, for their cards once it is answered.
  tasksOf?(requestId: string): Task[]
  // Whether there is a channel service to hand posts to yet; until then reports wait.
  ready?(): boolean
  // Where a channel puts its tasks on cards, what they do in place of plain posts.
  cards?: Pick<ChannelTaskCards, 'active' | 'deliver'>
  // The summary the task's agent drafted with source_report, if it did.
  draft(taskId: string): SourceReport | null
  // The agent's last complete reply, for the small model to shorten when it drafted none.
  lastReply(conversationId: string): string | null
  condense(conversationId: string, platform: string, reply: string): Promise<string | null>
  pullRequests(taskId: string): readonly { url: string }[]
  // False where it cannot be handed over yet (no channel service): the report waits.
  post(report: ReportPost): Promise<boolean>
  changed(taskId: string, reports: ChannelTaskReport[]): void
}

// What a move of a task is to the one who asked for it; null for a move not worth a post. A
// cancelled task reopened goes back to pending or review without anything new having happened.
export function stageOf(from: TaskStatus, to: TaskStatus): ChannelTaskStage | null {
  if (to === 'abandoned') return from === 'abandoned' ? null : 'abandoned'
  if (to === 'running') return from === 'pending' ? 'start' : from === 'review' ? 'rework' : null
  if (to === 'review') return from === 'running' ? 'review' : null
  if (to === 'done') return from === 'pending' ? 'closed' : from === 'running' || from === 'review' ? 'done' : null
  return null
}

// The posts the asker is named in: what waits on them, and how it ended.
const NOTIFIES: ReadonlySet<ChannelTaskStage> = new Set(['review', 'done', 'abandoned'])
const HEADLINE: Record<ChannelTaskStage, string> = {
  created: '已收下', start: '已开始执行', rework: '已开始返工', review: '已提交验收', done: '已完成', closed: '主人已关闭这个任务', abandoned: '主人取消了这个任务'
}

export class ChannelTaskReports {
  private draining = false
  private again = false
  private closed = false

  constructor(private readonly store: ChannelStore, private readonly hooks: Hooks, private readonly now: () => number = Date.now) {}

  list(taskId: string): ChannelTaskReport[] {
    return this.store.reports(taskId)
  }

  // Whether a task's progress goes back to its thread: it came from a channel that says so.
  reporting(task: Pick<Task, 'channelSource'>): boolean {
    const channel = task.channelSource ? this.store.channel(task.channelSource.channelId) : null
    return channel?.reportTasks === true
  }

  // For TaskService to save with a status move, in its transaction. Nothing for a task from no
  // channel, or one whose channel keeps its tasks' progress to itself.
  journal(before: Task, status: TaskStatus): TaskWriteLink | null {
    const stage = stageOf(before.status, status)
    if (!stage || !before.channelSource || !this.reporting(before)) return null
    const at = this.now()
    return this.store.reportLink({ id: randomUUID(), taskId: before.id, channelId: before.channelSource.channelId, stage, state: 'pending', reason: null, createdAt: at, updatedAt: at })
  }

  taskMoved(): void {
    void this.drain()
  }

  // A question has been answered: the tasks it collected get their cards, after the answer, where
  // the channel puts tasks on cards. Once each, however often a retry returned the same task.
  answered(requestId: string): void {
    const tasks = this.hooks.tasksOf?.(requestId) ?? []
    let added = false
    for (const task of tasks) {
      const channel = task.channelSource ? this.store.channel(task.channelSource.channelId) : null
      if (!channel || !this.reporting(task) || !this.hooks.cards?.active(channel)) continue
      if (this.store.reports(task.id).some((each) => each.stage === 'created')) continue
      const at = this.now()
      this.store.addReport({ id: randomUUID(), taskId: task.id, channelId: channel.id, stage: 'created', state: 'pending', reason: null, createdAt: at, updatedAt: at })
      added = true
    }
    if (added) void this.drain()
  }

  // Works out every report not yet handed over, oldest first, so a task's posts keep its order.
  async drain(): Promise<void> {
    if (this.closed) return
    if (this.draining) {
      this.again = true
      return
    }
    this.draining = true
    try {
      do {
        this.again = false
        for (const report of this.store.reportsIn('pending')) {
          if (this.closed) return
          await this.deliver(report).catch((error: unknown) => {
            console.error(`[antumi-core] reporting task ${report.taskId} to its thread failed:`, error instanceof Error ? error.message : error)
            this.settle(report, 'failed', 'compose-failed')
          })
        }
      } while (this.again)
    } finally {
      this.draining = false
    }
  }

  // The outbox has done what it can with a report's posts: it is sent once all are.
  posted(reportId: string): void {
    const report = this.store.report(reportId)
    if (report?.state !== 'queued') return
    const posts = this.store.reportPosts(reportId)
    if (posts.includes('failed')) this.settle(report, 'failed', 'platform-refused')
    else if (posts.length > 0 && posts.every((state) => state === 'sent')) this.settle(report, 'sent', null)
  }

  close(): void {
    this.closed = true
  }

  private async deliver(report: ChannelTaskReport): Promise<void> {
    const task = this.hooks.task(report.taskId)
    const source = task?.channelSource
    if (!task || !source) return this.settle(report, 'skipped', 'task-gone')
    // Asked again now: the channel may have changed since the move.
    const channel = this.store.channel(report.channelId)
    if (!channel) return this.settle(report, 'skipped', 'channel-removed')
    if (!channel.enabled) return this.settle(report, 'skipped', 'channel-off')
    if (channel.reportTasks !== true) return this.settle(report, 'skipped', 'reports-off')
    // The bot now in another workspace cannot post where this one asked.
    if (channel.tenant && channel.tenant !== source.tenant) return this.settle(report, 'skipped', 'tenant-changed')
    if (this.hooks.ready && !this.hooks.ready()) return
    const cards = this.hooks.cards?.active(channel) ? this.hooks.cards : null
    if (report.stage === 'created' && !cards) return this.settle(report, 'skipped', 'cards-off')
    const { headline, summary, links } = await this.compose(report.stage, task, channelPlatform(channel.platform).label)
    if (this.store.report(report.id)?.state !== 'pending') return
    // Cards first: where the asker sees the move on one, no plain post repeats it.
    const onCards = cards ? await cards.deliver(report, task, channel, report.stage === 'review' ? { summary, links } : null) : { replaced: false, sent: 0 }
    let sent = onCards.sent
    if (!onCards.replaced) {
      // A direct chat is the asker's own; in a group only what waits on them, or ends, names them.
      const direct = source.direct ?? this.store.request(source.requestId)?.direct ?? false
      const mention = direct || NOTIFIES.has(report.stage) ? source.asker : null
      const thread = source.thread !== undefined ? source.thread : direct ? null : source.messageId
      const text = [headline, ...summary, ...(links.length ? [`PR：${links.join(' ')}`] : [])].join('\n\n')
      if (await this.hooks.post({ channelId: channel.id, reportId: report.id, place: source.place, thread, text, mention, task })) sent += 1
    }
    if (sent === 0) return this.settle(report, 'skipped', 'nothing-to-post')
    this.settle(report, 'queued', null)
    // Its first posts may have gone while the rest were being drawn.
    this.posted(report.id)
  }

  private async compose(stage: ChannelTaskStage, task: Task, platform: string): Promise<{ headline: string; summary: string[]; links: string[] }> {
    // Antumi's, said outright: the platform may have tasks of its own.
    const headline = `${HEADLINE[stage]}：Antumi 任务 #${shortTaskId(task.id)} ${task.title}`
    if (stage !== 'review') return { headline, summary: [], links: [] }
    return { headline, summary: await this.summary(task, platform), links: this.hooks.pullRequests(task.id).map((link) => link.url) }
  }

  // The agent's own draft first; else its last reply, shortened by the small model; else nothing,
  // and the post says only that the work was handed in.
  private async summary(task: Task, platform: string): Promise<string[]> {
    const draft = this.hooks.draft(task.id)
    if (draft) return [draft.text, ...(draft.verification ? [draft.verification] : [])]
    const reply = task.conversationId ? this.hooks.lastReply(task.conversationId) : null
    if (!reply || !task.conversationId) return []
    const condensed = await this.hooks.condense(task.conversationId, platform, reply).catch(() => null)
    return condensed ? [condensed] : []
  }

  private settle(report: ChannelTaskReport, state: ChannelTaskReport['state'], reason: string | null): void {
    this.store.settleReport(report.id, state, reason, this.now())
    this.hooks.changed(report.taskId, this.store.reports(report.taskId))
  }
}
