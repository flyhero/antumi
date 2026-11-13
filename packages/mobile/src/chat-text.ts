import { cursorProviderError, formatTokens, type ChatItem } from '@antumi/protocol'
import { locale, t } from './i18n'

// How the chat's own lines read (desktop ConversationChat, chat-notices and ChatUsageLimit), in this
// app's words.

type Turn = Extract<ChatItem, { kind: 'turn' }>
type UsageLimit = Extract<ChatItem, { kind: 'usageLimit' }>

// How long something worked, as a person says it.
export function workedFor(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  if (seconds < 60) return t('durationSeconds', { seconds })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 ? t('durationMinutesSeconds', { minutes, seconds: seconds % 60 }) : t('durationMinutes', { minutes })
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? t('durationHoursMinutes', { hours, minutes: minutes % 60 }) : t('durationHours', { hours })
}

// A moment as a clock reads it, with the date when it is not today.
export function clock(at: number, now = Date.now()): string {
  const date = new Date(at)
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  return date.toDateString() === new Date(now).toDateString() ? time : `${t('monthDay', { month: date.getMonth() + 1, day: date.getDate() })}${time}`
}

// How a turn ended, how long it ran and what it took.
export function turnText(item: Turn): string {
  const tokens = !item.usage ? '' : 'total' in item.usage ? t('totalTokens', { count: formatTokens(item.usage.total) }) : ` · ↑ ${formatTokens(item.usage.input)} ↓ ${formatTokens(item.usage.output)}`
  const took = (item.durationMs !== null ? ` · ${workedFor(item.durationMs)}` : '') + tokens
  const why = !item.resumed ? '' : item.resumedBy === 'command' ? t('resumedAfterCommand') : item.resumedBy === 'subagent' ? t('resumedAfterSubagent') : t('autoResumed')
  const error = item.error ? `：${readableNotice(item.error)}` : ''
  if (item.state === 'completed') return t('turnCompleted', { why, took })
  return t(item.state === 'interrupted' ? 'turnInterrupted' : 'turnFailed', { why, took, error })
}

// Claude Code once said when a usage limit lifts only as epoch seconds after a bar; a Cursor
// provider error reads as its summary.
export function readableNotice(text: string): string {
  const provider = cursorProviderError(text.trim(), locale === 'zh' ? 'zh-CN' : 'en')
  if (provider && !provider.rest) return provider.summary
  return text.replace(/Claude AI usage limit reached\|(\d{10})/g, (_match, seconds: string) => {
    const at = new Date(Number(seconds) * 1000)
    const time = `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`
    const date = at.toDateString() === new Date().toDateString() ? '' : t('monthDay', { month: at.getMonth() + 1, day: at.getDate() })
    return t('claudeUsageLimit', { date, time })
  })
}

// What became of a turn the usage limit stopped: when it goes on, or went on.
export function usageLimitText(item: UsageLimit, now = Date.now()): string {
  if (item.status === 'retrying') return t('usageLimitResuming')
  if (item.status === 'continued') return item.continuedAt === null ? t('usageLimitResumed') : t('usageLimitResumedAt', { time: clock(item.continuedAt, now) })
  if (item.status === 'waiting' && item.autoContinue && item.continueAt !== null) return t('usageLimitAutoAt', { time: clock(item.continueAt, now) })
  if (item.resetsAt !== null && item.resetsAt <= now) return t('usageLimitRestored')
  return item.resetsAt === null ? t('usageLimitExhausted') : t('usageLimitResets', { time: clock(item.resetsAt, now) })
}
