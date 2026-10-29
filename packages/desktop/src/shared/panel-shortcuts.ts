import { z } from 'zod'

export const PanelShortcutAction = z.enum(['toggle-files', 'toggle-terminal', 'toggle-browser'])
export type PanelShortcutAction = z.infer<typeof PanelShortcutAction>
export type ShortcutPlatform = 'darwin' | 'win32' | 'linux'

const NAMED_KEYS = ['Backquote', 'Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'] as const
export const ShortcutBinding = z.object({
  key: z.union([z.enum(NAMED_KEYS), z.string().length(1).regex(/^[^\s\x00-\x1f\x7f]$/u)]),
  ctrl: z.boolean(), meta: z.boolean(), alt: z.boolean(), shift: z.boolean()
})
export type ShortcutBinding = z.infer<typeof ShortcutBinding>

const Overrides = z.object({
  'toggle-files': ShortcutBinding.nullable().optional().catch(undefined),
  'toggle-terminal': ShortcutBinding.nullable().optional().catch(undefined),
  'toggle-browser': ShortcutBinding.nullable().optional().catch(undefined)
})
export const PanelShortcutSettings = z.object({
  version: z.literal(1).default(1),
  darwin: Overrides.optional(), win32: Overrides.optional(), linux: Overrides.optional()
})
export type PanelShortcutSettings = z.infer<typeof PanelShortcutSettings>

export const PANEL_SHORTCUT_LABELS = {
  'toggle-files': 'KeyboardShortcuts.files',
  'toggle-terminal': 'KeyboardShortcuts.terminal',
  'toggle-browser': 'KeyboardShortcuts.browser'
} as const

export type ShortcutInput = {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  keyCode?: number
  getModifierState?(key: string): boolean
}

export function shortcutBinding(input: ShortcutInput): ShortcutBinding | null {
  if (input.isComposing || input.keyCode === 229 || input.getModifierState?.('AltGraph')) return null
  // The panel defaults refer to this physical key even where Shift does not print ~.
  const key = input.code === 'Backquote' || input.key === '`' || input.key === '~'
    ? 'Backquote' : input.key.length === 1 ? input.key.toLowerCase() : input.key
  const parsed = ShortcutBinding.safeParse({ key, ctrl: input.ctrlKey, meta: input.metaKey, alt: input.altKey, shift: input.shiftKey })
  return parsed.success ? parsed.data : null
}

export function sameShortcut(left: ShortcutBinding | null, right: ShortcutBinding | null): boolean {
  return left === null || right === null ? left === right
    : left.key === right.key && left.ctrl === right.ctrl && left.meta === right.meta && left.alt === right.alt && left.shift === right.shift
}

export function defaultPanelShortcut(action: PanelShortcutAction, platform: ShortcutPlatform): ShortcutBinding {
  // Two keys each, none with Shift, which Chinese input methods take to switch language: E for
  // the explorer, L for the address bar as in a browser, Ctrl+` for the terminal as in editors.
  if (action === 'toggle-terminal') return { key: 'Backquote', ctrl: true, meta: false, alt: false, shift: false }
  return { key: action === 'toggle-files' ? 'e' : 'l', ctrl: platform !== 'darwin', meta: platform === 'darwin', alt: false, shift: false }
}

export function panelShortcut(settings: PanelShortcutSettings, platform: ShortcutPlatform, action: PanelShortcutAction): ShortcutBinding | null {
  const override = settings[platform]?.[action]
  return override === undefined ? defaultPanelShortcut(action, platform) : override
}

export function withPanelShortcut(settings: PanelShortcutSettings, platform: ShortcutPlatform, action: PanelShortcutAction, binding: ShortcutBinding | null | undefined): PanelShortcutSettings {
  const overrides = { ...settings[platform] }
  if (binding === undefined) delete overrides[action]
  else overrides[action] = binding
  return { ...settings, [platform]: overrides }
}

const KEY_LABELS: Readonly<Record<string, string>> = { Backquote: '`', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'PageUp', PageDown: 'PageDown' }
export function formatShortcut(binding: ShortcutBinding | null, platform: ShortcutPlatform): string {
  if (!binding) return ''
  const key = KEY_LABELS[binding.key] ?? (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key)
  return platform === 'darwin'
    ? `${binding.ctrl ? '⌃' : ''}${binding.alt ? '⌥' : ''}${binding.shift ? '⇧' : ''}${binding.meta ? '⌘' : ''}${key}`
    : [binding.ctrl && 'Ctrl', binding.alt && 'Alt', binding.shift && 'Shift', key].filter(Boolean).join('+')
}
