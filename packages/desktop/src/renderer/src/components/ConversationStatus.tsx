import { localized, t } from '../i18n'
import type { Conversation } from '@antumi/protocol'
import { useCore } from '../core-store'
import { conversationGlyph, conversationState } from '../conversation-state'
import { agentLabel } from '../labels'
import { AgentAvatar } from './AgentAvatar'
import { AgentIcon } from './icons'
import { Spinner } from './Spinner'

const SPOKEN: Record<string, string> = localized(() => ({ unseen: t('ConversationStatus.newActivity') }))

function useStatus(conversation: Conversation) {
  const unseen = useCore((s) => Boolean(s.unseen[conversation.id]))
  const glyph = conversationGlyph(conversation, unseen)
  const state = conversationState(conversation)
  return { glyph, label: SPOKEN[glyph] ?? state.label, detail: state.detail }
}

// The mark before a conversation's name: a spinner while its agent works, a coloured dot for what
// needs the user's eye, a ring when nothing does.
export function ConversationStatus({ conversation }: { conversation: Conversation }) {
  const { glyph, label, detail } = useStatus(conversation)
  return (
    <span className="conversation-status" data-glyph={glyph} role="img" aria-label={label} title={detail ?? label}>
      {glyph === 'running' && <Spinner />}
    </span>
  )
}

// Keep the agent's own colours inside the status ring; idle chats need no ring.
export function ConversationMark({ conversation }: { conversation: Conversation }) {
  const { glyph, label, detail } = useStatus(conversation)
  const { profile } = conversation
  const saved = useCore((s) => Boolean(profile && s.agentProfiles[profile.id]))
  return (
    <span className="agent-status-mark" data-glyph={glyph} role="img" aria-label={`${profile?.name ?? agentLabel(conversation.agent)} · ${label}`} title={detail ?? label}>
      {profile && saved ? <AgentAvatar id={profile.id} /> : <AgentIcon agent={conversation.agent} />}
      {glyph !== 'idle' && <span className="agent-status-ring" aria-hidden="true" />}
    </span>
  )
}
