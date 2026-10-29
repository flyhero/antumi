import { describe, expect, it } from 'vitest'
import { PanelShortcutAction, PanelShortcutSettings, defaultPanelShortcut, formatShortcut, matchPanelShortcut, panelShortcut, panelShortcutConflict, reservedShortcut, shortcutBinding, withPanelShortcut, type ShortcutBinding, type ShortcutInput, type ShortcutPlatform } from './panel-shortcuts'

const platforms: ShortcutPlatform[] = ['darwin', 'win32', 'linux']
const settings = PanelShortcutSettings.parse({})
const custom: ShortcutBinding = { key: 'b', ctrl: true, meta: false, alt: false, shift: true }
const input = (binding: ShortcutBinding, extra: Partial<ShortcutInput> = {}): ShortcutInput => ({ key: binding.key === 'Backquote' ? '`' : binding.key, code: binding.key === 'Backquote' ? 'Backquote' : undefined, ctrlKey: binding.ctrl, metaKey: binding.meta, altKey: binding.alt, shiftKey: binding.shift, ...extra })

describe.each(platforms)('panel shortcuts on %s', (platform) => {
  it('retains the three defaults and matches exact modifiers', () => {
    for (const action of PanelShortcutAction.options) {
      const binding = defaultPanelShortcut(action, platform)
      expect(reservedShortcut(binding, platform)).toBe(false)
      expect(matchPanelShortcut(input(binding), settings, platform)).toBe(action)
      expect(matchPanelShortcut(input(binding, { altKey: !binding.alt }), settings, platform)).not.toBe(action)
    }
  })

  it('uses the physical backquote consistently despite shifted keyboard layouts', () => {
    const binding = defaultPanelShortcut('toggle-browser', platform)
    for (const key of ['~', '`', '²']) {
      expect(matchPanelShortcut(input(binding, { key, code: 'Backquote' }), settings, platform)).toBe('toggle-browser')
    }
  })

  it('releases old bindings on rebind and disable, and restores defaults', () => {
    const previous = input(defaultPanelShortcut('toggle-terminal', platform))
    const rebound = withPanelShortcut(settings, platform, 'toggle-terminal', custom)
    expect(matchPanelShortcut(previous, rebound, platform)).toBeNull()
    expect(matchPanelShortcut(input(custom), rebound, platform)).toBe('toggle-terminal')
    const disabled = withPanelShortcut(rebound, platform, 'toggle-terminal', null)
    expect(panelShortcut(disabled, platform, 'toggle-terminal')).toBeNull()
    expect(matchPanelShortcut(input(custom), disabled, platform)).toBeNull()
    const restored = withPanelShortcut(disabled, platform, 'toggle-terminal', undefined)
    expect(matchPanelShortcut(previous, restored, platform)).toBe('toggle-terminal')
  })

  it('rejects conflicting overrides instead of dispatching an arbitrary action', () => {
    const fileBinding = defaultPanelShortcut('toggle-files', platform)
    expect(panelShortcutConflict(settings, platform, 'toggle-browser', fileBinding)).toBe('toggle-files')
    const conflict = withPanelShortcut(settings, platform, 'toggle-browser', fileBinding)
    expect(matchPanelShortcut(input(fileBinding), conflict, platform)).toBeNull()
    expect(panelShortcutConflict(withPanelShortcut(settings, platform, 'toggle-files', null), platform, 'toggle-browser', fileBinding)).toBeNull()
  })

  it('ignores IME, AltGraph and events already consumed by a control', () => {
    const key = input(defaultPanelShortcut('toggle-files', platform))
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }, { getModifierState: (name: string) => name === 'AltGraph' }]) {
      expect(matchPanelShortcut({ ...key, ...extra }, settings, platform)).toBeNull()
    }
  })

  it('preserves text, system, existing app and terminal controls even in edited storage', () => {
    const primary = { ctrl: platform !== 'darwin', meta: platform === 'darwin', alt: false, shift: false }
    const bindings = [
      ...['c', 'n', 'p', ',', 's', 'w', '1', '\\', 'Enter', 'ArrowLeft', 'Backspace'].map((key) => ({ ...primary, key })),
      ...['ArrowRight', 'Home', 'k', '+'].map((key) => ({ ...primary, shift: true, key })),
      ...['c', 'j', 'k', 'n', 'p', 'w'].map((key) => ({ key, ctrl: true, meta: false, alt: false, shift: false })),
      { key: 'b', ctrl: false, meta: false, alt: false, shift: false }
    ]
    for (const binding of bindings) {
      expect(reservedShortcut(binding, platform)).toBe(true)
      expect(matchPanelShortcut(input(binding), withPanelShortcut(settings, platform, 'toggle-browser', binding), platform)).toBeNull()
    }
  })
})

describe('panel shortcut preferences', () => {
  it('round trips disabled and custom bindings without changing another platform', () => {
    const changed = withPanelShortcut(withPanelShortcut(settings, 'darwin', 'toggle-browser', custom), 'win32', 'toggle-files', null)
    const saved = PanelShortcutSettings.parse(JSON.parse(JSON.stringify(changed)))
    expect(panelShortcut(saved, 'darwin', 'toggle-browser')).toEqual(custom)
    expect(panelShortcut(saved, 'win32', 'toggle-files')).toBeNull()
    expect(panelShortcut(saved, 'linux', 'toggle-files')).toEqual(defaultPanelShortcut('toggle-files', 'linux'))
  })

  it('drops a corrupt override without resetting other valid customizations', () => {
    const saved = PanelShortcutSettings.parse({ version: 1, darwin: { 'toggle-files': 'broken', 'toggle-terminal': null, 'toggle-browser': custom } })
    expect(panelShortcut(saved, 'darwin', 'toggle-files')).toEqual(defaultPanelShortcut('toggle-files', 'darwin'))
    expect(panelShortcut(saved, 'darwin', 'toggle-terminal')).toBeNull()
    expect(panelShortcut(saved, 'darwin', 'toggle-browser')).toEqual(custom)
  })

  it('uses logical letters and rejects incomplete or composing keys', () => {
    expect(shortcutBinding(input(custom, { key: 'B', code: 'KeyB' }))).toEqual(custom)
    for (const key of ['Control', 'Meta', 'Shift', 'Dead', 'Process', 'Unidentified', '\n', ' ']) expect(shortcutBinding(input(custom, { key }))).toBeNull()
  })

  it('shows the actual platform modifiers and no hint when unbound', () => {
    expect(formatShortcut(defaultPanelShortcut('toggle-files', 'darwin'), 'darwin')).toBe('⇧⌘E')
    expect(formatShortcut(defaultPanelShortcut('toggle-browser', 'win32'), 'win32')).toBe('Ctrl+Shift+`')
    expect(formatShortcut(null, 'linux')).toBe('')
  })
})
