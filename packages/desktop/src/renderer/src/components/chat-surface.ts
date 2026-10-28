import { t } from '../i18n'
import { createContext, useContext } from 'react'
import type { AgentKind, ChatItem, Conversation } from '@antumi/protocol'
import type { PlanItem } from '../chat-state'
import { showBrowserPanel, showConversationChanges, showConversationPlan, showInspectorFile } from '../core-store'
import { insideProjects, locateInspectorFile, type ChatEdit } from '../inspector-file'
import type { BranchTarget } from './BranchStatus'
import { continueConversation } from './ConversationActions'

// What the chat view does beyond itself, which a free conversation and a task's chat do differently:
// where its plans and changes open, how an agent gets ready for a message, and what a plan offers.
export type ChatSurface = {
  // Which inspector the chat's side panel is: a task's or a free conversation's.
  inspector: 'task' | 'conversation'
  // The side panel on a plan (by item key; null for the newest), or on the changes.
  showPlan(key: string | null): void
  showChanges(): void
  // A file's diff in the inspector; edit is where the turn changed it, the way back once git has nothing.
  showFileChange(path: string, edit: ChatEdit): void
  // Whether a file lies in the projects `changes` covers; git shows nothing of one outside them.
  inProject(path: string): boolean
  // The browser panel, on this conversation's tab.
  showBrowser(): void
  // Whose uncommitted changes the chip counts, and what the chip says of them; null for none.
  changes: BranchTarget | null
  changesHint: string
  // Readies an agent for a message, when none runs or when its owner needs a word first; false if
  // that failed and the message should stay.
  prepareSend(stopped: boolean): Promise<boolean>
  // Why nothing can be sent now, or null.
  sendBlocker: string | null
  handoffPlan?: (item: PlanItem) => void
  // Where a squad's leader planned the task: starts the squad on the plan, the leader leading it.
  squadStart?: { name: string; start(item: PlanItem): Promise<void> }
  // Keeps a plan for later, where the chat may only plan; null elsewhere.
  savePlan: ((item: PlanItem) => Promise<void>) | null
  // A word on a plan the chat's owner kept, or null.
  planNote(item: PlanItem): string | null
  // Opens the handoff, to the agent named or else the other one; null where the chat cannot be
  // handed off now.
  handoff: ((agent?: AgentKind) => void) | null
  // Forks the conversation at a message into a new one; null where it cannot be (a task's, or
  // a core without forks).
  fork: ((item: ChatItem) => void) | null
}

export const ChatSurfaceContext = createContext<ChatSurface | null>(null)

export function useChatSurface(): ChatSurface {
  const surface = useContext(ChatSurfaceContext)
  if (!surface) throw new Error('the chat view is shown outside a chat surface')
  return surface
}

// A free conversation: its own inspector, its projects' changes, and chat mode to continue in.
export function conversationSurface(conversation: Conversation, handoff: ((agent?: AgentKind) => void) | null = null, fork: ((item: ChatItem) => void) | null = null): ChatSurface {
  return {
    inspector: 'conversation',
    showPlan: showConversationPlan,
    showChanges: showConversationChanges,
    showFileChange: (path, edit) => {
      const found = locateInspectorFile(path, conversation.workspacePath, conversation.projectPaths.map((folder) => ({ project: folder, folder })))
      if (found) showInspectorFile('conversation', conversation.id, found.project, found.file, edit)
    },
    inProject: (path) => insideProjects(path, conversation.workspacePath, conversation.projectPaths),
    showBrowser: () => showBrowserPanel(conversation.id),
    changes: conversation.projectPaths.length > 0 ? { kind: 'conversation', id: conversation.id } : null,
    changesHint: t('chatSurface.uncommittedProjectChangesMayIncludeYourOwnClick'),
    prepareSend: async (stopped) => !stopped || Boolean(await continueConversation(conversation.id)),
    sendBlocker: null,
    savePlan: null,
    planNote: () => null,
    handoff,
    fork
  }
}
