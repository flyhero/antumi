import { t } from './i18n'
import { isHelper } from '@antumi/protocol'
import { PLAN_TOOLS, type Conversation, type ConversationRequest } from '@antumi/protocol'
import { actionableItems, named, waiting, working, type ActionableTarget, type Snapshot } from './attention'
import type { AgentKind } from '@antumi/protocol'

// One conversation on the card of waiting requests, under its task's name when it has one.
export type PopupEntry = { conversationId: string; title: string; target: ActionableTarget; request: ConversationRequest }

// What a close puts away: the conversation's requests as they stood, so one more coming up, or
// the oldest answered elsewhere, brings it back.
export const popupKey = (conversationId: string, request: ConversationRequest): string =>
  `${conversationId}:${request.requestId}:${request.open}`

// A turn held up on the user, not a question asked in passing that nothing waits on.
const blocking = (conversation: Conversation): boolean => waiting(conversation) && conversation.chat?.request?.async !== true

// What the card offers, longest waiting first: every chat whose turn waits on the user, a task's
// under the task, less those the user closed the card on.
export function popupQueue(s: Pick<Snapshot, 'tasks' | 'conversations'>, closed: ReadonlySet<string>): PopupEntry[] {
  return actionableItems(s).flatMap((item) => {
    const { conversationId, request } = item
    if (item.primaryReason !== 'awaiting' || !conversationId || !request || request.async) return []
    if (closed.has(popupKey(conversationId, request))) return []
    return [{ conversationId, title: item.title, target: item.target, request }]
  })
}

// One chat on the island while nothing is asked: its agent at work, or a reply the user has not
// looked at (as the main window says, which alone knows). Under its task's name when it has
// one, most recently active first. A chat held up on the user is on the card instead.
export type ActivityEntry = { conversationId: string; title: string; target: ActionableTarget; agent: AgentKind; state: 'running' | 'replied' }

export function islandActivity(s: Pick<Snapshot, 'tasks' | 'conversations'>, unseen: ReadonlySet<string>): ActivityEntry[] {
  return Object.values(s.conversations)
    .flatMap((conversation) => {
      if (isHelper(conversation) || conversation.archivedAt != null || waiting(conversation)) return []
      const state: ActivityEntry['state'] | null = working(conversation) ? 'running' : unseen.has(conversation.id) ? 'replied' : null
      if (!state) return []
      const { title, target } = named(conversation, s.tasks)
      return [{ conversation, entry: { conversationId: conversation.id, title, target: target.kind === 'task' ? target : { kind: 'conversation' as const, id: conversation.id }, agent: conversation.agent, state } }]
    })
    .sort((a, b) => b.conversation.updatedAt - a.conversation.updatedAt)
    .map(({ entry }) => entry)
}

// What the card's header marks the request as: a question, a plan to approve, or a permission.
export type PopupKind = 'question' | 'plan' | 'permission'
export function popupKind(request: ConversationRequest): PopupKind {
  if (request.kind === 'question') return 'question'
  return request.tool !== null && PLAN_TOOLS.has(request.tool) ? 'plan' : 'permission'
}

export function popupLabel(request: ConversationRequest): string {
  const kind = popupKind(request)
  return kind === 'question' ? t('requestPopup.hasAQuestion') : kind === 'plan' ? t('requestPopup.planAwaitingApproval') : t('requestPopup.awaitingYourPermission')
}

// Whether the card is worth bringing up: a chat now held up on the user, or held up on something
// more than before. A chat seen for the first time is not news (the list arriving on connect).
export function newlyWaiting(prev: Snapshot['conversations'], next: Snapshot['conversations']): boolean {
  return Object.values(next).some((conversation) => {
    if (isHelper(conversation)) return false
    const before = prev[conversation.id]
    if (!before || before === conversation || !blocking(conversation)) return false
    if (!blocking(before)) return true
    const was = before.chat?.request
    const is = conversation.chat?.request
    return was?.requestId !== is?.requestId || (is?.open ?? 0) > (was?.open ?? 0)
  })
}
