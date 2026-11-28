import { agentDescriptor, type Conversation } from '@antumi/protocol'

// What the user may do in a conversation another one manages (a delegation's member, a squad's)
// while its agent is at work. steer: put a message into the turn it runs, where the agent takes
// one there. redirect: for a delegation whose agent takes none, interrupt it and have it go on with
// what they add. Neither falls back to the other, and everything else stays with the conversation
// that manages it. A squad's member has no going on to redirect into, only a retry in a new conversation.
export type ManagedInput = 'steer' | 'redirect'

type Managed = Pick<Conversation, 'agent' | 'sessionId' | 'chat' | 'parentConversationId' | 'agentCallId' | 'squadRunId' | 'archivedAt'>

// steerable: what the running stage says of its turn (a review or a compaction takes nothing).
// features: the core's, as an older one refuses any message here.
export function managedInput(conversation: Managed, steerable: boolean, features: readonly string[]): ManagedInput | null {
  if (!conversation.parentConversationId && !conversation.squadRunId) return null
  const { chat } = conversation
  const working = conversation.sessionId !== null && conversation.archivedAt == null && Boolean(chat) && !chat?.betweenTurns && (chat?.turn === 'running' || chat?.turn === 'awaiting')
  if (!working) return null
  if (features.includes('managed-steer') && steerable && agentDescriptor(conversation.agent).capabilities.managedSteer) return 'steer'
  return features.includes('agent-call-redirect') && conversation.parentConversationId && conversation.agentCallId ? 'redirect' : null
}
