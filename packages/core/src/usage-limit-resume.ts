import { quotaVerdict, type AgentKind, type AgentUsage, type ChatItem, type Conversation, type LimitRef } from '@antumi/protocol'
import type { ConversationService } from './conversation-service'
import { Rejection } from './rejection'
import { GRACE_MS, ScheduleService, type LimitRun } from './schedule-service'

// A limit item older than this when core first sees it was replayed from a log written before
// core knew to act on it: it is shown, not acted on.
const FRESH_MS = 5 * 60_000

type LimitItem = Extract<ChatItem, { kind: 'usageLimit' }>

// Why a resume was cancelled from the card's checkbox: the card then stays, unchecked, for the
// user to check again or retry, where a resume cancelled for other reasons is over.
export const AUTO_CONTINUE_OFF = 'auto-continue-off'

// How many limits in a row, with no turn finishing between them, core goes on from by itself: a
// limit that does not lift (a provider that never says when) would otherwise be retried all night,
// every 15 minutes. The next one is left to the user.
export const AUTO_CONTINUE_LIMIT = 3
export const AUTO_CONTINUE_STOPPED = 'auto-continue-stopped'

// Turns a usage limit the agent reports into a scheduled resume, and reads the run back onto the
// limit's card: whether core goes on by itself, when, and how it went. The waiting and the
// starting are the ScheduleService's; this only speaks the card's language for them.
export class UsageLimitResumes {
  constructor(
    private readonly schedules: ScheduleService,
    private readonly conversations: Pick<ConversationService, 'get' | 'chatItem' | 'stages'>,
    private readonly usage: { list(): AgentUsage[] },
    // Items with core's plan for them, for the clients watching the conversation.
    private readonly emit: (conversationId: string, items: ChatItem[]) => void,
    private readonly now: () => number = Date.now,
    // Moves an agent off an account that ran out, to one with quota: the account, or null.
    private readonly switchAccount: (agent: AgentKind, spent: string) => string | null = () => null
  ) {}

  // Limits each conversation ran into since a turn last finished or the user last acted. Kept in
  // memory: a restart starts the count over, which only allows a few more tries.
  private readonly streaks = new Map<string, number>()

  // Limit items as a live stage puts them out. A new one is the conversation's limit now; one a
  // replay brings back is already known, or too old to act on.
  observe(conversationId: string, items: readonly ChatItem[]): void {
    for (const item of items) {
      if (item.kind === 'turn' && item.state === 'completed') this.streaks.delete(conversationId)
      if (item.kind !== 'usageLimit' || this.now() - item.at >= FRESH_MS || this.schedules.runForLimit(refOf(item))) continue
      const conversation = this.conversation(conversationId)
      if (!conversation) continue
      const streak = (this.streaks.get(conversationId) ?? 0) + 1
      this.streaks.set(conversationId, streak)
      const switchedTo = this.switchedTo(conversationId, item)
      this.schedules.createResume(conversationId, refOf(item), item.resetsAt ?? this.resetFromUsage(conversation), {
        ...(switchedTo ? { switchedTo } : {}), ...(streak > AUTO_CONTINUE_LIMIT ? { stopped: AUTO_CONTINUE_STOPPED } : {})
      })
    }
  }

  // Where the stage that ran out was on one of its agent's accounts, the account it goes on on.
  private switchedTo(conversationId: string, item: LimitItem): string | null {
    const stage = this.conversations.stages(conversationId).find((each) => each.id === item.stageId)
    if (!stage?.account || stage.route) return null
    return this.switchAccount(stage.agent, stage.account)
  }

  // Limit items with core's plan for them; one core never planned for is shown as settled.
  decorate(items: readonly ChatItem[]): ChatItem[] {
    if (!items.some((item) => item.kind === 'usageLimit')) return [...items]
    return items.map((item) => (item.kind === 'usageLimit' ? withRun(item, this.schedules.runForLimit(refOf(item))) : item))
  }

  // The card's checkbox: on makes a resume where none waits; off cancels the resume, or lets a
  // user's run that took the limit over keep going without it.
  setAutoContinue(conversationId: string, stageId: string, itemId: string, autoContinue: boolean): void {
    const limit = { stageId, itemId }
    const run = this.schedules.runForLimit(limit)
    const open = run !== null && (run.status === 'waiting' || run.status === 'starting')
    if (autoContinue) {
      if (open) return
      if (run?.status === 'started') throw new Rejection('usage-limit-settled', 'this usage limit was already continued')
      const item = this.conversations.chatItem(conversationId, stageId, itemId)
      if (item?.kind !== 'usageLimit') throw new Rejection('usage-limit-not-found', 'no such usage limit in this conversation')
      const conversation = this.conversations.get(conversationId)
      // Ticked again by the user: core may go on by itself as at first.
      this.streaks.delete(conversationId)
      this.schedules.createResume(conversationId, limit, item.resetsAt ?? this.resetFromUsage(conversation))
      return
    }
    if (!run || run.status !== 'waiting') return
    if (run.target.kind === 'resume') this.schedules.cancel(run.id, AUTO_CONTINUE_OFF)
    else this.schedules.unbind(run.id)
  }

  // Goes on now, the way the timer would, but without waiting to see the limit lifted: the user
  // may know better. Resolves once the message is out, or rejects with why it is not.
  async retry(conversationId: string, stageId: string, itemId: string): Promise<void> {
    const limit = { stageId, itemId }
    const run = this.schedules.runForLimit(limit)
    if (!run || run.status === 'starting') throw new Rejection('usage-limit-busy', 'this usage limit is already being retried or settled')
    // An unticked or stopped card still offers to go on: a resume made for this try alone.
    const unticked = run.status === 'cancelled' && (run.error === AUTO_CONTINUE_OFF || run.error === AUTO_CONTINUE_STOPPED)
    if (!unticked && run.status !== 'waiting') throw new Rejection('usage-limit-settled', 'this usage limit is no longer waiting')
    if (unticked) this.streaks.delete(conversationId)
    const id = unticked ? this.schedules.createResume(conversationId, limit, run.resetsAt, { held: true }).id : run.id
    try {
      await this.schedules.runNow(id)
    } catch (error) {
      if (error instanceof Rejection && error.reason === 'schedule-busy') throw new Rejection('usage-limit-busy', error.message)
      throw new Rejection('usage-limit-retry-failed', error instanceof Error ? error.message : String(error))
    }
  }

  // When a user action begins, for cancelFor: the limit that action itself runs into comes after.
  mark(): number {
    return this.now()
  }

  // The user went on another way (sent a message, stopped the agent): a resume from before would
  // now continue out of nowhere. A limit their own message hit stays.
  cancelFor(conversationId: string, before: number): void {
    this.streaks.delete(conversationId)
    this.schedules.userActed(conversationId, before)
  }

  // The run for a limit changed: its card says so.
  announce(conversationId: string, limit: LimitRef): void {
    const item = this.conversations.chatItem(conversationId, limit.stageId, limit.itemId)
    if (item?.kind === 'usageLimit') this.emit(conversationId, [withRun(item, this.schedules.runForLimit(limit))])
  }

  // When the window holding the agent back lifts, by core's latest reading of its usage. A
  // conversation on a model provider is held back by the provider's limit, which that says nothing of.
  private resetFromUsage({ agent, route }: Pick<Conversation, 'agent' | 'route'>): number | null {
    if (route?.reason === 'served') return null
    const verdict = quotaVerdict(this.usage.list().find((usage) => usage.agent === agent), this.now())
    return verdict.state === 'exhausted' ? (verdict.window?.resetsAt ?? null) : null
  }

  private conversation(id: string) {
    try {
      return this.conversations.get(id)
    } catch {
      return null
    }
  }
}

function refOf(item: LimitItem): LimitRef {
  return { stageId: item.stageId, itemId: item.id }
}

// The card's fields from the run's: waiting with a time while core means to go on; waiting
// unchecked once it gave up, so the user can still retry; continued once it went out.
function withRun(item: LimitItem, run: LimitRun | null): LimitItem {
  if (!run) return { ...item, autoContinue: false, status: 'cancelled', continueAt: null, continuedAt: null, error: null, runId: null }
  const resetsAt = run.resetsAt ?? item.resetsAt
  const switchedTo = run.target.kind === 'resume' ? run.target.switchedTo ?? null : null
  const base = { ...item, resetsAt, runId: run.id, continuedAt: null, continueAt: null, switchedTo }
  switch (run.status) {
    case 'waiting': {
      const planned = Math.max(run.notBefore ?? 0, run.checkAt ?? 0)
      return { ...base, status: 'waiting', autoContinue: true, error: run.error, continueAt: planned || (resetsAt === null ? null : resetsAt + GRACE_MS) }
    }
    case 'starting':
      return { ...base, status: 'retrying', autoContinue: true, error: run.error }
    case 'started':
      return { ...base, status: 'continued', autoContinue: true, error: null, continuedAt: run.settledAt }
    case 'failed':
      return { ...base, status: 'waiting', autoContinue: false, error: run.error }
    case 'cancelled':
      if (run.error === AUTO_CONTINUE_STOPPED) return { ...base, status: 'waiting', autoContinue: false, error: null, autoContinueStopped: true }
      return run.error === AUTO_CONTINUE_OFF
        ? { ...base, status: 'waiting', autoContinue: false, error: null }
        : { ...base, status: 'cancelled', autoContinue: false, error: null }
  }
}
