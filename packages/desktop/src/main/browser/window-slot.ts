import type { Rectangle } from 'electron'
import type { BrowserViewport } from '@antumi/protocol'
import { fitViewport } from './viewport'
import type { ShortcutSettings } from '../../shared/keyboard-shortcuts'

// The slice of a window the slot needs. A browser tab is a native view, so it can sit in only one
// window: the main window, or the browser's own window.
interface HostView {
  setBounds(bounds: Rectangle): void
}
export interface SlotWindow {
  isDestroyed(): boolean
  contentView: {
    children: readonly HostView[]
    addChildView(view: HostView): void
    removeChildView(view: HostView): void
  }
  webContents: {
    send(channel: string, payload: unknown): void
    focus(): void
  }
  once(event: 'closed', listener: () => void): void
}

// Where the one tab on show sits. Whichever window asked for it last gets the view; a window that
// lets go of the tab does not take it out of a different window. Bounds can arrive before the
// show, so each window keeps its own rectangle. A dialog covers the view only in the window that
// has it. The tabs themselves live on regardless.
export class WindowSlot {
  private main: SlotWindow | null = null
  private host: SlotWindow | null = null
  private shown: { tabId: string; view: HostView; viewport: BrowserViewport | null } | null = null
  private readonly boundsOf = new WeakMap<SlotWindow, Rectangle>()
  private readonly occludedBy = new WeakMap<SlotWindow, boolean>()
  private readonly hosts = new WeakSet<SlotWindow>()
  private occluded = false
  private panelShortcuts: ShortcutSettings = { version: 1 }

  setPanelShortcuts(settings: ShortcutSettings): void {
    this.panelShortcuts = settings
  }

  getPanelShortcuts(): ShortcutSettings {
    return this.panelShortcuts
  }

  // The app window, for shortcuts that belong to the chat rather than the page.
  attachWindow(window: SlotWindow): void {
    if (this.main === window) return
    this.main = window
    window.once('closed', () => {
      if (this.main === window) this.main = null
    })
  }

  // The renderer's choice of tab, or none. Null from a window that is not showing it leaves the
  // view where it is.
  show(owner: SlotWindow, tabId: string | null, view: HostView | null, viewport: BrowserViewport | null): void {
    if (!tabId || !view) {
      if (this.host === owner) this.clearHost()
      return
    }
    const moved = this.host !== owner
    if (this.shown && (moved || this.shown.view !== view)) this.takeDown()
    if (moved) {
      this.host = owner
    }
    if (!this.hosts.has(owner)) {
      this.hosts.add(owner)
      owner.once('closed', () => {
        if (this.host === owner) this.clearHost()
      })
    }
    this.shown = { tabId, view, viewport }
    this.occluded = this.occludedBy.get(owner) === true
    if (!this.occluded) this.place()
  }

  setBounds(owner: SlotWindow, bounds: Rectangle): void {
    this.boundsOf.set(owner, bounds)
    if (this.host === owner && !this.occluded) this.place()
  }

  setViewport(tabId: string, viewport: BrowserViewport | null): void {
    if (this.shown?.tabId === tabId) {
      this.shown.viewport = viewport
      this.place()
    }
  }

  setOccluded(owner: SlotWindow, occluded: boolean): void {
    this.occludedBy.set(owner, occluded)
    if (this.host !== owner || this.occluded === occluded) return
    this.occluded = occluded
    if (occluded) this.takeDown()
    else this.place()
  }

  // The tab went: nothing to show until a window picks another.
  tabClosed(tabId: string): void {
    if (this.shown?.tabId === tabId) {
      this.takeDown()
      this.shown = null
    }
  }

  shownTabId(): string | null {
    return this.shown?.tabId ?? null
  }

  // The page's focus stays with the window that shows it. Shortcuts that drive the app go to the
  // main window, which still has the chat.
  sendToRenderer(channel: string, payload: unknown): void {
    const target = channel === 'antumi:browser-focused' ? (this.host ?? this.main) : (this.main ?? this.host)
    target?.webContents.send(channel, payload)
  }

  focusApp(): void {
    ;(this.host ?? this.main)?.webContents.focus()
  }

  private place(): void {
    const { host, shown } = this
    if (!host || host.isDestroyed() || !shown || this.occluded) return
    const bounds = this.boundsOf.get(host)
    if (!bounds) return
    if (!host.contentView.children.includes(shown.view)) host.contentView.addChildView(shown.view)
    shown.view.setBounds(fitViewport(bounds, shown.viewport))
  }

  private takeDown(): void {
    const { host, shown } = this
    if (!host || host.isDestroyed() || !shown) return
    if (host.contentView.children.includes(shown.view)) host.contentView.removeChildView(shown.view)
  }

  private clearHost(): void {
    this.takeDown()
    this.host = null
    this.shown = null
    this.occluded = false
  }
}
