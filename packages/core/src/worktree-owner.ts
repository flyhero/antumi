import { shortTaskId, type Conversation } from '@antumi/protocol'

// Which of the conversations working in a worktree it goes by, given the <id> its folder is named
// after: one still in the list before an archived one, since only those can be worked in; among
// them the one that made it, else the one last active. Branch hints and the worktree list agree.
export function worktreeOwner<C extends Pick<Conversation, 'id' | 'taskId' | 'archivedAt' | 'updatedAt'>>(users: readonly C[], made: string): C | undefined {
  const rank = (conversation: C) => (conversation.archivedAt != null ? 2 : 0) + (shortTaskId(conversation.id) === made || (conversation.taskId && shortTaskId(conversation.taskId) === made) ? 0 : 1)
  return [...users].sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt)[0]
}
