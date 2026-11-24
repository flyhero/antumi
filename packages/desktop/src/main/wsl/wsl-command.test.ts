import { ChildProcess, type SpawnOptions } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeWslOutput, distroArgs, launchInDistro, runInDistro, runWsl, spawnInDistro, wslExecutable, type WslHost } from './wsl-command'

class FakeChild extends ChildProcess {
  signals: (NodeJS.Signals | number | undefined)[] = []
  input: Buffer[] = []
  inputEnded = false
  constructor() {
    super()
    const stdin = new PassThrough()
    stdin.on('data', (chunk: Buffer) => this.input.push(chunk))
    stdin.on('finish', () => { this.inputEnded = true })
    this.stdin = stdin
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
  }
  override kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(signal)
    return true
  }
  finish(code: number | null, stdout: Uint8Array | string = '', stderr: Uint8Array | string = ''): void {
    this.stdout?.emit('data', Buffer.from(stdout))
    this.stderr?.emit('data', Buffer.from(stderr))
    this.emit('close', code, null)
  }
}

type Spawned = { file: string; args: string[]; options: SpawnOptions; child: FakeChild }

// A Windows machine whose env spells SystemRoot and WSL_UTF8 in its own case, as Windows may.
function windowsHost(env: NodeJS.ProcessEnv = { SYSTEMROOT: 'D:\\Win', Path: 'C:\\bin', wsl_utf8: '0' }) {
  const spawned: Spawned[] = []
  const host: WslHost = {
    platform: 'win32',
    env,
    isFile: (file) => ['D:\\Win', 'C:\\Windows'].some((root) => file === `${root}\\System32\\wsl.exe` || file === `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`),
    spawn(file, args, options) {
      const child = new FakeChild()
      spawned.push({ file, args, options, child })
      return child
    }
  }
  const last = (): Spawned => {
    const found = spawned.at(-1)
    if (!found) throw new Error('nothing spawned')
    return found
  }
  return { host, spawned, last }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('wslExecutable', () => {
  it('is System32\\wsl.exe under SystemRoot in whatever case Windows spells it', () => {
    expect(wslExecutable(windowsHost().host)).toBe('D:\\Win\\System32\\wsl.exe')
  })

  it('falls back to C:\\Windows without SystemRoot', () => {
    expect(wslExecutable(windowsHost({}).host)).toBe('C:\\Windows\\System32\\wsl.exe')
  })

  it('is null off Windows, or with no wsl.exe file', () => {
    expect(wslExecutable({ ...windowsHost().host, platform: 'linux' })).toBeNull()
    expect(wslExecutable({ ...windowsHost().host, isFile: () => false })).toBeNull()
  })
})

describe('distroArgs', () => {
  it('names the distro and runs the program with --exec, never --', () => {
    expect(distroArgs('Ubuntu', ['/bin/echo', '$HOME', 'a b'])).toEqual(['-d', 'Ubuntu', '--exec', '/bin/echo', '$HOME', 'a b'])
    expect(distroArgs(null, ['cat'])).toEqual(['--exec', 'cat'])
  })

  it('sets Linux env through /usr/bin/env after --exec', () => {
    expect(distroArgs('Ubuntu', ['node', 'core.mjs'], { PATH: '/usr/bin:/bin', ANTUMI_HOME: '/home/me/.antumi' }))
      .toEqual(['-d', 'Ubuntu', '--exec', '/usr/bin/env', 'PATH=/usr/bin:/bin', 'ANTUMI_HOME=/home/me/.antumi', 'node', 'core.mjs'])
  })

  it('refuses what would be read as something else', () => {
    expect(() => distroArgs('Ubuntu', [])).toThrow('wsl-empty-command')
    expect(() => distroArgs('-e', ['ls'])).toThrow('wsl-bad-distro')
    expect(() => distroArgs('', ['ls'])).toThrow('wsl-bad-distro')
    expect(() => distroArgs('Ubuntu', ['ls'], { 'A=B': 'c' })).toThrow('wsl-bad-env-name')
  })
})

describe('decodeWslOutput', () => {
  const utf16 = (text: string) => Buffer.from(text, 'utf16le')

  it('reads UTF-16LE with and without a BOM', () => {
    expect(decodeWslOutput(Buffer.concat([Buffer.from([0xff, 0xfe]), utf16('Ubuntu\r\n')]))).toBe('Ubuntu\r\n')
    expect(decodeWslOutput(utf16('  NAME  STATE\r\n* Ubuntu  Running  2\r\n'))).toBe('  NAME  STATE\r\n* Ubuntu  Running  2\r\n')
  })

  it('reads UTF-16LE that is not ASCII, including a code unit with a zero low byte', () => {
    expect(decodeWslOutput(utf16('一个分发版'))).toBe('一个分发版')
    expect(decodeWslOutput(utf16('没有'))).toBe('没有')
  })

  it('reads UTF-8, with or without a BOM', () => {
    expect(decodeWslOutput(Buffer.from('/home/我\n'))).toBe('/home/我\n')
    expect(decodeWslOutput(Buffer.from('\uFEFFok'))).toBe('ok')
    expect(decodeWslOutput(Buffer.alloc(0))).toBe('')
  })
})

describe('runInDistro', () => {
  afterEach(() => vi.useRealTimers())

  it('runs the absolute wsl.exe from the system root, hidden, with WSL_UTF8 set once', async () => {
    const { host, last } = windowsHost()
    const result = runInDistro('Ubuntu', ['/usr/bin/id', '-u'], { host, env: { LANG: 'C.UTF-8' } })
    const { file, args, options, child } = last()
    expect(file).toBe('D:\\Win\\System32\\wsl.exe')
    expect(args).toEqual(['-d', 'Ubuntu', '--exec', '/usr/bin/env', 'LANG=C.UTF-8', '/usr/bin/id', '-u'])
    expect(options.cwd).toBe('D:\\Win')
    expect(options.windowsHide).toBe(true)
    expect(options.detached).toBeUndefined()
    expect(options.env).toEqual({ SYSTEMROOT: 'D:\\Win', Path: 'C:\\bin', WSL_UTF8: '1' })
    child.finish(0, '1000\n')
    expect(await result).toEqual({ code: 0, stdout: '1000\n', stderr: '', timedOut: false })
  })

  it('writes input to stdin and ends it, and ends it empty without input', async () => {
    const { host, spawned } = windowsHost()
    const secret = runInDistro('Ubuntu', ['/bin/sh', '-c', 'cat > token'], { host, input: 'tok-123' })
    const plain = runInDistro('Ubuntu', ['true'], { host })
    await flush()
    const [first, second] = spawned
    expect(Buffer.concat(first?.child.input ?? []).toString()).toBe('tok-123')
    expect(first?.args).not.toContain('tok-123')
    expect(first?.child.inputEnded).toBe(true)
    expect(second?.child.input).toEqual([])
    expect(second?.child.inputEnded).toBe(true)
    first?.child.finish(0)
    second?.child.finish(0)
    await Promise.all([secret, plain])
  })

  it('resolves a failure with its code and decodes wsl.exe UTF-16 errors', async () => {
    const { host, last } = windowsHost()
    const result = runInDistro('Gone', ['ls'], { host })
    last().child.finish(4294967295, '', Buffer.from('There is no distribution with the supplied name.\r\n', 'utf16le'))
    expect(await result).toEqual({ code: 4294967295, stdout: '', stderr: 'There is no distribution with the supplied name.\r\n', timedOut: false })
  })

  it('kills wsl.exe and resolves when it runs past the timeout', async () => {
    vi.useFakeTimers()
    const { host, last } = windowsHost()
    const result = runInDistro('Ubuntu', ['sleep', '60'], { host, timeoutMs: 500 })
    vi.advanceTimersByTime(499)
    expect(last().child.signals).toEqual([])
    vi.advanceTimersByTime(1)
    expect(last().child.signals).toEqual([undefined])
    expect(await result).toEqual({ code: null, stdout: '', stderr: '', timedOut: true })
  })

  it('resolves when wsl.exe cannot be started', async () => {
    const { host, last } = windowsHost()
    const result = runInDistro('Ubuntu', ['ls'], { host })
    last().child.emit('error', new Error('spawn EACCES'))
    expect(await result).toMatchObject({ code: null, stderr: 'Error: spawn EACCES', timedOut: false })
  })

  it('spawns nothing off Windows', async () => {
    const { host, spawned } = windowsHost()
    expect(await runInDistro('Ubuntu', ['ls'], { host: { ...host, platform: 'darwin' } })).toEqual({ code: null, stdout: '', stderr: 'wsl.exe not found', timedOut: false })
    expect(spawned).toEqual([])
  })
})

describe('runWsl', () => {
  it('runs wsl.exe commands of its own with the same cwd and env', async () => {
    const { host, last } = windowsHost()
    const result = runWsl(['--list', '--verbose'], { host })
    const { args, options } = last()
    expect(args).toEqual(['--list', '--verbose'])
    expect(options.cwd).toBe('D:\\Win')
    expect(options.env?.WSL_UTF8).toBe('1')
    last().child.finish(0, 'x')
    expect((await result).stdout).toBe('x')
  })
})

describe('launchInDistro', () => {
  afterEach(() => vi.useRealTimers())

  it('waits for a hidden launcher with the distro arguments only on stdin', async () => {
    const { host, last } = windowsHost()
    let finished = false
    const started = launchInDistro('Ubuntu', ['node', '/home/me/.antumi/backend/1.0.0/core.mjs'], { host, env: { PATH: '/home/me/.nvm/bin:/usr/bin' } }).then(() => { finished = true })
    const { file, args, options } = last()
    expect(file).toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    await flush()
    expect(finished).toBe(false)
    expect(JSON.parse(Buffer.concat(last().child.input).toString())).toEqual({
      file: 'D:\\Win\\System32\\wsl.exe',
      args: ['-d', 'Ubuntu', '--exec', '/usr/bin/env', 'PATH=/home/me/.nvm/bin:/usr/bin', 'node', '/home/me/.antumi/backend/1.0.0/core.mjs'],
      cwd: 'D:\\Win'
    })
    expect(options).toEqual({
      cwd: 'D:\\Win',
      env: { SYSTEMROOT: 'D:\\Win', Path: 'C:\\bin', WSL_UTF8: '1' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    last().child.emit('exit', 0, null)
    await started
    expect(finished).toBe(true)
    expect(last().child.stdout?.destroyed).toBe(true)
    expect(last().child.stderr?.destroyed).toBe(true)
  })

  it('keeps metacharacters, Unicode, empty arguments and multiline scripts as data', async () => {
    const { host, last } = windowsHost()
    const argv = ['printf', '', '中文', 'a"b', 'trail\\', '$HOME', '%PATH%', "'; Stop-Process -Id $PID; '", 'one\ntwo']
    const result = launchInDistro(null, argv, { host, env: { ANTUMI_TEST: 'value " $ % \n' } })
    await flush()
    expect(JSON.parse(Buffer.concat(last().child.input).toString()).args).toEqual(distroArgs(null, argv, { ANTUMI_TEST: 'value " $ % \n' }))
    expect(last().args.join(' ')).not.toContain('Stop-Process')
    expect(last().args.join(' ')).not.toContain('ANTUMI_TEST')
    last().child.finish(0)
    await result
  })

  it('reports launcher errors instead of waiting for a backend that was never launched', async () => {
    const { host, last } = windowsHost()
    const failed = launchInDistro('Ubuntu', ['node', 'core.mjs'], { host })
    last().child.finish(1, '', 'Access is denied\r\n')
    await expect(failed).rejects.toThrow('wsl-launch: Access is denied')
  })

  it('rejects a missing launcher and times out a stuck one', async () => {
    const { host } = windowsHost()
    await expect(launchInDistro('Ubuntu', ['true'], { host: { ...host, isFile: (file) => file.endsWith('wsl.exe') } })).rejects.toThrow('wsl-launcher-not-found')
    vi.useFakeTimers()
    const stuck = windowsHost()
    const result = launchInDistro('Ubuntu', ['true'], { host: stuck.host })
    const rejected = expect(result).rejects.toThrow('wsl-launch: timed out')
    vi.advanceTimersByTime(15_000)
    await rejected
    expect(stuck.last().child.signals).toEqual([undefined])
  })
})

describe('spawnInDistro', () => {
  it('pipes a tunnel with no encoding on its streams', () => {
    const { host, last } = windowsHost()
    spawnInDistro(null, ['node', 'tunnel.mjs'], { host })
    const { args, options, child } = last()
    expect(args).toEqual(['--exec', 'node', 'tunnel.mjs'])
    expect(options).toEqual({ cwd: 'D:\\Win', env: { SYSTEMROOT: 'D:\\Win', Path: 'C:\\bin', WSL_UTF8: '1' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    expect(child.stdout?.readableEncoding).toBeNull()
  })

  it('throws without wsl.exe', () => {
    const { host } = windowsHost()
    expect(() => spawnInDistro('Ubuntu', ['ls'], { host: { ...host, platform: 'linux' } })).toThrow('wsl-not-found')
  })
})
