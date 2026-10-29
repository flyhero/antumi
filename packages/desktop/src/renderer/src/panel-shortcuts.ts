import { useEffect } from 'react'
import { PanelShortcutAction, formatShortcut, matchPanelShortcut, panelShortcut, type ShortcutPlatform } from '../../shared/panel-shortcuts'
import { onBrowserShortcut, syncPanelShortcuts } from './desktop-bridge'
import { toggleBrowserPanel, toggleFilesPanel, toggleTerminalPanel, setSettingsOpen, useCore } from './core-store'
import { usePreferences } from './preferences'

export const SHORTCUT_PLATFORM: ShortcutPlatform = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
  ? 'darwin' : typeof navigator !== 'undefined' && navigator.platform.startsWith('Win') ? 'win32' : 'linux'

export function usePanelShortcut(action: PanelShortcutAction): string {
  const settings = usePreferences((state) => state.panelShortcuts)
  return formatShortcut(panelShortcut(settings, SHORTCUT_PLATFORM, action), SHORTCUT_PLATFORM)
}

export function recordingPanelShortcut(): boolean {
  return document.querySelector('[data-shortcut-recording]') !== null
}

function runPanelShortcut(action: PanelShortcutAction): void {
  if (action === 'toggle-files') toggleFilesPanel()
  else if (action === 'toggle-terminal') void toggleTerminalPanel()
  else toggleBrowserPanel()
}

export function usePanelShortcuts(): void {
  const settings = usePreferences((state) => state.panelShortcuts)
  useEffect(() => { syncPanelShortcuts(settings) }, [settings])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (recordingPanelShortcut() || useCore.getState().settingsOpen) return
      if ([...document.querySelectorAll('dialog[open], [role="dialog"], [role="menu"]')].some((element) => element.getClientRects().length > 0)) return
      const action = matchPanelShortcut(event, usePreferences.getState().panelShortcuts, SHORTCUT_PLATFORM)
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) runPanelShortcut(action)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  useEffect(() => onBrowserShortcut((kind) => {
    if (kind === 'settings') setSettingsOpen(!useCore.getState().settingsOpen)
    else if (!useCore.getState().settingsOpen && !recordingPanelShortcut()) runPanelShortcut(kind)
  }), [])
}
