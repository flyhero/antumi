import { z } from 'zod'
import { create } from 'zustand'
import type { SourceDescriptor, SourceInbox } from '@antumi/protocol'
import type { Notice } from './attention'
import { useCore } from './core-store'
import { t } from './i18n'
import { activeInboxes, inboxTab, type ActiveInbox } from './source-inboxes'

// The issues each inbox listed while the user had it in front of them, so the sidebar can tell
// what arrived since from what they already looked over. Kept locally: without storage, every
// launch starts with nothing new.
const SEEN_KEY = 'antumi.inbox-seen'
const Seen = z.record(z.string(), z.array(z.string()))
export type InboxSeen = Readonly<Record<string, readonly string[]>>

function loadSeen(): InboxSeen {
  try {
    return Seen.safeParse(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')).data ?? {}
  } catch {
    return {}
  }
}

export const useInboxSeen = create<{ seen: InboxSeen }>()(() => ({ seen: loadSeen() }))

// Whether an active inbox lists an issue the user has not had in front of them.
export function hasFreshIssues(inboxes: Readonly<Record<string, SourceInbox>>, seen: InboxSeen): boolean {
  return Object.entries(inboxes).some(([key, inbox]) => {
    const known = seen[key]
    return inbox.active && known !== undefined && inbox.items.some((issue) => !known.includes(issue.key))
  })
}

// The inboxes on screen while the inbox page is: the chosen tab, or the one inbox there is.
export function shownInboxes(active: readonly ActiveInbox[], wanted: string | null): string[] {
  if (active.length <= 1) return active.map((entry) => entry.key)
  const chosen = inboxTab(active, wanted)
  return chosen ? [chosen] : []
}

// The record once `shown` inboxes were in front of the user. An inbox not recorded before starts
// as seen, so an upgrade does not light up with what it already held. Kept to what each inbox
// still lists, dismissed included, so it does not grow.
export function seenAfter(seen: InboxSeen, active: readonly ActiveInbox[], shown: ReadonlySet<string>): InboxSeen {
  let next: Record<string, readonly string[]> | null = null
  for (const { key, inbox } of active) {
    const listed = [...inbox.items, ...inbox.dismissed].map((issue) => issue.key)
    const known = seen[key]
    const record = known === undefined || shown.has(key) ? listed : listed.filter((issueKey) => known.includes(issueKey))
    if (known && known.length === record.length && known.every((issueKey, i) => issueKey === record[i])) continue
    next = { ...(next ?? seen), [key]: record }
  }
  return next ?? seen
}

// A notification per inbox whose sync brought issues it did not list before. Nothing for one just
// loaded or just turned on: what it holds then is no news.
export function inboxNoticesBetween(prev: Readonly<Record<string, SourceInbox>>, active: readonly ActiveInbox[]): Notice[] {
  return active.flatMap(({ key, inbox, name }) => {
    const before = prev[key]
    if (!before?.active || before === inbox) return []
    const known = new Set([...before.items, ...before.dismissed].map((issue) => issue.key))
    const fresh = inbox.items.filter((issue) => !known.has(issue.key))
    const first = fresh[0]
    if (!first) return []
    const issue = `${first.key} ${first.title}`
    const body = fresh.length === 1 ? issue : t('inboxNews.newIssues', { count: fresh.length, issue })
    return [{ title: t('SourceInboxView.inbox', { name }), body, target: { kind: 'inbox', key } }]
  })
}

// Marks what is on screen as seen while the window is in front, as the inbox fills and when the
// user comes back to it.
export function startInboxSeen(): void {
  const update = (s: { sources: readonly SourceDescriptor[] | null; inboxes: Readonly<Record<string, SourceInbox>>; inboxOpen: boolean; inboxTab: string | null }) => {
    const active = activeInboxes(s.sources, s.inboxes)
    const looking = s.inboxOpen && !document.hidden && document.hasFocus()
    const seen = useInboxSeen.getState().seen
    const next = seenAfter(seen, active, new Set(looking ? shownInboxes(active, s.inboxTab) : []))
    if (next === seen) return
    useInboxSeen.setState({ seen: next })
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
    } catch {
      // Storage full or blocked: this window still remembers.
    }
  }
  update(useCore.getState())
  useCore.subscribe((next, prev) => {
    if (next.inboxes !== prev.inboxes || next.sources !== prev.sources || next.inboxOpen !== prev.inboxOpen || next.inboxTab !== prev.inboxTab) update(next)
  })
  window.addEventListener('focus', () => update(useCore.getState()))
}
