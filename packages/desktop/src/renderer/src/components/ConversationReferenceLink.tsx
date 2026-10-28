import type { ReactNode } from 'react'
import { ChatReferenceLink } from './ChatReference'

export function ConversationReferenceLink({ id, children }: { id: string; children: ReactNode }) {
  return <span data-conversation-id={id}><ChatReferenceLink target={{ kind: 'conversation', id, title: typeof children === 'string' ? children : id }}>{children}</ChatReferenceLink></span>
}
