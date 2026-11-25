export type TerminalSelectionPoint = { x: number; y: number }
type EventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
const EDGE = 4
const POINTER_INSET = 12
const POINTER_GAP = 10

// The gesture starts in xterm but may finish in the frame's padding or outside it.
export function trackTerminalSelection({ element, frame, getSelection, onPicked }: {
  element: EventSource & { ownerDocument: EventSource }
  frame: { getBoundingClientRect: () => { left: number; top: number } }
  getSelection: () => string
  onPicked: (point: TerminalSelectionPoint | null) => void
}) {
  let selecting = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const capture = { capture: true }
  const started = (event: Event) => {
    if (!(event instanceof MouseEvent) || event.button !== 0) return
    selecting = true
    clearTimeout(timer)
    onPicked(null)
  }
  const released = (event: Event) => {
    if (!(event instanceof MouseEvent) || event.button !== 0 || !selecting) return
    selecting = false
    // xterm's document listener must finish the selection before it is read.
    timer = setTimeout(() => {
      if (!getSelection().trim()) return
      const box = frame.getBoundingClientRect()
      onPicked({ x: event.clientX - box.left, y: event.clientY - box.top })
    }, 0)
  }
  element.addEventListener('mousedown', started, capture)
  element.ownerDocument.addEventListener('mouseup', released, capture)
  return () => {
    clearTimeout(timer)
    element.removeEventListener('mousedown', started, capture)
    element.ownerDocument.removeEventListener('mouseup', released, capture)
  }
}

// Use the action's measured size, including its confirmation text, to keep it in the frame.
export function terminalSelectionPlace({ at, frame, action }: {
  at: TerminalSelectionPoint
  frame: { width: number; height: number }
  action: { width: number; height: number }
}): TerminalSelectionPoint {
  const maxX = Math.max(EDGE, frame.width - action.width - EDGE)
  const maxY = Math.max(EDGE, frame.height - action.height - EDGE)
  const below = at.y + POINTER_GAP
  const top = below + action.height <= frame.height - EDGE ? below : at.y - action.height - POINTER_GAP
  return { x: Math.min(maxX, Math.max(EDGE, at.x - POINTER_INSET)), y: Math.min(maxY, Math.max(EDGE, top)) }
}
