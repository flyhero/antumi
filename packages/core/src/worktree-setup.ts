import { cp, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { ProjectConfig } from '@antumi/protocol'
import type { ProjectConfigStore, ProjectSetup, TrustedSetup } from './project-config'
import type { TerminalService } from './terminal-service'

// What a run hands an agent of a failure: the end of the output, where the tab has the rest.
const FAILURE_TAIL = 2000

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

// Copies the paths the project lists from its checkout into a new worktree. A path missing from
// the checkout is skipped and one already in the worktree is left alone, so a tracked file never
// changes; one outside the project, through `..` or a link, is skipped too. Returns what was copied.
export async function copyListed(topLevel: string, worktree: string, paths: ProjectConfig['copy']): Promise<string[]> {
  const copied: string[] = []
  const root = await realpath(topLevel)
  for (const listed of paths ?? []) {
    if (path.isAbsolute(listed)) continue
    const from = path.resolve(topLevel, listed)
    const to = path.resolve(worktree, listed)
    if (!inside(topLevel, from) || !inside(worktree, to)) continue
    const real = await realpath(from).catch(() => null)
    if (!real || !inside(root, real)) continue
    if (await lstat(to).catch(() => null)) continue
    await cp(real, to, { recursive: true, force: false, errorOnExist: false, preserveTimestamps: true })
    copied.push(listed)
  }
  return copied
}

export type ProjectRun = { terminalId: string; exitCode: number | null; tail: string }

type Runner = Pick<TerminalService, 'run' | 'waitForExit' | 'read' | 'kill'>

// A project's setup or check in a tab of the conversation's, so the user can watch or stop it and
// its agent can read it; resolves once it ends. A run that passed closes its tab: nothing in it
// needs a look, while a failed one stays for the user and the agent it is reported to.
// signal: a run called off before its command starts runs nothing; one called off as its tab is
// made is killed, since a stop by conversation cannot see a tab not yet registered.
export async function runProjectCommand(
  terminals: Runner,
  conversationId: string,
  setup: ProjectSetup,
  worktree: string,
  purpose: 'setup' | 'check',
  signal?: AbortSignal
): Promise<ProjectRun | null> {
  const command = setup.config[purpose]
  if (!command || signal?.aborted) return null
  const env = { ANTUMI_ROOT_PATH: setup.topLevel, ANTUMI_WORKTREE_PATH: worktree }
  const terminal = await terminals.run(conversationId, worktree, command, { title: `${purpose} · ${path.basename(worktree)}`, env, purpose })
  if (signal?.aborted) await terminals.kill(terminal.id).catch(() => {})
  const exitCode = await terminals.waitForExit(terminal.id)
  const output = await terminals.read(conversationId, terminal.id, FAILURE_TAIL).catch(() => null)
  if (exitCode === 0) await terminals.kill(terminal.id).catch(() => {})
  return { terminalId: terminal.id, exitCode, tail: output?.output ?? '' }
}

export function runFailed(run: ProjectRun | null): run is ProjectRun {
  return run !== null && run.exitCode !== 0
}

// A failed run as an agent is told of it: where, how it ended, and the end of what it printed.
export function describeFailedRun(command: string, worktree: string, run: ProjectRun): string {
  const ended = run.exitCode === null ? '被停止' : `退出码 ${run.exitCode}`
  return `在 ${worktree} 运行 \`${command}\` 失败（${ended}），终端标签 id：${run.terminalId}。输出末尾：\n\`\`\`\n${run.tail}\n\`\`\``
}

// A worktree a start laid out, with the project it came from.
export type NewWorktree = { topLevel: string; dir: string }

// What tasks and conversations ask of a project's config: that its commands are trusted before
// anything is laid out, setup in the worktrees just made, and check before review.
export class WorktreeSetup {
  constructor(
    private readonly configs: Pick<ProjectConfigStore, 'requireTrusted'>,
    private readonly terminals: Runner
  ) {}

  requireTrusted(repoPaths: readonly string[]): Promise<TrustedSetup[]> {
    return this.configs.requireTrusted(repoPaths)
  }

  // Copies the listed files into each new worktree, then runs setup in them all at once. The
  // setups are the ones the user trusted before the start, not the file as it may stand now.
  // Returns each failure as the agent is told of it.
  async setUp(conversationId: string, worktrees: readonly NewWorktree[], setups: readonly ProjectSetup[], signal?: AbortSignal): Promise<string[]> {
    const failures = await Promise.all(worktrees.map(async ({ topLevel, dir }) => {
      const setup = setups.find((each) => each.topLevel === topLevel)
      if (!setup) return null
      try {
        await copyListed(topLevel, dir, setup.config.copy)
      } catch (error) {
        return `把项目列出的文件复制到 ${dir} 时失败：${error instanceof Error ? error.message : String(error)}`
      }
      if (signal?.aborted) return null
      try {
        const run = await runProjectCommand(this.terminals, conversationId, setup, dir, 'setup', signal)
        return runFailed(run) && setup.config.setup ? describeFailedRun(setup.config.setup, dir, run) : null
      } catch (error) {
        return `在 ${dir} 启动 setup 失败：${error instanceof Error ? error.message : String(error)}`
      }
    }))
    return failures.flatMap((failure) => (failure ? [failure] : []))
  }

  // Runs each project's check where the agent works on it, all at once; null when no project has
  // one, else each failure as the agent is told of it.
  async check(conversationId: string, repos: readonly { path: string; dir: string }[]): Promise<string[] | null> {
    const setups = await this.requireTrusted(repos.map((repo) => repo.path))
    const checked = repos.flatMap((repo) => {
      const setup = setups.find((each) => each.repoPath === repo.path)
      return setup?.config.check ? [{ setup, dir: repo.dir, command: setup.config.check }] : []
    })
    if (checked.length === 0) return null
    const runs = await Promise.all(checked.map(async ({ setup, dir, command }) => {
      const run = await runProjectCommand(this.terminals, conversationId, setup, dir, 'check')
      return runFailed(run) ? describeFailedRun(command, dir, run) : null
    }))
    return runs.flatMap((failure) => (failure ? [failure] : []))
  }
}
