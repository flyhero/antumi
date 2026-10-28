import { t, tr } from '../i18n'
import { useState } from 'react'
import { quotaVerdict, type AgentKind, type ChatItem, type Conversation } from '@antumi/protocol'
import { accountName, accountsOf } from '../agent-accounts'
import { useInstalledAgents } from '../installed-agents'
import { perform, setSchedulesOpen, useCore, useUsageLimitSupported } from '../core-store'
import { scheduleTime, UNATTENDED_LABEL } from '../schedules'
import { agentLabel } from '../labels'
import { formatClock, useNow } from '../usage-format'
import { useChatSurface } from './chat-surface'

export type UsageLimitItem = Extract<ChatItem, { kind: 'usageLimit' }>

export function usageLimitOpen(item: UsageLimitItem, now: number): boolean {
  const waiting = item.status === 'waiting' || item.status === 'retrying'
  return waiting && (item.resetsAt === null || item.resetsAt > now)
}

// The name of the account core moved the agent to, to go on at once; null where it did not.
function useSwitchedTo(item: UsageLimitItem, agent: AgentKind | undefined): string | null {
  const accounts = useCore((s) => s.accounts)
  const account = agent && item.switchedTo ? accountsOf(accounts, agent).find((each) => each.id === item.switchedTo) : undefined
  return account ? accountName(account) : null
}

// What became of a turn the usage limit stopped, in the conversation's flow: one line, as a
// request's is, saying when it goes on or went on, and on which account where it moved to one.
export function usageLimitText(item: UsageLimitItem, now: number, switchedTo: string | null = null): string {
  if (switchedTo && item.status === 'continued') return t('AgentAccounts.switchedTo', { value1: switchedTo })
  if (switchedTo && (item.status === 'retrying' || (item.status === 'waiting' && item.autoContinue))) return t('AgentAccounts.switchingTo', { value1: switchedTo })
  switch (item.status) {
    case 'retrying':
      return t('ChatUsageLimit.quotaExhaustedResuming')
    case 'continued':
      return item.continuedAt === null ? t('ChatUsageLimit.quotaExhaustedResumed') : t('ChatUsageLimit.quotaExhaustedResumedAt', { value1: formatClock(item.continuedAt, now) })
    case 'waiting':
      if (item.autoContinue && item.continueAt !== null) return t('ChatUsageLimit.quotaExhaustedAutoResumeAt', { value1: formatClock(item.continueAt, now) })
  }
  if (item.resetsAt !== null && item.resetsAt <= now) return t('ChatUsageLimit.quotaRestored')
  return item.resetsAt === null ? t('ChatUsageLimit.quotaExhausted') : t('ChatUsageLimit.quotaExhaustedResets', { value1: formatClock(item.resetsAt, now) })
}

export function ChatUsageLimitLine({ item, agent }: { item: UsageLimitItem; agent?: AgentKind }) {
  const now = useNow(60_000)
  const switchedTo = useSwitchedTo(item, agent)
  const waiting = item.status === 'waiting' && item.autoContinue
  return (
    <div className="chat-request-line" data-waiting={waiting || undefined}>
      {usageLimitText(item, now, switchedTo)}
    </div>
  )
}

// While the chat waits on a usage limit, in the flow right after the turn it stopped. It does not
// take the composer's place as a request does: writing to the agent is still how the user goes on
// another way, and that drops the wait.
export function ChatUsageLimitCard({ conversation, item }: { conversation: Conversation; item: UsageLimitItem }) {
  const surface = useChatSurface()
  const supported = useUsageLimitSupported()
  const now = useNow(30_000)
  const [busy, setBusy] = useState(false)
  // What the user just ticked, shown until core's word on it comes back with the item.
  const [wanted, setWanted] = useState<boolean | null>(null)
  const installed = useInstalledAgents()
  const usage = useCore((s) => s.usage)
  // The run that continues it, as the schedule list has it; a run the user scheduled in this chat
  // may have taken the limit over: it continues at its time, in the unattended mode, and is the
  // user's to manage, so the checkbox (which would only cancel their run) gives way to a link.
  const run = useCore((s) => (item.runId ? s.schedules.find((each) => each.id === item.runId) : undefined))
  const mode = useCore((s) => s.chatSettings?.unattendedMode ?? 'acceptEdits')
  const switchedTo = useSwitchedTo(item, conversation.agent)
  if (!supported) return null
  const takenOver = run?.target.kind === 'conversation' && item.status === 'waiting' && item.autoContinue ? run : null
  // Handing off is offered to the first other agent with room to take the work; the composer's
  // picker then lets the user choose any of them.
  const other = installed.find((agent) => agent !== conversation.agent && ['ok', 'tight'].includes(quotaVerdict(usage?.[agent], now).state)) ?? null
  const handoff = surface.handoff && other ? () => surface.handoff?.(other) : null
  const target = { id: conversation.id, stageId: item.stageId, itemId: item.id }
  const retrying = busy || item.status === 'retrying'
  const toggle = async (autoContinue: boolean) => {
    setWanted(autoContinue)
    await perform((rpc) => rpc.call('conversations.setUsageLimitAutoContinue', { ...target, autoContinue }))
    setWanted(null)
  }
  const retry = async () => {
    setBusy(true)
    await perform((rpc) => rpc.call('conversations.retryUsageLimit', target))
    setBusy(false)
  }
  const detail = switchedTo && (retrying || item.status === 'waiting')
    ? t('AgentAccounts.switchingTo', { value1: switchedTo })
    : retrying
    ? t('ChatUsageLimit.retrying')
    : takenOver
      ? t('ChatUsageLimit.willResumeAsScheduledUnattendedInMode', { value1: takenOver.notBefore !== null ? t('ChatUsageLimit.at', { value1: scheduleTime(takenOver.notBefore, now) }) : t('ChatUsageLimit.whenQuotaResets'), value2: UNATTENDED_LABEL[mode] })
    : item.autoContinue && item.continueAt !== null
      ? t('ChatUsageLimit.willAutoResumeAt', { value1: formatClock(item.continueAt, now) })
      : item.resetsAt !== null
        ? t('ChatUsageLimit.quotaResets', { value1: formatClock(item.resetsAt, now) })
        : t('ChatUsageLimit.quotaResetTimeIsUnknown')
  return (
    <div className="chat-request chat-usage-limit" role="status">
      <div className="chat-request-title">{t('ChatUsageLimit.conversationQuotaExhausted')}</div>
      <p className="chat-request-detail muted">{detail}</p>
      {item.error && !retrying && <p className="chat-request-detail chat-usage-limit-error">{tr('ChatUsageLimit.lastResumeFailed', { value1: item.error })}</p>}
      <div className="chat-request-actions">
        {takenOver ? (
          <button type="button" className="link-button settings-link" onClick={() => setSchedulesOpen(true)}>{t('ChatDock.manageSchedule')}</button>
        ) : (
          <label className="conversation-confirm">{tr('ChatUsageLimit.autoResumeWhenQuotaResets', { value1: <input type="checkbox" checked={wanted ?? item.autoContinue} disabled={retrying} onChange={(event) => void toggle(event.target.checked)} /> })}</label>
        )}
        {!takenOver && item.runId && item.autoContinue && item.status === 'waiting' && (
          <button type="button" className="link-button" onClick={() => setSchedulesOpen(true)}>{t('ChatUsageLimit.viewInSchedules')}</button>
        )}
        <span className="chat-dock-spacer" />
        {handoff && other && (
          <button type="button" className="button" disabled={retrying} onClick={handoff}>{tr('ChatComposer.handOffTo', { value1: agentLabel(other) })}</button>
        )}
        <button type="button" className="button primary" disabled={retrying} onClick={() => void retry()}>
          {retrying ? t('ChatUsageLimit.retrying') : t('ChatUsageLimit.retryNow')}
        </button>
      </div>
    </div>
  )
}

// In the conversation's flow: the card while the chat waits on the limit, then the line it leaves.
export function ChatUsageLimitEntry({ conversationId, item }: { conversationId: string; item: UsageLimitItem }) {
  const conversation = useCore((s) => s.conversations[conversationId])
  const supported = useUsageLimitSupported()
  const now = useNow(30_000)
  const open = usageLimitOpen(item, now)
  return conversation && supported && open ? <ChatUsageLimitCard conversation={conversation} item={item} /> : <ChatUsageLimitLine item={item} agent={conversation?.agent} />
}
