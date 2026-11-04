import { describe, expect, it } from 'vitest'
import { VisualizationPages } from './visualization-pages'

describe('visualization documents', () => {
  it('serves only registered documents with their own policy and no cache', async () => {
    const pages = new VisualizationPages()
    const url = pages.create(1, '<div>Preview</div>')
    const response = pages.serve(new Request(url))
    expect(await response.text()).toBe('<div>Preview</div>')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const policy = response.headers.get('content-security-policy')
    expect(policy).toContain("connect-src blob: data:")
    expect(policy).toContain("frame-src 'none'")
    expect(policy).not.toContain('file:')
    expect(pages.serve(new Request('antumi-visualization://document/unknown')).status).toBe(404)
    expect(pages.serve(new Request(url, { method: 'POST' })).status).toBe(404)
  })

  it('keeps documents owned by another renderer and releases its own on close', () => {
    const pages = new VisualizationPages()
    const first = pages.create(1, 'first')
    const second = pages.create(2, 'second')
    pages.remove(2, first)
    expect(pages.serve(new Request(first)).status).toBe(200)
    pages.remove(1)
    expect(pages.serve(new Request(first)).status).toBe(404)
    expect(pages.serve(new Request(second)).status).toBe(200)
    pages.remove(2, second)
    expect(pages.serve(new Request(second)).status).toBe(404)
  })

  it('bounds per-document and per-renderer memory independently', () => {
    const pages = new VisualizationPages()
    expect(() => pages.create(1, { html: 'not a string' })).toThrow()
    expect(() => pages.create(1, 'x'.repeat(6_000_001))).toThrow()
    for (let index = 0; index < 5; index++) pages.create(1, 'x'.repeat(6_000_000))
    expect(() => pages.create(1, 'x'.repeat(3_000_000))).toThrow()
    expect(() => pages.create(2, 'other renderer')).not.toThrow()
  })
})
