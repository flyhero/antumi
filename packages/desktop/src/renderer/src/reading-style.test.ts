import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from './preferences'
import { readingStyle } from './reading-style'

describe('shared Markdown reading preferences', () => {
  it('derives one set of reading tokens from existing preferences', () => {
    const style = readingStyle({ ...DEFAULT_PREFERENCES, chatFont: 'custom', chatFontFamily: 'Example Sans', chatCjkFontFamily: 'Example CJK', chatFontSize: 18, chatLineHeight: 2, chatParagraphSpacing: 0.8, chatWidth: 'medium' })
    expect(style['--reading-font']).toContain('"Example Sans"')
    expect(style['--reading-font']).toContain('"Example CJK"')
    expect(style['--reading-size']).toBe('18px')
    expect(style['--reading-line-height']).toBe('2')
    expect(style['--reading-paragraph-spacing']).toBe('0.8em')
    expect(style['--reading-width']).toBe('1200px')
  })

  it('keeps the system fallback for an empty custom family and respects serif Chinese fonts', () => {
    expect(readingStyle({ ...DEFAULT_PREFERENCES, chatFont: 'custom', chatFontFamily: '' })['--reading-font']).toBe(readingStyle(DEFAULT_PREFERENCES)['--reading-font'])
    expect(readingStyle({ ...DEFAULT_PREFERENCES, chatFont: 'serif' })['--reading-font']).toContain('Songti SC')
    expect(readingStyle({ ...DEFAULT_PREFERENCES, chatFont: 'serif', chatCjkFontFamily: 'My CJK' })['--reading-font']).toContain('"My CJK"')
  })

  it('uses the same responsive width limit for all reading surfaces', () => {
    expect(readingStyle(DEFAULT_PREFERENCES)['--reading-width']).toBe('var(--page-reading)')
    expect(readingStyle({ ...DEFAULT_PREFERENCES, chatWidth: 'full' })['--reading-width']).toBe('100%')
  })
})
