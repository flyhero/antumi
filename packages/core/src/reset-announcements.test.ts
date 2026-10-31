import { describe, expect, it } from 'vitest'
import type { AgentKind, GlobalResets } from '@antumi/protocol'
import { codexNewsStale, parseCodexResetsStatus, parseResetStatus, ResetAnnouncements } from './reset-announcements'

const HOUR = 60 * 60_000
const now = Date.parse('2026-10-18T04:00:00Z')
const event = (kind: string, at: string, extra: Record<string, unknown> = {}) => ({
  kind, announcedAt: at, text: 'Done', sourceUrl: 'https://x.com/thsottiaux/status/1', metadata: { scheduledFor: null, resetType: 'regular' }, ...extra
})
const fresh = { lastSuccessAt: '2026-10-18T03:50:00Z', failing: false }
const status = (codex: Record<string, unknown>, discovery: Record<string, unknown> = fresh) => ({
  products: { codex, claude: { latestEvent: null, upcomingEvent: null, forecast: { p48: 0, basis: 'insufficient-data' } } },
  discovery
})
const codexResets = (latest: Record<string, unknown> | null, scheduled: Record<string, unknown> | null = null) => ({ data: { latest_reset: latest, scheduled_reset: scheduled, active_watch: null, stats: {} } })
const cr = (at: string, extra: Record<string, unknown> = {}) => ({ id: '1', reset_type: 'regular', announced_at: at, text: 'Done', source: { type: 'x_post', author: 'thsottiaux', url: 'https://x.com/thsottiaux/status/2' }, ...extra })

describe('parseResetStatus', () => {
  it('reads the latest reset, an announcement still to land, and the odds of another', () => {
    const body = status({
      latestEvent: event('reset', '2026-10-15T06:28:13Z'),
      upcomingEvent: event('upcoming', '2026-10-17T16:21:13Z', { text: 'Landing sometime today by EOD PST', metadata: { scheduledFor: '2026-10-18T07:00:00Z' } }),
      forecast: { p48: 0.22, basis: 'empirical' }
    })
    expect(parseResetStatus(body, 'codex', now)).toEqual({
      latest: { kind: 'reset', resetType: 'reset', at: Date.parse('2026-10-15T06:28:13Z'), text: 'Done', sourceUrl: 'https://x.com/thsottiaux/status/1', scheduledFor: null },
      upcoming: { kind: 'upcoming', resetType: null, at: Date.parse('2026-10-17T16:21:13Z'), text: 'Landing sometime today by EOD PST', sourceUrl: 'https://x.com/thsottiaux/status/1', scheduledFor: Date.parse('2026-10-18T07:00:00Z') },
      chance48h: 0.22,
      checkedAt: now
    })
  })

  it('drops an announcement that has landed since, or gone stale', () => {
    const landed = status({ latestEvent: event('reset', '2026-10-17T21:00:00Z'), upcomingEvent: event('upcoming', '2026-10-17T16:00:00Z') })
    expect(parseResetStatus(landed, 'codex', now)?.upcoming).toBeNull()
    const stale = status({ latestEvent: null, upcomingEvent: event('upcoming', '2026-10-10T00:00:00Z') })
    expect(parseResetStatus(stale, 'codex', now)).toBeNull()
  })

  it('tells a reset credit for everyone from a reset, and keeps only web links', () => {
    const banked = parseResetStatus(status({ latestEvent: event('banked', '2026-10-07T19:19:17Z', { sourceUrl: 'javascript:alert(1)' }) }), 'codex', now)
    expect(banked?.latest).toMatchObject({ kind: 'banked', sourceUrl: null })
    const typed = parseResetStatus(status({ latestEvent: event('reset', '2026-10-07T19:19:17Z', { metadata: { resetType: 'banked' } }) }), 'codex', now)
    expect(typed?.latest?.kind).toBe('banked')
    const announced = parseResetStatus(status({ upcomingEvent: event('upcoming', '2026-10-17T16:21:13Z', { metadata: { resetType: 'banked', scheduledFor: '2026-10-18T07:00:00Z' } }) }), 'codex', now)
    expect(announced?.upcoming).toMatchObject({ kind: 'upcoming', resetType: 'banked' })
  })

  it('has nothing for a product the tracker knows nothing of, or a reply it cannot read', () => {
    const body = status({ latestEvent: null })
    expect(parseResetStatus(body, 'claude', now)).toBeNull()
    expect(parseResetStatus(body, 'cursor', now)).toBeNull()
    expect(parseResetStatus('nope', 'codex', now)).toBeNull()
  })
})

describe('codexNewsStale', () => {
  it('trusts the tracker while its checks of Codex Resets succeed', () => {
    expect(codexNewsStale(status({}), now)).toBe(false)
  })

  it('calls it stale when those checks fail, stopped hours ago, or are not reported', () => {
    expect(codexNewsStale(status({}, { ...fresh, failing: true }), now)).toBe(true)
    expect(codexNewsStale(status({}, { lastSuccessAt: '2026-10-17T20:00:00Z', failing: false }), now)).toBe(true)
    expect(codexNewsStale({ products: {} }, now)).toBe(true)
  })
})

describe('parseCodexResetsStatus', () => {
  it('reads the latest reset and one scheduled, with no odds', () => {
    const body = codexResets(cr('2026-10-15T06:28:13Z'), cr('2026-10-17T16:21:13Z', { status: 'scheduled', text: 'Landing today', scheduled_for: '2026-10-18T07:00:00Z' }))
    expect(parseCodexResetsStatus(body, now)).toEqual({
      latest: { kind: 'reset', resetType: 'reset', at: Date.parse('2026-10-15T06:28:13Z'), text: 'Done', sourceUrl: 'https://x.com/thsottiaux/status/2', scheduledFor: null },
      upcoming: { kind: 'upcoming', resetType: 'reset', at: Date.parse('2026-10-17T16:21:13Z'), text: 'Landing today', sourceUrl: 'https://x.com/thsottiaux/status/2', scheduledFor: Date.parse('2026-10-18T07:00:00Z') },
      chance48h: null,
      checkedAt: now
    })
  })

  it('tells a banked reset apart, and keeps a banked one announced as announced', () => {
    expect(parseCodexResetsStatus(codexResets(cr('2026-10-07T19:19:17Z', { reset_type: 'banked' })), now)?.latest?.kind).toBe('banked')
    const scheduled = codexResets(null, cr('2026-10-17T16:21:13Z', { reset_type: 'banked' }))
    expect(parseCodexResetsStatus(scheduled, now)?.upcoming).toMatchObject({ kind: 'upcoming', resetType: 'banked' })
  })

  it('has nothing for a reply it cannot read', () => {
    expect(parseCodexResetsStatus({ data: null }, now)).toBeNull()
  })
})

describe('ResetAnnouncements', () => {
  const body = status({ latestEvent: event('reset', '2026-10-17T21:12:21Z'), forecast: { p48: 0.2, basis: 'empirical' } })

  const fallback = codexResets(cr('2026-10-17T21:12:21Z', { text: 'From Codex Resets' }))

  function setup(options: { enabled?: () => boolean; tracker?: () => Promise<unknown>; codexResets?: () => Promise<unknown> } = {}) {
    let clock = now
    const asked: string[] = []
    const published: [AgentKind, GlobalResets | null][] = []
    const announcements = new ResetAnnouncements(
      options.enabled ?? (() => true),
      (agent, resets) => published.push([agent, resets]),
      (url) => {
        asked.push(new URL(url).host)
        if (url.includes('limitreset')) return options.tracker ? options.tracker() : Promise.resolve(body)
        return options.codexResets ? options.codexResets() : Promise.resolve(fallback)
      },
      () => clock
    )
    return { announcements, published, asked, fetches: () => asked.length, advance: (ms: number) => { clock += ms } }
  }
  const shown = (published: [AgentKind, GlobalResets | null][]) => published.map(([agent, resets]) => [agent, resets?.latest?.text ?? null])

  it('hands each tracked agent what the tracker says of its service, asking nothing else', async () => {
    const { announcements, published, asked } = setup()
    await announcements.refresh()
    expect(shown(published)).toEqual([['claude', null], ['codex', 'Done'], ['cursor', null]])
    expect(asked).toEqual(['limitreset.net'])
  })

  it('asks Codex Resets for Codex when the tracker is down, and leaves the others as they were', async () => {
    const { announcements, published, asked } = setup({ tracker: () => Promise.reject(new Error('offline')) })
    await announcements.refresh()
    expect(asked).toEqual(['limitreset.net', 'codex-resets.com'])
    expect(shown(published)).toEqual([['codex', 'From Codex Resets']])
  })

  it("asks Codex Resets for Codex when the tracker's Codex news is stale", async () => {
    const stale = status({ latestEvent: event('reset', '2026-10-15T06:28:13Z') }, { ...fresh, failing: true })
    const { announcements, published } = setup({ tracker: () => Promise.resolve(stale) })
    await announcements.refresh()
    expect(shown(published)).toEqual([['claude', null], ['codex', 'From Codex Resets'], ['cursor', null]])
  })

  it("keeps the tracker's stale word on Codex when Codex Resets cannot answer either", async () => {
    const stale = status({ latestEvent: event('reset', '2026-10-15T06:28:13Z') }, { ...fresh, failing: true })
    const { announcements, published } = setup({ tracker: () => Promise.resolve(stale), codexResets: () => Promise.reject(new Error('offline')) })
    await announcements.refresh()
    expect(shown(published)).toEqual([['claude', null], ['codex', 'Done'], ['cursor', null]])
  })

  it('asks nothing while off, and clears what was shown when turned off', async () => {
    let on = false
    const { announcements, published, fetches } = setup({ enabled: () => on })
    await announcements.refresh()
    expect(fetches()).toBe(0)
    on = true
    announcements.settingsChanged()
    await announcements.refresh()
    expect(fetches()).toBe(1)
    on = false
    published.length = 0
    announcements.settingsChanged()
    expect(published.every(([, resets]) => resets === null)).toBe(true)
  })

  it('asks no more than every few minutes, however often it is asked', async () => {
    const { announcements, fetches, advance } = setup()
    await announcements.refresh()
    await announcements.refresh()
    expect(fetches()).toBe(1)
    advance(HOUR)
    await announcements.refresh()
    expect(fetches()).toBe(2)
  })

  it('keeps what was shown when neither can be reached', async () => {
    const { announcements, published } = setup({ tracker: () => Promise.reject(new Error('offline')), codexResets: () => Promise.reject(new Error('offline')) })
    await announcements.refresh()
    expect(published).toEqual([])
  })
})
