import { ChildProcess, type SpawnOptions } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { backendFolder, ensureWslBackend, findWslBackendPlace, nodeIsNewEnough, replaceOldWslDaemon } from './wsl-backend'
import { MANAGED_NODE } from '../linux-backend/managed-node'
import type { WslHost } from './wsl-command'

type Reply = { code?: number; stdout?: string; stderr?: string }
// What a call asked of the distro: the program and its arguments after --exec, the Linux env set
// for it, and what it was fed.
type Call = { argv: string[]; env: Record<string, string>; input: string; options: SpawnOptions; launching: boolean }

class FakeChild extends ChildProcess {
  unreffed = false
  override unref(): void {
    this.unreffed = true
  }
}

// A Windows machine whose wsl.exe answers from `answer`; a call it returns nothing for exits 0.
function windows(answer: (call: Call) => Reply | undefined) {
  const calls: Call[] = []
  const host: WslHost = {
    platform: 'win32',
    env: { SystemRoot: 'C:\\Windows' },
    isFile: (file) => file === 'C:\\Windows\\System32\\wsl.exe' || file === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    spawn(_file, args, options) {
      const child = new FakeChild()
      const launching = args.includes('-EncodedCommand')
      function command(args: string[]): { argv: string[]; env: Record<string, string> } {
        const exec = args.indexOf('--exec')
        const rest = exec === -1 ? args : args.slice(exec + 1)
        const env: Record<string, string> = {}
        if (rest[0] !== '/usr/bin/env') return { argv: rest, env }
        const first = rest.findIndex((each, index) => index > 0 && !/^[A-Z_]+=/.test(each))
        for (const each of rest.slice(1, first)) env[each.slice(0, each.indexOf('='))] = each.slice(each.indexOf('=') + 1)
        return { argv: rest.slice(first), env }
      }
      const call: Call = { ...command(args), input: '', options, launching }
      calls.push(call)
      if (options.stdio === 'ignore') return child
      const stdin = new PassThrough()
      child.stdin = stdin
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      const chunks: Buffer[] = []
      stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
      stdin.on('finish', () => {
        call.input = Buffer.concat(chunks).toString()
        if (launching) Object.assign(call, command(JSON.parse(call.input).args))
        const reply = answer(call) ?? {}
        child.stdout?.emit('data', Buffer.from(reply.stdout ?? ''))
        child.stderr?.emit('data', Buffer.from(reply.stderr ?? ''))
        child.emit('close', reply.code ?? 0, null)
      })
      return child
    }
  }
  return { host, calls }
}

const LIST = '  NAME      STATE           VERSION\n* Ubuntu    Running         2\n  Old       Stopped         1\n'
const NODE = '/home/me/.nvm/versions/node/v24.21.0/bin/node'
const LOGIN_PATH = `/home/me/.nvm/versions/node/v24.21.0/bin:/usr/bin:/bin:/mnt/c/Program Files/x`

// A distro with everything in place; `over` answers first for what a test changes.
function distro(over: (call: Call) => Reply | undefined = () => undefined) {
  return windows((call) => {
    const changed = over(call)
    if (changed) return changed
    const [program, ...args] = call.argv
    if (program === '--list') return { stdout: LIST }
    if (program === '/bin/uname') return { stdout: 'x86_64\n' }
    // The login environment's script is handed its marker and prints between the lines it names.
    if (program === '/bin/sh' && args[1]?.includes('getent passwd')) {
      const mark = args[3] ?? ''
      return { stdout: `${mark}/bin/bash\nbanner\n${mark}path\n${LOGIN_PATH}\n${mark}home\n/home/me\n${mark}end\n` }
    }
    if (program === '/bin/sh' && args[1] === 'command -v "$1"') return { stdout: `${NODE}\n` }
    if (program === NODE && args[0] === '--version') return { stdout: 'v24.21.0\n' }
    if (program === '/bin/sh' && args[1] === 'test -f "$1"') return { code: 1 }
    if (program === NODE && args[1] === 'check') return { stdout: '{"node":"v24.21.0","arch":"x64","pty":true}\n' }
    if (program === NODE && args[1] === 'prepare') return { stdout: '{"start":["daemon","core"]}\n' }
    if (program === NODE && args[1] === 'endpoint') return { stdout: '{"endpoint":{"port":4100,"token":"t","pid":9,"protocolVersion":1,"version":"1.2.3"}}\n' }
    return undefined
  })
}

function archive() {
  const file = join(mkdtempSync(join(tmpdir(), 'antumi-wsl-backend-')), 'backend-linux-x64.tar.gz')
  writeFileSync(file, 'archive bytes')
  return { file, sha256: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' }
}

describe('nodeIsNewEnough', () => {
  it('wants 24 or later', () => {
    expect(['v24.0.0', 'v24.21.0', 'v25.8.1', '26.0.0'].map(nodeIsNewEnough)).toEqual([true, true, true, true])
    expect(['v22.14.0', 'v23.11.0', 'v18.19.1', '', 'node'].map(nodeIsNewEnough)).toEqual([false, false, false, false, false])
  })
})

describe('findWslBackendPlace', () => {
  it('names where the backend goes, by the login shell', async () => {
    const { host } = distro()
    expect(await findWslBackendPlace('ubuntu', '1.2.3-abc', host)).toEqual({
      ok: true,
      place: { distro: 'Ubuntu', node: NODE, dir: '/home/me/.antumi/backend/1.2.3-abc', home: '/home/me', path: LOGIN_PATH }
    })
  })

  it('says what the distro lacks', async () => {
    const problem = async (name: string, over?: (call: Call) => Reply | undefined) => {
      const found = await findWslBackendPlace(name, 'x', distro(over).host)
      return found.ok ? null : found.problem
    }
    expect(await problem('Fedora')).toEqual({ kind: 'distro-missing', distro: 'Fedora' })
    expect(await problem('Old')).toEqual({ kind: 'distro-wsl1', distro: 'Old' })
    expect(await problem('Ubuntu', (call) => (call.argv[0] === '--list' ? { code: 1, stdout: 'broken' } : undefined))).toMatchObject({ kind: 'wsl-unknown' })
    expect(await problem('Ubuntu', (call) => (call.argv[0] === '/bin/uname' ? { stdout: 'aarch64\n' } : undefined))).toEqual({ kind: 'arch', arch: 'aarch64' })
    expect(await problem('Ubuntu', (call) => (call.argv[2]?.includes('getent passwd') ? { stdout: 'nothing' } : undefined))).toEqual({ kind: 'login-environment' })
    // Without a Node new enough, the one Antumi installs; here it could not be.
    expect(await problem('Ubuntu', (call) => (call.argv[2] === 'command -v "$1"' ? { code: 127 } : undefined))).toMatchObject({ kind: 'node-download' })
    expect(await problem('Ubuntu', (call) => (call.argv[1] === '--version' ? { stdout: 'v18.19.1\n' } : undefined))).toMatchObject({ kind: 'node-download' })
  })

  it('runs on the Node it installs where the distro has none new enough', async () => {
    const managed = `/home/me/.antumi/node/${MANAGED_NODE.version}/node`
    const { host } = distro((call) => {
      if (call.argv[2] === 'command -v "$1"') return { code: 127 }
      if (call.argv[2]?.includes('.archive.')) return { stdout: `${managed}\n` }
      return undefined
    })
    const found = await findWslBackendPlace('Ubuntu', 'x', host)
    expect(found.ok && found.place.node).toBe(managed)
  })

  it('is unavailable without wsl.exe', async () => {
    const { host } = distro()
    expect(await findWslBackendPlace('Ubuntu', 'x', { ...host, platform: 'darwin' })).toEqual({ ok: false, problem: { kind: 'wsl-unavailable' } })
  })
})

describe('ensureWslBackend', () => {
  it('installs, starts what is asked for hidden, and answers with the core it finds', async () => {
    const { host, calls } = distro()
    const packed = archive()
    const folder = backendFolder('1.2.3', packed)
    const started = await ensureWslBackend({ distro: 'Ubuntu', version: '1.2.3', archive: packed, host })
    expect(started).toMatchObject({ ok: true, endpoint: { port: 4100, token: 't' }, place: { dir: `/home/me/.antumi/backend/${folder}` } })

    const install = calls.find((call) => call.argv[2]?.includes('sha256sum -c'))
    expect(install?.argv.slice(3)).toEqual(['sh', folder, packed.sha256])
    expect(install?.input).toBe('archive bytes')

    const prepare = calls.find((call) => call.argv[2] === 'prepare')
    expect(prepare?.argv).toEqual([NODE, `/home/me/.antumi/backend/${folder}/backend-control.mjs`, 'prepare', '1.2.3'])
    expect(prepare?.env).toEqual({ PATH: LOGIN_PATH })

    const launches = calls.filter((call) => call.launching)
    expect(launches.map((call) => call.argv.slice(3))).toEqual([
      ['sh', 'daemon', NODE, `/home/me/.antumi/backend/${folder}/daemon.mjs`],
      ['sh', 'core', NODE, `/home/me/.antumi/backend/${folder}/core.mjs`]
    ])
    expect(launches.every((call) => call.options.detached !== true && call.options.windowsHide === true)).toBe(true)
    expect(launches[0]?.env).toEqual({ PATH: LOGIN_PATH, ANTUMI_MCP_JS: `/home/me/.antumi/backend/${folder}/mcp.mjs` })

    // Other builds' folders are cleared once core answers, this one's named to be kept.
    const tidy = calls.at(-1)
    expect(tidy?.argv[2]).toContain('/proc/[0-9]*/cmdline')
    expect(tidy?.argv.slice(3)).toEqual(['sh', folder, MANAGED_NODE.version])
  })

  it('leaves a whole install as it is and starts nothing a current backend does not need', async () => {
    const { host, calls } = distro((call) => {
      if (call.argv[2] === 'test -f "$1"') return { code: 0 }
      if (call.argv[2] === 'prepare') return { stdout: '{"start":[]}\n' }
      return undefined
    })
    expect((await ensureWslBackend({ distro: 'Ubuntu', version: '1.2.3', archive: archive(), host })).ok).toBe(true)
    expect(calls.some((call) => call.argv[2]?.includes('sha256sum -c'))).toBe(false)
    expect(calls.some((call) => call.launching)).toBe(false)
  })

  it('stops at what went wrong', async () => {
    const problem = async (over: (call: Call) => Reply | undefined) => {
      const started = await ensureWslBackend({ distro: 'Ubuntu', version: '1.2.3', archive: archive(), host: distro(over).host, startWaitMs: 0 })
      return started.ok ? null : started.problem
    }
    expect(await problem((call) => (call.argv[2]?.includes('sha256sum -c') ? { code: 1, stderr: 'sha256sum: WARNING: 1 computed checksum did NOT match\n' } : undefined))).toEqual({ kind: 'install', detail: 'sha256sum: WARNING: 1 computed checksum did NOT match' })
    expect(await problem((call) => (call.argv[2] === 'check' ? { stdout: '{"node":"v24.21.0","arch":"x64","pty":"GLIBC_2.38 not found"}\n' } : undefined))).toEqual({ kind: 'pty', detail: 'GLIBC_2.38 not found' })
    expect(await problem((call) => (call.argv[2] === 'prepare' ? { code: 1, stderr: 'boom' } : undefined))).toEqual({ kind: 'start', detail: 'boom' })
    expect(await problem((call) => (call.launching ? { code: 1, stderr: 'Access is denied' } : undefined))).toEqual({ kind: 'start', detail: 'Error: wsl-launch: Access is denied' })
    expect(await problem((call) => (call.argv[2] === 'endpoint' ? { stdout: '{"endpoint":null}\n' } : undefined))).toMatchObject({ kind: 'start', detail: expect.stringContaining('/home/me/.antumi/logs/core.log') })
  })

  it('waits for a core that is still loading, and not for one that is gone', async () => {
    const LOADING = { stdout: '{"endpoint":null,"coreRunning":true}\n' }
    const GONE = { stdout: '{"endpoint":null,"coreRunning":false}\n' }
    let polls = 0
    const slow = distro((call) => (call.argv[2] === 'endpoint' && ++polls < 3 ? LOADING : undefined))
    expect(await ensureWslBackend({ distro: 'Ubuntu', version: '1.2.3', archive: archive(), host: slow.host, startWaitMs: 60_000, exitGraceMs: 0 })).toMatchObject({ ok: true, endpoint: { port: 4100 } })
    expect(polls).toBe(3)

    const gone = distro((call) => (call.argv[2] === 'endpoint' ? GONE : undefined))
    const exited = await ensureWslBackend({ distro: 'Ubuntu', version: '1.2.3', archive: archive(), host: gone.host, startWaitMs: 60_000, exitGraceMs: 0 })
    expect(exited).toMatchObject({ ok: false, problem: { kind: 'start', detail: expect.stringContaining('core exited before it listened; see /home/me/.antumi/logs/core.log in Ubuntu') } })

    // A core this start did not launch may be another build's, which this one cannot see.
    const kept = distro((call) => (call.argv[2] === 'prepare' ? { stdout: '{"start":[]}\n' } : call.argv[2] === 'endpoint' ? GONE : undefined))
    const waited = await ensureWslBackend({ distro: 'Ubuntu', version: '1.2.3', archive: archive(), host: kept.host, startWaitMs: 0, exitGraceMs: 0 })
    expect(waited).toMatchObject({ ok: false, problem: { detail: expect.stringContaining('core did not come up') } })
  })

  it('fails the install when the archive is not there', async () => {
    const started = await ensureWslBackend({ distro: 'Ubuntu', version: '1.2.3', archive: { file: join(tmpdir(), 'antumi-no-such-archive.tar.gz'), sha256: 'ab' }, host: distro().host })
    expect(started).toMatchObject({ ok: false, problem: { kind: 'install' } })
  })
})

describe('replaceOldWslDaemon', () => {
  it('starts a daemon only when the old one left', async () => {
    const place = { distro: 'Ubuntu', node: NODE, dir: '/home/me/.antumi/backend/x', home: '/home/me', path: LOGIN_PATH }
    const left = distro((call) => (call.argv[2] === 'replace-daemon' ? { stdout: '{"start":["daemon"]}\n' } : undefined))
    await replaceOldWslDaemon(place, '1.2.3', left.host)
    expect(left.calls.filter((call) => call.launching).map((call) => call.argv[4])).toEqual(['daemon'])
    const stayed = distro((call) => (call.argv[2] === 'replace-daemon' ? { stdout: '{"start":[]}\n' } : undefined))
    await replaceOldWslDaemon(place, '1.2.3', stayed.host)
    expect(stayed.calls.some((call) => call.launching)).toBe(false)
  })
})
