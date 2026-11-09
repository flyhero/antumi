import { localized, t } from '../i18n'
import { sourceLabel, type Conversation } from '@antumi/protocol'
import { useCore } from '../core-store'
import { conversationGlyph, conversationState } from '../conversation-state'
import { agentLabel } from '../labels'
import { AgentAvatar } from './AgentAvatar'
import { AgentIcon, SourceIcon } from './icons'
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

// Source investigations keep their provenance inside the same status ring as other chats.
export function ConversationMark({ conversation }: { conversation: Conversation }) {
  const { glyph, label, detail } = useStatus(conversation)
  const { profile, source } = conversation
  const saved = useCore((s) => Boolean(profile && s.agentProfiles[profile.id]))
  const identity = [source ? sourceLabel(source) : null, profile?.name ?? agentLabel(conversation.agent)].filter(Boolean).join(' · ')
  return (
    <span className="agent-status-mark" data-glyph={glyph} role="img" aria-label={`${identity} · ${label}`} title={source ? `${identity} · ${detail ?? label}` : detail ?? label}>
      {source ? <span className="conversation-source-icon" aria-hidden="true"><SourceIcon provider={source.provider} /></span> : profile && saved ? <AgentAvatar id={profile.id} /> : <AgentIcon agent={conversation.agent} />}
      {glyph !== 'idle' && <span className="agent-status-ring" aria-hidden="true" />}
    </span>
  )
}
