import { AGENT_CALL_TOOLS, type AgentCall, type ChatItem } from '@antumi/protocol'
import type { ChatBlock } from './chat-state'
import { agentResultCallIds } from './delegation-delivery'

function itemsOf(block: ChatBlock): readonly ChatItem[] {
  if (block.kind === 'entry') return block.entry.kind === 'item' ? [block.entry.item] : []
  if (block.kind === 'fold') return block.blocks.flatMap(itemsOf)
  if ('tools' in block) return block.tools
  return []
}

function dispatched(item: ChatItem, call: AgentCall): boolean {
  if (item.kind !== 'tool' || !item.name.endsWith(AGENT_CALL_TOOLS.dispatch)) return false
  if (item.output?.includes(call.id)) return true
  if (!call.ref || !item.input) return false
  try {
    const input: unknown = JSON.parse(item.input)
    return typeof input === 'object' && input !== null && 'ref' in input && input.ref === call.ref
  } catch { return false }
}

// Place each call's card beside its dispatch, outside folded steps, and those dispatched at the same
// place together, as one fan-out. A partial history may only contain the returned result; keep that
// card beside the return until its older dispatch is loaded.
export function withDelegations(blocks: readonly ChatBlock[], calls: readonly AgentCall[], hasOlder: boolean): ChatBlock[] {
  const items = blocks.map(itemsOf)
  const earliest = Math.min(...items.flatMap((group) => group.map((item) => item.at)))
  const slots = new Map<number, AgentCall[]>()
  for (const call of [...calls].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))) {
    let anchor = items.findIndex((group) => group.some((item) => dispatched(item, call)))
    if (anchor === -1) {
      const delivery = items.findIndex((group) => group.some((item) => agentResultCallIds(item).includes(call.id)))
      if (hasOlder && call.createdAt < earliest) {
        if (delivery === -1) continue
        anchor = delivery - 1
      } else {
        let latest = -Infinity
        items.forEach((group, index) => {
          const at = Math.min(...group.map((item) => item.at))
          if (at <= call.createdAt && at >= latest) { anchor = index; latest = at }
        })
        if (delivery !== -1) anchor = Math.min(anchor, delivery - 1)
      }
    }
    slots.set(anchor, [...(slots.get(anchor) ?? []), call])
  }
  const cards = (index: number): ChatBlock[] => {
    const calls = slots.get(index)
    return calls?.length ? [{ kind: 'delegation', key: `delegation:${calls[0]!.id}`, calls }] : []
  }
  return [...cards(-1), ...blocks.flatMap((block, index) => [block, ...cards(index)])]
}
