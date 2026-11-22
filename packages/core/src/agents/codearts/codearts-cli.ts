import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AgentCliInstallation, ChatCatalog } from '@antumi/protocol'
import { findOnPath, parseVersion } from '../../environment-check'
import { probeChatCatalog } from '../../chat-catalog'
import { Rejection } from '../../rejection'
import { codeartsBridgeCommand } from '../../codearts-bridge-command'
import type { AgentDetection } from '../agent-adapter'
import { AcpDriver } from '../acp/acp-driver'
import { codeartsDialect } from './codearts-dialect'

const execute = promisify(execFile)
const INSTALL_SCRIPT = 'https://cnnorth4-cloudide-marketplace.obs.cn-north-4.myhuaweicloud.com/codearts/cli_tui/install_script'

// Where its installer puts the launcher, under the home folder. A function: the adapter reads it as
// it loads, which may be before this module has run.
export function codeartsInstallers(): string {
  return path.join('.codeartsdoer', 'installers')
}

// What its launcher script sets before it runs the executable beside it, for that executable to
// find its config and data. Less NODE_TLS_REJECT_UNAUTHORIZED=0, which the script also sets: it
// turns off certificate checks for everything the CLI fetches.
export function codeartsEnv(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): Record<string, string> {
  const config = path.join(home, '.codeartsdoer')
  return {
    package_tag: 'undefined',
    CODEAGENT_USE_MESSAGE_FEEDBACK: 'false',
    OMO_SEND_ANONYMOUS_TELEMETRY: '0',
    SCENARIO: 'codeartsdoer',
    KERNEL_DATA_DIR: path.join(config, 'cli-data'),
    KERNEL_STATE_DIR: env.KERNEL_STATE_DIR || path.join(config, 'state'),
    KERNEL_CONFIG_DIR: config,
    OPENCODE_CHANNEL: 'latest',
    OPENCODE_CONFIG: path.join(config, 'codearts_cli.json'),
    OPENCODE_CONFIG_FILE: 'codearts_cli.json,codearts_cli.jsonc',
    OPENCODE_MODE: 'tui',
    PLUGIN_ENV: 'hc',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_DISABLE_AUTOUPDATE: 'true',
    OPENCODE_ALWAYS_NOTIFY_UPDATE: 'false'
  }
}

const isFile = (file: string) => stat(file).then((info) => info.isFile(), () => false)

// Its launcher, found on PATH or where the installer puts it, and the executable the installer
// puts in bin/ beside it. Antumi runs the executable itself: on Windows the launcher is a batch
// file, which only cmd.exe can start. A launcher elsewhere (a wrapper of the user's) leads to the
// installer's own.
export async function findCodearts(pathEnv: string, platform: NodeJS.Platform, home = os.homedir()): Promise<{ launcher: string; executable: string } | null> {
  const onPath = await findOnPath('codearts', pathEnv, platform)
  const installed = path.join(home, codeartsInstallers(), platform === 'win32' ? 'codearts.cmd' : 'codearts')
  for (const candidate of [onPath, installed]) {
    if (!candidate) continue
    const launcher = await realpath(candidate).catch(() => null)
    if (!launcher) continue
    const executable = path.join(path.dirname(launcher), 'bin', platform === 'win32' ? 'codearts.exe' : 'codearts')
    if (await isFile(executable)) return { launcher, executable }
  }
  return null
}

async function codeartsVersion(executable: string): Promise<string | null> {
  const result = await execute(executable, ['--version'], { env: { ...process.env, ...codeartsEnv() }, timeout: 15_000, maxBuffer: 1024 * 1024, windowsHide: true }).catch(() => null)
  return parseVersion(result?.stdout ?? '')
}

// Outside its TUI, which alone signs in on the web, it starts only with an access key in its
// environment (CODEARTS_CLI_AK/SK, or Huawei Cloud's HW_ACCESS_KEY/HW_SECRET_KEY): whether it has
// one is whether it can run here, not whether it was ever signed in.
export function codeartsSignedIn(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.CODEARTS_CLI_AK && env.CODEARTS_CLI_SK) || (env.HW_ACCESS_KEY && env.HW_SECRET_KEY))
}

export async function detectCodearts(pathEnv: string, platform: NodeJS.Platform): Promise<AgentDetection> {
  const found = await findCodearts(pathEnv, platform)
  if (!found) return { status: 'missing', version: null, path: null, signedIn: null }
  const version = await codeartsVersion(found.executable)
  const signedIn = codeartsSignedIn()
  return version ? { status: 'ok', version, path: found.launcher, signedIn } : { status: 'unknown', version: null, path: found.launcher, signedIn, problem: 'probe-failed' }
}

export async function requireCodearts(): Promise<string> {
  const found = await findCodearts(process.env.PATH ?? '', process.platform)
  if (!found) throw new Rejection('codearts-cli-missing', '未找到 CodeArts（码道 CLI），请安装后重新检测')
  return found.executable
}

// The bridge's own command, given the executable it starts its server with.
export function codeartsBridge(executable: string, env: Record<string, string> = {}) {
  const bridge = codeartsBridgeCommand()
  return { command: bridge.command, args: [...bridge.args, '--codearts', executable], env: { ...codeartsEnv(), ...bridge.env, ...env } }
}

export async function codeartsCatalog(cwd: string): Promise<ChatCatalog | null> {
  return probeChatCatalog(new AcpDriver(codeartsDialect, 'catalog', { cwd, extraDirs: [], resume: null }), codeartsBridge(await requireCodearts()), cwd)
}

// Its official install scripts (码道 CLI 用户指南, 安装).
export function codeartsInstallation(platform: NodeJS.Platform): AgentCliInstallation | null {
  if (platform === 'win32') return { agent: 'codearts', shell: 'powershell', command: `irm ${INSTALL_SCRIPT}/install.ps1 | iex` }
  if (platform === 'darwin' || platform === 'linux') return { agent: 'codearts', shell: 'bash', command: `sh -c "$(curl -L ${INSTALL_SCRIPT}/install.sh)"` }
  return null
}
