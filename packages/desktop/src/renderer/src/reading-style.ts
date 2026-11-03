import type { CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePreferences, type Preferences } from './preferences'
import { cssFontFamily } from './system-fonts'

export type ReadingPreferences = Pick<Preferences, 'chatFont' | 'chatFontFamily' | 'chatCjkFontFamily' | 'chatFontSize' | 'chatLineHeight' | 'chatParagraphSpacing' | 'chatWidth'>
type ReadingStyle = CSSProperties & Record<'--reading-font' | '--reading-size' | '--reading-line-height' | '--reading-paragraph-spacing' | '--reading-width', string>

export function readingStyle(preferences: ReadingPreferences): ReadingStyle {
  const serif = preferences.chatFont === 'serif'
  const cjk = preferences.chatCjkFontFamily.trim() ? cssFontFamily(preferences.chatCjkFontFamily) : serif ? "'Songti SC', 'Noto Serif CJK SC', 'SimSun'" : "'PingFang SC', 'Microsoft YaHei'"
  const fallback = `-apple-system, BlinkMacSystemFont, 'Segoe UI', ${cjk}, sans-serif`
  const custom = preferences.chatFont === 'custom' && preferences.chatFontFamily.trim() ? `${cssFontFamily(preferences.chatFontFamily)}, ` : ''
  return {
    '--reading-font': serif ? `'Iowan Old Style', 'Palatino Linotype', Georgia, ${cjk}, serif` : `${custom}${fallback}`,
    '--reading-size': `${preferences.chatFontSize}px`,
    '--reading-line-height': String(preferences.chatLineHeight),
    '--reading-paragraph-spacing': `${preferences.chatParagraphSpacing}em`,
    '--reading-width': preferences.chatWidth === 'full' ? '100%' : preferences.chatWidth === 'medium' ? '1200px' : 'var(--page-reading)'
  }
}

export function useReadingStyle() {
  return usePreferences(useShallow(readingStyle))
}
