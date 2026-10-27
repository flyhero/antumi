import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { AgentCliInstallation } from '@antumi/protocol'
import { antumiHome } from '@antumi/protocol/node'
import { Rejection } from '../../rejection'
import type { AgentDetection } from '../agent-adapter'

// Google publishes the server only as a zip in the ACP registry (agentclientprotocol/registry,
// antigravity-acp), with no checksums: each archive is pinned by the hash Antumi verified. The
// server finds its harness, localharness_external, beside itself.
export const ANTIGRAVITY_VERSION = '1.4.1'
const RELEASES = 'https://dl.google.com/agy-extensions/releases'

type Pin = { archive: string; sha256: string; server: string }
const PINS: Record<string, Pin> = {
  'darwin-arm64': { archive: 'macos/agy-acp-server-1.4.1-darwin-arm64.zip', sha256: 'f9bdd68291ae78c38d2141e63bc86b84e6cc7b9f60f71652c68435a7943deb17', server: 'agy_acp_server.par' },
  'darwin-x64': { archive: 'macos/agy-acp-server-1.4.1-darwin-x86_64.zip', sha256: '27e31f096874704f14167b07ef9e84cc77134615ee41d024f7b1c957add85307', server: 'agy_acp_server.par' },
  'linux-x64': { archive: 'linux/agy-acp-server-1.4.1-linux-x86_64.zip', sha256: '2e37012ceb2a5c7fc7309b6e6596234fb637ee3c62a5199f65d4cbe777871384', server: 'agy_acp_server.par' },
  'linux-arm64': { archive: 'linux/agy-acp-server-1.4.1-linux-arm64.zip', sha256: '609336a1c97545487e3ddd55dbd153dc0f40f4e6534486cc1c5f4c0ebb85c2da', server: 'agy_acp_server.par' },
  'win32-x64': { archive: 'windows/agy-acp-server-1.4.1-windows-x86_64.zip', sha256: '5f5b7d0328df17c128b2be338d4567b0d24e56ace8196e88794fec37d1372554', server: 'agy_acp_server.exe' },
  'win32-arm64': { archive: 'windows/agy-acp-server-1.4.1-windows-arm64.zip', sha256: '24c52bbc12aae20f55eb53d373669412d95a9c44fd59be4ea4e355918b91fbf7', server: 'agy_acp_server.exe' }
}

type Host = { platform: NodeJS.Platform; arch: string; home: string }
const thisHost = (): Host => ({ platform: process.platform, arch: process.arch, home: antumiHome() })
const pinOf = (host: Host): Pin | null => PINS[`${host.platform}-${host.arch}`] ?? null

// One folder per version, renamed into place once whole: a folder there is a finished install.
export function antigravityRuntimeDir(host: Host = thisHost()): string {
  return path.join(host.home, 'runtimes', 'antigravity-acp', ANTIGRAVITY_VERSION)
}

// The server this host runs, whether or not it is installed yet; null where Google builds none.
export function antigravityServer(host: Host = thisHost()): string | null {
  const pin = pinOf(host)
  return pin ? path.join(antigravityRuntimeDir(host), pin.server) : null
}

async function installed(host: Host): Promise<string | null> {
  const server = antigravityServer(host)
  if (!server) return null
  const mode = host.platform === 'win32' ? constants.F_OK : constants.X_OK
  const whole = await Promise.all([access(server, mode), access(path.join(path.dirname(server), host.platform === 'win32' ? 'localharness_external.exe' : 'localharness_external'))]).then(() => true, () => false)
  return whole ? server : null
}

// Antumi starts the server keeping its Google sign-in in a file (AGY_ACP_FORCE_FILE_STORAGE) rather
// than the macOS keychain, where reading it for usage would prompt every time.
export async function antigravitySignedIn(file = antigravityTokenFile()): Promise<boolean> {
  return access(file).then(() => true, () => false)
}

export function antigravityTokenFile(geminiHome = process.env.GEMINI_HOME || path.join(homedir(), '.gemini')): string {
  return path.join(geminiHome, 'antigravity-acp', 'acp_token.json')
}

export async function detectAntigravity(_pathEnv: string, platform: NodeJS.Platform, host: Host = { ...thisHost(), platform }): Promise<AgentDetection> {
  const server = await installed(host)
  if (!server) return { status: 'missing', version: null, path: null, signedIn: null }
  return { status: 'ok', version: ANTIGRAVITY_VERSION, path: server, signedIn: await antigravitySignedIn() }
}

export async function requireAntigravity(host: Host = thisHost()): Promise<string> {
  if (!pinOf(host)) throw new Rejection('antigravity-unsupported', 'Antigravity ACP 服务不支持这台电脑的系统或架构')
  const server = await installed(host)
  if (!server) throw new Rejection('antigravity-missing', '未安装 Antigravity ACP 服务，请在 设置 → 外部智能体 里下载')
  return server
}

const quoted = (text: string) => `'${text.replaceAll("'", "'\\''")}'`
const psQuoted = (text: string) => `'${text.replaceAll("'", "''")}'`

// Downloads the pinned archive, refuses one whose hash differs, and unpacks it beside the version
// folder before renaming it into place, so an interrupted install leaves no server to start.
export function antigravityInstallation(platform: NodeJS.Platform, host: Host = { ...thisHost(), platform }): AgentCliInstallation | null {
  const pin = pinOf(host)
  if (!pin) return null
  const url = `${RELEASES}/${pin.archive}`
  const dir = antigravityRuntimeDir(host)
  if (platform === 'win32') {
    return {
      agent: 'antigravity',
      shell: 'powershell',
      command: [
        `$d = ${psQuoted(dir)}; $z = Join-Path $env:TEMP 'agy-acp-${ANTIGRAVITY_VERSION}.zip'`,
        `Invoke-WebRequest ${psQuoted(url)} -OutFile $z`,
        `if ((Get-FileHash $z -Algorithm SHA256).Hash -ne '${pin.sha256.toUpperCase()}') { throw 'Antigravity download checksum mismatch' }`,
        `Remove-Item -Recurse -Force "$d.partial" -ErrorAction SilentlyContinue; Expand-Archive $z "$d.partial"; Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue; Move-Item "$d.partial" $d; Remove-Item $z`
      ].join('; ')
    }
  }
  const sum = platform === 'darwin' ? 'shasum -a 256 -c' : 'sha256sum -c'
  return {
    agent: 'antigravity',
    shell: 'bash',
    command: [
      `d=${quoted(dir)}; z="$(mktemp -d)/agy-acp.zip"`,
      `curl -fL --progress-bar ${quoted(url)} -o "$z"`,
      `echo "${pin.sha256}  $z" | ${sum}`,
      `rm -rf "$d.partial" && mkdir -p "$d.partial" && unzip -q "$z" -d "$d.partial" && rm -rf "$d" && mv "$d.partial" "$d" && rm -f "$z"`
    ].join(' && ')
  }
}
