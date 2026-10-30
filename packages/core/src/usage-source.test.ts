import { describe, expect, it } from 'vitest'
import type { UsageWindow } from '@antumi/protocol'
import { mergeUsageReports } from './usage-source'

const window = (kind: UsageWindow['kind'], model: string | null, usedPercent: number): UsageWindow => ({ kind, model, usedPercent, windowMinutes: kind === 'session' ? 300 : 10_080, resetsAt: null })

describe('mergeUsageReports', () => {
  it('lets the later report win window by window, each where it was, new ones last', () => {
    const earlier = { at: 1, windows: [window('session', null, 10), window('weekly', null, 20), window('weekly', 'Fable', 30)] }
    const later = { at: 2, windows: [window('weekly', 'Opus', 5), window('session', null, 40)] }
    expect(mergeUsageReports(earlier, later).windows).toEqual([window('session', null, 40), window('weekly', null, 20), window('weekly', 'Fable', 30), window('weekly', 'Opus', 5)])
  })
})
