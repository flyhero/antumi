import { CODEX_IMAGE_GENERATION, isBrowserTool, isPreviewTool, type ChatItem, type ChatToolStatus } from '@antumi/protocol'
import type { ChatBlock } from './chat-state'
import { toolDisplayStatus, toolRunStatus } from './chat-tools'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
export type ChatActivity =
  | { kind: 'tool'; tool: ToolItem; status: ChatToolStatus }
  | { kind: 'reasoning' | 'todos' | 'request'; status: ChatToolStatus | 'awaiting' }

// Keep answers and what the turn made for the user (a preview, the browser, a drawn picture) off
// the work rail, including while they stream. A picture the agent only looked at is a step.
export function activityOf(block: ChatBlock): ChatActivity | null {
  if (block.kind === 'tools' || block.kind === 'edits' || block.kind === 'agents') {
    const tool = block.tools.find((item) => item.status === 'running') ?? block.tools[0]
    return tool ? { kind: 'tool', tool, status: toolRunStatus(block.tools).status } : null
  }
  if (block.kind !== 'entry' || block.entry.kind !== 'item') return null
  const item = block.entry.item
  switch (item.kind) {
    case 'tool':
      if (isPreviewTool(item.name) || isBrowserTool(item.name) || item.name === CODEX_IMAGE_GENERATION) return null
      return { kind: 'tool', tool: item, status: toolDisplayStatus(item) }
    case 'reasoning':
      return { kind: 'reasoning', status: item.streaming ? 'running' : 'done' }
    case 'todos':
      return item.todos.length ? { kind: 'todos', status: item.todos.some((todo) => todo.status === 'in_progress') ? 'running' : 'done' } : null
    case 'approval':
    case 'question':
      return { kind: 'request', status: item.resolution === null ? 'awaiting' : item.resolution === 'denied' ? 'denied' : item.resolution === 'cancelled' ? 'interrupted' : 'done' }
    default:
      return null
  }
}
