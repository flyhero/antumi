import type { AgentKind } from './agent'
import { agentDescriptor } from './agents'
import type { ChatModel, ChatPermissionMode, UnattendedMode } from './chat'

// What a new conversation can start in, with auto where the model takes it (as the agent's catalog
// says) and bypass where the agent has it, in the order a running chat lists them.
export function startModes(agent: AgentKind, model: ChatModel | undefined): ChatPermissionMode[] {
  const { startModes, capabilities } = agentDescriptor(agent)
  return [...startModes, ...(model?.autoMode && capabilities.autoMode && !startModes.includes('auto') ? ['auto' as const] : []), ...(capabilities.bypass ? ['bypass' as const] : [])]
}

// The agent's own mode a run nobody watches works in, of those offered (a running chat's, or
// startModes); null where it offers none of them.
export function unattendedPermission(agent: AgentKind, mode: UnattendedMode, offered: readonly string[]): ChatPermissionMode | null {
  const wanted = mode === 'bypass' ? ['bypass' as const] : agentDescriptor(agent).unattendedModes ?? ['acceptEdits' as const]
  return wanted.find((each) => offered.includes(each)) ?? null
}
