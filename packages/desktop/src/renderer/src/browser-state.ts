import { createContext, useEffect, useState } from 'react'
import { create } from 'zustand'
import { isBrowserTool, type BrowserTab, type RpcConnection } from '@antumi/protocol'
import { perform, showBrowserPanel, useCore } from './core-store'
import { focusPanelWindow, sendPanelCommand } from './desktop-bridge'
import { urlPath } from './file-links'
import { usePreferences } from './preferences'
import { browserHomepage } from './desktop-bridge'
import { t } from './i18n'

// Browser tabs as core reports them while a view watches: a conversation's under its id, the
// user's own under USER_TABS, every tab there is under ALL_TABS (the browser panel's scope); and
// which one each scope's live view shows.
type BrowserTabs = { tabs: BrowserTab[]; selectedId: string | null }
export const USER_TABS = 'user'
export const ALL_TABS = '*'
export const useBrowserTabs = create<Record<string, BrowserTabs>>()(() => ({}))
export const ChatBrowserTabs = createContext<readonly BrowserTab[] | undefined>(undefined)

// One watch per chat, shared by every historical browser card without opening the browser panel.
export function useWatchBrowserTabs(conversationId: string | null): readonly BrowserTab[] | undefined {
  const rpc = useCore((state) => state.rpc)
  const tabs = useBrowserTabs((state) => conversationId ? state[conversationId]?.tabs : undefined)
  const [known, setKnown] = useState<{ rpc: RpcConnection; id: string } | null>(null)
  useEffect(() => {
    if (!rpc || !conversationId || !rpc.features.includes('browser')) return
    let current = true
    let changed = false
    const off = rpc.on('browser.tabsChanged', ({ conversationId: id, tabs: next }) => {
      if (id !== conversationId) return
      changed = true
      receiveBrowserTabs(id, next)
      setKnown({ rpc, id })
    })
    void rpc.call('browser.watch', { conversationId }).then((next) => {
      if (!current) return
      if (!changed) receiveBrowserTabs(conversationId, next)
      setKnown({ rpc, id: conversationId })
    }).catch(() => {})
    return () => {
      current = false
      off()
      void rpc.call('browser.unwatch', { conversationId }).catch(() => {})
    }
  }, [rpc, conversationId])
  return known?.rpc === rpc && known?.id === conversationId ? tabs : undefined
}

function scopeOf(conversationId: string | null): string {
  return conversationId ?? USER_TABS
}

// Every tab, grouped by owner, with the scope of all kept in step.
function withAll(state: Record<string, BrowserTabs>): Record<string, BrowserTabs> {
  const all = Object.entries(state).filter(([key]) => key !== ALL_TABS).flatMap(([, each]) => each.tabs)
  const awaited = wantedAmong(all)
  if (awaited) wanted = null
  const next = selectAfter(state[ALL_TABS], all)
  return { ...state, [ALL_TABS]: awaited ? { ...next, selectedId: awaited.id } : next }
}

// The selection stays where it was while that tab is open; otherwise the one the agent last used,
// else the newest.
export function selectAfter(current: BrowserTabs | undefined, tabs: readonly BrowserTab[]): BrowserTabs {
  const kept = current?.selectedId && tabs.some((tab) => tab.id === current.selectedId) ? current.selectedId : null
  return { tabs: [...tabs], selectedId: kept ?? tabs.find((tab) => tab.active)?.id ?? tabs.at(-1)?.id ?? null }
}

export function receiveBrowserTabs(conversationId: string | null, tabs: readonly BrowserTab[]): void {
  const scope = scopeOf(conversationId)
  useBrowserTabs.setState((s) => withAll({ ...s, [scope]: selectAfter(s[scope], tabs) }))
}

// Everything at once, as watchAll answers: each owner's tabs replace what was known of them.
export function receiveAllBrowserTabs(tabs: readonly BrowserTab[]): void {
  useBrowserTabs.setState((s) => {
    const next: Record<string, BrowserTabs> = {}
    for (const key of Object.keys(s)) if (key !== ALL_TABS) next[key] = selectAfter(s[key], [])
    for (const tab of tabs) {
      const scope = scopeOf(tab.conversationId)
      next[scope] = selectAfter(s[scope], [...(next[scope]?.tabs ?? []), tab])
    }
    return withAll({ ...next, ...(s[ALL_TABS] ? { [ALL_TABS]: s[ALL_TABS] } : {}) })
  })
}

// scope: a conversation's id, or ALL_TABS for the browser panel.
export function selectBrowserTab(scope: string, tabId: string | null): void {
  useBrowserTabs.setState((s) => ({ [scope]: { tabs: s[scope]?.tabs ?? [], selectedId: tabId } }))
}

const NO_TABS: BrowserTabs = { tabs: [], selectedId: null }

// What the panel should show once it knows the tabs: a conversation's own, or one tab by id,
// asked for before the list has arrived (the panel just opened, or the tab is being made).
let wanted: { conversationId: string } | { tabId: string } | null = null

function wantedAmong(tabs: readonly BrowserTab[]): BrowserTab | undefined {
  if (!wanted) return undefined
  if ('tabId' in wanted) {
    const id = wanted.tabId
    return tabs.find((tab) => tab.id === id)
  }
  const conversationId = wanted.conversationId
  const own = tabs.filter((tab) => tab.conversationId === conversationId)
  return own.find((tab) => tab.active) ?? own.at(-1)
}

function focus(want: NonNullable<typeof wanted>): void {
  wanted = want
  const found = wantedAmong(useBrowserTabs.getState()[ALL_TABS]?.tabs ?? [])
  if (found) {
    wanted = null
    selectBrowserTab(ALL_TABS, found.id)
  }
}

export function focusBrowserConversation(conversationId: string): void {
  focus({ conversationId })
}

export function focusBrowserTab(tabId: string): void {
  focus({ tabId })
}

// Only tabs the user starts without an address inherit the local browser's homepage.
export async function openUserBrowserTab(): Promise<void> {
  const url = await browserHomepage()
  const opened = await perform((rpc) => rpc.call('browser.newTab', url ? { url } : {}))
  if (opened) focusBrowserTab(opened.id)
}

// A file URL for an absolute path.
export function fileUrl(path: string): string {
  return `file://${urlPath(path)}`
}

// Opens a file the agent wrote as a tab of its conversation, with the panel up on it: the page then
// runs as a page of its own, full size, and the agent's browser tools see it too. A tab already
// showing it is reloaded instead, so a page opened again is the file as it stands now. Core lets a
// connection open tabs only while it watches them, which the panel does once it is up; asking here
// as well spares waiting for it, and answers with the tabs there are.
export async function openFileInBrowser(path: string, conversationId: string): Promise<void> {
  showBrowserPanel(null)
  const url = fileUrl(path)
  const tab = await perform(async (rpc) => {
    const open = (await rpc.call('browser.watchAll', {})).find((each) => each.conversationId === conversationId && each.url === url)
    return open
      ? rpc.call('browser.userNavigate', { tabId: open.id, to: { history: 'reload' } })
      : rpc.call('browser.newTab', { conversationId, url })
  })
  if (!tab) return
  if (useCore.getState().panelWindows.includes('browser')) {
    sendPanelCommand('browser', { type: 'focus-tab', tabId: tab.id })
    focusPanelWindow('browser')
  } else {
    focusBrowserTab(tab.id)
  }
}

// Follows every tab while the browser panel is up.
export function useWatchAllBrowser(): BrowserTabs {
  const rpc = useCore((s) => s.rpc)
  useEffect(() => {
    if (!rpc) return
    let live = true
    void rpc.call('browser.watchAll', {}).then((tabs) => {
      if (live) receiveAllBrowserTabs(tabs)
    }).catch(() => {})
    return () => {
      live = false
      void rpc.call('browser.unwatchAll', {}).catch(() => {})
    }
  }, [rpc])
  return useBrowserTabs((s) => s[ALL_TABS]) ?? NO_TABS
}

// The key of the first browser call under way, or null: the panel opens on it, once.
export function firstBrowserCall(items: readonly { kind: string; name?: string; status?: string; stageId: string; id: string }[]): string | null {
  const found = items.find((item) => item.kind === 'tool' && item.name !== undefined && isBrowserTool(item.name) && item.status === 'running')
  return found ? `${found.stageId}/${found.id}` : null
}

// Whether the panel should open on its own for that call, as the user prefers.
export function shouldOpenBrowser(): boolean {
  return usePreferences.getState().openBrowserOnTab
}

// Whose a tab or a visited page is, where everyone's show: a conversation by its title, the
// user's own by nothing.
export function useConversationNames(): (conversationId: string | null) => string | null {
  const conversations = useCore((s) => s.conversations)
  const tasks = useCore((s) => s.tasks)
  return (conversationId) => {
    if (conversationId === null) return null
    const conversation = conversations[conversationId]
    if (conversation) return conversation.title
    const task = Object.values(tasks).find((each) => each.conversationId === conversationId)
    return task?.title ?? t('BrowserPanel.conversation')
  }
}
