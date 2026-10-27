import type { ReactNode } from 'react'
import { selectConversation, useCore } from '../core-store'
import { t } from '../i18n'

export function ConversationReferenceLink({ id, children }: { id: string; children: ReactNode }) {
  const available = useCore((s) => Boolean(s.conversations[id]))
  return <button type="button" className="chat-link chat-conversation-link" data-conversation-id={id} disabled={!available}
    title={available ? t('ConversationReference.open') : t('ConversationReference.unavailable')} onClick={() => selectConversation(id)}>{children}</button>
}
