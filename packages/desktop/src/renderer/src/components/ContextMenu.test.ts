import { readFileSync } from 'node:fs'
import { generate, parse, walk } from 'css-tree'
import { describe, expect, it, vi } from 'vitest'
import { liftMenuPopover, menuPortalHost, placeContextMenu, placeSubmenu } from './ContextMenu'

function menuElement({ isConnected = true, open = false } = {}) {
  return {
    popover: null,
    isConnected,
    matches: vi.fn((selector: string) => selector === ':popover-open' && open),
    showPopover: vi.fn(() => { open = true }),
    hidePopover: vi.fn(() => { open = false })
  }
}

describe('liftMenuPopover', () => {
  it('shows a connected menu as a manual popover and hides it on cleanup', () => {
    const element = menuElement()
    const cleanup = liftMenuPopover(element)

    expect(element.popover).toBe('manual')
    expect(element.showPopover).toHaveBeenCalledOnce()

    cleanup()
    expect(element.hidePopover).toHaveBeenCalledOnce()
    expect(element.popover).toBeNull()
  })

  it('does not open an already open popover again', () => {
    const element = menuElement({ open: true })
    const cleanup = liftMenuPopover(element)

    expect(element.showPopover).not.toHaveBeenCalled()
    cleanup()
    expect(element.hidePopover).toHaveBeenCalledOnce()
    expect(element.popover).toBeNull()
  })

  it('skips showing and hiding a disconnected menu', () => {
    const element = menuElement({ isConnected: false, open: true })
    const cleanup = liftMenuPopover(element)

    expect(element.popover).toBe('manual')
    expect(element.showPopover).not.toHaveBeenCalled()
    cleanup()
    expect(element.hidePopover).not.toHaveBeenCalled()
    expect(element.popover).toBeNull()
  })

  it('skips hiding a menu disconnected after opening', () => {
    const element = menuElement()
    const cleanup = liftMenuPopover(element)
    element.isConnected = false

    cleanup()
    expect(element.hidePopover).not.toHaveBeenCalled()
    expect(element.popover).toBeNull()
  })

  it('skips hiding a connected menu that has already closed', () => {
    const element = menuElement()
    const cleanup = liftMenuPopover(element)
    element.hidePopover()
    element.hidePopover.mockClear()

    cleanup()
    expect(element.hidePopover).not.toHaveBeenCalled()
    expect(element.popover).toBeNull()
  })

  it('leaves the element untouched when showPopover is unavailable', () => {
    const element = { popover: null, isConnected: true, matches: vi.fn(), hidePopover: vi.fn() }

    liftMenuPopover(element)()
    expect(element.popover).toBeNull()
    expect(element.matches).not.toHaveBeenCalled()
    expect(element.hidePopover).not.toHaveBeenCalled()
  })

  it('resets the attribute when hidePopover is unavailable', () => {
    const { hidePopover, ...element } = menuElement()
    const cleanup = liftMenuPopover(element)

    expect(element.popover).toBe('manual')
    cleanup()
    expect(element.popover).toBeNull()
  })

  it('can reopen the same element after StrictMode effect cleanup', () => {
    const element = menuElement()

    for (let cycle = 0; cycle < 2; cycle++) {
      const cleanup = liftMenuPopover(element)
      expect(element.popover).toBe('manual')
      expect(element.matches(':popover-open')).toBe(true)

      cleanup()
      expect(element.matches(':popover-open')).toBe(false)
      expect(element.popover).toBeNull()
    }

    expect(element.showPopover).toHaveBeenCalledTimes(2)
    expect(element.hidePopover).toHaveBeenCalledTimes(2)
  })
})

describe('menuPortalHost', () => {
  const Host = vi.fn<new () => Element>()
  const fallback = new Host()

  it('uses the nearest dialog or popover returned by closest', () => {
    const dialog = new Host()
    const popover = new Host()
    const closest = vi.fn<Element['closest']>().mockReturnValueOnce(dialog).mockReturnValueOnce(popover)
    const origin = { closest }

    expect(menuPortalHost(origin, fallback)).toBe(dialog)
    expect(menuPortalHost(origin, fallback)).toBe(popover)
    expect(closest.mock.calls).toEqual([['dialog, [popover]'], ['dialog, [popover]']])
  })

  it('uses the fallback when there is no matching host', () => {
    expect(menuPortalHost(null, fallback)).toBe(fallback)
    expect(menuPortalHost(undefined, fallback)).toBe(fallback)
    expect(menuPortalHost({ closest: () => null }, fallback)).toBe(fallback)
  })
})

const viewport = { width: 800, height: 600 }

describe('placeContextMenu', () => {
  const size = { width: 160, height: 120 }

  it('aligns the start or end of the menu to the point when there is room', () => {
    const at = { x: 240, y: 200 }
    expect(placeContextMenu(at, 'start', false, size, viewport)).toEqual({ x: 240, y: 200 })
    expect(placeContextMenu(at, 'end', false, size, viewport)).toEqual({ x: 80, y: 200 })
  })

  it('flips left when the menu would cross the right edge', () => {
    expect(placeContextMenu({ x: 720, y: 200 }, 'start', false, size, viewport)).toEqual({ x: 560, y: 200 })
  })

  it('flips up when the menu would cross the bottom edge', () => {
    expect(placeContextMenu({ x: 240, y: 540 }, 'start', false, size, viewport)).toEqual({ x: 240, y: 420 })
  })

  it('leaves a gap when placing the menu above the point', () => {
    expect(placeContextMenu({ x: 240, y: 200 }, 'start', true, size, viewport)).toEqual({ x: 240, y: 76 })
  })

  it('clamps an upward placement to the top edge', () => {
    expect(placeContextMenu({ x: 240, y: 80 }, 'start', true, size, viewport)).toEqual({ x: 240, y: 8 })
  })
})

describe('placeSubmenu', () => {
  const size = { width: 160, height: 80 }

  it('places the submenu to the right of its row when there is room', () => {
    const row = { left: 240, right: 400, top: 200 }
    expect(placeSubmenu(row, size, viewport)).toEqual({ x: 404, y: 195 })
  })

  it('flips left when the submenu would cross the right edge', () => {
    const row = { left: 560, right: 720, top: 200 }
    expect(placeSubmenu(row, size, viewport)).toEqual({ x: 396, y: 195 })
  })

  it('clamps to the bottom edge when the open submenu grows taller', () => {
    const row = { left: 240, right: 400, top: 500 }
    expect(placeSubmenu(row, size, viewport)).toEqual({ x: 404, y: 495 })
    expect(placeSubmenu(row, { width: 160, height: 170 }, viewport)).toEqual({ x: 404, y: 422 })
  })
})

describe('lifted menu styles', () => {
  it('resets the browser popover defaults on both menus', () => {
    const css = parse(readFileSync(new URL('../styles.css', import.meta.url), 'utf8'))
    const declarations = new Map<string, string>()

    walk(css, {
      visit: 'Rule',
      enter(rule) {
        if (rule.prelude.type !== 'SelectorList') return
        const selectors = rule.prelude.children.toArray().map((selector) => generate(selector))
        if (!selectors.includes('.context-menu') || !selectors.includes('.submenu')) return
        for (const node of rule.block.children) {
          if (node.type === 'Declaration') declarations.set(node.property, generate(node.value))
        }
      }
    })

    expect(Object.fromEntries(declarations)).toMatchObject({
      position: 'fixed',
      inset: 'auto',
      margin: '0',
      color: 'var(--text)'
    })
  })
})
