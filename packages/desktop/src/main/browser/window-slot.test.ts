import { describe, expect, it } from 'vitest'
import type { Rectangle } from 'electron'
import { WindowSlot, type SlotWindow } from './window-slot'

function fakeWindow(): SlotWindow & { views: { setBounds(bounds: Rectangle): void }[]; sent: [string, unknown][]; focused: () => number; close(): void } {
  const views: { setBounds(bounds: Rectangle): void }[] = []
  const sent: [string, unknown][] = []
  let focused = 0
  const onClosed: (() => void)[] = []
  const window: SlotWindow = {
    isDestroyed: () => false,
    contentView: {
      get children() { return views },
      addChildView(view) { views.push(view) },
      removeChildView(view) {
        const index = views.indexOf(view)
        if (index >= 0) views.splice(index, 1)
      }
    },
    webContents: {
      send(channel, payload) { sent.push([channel, payload]) },
      focus() { focused += 1 }
    },
    once(_event, listener) { onClosed.push(listener) }
  }
  return Object.assign(window, { views, sent, focused: () => focused, close: () => { for (const listener of onClosed.splice(0)) listener() } })
}

function page(bounds: Rectangle | null = null) {
  return { bounds, setBounds(next: Rectangle) { this.bounds = next } }
}

describe('window slot', () => {
  it('moves the page into the window that asked, and ignores the one that let go', () => {
    const slot = new WindowSlot()
    const main = fakeWindow()
    const browser = fakeWindow()
    const view = page()
    slot.attachWindow(main)
    slot.setBounds(main, { x: 1, y: 2, width: 300, height: 200 })
    slot.show(main, 'tab', view, null)
    expect(main.views).toEqual([view])
    slot.setBounds(browser, { x: 4, y: 5, width: 800, height: 600 })
    slot.show(browser, 'tab', view, null)
    expect(main.views).toEqual([])
    expect(browser.views).toEqual([view])
    expect(view.bounds).toEqual({ x: 4, y: 5, width: 800, height: 600 })
    slot.show(main, null, null, null)
    expect(browser.views).toEqual([view])
  })

  it('keeps a rectangle that arrived before the page was claimed', () => {
    const slot = new WindowSlot()
    const browser = fakeWindow()
    const view = page()
    slot.setBounds(browser, { x: 8, y: 9, width: 100, height: 80 })
    slot.show(browser, 'tab', view, null)
    expect(view.bounds).toEqual({ x: 8, y: 9, width: 100, height: 80 })
  })

  it('sends page focus to the window showing it, and app shortcuts to the main window', () => {
    const slot = new WindowSlot()
    const main = fakeWindow()
    const browser = fakeWindow()
    slot.attachWindow(main)
    slot.show(browser, 'tab', page(), null)
    slot.sendToRenderer('antumi:browser-focused', { tabId: 'tab', focused: true })
    slot.sendToRenderer('antumi:browser-shortcut', { kind: 'toggle-files' })
    expect(browser.sent).toEqual([['antumi:browser-focused', { tabId: 'tab', focused: true }]])
    expect(main.sent).toEqual([['antumi:browser-shortcut', { kind: 'toggle-files' }]])
    slot.focusApp()
    expect(browser.focused()).toBe(1)
  })

  it('drops the page when its window closes, not when the main window does', () => {
    const slot = new WindowSlot()
    const main = fakeWindow()
    const browser = fakeWindow()
    const view = page()
    slot.attachWindow(main)
    slot.setBounds(browser, { x: 0, y: 0, width: 10, height: 10 })
    slot.show(browser, 'tab', view, null)
    main.close()
    expect(browser.views).toEqual([view])
    browser.close()
    expect(browser.views).toEqual([])
    expect(slot.shownTabId()).toBeNull()
  })
})
