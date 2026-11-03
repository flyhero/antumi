import { AGENT_KINDS, type AgentKind, type Conversation, type Discussion, type Task } from '@antumi/protocol'
import { getLocale, t } from './i18n'
import { agentLabel } from './labels'
import { conversationState } from './conversation-state'
import { primaryProjectName, projectName } from './components/ProjectPicker'
import type { Preferences } from './preferences'

type GroupBy = Preferences['conversationGroup']
type SortBy = Preferences['conversationSort']
export type ConversationKinds = Preferences['conversationKinds']

// What the sidebar's conversation list holds: conversations, group chats and started tasks side by
// side. Each keeps its own kind, so what is done to a row goes to the right one. A task's row is
// the task (its id, title and projects) with the chat it runs in, where its activity shows.
export type ListItem =
  | { kind: 'conversation'; id: string; conversation: Conversation }
  | { kind: 'discussion'; id: string; discussion: Discussion }
  | { kind: 'task'; id: string; task: Task; conversation: Conversation }

export function conversationItem(conversation: Conversation): ListItem {
  return { kind: 'conversation', id: conversation.id, conversation }
}

export function discussionItem(discussion: Discussion): ListItem {
  return { kind: 'discussion', id: discussion.id, discussion }
}

export function taskItem(task: Task, conversation: Conversation): ListItem {
  return { kind: 'task', id: task.id, task, conversation }
}

// The chat a row's activity, unread mark and search hits come from; a group chat has none of its own.
export function itemConversation(item: ListItem): Conversation | null {
  return item.kind === 'discussion' ? null : item.conversation
}

// A task's chat is never put away by itself: the task is, once accepted or cancelled, and its row
// goes to the archived group with the conversations put away.
export function taskArchived(task: Pick<Task, 'status'>): boolean {
  return task.status === 'done' || task.status === 'abandoned'
}

function fields(item: ListItem): Pick<Conversation, 'title' | 'projectPaths' | 'createdAt' | 'updatedAt'> & { pinnedAt: number | null; archivedAt: number | null } {
  if (item.kind === 'task') {
    const { task, conversation } = item
    // Recent means the task or its chat moved, whichever was later.
    return { title: task.title, projectPaths: task.repos.map((repo) => repo.path), createdAt: task.createdAt, updatedAt: Math.max(task.updatedAt, conversation.updatedAt), pinnedAt: conversation.pinnedAt ?? null, archivedAt: taskArchived(task) ? task.updatedAt : null }
  }
  const value = item.kind === 'conversation' ? item.conversation : item.discussion
  return { title: value.title, projectPaths: value.projectPaths, createdAt: value.createdAt, updatedAt: value.updatedAt, pinnedAt: value.pinnedAt ?? null, archivedAt: value.archivedAt ?? null }
}

export const itemTitle = (item: ListItem) => fields(item).title
export const itemArchived = (item: ListItem) => fields(item).archivedAt !== null

// A group chat is going while a round is out or a member is at it; a conversation or a task, while
// its agent runs.
export function itemRunning(item: ListItem): boolean {
  if (item.kind !== 'discussion') return Boolean(item.conversation.sessionId)
  const { state, members } = item.discussion
  return state === 'running' || state === 'pausing' || members.some((member) => member.status !== 'idle')
}

const KIND_SHOWN: Record<Exclude<ConversationKinds, 'all'>, ListItem['kind']> = { conversations: 'conversation', discussions: 'discussion', tasks: 'task' }

export function itemShown(item: ListItem, kinds: ConversationKinds): boolean {
  return kinds === 'all' || KIND_SHOWN[kinds] === item.kind
}

export type GroupActivity = { awaiting: number; failed: number; unseen: number; running: number }

// Unread replies stay visible even if the same conversation has started another turn.
export function groupActivity(items: readonly ListItem[], unseen: Readonly<Record<string, true>>): GroupActivity {
  const counts: GroupActivity = { awaiting: 0, failed: 0, unseen: 0, running: 0 }
  for (const item of items) {
    if (itemArchived(item)) continue
    if (item.kind === 'discussion') {
      if (item.discussion.members.some((member) => member.status === 'awaiting')) counts.awaiting++
      else if (itemRunning(item)) counts.running++
      continue
    }
    const conversation = item.conversation
    const state = conversationState(conversation)
    const awaiting = conversation.sessionId !== null && (conversation.chat?.turn === 'awaiting' || conversation.chat?.turn === 'idle' && conversation.chat.request?.async)
      || conversation.delegation?.open && conversation.delegation.awaiting
    if (awaiting) counts.awaiting++
    else if (state.failed) counts.failed++
    else if (state.running) counts.running++
    if (unseen[conversation.id]) counts.unseen++
  }
  return counts
}

const COMPARE: Record<SortBy, (a: ListItem, b: ListItem) => number> = {
  recent: (a, b) => fields(b).updatedAt - fields(a).updatedAt,
  created: (a, b) => fields(b).createdAt - fields(a).createdAt,
  title: (a, b) => fields(a).title.localeCompare(fields(b).title, getLocale())
}

export function sortItems(items: readonly ListItem[], sort: SortBy): ListItem[] {
  return [...items].sort(COMPARE[sort])
}

// Groups keep a fixed order where there is one (running first, agents as listed, group chats after
// them); projects go by name, with what has no project last. An item belongs to its primary project,
// where its agents work; the others only lend it folders.
export function groupOf(item: ListItem, by: Exclude<GroupBy, 'none'>): { label: string; rank: number } {
  switch (by) {
    case 'project': {
      const { projectPaths } = fields(item)
      return { label: primaryProjectName(projectPaths), rank: projectPaths.length > 0 ? 0 : 1 }
    }
    case 'agent':
      return item.kind !== 'discussion'
        ? { label: agentLabel(item.conversation.agent), rank: AGENT_KINDS.indexOf(item.conversation.agent) }
        : { label: t('DiscussionView.groupChat_910'), rank: AGENT_KINDS.length }
    case 'status':
      return itemRunning(item) ? { label: t('ConversationList.running'), rank: 0 } : { label: t('ConversationList.stopped'), rank: 1 }
  }
}

// `project`: the primary project a project's group stands for, where its ＋ starts a conversation.
// `agent`: the agent an agent's group stands for, whose mark its heading carries for its rows.
export type ItemGroup = { key: string; label: string | null; rank: number; items: ListItem[]; project?: string; agent?: AgentKind; discussions?: true }

// Pinned ones come first, in a group of their own, whatever the grouping.
export function arrangeItems(items: readonly ListItem[], by: GroupBy, sort: SortBy): ItemGroup[] {
  const sorted = sortItems(items, sort)
  const pinned = sorted.filter((item) => fields(item).pinnedAt != null)
  const rest = sorted.filter((item) => fields(item).pinnedAt == null)
  const top: ItemGroup[] = pinned.length > 0 ? [{ key: 'pinned', label: t('ConversationList.pinned'), rank: -1, items: pinned }] : []
  if (by === 'none') return rest.length > 0 ? [...top, { key: 'all', label: null, rank: 0, items: rest }] : top
  const groups = new Map<string, ItemGroup>()
  for (const item of rest) {
    const { label, rank } = groupOf(item, by)
    const project = by === 'project' ? fields(item).projectPaths[0] : undefined
    const mark = by === 'agent' ? (item.kind !== 'discussion' ? { agent: item.conversation.agent } : { discussions: true as const }) : {}
    const group = groups.get(label) ?? { key: `group:${label}`, label, rank, items: [], ...(project ? { project } : {}), ...mark }
    group.items.push(item)
    groups.set(label, group)
  }
  return [...top, ...[...groups.values()].sort((a, b) => a.rank - b.rank || (a.label ?? '').localeCompare(b.label ?? '', getLocale()))]
}

// A group shows its first few rows, and a few more each time it is asked; the open one stays in
// sight wherever it falls.
export const GROUP_LIMIT = 6
export function shownRows<T extends { id: string }>(items: T[], selected: string | null, limit = GROUP_LIMIT): T[] {
  return items.filter((item, index) => index < limit || item.id === selected)
}

// By title or project name, ignoring case. Message text is searched by core, for conversations.
export function itemMatches(item: ListItem, query: string): boolean {
  const needle = query.toLowerCase()
  const { title, projectPaths } = fields(item)
  return [title, ...projectPaths.map(projectName)].some((text) => text.toLowerCase().includes(needle))
}
