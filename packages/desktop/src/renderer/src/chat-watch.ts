import { useEffect } from 'react'
import type { ChatItem, RpcConnection } from '@antumi/protocol'
import { dropChat, setChatPage, useChat } from './chat-state'
import { useCore } from './core-store'

const NO_ITEMS: readonly ChatItem[] = []

// How many on this page hold each chat: the chat view, and panels answering what it waits on (a
// group chat member's, a delegation's) may show the same one at once. The first watches it and
// fetches its latest page; the last to let go drops it, so none pulls it from under another, and a
// second holder leaves the earlier pages the chat view loaded alone.
const holders = new Map<string, number>()

export function holdChat(rpc: Pick<RpcConnection, 'call'>, id: string): () => void {
  const held = holders.get(id) ?? 0
  holders.set(id, held + 1)
  // The page arrives for whoever holds the chat by then, which may be a later holder.
  if (held === 0) {
    rpc.call('conversations.watchChat', { id }).then(
      (result) => holders.has(id) && setChatPage(id, result),
      () => {}
    )
  }
  let released = false
  return () => {
    if (released) return
    released = true
    const left = (holders.get(id) ?? 1) - 1
    if (left > 0) {
      holders.set(id, left)
      return
    }
    holders.delete(id)
    dropChat(id)
    void rpc.call('conversations.unwatchChat', { id }).catch(() => {})
  }
}

// A chat's items while something shows a part of it (the island's card, a request panel), kept
// current as the chat view keeps its own.
export function useWatchedChat(conversationId: string | null): readonly ChatItem[] {
  const rpc = useCore((s) => s.rpc)
  useEffect(() => {
    if (!rpc || !conversationId) return
    return holdChat(rpc, conversationId)
  }, [rpc, conversationId])
  return useChat((s) => (conversationId ? s[conversationId]?.items : undefined)) ?? NO_ITEMS
}
