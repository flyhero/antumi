import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useCore } from '../core-store'
import { createTerminalSurface } from './terminal-surface'
import { attachTerminalSession } from './terminal-session'
import { terminalSelectionPlace, trackTerminalSelection, type TerminalSelectionPoint } from './terminal-selection'

const ignore = () => {}

// selectionAction: shown by a passage just selected with the mouse, until it is cleared, the view
// scrolls or the user types; dismiss puts it away.
export function SessionTerminal({ sessionId, selectionAction }: { sessionId: string; selectionAction?: (dismiss: () => void) => ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const rpc = useCore((s) => s.rpc)
  const [picked, setPicked] = useState<TerminalSelectionPoint | null>(null)
  const dismiss = useCallback(() => setPicked(null), [])

  useEffect(() => {
    const element = container.current
    const bounds = frame.current
    if (!element || !bounds || !rpc) {
      return
    }
    const surface = createTerminalSurface(element, rpc, sessionId)
    const { term, sendSize } = surface
    // Opened by the user, so keystrokes should reach the shell at once.
    term.focus()

    const stopSession = attachTerminalSession({ rpc, term, sessionId, sendSize })
    const input = term.onData((data) => {
      setPicked(null)
      void rpc.call('sessions.write', { sessionId, data }).catch(ignore)
    })
    const stopPicking = trackTerminalSelection({ element, frame: bounds, getSelection: () => term.getSelection(), onPicked: setPicked })
    const selection = term.onSelectionChange(() => { if (!term.hasSelection()) setPicked(null) })
    const scroll = term.onScroll(() => setPicked(null))
    return () => {
      stopSession()
      input.dispose()
      stopPicking()
      selection.dispose()
      scroll.dispose()
      surface.dispose()
    }
  }, [rpc, sessionId])

  // FitAddon sizes rows from the host's box and ignores its padding, so the
  // padding and background live on a frame around a padding-free host.
  return (
    <div className="terminal-frame" ref={frame}>
      <div className="terminal" ref={container} />
      {picked && selectionAction && <SelectionAction at={picked} frame={frame.current}>{selectionAction(dismiss)}</SelectionAction>}
    </div>
  )
}

function SelectionAction({ at, frame, children }: { at: TerminalSelectionPoint; frame: HTMLDivElement | null; children: ReactNode }) {
  const action = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState(at)
  useLayoutEffect(() => {
    const element = action.current
    if (!element || !frame) return
    const position = () => setPlace(terminalSelectionPlace({
      at,
      frame: { width: frame.clientWidth, height: frame.clientHeight },
      action: { width: element.offsetWidth, height: element.offsetHeight }
    }))
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [at, frame])
  return <div ref={action} className="terminal-selection-action" style={{ left: place.x, top: place.y }}>{children}</div>
}
