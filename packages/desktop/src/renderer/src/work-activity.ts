import { getLocale, t } from './i18n'
import { useMemo } from 'react'
import type { AgentKind, Conversation, SquadRun, Task } from '@antumi/protocol'
import { useCore } from './core-store'
import { agentLabel } from './labels'
import { delegationNeedsInput } from './conversation-state'
import { doingText, memberProgress } from './squad-progress'

// Who is at work on something right now, said one way on the board, in a task's header and in
// the inspector: waiting on the user outranks working, as it is what the user can act on.
export type WorkActivity = {
  state: 'running' | 'awaiting'
  workers: { agent: AgentKind; name: string }[]
  // What the first of them is doing, or asked.
  detail: string | null
}

export function conversationActivity(conversation: Conversation | undefined, agent: AgentKind, name = agentLabel(agent)): WorkActivity | null {
  if (!conversation) return null
  const turn = conversation.chat?.turn
  if (conversation.sessionId && turn === 'awaiting') return { state: 'awaiting', workers: [{ agent, name }], detail: conversation.chat?.request?.title || null }
  if (delegationNeedsInput(conversation)) return { state: 'awaiting', workers: [{ agent, name }], detail: t('conversationState.delegationNeedsInput') }
  if (!conversation.sessionId) return null
  if (turn === 'running' || conversation.starting) return { state: 'running', workers: [{ agent, name }], detail: doingText(conversation.chat?.doing) }
  return null
}

export function latestSquadRun(taskId: string, runs: Readonly<Record<string, SquadRun>>): SquadRun | null {
  return Object.values(runs).filter((run) => run.taskId === taskId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
}

// A squad's task works through its members, each in a conversation of its own; any other task
// through its one chat.
export function taskActivity(task: Task, conversations: Readonly<Record<string, Conversation>>, runs: Readonly<Record<string, SquadRun>>): WorkActivity | null {
  const run = task.squadId ? latestSquadRun(task.id, runs) : null
  if (!run) return task.agent ? conversationActivity(task.conversationId ? conversations[task.conversationId] : undefined, task.agent) : null
  if (run.state !== 'running' && run.state !== 'paused') return null
  const busy = memberProgress(run, conversations).filter((member) => member.state === 'running' || member.state === 'starting' || member.state === 'awaiting')
  if (!busy.length) return null
  const asking = busy.filter((member) => member.state === 'awaiting')
  const shown = asking.length ? asking : busy
  // The leader's own line says little while members work; theirs come first.
  const first = shown.find((member) => !member.leader && member.detail) ?? shown.find((member) => member.detail)
  return {
    state: asking.length ? 'awaiting' : 'running',
    workers: shown.map(({ member }) => ({ agent: member.agent, name: member.name })),
    detail: first ? `${first.member.name}：${first.detail}` : null
  }
}

export function useTaskActivity(task: Task | undefined): WorkActivity | null {
  const conversations = useCore((state) => state.conversations)
  const runs = useCore((state) => state.squadRuns)
  return useMemo(() => (task ? taskActivity(task, conversations, runs) : null), [task, conversations, runs, getLocale()])
}
