import { z } from 'zod'
import { agentDescriptor, DEFAULT_INSTANCE, type AgentKind, type ChatPermissionMode, type SourceDescriptor, type SourceInbox } from '@antumi/protocol'

export const inboxKey = (inbox: Pick<SourceInbox, 'provider' | 'instance'>) => `${inbox.provider}/${inbox.instance}`

export type ActiveInbox = { key: string; inbox: SourceInbox; name: string }

// The inboxes that are set up and signed in, in the order their sources are listed.
export function activeInboxes(sources: readonly SourceDescriptor[] | null, inboxes: Readonly<Record<string, SourceInbox>>): ActiveInbox[] {
  return (sources ?? []).flatMap((source) =>
    source.instances.flatMap((entry) => {
      const key = inboxKey({ provider: source.provider, instance: entry.instance })
      const inbox = inboxes[key]
      const name = entry.instance === DEFAULT_INSTANCE ? source.name : `${source.name} · ${entry.instance}`
      return inbox?.active ? [{ key, inbox, name }] : []
    })
  )
}

// The tab asked for while it is still there; otherwise the first with work waiting, then the first.
export function inboxTab(active: readonly ActiveInbox[], wanted: string | null): string | null {
  const chosen = active.find((entry) => entry.key === wanted) ?? active.find((entry) => entry.inbox.items.length > 0) ?? active[0]
  return chosen?.key ?? null
}

// The projects an inbox's issues were last looked into in, which the next one starts with: an
// inbox usually follows one codebase. Kept in memory, and locally where storage allows.
const INVESTIGATED_IN = 'antumi.inbox-investigation-projects'
const Investigated = z.record(z.string(), z.array(z.string()))

function loadInvestigated(): Record<string, string[]> {
  try {
    return Investigated.safeParse(JSON.parse(localStorage.getItem(INVESTIGATED_IN) ?? '{}')).data ?? {}
  } catch {
    return {}
  }
}

let investigated = loadInvestigated()

export function investigationProjects(key: string): string[] {
  return investigated[key] ?? []
}

export function rememberInvestigationProjects(key: string, paths: readonly string[]): void {
  investigated = { ...investigated, [key]: [...paths] }
  try {
    localStorage.setItem(INVESTIGATED_IN, JSON.stringify(investigated))
  } catch {
    // Storage full or blocked: this window still remembers.
  }
}

// The mode an agent looks into an issue in: the one last picked for it, else where it only reads,
// as a group chat member does; null where it offers neither, to fall back to its own default.
export function investigationMode(agent: AgentKind, offered: readonly ChatPermissionMode[], remembered: ChatPermissionMode | undefined): ChatPermissionMode | null {
  if (remembered && offered.includes(remembered)) return remembered
  const reading = agentDescriptor(agent).discussionMode
  return offered.includes(reading) ? reading : null
}
