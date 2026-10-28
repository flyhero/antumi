import { describe, expect, it } from 'vitest'
import { guideFor, guideImage, guidePage, guideSettingsSection } from './guide-page'

describe('guidePage', () => {
  it("takes the guide's heading for the page's title and leaves the rest as its body", () => {
    expect(guidePage('# Welcome\n\nFirst steps.\n')).toEqual({ title: 'Welcome', body: 'First steps.\n' })
    expect(guidePage('First steps.\n')).toEqual({ title: '使用指南', body: 'First steps.\n' })
  })

  it('finds a heading in both bundled guides', () => {
    expect(guideFor('zh-CN').title).toBe('Antumi 使用指南')
    expect(guideFor('en').title).toBe('Antumi user guide')
  })

  it('bundles every screenshot the guides show', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const sources = [...guideFor(locale).body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1] ?? '')
      expect(sources.length).toBeGreaterThan(0)
      for (const src of sources) expect(guideImage(src), src).toBeTruthy()
    }
  })

  it('links configuration topics to its place in Settings, and only to sections that exist', () => {
    expect(guideSettingsSection('antumi:settings/model-providers')).toBe('model-providers')
    expect(guideSettingsSection('https://example.com')).toBeNull()
    for (const locale of ['zh-CN', 'en'] as const) {
      const sections = [...guideFor(locale).body.matchAll(/\]\((antumi:[^)]+)\)/g)].map((match) => guideSettingsSection(match[1] ?? ''))
      expect(sections).toEqual(['agents', 'model-providers', 'accounts', 'plugins', 'permissions', 'conversation'])
    }
  })
})
