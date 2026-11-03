import { localized, t } from './i18n'

export const MARKDOWN_THEMES = ['default', 'newsprint', 'quiet', 'sunset', 'ocean', 'neon'] as const
export type MarkdownTheme = typeof MARKDOWN_THEMES[number]

export const MARKDOWN_THEME_LABEL: Record<MarkdownTheme, { name: string; description: string }> = localized(() => ({
  default: { name: t('MarkdownTheme.default'), description: t('MarkdownTheme.defaultDescription') },
  newsprint: { name: t('MarkdownTheme.newsprint'), description: t('MarkdownTheme.newsprintDescription') },
  quiet: { name: t('MarkdownTheme.quiet'), description: t('MarkdownTheme.quietDescription') },
  sunset: { name: t('MarkdownTheme.sunset'), description: t('MarkdownTheme.sunsetDescription') },
  ocean: { name: t('MarkdownTheme.ocean'), description: t('MarkdownTheme.oceanDescription') },
  neon: { name: t('MarkdownTheme.neon'), description: t('MarkdownTheme.neonDescription') }
}))
