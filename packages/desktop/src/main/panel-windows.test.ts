import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { coalesce, PanelWindows } from './panel-windows'
import { panelWindowBounds, type PanelHandoff, type PanelWindowsMessage } from '../shared/panel-window'

class Contents extends EventEmitter {
  loading = true
  isDestroyed = () => false
  isLoading = () => this.loading
  send = vi.fn<(channel: string, payload?: unknown) => void>()
  loaded(): void { this.loading = false; this.emit('did-finish-load') }
}

class Window extends EventEmitter {
  destroyed = false
  deferClose = false
  webContents = new Contents()
  isDestroyed = () => this.destroyed
  isMinimized = () => false
  restore = vi.fn()
  show = vi.fn()
  focus = vi.fn()
  close(): void {
    let prevented = false
    this.emit('close', { preventDefault: () => { prevented = true } })
    if (!prevented && !this.deferClose) this.finishClose()
  }
  finishClose(): void { this.destroyed = true; this.emit('closed') }
}

const handoff: PanelHandoff = {
  context: { section: 'conversations', selectedConversationId: 'chat', selectedId: null, selectedDiscussionId: null, settingsOpen: false, overviewOpen: false, inboxOpen: false, gitOpen: false, worktreesOpen: false, routinesOpen: false },
  files: { tabs: {}, drafts: [{ id: 'scope', path: '/a', text: 'unsaved', base: 'disk', mtimeMs: 1 }], filesFolders: null },
  terminalId: null, browserTabId: null
}

it('retains file transfers across an absent or reloading main window until acknowledged', () => {
  const window = new Window()
  const notify = vi.fn<(message: PanelWindowsMessage) => void>()
  const panels = new PanelWindows(() => window, notify)
  panels.open('files', [])
  window.webContents.loaded()
  panels.hide('files', handoff)
  expect(window.destroyed).toBe(true)
  expect(panels.kinds()).toEqual([])
  notify.mockClear()
  panels.announce()
  const delivery = notify.mock.calls[0]?.[0].deliveries[0]
  expect(delivery).toMatchObject({ action: { type: 'handoff', kind: 'files', docked: false, handoff } })
  panels.announce()
  expect(notify.mock.calls[1]?.[0].deliveries).toEqual([delivery])
  if (!delivery) throw new Error('Missing handoff')
  panels.acknowledge(delivery.id, true)
  panels.announce()
  expect(notify.mock.lastCall?.[0].deliveries).toEqual([])
})

it('waits for the initial snapshot before answering a close and ignores repeated close clicks', () => {
  const window = new Window()
  const panels = new PanelWindows(() => window, () => {})
  if (!handoff.files) throw new Error('Missing initial files')
  const initial = { type: 'files-state' as const, snapshot: handoff.files }
  panels.open('files', [initial])
  window.close()
  window.close()
  expect(window.destroyed).toBe(false)
  expect(window.webContents.send).not.toHaveBeenCalled()
  window.webContents.loaded()
  expect(window.webContents.send.mock.calls).toEqual([
    ['antumi:panel-command', initial], ['antumi:panel-request-close']
  ])
  panels.dock('files', { ...handoff, docked: 'files' })
  expect(window.destroyed).toBe(true)
})

it('only reports a successful chat delivery after the receiving renderer confirms it', async () => {
  const notify = vi.fn<(message: PanelWindowsMessage) => void>()
  const panels = new PanelWindows(() => new Window(), notify)
  const accepted = panels.deliver({ type: 'quote', conversationId: 'chat', text: 'hello' })
  const delivery = notify.mock.lastCall?.[0].deliveries[0]
  if (!delivery) throw new Error('Missing quote')
  panels.announce()
  expect(notify.mock.lastCall?.[0].deliveries).toEqual([delivery])
  panels.acknowledge(delivery.id, false)
  expect(await accepted).toBe(false)
})

it('only publishes the handoff after the native window finishes closing', () => {
  const window = new Window()
  window.deferClose = true
  const notify = vi.fn<(message: PanelWindowsMessage) => void>()
  const panels = new PanelWindows(() => window, notify)
  panels.open('files', [])
  panels.dock('files', { ...handoff, docked: 'files' })
  panels.announce()
  expect(notify.mock.lastCall?.[0]).toEqual({ open: ['files'], deliveries: [] })
  window.finishClose()
  expect(notify.mock.lastCall?.[0]).toMatchObject({ open: [], deliveries: [{ action: { type: 'handoff', docked: true, handoff } }] })
})

it('sends commands and close requests after did-finish-load while Electron still reports loading', () => {
  const window = new Window()
  const panels = new PanelWindows(() => window, () => {})
  panels.open('files', [])
  window.webContents.emit('did-finish-load')
  expect(window.webContents.isLoading()).toBe(true)
  panels.send('files', { type: 'show-files' })
  window.close()
  expect(window.webContents.send.mock.calls).toEqual([
    ['antumi:panel-command', { type: 'show-files' }], ['antumi:panel-request-close']
  ])
})

it('allows application quit without waiting on renderer close handlers', () => {
  const window = new Window()
  const panels = new PanelWindows(() => window, () => {})
  panels.open('files', [])
  panels.beginQuit()
  window.close()
  expect(window.destroyed).toBe(true)
})

it('collapses repeated context while a panel window is loading and keeps one-off commands', () => {
  const first = { type: 'context' as const, section: 'conversations' as const, selectedConversationId: 'a', selectedId: null, selectedDiscussionId: null, settingsOpen: false, overviewOpen: false, inboxOpen: false, gitOpen: false, worktreesOpen: false, routinesOpen: false }
  const second = { ...first, selectedConversationId: 'b' }
  const collapsed = coalesce([first, { type: 'focus-tab', tabId: '1' }, second, { type: 'focus-tab', tabId: '2' }])
  expect(collapsed.filter((command) => command.type === 'context')).toEqual([second])
  expect(collapsed.filter((command) => command.type === 'focus-tab')).toEqual([{ type: 'focus-tab', tabId: '1' }, { type: 'focus-tab', tabId: '2' }])
})

it('places a panel window on another display, and keeps it on screen when there is only one', () => {
  const laptop = { x: 0, y: 0, width: 1280, height: 800 }
  const external = { x: 1280, y: 0, width: 1920, height: 1080 }
  const elsewhere = panelWindowBounds(laptop, [external], 0)
  expect(elsewhere.x).toBeGreaterThanOrEqual(external.x)
  expect(elsewhere.x + elsewhere.width).toBeLessThanOrEqual(external.x + external.width)
  expect(elsewhere.y).toBeGreaterThanOrEqual(external.y)
  const alone = panelWindowBounds(laptop, [], 0)
  expect(alone.x).toBeGreaterThanOrEqual(laptop.x)
  expect(alone.x + alone.width).toBeLessThanOrEqual(laptop.x + laptop.width)
  expect(alone.y + alone.height).toBeLessThanOrEqual(laptop.y + laptop.height)
  const cascaded = panelWindowBounds(laptop, [external], 1)
  expect(cascaded.x).toBeGreaterThan(elsewhere.x)
})
