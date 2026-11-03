import { communityThemeCatalog } from './community-theme-catalog'

// Packages are data-only; Vite includes reviewed manifests and local screenshots in the release.
export const MARKDOWN_COMMUNITY_THEMES = communityThemeCatalog(
  import.meta.glob<unknown>('../../../../../community/markdown-themes/*/theme.json', { eager: true, import: 'default' }),
  import.meta.glob<string>('../../../../../community/markdown-themes/*/preview-*.png', { eager: true, query: '?url', import: 'default' })
)
