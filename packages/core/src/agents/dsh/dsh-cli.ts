import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { agentDescriptor, DSH_CONFIG_ENV, type AgentCliInstallation, type ChatCatalog } from '@antumi/protocol'
import { launchFile, nodeLaunchHost, parseWindowsShim, resolveCommand, type Launch, type LaunchHost } from '@antumi/protocol/node'
import { findOnPath } from '../../environment-check'
import { Rejection } from '../../rejection'
import { AcpDriver } from '../acp/acp-driver'
import { probeChatCatalog } from '../../chat-catalog'
import type { AgentDetection, AgentStage } from '../agent-adapter'
import { dshDialect } from './dsh-dialect'
import { DSH_PROVIDER_ENV, dshCommand } from './dsh-command'

const execute = promisify(execFile)
const prepares = new Map<string, Promise<void>>()
const installCommand = agentDescriptor('dsh').environment.install
const NpmManifest = z.object({
  name: z.literal('@deepseek-ai/dsh'),
  bin: z.union([z.string(), z.object({ dsh: z.string() })])
})

async function launchOutput(launch: Launch, timeout = 10_000): Promise<string> {
  return (await execute(launch.file, launch.args, { env: launch.env, timeout, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout
}

type DshProbe = { host: LaunchHost; output(launch: Launch): Promise<string> }

async function versionOf(command: string, env: NodeJS.ProcessEnv, probe: DshProbe): Promise<string | null> {
  let printed: string
  try {
    printed = (await probe.output(launchFile(command, ['--version'], env, probe.host))).trim()
  } catch {
    return null
  }
  return /^v?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(printed) ? printed.replace(/^v/, '') : null
}

function checkedDsh(command: string, version: string | null): AgentDetection {
  return {
    status: version === null ? 'unknown' : 'ok', version, path: command, signedIn: null,
    ...(version === null ? { problem: 'probe-failed' as const } : {})
  }
}

function isNpmDsh(candidate: string, host: LaunchHost): boolean {
  const contents = host.read(candidate)
  const shim = contents === null ? null : parseWindowsShim(contents)
  if (shim?.kind !== 'node') return false
  const dir = path.win32.dirname(candidate)
  const root = path.win32.join(dir, 'node_modules', '@deepseek-ai', 'dsh')
  try {
    const manifest = NpmManifest.safeParse(JSON.parse(host.read(path.win32.join(root, 'package.json')) ?? 'null'))
    if (!manifest.success) return false
    const bin = manifest.data.bin
    const entry = path.win32.resolve(root, typeof bin === 'string' ? bin : bin.dsh).toLowerCase()
    return entry.startsWith(root.toLowerCase() + '\\') && entry === path.win32.resolve(dir, shim.script).toLowerCase()
  } catch {
    return false
  }
}

async function detectWindowsDsh(pathEnv: string, probe: DshProbe): Promise<AgentDetection> {
  const dirs = pathEnv.split(';').map((dir) => dir.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean)
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH')),
    PATH: dirs.join(';')
  }
  const command = resolveCommand('dsh', process.cwd(), { PATH: env.PATH, PATHEXT: '.EXE;.CMD;.BAT;.PS1' }, probe.host)
  if (!command) return { status: 'missing', version: null, path: null, signedIn: null }
  const desktop = command.toLowerCase().endsWith('\\resources\\runtime\\cli\\bin\\dsh.cmd')
    && probe.host.read(command)?.toLowerCase().includes('\\@deepseek-ai\\dsh-desktop-host\\lib\\cli.js')
  if (!desktop) return checkedDsh(command, await versionOf(command, env, probe))

  // A registered Desktop launcher can hide a global npm install further down PATH.
  let failed: AgentDetection | undefined
  for (const dir of dirs) {
    if (!path.win32.isAbsolute(dir)) continue
    const candidate = path.win32.join(dir, 'dsh.cmd')
    if (!isNpmDsh(candidate, probe.host)) continue
    const check = checkedDsh(candidate, await versionOf(candidate, env, probe))
    if (check.status === 'ok') return check
    failed ??= check
  }
  return failed ?? { ...checkedDsh(command, null), requiresStandaloneCli: true }
}

export async function detectDsh(pathEnv: string, platform: NodeJS.Platform, probe: DshProbe = { host: { ...nodeLaunchHost, platform }, output: launchOutput }): Promise<AgentDetection> {
  if (platform === 'win32') return detectWindowsDsh(pathEnv, probe)
  const command = await findOnPath('dsh', pathEnv, platform)
  return command
    ? checkedDsh(command, await versionOf(command, process.env, probe))
    : { status: 'missing', version: null, path: null, signedIn: null }
}

export async function requireDsh(): Promise<string> {
  const check = await detectDsh(process.env.PATH ?? '', process.platform)
  if (check.path === null) throw new Rejection('dsh-cli-missing', '未找到 DeepSeek Harness，请安装后重新检测')
  if (check.requiresStandaloneCli) throw new Rejection('dsh-standalone-cli-required', `检测到 DeepSeek Harness 桌面版，请运行 ${installCommand}`)
  if (check.problem === 'probe-failed') throw new Rejection('dsh-version-probe-failed', '无法检测 DeepSeek Harness 版本，请检查 CLI 能否正常启动')
  return check.path
}

export function dshInstallation(platform: NodeJS.Platform): AgentCliInstallation | null {
  return platform === 'win32' || platform === 'darwin' || platform === 'linux'
    ? { agent: 'dsh', shell: platform === 'win32' ? 'powershell' : 'bash', command: installCommand } : null
}

export function bundledDsh(): string {
  const packaged = fileURLToPath(new URL('./plugins/dsh/runtime.tgz', import.meta.url))
  return existsSync(packaged) ? packaged : fileURLToPath(new URL('../../../../dsh-runtime/dist/runtime.tgz', import.meta.url))
}

export async function prepareDshProfile(command: string, bundle = bundledDsh(), home = process.env.DSH_HOME || path.join(homedir(), '.dsh')): Promise<void> {
  const hash = createHash('sha256').update(await readFile(bundle).catch(() => { throw new Rejection('dsh-runtime-missing', 'DeepSeek Harness 运行时插件缺失，请重新构建或安装 Antumi') })).digest('hex')
  const key = `${home}:${hash}`
  const pending = prepares.get(key)
  if (pending) return pending
  const preparation = (async () => {
    const profile = path.join(home, 'profiles', 'antumi')
    const marker = path.join(profile, '.antumi-runtime')
    const installed = path.join(profile, 'node_modules', '@antumi', 'dsh-runtime', 'package.json')
    if ((await readFile(marker, 'utf8').catch(() => '')) === hash && existsSync(installed)) return
    try {
      await launchOutput(launchFile(command, ['plugin', '--profile', 'antumi', 'add', bundle], { ...process.env, DSH_HOME: home }), 180_000)
    } catch {
      throw new Rejection('dsh-runtime-install-failed', 'DeepSeek Harness 运行时准备失败，请检查网络和 pnpm 后重试；已有配置已保留')
    }
    const manifest = z.looseObject({ name: z.literal('@antumi/dsh-runtime') }).safeParse(JSON.parse(await readFile(installed, 'utf8')))
    if (!manifest.success) throw new Rejection('dsh-runtime-install-failed', 'DeepSeek Harness 未能安装 Antumi 运行时插件，请重试')
    await writeFile(marker, hash, { mode: 0o600 })
  })()
  prepares.set(key, preparation)
  try { await preparation } finally { prepares.delete(key) }
}

const DSH_SKILLS_OVERLAY = `- id: skill-filesystem
  config:
    customSkillDirs: !!js JSON.parse(process.env.${DSH_CONFIG_ENV} || '{}').skills || []
`
const DSH_PROVIDER_OVERLAY = `- id: llm-pi-ai
  config:
    providers: !!js "(() => { const providers = JSON.parse(process.env.${DSH_PROVIDER_ENV} || '{}'); for (const provider of Object.values(providers)) { if (provider.headers?.authorization) provider.headers.authorization = 'Bearer ' + (process.env.ANTUMI_MODEL_PROVIDER_KEY || ''); } return providers; })()"
`

export function dshOverlay(useAntumiProvider: boolean): string {
  // A DSH patch replaces the whole config, so native sessions must not patch llm-pi-ai.
  return useAntumiProvider ? DSH_SKILLS_OVERLAY + DSH_PROVIDER_OVERLAY : DSH_SKILLS_OVERLAY
}

export async function prepareDsh(stage: AgentStage, useAntumiProvider: boolean): Promise<{ command: string; args: string[] }> {
  const command = await requireDsh()
  await prepareDshProfile(command)
  const directory = path.join(stage.sessionsRoot, stage.conversationId, 'dsh')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const overlay = path.join(directory, `overlay-${stage.stageId}.yml`)
  await writeFile(overlay, dshOverlay(useAntumiProvider), { mode: 0o600 })
  return { command, args: ['--patch', overlay] }
}

export async function dshCatalog(cwd: string): Promise<ChatCatalog | null> {
  const command = await requireDsh()
  await prepareDshProfile(command)
  const launch = dshCommand({ providerSessionId: null, resume: false, handoffPath: null, extraProjects: [] })
  return probeChatCatalog(new AcpDriver(dshDialect, 'catalog', { cwd, extraDirs: [], resume: null }, true), { ...launch, command }, cwd)
}
