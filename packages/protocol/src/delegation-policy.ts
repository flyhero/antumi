import type { Conversation } from './conversation'

export function canDelegate(conversation: Conversation, squadTask = false): boolean {
  return !(conversation.autoInvestigationId && conversation.workspaceReadOnly) && !conversation.channel && !conversation.parentConversationId && !conversation.discussionId
    && !conversation.squadRunId && !conversation.routineId && !conversation.helperOf && !squadTask && conversation.archivedAt == null
}

export function callerReadOnly(conversation: Pick<Conversation, 'workspaceReadOnly' | 'planOnly' | 'chatOptions'>): boolean {
  return Boolean(conversation.workspaceReadOnly || conversation.planOnly)
    || ['plan', 'readOnly'].includes(conversation.chatOptions?.permissionMode ?? '')
}
