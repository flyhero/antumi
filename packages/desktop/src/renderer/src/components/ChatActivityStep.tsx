import { createContext, useContext, type ReactNode } from 'react'
import type { ChatActivity } from '../chat-activity'
import { useJustFinished } from '../chat-motion'
import { t } from '../i18n'
import { ChatToolIcon } from './ChatToolIcon'
import { CheckIcon, HelpIcon, ListIcon, SparkIcon } from './icons'

export const ChatTimelineEnabled = createContext(true)

const STATUS = {
  running: 'ChatTodos.inProgress', done: 'ChatActivityStep.done', failed: 'ChatToolCard.failed',
  denied: 'approvalChoiceText.denied', interrupted: 'ChatToolCard.interrupted', awaiting: 'ChatActivityStep.awaiting'
} as const

export function ChatActivityStep({ activity, connected, children }: { activity: ChatActivity | null; connected: boolean; children: ReactNode }) {
  const enabled = useContext(ChatTimelineEnabled)
  const finished = useJustFinished(activity?.kind === 'tool' && activity.status === 'running')
  if (!enabled || !activity) return children
  const Icon = activity.kind === 'reasoning' ? SparkIcon : activity.kind === 'todos' ? ListIcon : activity.status === 'done' ? CheckIcon : HelpIcon
  return <div className="chat-activity" data-connected={connected || undefined}>
    <span className="chat-activity-node" data-status={activity.status} data-finished={finished || undefined} title={t(STATUS[activity.status])} aria-hidden="true">
      {activity.kind === 'tool' ? <ChatToolIcon name={activity.tool.name} display={activity.tool.display} status={activity.status} /> : <Icon />}
    </span>
    <div className="chat-activity-content">{children}</div>
  </div>
}
