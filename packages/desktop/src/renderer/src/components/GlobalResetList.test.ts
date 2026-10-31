import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { GlobalResets } from '@antumi/protocol'
import { globalResetText } from '../usage-format'
import { GlobalResetList } from './UsageBar'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

const HOUR = 60 * 60_000
const now = Date.parse('2026-10-18T04:00:00Z')
const latest = { kind: 'reset' as const, at: now - 7 * HOUR, text: 'Done', sourceUrl: 'https://x.com/thsottiaux/status/1', scheduledFor: null }
const quiet: GlobalResets = { latest, upcoming: null, chance48h: 0.22, checkedAt: now }

describe('globalResetText', () => {
  it('names the latest reset and, with none announced, the odds of another', () => {
    expect(globalResetText(quiet, now)).toEqual({
      upcoming: null,
      latest: '最近一次全员重置：7 小时前',
      chance: '48 小时内再次重置的可能约 22%，按以往间隔估算'
    })
  })

  it('leads with one announced, and drops the odds while it is', () => {
    const upcoming = { kind: 'upcoming' as const, at: now - 2 * HOUR, text: 'Landing within the next 2 hours', sourceUrl: null, scheduledFor: null }
    const text = globalResetText({ ...quiet, upcoming }, now)
    expect(text.upcoming).toBe('已预告重置活动（类型待确认） · 2 小时前发布')
    expect(text.chance).toBeNull()
  })

  it('says a banked reset is a credit for every paid account', () => {
    expect(globalResetText({ ...quiet, latest: { ...latest, kind: 'banked' } }, now).latest).toBe('最近一次给每个付费账号发重置卡：7 小时前')
  })

  it('distinguishes an upcoming automatic reset from a card distribution', () => {
    const upcoming = { ...latest, kind: 'upcoming' as const, at: now - HOUR, scheduledFor: now + HOUR }
    expect(globalResetText({ ...quiet, upcoming: { ...upcoming, resetType: 'banked' } }, now).upcoming).toContain('已预告发放重置卡，预计')
    expect(globalResetText({ ...quiet, upcoming: { ...upcoming, resetType: 'reset' } }, now).upcoming).toContain('已预告全员重置，预计')
  })
})

describe('GlobalResetList', () => {
  it('links the post, and puts unofficial source credits in the source tooltip', () => {
    const html = renderToStaticMarkup(createElement(GlobalResetList, { resets: quiet, now }))
    expect(html).toContain('href="https://x.com/thsottiaux/status/1"')
    expect(html).toContain('aria-label="数据来源"')
    expect(html).toContain('role="tooltip"')
    expect(html).not.toContain('usage-card-credits-hint')
    expect(html).toContain('非官方消息')
    expect(html).toContain('href="https://limitreset.net"')
    expect(html).toContain('href="https://codex-resets.com"')
  })
})
