import { useState } from 'react'
import { channelPlatform, type ChannelTaskReport, type TaskChannelSource, type TaskStatus } from '@antumi/protocol'
import { useChannelTaskFeedback, useChannelTaskReports } from '../channels'
import { loadConversation, perform, selectConversation, useCore } from '../core-store'
import { dayAndTime } from '../labels'
import { t, type MessageKey } from '../i18n'
import { ChevronDownIcon } from './icons'
import { MarkdownEditor } from './MarkdownEditor'

// Why a report was not posted, as core names it; one this build does not know is shown as it is.
const REASONS = {
  'channel-removed': 'TaskChannelSource.reasonChannelRemoved', 'channel-off': 'TaskChannelSource.reasonChannelOff', 'reports-off': 'TaskChannelSource.reasonReportsOff',
  'tenant-changed': 'TaskChannelSource.reasonTenantChanged', 'task-gone': 'TaskChannelSource.reasonTaskGone', 'platform-refused': 'TaskChannelSource.reasonPlatformRefused',
  'compose-failed': 'TaskChannelSource.reasonComposeFailed', 'cards-off': 'TaskChannelSource.reasonCardsOff', 'nothing-to-post': 'TaskChannelSource.reasonNothingToPost'
} as const satisfies Record<string, MessageKey>
const known = (code: string): code is keyof typeof REASONS => code in REASONS

function reportLine(report: ChannelTaskReport): string {
  const { reason } = report
  return [t(`TaskChannelSource.stage.${report.stage}`), t(`TaskChannelSource.state.${report.state}`), ...(reason ? [known(reason) ? t(REASONS[reason]) : reason] : []), dayAndTime(report.updatedAt)].join(' · ')
}

// The captured message survives removal of the channel and its conversation.
export function TaskChannelSourceCard({ taskId, status, source }: { taskId: string; status: TaskStatus; source: TaskChannelSource | null | undefined }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const reports = useChannelTaskReports(taskId, Boolean(source))
  const feedback = useChannelTaskFeedback(taskId, Boolean(source))
  if (!source) return null
  // The asker sent it back and the owner has not gone on with it: Antumi's own way to.
  const waiting = status === 'review' ? feedback.findLast((each) => each.usedAt === null) : undefined
  const goOn = async () => {
    setBusy(true)
    await perform((rpc) => rpc.call('channels.continueTask', { taskId }))
    setBusy(false)
  }
  const title = t('TaskChannelSource.original', { platform: channelPlatform(source.platform).label })
  const showConversation = async () => {
    await loadConversation(source.conversationId)
    if (useCore.getState().conversations[source.conversationId]) selectConversation(source.conversationId)
  }
  return <section className="snapshot" data-open={open || undefined} aria-label={title}>
    <header className="snapshot-header">
      <button type="button" className="snapshot-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDownIcon />{title}</button>
      <span className="muted">{dayAndTime(source.createdAt)}</span>
      <button type="button" className="button small" onClick={() => void showConversation()}>{t('TaskChannelSource.open')}</button>
    </header>
    {waiting && <div className="chat-notice chat-notice-actionable" data-level="warning" role="status">
      <span>{t('TaskChannelSource.sentBack', { author: waiting.author, reason: waiting.text })}</span>
      <button type="button" className="button small chat-notice-action" disabled={busy} onClick={() => void goOn()}>{t('TaskChannelSource.continue')}</button>
    </div>}
    {open && <>
      <p className="muted">{t('TaskChannelSource.metadata', { asker: source.asker, place: source.place, message: source.messageId })}</p>
      <MarkdownEditor value={source.text || t('AgentChannels.imagesOnly')} label={title} hint="" readOnly />
      {reports.length > 0 && <section aria-label={t('TaskChannelSource.reports')}>
        <p><strong>{t('TaskChannelSource.reports')}</strong></p>
        {reports.map((report) => <p key={report.id} className="muted">{reportLine(report)}</p>)}
      </section>}
      {feedback.length > 0 && <section aria-label={t('TaskChannelSource.feedback')}>
        <p><strong>{t('TaskChannelSource.feedback')}</strong></p>
        {feedback.map((each) => <p key={each.id} className="muted">{t(each.usedAt === null ? 'TaskChannelSource.feedbackWaiting' : 'TaskChannelSource.feedbackUsed', { author: each.author, reason: each.text, at: dayAndTime(each.createdAt) })}</p>)}
      </section>}
    </>}
  </section>
}
