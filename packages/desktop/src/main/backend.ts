import { spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  antumiPaths,
  backendToStart,
  daemonToStart,
  runningCore,
  stopBackendForInstall as stopBackendForInstallAt,
  type BackendStop,
  type InstallBlocker
} from '@antumi/protocol/node'
import { loginShellPath } from './login-shell-path'

const START_WAIT_MS = 15_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type { BackendStop, InstallBlocker }

// The rules themselves are in backend-lifecycle, which a backend inside WSL runs too.
export function stopBackendForInstall(): Promise<BackendStop> {
  return stopBackendForInstallAt(app.getVersion())
}

async function launch(names: ('daemon' | 'core')[]): Promise<void> {
  const logs = join(antumiPaths().home, 'logs')
  mkdirSync(logs, { recursive: true, mode: 0o700 })
  const backend = join(process.resourcesPath, 'backend')
  const env = {
    // Without Windows' own Path, which a PATH beside it would leave the children to pick between.
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')),
    PATH: await loginShellPath(),
    // The Electron binary doubles as the Node that runs them; each strips or scopes the flag
    // before anything of the user's inherits it.
    ELECTRON_RUN_AS_NODE: '1',
    ANTUMI_MCP_JS: join(backend, 'mcp.mjs')
  }
  for (const name of names) {
    const log = openSync(join(logs, `${name}.log`), 'a')
    spawn(process.execPath, [join(backend, `${name}.mjs`)], {
      env,
      detached: true,
      // Detached on Windows means a console of its own, which would stay open on screen.
      windowsHide: true,
      stdio: ['ignore', log, log]
    }).unref()
  }
}

// One at a time: a check that overlapped a start could launch a second daemon beside it.
let backendWork: Promise<void> = Promise.resolve()
function serialized(work: () => Promise<void>): Promise<void> {
  backendWork = backendWork.then(work, work)
  return backendWork
}

// Starts daemon and core from the app's bundled copies when none serve this home yet, or when
// the ones that do are of another build: an app updated in place would otherwise keep talking to
// what it found, and lack whatever the update put there. The daemon only goes when it runs nothing. Both are detached with their own
// logs: closing the window or quitting the app never touches them, exactly as when they run from
// source. A daemon already serving the socket makes the spawned one exit by itself
// (endpoint-claim), so starting one is safe to over-ask.
export function ensureBackend(): Promise<void> {
  if (!app.isPackaged) return Promise.resolve()
  return serialized(async () => {
    const names = await backendToStart(app.getVersion())
    if (names.length === 0) return
    await launch(names)
    // The renderer retries on its own; waiting here only surfaces a start that never lands.
    const until = Date.now() + START_WAIT_MS
    while (Date.now() < until) {
      if (await runningCore()) return
      await sleep(300)
    }
    console.error(`[antumi] core did not come up; see ${join(antumiPaths().home, 'logs', 'core.log')}`)
  })
}

// A daemon an update left running still runs from the old bundle, which a macOS update renamed
// and then trashed: it asks for folder access again under that name, and the old code keeps serving. Busy
// at launch, it is asked again while the app runs, and replaced once it runs nothing. A daemon that
// is gone altogether (it crashed, or was killed) is started again too. Core reconnects to the new
// one by itself.
export function replaceOldDaemon(): Promise<void> {
  if (!app.isPackaged) return Promise.resolve()
  return serialized(async () => {
    if (await daemonToStart(app.getVersion())) await launch(['daemon'])
  })
}
