import { WebContentsView, type Input } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPanelShortcut, withPanelShortcut, type ShortcutPlatform } from '../../shared/panel-shortcuts'
import { withShortcut, SHORTCUTS } from '../../shared/keyboard-shortcuts'
import { bindBrowserShortcuts } from './browser-shortcuts'
import { WindowSlot } from './window-slot'

const captured = vi.hoisted(() => {
  const handlers: Array<(event: { preventDefault(): void }, input: Input) => void> = []
  return { handlers }
})
vi.mock('electron', () => ({ WebContentsView: class {
  webContents = {
    setVisualZoomLevelLimits: vi.fn(async () => {}),
    on: (_event: string, handler: typeof captured.handlers[number]) => captured.handlers.push(handler),
    sendInputEvent: vi.fn()
  }
} }))

function press(patch: Partial<Input>) {
  const event = { preventDefault: vi.fn() }
  const input: Input = { type: 'keyDown', key: '`', code: 'Backquote', control: true, meta: false, shift: false, alt: false, isComposing: false, isAutoRepeat: false, location: 0, modifiers: [], ...patch }
  captured.handlers.forEach((handler) => handler(event, input))
  return event
}

beforeEach(() => { captured.handlers.length = 0 })
const platforms: ShortcutPlatform[] = ['darwin', 'win32', 'linux']
describe.each(platforms)('browser shortcuts on %s', (platform) => {
  it('forwards all panel defaults, including physical Ctrl on macOS, and hands the address bar its focus', () => {
    const slot = new WindowSlot()
    const send = vi.spyOn(slot, 'sendToRenderer')
    bindBrowserShortcuts(new WebContentsView().webContents, 'tab', slot, platform)
    const focus = vi.spyOn(slot, 'focusApp')
    const browser = defaultPanelShortcut('toggle-browser', platform)
    expect(press({ key: 'l', code: 'KeyL', control: browser.ctrl, meta: browser.meta, shift: false }).preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenLastCalledWith('antumi:browser-shortcut', { kind: 'toggle-browser' })
    // The address bar it goes to is the app's, so the page gives the focus back.
    expect(focus).toHaveBeenCalledTimes(1)
    press({})
    expect(send).toHaveBeenLastCalledWith('antumi:browser-shortcut', { kind: 'toggle-terminal' })
    const files = defaultPanelShortcut('toggle-files', platform)
    press({ key: 'E', code: 'KeyE', control: files.ctrl, meta: files.meta, shift: files.shift })
    expect(send).toHaveBeenLastCalledWith('antumi:browser-shortcut', { kind: 'toggle-files' })
  })

  it('reads live settings for an existing tab and releases old or disabled keys', () => {
    const slot = new WindowSlot()
    const send = vi.spyOn(slot, 'sendToRenderer')
    bindBrowserShortcuts(new WebContentsView().webContents, 'tab', slot, platform)
    slot.setPanelShortcuts(withPanelShortcut(slot.getPanelShortcuts(), platform, 'toggle-browser', { key: 'b', ctrl: true, meta: false, shift: true, alt: false }))
    expect(press({ shift: true }).preventDefault).not.toHaveBeenCalled()
    expect(press({ key: 'B', code: 'KeyB', shift: true }).preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    slot.setPanelShortcuts(withPanelShortcut(slot.getPanelShortcuts(), platform, 'toggle-browser', null))
    expect(press({ key: 'B', code: 'KeyB', shift: true }).preventDefault).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('uses live settings for settings and new-task actions in a web page', () => {
    const slot = new WindowSlot()
    const send = vi.spyOn(slot, 'sendToRenderer')
    bindBrowserShortcuts(new WebContentsView().webContents, 'tab', slot, platform)
    const original = SHORTCUTS['open-settings'].defaults(platform)[0]!
    const key = { key: original.key, code: 'Comma', control: original.ctrl, meta: original.meta, shift: false }
    press(key)
    expect(send).toHaveBeenLastCalledWith('antumi:browser-shortcut', { kind: 'open-settings' })
    slot.setPanelShortcuts(withShortcut(slot.getPanelShortcuts(), platform, 'open-settings', { key: 'F6', ctrl: false, meta: false, alt: false, shift: false }))
    send.mockClear()
    expect(press(key).preventDefault).not.toHaveBeenCalled()
    press({ key: 'F6', code: 'F6', control: false, meta: false, shift: false })
    expect(send).toHaveBeenLastCalledWith('antumi:browser-shortcut', { kind: 'open-settings' })
    const task = SHORTCUTS['new-task'].defaults(platform)[0]!
    press({ key: task.key, code: 'KeyN', control: task.ctrl, meta: task.meta, shift: false })
    expect(send).toHaveBeenLastCalledWith('antumi:browser-shortcut', { kind: 'new-task' })
  })

  it('consumes a held panel key without dispatching again, and leaves IME alone', () => {
    const slot = new WindowSlot()
    const send = vi.spyOn(slot, 'sendToRenderer')
    bindBrowserShortcuts(new WebContentsView().webContents, 'tab', slot, platform)
    expect(press({ isAutoRepeat: true }).preventDefault).toHaveBeenCalled()
    expect(press({ isComposing: true }).preventDefault).not.toHaveBeenCalled()
    expect(press({ type: 'keyUp' }).preventDefault).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
