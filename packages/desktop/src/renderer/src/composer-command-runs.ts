import { useEffect } from 'react'
import { create } from 'zustand'
import type { SavedChatCommand } from '@antumi/protocol'

// A pinned command clicked above the composer, for that conversation's composer to run: it alone
// knows what is typed there and whether the agent can take a message.
const EMPTY: readonly SavedChatCommand[] = []
const useRuns = create<Record<string, readonly SavedChatCommand[]>>(() => ({}))

export function runInComposer(conversationId: string, command: SavedChatCommand): void {
  useRuns.setState((state) => ({ [conversationId]: [...(state[conversationId] ?? []), command] }))
}

export function useComposerCommandRuns(conversationId: string, run: (command: SavedChatCommand) => void): void {
  const pending = useRuns((state) => state[conversationId] ?? EMPTY)
  useEffect(() => {
    if (!pending.length) return
    useRuns.setState({ [conversationId]: EMPTY })
    for (const command of pending) run(command)
  }, [conversationId, pending, run])
}
