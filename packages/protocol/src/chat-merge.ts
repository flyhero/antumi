import type { ChatItem } from './chat'

// How a client keeps a conversation's chat items as pages and notifications come in; the desktop
// and the phone hold them the same way.

// Item ids are unique within their stage only: each stage numbers its notices and requests afresh.
export function chatItemKey(item: Pick<ChatItem, 'stageId' | 'id'>): string {
  return `${item.stageId}/${item.id}`
}

// A known item is replaced where it stands, a new one goes last: core sends items in order.
export function mergeChatItems(current: readonly ChatItem[], incoming: readonly ChatItem[]): ChatItem[] {
  const next = [...current]
  const index = new Map(next.map((item, position) => [chatItemKey(item), position]))
  for (const item of incoming) {
    const position = index.get(chatItemKey(item))
    if (position === undefined) {
      index.set(chatItemKey(item), next.length)
      next.push(item)
    } else {
      next[position] = item
    }
  }
  return next
}

// A stage sent whole (conversations.chatItems' replaceStage) takes the place of the one held; null
// when the stage is not held, and there is nothing to put it beside.
export function replaceChatStage(current: readonly ChatItem[], stageId: string, items: readonly ChatItem[]): ChatItem[] | null {
  const first = current.findIndex((item) => item.stageId === stageId)
  if (first < 0) return null
  return [...current.slice(0, first), ...items, ...current.slice(first).filter((item) => item.stageId !== stageId)]
}

// An older page goes in front; anything it shares with what is held keeps the newer copy.
export function prependChatItems(current: readonly ChatItem[], older: readonly ChatItem[]): ChatItem[] {
  const held = new Set(current.map(chatItemKey))
  return [...older.filter((item) => !held.has(chatItemKey(item))), ...current]
}

// Without a stage (an older core), the id alone decides; streamed items carry provider-unique ids.
export function appendChatText(items: readonly ChatItem[], stageId: string | undefined, itemId: string, text: string): ChatItem[] {
  return items.map((item) =>
    item.id === itemId && (stageId === undefined || item.stageId === stageId) && (item.kind === 'assistant' || item.kind === 'reasoning')
      ? { ...item, text: item.text + text }
      : item
  )
}
