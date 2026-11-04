import { useLayoutEffect, useState, type RefObject } from 'react'
import { usePreferences } from './preferences'

// About 80 columns of 12px code a side, with the line numbers.
export const SPLIT_DIFF_MIN_WIDTH = 760

// Whether the diff in `box` shows side by side: as the user chose, or, left to itself, once the
// box (the inspector, not the window) is wide enough; it follows the box as it is dragged.
export function useSplitDiff(box: RefObject<HTMLElement | null>): boolean {
  const choice = usePreferences((p) => p.diffLayout)
  const [wide, setWide] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (!element || choice !== 'auto') return
    setWide(element.getBoundingClientRect().width >= SPLIT_DIFF_MIN_WIDTH)
    const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= SPLIT_DIFF_MIN_WIDTH))
    observer.observe(element)
    return () => observer.disconnect()
  }, [box, choice])
  return choice === 'split' || (choice === 'auto' && wide)
}
