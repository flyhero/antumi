import { agentDescriptor, type Conversation } from '@antumi/protocol'

// What the user may do in a conversation another one manages (a delegation's member, a squad's)
// while its agent is at work. steer: put a message into the turn it runs, where the agent takes
// one there. Everything else stays with the conversation that manages it.
export type ManagedInput = 'steer'

type Managed = Pick<Conversation, 'agent' | 'sessionId' | 'chat' | 'parentConversationId' | 'squadRunId' | 'archivedAt'>

// steerable: what the running stage says of its turn (a review or a compaction takes nothing).
// features: the core's, as an older one refuses any message here.
export function managedInput(conversation: Managed, steerable: boolean, features: readonly string[]): ManagedInput | null {
  if (!conversation.parentConversationId && !conversation.squadRunId) return null
  const { chat } = conversation
  const working = conversation.sessionId !== null && conversation.archivedAt == null && Boolean(chat) && !chat?.betweenTurns && (chat?.turn === 'running' || chat?.turn === 'awaiting')
  if (!working) return null
  return features.includes('managed-steer') && steerable && agentDescriptor(conversation.agent).capabilities.managedSteer ? 'steer' : null
}
