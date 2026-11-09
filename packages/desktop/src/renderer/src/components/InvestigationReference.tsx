import type { TaskSource } from '@antumi/protocol'
import { t } from '../i18n'
import { ExternalIcon } from './icons'

export function InvestigationReference({ source, title }: { source: TaskSource; title: string }) {
  return (
    <a className="chat-investigation-reference" href={source.url} target="_blank" rel="noreferrer" title={t('ConversationDraft.openIn', { value1: source.name })}>
      <span className="chat-investigation-reference-label">{t('ConversationChat.referencedIssue')} · {source.name} <span className="chat-investigation-reference-key">{source.key}</span><ExternalIcon /></span>
      <span className="chat-investigation-reference-title">{source.title ?? title}</span>
    </a>
  )
}
