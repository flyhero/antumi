// What a long list of things to pick (skills, MCP servers) shows: the groups they come in, cut down
// to what matches a search, and how much of each is picked.
export type ChecklistItem = { id: string; label: string; detail?: string | null }
export type ChecklistGroup = { id: string; label: string; items: readonly ChecklistItem[] }

// Up to this many, every group starts open; past it, groups start folded and a search shows.
export const CHECKLIST_OPEN_LIMIT = 12

// A group whose name matches keeps all its items; otherwise only the items that match by name or
// description. Groups left with nothing drop out.
export function filterChecklist(groups: readonly ChecklistGroup[], query: string): ChecklistGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...groups]
  const matches = (text: string) => words.every((word) => text.toLowerCase().includes(word))
  return groups.flatMap((group) => {
    if (matches(group.label)) return [group]
    const items = group.items.filter((item) => matches(`${item.label} ${item.detail ?? ''}`))
    return items.length > 0 ? [{ ...group, items }] : []
  })
}

export function checklistSize(groups: readonly ChecklistGroup[]): number {
  return groups.reduce((total, group) => total + group.items.length, 0)
}

// How many of a group's items are picked: none, some or all of them.
export function groupPicked(group: ChecklistGroup, picked: ReadonlySet<string>): { picked: number; all: boolean } {
  const count = group.items.filter((item) => picked.has(item.id)).length
  return { picked: count, all: group.items.length > 0 && count === group.items.length }
}

// The whole group in or out, keeping the order things were picked in.
export function withGroup(selected: readonly string[], group: ChecklistGroup, on: boolean): string[] {
  const ids = group.items.map((item) => item.id)
  if (!on) return selected.filter((id) => !ids.includes(id))
  return [...selected, ...ids.filter((id) => !selected.includes(id))]
}
