import { agentDescriptor, type AgentKind } from '@antumi/protocol'
import { Rejection } from '../rejection'
import type { AgentAdapter } from './agent-adapter'
import { claude } from './claude/claude-adapter'
import { codex } from './codex/codex-adapter'
import { cursor } from './cursor/cursor-adapter'
import { opencode } from './opencode/opencode-adapter'
import { pi } from './pi/pi-adapter'
import { dsh } from './dsh/dsh-adapter'
import { antigravity } from './antigravity/antigravity-adapter'
import { zcode } from './zcode/zcode-adapter'
import { kimi } from './kimi/kimi-adapter'
import { gemini } from './gemini/gemini-adapter'

// Hooks that only work together: a stalled turn is stopped and offered for retry. An adapter
// declaring one without the other fails as core starts rather than mid-turn.
export function checkAdapter(adapter: AgentAdapter): AgentAdapter {
  const turns = adapter.turns
  if (turns?.firstFrameTimeoutMs && !(turns.stopAfterCancel && turns.retryByRestart)) {
    throw new Error(`agent ${adapter.kind} watches for stalled turns without stopAfterCancel and retryByRestart`)
  }
  return adapter
}

// One adapter per agent kind: one left out fails to compile.
export const AGENT_ADAPTERS = { claude: checkAdapter(claude), codex: checkAdapter(codex), cursor: checkAdapter(cursor), opencode: checkAdapter(opencode), pi: checkAdapter(pi), dsh: checkAdapter(dsh), antigravity: checkAdapter(antigravity), zcode: checkAdapter(zcode), kimi: checkAdapter(kimi), gemini: checkAdapter(gemini) } satisfies Record<AgentKind, AgentAdapter>

export function adapterOf(kind: AgentKind): AgentAdapter {
  return AGENT_ADAPTERS[kind]
}

// Scheduled and routine runs have nobody there to answer, which not every agent can run without.
export function checkUnattended(kind: AgentKind): void {
  if (!agentDescriptor(kind).capabilities.unattended) {
    throw new Rejection('agent-unattended-unsupported', `${agentDescriptor(kind).label} 暂不支持无人值守运行`)
  }
}
