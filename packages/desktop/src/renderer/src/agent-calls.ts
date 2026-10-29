import { useMemo, useSyncExternalStore } from 'react'
import type { AgentCall, ChatItem, Conversation, RpcConnection } from '@antumi/protocol'
import { perform, selectConversation, useCore } from './core-store'

export async function openAgentCall(call: AgentCall): Promise<void> {
  const child = await perform((rpc) => rpc.call('conversations.get', { id: call.conversationId }))
  if (!child) return
  useCore.setState((state) => ({ conversations: { ...state.conversations, [child.id]: child } }))
  selectConversation(child.id)
}

type CallsSnapshot = { calls: readonly AgentCall[] | null; error: string | null }
const EMPTY: CallsSnapshot = { calls: null, error: null }
const EMPTY_FEED = { getSnapshot: () => EMPTY, subscribe: (_listener: () => void) => () => {} }
const feeds = new WeakMap<RpcConnection, Map<string, ReturnType<typeof createCallsFeed>>>()

function createCallsFeed(rpc: RpcConnection, id: string) {
  let snapshot = EMPTY
  const listeners = new Set<() => void>()
  let stop = () => {}
  const publish = (next: CallsSnapshot) => { snapshot = next; for (const listener of listeners) listener() }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) {
        let current = true
        const changes = new Map<string, AgentCall>()
        const off = rpc.on('agentCalls.changed', ({ call }) => {
          if (call.parentId !== id) return
          changes.set(call.id, call)
          publish({ calls: [...(snapshot.calls ?? []).filter((item) => item.id !== call.id), call], error: null })
        })
        void rpc.call('agentCalls.list', { id }).then((calls) => {
          if (current) publish({ calls: [...new Map([...calls, ...changes.values()].map((call) => [call.id, call])).values()], error: null })
        }).catch((reason: unknown) => { if (current) publish({ ...snapshot, error: String(reason) }) })
        stop = () => { current = false; off() }
      }
      return () => { listeners.delete(listener); if (listeners.size === 0) stop() }
    }
  }
}

// Chat cards and the inspector share one subscription; late list replies cannot undo live updates.
export function agentCallsFeed(rpc: RpcConnection, id: string) {
  let pool = feeds.get(rpc)
  if (!pool) { pool = new Map(); feeds.set(rpc, pool) }
  let feed = pool.get(id)
  if (!feed) { feed = createCallsFeed(rpc, id); pool.set(id, feed) }
  return feed
}

export function useAgentCalls(id: string | null): CallsSnapshot {
  const rpc = useCore((state) => state.rpc)
  const feed = useMemo(() => rpc && id && rpc.features.includes('agent-profiles') ? agentCallsFeed(rpc, id) : EMPTY_FEED, [rpc, id])
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot, EMPTY_FEED.getSnapshot)
}

export function isAgentCallResult(item: Pick<ChatItem, 'kind' | 'id'>): boolean {
  return item.kind === 'user' && /^u:agent-result:[0-9a-f-]{36}$/.test(item.id)
}

// The inspector on its 委派 page; with a call, on that one, picked out and open.
export function showAgentCalls(inspector: 'task' | 'conversation', callId: string | null = null): void {
  if (inspector === 'task') useCore.setState({ inspectorOpen: true, taskInspectorTab: 'delegation', agentCallFocus: callId })
  else useCore.setState({ conversationInspectorOpen: true, conversationInspectorTab: 'delegation', agentCallFocus: callId })
}

export function useAgentCallsSupported(conversation: Conversation | undefined): boolean {
  const supported = useCore((state) => state.rpc?.features.includes('agent-profiles') ?? false)
  return supported && Boolean(conversation && !conversation.parentConversationId && !conversation.discussionId && !conversation.squadRunId && !conversation.routineId && !conversation.helperOf)
}
