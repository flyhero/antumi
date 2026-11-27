import { latestStartedAgent, type AgentKind, type Conversation, type Task } from '@antumi/protocol'
import { currentInstalledAgents } from './installed-agents'

// New work, a task or a conversation, takes the agent picked for the latest one the user started
// (latestStartedAgent), which is usually right. An agent that is not installed here is never the
// default: the only one that is stands in, when there is exactly one, and otherwise the choice is left open.
export function defaultAgent(tasks: Readonly<Record<string, Task>>, conversations: Readonly<Record<string, Conversation>>): AgentKind | null {
  const wanted = latestStartedAgent(Object.values(tasks), Object.values(conversations))
  const installed = currentInstalledAgents()
  if (wanted && installed.includes(wanted)) return wanted
  return installed.length === 1 ? installed[0]! : null
}
