import { AGENT_KINDS, DEFAULT_ACCOUNT, agentDescriptor, usageAccount, usageReadable, type AgentKind, type AgentUsage, type GlobalResets, type ResetCreditOutcome } from '@antumi/protocol'
import { replaceWindows, UsageFetchError, type ResetCreditUse, type UsageReport, type UsageSource } from './usage-source'

const POLL_MS = 15 * 60_000
// Manual refreshes and session exits come in bursts, and the provider endpoints are rate-limited too.
const MIN_REFRESH_MS = 30_000

// The readings one client is sent: those in the window kinds it reads (`kinds`, kept per client and
// replaced by what it names), since an older client fails to parse a whole list over one it does not know.
export function readableUsage(kinds: Set<string>, named: readonly string[] | undefined, list: AgentUsage[]): AgentUsage[] {
  if (named) {
    kinds.clear()
    named.forEach((kind) => kinds.add(kind))
  }
  return list.filter((entry) => usageReadable(kinds, entry))
}

// An account whose usage is read: its folder, or undefined for the user's own.
export type UsageAccount = { agent: AgentKind; id: string; home: string | undefined }

const keyOf = (agent: AgentKind, account: string) => `${agent}/${account}`

// The user's own account of each agent read: what there is without accounts.
const ownAccounts = (): UsageAccount[] => AGENT_KINDS.map((agent) => ({ agent, id: DEFAULT_ACCOUNT, home: undefined }))

// Each account's usage, by agent and account.
export class UsageService {
  private readonly usage = new Map<string, AgentUsage>()
  // What the reset tracker says, kept apart: it arrives on its own schedule, and rides each reading.
  private readonly globals = new Map<AgentKind, GlobalResets>()
  private manualRefresh: () => void = () => {}
  private inFlight: Promise<AgentUsage[]> | null = null
  private lastRefresh = Number.NEGATIVE_INFINITY
  private timer: ReturnType<typeof setInterval> | undefined
  private decorate: (entry: AgentUsage) => AgentUsage = (entry) => entry
  private stopped = false

  constructor(
    private readonly sources: Partial<Record<AgentKind, UsageSource>>,
    private readonly emit: (usage: AgentUsage) => void,
    private readonly now: () => number = Date.now,
    private readonly resets: Partial<Record<AgentKind, ResetCreditUse>> = {},
    private readonly accounts: () => UsageAccount[] = ownAccounts
  ) {}

  list(): AgentUsage[] {
    return [...this.usage.values()]
  }

  decorateWith(decorate: (entry: AgentUsage) => AgentUsage): void { this.decorate = decorate }

  start(): void {
    this.stopped = false
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), POLL_MS)
    this.timer.unref()
  }

  async stop(): Promise<void> {
    this.stopped = true
    clearInterval(this.timer)
    await this.inFlight
  }

  // The user asked to refresh: the usage, and whatever else rides it.
  requestRefresh(): Promise<AgentUsage[]> {
    this.manualRefresh()
    return this.refresh()
  }

  onManualRefresh(listener: () => void): void {
    this.manualRefresh = listener
  }

  // What the reset tracker says about an agent's service, or null to show nothing.
  setGlobalResets(agent: AgentKind, resets: GlobalResets | null): void {
    if (resets) this.globals.set(agent, resets)
    else if (!this.globals.delete(agent)) return
    for (const current of this.list().filter((usage) => usage.agent === agent)) {
      const next = { ...current, globalResets: resets }
      this.usage.set(keyOf(agent, usageAccount(current)), next)
      this.emit(next)
    }
  }

  // A call within MIN_REFRESH_MS of the previous one answers with the numbers already held.
  refresh(): Promise<AgentUsage[]> {
    if (this.stopped) return Promise.resolve(this.list())
    if (this.inFlight) {
      return this.inFlight
    }
    if (this.now() - this.lastRefresh < MIN_REFRESH_MS) {
      return Promise.resolve(this.list())
    }
    this.lastRefresh = this.now()
    const accounts = this.accounts().filter((account) => this.sources[account.agent])
    // An account no longer kept is no longer shown.
    const kept = new Set(accounts.map((account) => keyOf(account.agent, account.id)))
    for (const key of [...this.usage.keys()]) if (!kept.has(key)) this.usage.delete(key)
    this.inFlight = Promise.all(accounts.map((account) => this.refreshAccount(account))).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  // Spends one of the agent's resets, then reads its usage again at once, rate limit or not: what
  // was cleared and what is left are the point. A refresh already under way read from before.
  async useResetCredit(agent: AgentKind, requestId: string, creditId?: string, account = DEFAULT_ACCOUNT): Promise<ResetCreditOutcome> {
    const use = this.resets[agent]
    const target = this.accounts().find((each) => each.agent === agent && each.id === account)
    if (!target) throw new Error('没有这个账号')
    if (!use) {
      throw new Error(`${agentDescriptor(agent).label} 的重置卡只能在它自己的应用里使用`)
    }
    try {
      return await use(requestId, creditId, target.home)
    } catch (error) {
      if (error instanceof UsageFetchError) {
        throw new Error(
          error.code === 'auth-expired'
            ? `登录凭据已过期，运行一次 ${agentDescriptor(agent).cli} 刷新后再试`
            : `没有连上 ${agentDescriptor(agent).label} 的服务（${error.message}），可以重试，同一次使用不会重复扣卡`
        )
      }
      throw error
    } finally {
      await this.inFlight
      await this.refreshAccount(target)
    }
  }

  // Reads one account now, whatever was read lately: it was just signed in.
  async readAccount(agent: AgentKind, id: string): Promise<void> {
    if (this.stopped) return
    const account = this.accounts().find((each) => each.agent === agent && each.id === id)
    if (account && this.sources[agent]) await this.refreshAccount(account)
  }

  forget(agent: AgentKind, id: string): void {
    this.usage.delete(keyOf(agent, id))
  }

  // A running agent's own word on its limits. Only the windows it names change; until a poll has
  // signed the agent in, the report is all there is to show. One older than the reading held, as a
  // stage replayed from its log reports what was true then, changes nothing and asks for nothing.
  report(agent: AgentKind, account: string, report: UsageReport): void {
    const previous = this.usage.get(keyOf(agent, account))
    if (previous && report.at < previous.updatedAt) {
      return
    }
    if (report.windows.length > 0) {
      const next: AgentUsage = this.decorate({
        agent,
        account,
        status: 'ok',
        windows: replaceWindows(previous?.windows ?? [], report.windows),
        plan: report.plan ?? previous?.plan ?? null,
        error: null,
        updatedAt: report.at,
        resetCredits: previous?.resetCredits ?? null,
        globalResets: this.globals.get(agent) ?? null
      })
      this.usage.set(keyOf(agent, account), next)
      this.emit(next)
    }
    if (report.refresh) {
      void this.refresh()
    }
  }

  private async refreshAccount(account: UsageAccount): Promise<AgentUsage> {
    const next = this.decorate({ ...(await this.read(account)), globalResets: this.globals.get(account.agent) ?? null })
    this.usage.set(keyOf(account.agent, account.id), next)
    this.emit(next)
    return next
  }

  private async read({ agent, id: account, home }: UsageAccount): Promise<AgentUsage> {
    try {
      const source = this.sources[agent]
      if (!source) throw new Error(`no usage source for ${agent}`)
      const reading = await source(home)
      return reading.signedIn
        ? {
            agent,
            account,
            status: 'ok',
            windows: reading.windows,
            plan: reading.plan,
            error: null,
            updatedAt: this.now(),
            resetCredits: reading.resetCredits ? { ...reading.resetCredits, usable: this.resets[agent] !== undefined } : null
          }
        : { agent, account, status: 'signed-out', windows: [], plan: null, error: null, updatedAt: this.now(), resetCredits: null }
    } catch (error) {
      console.error(`[antumi-core] ${agent} usage refresh failed:`, error instanceof Error ? error.message : error)
      const previous = this.usage.get(keyOf(agent, account))
      return {
        agent,
        account,
        status: 'error',
        windows: previous?.windows ?? [],
        plan: previous?.plan ?? null,
        error: error instanceof UsageFetchError ? error.code : 'request-failed',
        // Keep when the windows were really read, so the UI can tell how stale they are.
        updatedAt: previous?.updatedAt ?? this.now(),
        resetCredits: previous?.resetCredits ?? null
      }
    }
  }
}
