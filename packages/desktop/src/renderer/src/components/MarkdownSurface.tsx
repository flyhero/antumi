import { useId, useMemo, type ReactNode } from 'react'
import { markdownThemeCss } from '../markdown-theme-css'
import { markdownThemeStyle, resolveMarkdownTheme, type MarkdownThemePack } from '../markdown-theme-packs'
import { readingStyle, useReadingStyle, type ReadingPreferences } from '../reading-style'

// Keep the content as direct children for streaming carets and document selectors.
export function MarkdownSurface({ theme, packs, className, children, reading }: {
  theme: string
  packs: readonly MarkdownThemePack[]
  className?: string
  children: ReactNode
  reading?: ReadingPreferences
}) {
  const savedReading = useReadingStyle()
  const { base, pack } = resolveMarkdownTheme(theme, packs)
  const scope = `md-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const css = useMemo(() => pack ? markdownThemeCss(pack.css, scope).css : '', [pack?.css, scope])
  return <>
    {css && <style>{css}</style>}
    <div className={['chat-markdown markdown-content markdown-sheet', className].filter(Boolean).join(' ')} data-md-theme={base} data-md-scope={pack ? scope : undefined} style={{ ...markdownThemeStyle(pack), ...(reading ? readingStyle(reading) : savedReading) }}>
      {children}
    </div>
  </>
}
