import { describe, expect, it, vi } from 'vitest'
import { terminalCopyHandler } from './terminal-copy'

const selected = '  Windows 与 WSL\r\n第二行  '

function chord(fields: Partial<KeyboardEvent> = {}) {
  return { type: 'keydown', key: 'c', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, preventDefault: vi.fn(), ...fields }
}

describe('terminal selection copy', () => {
  it.each([false, true])('copies the selected text with Ctrl+C, shift=%s', (shiftKey) => {
    const writeText = vi.fn()
    const handle = terminalCopyHandler({ getSelection: () => selected, writeText })
    const event = chord({ shiftKey, key: shiftKey ? 'C' : 'c' })
    expect(handle(event)).toBe(false)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(selected)
  })

  it('leaves Ctrl+C to interrupt the shell when no text is selected', () => {
    const writeText = vi.fn()
    const event = chord()
    expect(terminalCopyHandler({ getSelection: () => '', writeText })(event)).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it.each(['keyup', 'keypress'])('does not copy again on %s', (type) => {
    const writeText = vi.fn()
    expect(terminalCopyHandler({ getSelection: () => selected, writeText })(chord({ type }))).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })

  it.each([{ ctrlKey: false }, { key: 'v' }, { metaKey: true }, { altKey: true }])('leaves other key combinations alone: %j', (fields) => {
    const writeText = vi.fn()
    const event = chord(fields)
    expect(terminalCopyHandler({ getSelection: () => selected, writeText })(event)).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
