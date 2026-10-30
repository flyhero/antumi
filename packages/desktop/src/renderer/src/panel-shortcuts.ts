import { useEffect } from 'react'
import type { PanelShortcutAction } from '../../shared/panel-shortcuts'
import { ShortcutAction, SHORTCUTS } from '../../shared/keyboard-shortcuts'
import { closePanelWindow, focusPanelWindow, forwardPanelShortcut, onBrowserShortcut, sendPanelCommand, syncPanelShortcuts } from './desktop-bridge'
import type { PanelKind } from '../../shared/panel-window'
import { focusSplitPane, openSearch, setNewTaskOpen, toggleSplit, toggleBrowserPanel, toggleFilesPanel, toggleTerminalPanel, setSettingsOpen, useCore } from './core-store'
import { toggleSidebar } from './components/WindowBrand'
import { usePreferences } from './preferences'
import { isShortcut, recordingShortcut, useShortcutLabel } from './keyboard-shortcuts'

export { SHORTCUT_PLATFORM } from './keyboard-shortcuts'

export function usePanelShortcut(action: PanelShortcutAction): string {
  return useShortcutLabel(action)
}

export function recordingPanelShortcut(): boolean {
  return recordingShortcut()
}

// As ⌘L does in a browser: the panel opens on its address bar, and closes only from there.
function addressBarFocused(): boolean {
  return document.activeElement instanceof HTMLInputElement && document.activeElement.classList.contains('browser-url')
}

function browserKey(addressFocused?: boolean): void {
  if (useCore.getState().panelWindows.includes('browser')) {
    if (addressFocused) closePanelWindow('browser')
    else {
      focusPanelWindow('browser')
      sendPanelCommand('browser', { type: 'focus-address' })
    }
    return
  }
  const address = document.querySelector<HTMLInputElement>('.browser-url')
  const open = useCore.getState().browserPanelOpen
  const focused = addressFocused ?? addressBarFocused()
  if (open && (!address || address.disabled || focused)) { toggleBrowserPanel(); return }
  if (!open) toggleBrowserPanel()
  // The bar shows once the panel has its tabs, which may take a moment: look for it a few times,
  // by timer rather than by frame, which a window in the background never draws.
  const focus = (tries: number) => {
    const bar = document.querySelector<HTMLInputElement>('.browser-url')
    if (bar) bar.focus()
    else if (tries > 0) setTimeout(() => focus(tries - 1), 50)
  }
  setTimeout(() => focus(20), 0)
}

function runAppShortcut(action: ShortcutAction, addressFocused?: boolean): boolean {
  const state = useCore.getState()
  if (action === 'toggle-sidebar') { toggleSidebar(); return true }
  if (action === 'open-settings') { setSettingsOpen(!state.settingsOpen); return true }
  if (state.settingsOpen) return false
  if (action === 'toggle-files') toggleFilesPanel()
  else if (action === 'toggle-terminal') void toggleTerminalPanel()
  else if (action === 'toggle-browser') browserKey(addressFocused)
  else if (action === 'new-task') setNewTaskOpen(true)
  else if (action === 'search') openSearch()
  else if (action === 'focus-left' || action === 'focus-right') return focusSplitPane(action === 'focus-left' ? 0 : 1)
  else if (action === 'toggle-split' && state.section === 'conversations') toggleSplit()
  else return false
  return true
}

export function runForwardedShortcut(action: ShortcutAction, addressFocused: boolean): void {
  runAppShortcut(action, addressFocused)
}

export function usePanelWindowShortcuts(kind: PanelKind): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (recordingShortcut()) return
      if ([...document.querySelectorAll('dialog[open], [role="dialog"], [role="menu"]')].some((element) => element.getClientRects().length > 0)) return
      const action = ShortcutAction.options.find((candidate) => SHORTCUTS[candidate].scope === 'app' && isShortcut(candidate, event))
      if (!action || event.repeat) return
      const terminal = event.target instanceof Element && event.target.closest('.xterm') !== null
      if (terminal && event.ctrlKey && !event.metaKey && !event.shiftKey && /^[a-z]$/i.test(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      if (kind === 'files' && action === 'search') {
        openSearch('files')
        return
      }
      forwardPanelShortcut({ action, addressFocused: addressBarFocused() })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [kind])
}

export function usePanelShortcuts(): void {
  const settings = usePreferences((state) => state.panelShortcuts)
  useEffect(() => { syncPanelShortcuts(settings) }, [settings])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (recordingShortcut()) return
      if ([...document.querySelectorAll('dialog[open], [role="dialog"], [role="menu"]')].some((element) => element.getClientRects().length > 0)) return
      const action = ShortcutAction.options.find((candidate) => SHORTCUTS[candidate].scope === 'app' && isShortcut(candidate, event))
      if (!action) return
      const terminal = event.target instanceof Element && event.target.closest('.xterm') !== null
      if (terminal && event.ctrlKey && !event.metaKey && !event.shiftKey && /^[a-z]$/i.test(event.key)) return
      if (!event.repeat && !runAppShortcut(action)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  useEffect(() => onBrowserShortcut((kind) => {
    if (!recordingShortcut()) runAppShortcut(kind === 'settings' ? 'open-settings' : kind)
  }), [])
}
