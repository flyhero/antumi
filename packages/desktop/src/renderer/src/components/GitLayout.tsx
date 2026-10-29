import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { setPreference, usePreferences } from '../preferences'

function PaneDivider({ side, width, limit, change }: { side: 'branches' | 'details'; width: number; limit: () => number; change: (width: number) => void }) {
  const [dragging, setDragging] = useState(false)
  const grab = useRef({ x: 0, width })
  const minimum = side === 'branches' ? 160 : 240
  const maximum = side === 'branches' ? 480 : 640
  const adjust = (value: number) => change(Math.max(minimum, Math.min(maximum, limit(), value)))
  useEffect(() => {
    if (!dragging) return
    document.body.classList.add('side-panel-resizing')
    return () => document.body.classList.remove('side-panel-resizing')
  }, [dragging])
  return <div role="separator" className="git-pane-divider" aria-label={t(side === 'branches' ? 'GitPage.resizeBranches' : 'GitPage.resizeDetails')} aria-orientation="vertical" tabIndex={0}
    aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={Math.round(width)} data-dragging={dragging || undefined}
    onDoubleClick={() => { change(side === 'branches' ? 240 : 320) }}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); adjust(width + (event.key === 'ArrowRight' ? 16 : -16) * (side === 'branches' ? 1 : -1)) }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); adjust(event.key === 'Home' ? minimum : maximum) }
    }}
    onPointerDown={(event) => {
      if (event.button !== 0) return
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
      const pane = side === 'branches' ? event.currentTarget.previousElementSibling : event.currentTarget.nextElementSibling
      grab.current = { x: event.clientX, width: pane?.getBoundingClientRect().width ?? width }
      setDragging(true)
    }}
    onPointerMove={(event) => { if (dragging) adjust(grab.current.width + (event.clientX - grab.current.x) * (side === 'branches' ? 1 : -1)) }}
    onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false) }}
    onPointerCancel={() => { setDragging(false) }}
    onLostPointerCapture={() => { setDragging(false) }} />
}

export function GitLayout({ detail, children }: { detail: boolean; children: ReactNode }) {
  const branches = usePreferences((s) => s.gitBranchWidth)
  const details = usePreferences((s) => s.gitDetailWidth)
  const layout = useRef<HTMLDivElement>(null)
  const panes = Children.toArray(children)
  const style = { '--git-branch-width': `${branches}px`, '--git-detail-width': `${details}px` }
  return <div ref={layout} className="git-layout" data-detail={detail || undefined} style={style}>
    {panes[0]}
    <PaneDivider side="branches" width={branches} limit={() => (layout.current?.clientWidth ?? 900) - details - 268} change={(width) => setPreference('gitBranchWidth', width)} />
    {panes[1]}
    <PaneDivider side="details" width={details} limit={() => (layout.current?.clientWidth ?? 900) - branches - 268} change={(width) => setPreference('gitDetailWidth', width)} />
    {panes[2]}
  </div>
}
