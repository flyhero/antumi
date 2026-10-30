import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { QuotaAdvice, UsageForecast, UsageWindow } from '@antumi/protocol'
import { MeterHint, UsageWindowRow } from './UsageBar'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

const now = Date.parse('2026-10-30T12:00:00Z')
// A day and 4 hours into the week, a third of it spent: well ahead of the clock.
const weekly: UsageWindow = { kind: 'weekly', model: null, usedPercent: 36, windowMinutes: 10_080, resetsAt: now + 140 * 3600_000 }
const forecast: UsageForecast = { window: weekly, account: 'default', agent: 'codex', basis: 'window', percentPerHour: 1.3, runsOutAt: now + 48 * 3600_000, beforeReset: true }
const slowDown: QuotaAdvice = { agent: 'codex', kind: 'slow-down', window: weekly, at: now + 50 * 3600_000, percent: null, model: null }

const render = (props: Partial<Parameters<typeof UsageWindowRow>[0]> = {}) =>
  renderToStaticMarkup(createElement(UsageWindowRow, { window: weekly, now, display: 'used', showPace: true, forecast, advice: [slowDown], alternative: 'cursor', ...props }))

describe('UsageWindowRow', () => {
  it('marks the time gone on the meter, so a fill past it reads as spending ahead', () => {
    const html = render()
    expect(html).toContain('style="width:36%"')
    expect(html).toMatch(/class="usage-meter-time" style="left:16\.6+\d*%"/)
    expect(html).toContain('title="已用 36%，时间已过 17%"')
  })

  it('flips the mark with the fill when remaining quota is shown', () => {
    const html = render({ display: 'remaining' })
    expect(html).toContain('style="width:64%"')
    expect(html).toMatch(/class="usage-meter-time" style="left:83\.3+\d*%"/)
    expect(html).toContain('剩 64%')
  })

  it('says once when the quota runs out, leaving the advice only what to do', () => {
    const html = render()
    expect(html).toContain('3 天 20 小时')
    expect(html.replace(/<[^>]+>/g, ' ').match(/用完/g)).toHaveLength(1)
    expect(html).toContain('轻活可以交给 Cursor')
  })

  it('keeps the advice whole where no forecast says when it runs out', () => {
    expect(render({ forecast: undefined })).toMatch(/照现在的速度.*用完/)
  })

  it('draws no time mark for a window without a reset time', () => {
    expect(render({ window: { ...weekly, resetsAt: null }, forecast: undefined, advice: [] })).not.toContain('usage-meter-time')
  })
})

describe('MeterHint', () => {
  it('explains the fill and the mark behind an info button, in the terms the meters are shown in', () => {
    const used = renderToStaticMarkup(createElement(MeterHint, { display: 'used' }))
    expect(used).toContain('aria-label="进度条说明"')
    expect(used).toMatch(/aria-describedby="([^"]+)".*role="tooltip"/)
    expect(used).toContain('填充越过竖线')
    expect(renderToStaticMarkup(createElement(MeterHint, { display: 'remaining' }))).toContain('填充短于竖线')
  })
})
