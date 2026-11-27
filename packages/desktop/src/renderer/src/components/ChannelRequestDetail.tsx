import { useEffect, useState } from 'react'
import type { ChannelRequest, ChannelToolCall } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { reasonText } from '../labels'

type Detail = { answer: string; reads: ChannelToolCall[] }

export function ChannelRequestDetail({ request }: { request: ChannelRequest }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setDetail(null)
    setError(null)
    void perform(async (rpc) => {
      const [reads, messages] = await Promise.all([
        rpc.call('channels.toolCalls', { requestId: request.id }),
        request.conversationId ? rpc.call('conversations.messages', { id: request.conversationId }) : Promise.resolve([])
      ])
      return { reads, answer: messages.findLast((message) => message.role === 'assistant' && message.eventKey === `chat:${request.id}:assistant`)?.text ?? '' }
    }).then((loaded) => {
      if (!live) return
      if (loaded) setDetail(loaded)
      else setError(useCore.getState().error ?? t('AgentChannels.detailLoadFailed'))
    })
    return () => { live = false }
  }, [request.id, request.conversationId, request.state])
  return <ChannelRequestDetailContent request={request} detail={detail} error={error} />
}

export function ChannelRequestDetailContent({ request, detail, error }: { request: ChannelRequest; detail: Detail | null; error: string | null }) {
  const pending = request.state === 'queued' || request.state === 'running'
  // One core named is said in the owner's language; anything else as it was written down.
  const explained = request.errorReason ? reasonText(request.errorReason, '') : ''
  const emptyAnswer = pending ? t('AgentChannels.answerPending') : request.state === 'failed' && !request.conversationId ? t('AgentChannels.startFailed') : t('AgentChannels.noAnswer')
  return <div className="agent-channel-detail">
    <h5>{t('AgentChannels.question')}</h5>
    <pre>{request.text || t('AgentChannels.imagesOnly')}</pre>
    {request.error && <><h5>{t('AgentChannels.failure')}</h5>{explained ? <p className="agent-channel-failure">{explained}</p> : <pre>{request.error}</pre>}</>}
    {error ? <p className="modal-error" role="alert">{error}</p> : <>
      <h5>{t('AgentChannels.answer')}</h5>
      {detail?.answer ? <pre>{detail.answer}</pre> : <p className="squad-block-hint muted">{detail ? emptyAnswer : '…'}</p>}
      <h5>{t('AgentChannels.reads')}</h5>
      {detail?.reads.length ? <pre>{detail.reads.map((call) => `${call.write ? `${t('AgentChannels.wrote')} ` : ''}${call.tool}  ${call.target}`).join('\n')}</pre> : <p className="squad-block-hint muted">{detail ? t('AgentChannels.noReads') : '…'}</p>}
    </>}
  </div>
}
