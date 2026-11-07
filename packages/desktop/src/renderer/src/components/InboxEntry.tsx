import { t } from '../i18n'
import { setInboxOpen, useCore } from '../core-store'
import { hasFreshIssues, useInboxSeen } from '../inbox-news'
import { CountBadge } from './CountBadge'
import { InboxIcon } from './icons'
import { inboxLocked } from '../sidebar-entries'

// The way to the inbox, at the top of the sidebar beside the overview: an issue may become a task
// or be looked into in a conversation, so it belongs to neither list. Always there once a plugin
// brings a source (before it is signed in, the inbox says how). A failed sync shows in place of
// the count; issues the user has not looked over yet fill it in.
export function InboxEntry() {
  const open = useCore((s) => s.inboxOpen)
  const inboxes = useCore((s) => s.inboxes)
  const sources = useCore((s) => s.sources)
  const active = Object.values(inboxes).filter((inbox) => inbox.active)
  const fresh = useInboxSeen((s) => hasFreshIssues(inboxes, s.seen))
  if (!inboxLocked(sources)) return null
  const waiting = active.reduce((sum, inbox) => sum + inbox.items.length, 0)
  const failed = active.some((inbox) => inbox.problem)
  return (
    <button type="button" className="inbox-entry" aria-current={open}
      aria-label={t('InboxEntry.inbox', { value1: failed ? t('InboxEntry.syncFailed') : waiting ? t(fresh ? 'InboxEntry.pendingFresh' : 'InboxEntry.pending', { waiting: waiting }) : '' })} onClick={() => setInboxOpen(true)}>
      <InboxIcon />
      <span>{t('InboxEntry.inbox_1125')}</span>
      {failed
        ? <span className="inbox-entry-alert" aria-hidden="true">!</span>
        : <CountBadge count={waiting} data-fresh={fresh || undefined} />}
    </button>
  )
}
