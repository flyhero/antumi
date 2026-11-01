import { useEffect } from 'react'
import type { ChatItem } from '@antumi/protocol'
import { dropChat, setChatPage, useChat } from './chat-state'
import { useCore } from './core-store'

const NO_ITEMS: readonly ChatItem[] = []

// A chat's items while something shows a part of it (the island's card, a group chat's member
// requests), kept current as the chat view keeps its own; let go when it stops showing.
export function useWatchedChat(conversationId: string | null): readonly ChatItem[] {
  const rpc = useCore((s) => s.rpc)
  useEffect(() => {
    if (!rpc || !conversationId) return
    let current = true
    rpc.call('conversations.watchChat', { id: conversationId }).then(
      (result) => current && setChatPage(conversationId, result),
      () => {}
    )
    return () => {
      current = false
      dropChat(conversationId)
      void rpc.call('conversations.unwatchChat', { id: conversationId }).catch(() => {})
    }
  }, [rpc, conversationId])
  return useChat((s) => (conversationId ? s[conversationId]?.items : undefined)) ?? NO_ITEMS
}
