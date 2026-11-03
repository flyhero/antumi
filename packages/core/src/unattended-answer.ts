import { isPlanApproval, type ChatItem, type UnattendedMode } from '@antumi/protocol'
import type { ChatAnswer } from './chat-driver'

export const UNATTENDED_DENIAL = '这是无人值守运行，当前模式不允许这一步，已自动拒绝。换一种在项目内完成的做法；做不到就跳过，并在最后的总结里写清楚需要我做什么。'
// How long a question waits for the user, notified as any question is, before it is answered for them.
export const UNATTENDED_QUESTION_WAIT_MS = 10 * 60_000
export const UNATTENDED_QUESTION = '这是无人值守运行，等了 10 分钟没有人回答这个问题。按最合理的假设继续，并在最后的总结里写明你做了哪些假设。'

// What Antumi answers for the user in a run nobody watches, so the run never waits on them for
// long: a question goes unanswered (once it has waited, see ConversationService), with word to
// assume and go on; a plan is approved, as a scheduled run
// approves the one it finds; anything else is allowed where the run allows everything, and denied
// otherwise, with word to work around it. Null for what needs no answer: one already answered,
// and a question asked in passing, which does not hold the agent up.
export function unattendedAnswer(item: ChatItem, mode: UnattendedMode): ChatAnswer | null {
  if (item.kind === 'question') return item.resolution === null && !item.async ? { decision: 'deny', message: UNATTENDED_QUESTION } : null
  if (item.kind !== 'approval' || item.resolution !== null) return null
  if (isPlanApproval(item)) return { decision: 'allowForSession' }
  // Yes this once: a yes for the session can outlast the run (OpenCode keeps "always" for the
  // project), and every later ask is answered here anyway.
  if (mode === 'bypass') {
    const choice = item.choices?.find((each) => each.decision === 'allow')
    return { decision: 'allow', ...(choice ? { choice: choice.id } : {}) }
  }
  // A plain no, rather than one that also rules the tool out for the rest of the session.
  const choice = item.choices?.find((each) => each.decision === 'deny' && each.grants.length === 0) ?? item.choices?.find((each) => each.decision === 'deny')
  return { decision: 'deny', message: UNATTENDED_DENIAL, ...(choice ? { choice: choice.id } : {}) }
}
