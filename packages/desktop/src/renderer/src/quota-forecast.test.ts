import { describe, expect, it } from 'vitest'
import type { UsageForecast } from '@antumi/protocol'
import { forecastRunsOut } from './quota-forecast'

const forecast = (values: Partial<UsageForecast>): UsageForecast => ({
  window: { kind: 'session', model: null, usedPercent: 40, windowMinutes: 300, resetsAt: 10_000 },
  account: 'default', agent: 'claude', basis: 'window', percentPerHour: 10, runsOutAt: null, beforeReset: false, ...values
})

describe('forecastRunsOut', () => {
  it('names when a window runs out before its reset, and nothing where it lasts or cannot tell', () => {
    expect(forecastRunsOut(forecast({ runsOutAt: 5_000, beforeReset: true }))).toEqual({ at: 5_000, basis: '按窗口平均速度' })
    expect(forecastRunsOut(forecast({ runsOutAt: 20_000, beforeReset: false }))).toBeNull()
    expect(forecastRunsOut(forecast({ basis: 'insufficient', beforeReset: true, runsOutAt: 5_000 }))).toBeNull()
    expect(forecastRunsOut(undefined)).toBeNull()
  })
})
