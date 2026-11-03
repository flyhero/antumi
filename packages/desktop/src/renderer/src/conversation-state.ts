import { t } from './i18n'
import type { Conversation } from '@antumi/protocol'

export type ConversationState = { label: string; running: boolean; failed: boolean; detail: string | null }

// The mark before a conversation's name, most urgent first: it waits on the user, its agent is at
// work, it failed, a turn finished while the user was elsewhere, or nothing is going on.
export type ConversationGlyph = 'awaiting' | 'running' | 'failed' | 'unseen' | 'idle'

export function conversationGlyph(conversation: Conversation, unseen: boolean): ConversationGlyph {
  const state = conversationState(conversation)
  if (conversation.sessionId && conversation.chat?.turn === 'awaiting') return 'awaiting'
  if (state.running && (conversation.starting || conversation.chat?.turn !== 'idle')) return 'running'
  if (state.failed) return 'failed'
  return unseen ? 'unseen' : 'idle'
}

// How long ago, as the list says it: short, and a date past a week.
export function timeAgo(at: number, now: number, format: 'relative' | 'compact' = 'relative'): string {
  const minutes = Math.floor((now - at) / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 7) {
    const date = new Date(at)
    return t('SourceInboxView.monthAndDay', { value1: date.getMonth() + 1, value2: date.getDate() })
  }
  if (format === 'compact') return compactAge(minutes)
  if (minutes < 1) return t('conversationState.justNow')
  if (minutes < 60) return t('conversationState.minutesAgo', { minutes: minutes })
  if (hours < 24) return t('conversationState.hoursAgo', { hours: hours })
  return t('conversationState.daysAgo', { days: days })
}

// The bound the age is under, so it never reads less than the time gone (5m40s is <6m), in the
// next unit up where the bound would be a whole one of it: 59m is <1h, not <60m.
function compactAge(minutes: number): string {
  if (minutes < 59) return `<${minutes + 1}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 23) return `<${hours + 1}h`
  return `<${Math.floor(hours / 24) + 1}d`
}

// One wording for the list, the header and grouping. A conversation has no stopped state: its
// agent starts again with the next message and goes when idle, so what it is doing, or how it
// last failed, is all there is to say.
export function conversationState(conversation: Conversation): ConversationState {
  const { sessionId, lastExit, chat } = conversation
  if (conversation.starting) return { label: t('conversationState.starting'), running: true, failed: false, detail: t('conversationState.preparingAgentYourMessageWillBeSentAfterward') }
  if (sessionId && chat?.turn === 'awaiting') return { label: t('conversationState.awaitingApproval'), running: true, failed: false, detail: t('attention.agentNeedsYourApprovalOrAnswer') }
  if (sessionId && chat?.turn === 'running') return { label: t('ConversationList.running'), running: true, failed: false, detail: null }
  if (conversation.delegation?.open) return { label: t(conversation.delegation.awaiting ? 'AgentProfiles.awaiting' : 'AgentProfiles.delegating'), running: !conversation.delegation.awaiting, failed: false, detail: t('AgentProfiles.calls') }
  // A question the agent asked in passing, still open after its turn.
  if (sessionId && chat?.turn === 'idle' && chat.request?.async) return { label: t('ChatWorking.waitingForYourAnswer'), running: false, failed: false, detail: t('conversationState.agentHasAQuestionForYouAnswerIn') }
  if (!sessionId && lastExit?.code) return { label: t('SettingsPage.unexpectedExit'), running: false, failed: true, detail: t('attention.agentExitedUnexpectedlyCodeSendAMessageTo', { value1: lastExit.code }) }
  return { label: t('SquadWorkPanel.idle'), running: false, failed: false, detail: t('conversationState.sendAMessageToContinue') }
}
