import type { WebContents } from 'electron'
import { ShortcutAction, matchesShortcut, shortcutWorksInBrowser, type ShortcutPlatform } from '../../shared/keyboard-shortcuts'
import type { WindowSlot } from './window-slot'

// A focused native view cannot bubble keys to the app's renderer.
export function bindBrowserShortcuts(contents: WebContents, tabId: string, slot: WindowSlot, platform: ShortcutPlatform, captureActive: () => boolean = () => false): void {
  contents.setVisualZoomLevelLimits(1, 1).catch(() => {})
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isComposing) return
    const key = { key: input.key, code: input.code, ctrlKey: input.control, metaKey: input.meta, altKey: input.alt, shiftKey: input.shift }
    const action = ShortcutAction.options.find((candidate) => shortcutWorksInBrowser(candidate) && matchesShortcut(candidate, key, slot.getPanelShortcuts(), platform))
    if (action) {
      event.preventDefault()
      // The browser's key goes to its address bar, in the app's window rather than the page.
      if (action === 'toggle-browser') slot.focusApp()
      if (!input.isAutoRepeat) slot.sendToRenderer('antumi:browser-shortcut', { kind: action })
      return
    }
    // Preserve the existing browser escape and zoom behavior.
    if (input.key === 'Escape') {
      if (captureActive()) return
      event.preventDefault()
      if (input.shift) {
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      } else {
        slot.focusApp()
        slot.sendToRenderer('antumi:browser-focused', { tabId, focused: false })
      }
      return
    }
    const command = platform === 'darwin' ? input.meta : input.control
    if (!command || input.alt) return
    if (['=', '+', '-', '0'].includes(input.key)) {
      event.preventDefault()
    }
  })
}
