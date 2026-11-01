import { localized, t } from './i18n'
import { create } from 'zustand'
import { researchRound, reviewRound, type AgentKind, type Discussion, type DiscussionAction, type DiscussionCreate, type DiscussionFormat, type DiscussionMemberFields, type DiscussionMemberStatus, type DiscussionPost, type DiscussionState } from '@antumi/protocol'
import { perform } from './core-store'
import { agentLabel } from './labels'

// Each open group chat's posts, by discussion id: fetched when its page opens, kept up by
// discussions.posts after. A discussion not fetched yet has no entry, so a post or two arriving
// for it is not mistaken for all of them.
export const useDiscussionPosts = create<Record<string, DiscussionPost[]>>()(() => ({}))

export function receiveDiscussionPosts(discussionId: string, posts: readonly DiscussionPost[]): void {
  useDiscussionPosts.setState((all) => {
    const known = all[discussionId]
    if (!known) return all
    return { ...all, [discussionId]: mergePosts(known, posts) }
  })
}

// Newer revisions replace older ones by id; the list stays in sequence order.
export function mergePosts(known: readonly DiscussionPost[], incoming: readonly DiscussionPost[]): DiscussionPost[] {
  const byId = new Map(known.map((post) => [post.id, post]))
  for (const post of incoming) {
    const held = byId.get(post.id)
    if (!held || held.updatedAt <= post.updatedAt) byId.set(post.id, post)
  }
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence)
}

export function forgetDiscussionPosts(discussionId: string): void {
  useDiscussionPosts.setState((all) => {
    const { [discussionId]: _gone, ...rest } = all
    return rest
  }, true)
}

export async function loadDiscussionPosts(discussionId: string): Promise<void> {
  const posts = await perform((rpc) => rpc.call('discussions.posts', { id: discussionId }))
  // What arrived while asking is newer than the answer, or the same.
  if (posts) useDiscussionPosts.setState((all) => ({ ...all, [discussionId]: mergePosts(posts, all[discussionId] ?? []) }))
}

export function createDiscussion(fields: DiscussionCreate): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.create', fields))
}

export function addDiscussionMember(id: string, member: DiscussionMemberFields): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.addMember', { id, member }))
}

export function removeDiscussionMember(id: string, memberId: string): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.removeMember', { id, memberId }))
}

export function setDiscussionProjects(id: string, projectPaths: readonly string[]): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.setProjects', { id, projectPaths: [...projectPaths] }))
}

export function postToDiscussion(id: string, text: string, mentions: readonly string[]): Promise<DiscussionPost | null> {
  return perform((rpc) => rpc.call('discussions.post', { id, text, mentions: [...mentions] }))
}

export function newDiscussionTopic(id: string, text: string): Promise<DiscussionPost | null> {
  return perform((rpc) => rpc.call('discussions.newTopic', { id, text }))
}

export function controlDiscussion(id: string, action: DiscussionAction): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.control', { id, action }))
}

export function renameDiscussion(id: string, title: string): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.rename', { id, title }))
}

export function setDiscussionPinned(id: string, pinned: boolean): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.setPinned', { id, pinned }))
}

export function archiveDiscussion(id: string, archived: boolean): Promise<Discussion | null> {
  return perform((rpc) => rpc.call('discussions.setArchived', { id, archived }))
}

export function deleteDiscussion(id: string): Promise<{ ok: true } | null> {
  return perform((rpc) => rpc.call('discussions.delete', { id }))
}

export const DISCUSSION_STATE_LABEL: Record<DiscussionState, string> = localized(() => ({
  running: t('discussions.discussing'),
  pausing: t('discussions.pauseAfterThisRound'),
  paused: t('SquadWorkPanel.paused'),
  done: t('discussions.summarized')
}))

export const MEMBER_STATUS_LABEL: Record<DiscussionMemberStatus, string> = localized(() => ({
  idle: t('SquadWorkPanel.idle'),
  working: t('discussions.speaking'),
  awaiting: t('ChatPlan.awaitingYourApproval')
}))

// Where the discussion stands, in a few words for its header and its row.
// Rounds count from the topic now discussed.
export function discussionProgress(discussion: Pick<Discussion, 'state' | 'step' | 'round' | 'lastRound' | 'topicStart'> & { format?: DiscussionFormat }): string {
  if (discussion.format === 'review') return reviewProgress(discussion)
  if (discussion.format === 'research') return researchProgress(discussion)
  if (discussion.state === 'done') return DISCUSSION_STATE_LABEL.done
  const { round, lastRound, topicStart } = discussion
  const where = discussion.step === 'summary' ? t('DiscussionView.summary') : round > topicStart ? t('discussions.round', { value1: round - topicStart, value2: Math.max(round, lastRound) - topicStart }) : t('SquadWorkPanel.preparing')
  return discussion.state === 'running' ? where : `${where} · ${DISCUSSION_STATE_LABEL[discussion.state]}`
}

// A review by the draft it is on and what is being done with it.
function reviewProgress(discussion: Pick<Discussion, 'state' | 'step' | 'round'>): string {
  if (discussion.state === 'done') return t('discussions.reviewDone')
  const { stage, version } = reviewRound(Math.max(discussion.round, 1))
  const where = discussion.step === 'summary' ? t('discussions.reviewFinishing') : stage === 'review' ? t('discussions.reviewReviewing', { version }) : stage === 'draft' ? t('discussions.reviewDrafting') : t('discussions.reviewRevising', { version })
  return discussion.state === 'running' ? where : `${where} · ${DISCUSSION_STATE_LABEL[discussion.state]}`
}

function researchProgress(discussion: Pick<Discussion, 'state' | 'step' | 'round'>): string {
  if (discussion.state === 'done') return t('discussions.researchDone')
  const stage = researchRound(Math.max(discussion.round, 1))
  const where = stage === 'split' ? t('discussions.researchSplitting') : stage === 'research' ? t('discussions.researchResearching') : t('discussions.researchReporting')
  return discussion.state === 'running' ? where : `${where} · ${DISCUSSION_STATE_LABEL[discussion.state]}`
}

// A member's name until the user gives it one: its agent, and the model where one is picked.
export function defaultMemberName(agent: AgentKind, model: string | null): string {
  return model ? `${agentLabel(agent)} · ${model}` : agentLabel(agent)
}

// Names every member at once: each answers now, rather than all in the next round as an unnamed post does.
export const EVERYONE = '所有人'

// The names the composer's @ picks members by, longest first so a name that starts another wins.
export function mentionedMembers(text: string, members: readonly Pick<Discussion['members'][number], 'id' | 'name'>[]): string[] {
  if (text.includes(`@${EVERYONE}`) || /@everyone\b/i.test(text)) return members.map((member) => member.id)
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length)
  const found = new Set<string>()
  let rest = text
  for (const member of sorted) {
    const tag = `@${member.name}`
    if (rest.includes(tag)) {
      found.add(member.id)
      rest = rest.split(tag).join(' ')
    }
  }
  return members.filter((member) => found.has(member.id)).map((member) => member.id)
}

// The @ being typed at the caret: where it starts and what follows it, while that is one word.
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1] ?? ''))) return null
  const query = before.slice(at + 1)
  return /\s/.test(query) ? null : { start: at, query }
}

// What the @ list offers for a query: everyone first, then the members whose names hold it.
export function mentionChoices<M extends Pick<Discussion['members'][number], 'name'>>(members: readonly M[], query: string): Array<M | typeof EVERYONE> {
  const needle = query.toLowerCase()
  const choices: Array<M | typeof EVERYONE> = (EVERYONE.includes(needle) || 'everyone'.includes(needle)) ? [EVERYONE] : []
  return [...choices, ...members.filter((member) => member.name.toLowerCase().includes(needle))]
}
