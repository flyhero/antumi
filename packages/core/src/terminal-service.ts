import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { agentDescriptor, PROCESS_OWNER_ENV, processOwner, Terminal, type AgentKind, type AgentCliInstallation, type ProcessOwner, type TerminalOutput } from '@antumi/protocol'
import { nodeLaunchHost, resolveCommand, type LaunchHost, type SessionInfo } from '@antumi/protocol/node'
import type { SessionHost } from './daemon-client'
import { Rejection } from './rejection'
import { terminalEnv, type ShellPrompt } from './shell-prompt'

// Marks everything a terminal starts as its owner's, so a server the shell outlives still shows.
function ownedBy(owner: ProcessOwner): Record<string, string> {
  return { [PROCESS_OWNER_ENV]: processOwner(owner) }
}

// The user's own login shell, started the way their terminal app would. An interactive shell is
// the point here; agent commands, by contrast, never go through one. On Windows that is
// PowerShell, as in Windows Terminal and VS Code: PowerShell 7 where it is installed.
export function userShell(env: NodeJS.ProcessEnv = process.env, host: LaunchHost = nodeLaunchHost): { command: string; args: string[] } {
  if (host.platform === 'win32') {
    // A Store install's pwsh.exe is an app alias, which ConPTY refuses to start.
    const pwsh = resolveCommand('pwsh.exe', os.homedir(), env, host)
    return { command: pwsh && !/[\\/]WindowsApps[\\/]/i.test(pwsh) ? pwsh : 'powershell.exe', args: ['-NoLogo'] }
  }
  return { command: env.SHELL || '/bin/sh', args: ['-l'] }
}

// An agent's command, run by the user's shell as the user's terminal would, but as the shell's
// command rather than typed at its prompt: the tab ends with the command, and says how it ended.
// The command is the agent's, so a shell has to read it; the agent's own permission prompt, or
// Antumi's where the agent has none, is what stands in front of it.
export function commandShell(command: string, env: NodeJS.ProcessEnv = process.env): { command: string; args: string[] } {
  if (process.platform === 'win32') return { command: env.COMSPEC ?? 'cmd.exe', args: ['/d', '/s', '/c', command] }
  return { command: env.SHELL || '/bin/sh', args: ['-l', '-c', command] }
}

// What a terminal printed, as plain text for a model: colours, cursor moves and titles dropped,
// and a line drawn over with carriage returns (a progress bar) kept as it last stood.
export function plainOutput(raw: string): string {
  const stripped = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r\n/g, '\n')
  return stripped.split('\n').map((line) => line.slice(line.lastIndexOf('\r') + 1)).join('\n')
}

const DEFAULT_TAIL = 8000

type Row = { id: string; sessionId: string; cwd: string; title: string; createdAt: number; conversationId: string | null; command: string | null; exited: number; exitCode: number | null; purpose: TerminalPurpose | null }

type TerminalPurpose = NonNullable<Terminal['purpose']>

// A command Antumi runs for a project rather than for the agent: its own tab title and environment.
export type RunOptions = { title?: string; env?: Record<string, string>; purpose?: TerminalPurpose }

// Rows live in `terminals`, which TaskStore's migrations create. They outlive a core restart
// because the daemon keeps the shells running; reconcile drops the ones it no longer has.
export class TerminalService {
  private readonly db: DatabaseSync
  private beforeCloseUpgrade: (() => Promise<void>) | null = null
  private readonly exits = new Map<string, ((exitCode: number | null) => void)[]>()

  constructor(
    file: string,
    private readonly daemon: SessionHost,
    private readonly emit: (terminals: Terminal[]) => void,
    private readonly now: () => number = Date.now,
    private readonly prompt: Pick<ShellPrompt, 'env'> | null = null
  ) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  onBeforeCloseUpgrade(reconcile: () => Promise<void>): void { this.beforeCloseUpgrade = reconcile }

  close(): void {
    this.db.close()
  }

  list(): Terminal[] {
    return this.rows().map(({ exited, ...row }) => Terminal.parse({ ...row, exited: exited === 1 }))
  }

  private rows(): Row[] {
    const rows: unknown[] = this.db
      .prepare(`SELECT id, session_id AS sessionId, cwd, title, created_at AS createdAt, conversation_id AS conversationId,
        command, exited, exit_code AS exitCode, purpose FROM terminals ORDER BY created_at`)
      .all()
    return rows.flatMap((row) => {
      const parsed = Terminal.extend({ exited: Terminal.shape.createdAt }).safeParse(row)
      return parsed.success ? [{ ...parsed.data, conversationId: parsed.data.conversationId ?? null, command: parsed.data.command ?? null, exitCode: parsed.data.exitCode ?? null, purpose: parsed.data.purpose ?? null }] : []
    })
  }

  // A conversation's own terminal; any other is as good as missing.
  private agentTerminal(conversationId: string, id: string): Row {
    const row = this.rows().find((each) => each.id === id && each.conversationId === conversationId)
    if (!row) throw new Rejection('terminal-not-found', 'no such terminal of this conversation')
    return row
  }

  owns(sessionId: string): boolean {
    return this.db.prepare('SELECT 1 FROM terminals WHERE session_id = ?').get(sessionId) !== undefined
  }

  // In the folder the user is looking at when there is one, else their home. colorPrompt: a shell
  // whose prompt the user never set gets one in colour (ShellPrompt).
  async open(cwd: string | undefined, colorPrompt = false): Promise<Terminal> {
    const folder = cwd && path.isAbsolute(cwd) && (await stat(cwd).catch(() => null))?.isDirectory() ? cwd : os.homedir()
    const shell = userShell()
    // Without its files the shell still opens, only with the prompt it came with.
    const prompt = colorPrompt && this.prompt ? await this.prompt.env(shell.command).catch(() => null) : null
    const id = randomUUID()
    const env = { ...terminalEnv(), ...prompt, ...ownedBy({ kind: 'terminal', id }) }
    const { sessionId } = await this.daemon.request('spawn', { command: shell.command, args: shell.args, cwd: folder, env, cols: 100, rows: 30 })
    const terminal = { id, sessionId, cwd: folder, title: path.basename(folder) || folder, createdAt: this.now() }
    this.db.prepare('INSERT INTO terminals (id, session_id, cwd, title, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(terminal.id, terminal.sessionId, terminal.cwd, terminal.title, terminal.createdAt)
    this.changed()
    return terminal
  }

  // An agent's command in a tab of its own, in the folder it asked for (else the conversation's).
  async run(conversationId: string, cwd: string, command: string, options: RunOptions = {}): Promise<Terminal> {
    const folder = path.isAbsolute(cwd) && (await stat(cwd).catch(() => null))?.isDirectory() ? cwd : os.homedir()
    const shell = commandShell(command)
    // Owned by the conversation rather than the tab: a server it starts outlives a closed tab.
    const env = { ...terminalEnv(), ...options.env, ...ownedBy({ kind: 'conversation', id: conversationId }) }
    const { sessionId } = await this.daemon.request('spawn', { command: shell.command, args: shell.args, cwd: folder, env, cols: 120, rows: 32 })
    const title = options.title ?? (command.length > 60 ? `${command.slice(0, 59)}…` : command)
    const purpose = options.purpose ?? null
    const terminal = { id: randomUUID(), sessionId, cwd: folder, title, createdAt: this.now(), conversationId, command, purpose }
    this.db.prepare('INSERT INTO terminals (id, session_id, cwd, title, created_at, conversation_id, command, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(terminal.id, terminal.sessionId, terminal.cwd, terminal.title, terminal.createdAt, conversationId, command, purpose)
    this.changed()
    // A command that fails at once can end before the spawn reply reaches core.
    const attached = await this.daemon.request('attach', { sessionId }).catch(() => null)
    if (attached?.exited) this.handleExit(sessionId, attached.exitCode)
    return this.list().find((each) => each.id === terminal.id) ?? { ...terminal, exited: false, exitCode: null }
  }

  // Resolves with the exit code once the command ends, however it does: by itself, stopped from
  // the panel, or its tab closed (null).
  waitForExit(id: string): Promise<number | null> {
    const row = this.rows().find((each) => each.id === id)
    if (!row) return Promise.resolve(null)
    if (row.exited === 1) return Promise.resolve(row.exitCode)
    return new Promise((resolve) => this.exits.set(row.sessionId, [...(this.exits.get(row.sessionId) ?? []), resolve]))
  }

  private settle(sessionId: string, exitCode: number | null): void {
    const waiting = this.exits.get(sessionId)
    this.exits.delete(sessionId)
    for (const resolve of waiting ?? []) resolve(exitCode)
  }

  // A user-started installer is a finite command, retained just like an agent's command.
  installCli(installation: AgentCliInstallation): Promise<Terminal> {
    const shell = installation.shell === 'powershell'
      ? { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', `$ErrorActionPreference = 'Stop'; ${installation.command}`] }
      : { command: '/bin/bash', args: ['-o', 'pipefail', '-c', installation.command] }
    return this.runFinite(shell, `安装 ${agentDescriptor(installation.agent).label} CLI`, installation.command)
  }

  // An agent's CLI signing in to an account: its own argv, no shell, pointed at the account's folder.
  signIn(argv: { command: string; args: readonly string[] }, env: Record<string, string>, title: string, agent?: AgentKind): Promise<Terminal> {
    return this.runFinite({ command: argv.command, args: [...argv.args] }, title, [argv.command, ...argv.args].join(' '), env, agent)
  }

  async upgradeCli(agent: AgentKind, upgradeId: string, argv: { command: string; args: string[] }): Promise<Terminal> {
    const cwd = os.homedir()
    const { sessionId } = await this.daemon.request('spawnCliUpgrade', { ...argv, agent, upgradeId, cwd, env: { ...terminalEnv(), ...ownedBy({ kind: 'terminal', id: upgradeId }) }, cols: 120, rows: 32 })
    return this.adoptUpgrade(agent, upgradeId, sessionId, [argv.command, ...argv.args].join(' '))
  }

  async adoptUpgrade(agent: AgentKind, id: string, sessionId: string, command: string): Promise<Terminal> {
    this.db.prepare('INSERT OR IGNORE INTO terminals (id, session_id, cwd, title, created_at, command) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, sessionId, os.homedir(), `升级 ${agentDescriptor(agent).label} CLI`, this.now(), command)
    const attached = await this.daemon.request('attach', { sessionId })
    if (attached.exited) this.handleExit(sessionId, attached.exitCode)
    this.changed()
    const terminal = this.list().find((each) => each.id === id)
    if (!terminal) throw new Rejection('terminal-not-found')
    return terminal
  }

  // A finite command the user started and follows in a tab; command: how the tab names it.
  private async runFinite(argv: { command: string; args: string[] }, title: string, command: string, env: Record<string, string> = {}, agent?: AgentKind): Promise<Terminal> {
    const cwd = os.homedir()
    const id = randomUUID()
    const { sessionId } = await this.daemon.request('spawn', { ...argv, agent, cwd, env: { ...terminalEnv(), ...env, ...ownedBy({ kind: 'terminal', id }) }, cols: 120, rows: 32 })
    const terminal = { id, sessionId, cwd, title, createdAt: this.now(), command }
    this.db.prepare('INSERT INTO terminals (id, session_id, cwd, title, created_at, command) VALUES (?, ?, ?, ?, ?, ?)')
      .run(terminal.id, sessionId, cwd, terminal.title, terminal.createdAt, terminal.command)
    this.changed()
    // A missing shell or download tool can end before the spawn reply reaches core.
    const attached = await this.daemon.request('attach', { sessionId }).catch(() => null)
    if (attached?.exited) this.handleExit(sessionId, attached.exitCode)
    return this.list().find((each) => each.id === terminal.id) ?? { ...terminal, exited: attached?.exited ?? false, exitCode: attached?.exitCode ?? null }
  }

  // The end of what an agent's command printed, as plain text, and whether it still runs.
  async read(conversationId: string, id: string, tail = DEFAULT_TAIL): Promise<TerminalOutput> {
    const row = this.agentTerminal(conversationId, id)
    const attached = await this.daemon.request('attach', { sessionId: row.sessionId }).catch(() => null)
    const output = plainOutput(attached?.buffer ?? '').replace(/\n+$/, '')
    const exited = row.exited === 1 || attached?.exited === true
    return {
      id,
      command: row.command ?? row.title,
      output: output.length > tail ? output.slice(-tail) : output,
      truncated: output.length > tail || (attached?.bufferStart ?? 0) > 0,
      running: !exited && attached !== null,
      exitCode: row.exitCode ?? attached?.exitCode ?? null
    }
  }

  // Stops an agent's command, as Ctrl-C would; the tab stays, saying how it ended.
  async stop(conversationId: string, id: string): Promise<void> {
    const row = this.agentTerminal(conversationId, id)
    if (row.exited === 1) return
    await this.daemon.request('kill', { sessionId: row.sessionId })
  }

  async stopForConversation(conversationId: string): Promise<void> {
    for (const row of this.rows().filter((terminal) => terminal.conversationId === conversationId && terminal.exited !== 1)) {
      await this.stop(conversationId, row.id)
      const until = Date.now() + 5000
      while (!(await this.daemon.request('attach', { sessionId: row.sessionId })).exited) {
        if (Date.now() >= until) throw new Rejection('squad-terminal-stopping', '成员命令尚未停止，团队已暂停')
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
  }

  // Ends the shell; its row goes at once rather than waiting for the exit event. An agent's
  // command that already ended leaves its output with the daemon until now.
  async kill(id: string): Promise<void> {
    const terminal = this.rows().find((each) => each.id === id)
    if (!terminal) return
    if (terminal.exited === 1) await this.beforeCloseUpgrade?.()
    this.remove(terminal.sessionId)
    if (terminal.exited === 1) await this.daemon.request('release', { sessionId: terminal.sessionId }).catch(() => {})
    else await this.daemon.request('kill', { sessionId: terminal.sessionId }).catch(() => {})
  }

  // Interactive shells close on exit; finite commands keep their output and exit code.
  handleExit(sessionId: string, exitCode: number | null = null): void {
    const row = this.rows().find((each) => each.sessionId === sessionId)
    if (!row) return
    if (row.command === null) return this.remove(sessionId)
    if (row.exited === 1) return
    this.db.prepare('UPDATE terminals SET exited = 1, exit_code = ? WHERE session_id = ?').run(exitCode, sessionId)
    this.changed()
    this.settle(sessionId, exitCode)
  }

  // Finished commands stay while the daemon still holds their output.
  reconcile(sessions: readonly SessionInfo[]): void {
    const known = new Map(sessions.map((session) => [session.sessionId, session]))
    for (const row of this.rows()) {
      const session = known.get(row.sessionId)
      if (!session || (session.exited && row.command === null)) this.remove(row.sessionId)
      else if (session.exited && row.exited === 0) this.handleExit(row.sessionId, session.exitCode)
    }
  }

  private remove(sessionId: string): void {
    if (this.db.prepare('DELETE FROM terminals WHERE session_id = ?').run(sessionId).changes > 0) this.changed()
    this.settle(sessionId, null)
  }

  private changed(): void {
    this.emit(this.list())
  }
}
