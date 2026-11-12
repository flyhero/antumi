import { isHelper, type Conversation } from './conversation'

// When a conversation is worth telling the user about, between two states of it: the desktop's
// notifications and the phone gateway's pushes both ask this, and word it themselves.

export const conversationWaiting = (conversation: Conversation) => conversation.sessionId !== null && conversation.chat?.turn === 'awaiting'
// The turn is over with a question the agent asked in passing still open.
export const conversationAsking = (conversation: Conversation) => conversation.sessionId !== null && conversation.chat?.turn === 'idle' && conversation.chat.request?.async === true
export const conversationWorking = (conversation: Conversation) => Boolean(conversation.delegation?.open) || conversation.chat?.turn === 'running' || conversation.chat?.turn === 'awaiting'
export const conversationCrashed = (conversation: Conversation) => conversation.sessionId === null && (conversation.lastExit?.code ?? 0) !== 0

export type ConversationAlert = 'crashed' | 'waiting' | 'finished' | 'finishedAsking'

// Judged on the turn, not the task, so a task's chat is told of once. A routine's conversation is
// told of through its run, not here, and a conversation first seen now is not told of at all.
// inSquad: whether a task belongs to a team, whose members are told of only when held up.
export function conversationAlert(before: Conversation | undefined, conversation: Conversation, inSquad: (taskId: string) => boolean): ConversationAlert | null {
  if (isHelper(conversation) || !before || before === conversation || conversation.routineId) return null
  const waitingNow = conversationWaiting(conversation) && !conversationWaiting(before)
  // A group chat's member finishes a turn every round: only one waiting on the user is told of.
  if ((conversation.discussionId || conversation.squadRunId || conversation.parentConversationId) && !waitingNow) return null
  if (conversation.taskId && inSquad(conversation.taskId) && !(conversationWaiting(conversation) || conversationAsking(conversation))) return null
  if (conversationCrashed(conversation) && !conversationCrashed(before)) return 'crashed'
  if (waitingNow) return 'waiting'
  if (conversationWorking(before) && !conversationWorking(conversation)) return conversationAsking(conversation) ? 'finishedAsking' : 'finished'
  return null
}
