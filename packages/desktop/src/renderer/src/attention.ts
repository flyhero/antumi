import { t } from './i18n'
import { isHelper } from '@antumi/protocol'
import { isScheduleOpen, limitOf, PLAN_TOOLS, type AgentKind, type Conversation, type ConversationRequest, type Routine, type ScheduledRun, type SquadRun, type Task } from '@antumi/protocol'

// What waits on the user: a task or a conversation.
export type ActionableTarget = { kind: 'task' | 'conversation'; id: string }
// Where a notification leads when clicked: one of those, the page of routines (for a routine's
// run that has no conversation to show), or an agent's usage card (for quota advice).
export type AttentionTarget = ActionableTarget | { kind: 'routines' } | { kind: 'usage'; agent: AgentKind }

export const targetKey = (target: AttentionTarget): string =>
  target.kind === 'routines' ? 'routines' : target.kind === 'usage' ? `usage:${target.agent}` : `${target.kind}:${target.id}`

export type Notice = { title: string; body: string; target: AttentionTarget }

export type Snapshot = {
  tasks: Readonly<Record<string, Task>>
  conversations: Readonly<Record<string, Conversation>>
  unseen: Readonly<Record<string, true>>
  // The routines, each with how many of its runs are unread; a core without routines has none.
  routines?: readonly Routine[]
  squadRuns?: Readonly<Record<string, SquadRun>>
}

export const waiting = (conversation: Conversation) => conversation.sessionId !== null && conversation.chat?.turn === 'awaiting'
// The turn is over with a question the agent asked in passing still open.
const asking = (conversation: Conversation) => conversation.sessionId !== null && conversation.chat?.turn === 'idle' && conversation.chat.request?.async === true
export const working = (conversation: Conversation) => Boolean(conversation.delegation?.open) || conversation.chat?.turn === 'running' || conversation.chat?.turn === 'awaiting'
const crashed = (conversation: Conversation) => conversation.sessionId === null && (conversation.lastExit?.code ?? 0) !== 0
// Put away by the user: its agent was stopped and it takes no message until it is taken out, so
// nothing in it waits on them.
const archived = (conversation: Conversation) => conversation.archivedAt != null

export type ActionableReason = 'awaiting' | 'crashed' | 'review' | 'reply'
export type ActionableItem = {
  target: ActionableTarget
  title: string
  agent: AgentKind | null
  projectPaths: string[]
  conversationId: string | null
  primaryReason: ActionableReason
  reasons: ActionableReason[]
  // What the agent asks, while it waits; null when the core does not say.
  request: ConversationRequest | null
  updatedAt: number
}

// An approval the list can answer as it stands: allowed this once or denied. A plan, a question,
// or anything with no plain allow wants the chat.
export function quickApproval(request: ConversationRequest | null): request is ConversationRequest & { tool: string } {
  return request?.kind === 'approval' && request.tool !== null && !PLAN_TOOLS.has(request.tool) && request.decisions.includes('allow')
}

const requestOf = (conversation: Conversation | undefined, reasons: readonly ActionableReason[]) =>
  reasons[0] === 'awaiting' || reasons[0] === 'reply' ? conversation?.chat?.request ?? null : null

const REASON_PRIORITY: Record<ActionableReason, number> = { awaiting: 0, crashed: 1, review: 2, reply: 3 }

const waitingOrAsking = (conversation: Conversation | undefined) => Boolean(conversation && (waiting(conversation) || asking(conversation)))

function chatReasons(conversation: Conversation | undefined): ActionableReason[] {
  if (!conversation) return []
  if (waiting(conversation)) return ['awaiting']
  if (crashed(conversation)) return ['crashed']
  if (asking(conversation)) return ['reply']
  return []
}

// Limited cores must not depend on which task chats this window happened to open.
export function actionableItems(s: Pick<Snapshot, 'tasks' | 'conversations' | 'squadRuns'> & { schedules?: readonly ScheduledRun[] }, includeTaskSummaries = true): ActionableItem[] {
  const items: ActionableItem[] = []
  const automaticResumes = new Set((s.schedules ?? []).flatMap((run) =>
    (run.target.kind === 'conversation' || run.target.kind === 'resume') && isScheduleOpen(run) && limitOf(run.target) ? [run.target.conversationId] : []
  ))
  const owned = new Set<string>()
  const byTask = new Map<string, Conversation>()
  for (const conversation of Object.values(s.conversations)) {
    if (isHelper(conversation)) continue
    if (conversation.taskId) {
      owned.add(conversation.id)
      byTask.set(conversation.taskId, conversation)
    }
  }
  for (const task of Object.values(s.tasks)) {
    if (task.conversationId) owned.add(task.conversationId)
    if (task.status === 'done' || task.status === 'abandoned') continue
    const conversation = includeTaskSummaries ? (task.conversationId ? s.conversations[task.conversationId] : undefined) ?? byTask.get(task.id) : undefined
    const reasons = task.squadId && !waitingOrAsking(conversation) ? [] : chatReasons(conversation)
    if (task.status === 'review') reasons.push('review')
    const waitingMember = task.squadId && Object.values(s.conversations).some((member) => member.squadRunId && s.squadRuns?.[member.squadRunId]?.taskId === task.id && waitingOrAsking(member))
    if (!waitingMember && task.awaitingInput && conversation?.chat?.turn !== 'running' && !reasons.includes('awaiting') && !reasons.includes('crashed') && !reasons.includes('reply') &&
      !automaticResumes.has(task.conversationId ?? conversation?.id ?? '')) reasons.push('reply')
    const primaryReason = reasons[0]
    if (!primaryReason) continue
    items.push({
      target: { kind: 'task', id: task.id }, title: task.title, agent: task.agent,
      projectPaths: task.repos.map((repo) => repo.path),
      conversationId: task.conversationId ?? conversation?.id ?? null,
      primaryReason, reasons, request: requestOf(conversation, reasons), updatedAt: task.updatedAt
    })
  }
  for (const conversation of Object.values(s.conversations)) {
    if (isHelper(conversation) || archived(conversation)) continue
    if (owned.has(conversation.id)) continue
    if (conversation.parentConversationId && !waitingOrAsking(conversation)) continue
    if (conversation.squadRunId) {
      const run = s.squadRuns?.[conversation.squadRunId]
      const task = run ? s.tasks[run.taskId] : undefined
      if (!task || task.status === 'done' || task.status === 'abandoned' || !waitingOrAsking(conversation)) continue
      const reasons = conversation.delegation?.open && !waitingOrAsking(conversation) ? [] : chatReasons(conversation)
      const primaryReason = reasons[0]
      if (primaryReason) items.push({ target: { kind: 'task', id: task.id }, title: `${task.title} · ${conversation.title}`, agent: conversation.agent,
        projectPaths: task.repos.map((repo) => repo.path), conversationId: conversation.id, primaryReason, reasons, request: requestOf(conversation, reasons), updatedAt: conversation.updatedAt })
      continue
    }
    const reasons = conversation.delegation?.open && !waitingOrAsking(conversation) ? [] : chatReasons(conversation)
    const primaryReason = reasons[0]
    if (!primaryReason) continue
    items.push({
      target: { kind: 'conversation', id: conversation.id }, title: conversation.title,
      agent: conversation.agent, projectPaths: conversation.projectPaths, conversationId: conversation.id,
      primaryReason, reasons, request: requestOf(conversation, reasons), updatedAt: conversation.updatedAt
    })
  }
  return items.sort((a, b) =>
    REASON_PRIORITY[a.primaryReason] - REASON_PRIORITY[b.primaryReason] || a.updatedAt - b.updatedAt ||
    targetKey(a.target).localeCompare(targetKey(b.target))
  )
}

// The tasks the user must act on for work to go on: an agent asking or waiting for a reply, or one
// that stopped. A task waiting only to be looked over is not, nor is one at work; a squad's task
// with several members asking counts once.
export function tasksWaitingOnUser(items: readonly ActionableItem[]): number {
  return new Set(items.filter((item) => item.target.kind === 'task' && item.reasons.some((reason) => reason !== 'review')).map((item) => targetKey(item.target))).size
}

// How many things wait on the user: an agent asking, a turn that finished while they were
// elsewhere, a task's agent done with its turn, and a routine's runs not yet looked at. A task's
// chat is counted once; a routine's conversation counts through the routine, which keeps the
// unread state, not through what this window saw.
export function attentionCount(s: Snapshot): number {
  const counted = new Set<string>()
  for (const conversation of Object.values(s.conversations)) {
    if (isHelper(conversation) || archived(conversation)) continue
    if (conversation.routineId || (conversation.parentConversationId && !waitingOrAsking(conversation)) || (conversation.squadRunId && !waitingOrAsking(conversation))) continue
    const coordinated = conversation.taskId && s.tasks[conversation.taskId]?.squadId
    if (coordinated && !waitingOrAsking(conversation)) continue
    if (waiting(conversation) || asking(conversation) || s.unseen[conversation.id]) counted.add(conversation.id)
  }
  let count = counted.size
  for (const task of Object.values(s.tasks)) {
    const memberCounted = Object.values(s.conversations).some((member) => member.squadRunId && s.squadRuns?.[member.squadRunId]?.taskId === task.id && counted.has(member.id))
    if (task.awaitingInput && !memberCounted && !(task.conversationId && counted.has(task.conversationId))) count += 1
  }
  for (const routine of s.routines ?? []) count += routine.unread
  return count
}

// A task's chat is told of under the task's name, and leads to the task.
export function named(conversation: Conversation, tasks: Snapshot['tasks'], runs?: Snapshot['squadRuns']): { title: string; target: AttentionTarget } {
  const taskId = conversation.taskId ?? (conversation.squadRunId ? runs?.[conversation.squadRunId]?.taskId : undefined)
  const task = taskId ? tasks[taskId] : undefined
  return task ? { title: task.title, target: { kind: 'task', id: task.id } } : { title: conversation.title, target: { kind: 'conversation', id: conversation.id } }
}

// What to tell the user about between two states: an agent now waiting on them, a turn over, or
// an agent gone. Judged on the turn, not the task, so a task's chat is told of once. A routine's
// conversation is told of through its run (routineNoticesBetween), not here. Without tellWaiting
// an agent now waiting goes untold: the card of waiting requests shows it instead.
export function noticesBetween(prev: Snapshot, next: Snapshot, tellWaiting = true): Notice[] {
  const notices: Notice[] = []
  for (const conversation of Object.values(next.conversations)) {
    if (isHelper(conversation)) continue
    const before = prev.conversations[conversation.id]
    if (!before || before === conversation || conversation.routineId) continue
    // A group chat's member finishes a turn every round: only one waiting on the user is told of.
    if ((conversation.discussionId || conversation.squadRunId || conversation.parentConversationId) && !(waiting(conversation) && !waiting(before))) continue
    if (conversation.taskId && next.tasks[conversation.taskId]?.squadId && !waitingOrAsking(conversation)) continue
    const { title, target } = named(conversation, next.tasks, next.squadRuns)
    if (crashed(conversation) && !crashed(before)) {
      notices.push({ title, body: t('attention.agentExitedUnexpectedlyCodeSendAMessageTo', { value1: conversation.lastExit?.code }), target })
    } else if (waiting(conversation) && !waiting(before)) {
      if (tellWaiting) notices.push({ title, body: t('attention.agentNeedsYourApprovalOrAnswer'), target })
    } else if (working(before) && !working(conversation)) {
      notices.push({ title, body: asking(conversation) ? t('attention.agentFinishedThisTurnAndHasAQuestion') : t('attention.agentFinishedThisTurn'), target })
    }
  }
  return notices
}
