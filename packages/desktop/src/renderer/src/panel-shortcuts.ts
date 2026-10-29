import { useEffect } from 'react'
import type { PanelShortcutAction } from '../../shared/panel-shortcuts'
import { ShortcutAction, SHORTCUTS } from '../../shared/keyboard-shortcuts'
import { onBrowserShortcut, syncPanelShortcuts } from './desktop-bridge'
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

function runAppShortcut(action: ShortcutAction): boolean {
  const state = useCore.getState()
  if (action === 'toggle-sidebar') { toggleSidebar(); return true }
  if (action === 'open-settings') { setSettingsOpen(!state.settingsOpen); return true }
  if (state.settingsOpen) return false
  if (action === 'toggle-files') toggleFilesPanel()
  else if (action === 'toggle-terminal') void toggleTerminalPanel()
  else if (action === 'toggle-browser') toggleBrowserPanel()
  else if (action === 'new-task') setNewTaskOpen(true)
  else if (action === 'search') openSearch()
  else if (action === 'focus-left' || action === 'focus-right') return focusSplitPane(action === 'focus-left' ? 0 : 1)
  else if (action === 'toggle-split' && state.section === 'conversations') toggleSplit()
  else return false
  return true
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
