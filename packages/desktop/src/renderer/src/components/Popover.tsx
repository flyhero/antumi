import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useOccludesBrowser } from '../browser-occlusion'

// A non-modal panel by its trigger. It must sit inside the same parent as the trigger (a
// `.menu-anchor`), so a click on the trigger is not an outside click. It is laid out first where
// the stylesheet puts it beside the trigger, then lifted into the top layer at that spot, so no
// pane that clips or panel that overlaps can hide it; there it follows the trigger as the page
// scrolls, and keeps within the window as it grows. `align="end"` puts its right edge on the
// trigger's, as for a trigger at the end of a row; `side="above"` opens it over the trigger, so it
// covers the row it acts on rather than the ones below.
export function Popover({ label, onClose, align = 'start', side = 'below', children }: { label: string; onClose: () => void; align?: 'start' | 'end'; side?: 'below' | 'above'; children: ReactNode }) {
  useOccludesBrowser()
  const panel = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = panel.current
    const trigger = element?.parentElement
    if (!element || !trigger) return
    const { clientWidth, clientHeight } = document.documentElement
    // Flip when the trigger sits too close to the right edge, or to the edge it opens towards.
    let box = element.getBoundingClientRect()
    if (box.right > clientWidth - 8) element.classList.add('menu-end')
    box = element.getBoundingClientRect()
    if (side === 'below' && box.bottom > clientHeight - 8 && box.top > box.height + 8) element.classList.add('menu-up')
    if (side === 'above' && box.top < 8 && box.bottom + box.height + 8 < clientHeight) element.classList.remove('menu-up')
    box = element.getBoundingClientRect()
    const anchor = trigger.getBoundingClientRect()
    // Where it sits against the trigger, kept as the trigger moves: over or under it, and how far.
    const above = box.bottom <= anchor.top + 1
    const gap = above ? anchor.top - box.bottom : box.top - anchor.bottom
    const dx = box.left - anchor.left
    const fromRight = anchor.right - box.right
    const place = () => {
      const { clientWidth: width, clientHeight: height } = document.documentElement
      const at = trigger.getBoundingClientRect()
      const size = element.getBoundingClientRect()
      const under = at.bottom + gap
      const over = at.top - gap - size.height
      const fitsUnder = under + size.height <= height - 8
      const top = above ? (over >= 8 || !fitsUnder ? over : under) : (fitsUnder || over < 8 ? under : over)
      const left = element.classList.contains('menu-end') ? at.right - fromRight - size.width : at.left + dx
      // Inline, over the stylesheet's offsets for where it opens (bottom, right), which would
      // stretch it against the window.
      Object.assign(element.style, {
        right: 'auto',
        bottom: 'auto',
        left: `${Math.min(Math.max(8, left), width - 8 - size.width)}px`,
        top: `${Math.min(Math.max(8, top), height - 8 - size.height)}px`
      })
    }
    // Only now a popover: one not yet shown is not laid out, so could not be measured above.
    element.classList.add('menu-lifted')
    element.popover = 'manual'
    element.showPopover()
    place()
    element.querySelector<HTMLElement>('input, textarea, button')?.focus()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    // Scrolling within the panel itself moves nothing it sits by.
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node && element.contains(event.target))) place()
    }
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
      // Back where the stylesheet puts it, should the effect run again on the same element.
      element.hidePopover()
      element.popover = null
      element.classList.remove('menu-lifted')
      element.classList.toggle('menu-up', side === 'above')
      if (align !== 'end') element.classList.remove('menu-end')
      for (const side of ['left', 'top', 'right', 'bottom'] as const) element.style[side] = ''
    }
  }, [])

  useEffect(() => {
    const anchor = panel.current?.parentElement
    // A picker inside the panel opens its menu in the top layer, outside the panel: a pick there is
    // still the panel's.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.context-menu')) return
      if (event.target instanceof Node && !anchor?.contains(event.target)) {
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Inside a modal dialog, Escape should close only this panel.
        event.preventDefault()
        anchor?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div className={['menu', align === 'end' ? 'menu-end' : '', side === 'above' ? 'menu-up' : ''].filter(Boolean).join(' ')} ref={panel} role="dialog" aria-label={label}>
      {children}
    </div>
  )
}
