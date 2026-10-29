import { agentCliAccess } from './agent-cli-access'
import { execFile } from 'node:child_process'
import { access, constants, stat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { agentCliInstallations } from './agent-cli-installation'
import { adapterOf } from './agents'
import { launchFile, nodeLaunchHost } from '@antumi/protocol/node'
import { AGENT_KINDS, agentDescriptor, ENVIRONMENT_TOOLS, isAgentKind, type DetectedAgent, type Environment, type EnvironmentCheck, type EnvironmentTool } from '@antumi/protocol'

const execFileAsync = promisify(execFile)

const VERSION_TIMEOUT_MS = 5_000
// Looked again only when asked, or this long after: an install does not come and go.
const RESULT_TTL_MS = 5 * 60_000
// What a CLI on Windows is called, in the order a shell tries them.
const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat', '.ps1']

type Discoverable = { id: string; name: string; commands: readonly string[]; applications: Partial<Record<NodeJS.Platform, readonly string[]>> }

// Add a product here when its executable or application bundle can be identified reliably.
// Integration into Antumi's chat is separate from discovery: an agent Antumi runs is found through
// its adapter's discovery instead.
const OTHER_AGENTS: readonly Discoverable[] = [
  { id: 'windsurf', name: 'Windsurf', commands: [], applications: { darwin: ['Windsurf.app'] } },
  { id: 'kiro', name: 'Kiro', commands: [], applications: { darwin: ['Kiro.app'] } },
  { id: 'aider', name: 'Aider', commands: ['aider'], applications: {} },
  { id: 'copilot', name: 'GitHub Copilot CLI', commands: ['copilot'], applications: {} },
  { id: 'goose', name: 'Goose', commands: ['goose'], applications: { darwin: ['Goose.app'] } },
  { id: 'amp', name: 'Amp', commands: ['amp'], applications: {} }
]

function discoverable(): Discoverable[] {
  const known = AGENT_KINDS.flatMap((kind) => {
    const discovery = adapterOf(kind).discovery
    return discovery ? [{ id: kind, name: agentDescriptor(kind).label, ...discovery }] : []
  })
  return [...known, ...OTHER_AGENTS.filter((agent) => !known.some((each) => each.id === agent.id))]
}

type Options = {
  // What the agents are started with: core's own PATH, which the daemon shares.
  pathEnv: string
  platform: NodeJS.Platform
  // Whether the tool has an account to run with; left out for one that has none to have.
  signedIn: Partial<Record<EnvironmentTool, () => Promise<boolean>>>
  applicationDirs?: string[]
  now?: () => number
  changed?: (environment: Environment) => void
}

// The first of the directories holding an executable of that name; null when none does.
export async function findOnPath(name: string, pathEnv: string, platform: NodeJS.Platform): Promise<string | null> {
  const names = platform === 'win32' ? WINDOWS_EXTENSIONS.map((extension) => `${name}${extension}`) : [name]
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    for (const file of names) {
      const candidate = join(dir, file)
      // Windows has no execute bit; existing is as much as can be asked.
      const executable = await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK).then(() => true, () => false)
      if (executable) return candidate
    }
  }
  return null
}

// "git version 2.39.3", "2.1.263 (Claude Code)", "codex-cli 0.156.1": the first dotted triple.
export function parseVersion(output: string): string | null {
  return /\d+\.\d+\.\d+/.exec(output)?.[0] ?? null
}

async function discoverOtherAgents(pathEnv: string, platform: NodeJS.Platform, applicationDirs: string[]): Promise<DetectedAgent[]> {
  const discovered = await Promise.all(discoverable().map(async ({ id, name, commands, applications }) => {
    const commandPaths = await Promise.all(commands.map((command) => findOnPath(command, pathEnv, platform)))
    const commandPath = commandPaths.find((path): path is string => path !== null)
    const appNames = applications[platform] ?? []
    const appPaths = await Promise.all(appNames.flatMap((app) => applicationDirs.map(async (dir) => {
      const path = join(dir, app)
      if (platform === 'darwin') return await access(join(path, 'Contents', 'Info.plist')).then(() => path, () => null)
      const info = await stat(path).catch(() => null)
      return info?.isFile() && (platform === 'win32' || Boolean(info.mode & 0o111)) ? path : null
    })))
    const locations: DetectedAgent['locations'] = [
      ...commandPaths.filter((path): path is string => path !== null).map((path) => ({ source: 'cli' as const, path })),
      ...appPaths.filter((path): path is string => path !== null).map((path) => ({ source: 'application' as const, path }))
    ]
    return locations.length > 0 ? {
      id, name, locations,
      ...(commandPath && !(isAgentKind(id) && agentCliAccess.blocked(id)) ? { cliCheck: isAgentKind(id) ? await agentCliAccess.use(id, () => probeAgentCli(commandPath, platform)).catch(() => undefined) : await probeAgentCli(commandPath, platform) } : {})
    } : null
  }))
  return discovered.filter((agent): agent is DetectedAgent => agent !== null)
}

// How to ask a found file its version without a shell, or null for a Windows shim that only a
// shell could run.
function versionLaunch(file: string, platform: NodeJS.Platform) {
  if (platform === 'win32' && /\.ps1$/i.test(file)) return null
  try {
    return launchFile(file, ['--version'], process.env, { ...nodeLaunchHost, platform })
  } catch {
    return null
  }
}

async function probeAgentCli(file: string, platform: NodeJS.Platform): Promise<NonNullable<DetectedAgent['cliCheck']>> {
  const launch = versionLaunch(file, platform)
  if (!launch) return { status: 'unverified', version: null, reason: 'windows-shim' }
  try {
    const { stdout, stderr } = await execFileAsync(launch.file, launch.args, {
      env: launch.env,
      timeout: VERSION_TIMEOUT_MS,
      maxBuffer: 16 * 1024,
      windowsHide: true
    })
    return { status: 'responded', version: parseVersion(`${stdout}\n${stderr}`), reason: null }
  } catch {
    return { status: 'unverified', version: null, reason: 'probe-failed' }
  }
}

// Keeps the last look at the machine, so the sidebar and the settings page read one answer.
export class EnvironmentService {
  private last: Environment | null = null
  private pending: Promise<Environment> | null = null
  private timer: NodeJS.Timeout | null = null
  private readonly now: () => number

  constructor(private readonly options: Options) {
    this.now = options.now ?? Date.now
  }

  check(refresh = false): Promise<Environment> {
    // An explicit refresh after installation must not reuse a look that started before it.
    if (this.pending) return refresh ? this.pending.then(() => this.check(true)) : this.pending
    if (!refresh && this.last && this.now() - this.last.checkedAt < RESULT_TTL_MS) return Promise.resolve(this.last)
    this.pending = this.look().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  // A newly installed CLI or app becomes visible without restarting core. The manual refresh
  // still runs immediately; background checks are infrequent because --version starts binaries.
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.check(true).catch((error: unknown) => console.error('[antumi-core] agent discovery failed', error))
    }, RESULT_TTL_MS)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async look(): Promise<Environment> {
    const { pathEnv, platform } = this.options
    const applicationDirs = this.options.applicationDirs ?? (
      platform === 'darwin' ? ['/Applications', join(homedir(), 'Applications')] :
        platform === 'win32' ? [
          ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Programs')] : []),
          ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((dir): dir is string => Boolean(dir))
        ] : platform === 'linux' ? ['/usr/share', '/opt', '/usr/bin', '/usr/local/bin', join(homedir(), '.local/share'), join(homedir(), '.local/bin'), join(homedir(), 'Applications')] : []
    )
    const [checks, otherAgents] = await Promise.all([
      Promise.all(ENVIRONMENT_TOOLS.map((tool) => this.checkTool(tool))),
      discoverOtherAgents(pathEnv, platform, applicationDirs)
    ])
    const detectedAgents: DetectedAgent[] = [
      ...checks.flatMap((check) => {
        if (check.tool === 'git' || !check.path) return []
        const discovered = otherAgents.find((agent) => agent.id === check.tool)
        return [{
          ...discovered,
          id: check.tool,
          name: agentDescriptor(check.tool).label,
          locations: [...(discovered?.locations ?? []), ...(!discovered?.locations.some((location) => location.source === 'cli' && location.path === check.path) ? [{ source: 'cli' as const, path: check.path }] : [])]
        }]
      }),
      ...otherAgents.filter((agent) => !checks.some((check) => check.tool === agent.id && check.path))
    ]
    const previous = this.last
    const cliInstallations = agentCliInstallations({ checks, detectedAgents }, platform)
    this.last = { checks, detectedAgents, cliInstallations, searchPath: pathEnv.split(delimiter).filter(Boolean), checkedAt: this.now() }
    if (!previous || JSON.stringify({ checks: previous.checks, detectedAgents: previous.detectedAgents, searchPath: previous.searchPath }) !==
      JSON.stringify({ checks, detectedAgents, searchPath: this.last.searchPath })) this.options.changed?.(this.last)
    return this.last
  }

  private async checkTool(tool: EnvironmentTool): Promise<EnvironmentCheck> {
    if (isAgentKind(tool)) {
      if (agentCliAccess.blocked(tool)) return this.last?.checks.find((check) => check.tool === tool) ?? { tool, status: 'unknown', path: null, version: null, signedIn: null }
      return agentCliAccess.use(tool, () => this.detectTool(tool))
    }
    return this.detectTool(tool)
  }

  private async detectTool(tool: EnvironmentTool): Promise<EnvironmentCheck> {
    const { pathEnv, platform, signedIn } = this.options
    const detect = isAgentKind(tool) ? adapterOf(tool).detect : undefined
    if (detect) return { tool, ...await detect(pathEnv, platform) }
    const path = await findOnPath(tool, pathEnv, platform)
    if (!path) return { tool, status: 'missing', version: null, path: null, signedIn: null }
    const version = await this.version(path)
    return {
      tool,
      status: version === null ? 'unknown' : 'ok',
      version,
      path,
      signedIn: signedIn[tool] ? await signedIn[tool]().catch(() => null) : null,
      ...(version === null ? { problem: 'probe-failed' as const } : {})
    }
  }

  private async version(file: string): Promise<string | null> {
    // A shim only a shell could run goes unasked rather than through one.
    const launch = versionLaunch(file, this.options.platform)
    if (!launch) return null
    try {
      const { stdout } = await execFileAsync(launch.file, launch.args, { env: launch.env, timeout: VERSION_TIMEOUT_MS, windowsHide: true })
      return parseVersion(stdout)
    } catch {
      return null
    }
  }
}
