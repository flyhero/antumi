import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronRightIcon } from './icons'
import { useOccludesBrowser } from '../browser-occlusion'

export type MenuPoint = { x: number; y: number }

// Opened from the keyboard (context-menu key, Shift+F10) there is no pointer, so it opens under the row.
export function menuPoint(event: MouseEvent<HTMLElement>, anchor = event.currentTarget): MenuPoint {
  if (event.clientX === 0 && event.clientY === 0) {
    const box = anchor.getBoundingClientRect()
    return { x: box.left + 12, y: box.bottom }
  }
  return { x: event.clientX, y: event.clientY }
}

const EDGE = 8
const ITEMS = ':scope > [role^="menuitem"]:not(:disabled)'

export function menuPortalHost(
  origin: { closest(selector: string): Element | null } | null | undefined,
  fallback: Element
): Element {
  return origin?.closest('dialog, [popover]') ?? fallback
}

export function placeContextMenu(
  at: MenuPoint,
  align: 'start' | 'end',
  above: boolean,
  { width, height }: { width: number; height: number },
  viewport: { width: number; height: number }
): MenuPoint {
  const x = align === 'end'
    ? Math.min(Math.max(EDGE, at.x - width), viewport.width - width - EDGE)
    : at.x + width > viewport.width - EDGE ? Math.max(EDGE, at.x - width) : at.x
  const y = above || at.y + height > viewport.height - EDGE ? Math.max(EDGE, at.y - height - (above ? 4 : 0)) : at.y
  return { x, y }
}

export function placeSubmenu(
  row: { left: number; right: number; top: number },
  { width, height }: { width: number; height: number },
  viewport: { width: number; height: number }
): MenuPoint {
  const right = row.right + 4
  return {
    x: right + width > viewport.width - EDGE ? Math.max(EDGE, row.left - width - 4) : right,
    y: Math.max(EDGE, Math.min(row.top - 5, viewport.height - height - EDGE))
  }
}

export function liftMenuPopover(element: {
  popover: string | null
  isConnected: boolean
  matches(selector: string): boolean
  showPopover?(): void
  hidePopover?(): void
}): () => void {
  if (typeof element.showPopover !== 'function') return () => {}
  element.popover = 'manual'
  if (element.isConnected && !element.matches(':popover-open')) element.showPopover()
  return () => {
    if (typeof element.hidePopover === 'function' && element.isConnected && element.matches(':popover-open')) {
      element.hidePopover()
    }
    element.popover = null
  }
}

// The items of whichever menu (or open submenu) holds the focus.
function focusedMenuItems(root: HTMLElement): HTMLElement[] {
  const menu = document.activeElement?.closest<HTMLElement>('[role="menu"]')
  return [...(menu && root.contains(menu) ? menu : root).querySelectorAll<HTMLElement>(ITEMS)]
}

// A menu at a point: the pointer for a right-click, or under a button with `align: 'end'`; with
// `above`, over the point, as for a control at the bottom whose menu should not cover what is below.
// Keeps the host's DOM ancestry so the menu can be used inside a modal dialog. Lifting it to the
// top layer keeps its viewport coordinates valid even when the host has backdrop-filter.
export function ContextMenu({ at, align = 'start', above = false, anchor, trigger, scrollBoundary, width, label, onClose, children }: {
  at: MenuPoint
  align?: 'start' | 'end'
  above?: boolean
  // A right-click origin inside a dialog or popover. Clicking it still dismisses the menu.
  anchor?: HTMLElement | null
  // The button that toggles the menu; pressing it isn't an outside click.
  trigger?: HTMLElement | null
  scrollBoundary?: HTMLElement | null
  // Form pickers keep their menu as wide as the field, including in narrow dialogs.
  width?: number
  label: string
  onClose: () => void
  children: ReactNode
}) {
  useOccludesBrowser()
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState(at)
  const [opener] = useState(() => document.activeElement)
  const host = menuPortalHost(anchor ?? trigger, document.body)

  useLayoutEffect(() => {
    const element = panel.current
    if (element) return liftMenuPopover(element)
  }, [host])

  // Flips up or left like a native menu when it would run off the window. Placed again whenever
  // the panel changes size: a menu that fills in after it opens (the project picker fetches its
  // recent list) would otherwise keep the top it got while short and grow down past the window.
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const position = () => {
      const size = element.getBoundingClientRect()
      const { clientWidth, clientHeight } = document.documentElement
      setPlace(placeContextMenu(at, align, above, size, { width: clientWidth, height: clientHeight }))
    }
    position()
    const first = element.querySelector<HTMLElement>('[data-menu-search]') ?? element.querySelector<HTMLElement>(ITEMS)
    first?.focus()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    return () => observer.disconnect()
  }, [at, align, above, host])

  useEffect(() => {
    const outside = (event: Event) =>
      !(event.target instanceof Node && (panel.current?.contains(event.target) || trigger?.contains(event.target)))
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event)) onClose()
    }
    const onScroll = (event: Event) => {
      if (outside(event) && (!scrollBoundary || (event.target instanceof Node && event.target.contains(scrollBoundary)))) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (opener instanceof HTMLElement) opener.focus()
        onClose()
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && panel.current) {
        event.preventDefault()
        const items = focusedMenuItems(panel.current)
        const current = items.findIndex((item) => item === document.activeElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        const next = current < 0 ? (step > 0 ? 0 : items.length - 1) : (current + step + items.length) % items.length
        items[next]?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose, opener, trigger, scrollBoundary])

  return createPortal(
    <div
      className="menu context-menu"
      ref={panel}
      role="menu"
      aria-label={label}
      style={{ left: place.x, top: place.y, width, minWidth: width, maxWidth: width }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
    >
      {children}
    </div>,
    host
  )
}

export function MenuItem({ label, icon, hint, danger, disabled, onSelect }: {
  label: string
  // Before the label; a menu gives every item one or none, so the labels line up.
  icon?: ReactNode
  hint?: string | null
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? 'menu-item menu-item-danger' : 'menu-item'}
      disabled={disabled}
      onClick={onSelect}
    >
      {icon && <span className="menu-item-icon">{icon}</span>}
      <span className="menu-item-title">{label}</span>
      {hint && <span className="menu-item-path">{hint}</span>}
    </button>
  )
}

// A row that opens a menu of its own beside it: on hover, or on click, Enter or → (which also
// move the focus in). ← inside it goes back. The parent decides which one is open.
// Its panel stays inside the parent menu for events, and lifts above it to escape blur and clipping.
export function MenuSubmenu({ label, icon, value, disabled, open, onOpen, onClose, children }: {
  label: string
  icon?: ReactNode
  value: string
  disabled?: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  children: ReactNode
}) {
  const row = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<MenuPoint | null>(null)
  const focusOnOpen = useRef(false)

  const focusInside = () =>
    (panel.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? panel.current?.querySelector<HTMLElement>(ITEMS))?.focus()

  useLayoutEffect(() => {
    const element = panel.current
    if (!open || !element) {
      setPlace(null)
      return
    }
    const lower = liftMenuPopover(element)
    const position = () => {
      const box = row.current?.getBoundingClientRect()
      if (!box) return
      const size = element.getBoundingClientRect()
      const { clientWidth, clientHeight } = document.documentElement
      setPlace(placeSubmenu(box, size, { width: clientWidth, height: clientHeight }))
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    return () => {
      observer.disconnect()
      lower()
    }
  }, [open])

  // The pointer moving on to another item of the menu it opened from closes it, as native menus do;
  // a sibling submenu's row opens its own instead, the parent keeping one open at a time.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const menu = row.current?.closest('[role="menu"]')
    if (!open || !menu) return
    const onPointerOver = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || panel.current?.contains(target) || row.current?.contains(target)) return
      const item = target.closest('[role^="menuitem"]')
      if (item && item.closest('[role="menu"]') === menu && item.getAttribute('aria-haspopup') !== 'menu') close.current()
    }
    menu.addEventListener('pointerover', onPointerOver)
    return () => menu.removeEventListener('pointerover', onPointerOver)
  }, [open])
  // A menu closed with its submenu open must not open with it the next time.
  useEffect(() => () => close.current(), [])

  // Only once placed: until then the panel is hidden, and hidden elements can't take focus.
  useLayoutEffect(() => {
    if (place && focusOnOpen.current) {
      focusOnOpen.current = false
      focusInside()
    }
  }, [place])

  const reveal = () => {
    if (open) {
      focusInside()
    } else {
      focusOnOpen.current = true
      onOpen()
    }
  }

  return (
    <>
      <button
        ref={row}
        type="button"
        role="menuitem"
        className="menu-item"
        aria-haspopup="menu"
        disabled={disabled}
        aria-expanded={open}
        onMouseEnter={onOpen}
        onClick={reveal}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            reveal()
          }
        }}
      >
        {icon && <span className="menu-item-icon">{icon}</span>}
        <span className="menu-item-title">{label}</span>
        <span className="menu-item-path">{value}</span>
        <ChevronRightIcon />
      </button>
      {open && (
        <div
          ref={panel}
          className="menu submenu"
          role="menu"
          aria-label={label}
          style={place ? { left: place.x, top: place.y } : { visibility: 'hidden' }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              onClose()
              row.current?.focus()
            }
          }}
        >
          {children}
        </div>
      )}
    </>
  )
}

// A setting turned on and off from the menu; the menu stays open, so the change shows behind it.
export function MenuCheckboxItem({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} className="menu-item" onClick={onSelect}>
      <span className="menu-item-title">{label}</span>
      {checked && (
        <span className="menu-check">
          <CheckIcon />
        </span>
      )}
    </button>
  )
}

export function MenuRadioItem({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className="menu-item" onClick={onSelect}>
      <span className="menu-item-title">{label}</span>
      {checked && (
        <span className="menu-check">
          <CheckIcon />
        </span>
      )}
    </button>
  )
}
