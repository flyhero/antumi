import { describe, expect, it } from 'vitest'
import { ShortcutAction, ShortcutSettings, SHORTCUTS, matchesShortcut, reservedActionShortcut, shortcutBindings, shortcutConflict, withShortcut, type ShortcutBinding, type ShortcutInput, type ShortcutPlatform } from './keyboard-shortcuts'

const empty: ShortcutSettings = { version: 1 }
const input = (binding: ShortcutBinding, patch: Partial<ShortcutInput> = {}): ShortcutInput => ({ key: binding.key, ctrlKey: binding.ctrl, metaKey: binding.meta, altKey: binding.alt, shiftKey: binding.shift, ...patch })
const platforms: ShortcutPlatform[] = ['darwin', 'win32', 'linux']

describe.each(platforms)('application shortcuts on %s', (platform) => {
  it('makes every default usable without overlapping actions', () => {
    for (const action of ShortcutAction.options) {
      for (const binding of shortcutBindings(empty, platform, action)) {
        expect(shortcutConflict(empty, platform, action, [binding]), action).toBeNull()
        expect(matchesShortcut(action, input(binding), empty, platform), action).toBe(true)
        expect(matchesShortcut(action, input(binding, { isComposing: true }), empty, platform)).toBe(false)
        expect(matchesShortcut(action, input(binding, { keyCode: 229 }), empty, platform)).toBe(false)
        expect(matchesShortcut(action, input(binding, { defaultPrevented: true }), empty, platform)).toBe(false)
      }
    }
  })

  it('lets independent inputs share keys but protects overlapping scopes', () => {
    const enter = SHORTCUTS['send-message'].defaults(platform)[0]!
    expect(shortcutConflict(empty, platform, 'quick-add-submit', [enter])).toBeNull()
    expect(shortcutConflict(empty, platform, 'steer-message', [enter])).toBe('send-message')
    const search = SHORTCUTS['find-content'].defaults(platform)[0]!
    expect(shortcutConflict(empty, platform, 'send-message', [search])).toBe('find-content')
    expect(shortcutConflict(empty, platform, 'save-file', [search])).toBe('find-content')
    expect(shortcutConflict(empty, platform, 'new-task', [enter])).toBe('quick-add-submit')
  })

  it('replaces all aliases, disables them, then restores the complete defaults', () => {
    const custom: ShortcutBinding = { key: 'F6', ctrl: false, meta: false, alt: false, shift: false }
    let settings = withShortcut(empty, platform, 'find-next', custom)
    expect(matchesShortcut('find-next', input(custom), settings, platform)).toBe(true)
    for (const old of SHORTCUTS['find-next'].defaults(platform)) expect(matchesShortcut('find-next', input(old), settings, platform)).toBe(false)
    settings = withShortcut(settings, platform, 'find-next', null)
    expect(shortcutBindings(settings, platform, 'find-next')).toEqual([])
    settings = withShortcut(settings, platform, 'find-next', undefined)
    expect(shortcutBindings(settings, platform, 'find-next')).toEqual(SHORTCUTS['find-next'].defaults(platform))
  })

  it('keeps the three previously saved panel bindings and other platforms', () => {
    const binding: ShortcutBinding = { key: 'b', ctrl: true, meta: false, alt: false, shift: true }
    const legacy = ShortcutSettings.parse({ version: 1, [platform]: { 'toggle-files': binding, 'toggle-terminal': null } })
    expect(shortcutBindings(legacy, platform, 'toggle-files')).toEqual([binding])
    expect(shortcutBindings(legacy, platform, 'toggle-terminal')).toEqual([])
    expect(shortcutBindings(legacy, platform, 'new-task')).toEqual(SHORTCUTS['new-task'].defaults(platform))
    const other = platform === 'darwin' ? 'linux' : 'darwin'
    const changed = withShortcut(legacy, other, 'send-message', null)
    expect(changed[platform]).toEqual(legacy[platform])
  })

  it('reserves text input and native editing keys while accepting contextual defaults', () => {
    const primary = platform === 'darwin' ? { meta: true, ctrl: false } : { meta: false, ctrl: true }
    for (const key of ['c', 'v', 'x', 'z', 'a', 'w', 'q']) expect(reservedActionShortcut('new-task', { key, ...primary, alt: false, shift: false }, platform)).toBe(true)
    const plain: ShortcutBinding = { key: 'j', ctrl: false, meta: false, alt: false, shift: false }
    expect(reservedActionShortcut('new-task', plain, platform)).toBe(true)
    expect(reservedActionShortcut('quick-add-task', plain, platform)).toBe(false)
    expect(reservedActionShortcut('new-task', { ...plain, key: 'F6' }, platform)).toBe(false)
  })
})

it('uses exact modifiers for send, steer and send to a new conversation', () => {
  const settings: ShortcutSettings = { version: 1 }
  const steer = SHORTCUTS['steer-message'].defaults('darwin')[0]!
  expect(matchesShortcut('send-message', input(steer), settings, 'darwin')).toBe(false)
  expect(matchesShortcut('steer-message', input(steer, { shiftKey: true }), settings, 'darwin')).toBe(false)
  expect(matchesShortcut('send-new-conversation', input(steer, { shiftKey: true }), settings, 'darwin')).toBe(true)
})
