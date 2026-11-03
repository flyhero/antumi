import { describe, expect, it } from 'vitest'
import { communityThemeCatalog, communityThemeUpdate, CommunityThemeManifest, installCommunityTheme } from './community-theme-catalog'

const root = '/community/markdown-themes/'
const manifest = { format: 'antumi-markdown-theme', version: 1, themeVersion: '1.0.0', name: 'Aurora', author: 'Example author', description: 'Original accent colors', license: 'MIT', base: 'neon', css: 'h2 { border-bottom: 2px solid var(--md-primary-color); }' }
const images = { [`${root}aurora/preview-light.png`]: '/assets/light.png', [`${root}aurora/preview-dark.png`]: '/assets/dark.png' }
const theme = () => {
  const [entry] = communityThemeCatalog({ [`${root}aurora/theme.json`]: manifest }, images)
  if (!entry) throw new Error('Missing test theme')
  return entry
}
const localId = '5dde10ce-045e-42d5-b2d7-3510edf38fc1'
const otherId = '6dde10ce-045e-42d5-b2d7-3510edf38fc1'

describe('PR-managed community theme catalog', () => {
  it('supports an empty catalog and loads data packages without renderer registration', () => {
    expect(communityThemeCatalog({}, {})).toEqual([])
    expect(theme()).toMatchObject({ id: 'aurora', lightPreview: '/assets/light.png', darkPreview: '/assets/dark.png', manifest: { themeVersion: '1.0.0', source: 'https://github.com/flyhero/antumi/tree/main/community/markdown-themes/aurora' } })
  })

  it.each([
    { author: '' }, { license: '' }, { description: '' }, { themeVersion: undefined },
    { themeVersion: '01.0.0' }, { themeVersion: 'latest' }, { fontSize: 14 }, { lineHeight: 2 },
    { width: 800 }, { id: localId }, { communityId: 'aurora' }, { css: '@import "remote.css";' }
  ])('rejects incomplete or nonvisual submissions: %j', (change) => {
    expect(CommunityThemeManifest.safeParse({ ...manifest, ...change }).success).toBe(false)
  })

  it('requires a stable directory slug and both bundled previews', () => {
    expect(() => communityThemeCatalog({ [`${root}Aurora/theme.json`]: manifest }, images)).toThrow()
    expect(() => communityThemeCatalog({ [`${root}aurora/theme.json`]: manifest }, {})).toThrow('missing preview')
  })

  it('installs once, retains local edits on reapply, and updates explicitly without duplicates', () => {
    const entry = theme()
    const installed = installCommunityTheme(entry, [], localId)
    const edited = installed.map((pack) => ({ ...pack, name: 'My edit', css: 'h2 { color: blue; }' }))
    expect(installCommunityTheme(entry, edited, otherId)).toEqual(edited)
    const newer = { ...entry, manifest: { ...entry.manifest, name: 'Renamed', themeVersion: '1.0.1' } }
    expect(communityThemeUpdate(newer, installed[0])).toBe(true)
    const updated = installCommunityTheme(newer, edited, otherId)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ id: localId, communityId: 'aurora', themeVersion: '1.0.1', name: 'Renamed', css: entry.manifest.css })
    expect(communityThemeUpdate(entry, updated[0])).toBe(false)
    expect(installCommunityTheme(entry, updated, otherId)).toEqual(updated)
  })

  it('compares version components numerically', () => {
    const entry = theme()
    const installed = installCommunityTheme({ ...entry, manifest: { ...entry.manifest, themeVersion: '1.0.9' } }, [], localId)[0]
    expect(communityThemeUpdate({ ...entry, manifest: { ...entry.manifest, themeVersion: '1.0.10' } }, installed)).toBe(true)
  })
})
