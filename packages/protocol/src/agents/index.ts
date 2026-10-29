import type { UiLocale } from '../localization'
import type { AgentKind } from '../agent'
import { ChatPermissionMode } from '../chat'
import type { AgentDescriptor, AgentModeText } from './agent-descriptor'
import { claude } from './claude'
import { codex } from './codex'
import { cursor } from './cursor'
import { opencode } from './opencode'
import { pi } from './pi'
import { dsh } from './dsh'
import { antigravity } from './antigravity'
import { zcode } from './zcode'
import { kimi } from './kimi'
import { gemini } from './gemini'

export type { AgentDescriptor, AgentModeText } from './agent-descriptor'
export { modelPrice } from './model-prices'

// One entry per agent kind: one left out fails to compile.
export const AGENT_DESCRIPTORS = { claude, codex, cursor, opencode, pi, dsh, antigravity, zcode, kimi, gemini } satisfies Record<AgentKind, AgentDescriptor>

export function agentDescriptor(kind: AgentKind, locale: UiLocale = 'zh-CN'): AgentDescriptor {
  const descriptor = AGENT_DESCRIPTORS[kind]
  return locale === 'en' ? { ...descriptor, ...descriptor.translations?.en } : descriptor
}

// A mode a stage reports, as the agent names it; undefined for one Antumi has no name for.
export function agentModeText(kind: AgentKind, mode: string, locale: UiLocale = 'zh-CN'): AgentModeText | undefined {
  const known = ChatPermissionMode.safeParse(mode)
  return known.success ? agentDescriptor(kind, locale).modes[known.data] : undefined
}
