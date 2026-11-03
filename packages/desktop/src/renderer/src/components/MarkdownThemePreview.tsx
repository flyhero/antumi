import { lazy, Suspense } from 'react'
import { t } from '../i18n'
import { resolveMarkdownTheme, type MarkdownThemePack } from '../markdown-theme-packs'
import type { ReadingPreferences } from '../reading-style'

const FileMarkdown = lazy(() => import('./FileMarkdown').then((module) => ({ default: module.FileMarkdown })))

// Exercise the file renderer itself, including GFM and highlighting, rather than a styled mockup.
export function MarkdownThemePreview({ theme, packs = [], reading }: { theme: string; packs?: readonly MarkdownThemePack[]; reading?: ReadingPreferences }) {
  return <div className="markdown-theme-preview markdown-sheet" data-md-theme={resolveMarkdownTheme(theme, packs).base}>
    <Suspense fallback={<p className="inspector-empty muted" role="status">{t('FileSource.renderingMarkdown')}</p>}>
      <FileMarkdown theme={theme} packs={packs} reading={reading} text={t('MarkdownTheme.sample')} file={{ path: '/preview.md', root: null, relative: null, kind: 'file' }} scope={{ conversationId: null, roots: [] }} />
    </Suspense>
  </div>
}
