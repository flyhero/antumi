import type { WorktreeCleanResult } from '@antumi/protocol'

const DAY_MS = 24 * 60 * 60_000
const SWEEP_MS = 60 * 60_000
// After the daemon has handed back the chats it still runs, so none reads as idle while it works.
const FIRST_SWEEP_MS = 60_000

// Cleans the worktrees of conversations put away, and of tasks and conversations deleted, once they
// have lain that way longer than the user allows (ChatSettings.worktreeCleanDays), hourly and
// whenever that changes. Each goes through the usual cleaning, which looks at it again as it stands.
export class WorktreeAutoClean {
  private timer: ReturnType<typeof setInterval> | undefined
  private first: ReturnType<typeof setTimeout> | undefined
  private sweeping: Promise<number> | null = null

  constructor(
    private readonly days: () => number | null,
    private readonly idle: (before: number) => Promise<string[]>,
    private readonly clean: (paths: readonly string[]) => Promise<WorktreeCleanResult[]>,
    private readonly now: () => number = Date.now
  ) {}

  start(): void {
    this.first = setTimeout(() => void this.sweep(), FIRST_SWEEP_MS)
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS)
    this.first.unref()
    this.timer.unref()
  }

  stop(): void {
    clearTimeout(this.first)
    clearInterval(this.timer)
  }

  // How many it removed; one sweep at a time.
  sweep(): Promise<number> {
    this.sweeping ??= this.run().catch((error: unknown) => {
      console.error('[antumi-core] worktree cleaning failed', error)
      return 0
    }).finally(() => { this.sweeping = null })
    return this.sweeping
  }

  private async run(): Promise<number> {
    const days = this.days()
    if (days === null) return 0
    const paths = await this.idle(this.now() - days * DAY_MS)
    if (paths.length === 0) return 0
    return (await this.clean(paths)).filter((result) => result.removed).length
  }
}
