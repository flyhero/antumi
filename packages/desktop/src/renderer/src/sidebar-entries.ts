import type { SourceDescriptor } from '@antumi/protocol'
import { useCore } from './core-store'
import { setPreference, usePreferences, type Preferences } from './preferences'

// The sidebar's optional entries, in the order they show. Hiding one only takes its way in out of
// the sidebar: routines still run, group chats go on and ⌘K still finds what they hold.
export const SIDEBAR_ENTRIES = ['inbox', 'routines', 'git', 'discussions'] as const
export type SidebarEntry = (typeof SIDEBAR_ENTRIES)[number]

export const SIDEBAR_PREFERENCE = {
  inbox: 'sidebarInbox', routines: 'sidebarRoutines', git: 'sidebarGit', discussions: 'sidebarDiscussions'
} as const satisfies Record<SidebarEntry, keyof Preferences>

// Once a plugin brings an issue source its issues land in the inbox and nowhere else, so the inbox
// stays; without one it is the user's to show, as a way to set a source up.
export function inboxLocked(sources: readonly SourceDescriptor[] | null): boolean {
  return (sources?.length ?? 0) > 0
}

export function sidebarShows(entry: SidebarEntry, preferences: Pick<Preferences, (typeof SIDEBAR_PREFERENCE)[SidebarEntry]>, sources: readonly SourceDescriptor[] | null): boolean {
  return (entry === 'inbox' && inboxLocked(sources)) || preferences[SIDEBAR_PREFERENCE[entry]]
}

export function useSidebarShows(entry: SidebarEntry): boolean {
  const preferences = usePreferences()
  const sources = useCore((s) => s.sources)
  return sidebarShows(entry, preferences, sources)
}

export function hideFromSidebar(entry: SidebarEntry): void {
  setPreference(SIDEBAR_PREFERENCE[entry], false)
}
