import type { AgentKind, ChatCatalog, RpcParams } from '@antumi/protocol'

// A failed provider lookup must never discover native models as a substitute.
export async function requestModelCatalog(
  read: (params: RpcParams<'conversations.chatCatalog'>) => Promise<ChatCatalog | null | undefined>,
  agent: AgentKind,
  modelProvider?: string | null
): Promise<ChatCatalog | null> {
  try { return await read({ agent, ...(modelProvider ? { modelProvider } : {}) }) ?? null }
  catch { return null }
}
