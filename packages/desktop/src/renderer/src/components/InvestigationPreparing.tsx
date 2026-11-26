import { useState } from 'react'
import type { Conversation } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { preparingError } from '../conversation-state'
import { t } from '../i18n'
import { Spinner } from './Spinner'

// Where an issue's conversation stands before its agent can start: core fetching the issue, then
// its images; or why that stopped, with a retry.
export function InvestigationPreparing({ conversation }: { conversation: Conversation }) {
  const { preparing, source } = conversation
  const rpc = useCore((s) => s.rpc)
  const [retrying, setRetrying] = useState(false)
  if (!preparing) return null
  const key = source?.key ?? conversation.title
  if (preparing.error !== null) {
    const retry = async () => {
      setRetrying(true)
      const retried = await perform((client) => client.call('sources.retryInvestigation', { id: conversation.id }))
      if (retried) useCore.setState((s) => ({ conversations: { ...s.conversations, [retried.id]: retried } }))
      setRetrying(false)
    }
    return (
      <div className="chat-initial-error chat-notice" data-level="error" role="alert">
        <span title={preparing.error}>{t('InvestigationPreparing.failed', { key, error: preparingError(preparing) })}</span>
        <button type="button" className="button ghost" disabled={!rpc || retrying} onClick={() => void retry()}>{t('ChatContextMenu.retry')}</button>
      </div>
    )
  }
  return (
    <div className="chat-working" role="status">
      <Spinner />
      <span>{preparing.step === 'images'
        ? t('InvestigationPreparing.fetchingImages', { key })
        : t('InvestigationPreparing.fetchingIssue', { key, source: source?.name ?? '' })}</span>
    </div>
  )
}
