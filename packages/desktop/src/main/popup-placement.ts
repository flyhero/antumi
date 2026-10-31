export type Area = { x: number; y: number; width: number; height: number }
export type NotchSize = { width: number; height: number }
export type PopupDisplay = { bounds: Area; workArea: Area; internal: boolean }
// Where the card goes on a display, and what its page draws: an island over the menu bar, joined
// to the notch when the display has one; or a plain card in the usable area.
export type PopupPlacement = { area: Area; gap: number; island: boolean; notch: NotchSize | null }

// The window's own size: the card plus the margin its shadow is drawn in (styles.css).
export const POPUP_WIDTH = 500
const TOP_GAP = 4
// Taller than this, the card scrolls inside rather than running off the screen.
const MAX_SHARE = 0.8

// Apple keeps the camera housing in proportion across its notched MacBooks, and their displays
// share an aspect ratio no other Mac display has, whatever scaling the user chose: measured on a
// 14-inch MacBook Pro, in points, and scaled by the display's width. Electron knows no notch.
const NOTCHED = { width: 1512, height: 982, notchWidth: 185, notchHeight: 32 }
const ASPECT_TOLERANCE = 0.01

// On macOS the card sits at the very top of the screen, over the menu bar, as the system's own
// island would: the page draws it black and, on a notched display, grown out of the notch. On
// other platforms it sits under the menu bar, or a top panel, with a little air above it.
export function popupArea(display: PopupDisplay, platform: NodeJS.Platform): PopupPlacement {
  if (platform !== 'darwin') return { area: display.workArea, gap: TOP_GAP, island: false, notch: null }
  return { area: display.bounds, gap: 0, island: true, notch: notchSize(display) }
}

// Where an island kept up always lives: the built-in display, whose notch it grows out of, or
// with the lid closed the primary one.
export function islandDisplay<D extends { internal: boolean }>(displays: readonly D[], primary: D): D {
  return displays.find((display) => display.internal) ?? primary
}

// The notch of a built-in display in points, or null for a display without one.
export function notchSize(display: Pick<PopupDisplay, 'bounds' | 'internal'>): NotchSize | null {
  const { width, height } = display.bounds
  if (!display.internal || width <= 0 || height <= 0) return null
  if (Math.abs(width / height - NOTCHED.width / NOTCHED.height) > ASPECT_TOLERANCE) return null
  const scale = width / NOTCHED.width
  return { width: Math.round(NOTCHED.notchWidth * scale), height: Math.round(NOTCHED.notchHeight * scale) }
}

// Centred at the top of the area, the gap below its top edge.
export function popupBounds(area: Area, height: number, gap = TOP_GAP): Area {
  const width = Math.min(POPUP_WIDTH, area.width)
  const tallest = Math.max(1, Math.floor(area.height * MAX_SHARE))
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + gap,
    width,
    height: Math.min(tallest, Math.max(1, Math.ceil(height)))
  }
}
