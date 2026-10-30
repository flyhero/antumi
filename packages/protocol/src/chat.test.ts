import { describe, expect, it } from 'vitest'
import { previewLayout, previewRequest } from './chat'

describe('previewRequest', () => {
  it('reads one file, a set, or falls back to the title the call carried', () => {
    expect(previewRequest(JSON.stringify({ path: '/a.png', title: ' 截图 ' }), '/x')).toEqual({ title: '截图', files: [{ path: '/a.png', title: null }], layout: null })
    expect(previewRequest(JSON.stringify({ title: '方案', files: [{ path: '/a.png', title: 'A' }, { path: '/b.png' }], layout: 'tabs' }), '/x'))
      .toEqual({ title: '方案', files: [{ path: '/a.png', title: 'A' }, { path: '/b.png', title: null }], layout: 'tabs' })
    expect(previewRequest(null, '/x.html')).toEqual({ title: null, files: [{ path: '/x.html', title: null }], layout: null })
    expect(previewRequest('not json', '/x.html').files).toEqual([{ path: '/x.html', title: null }])
  })
})

describe('previewLayout', () => {
  it('lays out by count unless asked', () => {
    expect(previewLayout(['/a.png', '/b.png'], null)).toBe('compare')
    expect(previewLayout(['/a.png', '/b.png', '/c.png'], null)).toBe('tabs')
    expect(previewLayout(['/1.png', '/2.png', '/3.png', '/4.png', '/5.png'], null)).toBe('grid')
    expect(previewLayout(['/a.png', '/b.png', '/c.png'], 'grid')).toBe('grid')
  })

  it('keeps pages to tabs, and side by side to what still compares', () => {
    expect(previewLayout(['/a.html', '/b.png'], 'grid')).toBe('tabs')
    expect(previewLayout(['/a.svg', '/b.svg'], 'compare')).toBe('compare')
    expect(previewLayout(['/1.png', '/2.png', '/3.png', '/4.png', '/5.png'], 'compare')).toBe('grid')
  })
})
