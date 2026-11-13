import { agentDescriptor, type AgentKind, type Conversation, type Task } from '@antumi/protocol'
import { locale, strings } from './i18n'

export function agentName(agent: AgentKind): string {
  return agentDescriptor(agent, locale === 'zh' ? 'zh-CN' : 'en').label
}

export function modeName(agent: AgentKind, mode: string): string {
  const known = agentDescriptor(agent, locale === 'zh' ? 'zh-CN' : 'en').modes
  return Object.entries(known).find(([name]) => name === mode)?.[1]?.label ?? mode
}

// A path the agent named, shown from the conversation's project rather than from the root;
// macOS reports /tmp and /var under /private.
export function relativePath(text: string, roots: readonly string[]): string {
  let out = text
  for (const root of roots) {
    const trimmed = root.replace(/\/+$/, '')
    for (const prefix of [`/private${trimmed}/`, `${trimmed}/`]) out = out.split(prefix).join('')
  }
  return out
}

// Whether an approval is for running a command, whose title is then the command itself.
// A reasoning effort as the desktop names it; one it has no name for shows as the agent says it.
export function effortName(effort: string): string {
  const names: Record<string, string> = strings.efforts
  return names[effort] ?? effort
}

export function isCommandRequest(tool: string | null | undefined): boolean {
  return /bash|command|shell|terminal|exec/i.test(tool ?? '')
}

export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

export function taskWhere(task: Task): string {
  return [task.agent ? agentName(task.agent) : null, ...task.repos.map((repo) => folderName(repo.path))].filter(Boolean).join(' · ')
}

export function where(conversation: Conversation): string {
  const project = conversation.projectPaths[0]
  return [agentName(conversation.agent), project ? folderName(project) : null].filter(Boolean).join(' · ')
}
