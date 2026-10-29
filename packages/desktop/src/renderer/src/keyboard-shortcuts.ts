import { matchesShortcut, shortcutLabel, type ShortcutAction, type ShortcutInput, type ShortcutPlatform, type ShortcutSettings } from '../../shared/keyboard-shortcuts'
import { usePreferences } from './preferences'

export const SHORTCUT_PLATFORM: ShortcutPlatform = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
  ? 'darwin' : typeof navigator !== 'undefined' && navigator.platform.startsWith('Win') ? 'win32' : 'linux'

export function useShortcutLabel(action: ShortcutAction): string {
  const settings = usePreferences((state) => state.panelShortcuts)
  return shortcutLabel(settings, SHORTCUT_PLATFORM, action)
}

export function currentShortcutLabel(action: ShortcutAction, settings: ShortcutSettings = usePreferences.getState().panelShortcuts): string {
  return shortcutLabel(settings, SHORTCUT_PLATFORM, action)
}

export function isShortcut(action: ShortcutAction, event: ShortcutInput): boolean {
  return !recordingShortcut() && matchesShortcut(action, event, usePreferences.getState().panelShortcuts, SHORTCUT_PLATFORM)
}

export function recordingShortcut(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[data-shortcut-recording]') !== null
}

export function useShortcutHint(action: ShortcutAction, label: string): string {
  const keys = useShortcutLabel(action)
  return [label, keys].filter(Boolean).join(' · ')
}
