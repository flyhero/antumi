import { localized, t } from '../i18n'
import type { Conversation } from '@antumi/protocol'
import { useCore } from '../core-store'
import { conversationGlyph, conversationState } from '../conversation-state'
import { RobotIcon } from './icons'
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

// In a list, a chat with one of the user's agents holds a robot in the status column, coloured as
// the dot would be, as a group chat holds its own mark: the kind reads from the column alone.
export function ConversationMark({ conversation }: { conversation: Conversation }) {
  const { glyph, label, detail } = useStatus(conversation)
  if (!conversation.profile) return <ConversationStatus conversation={conversation} />
  return (
    <span className="profile-mark" data-glyph={glyph} role="img" aria-label={`${conversation.profile.name} · ${label}`} title={detail ?? label}>
      <RobotIcon />
    </span>
  )
}
