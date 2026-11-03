import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContextUsage } from './ContextUsage'

describe('ContextUsage', () => {
  it('uses the same thresholds and token details in the composer and list', () => {
    const normal = renderToStaticMarkup(createElement(ContextUsage, { context: { used: 84_000, window: 200_000 } }))
    expect(normal).toContain('上下文 42%（84k / 200k）')
    expect(normal).toContain('data-level="normal"')
    const details = renderToStaticMarkup(createElement(ContextUsage, { context: { used: 84_000, window: 200_000 }, showDetails: true }))
    expect(details).toContain('42% (84k / 200k)')
    const warning = renderToStaticMarkup(createElement(ContextUsage, { context: { used: 120_000, window: 200_000 } }))
    expect(warning).toContain('data-level="warning"')
    const critical = renderToStaticMarkup(createElement(ContextUsage, { context: { used: 170_000, window: 200_000 } }))
    expect(critical).toContain('data-level="critical"')
  })

  it('shows a known zero, caps the ring, and never invents a percentage for an unknown window', () => {
    expect(renderToStaticMarkup(createElement(ContextUsage, { context: { used: 0, window: 200_000 } }))).toContain('>0%</span>')
    expect(renderToStaticMarkup(createElement(ContextUsage, { context: { used: 210_000, window: 200_000 } }))).toContain('>100%</span>')
    const unknown = renderToStaticMarkup(createElement(ContextUsage, { context: { used: 42_000, window: null }, showTokens: true }))
    expect(unknown).toContain('上下文 42k tokens')
    expect(unknown).toContain('>42k</span>')
    expect(unknown).not.toContain('%')
    const details = renderToStaticMarkup(createElement(ContextUsage, { context: { used: 42_000, window: null }, showDetails: true }))
    expect(details).toContain('42k tokens')
    expect(details).not.toContain('%')
  })
})
