import type { AgentProfile, Conversation } from '@antumi/protocol'
import { openConversationDraft, selectConversation, useCore } from './core-store'
import { setPreference, usePreferences } from './preferences'
import { isListedConversation } from './search-palette'

export function pinnedAgents(ids: readonly string[], profiles: Readonly<Record<string, AgentProfile>>): AgentProfile[] {
  return [...new Set(ids)].flatMap((id) => {
    const profile = profiles[id]
    return profile && profile.archivedAt === null ? [profile] : []
  })
}

// Keep the conversation already in front; otherwise return to the agent's latest ordinary chat.
export function agentConversation(id: string, conversations: readonly Conversation[], current: string | null): Conversation | null {
  const eligible = conversations.filter((conversation) => conversation.profile?.id === id && conversation.archivedAt == null && isListedConversation(conversation))
  return eligible.find((conversation) => conversation.id === current)
    ?? eligible.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))[0]
    ?? null
}

export function pinAgent(id: string, pinned: boolean): void {
  const ids = usePreferences.getState().pinnedAgentIds
  setPreference('pinnedAgentIds', pinned ? [...new Set([...ids, id])] : ids.filter((each) => each !== id))
}

export function newAgentConversation(id: string): void {
  const profile = useCore.getState().agentProfiles[id]
  if (!profile || profile.archivedAt !== null) return
  openConversationDraft()
  useCore.setState({ draftProfileId: id })
}

export function openPinnedAgent(id: string): void {
  const state = useCore.getState()
  const profile = state.agentProfiles[id]
  if (!profile || profile.archivedAt !== null) return
  if (state.section === 'conversations' && state.conversationDraft && state.draftProfileId === id) {
    useCore.setState({ settingsOpen: false, overviewOpen: false, inboxOpen: false, worktreesOpen: false, routinesOpen: false })
    return
  }
  const conversation = agentConversation(id, Object.values(state.conversations), state.section === 'conversations' ? state.selectedConversationId : null)
  if (conversation) selectConversation(conversation.id)
  else newAgentConversation(id)
}
