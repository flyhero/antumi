import type { AgentKind } from './agent'
import { isHelper, type Conversation } from './conversation'
import type { Task } from './task'

// The agent new work takes: the one picked for the latest task or conversation the user started.
// A part of other work (a group chat's or squad's member, a helper, a task's chat, a chat platform's
// answer) or a routine's run was not picked on its own, so it does not count. Whether that agent is
// here to use is the caller's to say.
export function latestStartedAgent(tasks: Iterable<Pick<Task, 'agent' | 'createdAt'>>, conversations: Iterable<Conversation>): AgentKind | null {
  const started = [
    ...[...tasks].flatMap((task) => task.agent ? [{ agent: task.agent, at: task.createdAt }] : []),
    ...[...conversations]
      .filter((each) => !isHelper(each) && !each.taskId && !each.discussionId && !each.squadRunId && !each.parentConversationId && !each.routineId && !each.channel)
      .map((each) => ({ agent: each.agent, at: each.createdAt }))
  ]
  return started.sort((a, b) => b.at - a.at)[0]?.agent ?? null
}
