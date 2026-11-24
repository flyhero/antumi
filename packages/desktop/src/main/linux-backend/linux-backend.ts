import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { CoreEndpoint } from '@antumi/protocol'
import type { LinuxBackendProblem } from '../../shared/backend-location'
import type { LinuxArch } from './bundled-archive'
import type { LinuxResult, LinuxTarget } from './linux-target'
import { findLinuxExecutable, loginEnvironment } from './login-environment'
import { ensureManagedNode, MANAGED_NODE, type FetchNode } from './managed-node'

// Daemon and core running on another Linux machine, for this app to be their client
// (docs/WSL.md 安装和启动, docs/REMOTE.md): the Node it must have, the backend's files put there,
// and the two started the way backend.ts starts them here. Whatever reaches the machine (wsl.exe,
// ssh) is the target's business; this asks it through the target alone.

// The archive pack-linux-backend.mjs made, as the installer carries it, and the manifest beside it.
export type LinuxBackendArchive = { file: string; sha256: string }

// Where the backend runs there: what a later call needs to ask it something or start more.
export type LinuxBackendPlace = { node: string; dir: string; home: string; path: string }

// The Node the backend is built for and tested on: the major Electron runs it with on every other
// platform. An older one lacks what core imports (node:sqlite unflagged, zstd in node:zlib).
const MIN_NODE = [24, 0] as const
// A cold distro boots first, and core loads everything before it listens: on a first start in WSL
// that took over 30s. Only for as long as the core started runs; one that is gone fails at once.
const START_WAIT_MS = 180_000
// From launch until its process shows: wsl.exe or ssh still starting the shell that execs it.
const EXIT_GRACE_MS = 5_000
const INSTALL_TIMEOUT_MS = 120_000
const CONTROL_TIMEOUT_MS = 30_000

export function nodeIsNewEnough(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\./.exec(version.trim())
  if (!match?.[1] || !match[2]) return false
  const major = Number(match[1])
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && Number(match[2]) >= MIN_NODE[1])
}

export const said = (result: LinuxResult) => (result.stderr.trim() || result.stdout.trim() || `exit ${String(result.code)}`).slice(-600)

// Writes the archive from stdin, checks it against the manifest, and only then lets the folder be
// found under its name: a folder with .ready in it is whole. $1 is the folder's name, $2 the hash.
const INSTALL_SCRIPT = [
  'set -e',
  'umask 077',
  'root="$HOME/.antumi/backend"',
  'dir="$root/$1"',
  'tmp="$root/.$1.$$"',
  'mkdir -p "$root"',
  // What an install that was cut short left behind.
  'rm -rf "$root/.$1".*',
  'cat > "$tmp.tar.gz"',
  'echo "$2  $tmp.tar.gz" | sha256sum -c - > /dev/null',
  'mkdir "$tmp"',
  // As root, tar keeps the archive's owner: CI's uid, some other account here, which could then
  // rewrite what root runs.
  'tar -xzf "$tmp.tar.gz" -C "$tmp" --no-same-owner',
  'rm -f "$tmp.tar.gz"',
  ': > "$tmp/.ready"',
  'rm -rf "$dir"',
  'mv "$tmp" "$dir"'
].join('\n')

// Removes the folders of other builds, but for one a process still runs from: a daemon kept for
// the sessions it runs, or an MCP server an agent started from it. Likewise the Node versions
// Antumi installed for other builds. $1 is this build's folder, $2 the Node version it installs.
const TIDY_SCRIPT = [
  'tidy() {',
  '  root=$1',
  '  for dir in "$root"/*/; do',
  '    dir=${dir%/}',
  '    [ -d "$dir" ] || continue',
  '    [ "$dir" = "$root/$2" ] && continue',
  '    grep -q -a -F -- "$dir/" /proc/[0-9]*/cmdline 2>/dev/null && continue',
  '    rm -rf "$dir"',
  '  done',
  '}',
  'tidy "$HOME/.antumi/backend" "$1"',
  'tidy "$HOME/.antumi/node" "$2"'
].join('\n')

const Started = z.object({ start: z.array(z.enum(['daemon', 'core'])) })
const Endpoint = z.object({ endpoint: CoreEndpoint.nullable(), coreRunning: z.boolean().optional() })
const Check = z.object({ node: z.string(), arch: z.string(), pty: z.union([z.literal(true), z.string()]) })

// One of backend-control's answers: the last line it printed, as JSON. Null when it gave none.
async function control<T>(target: LinuxTarget, place: LinuxBackendPlace, schema: z.ZodType<T>, command: string[]): Promise<{ answer: T | null; result: LinuxResult }> {
  const result = await target.run([place.node, `${place.dir}/backend-control.mjs`, ...command], { env: { PATH: place.path }, timeoutMs: CONTROL_TIMEOUT_MS })
  const line = result.stdout.trim().split('\n').at(-1) ?? ''
  let parsed: unknown = null
  try {
    parsed = JSON.parse(line)
  } catch {
    return { answer: null, result }
  }
  const answer = schema.safeParse(parsed)
  return { answer: answer.success ? answer.data : null, result }
}

export type FindNodeOptions = {
  // The login PATH as the search should see it: WSL leaves out the Windows one under /mnt.
  searchPath?: (path: string) => string
  // The machine's architecture, for the Node installed where it has none new enough; without it
  // such a machine is a problem to report.
  arch?: LinuxArch
  // This app's way to that Node when the machine cannot download it.
  fetchNode?: FetchNode | null
}

// The machine's login shell, and a Node new enough to run the backend from `folder`: the one on
// its PATH, else one installed for it. Nothing of the backend is installed or started by asking.
export async function findLinuxBackendPlace(target: LinuxTarget, folder: string, options: FindNodeOptions = {}): Promise<{ ok: true; place: LinuxBackendPlace } | { ok: false; problem: LinuxBackendProblem }> {
  const problem = (found: LinuxBackendProblem) => ({ ok: false as const, problem: found })
  const login = await loginEnvironment(target)
  if (!login) return problem({ kind: 'login-environment' })
  const node = await findLinuxExecutable(target, 'node', options.searchPath ? options.searchPath(login.path) : login.path)
  if (node.status === 'unknown') return problem({ kind: 'start', detail: 'could not look for node' })
  const version = node.status === 'found' ? (await target.run([node.path, '--version'])).stdout.trim() : null
  const place = (found: string) => ({ ok: true as const, place: { node: found, dir: `${login.home}/.antumi/backend/${folder}`, home: login.home, path: login.path } })
  if (node.status === 'found' && version !== null && nodeIsNewEnough(version)) return place(node.path)
  if (options.arch) {
    const managed = await ensureManagedNode(target, login.home, options.arch, options.fetchNode ?? null)
    return managed.ok ? place(managed.node) : problem({ kind: 'node-download', detail: managed.detail })
  }
  return problem(node.status === 'found' ? { kind: 'node-old', version: version ?? '', path: node.path } : { kind: 'node-missing' })
}

// A rebuilt archive of the same version is another folder, so it is installed too.
export const backendFolder = (version: string, archive: LinuxBackendArchive) => `${version}-${archive.sha256.slice(0, 12)}`

async function install(target: LinuxTarget, place: LinuxBackendPlace, folder: string, archive: LinuxBackendArchive): Promise<LinuxBackendProblem | null> {
  const ready = await target.run(['/bin/sh', '-c', 'test -f "$1"', 'sh', `${place.dir}/.ready`])
  if (ready.code === 0) return null
  if (ready.code !== 1) return { kind: 'install', detail: said(ready) }
  let bytes: Buffer
  try {
    bytes = await readFile(archive.file)
  } catch (error) {
    return { kind: 'install', detail: String(error) }
  }
  const done = await target.run(['/bin/sh', '-c', INSTALL_SCRIPT, 'sh', folder, archive.sha256], { input: bytes, timeoutMs: INSTALL_TIMEOUT_MS })
  return done.code === 0 ? null : { kind: 'install', detail: done.timedOut ? 'timed out' : said(done) }
}

// Starts one of them the way launch() in backend.ts does: so that quitting the app never touches it.
export async function launchLinuxBackend(target: LinuxTarget, place: LinuxBackendPlace, name: 'daemon' | 'core'): Promise<void> {
  await target.launch(name, [place.node, `${place.dir}/${name}.mjs`], { PATH: place.path, ANTUMI_MCP_JS: `${place.dir}/mcp.mjs` })
}

// The core serving that machine's home, if one answers there. Null when none does or it could not
// be asked.
export async function linuxCoreEndpoint(target: LinuxTarget, place: LinuxBackendPlace): Promise<CoreEndpoint | null> {
  return (await control(target, place, Endpoint, ['endpoint'])).answer?.endpoint ?? null
}

// The daemon of another build, replaced once it runs nothing: replaceOldDaemon() for that machine.
// `keepNewer` for a machine several apps reach, whose newer daemon stays (docs/REMOTE.md 版本).
export async function replaceOldLinuxDaemon(target: LinuxTarget, place: LinuxBackendPlace, version: string, keepNewer = false): Promise<void> {
  const { answer } = await control(target, place, Started, ['replace-daemon', version, ...(keepNewer ? ['--keep-newer'] : [])])
  for (const name of answer?.start ?? []) await launchLinuxBackend(target, place, name)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type LinuxBackendOptions = {
  target: LinuxTarget
  place: LinuxBackendPlace
  // The app's version: the backend of any other is asked to leave, as backend.ts does here.
  version: string
  archive: LinuxBackendArchive
  // Names the machine after the log's path when core does not come up: " in Ubuntu".
  where?: string
  // A machine several apps reach keeps a backend newer than this app's (docs/REMOTE.md 版本).
  keepNewer?: boolean
  startWaitMs?: number
  exitGraceMs?: number
}

// ensureBackend() for that machine: installs this build's backend if it is not there, asks an
// older one to leave under the same rules, starts what is missing and waits for core to answer.
export async function ensureLinuxBackend(options: LinuxBackendOptions): Promise<{ ok: true; endpoint: CoreEndpoint } | { ok: false; problem: LinuxBackendProblem }> {
  const { target, place } = options
  const folder = backendFolder(options.version, options.archive)
  const failed = await install(target, place, folder, options.archive)
  if (failed) return { ok: false, problem: failed }

  const check = await control(target, place, Check, ['check'])
  if (!check.answer) return { ok: false, problem: { kind: 'start', detail: said(check.result) } }
  if (check.answer.pty !== true) return { ok: false, problem: { kind: 'pty', detail: check.answer.pty } }

  const prepared = await control(target, place, Started, ['prepare', options.version, ...(options.keepNewer ? ['--keep-newer'] : [])])
  if (!prepared.answer) return { ok: false, problem: { kind: 'start', detail: said(prepared.result) } }
  try {
    for (const name of prepared.answer.start) await launchLinuxBackend(target, place, name)
  } catch (error) {
    return { ok: false, problem: { kind: 'start', detail: String(error) } }
  }

  const launched = Date.now()
  const until = launched + (options.startWaitMs ?? START_WAIT_MS)
  const log = `${place.home}/.antumi/logs/core.log${options.where ?? ''}`
  for (;;) {
    const { answer } = await control(target, place, Endpoint, ['endpoint'])
    if (answer?.endpoint) {
      // After the start, so what was just asked to leave has left; nothing depends on it.
      await target.run(['/bin/sh', '-c', TIDY_SCRIPT, 'sh', folder, MANAGED_NODE.version])
      return { ok: true, endpoint: answer.endpoint }
    }
    // Only the core started here: one left running from before may be another build's.
    const gone = prepared.answer.start.includes('core') && answer?.coreRunning === false && Date.now() - launched >= (options.exitGraceMs ?? EXIT_GRACE_MS)
    if (gone) return { ok: false, problem: { kind: 'start', detail: `core exited before it listened; see ${log}` } }
    if (Date.now() >= until) return { ok: false, problem: { kind: 'start', detail: `core did not come up; see ${log}` } }
    await sleep(500)
  }
}
