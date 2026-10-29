import { z } from 'zod'
import { defaultPanelShortcut, formatShortcut, sameShortcut, shortcutBinding, ShortcutBinding, type ShortcutInput, type ShortcutPlatform } from './panel-shortcuts'

export { formatShortcut, shortcutBinding }
export type { ShortcutBinding, ShortcutInput, ShortcutPlatform }

const primary = (key: string, shift = false) => (platform: ShortcutPlatform): ShortcutBinding[] => [
  { key, shift, ctrl: platform !== 'darwin', meta: platform === 'darwin', alt: false }
]
const plain = (key: string, shift = false) => (): ShortcutBinding[] => [{ key, shift, ctrl: false, meta: false, alt: false }]
const findKeys = (previous: boolean) => (platform: ShortcutPlatform): ShortcutBinding[] => [
  ...primary('g', previous)(platform), ...plain('F3', previous)()
]

// Scopes describe where a key can act, not which component happened to register first.
export const SHORTCUTS = {
  'new-task': { label: 'KeyboardShortcuts.newTask', group: 'tasks', scope: 'app', defaults: primary('n'), browser: true },
  'quick-add-task': { label: 'KeyboardShortcuts.quickAddTask', group: 'tasks', scope: 'board', defaults: plain('n') },
  'quick-add-submit': { label: 'KeyboardShortcuts.quickAddSubmit', group: 'tasks', scope: 'quick-add', defaults: plain('Enter') },
  'quick-add-expand': { label: 'KeyboardShortcuts.quickAddExpand', group: 'tasks', scope: 'quick-add', defaults: plain('Enter', true) },
  'toggle-sidebar': { label: 'KeyboardShortcuts.sidebar', group: 'app', scope: 'app', defaults: primary('b') },
  'open-settings': { label: 'KeyboardShortcuts.openSettings', group: 'app', scope: 'app', defaults: primary(','), browser: true },
  'toggle-split': { label: 'KeyboardShortcuts.toggleSplit', group: 'conversations', scope: 'app', defaults: primary('\\') },
  'focus-left': { label: 'KeyboardShortcuts.focusLeft', group: 'conversations', scope: 'app', defaults: primary('1') },
  'focus-right': { label: 'KeyboardShortcuts.focusRight', group: 'conversations', scope: 'app', defaults: primary('2') },
  'send-message': { label: 'KeyboardShortcuts.sendMessage', group: 'chat', scope: 'composer', defaults: plain('Enter') },
  'steer-message': { label: 'KeyboardShortcuts.steerMessage', group: 'chat', scope: 'composer', defaults: primary('Enter') },
  'send-new-conversation': { label: 'KeyboardShortcuts.sendNewConversation', group: 'chat', scope: 'composer', defaults: primary('Enter', true) },
  'accept-suggestion': { label: 'KeyboardShortcuts.acceptSuggestion', group: 'chat', scope: 'composer', defaults: () => [...plain('Tab')(), ...plain('ArrowRight')()] },
  'interrupt-turn': { label: 'KeyboardShortcuts.interruptTurn', group: 'chat', scope: 'composer', defaults: plain('Escape') },
  'find-content': { label: 'KeyboardShortcuts.findContent', group: 'chat', scope: 'content', defaults: primary('f') },
  'find-next': { label: 'KeyboardShortcuts.findNext', group: 'chat', scope: 'content', defaults: findKeys(false) },
  'find-previous': { label: 'KeyboardShortcuts.findPrevious', group: 'chat', scope: 'content', defaults: findKeys(true) },
  'quick-open-file': { label: 'KeyboardShortcuts.quickOpenFile', group: 'files', scope: 'app', defaults: primary('p') },
  'save-file': { label: 'KeyboardShortcuts.saveFile', group: 'files', scope: 'file', defaults: primary('s') },
  'toggle-files': { label: 'KeyboardShortcuts.files', group: 'panels', scope: 'app', defaults: (platform: ShortcutPlatform) => [defaultPanelShortcut('toggle-files', platform)], browser: true },
  'toggle-terminal': { label: 'KeyboardShortcuts.terminal', group: 'panels', scope: 'app', defaults: (platform: ShortcutPlatform) => [defaultPanelShortcut('toggle-terminal', platform)], browser: true },
  'toggle-browser': { label: 'KeyboardShortcuts.browser', group: 'panels', scope: 'app', defaults: (platform: ShortcutPlatform) => [defaultPanelShortcut('toggle-browser', platform)], browser: true },
  'submit-form': { label: 'KeyboardShortcuts.submitForm', group: 'forms', scope: 'form', defaults: primary('Enter') }
} as const

export type ShortcutAction = keyof typeof SHORTCUTS
export const ShortcutAction = z.enum(Object.keys(SHORTCUTS).filter((key): key is ShortcutAction => key in SHORTCUTS))
export type ShortcutScope = (typeof SHORTCUTS)[ShortcutAction]['scope']
export const SHORTCUT_GROUPS = ['app', 'tasks', 'conversations', 'chat', 'files', 'panels', 'forms'] as const
export const SHORTCUT_GROUP_LABELS = {
  app: 'KeyboardShortcuts.groupApp', tasks: 'KeyboardShortcuts.groupTasks', conversations: 'KeyboardShortcuts.groupConversations',
  chat: 'KeyboardShortcuts.groupChat', files: 'KeyboardShortcuts.groupFiles', panels: 'KeyboardShortcuts.groupPanels', forms: 'KeyboardShortcuts.groupForms'
} as const
export const SHORTCUT_SCOPE_LABELS = {
  app: 'KeyboardShortcuts.scopeApp', board: 'KeyboardShortcuts.scopeBoard', 'quick-add': 'KeyboardShortcuts.scopeQuickAdd',
  composer: 'KeyboardShortcuts.scopeComposer', content: 'KeyboardShortcuts.scopeContent', file: 'KeyboardShortcuts.scopeFile', form: 'KeyboardShortcuts.scopeForm'
} as const

// Keep the saved panel action IDs and preference field so existing customizations survive.
const Overrides = z.partialRecord(ShortcutAction, ShortcutBinding.nullable().optional().catch(undefined))
export const ShortcutSettings = z.object({
  version: z.literal(1).default(1), darwin: Overrides.optional(), win32: Overrides.optional(), linux: Overrides.optional()
})
export type ShortcutSettings = z.infer<typeof ShortcutSettings>

export function shortcutBindings(settings: ShortcutSettings, platform: ShortcutPlatform, action: ShortcutAction): ShortcutBinding[] {
  const value = settings[platform]?.[action]
  return value === undefined ? SHORTCUTS[action].defaults(platform) : value === null ? [] : [value]
}

export function withShortcut(settings: ShortcutSettings, platform: ShortcutPlatform, action: ShortcutAction, binding: ShortcutBinding | null | undefined): ShortcutSettings {
  const overrides = { ...settings[platform] }
  if (binding === undefined) delete overrides[action]
  else overrides[action] = binding
  return { ...settings, [platform]: overrides }
}

export function shortcutScopesOverlap(left: ShortcutScope, right: ShortcutScope): boolean {
  if (left === right || left === 'app' || right === 'app') return true
  return (left === 'content' && (right === 'composer' || right === 'file')) || (right === 'content' && (left === 'composer' || left === 'file'))
}

export function shortcutConflict(settings: ShortcutSettings, platform: ShortcutPlatform, action: ShortcutAction, bindings: readonly ShortcutBinding[]): ShortcutAction | null {
  return ShortcutAction.options.find((other) => other !== action && shortcutScopesOverlap(SHORTCUTS[action].scope, SHORTCUTS[other].scope)
    && bindings.some((binding) => shortcutBindings(settings, platform, other).some((key) => sameShortcut(binding, key)))) ?? null
}

export function reservedActionShortcut(action: ShortcutAction, binding: ShortcutBinding, platform: ShortcutPlatform): boolean {
  if (SHORTCUTS[action].defaults(platform).some((key) => sameShortcut(key, binding))) return false
  const { key, ctrl, meta, alt, shift } = binding
  if ((ctrl && meta) || (platform !== 'darwin' && (meta || (ctrl && alt)))) return true
  if (key === 'Escape' || key === 'Tab' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete'].includes(key)) return true
  if (!ctrl && !meta) return alt || !(SHORTCUTS[action].scope === 'board' && /^[a-z]$/.test(key)) && !/^F([1-3]|[6-9]|10)$/.test(key)
  if (ctrl && !meta && key !== 'Backquote' && /^[a-z]$/.test(key) && (!shift || ['c', 'v', 'i'].includes(key))) return true
  if (meta && (key === 'Backquote' || (shift && ['3', '4', '5', '6', 'q'].includes(key)))) return true
  if (['=', '+', '-', '0', 'F4', 'F5', 'F11', 'F12'].includes(key)) return true
  if (!alt && !shift && ['a', 'c', 'd', 'h', 'k', 'l', 'm', 'o', 'q', 'r', 'u', 'v', 'w', 'x', 'y', 'z'].includes(key)) return true
  if (!alt && shift && ['a', 'c', 'd', 'i', 'k', 'l', 'r', 'v', 'w', 'z', '/'].includes(key)) return true
  return alt && ['c', 'd', 'h', 'i', 'j', 'm', 'w'].includes(key)
}

export function matchesShortcut(action: ShortcutAction, input: ShortcutInput, settings: ShortcutSettings, platform: ShortcutPlatform): boolean {
  if (input.defaultPrevented) return false
  const key = shortcutBinding(input)
  return key !== null && !reservedActionShortcut(action, key, platform)
    && shortcutBindings(settings, platform, action).some((binding) => sameShortcut(binding, key))
    && shortcutConflict(settings, platform, action, [key]) === null
}

export function shortcutWorksInBrowser(action: ShortcutAction): boolean {
  const definition = SHORTCUTS[action]
  return 'browser' in definition && definition.browser
}

export function shortcutLabel(settings: ShortcutSettings, platform: ShortcutPlatform, action: ShortcutAction): string {
  return shortcutBindings(settings, platform, action).map((binding) => formatShortcut(binding, platform).replace(/Escape$/, 'Esc')).join(' / ')
}
