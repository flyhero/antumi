import { describe, expect, it } from 'vitest'
import { notchSize, POPUP_WIDTH, popupArea, popupBounds } from './popup-placement'

describe('popupBounds', () => {
  it('centres the card at the top of the usable area', () => {
    const area = { x: 0, y: 25, width: 1440, height: 875 }
    expect(popupBounds(area, 300)).toEqual({ x: (1440 - POPUP_WIDTH) / 2, y: 29, width: POPUP_WIDTH, height: 300 })
  })

  it('places it on a display that is not the first', () => {
    const bounds = popupBounds({ x: -1920, y: 0, width: 1920, height: 1040 }, 200)
    expect(bounds.x).toBe(-1920 + (1920 - POPUP_WIDTH) / 2)
  })

  it('keeps a tall card to most of the screen, and a narrow screen to its width', () => {
    expect(popupBounds({ x: 0, y: 0, width: 1000, height: 600 }, 2000).height).toBe(480)
    const narrow = popupBounds({ x: 0, y: 0, width: 400, height: 800 }, 100.4)
    expect(narrow).toEqual({ x: 0, y: 4, width: 400, height: 101 })
  })

  it('sits flush with the top edge without a gap', () => {
    expect(popupBounds({ x: 0, y: 0, width: 1512, height: 982 }, 300, 0).y).toBe(0)
  })
})

const macbook14 = { bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 32, width: 1512, height: 950 }, internal: true }

describe('notchSize', () => {
  it('measures the notch of a 14-inch MacBook Pro', () => {
    expect(notchSize(macbook14)).toEqual({ width: 185, height: 32 })
  })

  it('scales with the display scaling the user chose', () => {
    const moreSpace = { ...macbook14, bounds: { x: 0, y: 0, width: 1800, height: 1169 } }
    expect(notchSize(moreSpace)).toEqual({ width: 220, height: 38 })
  })

  it('tells the other notched MacBooks by their aspect ratio', () => {
    const air13 = { ...macbook14, bounds: { x: 0, y: 0, width: 1280, height: 832 } }
    const pro16 = { ...macbook14, bounds: { x: 0, y: 0, width: 1728, height: 1117 } }
    expect(notchSize(air13)).toEqual({ width: 157, height: 27 })
    expect(notchSize(pro16)).toEqual({ width: 211, height: 37 })
  })

  it('finds none on an older MacBook or an external display', () => {
    expect(notchSize({ ...macbook14, bounds: { x: 0, y: 0, width: 1440, height: 900 } })).toBeNull()
    expect(notchSize({ ...macbook14, internal: false })).toBeNull()
    expect(notchSize({ ...macbook14, bounds: { x: 0, y: 0, width: 0, height: 0 } })).toBeNull()
  })
})

describe('popupArea', () => {
  it('puts the island over the menu bar on macOS, grown out of the notch', () => {
    expect(popupArea(macbook14, 'darwin')).toEqual({ area: macbook14.bounds, gap: 0, island: true, notch: { width: 185, height: 32 } })
  })

  it('floats the island on a Mac display without a notch', () => {
    const external = { bounds: { x: 1512, y: 0, width: 2560, height: 1440 }, workArea: { x: 1512, y: 25, width: 2560, height: 1415 }, internal: false }
    expect(popupArea(external, 'darwin')).toEqual({ area: external.bounds, gap: 0, island: true, notch: null })
  })

  it('keeps the card under the menu bar elsewhere', () => {
    expect(popupArea(macbook14, 'win32')).toEqual({ area: macbook14.workArea, gap: 4, island: false, notch: null })
  })
})
