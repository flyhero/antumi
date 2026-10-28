import { z } from 'zod'
import { AgentProfile } from './agent-profile'
import { ChatDecision, ChatTurnActivity } from './chat'
import { ConversationRoute, ModelProviderId, ProviderRoute } from './model-provider'
import { TaskSource } from './source'
import { AgentKind } from './task'

export const ConversationRequest = z.object({
  requestId: z.string(),
  kind: z.enum(['approval', 'question']).catch('question'),
  // The approval's tool, as on its chat item; null for a question.
  tool: z.string().nullable(),
  title: z.string(),
  decisions: z.array(ChatDecision.catch('deny')),
  open: z.number().int().positive(),
  // A question asked in passing (see the question item's async): nothing waits on it. Older
  // cores leave it out.
  async: z.boolean().optional()
})
export type ConversationRequest = z.infer<typeof ConversationRequest>

// What a running turn is doing right now: the call it waits on (its tool and title, as on its chat
// item), or what the agent says it is doing, with tool null.
export const ConversationDoing = z.object({ tool: z.string().nullable(), title: z.string() })
export type ConversationDoing = z.infer<typeof ConversationDoing>

export const Conversation = z.object({
  id: z.string().uuid(),
  title: z.string(),
  titleLocked: z.boolean(),
  agent: AgentKind,
  // The agent's cwd: the first selected project, or the managed directory when no project is selected.
  workspacePath: z.string(),
  // Ordered: primary project first, followed by additional directories.
  projectPaths: z.array(z.string()),
  // Folders the agent may read but never edit: a task's reference projects. Older cores leave it out.
  referencePaths: z.array(z.string()).optional(),
  managedWorkspace: z.boolean(),
  sessionId: z.string().nullable(),
  // Includes CLI checks and handshake, before the agent can take a message.
  starting: z.boolean().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  // How the agent last stopped: code is null when it was stopped rather than exiting on its own.
  // null before any run has ended. Older cores leave it out.
  lastExit: z.object({ code: z.number().int().nullable(), at: z.number() }).nullable().optional(),
  // Set while a chat-mode agent is running, to tell whether it works or waits on the user.
  // suggestion: what the agent predicts the user will type next, once a turn has ended, until the
  // next message; only when the user has them on. Older cores leave it out.
  // request: while the turn waits on the user, the oldest request still open (an approval's
  // title is its command or path, a question's its first question) and how many are open, so a
  // list can answer a plain approval without opening the chat; otherwise a question the agent
  // asked in passing and nobody has answered. Older cores leave it out.
  chat: z.object({
    turn: ChatTurnActivity.catch('idle'),
    suggestion: z.string().nullable().optional(),
    request: ConversationRequest.nullable().optional(),
    // While the turn runs. Older cores leave it out.
    doing: ConversationDoing.nullable().optional()
  }).nullable().optional(),
  // What the next chat stage starts with, as chosen or as the last stage left it: the permission
  // mode, and the model and effort of the conversation's agent. Older cores leave it out.
  chatOptions: z.object({
    permissionMode: z.string().nullable(),
    model: z.string().nullable(),
    effort: z.string().nullable()
  }).optional(),
  // The task this conversation runs, which keeps it out of the free conversations. Older cores leave it out.
  taskId: z.string().nullable().optional(),
  // Whether its latest stage may only plan: read-only, the plan kept rather than carried out.
  planOnly: z.boolean().optional(),
  // When the user pinned it to the top of the list; null when it is not pinned. Older cores leave it out.
  pinnedAt: z.number().nullable().optional(),
  // When the user put it away: out of the list and read-only until taken out again. Older cores
  // leave it out.
  archivedAt: z.number().nullable().optional(),
  // The routine whose run opened it, which keeps it out of the list: it is reached from the
  // routine's history. Older cores leave it out.
  routineId: z.string().uuid().nullable().optional(),
  // The conversation this one was forked from, at some message of it; the source may be gone
  // since. Older cores leave it out.
  forkedFromId: z.string().uuid().nullable().optional(),
  // The group chat it is a member's part of, which keeps it out of the list: it is reached from
  // the group chat. Older cores leave it out.
  discussionId: z.string().uuid().nullable().optional(),
  squadRunId: z.string().uuid().nullable().optional(),
  profile: AgentProfile.nullable().optional(),
  parentConversationId: z.string().uuid().nullable().optional(),
  agentCallId: z.string().uuid().nullable().optional(),
  delegation: z.object({ open: z.number().int().nonnegative(), awaiting: z.number().int().nonnegative(), writing: z.boolean() }).optional(),
  helperOf: z.string().uuid().nullable().optional(),
  workspaceReadOnly: z.boolean().optional(),
  // The issue it was opened to look into, from the inbox. Older cores leave it out.
  source: TaskSource.nullable().optional(),
  // The model provider it was started on, fixed for good; null on the agents' own accounts. route:
  // what its agent's next stage runs on. Older cores leave both out.
  modelProvider: ModelProviderId.nullable().optional(),
  route: ConversationRoute.nullable().optional()
})
export type Conversation= z.infer<typeof Conversation>

// A fresh conversation's settings, without any session, history or task ownership.
export const ConversationConfiguration = Conversation.pick({ agent: true, projectPaths: true, modelProvider: true }).extend({
  permissionMode: z.string().nullable(),
  model: z.string().nullable(),
  effort: z.string().nullable()
})
export type ConversationConfiguration = z.infer<typeof ConversationConfiguration>

export function canReuseConversation(conversation: Conversation): boolean {
  return !conversation.taskId && !conversation.discussionId && !conversation.squadRunId && !conversation.routineId && !conversation.parentConversationId && !isHelper(conversation)
}

export const ConversationStage = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  agent: AgentKind,
  providerSessionId: z.string().nullable(),
  sessionId: z.string().nullable(),
  receivedSequence: z.number().int().nonnegative(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  exitCode: z.number().nullable(),
  // A stage that may only plan (see Conversation.planOnly).
  planOnly: z.boolean().optional(),
  // The model provider it ran on; null on the agent's own account. Older cores leave it out.
  route: ProviderRoute.nullable().optional(),
  // The agent account it ran on (AgentAccount.id); null on a provider. Older cores leave it out.
  account: z.string().nullable().optional()
})
export type ConversationStage = z.infer<typeof ConversationStage>

export const ConversationMessage = z.object({
  sequence: z.number().int().positive(),
  conversationId: z.string().uuid(),
  stageId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  agent: AgentKind,
  text: z.string(),
  eventKey: z.string(),
  complete: z.boolean(),
  createdAt: z.number()
})
export type ConversationMessage = z.infer<typeof ConversationMessage>

// A conversation whose messages contain a search query, with the text around the latest match.
export const ConversationSearchHit = z.object({ conversationId: z.string().uuid(), snippet: z.string() })
export type ConversationSearchHit = z.infer<typeof ConversationSearchHit>

// What a project folder has checked out: a branch, or a short commit id when HEAD is detached.
// branch is null when the folder is not in a git repo. Older cores send no status fields.
export const ProjectHead = z.object({
  path: z.string(),
  branch: z.string().nullable(),
  detached: z.boolean(),
  // The tracked remote branch, null when there is none; ahead and behind count against it.
  upstream: z.string().nullable().optional(),
  ahead: z.number().int().nonnegative().optional(),
  behind: z.number().int().nonnegative().optional(),
  // Uncommitted entries, untracked files included.
  changes: z.number().int().nonnegative().optional()
})
export type ProjectHead = z.infer<typeof ProjectHead>

export const CommitPushResult = z.object({
  commit: z.string(),
  branch: z.string(),
  upstream: z.string()
})
export type CommitPushResult = z.infer<typeof CommitPushResult>
export const CommitResult = z.object({ commit: z.string(), branch: z.string() })
export type CommitResult = z.infer<typeof CommitResult>
export const PushResult = z.object({ branch: z.string(), upstream: z.string() })
export type PushResult = z.infer<typeof PushResult>

// What a conversation's project could switch to, or start a branch from: its checkout is the
// user's own, so a switch changes what everything else in that folder sees too.
// Who has a branch checked out in another worktree: the repo's own folder, one of Antumi's
// conversations (the worktree it made or works in), or a worktree something else made.
export const BranchHolder = z.object({
  kind: z.enum(['main', 'conversation', 'other']),
  conversationId: z.string().optional(),
  title: z.string().optional(),
  archived: z.boolean().optional()
})
export type BranchHolder = z.infer<typeof BranchHolder>

export const ProjectBranches = z.object({
  path: z.string(),
  git: z.boolean(),
  // The branch checked out; null when HEAD is detached or there is no git.
  branch: z.string().nullable(),
  // Uncommitted changes to tracked files, which keep a switch from happening.
  changes: z.number().int().nonnegative(),
  // Local branches, then remote-tracking ones, by full name.
  refs: z.array(z.string()),
  // Branches another worktree has checked out, which git will not check out here as well: the
  // full name, and that worktree's folder.
  elsewhere: z.record(z.string(), z.string()),
  // Who each of those is, by the same full name; absent from a core that does not say.
  holders: z.record(z.string(), BranchHolder).optional(),
  // Other conversations with an agent open in this folder, by title: a switch moves their files too.
  sharedWith: z.array(z.string())
})
export type ProjectBranches = z.infer<typeof ProjectBranches>

export type BranchSwitchBlocker = 'task-conversation' | 'chat-busy'

// A switch changes the files under the agent, so it waits for the agent to be idle. A task's
// conversation runs in the task's worktrees, whose branch is its.
export function checkSwitchBranch(conversation: Pick<Conversation, 'taskId' | 'sessionId' | 'chat'>): BranchSwitchBlocker | null {
  if (conversation.taskId) return 'task-conversation'
  if (!conversation.sessionId) return null
  return conversation.chat?.turn === 'idle' ? null : 'chat-busy'
}

export type AdditionalProjectsBlocker = BranchSwitchBlocker | 'managed-workspace'

// The agent is given its directories at launch, so a change restarts it on the same session once
// it is idle. The primary is the cwd the session began in and stays. A conversation begun without
// projects works in a directory of Antumi's own; a task's has its projects set on the task.
export function checkEditAdditionalProjects(
  conversation: Pick<Conversation, 'taskId' | 'sessionId' | 'chat' | 'managedWorkspace'>
): AdditionalProjectsBlocker | null {
  if (conversation.taskId) return 'task-conversation'
  if (conversation.managedWorkspace) return 'managed-workspace'
  return checkSwitchBranch(conversation)
}

export function isHelper(conversation: Pick<Conversation, 'helperOf'>): boolean {
  return conversation.helperOf != null
}

// A helper does a small thing rather than plan one: any mode but planning.
export function helperAllowsMode(mode: string): boolean {
  return mode !== 'plan'
}

export function canHaveHelper(conversation: Conversation): boolean {
  return !isHelper(conversation) && !conversation.parentConversationId && !conversation.discussionId && !conversation.squadRunId && !conversation.routineId && conversation.archivedAt == null
}
