import type { WebContents } from 'electron'
import { matchPanelShortcut, type ShortcutPlatform } from '../../shared/panel-shortcuts'
import type { WindowSlot } from './window-slot'

// A focused native view cannot bubble keys to the app's renderer.
export function bindBrowserShortcuts(contents: WebContents, tabId: string, slot: WindowSlot, platform: ShortcutPlatform): void {
  contents.setVisualZoomLevelLimits(1, 1).catch(() => {})
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isComposing) return
    const action = matchPanelShortcut({ key: input.key, code: input.code, ctrlKey: input.control, metaKey: input.meta, altKey: input.alt, shiftKey: input.shift }, slot.getPanelShortcuts(), platform)
    if (action) {
      event.preventDefault()
      if (!input.isAutoRepeat) slot.sendToRenderer('antumi:browser-shortcut', { kind: action })
      return
    }
    // Preserve the existing browser escape and zoom behavior.
    if (input.key === 'Escape') {
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
    if (input.key === ',' && !input.shift) {
      event.preventDefault()
      if (!input.isAutoRepeat) slot.sendToRenderer('antumi:browser-shortcut', { kind: 'settings' })
    } else if (['=', '+', '-', '0'].includes(input.key)) {
      event.preventDefault()
    }
  })
}
