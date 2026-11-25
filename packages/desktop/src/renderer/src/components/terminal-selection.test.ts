import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { terminalSelectionPlace, trackTerminalSelection } from './terminal-selection'

class SelectionMouseEvent extends Event {
  readonly button: number
  readonly clientX: number
  readonly clientY: number
  constructor(type: string, { button = 0, clientX = 0, clientY = 0 }: { button?: number; clientX?: number; clientY?: number } = {}) {
    super(type)
    this.button = button
    this.clientX = clientX
    this.clientY = clientY
  }
}

function selectionGesture(text = '所选终端输出') {
  const element = Object.assign(new EventTarget(), { ownerDocument: new EventTarget() })
  const onPicked = vi.fn()
  const stop = trackTerminalSelection({
    element,
    frame: { getBoundingClientRect: () => ({ left: 100, top: 80 }) },
    getSelection: () => text,
    onPicked
  })
  return { element, onPicked, stop }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('MouseEvent', SelectionMouseEvent)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('terminal selection gesture', () => {
  it('keeps the action when a selection ends outside the terminal at the top left', () => {
    const { element, onPicked, stop } = selectionGesture()
    element.dispatchEvent(new SelectionMouseEvent('mousedown'))
    element.ownerDocument.dispatchEvent(new SelectionMouseEvent('mouseup', { clientX: 85, clientY: 65 }))
    vi.runAllTimers()
    expect(onPicked).toHaveBeenLastCalledWith({ x: -15, y: -15 })
    stop()
  })

  it('does not open the action for a mouseup from another view', () => {
    const { element, onPicked, stop } = selectionGesture()
    element.ownerDocument.dispatchEvent(new SelectionMouseEvent('mouseup'))
    vi.runAllTimers()
    expect(onPicked).not.toHaveBeenCalled()
    stop()
  })

  it('leaves right-clicks to the terminal context menu', () => {
    const { element, onPicked, stop } = selectionGesture()
    element.dispatchEvent(new SelectionMouseEvent('mousedown', { button: 2 }))
    element.ownerDocument.dispatchEvent(new SelectionMouseEvent('mouseup', { button: 2 }))
    vi.runAllTimers()
    expect(onPicked).not.toHaveBeenCalled()
    stop()
  })

  it.each(['', '  \r\n  '])('does not offer a quote for an empty selection: %j', (text) => {
    const { element, onPicked, stop } = selectionGesture(text)
    element.dispatchEvent(new SelectionMouseEvent('mousedown'))
    element.ownerDocument.dispatchEvent(new SelectionMouseEvent('mouseup'))
    vi.runAllTimers()
    expect(onPicked.mock.calls).toEqual([[null]])
    stop()
  })

  it('cancels the pending selection and listeners when the view closes', () => {
    const { element, onPicked, stop } = selectionGesture()
    element.dispatchEvent(new SelectionMouseEvent('mousedown'))
    element.ownerDocument.dispatchEvent(new SelectionMouseEvent('mouseup'))
    stop()
    vi.runAllTimers()
    element.dispatchEvent(new SelectionMouseEvent('mousedown'))
    element.ownerDocument.dispatchEvent(new SelectionMouseEvent('mouseup'))
    vi.runAllTimers()
    expect(onPicked.mock.calls).toEqual([[null]])
  })
})

describe('terminal selection action position', () => {
  const frame = { width: 800, height: 220 }
  const action = { width: 134, height: 26 }

  it('keeps an action visible when the release point is above and left of the frame', () => {
    expect(terminalSelectionPlace({ at: { x: -15, y: -15 }, frame, action })).toEqual({ x: 4, y: 4 })
  })

  it('places the action below an ordinary release point', () => {
    expect(terminalSelectionPlace({ at: { x: 100, y: 80 }, frame, action })).toEqual({ x: 88, y: 90 })
  })

  it('flips above a release near the bottom and fits the actual width at the right', () => {
    expect(terminalSelectionPlace({ at: { x: 760, y: 200 }, frame, action })).toEqual({ x: 662, y: 164 })
  })

  it('keeps an action inside when the mouse is released beyond the bottom right', () => {
    expect(terminalSelectionPlace({ at: { x: 900, y: 240 }, frame, action })).toEqual({ x: 662, y: 190 })
  })

  it('uses the measured width of the confirmation instead of a fixed button width', () => {
    expect(terminalSelectionPlace({ at: { x: 780, y: 80 }, frame, action: { width: 250, height: 26 } })).toEqual({ x: 546, y: 90 })
  })
})
