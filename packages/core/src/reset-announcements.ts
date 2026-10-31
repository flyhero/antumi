import { z } from 'zod'
import { AGENT_KINDS, agentDescriptor, type AgentKind, type GlobalReset, type GlobalResets } from '@antumi/protocol'
import { fetchUsageJson } from './usage-source'

// limitreset.net: a free, keyless community API that gathers the resets services announce for
// everyone (OpenAI's on X, for Codex), every product in one reply. It asks to be credited.
const STATUS_URL = 'https://limitreset.net/api/v1/status'
// Where limitreset.net gets Codex's from, asked only when it is down or has stopped hearing from
// it; likewise free and keyless, and credited.
const CODEX_RESETS_URL = 'https://codex-resets.com/api/v1/status'
// limitreset.net checks Codex Resets often; this long without a success, its Codex news is stale.
const SOURCE_STALE_MS = 6 * 60 * 60_000
const HEADERS = { 'User-Agent': 'Antumi (+https://github.com/flyhero/antumi)' }
// Announcements come every few days, and land hours after; an hour apart misses nothing worth having.
const POLL_MS = 60 * 60_000
// Asking by hand (the usage card's 立即刷新) goes no faster than this.
const MIN_REFRESH_MS = 5 * 60_000
// An announcement the tracker never saw land is dropped after this, rather than promised forever.
const UPCOMING_STALE_MS = 3 * 24 * 60 * 60_000

const Event = z.object({
  kind: z.string(),
  announcedAt: z.string(),
  text: z.string().nullish(),
  sourceUrl: z.string().nullish(),
  metadata: z.object({ scheduledFor: z.string().nullish(), resetType: z.string().nullish() }).nullish().catch(null)
})
const Product = z.object({
  latestEvent: Event.nullish().catch(null),
  upcomingEvent: Event.nullish().catch(null),
  forecast: z.object({ p48: z.number().nullish(), basis: z.string().nullish() }).nullish().catch(null)
})
const Status = z.object({ products: z.record(z.string(), z.unknown()) })
const Discovery = z.object({ discovery: z.object({ lastSuccessAt: z.string().nullish(), failing: z.boolean().nullish() }) })

// Codex Resets' own shape.
const CodexReset = z.object({
  reset_type: z.string().nullish(),
  announced_at: z.string(),
  scheduled_for: z.string().nullish(),
  text: z.string().nullish(),
  source: z.object({ url: z.string().nullish() }).nullish().catch(null)
})
const CodexResetsStatus = z.object({
  data: z.object({ latest_reset: CodexReset.nullish().catch(null), scheduled_reset: CodexReset.nullish().catch(null) })
})

const time = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function globalReset(event: z.infer<typeof Event> | null | undefined): GlobalReset | null {
  const at = time(event?.announcedAt)
  if (!event || at === null) return null
  // Announced comes first: a banked reset can be announced before it lands too.
  const kind = event.kind === 'upcoming' ? 'upcoming' : event.kind === 'banked' || event.metadata?.resetType === 'banked' ? 'banked' : event.kind === 'reset' ? 'reset' : null
  if (!kind) return null
  return {
    kind,
    at,
    text: event.text?.trim() || null,
    // Shown as a link: nothing but a web address.
    sourceUrl: event.sourceUrl?.startsWith('https://') ? event.sourceUrl : null,
    scheduledFor: time(event.metadata?.scheduledFor),
    resetType: event.metadata?.resetType === 'banked' || kind === 'banked' ? 'banked'
      : event.metadata?.resetType === 'regular' || event.metadata?.resetType === 'reset' || kind === 'reset' ? 'reset' : null
  }
}

// One product's resets out of the status reply; null when the tracker has nothing on it.
export function parseResetStatus(body: unknown, product: string, now: number): GlobalResets | null {
  const status = Status.safeParse(body)
  const entry = status.success ? Product.safeParse(status.data.products[product]) : null
  if (!entry?.success) return null
  const latest = globalReset(entry.data.latestEvent)
  const announced = globalReset(entry.data.upcomingEvent)
  // An announcement that has since landed, or gone stale, is no longer coming.
  const upcoming = announced && (!latest || announced.at > latest.at) && now - announced.at < UPCOMING_STALE_MS ? announced : null
  const forecast = entry.data.forecast
  const chance48h = forecast && forecast.basis !== 'insufficient-data' && typeof forecast.p48 === 'number' ? Math.min(1, Math.max(0, forecast.p48)) : null
  if (!latest && !upcoming && chance48h === null) return null
  return { latest, upcoming, chance48h, checkedAt: now }
}

// Whether limitreset.net's Codex news has stopped coming: its checks of Codex Resets fail, or have
// not succeeded for hours.
export function codexNewsStale(body: unknown, now: number): boolean {
  const parsed = Discovery.safeParse(body)
  if (!parsed.success) return true
  const last = time(parsed.data.discovery.lastSuccessAt)
  return parsed.data.discovery.failing === true || last === null || now - last > SOURCE_STALE_MS
}

// Codex Resets' status as the same resets; it gives no odds.
export function parseCodexResetsStatus(body: unknown, now: number): GlobalResets | null {
  const parsed = CodexResetsStatus.safeParse(body)
  if (!parsed.success) return null
  const event = (reset: z.infer<typeof CodexReset> | null | undefined, kind: 'reset' | 'upcoming') => reset ? globalReset({
    kind,
    announcedAt: reset.announced_at,
    text: reset.text,
    sourceUrl: reset.source?.url,
    metadata: { scheduledFor: reset.scheduled_for, resetType: reset.reset_type }
  }) : null
  const latest = event(parsed.data.data.latest_reset, 'reset')
  const announced = event(parsed.data.data.scheduled_reset, 'upcoming')
  const upcoming = announced && announced.kind === 'upcoming' && (!latest || announced.at > latest.at) && now - announced.at < UPCOMING_STALE_MS ? announced : null
  if (!latest && !upcoming) return null
  return { latest, upcoming, chance48h: null, checkedAt: now }
}

// Asks the tracker hourly about every agent whose descriptor names a product there, while the
// user has it on (ChatSettings.resetAnnouncements), and hands each answer to the usage readings.
// For Codex, when the tracker cannot be reached or its news is stale, Codex Resets answers
// instead. A request that fails both ways keeps what was last shown.
export class ResetAnnouncements {
  private timer: ReturnType<typeof setInterval> | undefined
  private last = Number.NEGATIVE_INFINITY
  private inFlight: Promise<void> | null = null

  constructor(
    private readonly enabled: () => boolean,
    private readonly publish: (agent: AgentKind, resets: GlobalResets | null) => void,
    private readonly fetchJson: (url: string) => Promise<unknown> = (url) => fetchUsageJson(url, HEADERS),
    private readonly now: () => number = Date.now
  ) {}

  start(): void {
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), POLL_MS)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
  }

  // Turned off, what was shown goes at once; turned on, it is asked for at once.
  settingsChanged(): void {
    if (this.enabled()) {
      if (this.last === Number.NEGATIVE_INFINITY) void this.refresh()
      return
    }
    this.last = Number.NEGATIVE_INFINITY
    for (const agent of tracked()) this.publish(agent, null)
  }

  refresh(): Promise<void> {
    if (!this.enabled()) return Promise.resolve()
    if (this.inFlight) return this.inFlight
    if (this.now() - this.last < MIN_REFRESH_MS) return Promise.resolve()
    this.last = this.now()
    this.inFlight = this.read().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private async read(): Promise<void> {
    const body = await this.fetchJson(STATUS_URL).catch((error: unknown) => failed('limitreset.net', error))
    // undefined: not asked, or no answer; then the tracker's word stands, or nothing changes.
    const codex = body === null || codexNewsStale(body, this.now())
      ? await this.fetchJson(CODEX_RESETS_URL).then((reply) => parseCodexResetsStatus(reply, this.now()), (error: unknown) => failed('codex-resets.com', error) ?? undefined)
      : undefined
    if (!this.enabled()) return
    for (const agent of tracked()) {
      const product = agentDescriptor(agent).resetTracker ?? ''
      if (product === 'codex' && codex !== undefined) this.publish(agent, codex)
      else if (body !== null) this.publish(agent, parseResetStatus(body, product, this.now()))
    }
  }
}

const tracked = (): AgentKind[] => AGENT_KINDS.filter((agent) => agentDescriptor(agent).resetTracker)

function failed(source: string, error: unknown): null {
  console.error(`[antumi-core] reading reset announcements from ${source} failed:`, error instanceof Error ? error.message : error)
  return null
}
