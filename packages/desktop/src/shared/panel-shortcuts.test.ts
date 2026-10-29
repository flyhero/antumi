import { describe, expect, it } from 'vitest'
import { PanelShortcutSettings, defaultPanelShortcut, formatShortcut, panelShortcut, shortcutBinding, withPanelShortcut, type ShortcutBinding, type ShortcutInput } from './panel-shortcuts'

const settings = PanelShortcutSettings.parse({})
const custom: ShortcutBinding = { key: 'b', ctrl: true, meta: false, alt: false, shift: true }
const input = (binding: ShortcutBinding, extra: Partial<ShortcutInput> = {}): ShortcutInput => ({ key: binding.key === 'Backquote' ? '`' : binding.key, code: binding.key === 'Backquote' ? 'Backquote' : undefined, ctrlKey: binding.ctrl, metaKey: binding.meta, altKey: binding.alt, shiftKey: binding.shift, ...extra })

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
