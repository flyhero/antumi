import type { CoreEndpoint } from '@antumi/protocol'
import type { WslBackendProblem } from '../../shared/backend-location'
import {
  backendFolder,
  ensureLinuxBackend,
  findLinuxBackendPlace,
  launchLinuxBackend,
  linuxCoreEndpoint,
  replaceOldLinuxDaemon,
  type LinuxBackendArchive,
  type LinuxBackendPlace
} from '../linux-backend/linux-backend'
import type { FetchNode } from '../linux-backend/managed-node'
import { nodeWslHost, runInDistro, type WslHost } from './wsl-command'
import { listDistros } from './wsl-distros'
import { linuxSearchPath } from './wsl-login-environment'
import { wslTarget } from './wsl-target'

// Daemon and core running inside a WSL distro, for the app on Windows to be their client
// (docs/WSL.md, 安装和启动): what WSL and the distro must be, then the steps every Linux machine
// takes (linux-backend.ts), with wsl.exe as the way in.

export { backendFolder, nodeIsNewEnough } from '../linux-backend/linux-backend'

export type WslBackendArchive = LinuxBackendArchive

// Where the backend runs in the distro: what a later call needs to ask it something or start more.
export type WslBackendPlace = LinuxBackendPlace & { distro: string }

export type WslBackendOptions = {
  distro: string
  // The app's version: the backend of any other is asked to leave, as backend.ts does here.
  version: string
  archive: WslBackendArchive
  host?: WslHost
  // This app's way to Node for a distro that has none new enough and cannot download it.
  fetchNode?: FetchNode | null
  startWaitMs?: number
  exitGraceMs?: number
}

export type WslBackendStart = { ok: true; place: WslBackendPlace; endpoint: CoreEndpoint } | { ok: false; problem: WslBackendProblem }

// The distro as the backend needs it: there, WSL 2, x64, with a login shell, and a Node new enough:
// its own, else the one Antumi installs there.
export async function findWslBackendPlace(distro: string, folder: string, host: WslHost = nodeWslHost, fetchNode: FetchNode | null = null): Promise<{ ok: true; place: WslBackendPlace } | { ok: false; problem: WslBackendProblem }> {
  const problem = (found: WslBackendProblem) => ({ ok: false as const, problem: found })
  const listed = await listDistros(host)
  if (listed.status === 'unavailable') return problem({ kind: 'wsl-unavailable' })
  if (listed.status === 'unknown') return problem({ kind: 'wsl-unknown', detail: listed.reason })
  const entry = listed.distros.find((each) => each.name.toLowerCase() === distro.toLowerCase())
  if (!entry) return problem({ kind: 'distro-missing', distro })
  if (entry.version !== 2) return problem({ kind: 'distro-wsl1', distro: entry.name })

  const arch = (await runInDistro(entry.name, ['/bin/uname', '-m'], { host })).stdout.trim()
  if (arch !== 'x86_64') return problem(arch ? { kind: 'arch', arch } : { kind: 'wsl-unknown', detail: 'uname gave no answer' })
  const found = await findLinuxBackendPlace(wslTarget(entry.name, host), folder, { searchPath: linuxSearchPath, arch: 'x64', fetchNode })
  if (!found.ok) return problem(found.problem.kind === 'start' ? { kind: 'wsl-unknown', detail: found.problem.detail } : found.problem)
  return { ok: true, place: { ...found.place, distro: entry.name } }
}

export function launchInWsl(place: WslBackendPlace, name: 'daemon' | 'core', host: WslHost = nodeWslHost): Promise<void> {
  return launchLinuxBackend(wslTarget(place.distro, host), place, name)
}

// The core serving the distro's home, if one answers there. Null when none does or it could not
// be asked.
export function wslCoreEndpoint(place: WslBackendPlace, host: WslHost = nodeWslHost): Promise<CoreEndpoint | null> {
  return linuxCoreEndpoint(wslTarget(place.distro, host), place)
}

// The daemon of another build, replaced once it runs nothing: replaceOldDaemon() for the distro.
export function replaceOldWslDaemon(place: WslBackendPlace, version: string, host: WslHost = nodeWslHost): Promise<void> {
  return replaceOldLinuxDaemon(wslTarget(place.distro, host), place, version)
}

// ensureBackend() for the distro: installs this build's backend if it is not there, asks an older
// one to leave under the same rules, starts what is missing and waits for core to answer.
export async function ensureWslBackend(options: WslBackendOptions): Promise<WslBackendStart> {
  const host = options.host ?? nodeWslHost
  const found = await findWslBackendPlace(options.distro, backendFolder(options.version, options.archive), host, options.fetchNode ?? null)
  if (!found.ok) return found
  const { place } = found
  const started = await ensureLinuxBackend({
    target: wslTarget(place.distro, host),
    place,
    version: options.version,
    archive: options.archive,
    where: ` in ${place.distro}`,
    ...(options.startWaitMs === undefined ? {} : { startWaitMs: options.startWaitMs }),
    ...(options.exitGraceMs === undefined ? {} : { exitGraceMs: options.exitGraceMs })
  })
  return started.ok ? { ok: true, place, endpoint: started.endpoint } : started
}
