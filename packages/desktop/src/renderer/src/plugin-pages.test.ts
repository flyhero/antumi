import { describe, expect, it } from 'vitest'
import { PluginInfo } from '@antumi/protocol'
import { availablePluginPages, findPluginPage, keptPluginPages, nextPluginPageExpiry, PLUGIN_PAGE_KEEP_MS, pluginPageLabel, pluginPageStateKey } from './plugin-pages'

const plugin = (id: string, enabled: boolean, pages: string[]) => PluginInfo.parse({
  id, version: '2.0.0', enabled, sources: [], versions: ['2.0.0'], origin: { kind: 'bundled' }, problem: null,
  pages: pages.map((page) => ({ id: page, label: `页 ${page}`, translations: { en: { label: `Page ${page}` } }, entry: `${page}/index.html` }))
})

describe('plugin pages', () => {
  it('lists the pages of enabled plugins in order', () => {
    const plugins = [plugin('dev.a.one', true, ['forum', 'news']), plugin('dev.a.two', false, ['hidden']), plugin('dev.a.three', true, [])]
    expect(availablePluginPages(plugins).map((entry) => `${entry.plugin}/${entry.page}@${entry.version}`)).toEqual(['dev.a.one/forum@2.0.0', 'dev.a.one/news@2.0.0'])
    expect(findPluginPage(plugins, { plugin: 'dev.a.two', page: 'hidden' })).toBeNull()
    expect(findPluginPage(null, { plugin: 'dev.a.one', page: 'forum' })).toBeNull()
  })

  it('labels a page in the interface language and keys its state by plugin and page', () => {
    const [page] = plugin('dev.a.one', true, ['forum']).pages
    if (!page) throw new Error('no page')
    expect(pluginPageLabel(page, 'zh-CN')).toBe('页 forum')
    expect(pluginPageLabel(page, 'en')).toBe('Page forum')
    expect(pluginPageLabel({ ...page, translations: { en: { label: '' } } }, 'en')).toBe('页 forum')
    expect(pluginPageStateKey({ plugin: 'dev.a.one', page: 'forum' })).not.toBe(pluginPageStateKey({ plugin: 'dev.a.one', page: 'news' }))
  })
})

describe('kept plugin pages', () => {
  const a = { plugin: 'p', page: 'a' }
  const b = { plugin: 'p', page: 'b' }
  const c = { plugin: 'q', page: 'c' }
  const d = { plugin: 'q', page: 'd' }

  it('keeps a page left, hidden, and shows it again on return', () => {
    let kept = keptPluginPages([], a, 0)
    kept = keptPluginPages(kept, null, 1_000)
    expect(kept).toEqual([{ ...a, leftAt: 1_000 }])
    expect(nextPluginPageExpiry(kept)).toBe(1_000 + PLUGIN_PAGE_KEEP_MS)
    expect(keptPluginPages(kept, a, 2_000)).toEqual([{ ...a, leftAt: null }])
  })

  it('unloads a page left ten minutes ago', () => {
    const kept = keptPluginPages(keptPluginPages([], a, 0), b, 5_000)
    expect(keptPluginPages(kept, b, 5_000 + PLUGIN_PAGE_KEEP_MS - 1)).toEqual([{ ...b, leftAt: null }, { ...a, leftAt: 5_000 }])
    expect(keptPluginPages(kept, b, 5_000 + PLUGIN_PAGE_KEEP_MS)).toEqual([{ ...b, leftAt: null }])
  })

  it('keeps at most three, letting the longest left go first', () => {
    let kept = keptPluginPages([], a, 0)
    for (const [index, page] of [b, c, d].entries()) kept = keptPluginPages(kept, page, (index + 1) * 1_000)
    expect(kept.map((entry) => entry.page)).toEqual(['d', 'c', 'b'])
    expect(nextPluginPageExpiry([{ ...d, leftAt: null }])).toBeNull()
  })
})
