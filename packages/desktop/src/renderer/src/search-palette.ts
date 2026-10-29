import { isHelper, shortTaskId, type AgentProfile, type Conversation, type Task } from '@antumi/protocol'

// ⌘K: one box for what the user moves between. "all" shows the best of each kind at once, so a few
// letters and Enter are enough; a kind on its own shows more of it.
export const SEARCH_CATEGORIES = ['all', 'conversations', 'tasks', 'agents', 'files'] as const
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number]
export type SearchKind = Exclude<SearchCategory, 'all'>

export type SearchEntry = { kind: SearchKind; id: string; title: string; detail: string | null; at: number; score: number }
export type SearchSection = { kind: SearchKind; entries: SearchEntry[] }

const PER_KIND_IN_ALL = 5
const PER_KIND = 50
const RECENT = 8
const KIND_ORDER: readonly SearchKind[] = ['conversations', 'tasks', 'agents', 'files']

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// How well text answers a query: 0 when some word of it is missing; then a text that starts with
// the query beats one where a word starts with it, which beats one that only contains it.
export function matchScore(text: string, query: string): number {
  const needle = query.trim().toLowerCase()
  const words = needle.split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  if (words.length === 0 || !words.every((word) => lower.includes(word))) return 0
  if (lower.startsWith(needle)) return 3
  return new RegExp(`(^|[\\s/_.\\-·])${escaped(words[0]!)}`).test(lower) ? 2 : 1
}

// The conversations the sidebar lists: not a task's, a helper's, a group chat member's and so on.
export function isListedConversation(conversation: Conversation): boolean {
  return !isHelper(conversation) && !conversation.taskId && !conversation.routineId && !conversation.discussionId && !conversation.squadRunId && !conversation.parentConversationId
}

// A title match first, then the project it is in; a conversation found only by what was said in it
// comes last, with the words that matched. An archived one never leads.
export function conversationEntries(conversations: readonly Conversation[], query: string, snippets: ReadonlyMap<string, string>, projectOf: (conversation: Conversation) => string | null): SearchEntry[] {
  return conversations.filter(isListedConversation).flatMap((conversation) => {
    const project = projectOf(conversation)
    const named = Math.max(matchScore(conversation.title, query), project ? matchScore(project, query) - 0.5 : 0)
    const snippet = snippets.get(conversation.id)
    const score = named > 0 ? named : snippet ? 0.5 : 0
    if (score === 0) return []
    const archived = conversation.archivedAt != null ? 0.25 : 0
    return [{ kind: 'conversations' as const, id: conversation.id, title: conversation.title, detail: named > 0 ? project : snippet ?? project, at: conversation.updatedAt, score: score - archived }]
  })
}

// By title, project or the short id the task page shows.
export function taskEntries(tasks: readonly Task[], query: string, projectOf: (task: Task) => string | null): SearchEntry[] {
  return tasks.flatMap((task) => {
    const project = projectOf(task)
    const score = Math.max(matchScore(task.title, query), project ? matchScore(project, query) - 0.5 : 0, matchScore(shortTaskId(task.id), query) === 3 ? 3 : 0)
    return score > 0 ? [{ kind: 'tasks' as const, id: task.id, title: task.title, detail: project, at: task.updatedAt, score }] : []
  })
}

// With nothing typed, every agent in use: there are few of them.
export function agentEntries(profiles: readonly AgentProfile[], query: string): SearchEntry[] {
  return profiles.filter((profile) => profile.archivedAt === null).flatMap((profile) => {
    if (!query.trim()) return [{ kind: 'agents' as const, id: profile.id, title: profile.name, detail: profile.description || null, at: profile.updatedAt, score: 0 }]
    const score = Math.max(matchScore(profile.name, query), profile.description ? Math.min(1, matchScore(profile.description, query)) : 0)
    return score > 0 ? [{ kind: 'agents' as const, id: profile.id, title: profile.name, detail: profile.description || null, at: profile.updatedAt, score }] : []
  })
}

// With nothing typed: the conversations and tasks touched last, to go back to in one key.
export function recentEntries(conversations: readonly Conversation[], tasks: readonly Task[], projectOf: { conversation: (conversation: Conversation) => string | null; task: (task: Task) => string | null }): SearchEntry[] {
  const open = conversations.filter((conversation) => isListedConversation(conversation) && conversation.archivedAt == null)
    .map((conversation) => ({ kind: 'conversations' as const, id: conversation.id, title: conversation.title, detail: projectOf.conversation(conversation), at: conversation.updatedAt, score: 0 }))
  const working = tasks.filter((task) => task.status !== 'done' && task.status !== 'abandoned')
    .map((task) => ({ kind: 'tasks' as const, id: task.id, title: task.title, detail: projectOf.task(task), at: task.updatedAt, score: 0 }))
  return [...open, ...working].sort((a, b) => b.at - a.at).slice(0, RECENT)
}

// The entries of each kind, best first and then newest; in "all" a few of each, the kind with the
// best match first, so Enter opens what was most likely meant.
export function searchSections(entries: readonly SearchEntry[], category: SearchCategory): SearchSection[] {
  const limit = category === 'all' ? PER_KIND_IN_ALL : PER_KIND
  const sections = KIND_ORDER.filter((kind) => category === 'all' || kind === category).flatMap((kind) => {
    const found = entries.filter((entry) => entry.kind === kind).sort((a, b) => b.score - a.score || b.at - a.at)
    return found.length > 0 ? [{ kind, entries: found.slice(0, limit) }] : []
  })
  return sections.sort((a, b) => (b.entries[0]?.score ?? 0) - (a.entries[0]?.score ?? 0))
}
