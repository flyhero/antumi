import { groupActivity, type ListItem } from '../conversation-list-items'
import { useCore } from '../core-store'
import { t } from '../i18n'
import { ChatIcon, ClockIcon, WarningIcon } from './icons'
import { Spinner } from './Spinner'

const SIGNALS = [
  { kind: 'awaiting', message: 'ConversationList.groupAwaiting', Icon: ClockIcon },
  { kind: 'failed', message: 'ConversationList.groupFailed', Icon: WarningIcon },
  { kind: 'unseen', message: 'ConversationList.groupUnseen', Icon: ChatIcon },
  { kind: 'running', message: 'ConversationList.groupRunning', Icon: Spinner }
] as const

export function ConversationGroupActivity({ items }: { items: readonly ListItem[] }) {
  const unseen = useCore((s) => s.unseen)
  const counts = groupActivity(items, unseen)
  const signals = SIGNALS.filter(({ kind }) => counts[kind] > 0)
  const primary = signals[0]
  if (!primary) return null
  const description = signals.map(({ kind, message }) => t(message, { count: counts[kind] })).join(' · ')
  const { kind, Icon } = primary
  return (
    <span className="conversation-group-activity" role="img" aria-label={description} title={description}>
      <span className="conversation-group-signal" data-state={kind} aria-hidden="true">
        <Icon />
        <span>{counts[kind]}</span>
      </span>
    </span>
  )
}
