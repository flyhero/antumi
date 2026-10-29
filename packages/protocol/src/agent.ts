import { z } from 'zod'

// Its own module so chat and task can both use it: a task keeps the chat options it starts in.
export const AGENT_KINDS = ['claude', 'codex', 'cursor', 'opencode', 'pi', 'dsh', 'antigravity', 'zcode', 'kimi', 'gemini'] as const
export const AgentKind = z.enum(AGENT_KINDS)
export type AgentKind = z.infer<typeof AgentKind>

export function isAgentKind(value: string): value is AgentKind {
  return AGENT_KINDS.some((kind) => kind === value)
}
