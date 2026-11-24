// Runs this folder's modules against a real wsl.exe: what the unit tests can only assume about
// Windows (argument quoting, output encodings, exit codes, what starts a distro). Bundled and run
// by plain Node on a Windows machine with WSL 2:
//
//   node wsl-smoke.mjs <distro> [--mutate] [--tunnel <backend-tunnel.mjs>]
//   node wsl-smoke.mjs <distro> --launch, then later --check-launch
//   node wsl-smoke.mjs <distro> --backend <folder of pack-linux-backend's output>, then later --check-backend
//
// --mutate also appends to the distro's ~/.bashrc, to see a login shell's PATH and banner: only
// for a throwaway distro. --tunnel runs the bundled tunnel helper in the distro and sends bytes
// both ways through it.
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { coreUrl, PROTOCOL_VERSION, type CoreEndpoint } from '@antumi/protocol'
import { connectTunnelHelper } from '@antumi/protocol/node'
import { ensureWslBackend, replaceOldWslDaemon, wslCoreEndpoint, type WslBackendPlace } from './wsl-backend'
import { decodeWslOutput, launchInDistro, runInDistro, runWsl, spawnInDistro, wslExecutable } from './wsl-command'
import { isDistroRunning, listDistros, parseDistroList } from './wsl-distros'
import { findLinuxExecutable, loginEnvironment } from './wsl-login-environment'

const distro = process.argv[2] ?? ''
const mutate = process.argv.includes('--mutate')
const tunnelFlag = process.argv.indexOf('--tunnel')
const tunnelFile = tunnelFlag === -1 ? null : (process.argv[tunnelFlag + 1] ?? null)
let failed = 0

function report(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}
const note = (name: string, value: unknown) => console.log(`NOTE  ${name}  ${typeof value === 'string' ? value : JSON.stringify(value)}`)
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// A stand-in for daemon or core: says it started, then stays, writing to a log of its own.
function launchProgram(seconds: number): string[] {
  return ['/bin/sh', '-c', 'log="$HOME/.antumi-smoke/launch-$1.log"; mkdir -p "${log%/*}"; echo "started $HOME" >> "$log"; exec sleep "$1" >> "$log" 2>&1', 'sh', String(seconds)]
}

// --launch starts that stand-in the way the app starts its backend and leaves at once; a later
// --check-launch, from another process, says whether it and its distro outlived this one.
async function launch(): Promise<void> {
  await launchInDistro(distro, launchProgram(901))
  await sleep(3000)
  report('launched', (await runInDistro(distro, ['/usr/bin/pgrep', '-f', 'sleep 901'])).code === 0)
}

async function checkLaunch(): Promise<void> {
  // Asked first: anything else here would start a distro that had stopped.
  const state = await isDistroRunning(distro)
  report('distro still running after the launcher left', state === 'running', state)
  report('launched process still there', (await runInDistro(distro, ['/usr/bin/pgrep', '-f', 'sleep 901'])).code === 0)
  note('its uptime', (await runInDistro(distro, ['/bin/sh', '-c', 'ps -o etimes= -p "$(pgrep -f "sleep 901" | head -1)"'])).stdout.trim())
  await runInDistro(distro, ['/usr/bin/pkill', '-f', 'sleep 901'])
}

async function main(): Promise<void> {
  if (process.argv.includes('--launch')) return launch()
  if (process.argv.includes('--check-launch')) return checkLaunch()
  const backendFlag = process.argv.indexOf('--backend')
  if (backendFlag !== -1) return backend(process.argv[backendFlag + 1] ?? '')
  if (process.argv.includes('--check-backend')) return checkBackend()
  const exe = wslExecutable()
  report('wsl.exe found', exe !== null, exe ?? '')
  if (!exe || !distro) throw new Error('usage: node wsl-smoke.mjs <distro> [--mutate]')

  const listed = await listDistros()
  const mine = listed.status === 'ok' ? listed.distros.find((each) => each.name.toLowerCase() === distro.toLowerCase()) : undefined
  report('listDistros finds the distro as WSL 2', mine?.version === 2, JSON.stringify(listed))

  // Without WSL_UTF8, as an older wsl.exe answers whatever it is told.
  const { WSL_UTF8: _dropped, ...plainEnv } = process.env
  const raw = spawnSync(exe, ['--list', '--verbose'], { env: plainEnv, windowsHide: true })
  note('raw --list bytes', `${raw.stdout.length} bytes, first ${raw.stdout.subarray(0, 4).toString('hex')}`)
  report('decodes --list without WSL_UTF8', parseDistroList(decodeWslOutput(raw.stdout)).some((each) => each.name.toLowerCase() === distro.toLowerCase()))

  const tricky = ['a b', 'quote"d', "single'q", 'back\\slash', 'trail\\', 'two\\\\', '$HOME', '(x86)', 'a;b&c|d', '%PATH%', '中文 ñ', 'tab\there', '--flag', '']
  const echoed = await runInDistro(distro, ['/usr/bin/printf', '%s\\n', ...tricky])
  const lines = echoed.stdout.split('\n').slice(0, tricky.length)
  report('arguments arrive unchanged', echoed.code === 0 && lines.every((line, index) => line === tricky[index]), JSON.stringify(lines.map((line, index) => (line === tricky[index] ? null : [tricky[index], line])).filter(Boolean)))

  const windowsLikePath = '/mnt/c/Program Files (x86)/Some Tool/bin:/usr/local/bin:/usr/bin:/bin'
  const env = await runInDistro(distro, ['/usr/bin/printenv', 'PATH', 'ANTUMI_SMOKE'], { env: { PATH: windowsLikePath, ANTUMI_SMOKE: 'v a"l $x' } })
  report('env with spaces and quotes arrives unchanged', env.stdout === `${windowsLikePath}\nv a"l $x\n`, JSON.stringify(env))

  const folder = (await runInDistro(distro, ['/bin/mktemp', '-d', '/tmp/antumi-wsl-launch-XXXXXX'])).stdout.trim()
  if (!folder.startsWith('/tmp/antumi-wsl-launch-')) throw new Error('could not create launch test folder')
  try {
    const file = `${folder}/arguments`
    const argv = [...tricky, 'line one\nline two', 'slash before quote\\"', 'space and slash \\', 'slash before newline\\\n']
    const value = '中文 "\' $HOME %PATH% ; | &'
    await launchInDistro(distro, ['/bin/sh', '-c', 'file=$1; shift; printf \'%s\\n\' "$@" > "$file"; printf \'%s\\n\' "$PATH" "$ANTUMI_SMOKE" >> "$file"', 'sh', file, ...argv], { env: { PATH: windowsLikePath, ANTUMI_SMOKE: value } })
    let received = ''
    for (let retry = 0; retry < 20; retry++) {
      received = (await runInDistro(distro, ['/bin/cat', file])).stdout
      if (received) break
      await sleep(100)
    }
    report('background launch keeps arguments and env unchanged', received === `${[...argv, windowsLikePath, value].join('\n')}\n`, JSON.stringify(received))
  } finally {
    await runInDistro(distro, ['/bin/rm', '-r', '--', folder])
  }

  const seven = await runInDistro(distro, ['/bin/sh', '-c', 'exit 7'])
  report('exit code passes through', seven.code === 7, String(seven.code))
  note('exit of a missing program', await runInDistro(distro, ['/no/such/program']))
  note('exit for a missing distro', await runInDistro('antumi-no-such-distro', ['/bin/true']))

  const payload = randomBytes(256 * 1024).toString('base64')
  const fed = await runInDistro(distro, ['/usr/bin/sha256sum'], { input: payload })
  report('stdin input arrives whole', fed.stdout.startsWith(sha(Buffer.from(payload))), fed.stderr)

  const began = Date.now()
  const slow = await runInDistro(distro, ['/bin/sleep', '31'], { timeoutMs: 1500 })
  report('timeout resolves promptly', slow.timedOut && Date.now() - began < 5000, `${Date.now() - began}ms`)
  await sleep(2000)
  note('sleep left behind after the kill', (await runInDistro(distro, ['/usr/bin/pgrep', '-f', 'sleep 31'])).stdout.trim() || 'none')

  report('finds sh', (await findLinuxExecutable(distro, 'sh', '/usr/local/bin:/usr/bin:/bin')).status === 'found')
  report('a missing program is missing', (await findLinuxExecutable(distro, 'antumi-no-such-program', '/usr/bin:/bin')).status === 'missing')
  report('a missing distro is unknown', (await findLinuxExecutable('antumi-no-such-distro', 'sh', '/usr/bin:/bin')).status === 'unknown')

  if (mutate) {
    const setup = 'mkdir -p "$HOME/antumi-smoke-bin" && printf \'#!/bin/sh\\necho v99.0.0\\n\' > "$HOME/antumi-smoke-bin/node" && chmod +x "$HOME/antumi-smoke-bin/node" && printf \'%s\\n\' \'echo "banner on stdout"\' \'export PATH="$HOME/antumi-smoke-bin:$PATH"\' >> "$HOME/.bashrc"'
    report('prepared ~/.bashrc', (await runInDistro(distro, ['/bin/sh', '-c', setup])).code === 0)
  }
  const loginBegan = Date.now()
  const login = await loginEnvironment(distro)
  report('login environment read', login !== null && login.home.startsWith('/') && login.path.includes('/usr/bin'), `${Date.now() - loginBegan}ms ${JSON.stringify(login)}`)
  if (login) {
    const node = await findLinuxExecutable(distro, 'node', login.path)
    note('node on the login PATH', node)
    if (mutate) report('login PATH carries what ~/.bashrc adds', node.status === 'found' && node.path.endsWith('/antumi-smoke-bin/node'), JSON.stringify(node))
    note('windows entries on the login PATH', login.path.split(':').filter((dir) => dir.startsWith('/mnt/')).length)
  }

  // The tunnel's transport: a piped child must carry bytes as they are.
  const binary = randomBytes(2 * 1024 * 1024)
  const cat = spawnInDistro(distro, ['/bin/cat'])
  const back: Buffer[] = []
  cat.stdout?.on('data', (chunk: Buffer) => back.push(chunk))
  const closed = new Promise((resolve) => cat.on('close', resolve))
  cat.stdin?.end(binary)
  await closed
  report('piped child is binary-clean for 2MB', sha(Buffer.concat(back)) === sha(binary), `${Buffer.concat(back).length} bytes back`)

  note('HOME under --exec', (await runInDistro(distro, ['/usr/bin/printenv', 'HOME'])).stdout.trim())
  // The backend's hidden launch, with its output redirected inside the distro.
  await launchInDistro(distro, launchProgram(47))
  await sleep(2500)
  const said = (await runInDistro(distro, ['/bin/sh', '-c', 'cat "$HOME/.antumi-smoke/launch-47.log"'])).stdout
  report('hidden launch runs and logs in the distro', said.includes('started /') && (await runInDistro(distro, ['/usr/bin/pgrep', '-f', 'sleep 47'])).code === 0, JSON.stringify(said))
  await runInDistro(distro, ['/usr/bin/pkill', '-f', 'sleep 47'])

  if (tunnelFile) await tunnel(tunnelFile)

  // Last: stopping the distro, to see that asking what runs neither fails nor starts it.
  const terminated = await runWsl(['--terminate', distro])
  note('terminate', terminated)
  await sleep(1500)
  const first = await isDistroRunning(distro)
  await sleep(3000)
  const second = await isDistroRunning(distro)
  report('a stopped distro reads as stopped, and asking does not start it', first === 'stopped' && second === 'stopped', `${first}, ${second}`)
  note('running list when nothing runs', await runWsl(['--list', '--running', '--quiet']))
}

// One JSON-RPC call to core over a WebSocket at this port on Windows' 127.0.0.1.
function rpc(endpoint: Pick<CoreEndpoint, 'port' | 'token'>, method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(coreUrl(endpoint))
    const timer = setTimeout(() => { socket.close(); reject(new Error(`${method} timed out`)) }, 30_000)
    socket.onerror = () => { clearTimeout(timer); reject(new Error(`${method}: no connection on port ${String(endpoint.port)}`)) }
    socket.onopen = () => socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }))
    socket.onmessage = (event) => {
      const message: unknown = JSON.parse(String(event.data))
      if (typeof message !== 'object' || message === null || !('id' in message) || message.id !== 1) return
      clearTimeout(timer)
      socket.close()
      if ('error' in message) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
      else resolve('result' in message ? message.result : null)
    }
  })
}

const placeFile = join(tmpdir(), 'antumi-wsl-smoke-place.json')

// The real backend, from the archive a release carries: installed, started, spoken to from
// Windows, directly and through the tunnel helper it brought along.
async function backend(folder: string): Promise<void> {
  const manifest: unknown = JSON.parse(readFileSync(join(folder, 'backend-linux-x64.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null || !('sha256' in manifest) || typeof manifest.sha256 !== 'string' || !('version' in manifest) || typeof manifest.version !== 'string') throw new Error('no manifest')
  const options = { distro, version: manifest.version, archive: { file: join(folder, 'backend-linux-x64.tar.gz'), sha256: manifest.sha256 } }
  note('manifest', manifest)

  // Folders as other builds would have left them: one nothing runs from, one a process still does.
  await runInDistro(distro, ['/bin/sh', '-c', 'root="$HOME/.antumi/backend"; mkdir -p "$root/0.0.1-idle" "$root/0.0.2-busy"; : > "$root/0.0.1-idle/core.mjs"; : > "$root/0.0.2-busy/daemon.mjs"'])
  await launchInDistro(distro, ['/bin/sh', '-c', 'exec tail -f /dev/null "$HOME/.antumi/backend/0.0.2-busy/daemon.mjs"'])
  await sleep(1500)

  const began = Date.now()
  const started = await ensureWslBackend(options)
  report('backend installed and started', started.ok, `${Date.now() - began}ms ${JSON.stringify(started.ok ? { place: { ...started.place, path: '…' }, endpoint: { ...started.endpoint, token: '…' } } : started.problem)}`)
  const logs = async (name: string) => note(`${name}.log`, (await runInDistro(distro, ['/bin/sh', '-c', 'tail -n 15 "$HOME/.antumi/logs/$1.log"', 'sh', name])).stdout)
  if (!started.ok) {
    await logs('daemon')
    await logs('core')
    return
  }
  const { place, endpoint } = started
  writeFileSync(placeFile, JSON.stringify({ place, pid: endpoint.pid }))
  const folders = (await runInDistro(distro, ['/bin/sh', '-c', 'ls "$HOME/.antumi/backend"'])).stdout.trim().split('\n').sort()
  report('old folders are cleared, but for one still in use', folders.length === 2 && folders.includes('0.0.2-busy') && !folders.includes('0.0.1-idle'), JSON.stringify(folders))

  const hello = await rpc(endpoint, 'system.hello', { protocolVersion: PROTOCOL_VERSION }).catch((error: unknown) => String(error))
  report('core answers Windows on 127.0.0.1', typeof hello === 'object', JSON.stringify(hello))
  const environment = await rpc(endpoint, 'system.environment', { refresh: true }).catch((error: unknown) => String(error))
  report('core reads its environment in the distro', typeof environment === 'object', JSON.stringify(environment).slice(0, 1200))

  const againBegan = Date.now()
  const again = await ensureWslBackend(options)
  report('a second start finds the same core', again.ok && again.endpoint.pid === endpoint.pid, `${Date.now() - againBegan}ms`)
  await replaceOldWslDaemon(place, options.version)
  report('the daemon of this build is left alone', (await wslCoreEndpoint(place))?.pid === endpoint.pid)
  note('backend processes', (await runInDistro(distro, ['/bin/sh', '-c', 'ps -eo pid,ppid,etimes,args | grep -E "antumi|node" | grep -v grep'])).stdout)

  // The UI's way to core when 127.0.0.1 does not get through: the tunnel helper, as installed.
  const helper = spawnInDistro(distro, [place.node, `${place.dir}/backend-tunnel.mjs`])
  if (!helper.stdout || !helper.stdin) throw new Error('helper has no stdio')
  const link = await connectTunnelHelper({ fromHelper: helper.stdout, toHelper: helper.stdin, config: { dial: { port: endpoint.port } } })
  const tunnelled = await rpc({ port: link.localPort ?? 0, token: endpoint.token }, 'system.hello', { protocolVersion: PROTOCOL_VERSION }).catch((error: unknown) => String(error))
  report('core answers through the tunnel', typeof tunnelled === 'object', JSON.stringify(tunnelled).slice(0, 200))
  helper.stdin.end()
  await logs('daemon')
  await logs('core')
}

// From another process, minutes after the one that started the backend left.
async function checkBackend(): Promise<void> {
  const state = await isDistroRunning(distro)
  report('distro still running after the starter left', state === 'running', state)
  let saved: { place: WslBackendPlace; pid: number }
  try {
    saved = JSON.parse(readFileSync(placeFile, 'utf8'))
  } catch {
    return report('a backend was started before', false)
  }
  const endpoint = await wslCoreEndpoint(saved.place)
  report('the same core still answers', endpoint?.pid === saved.pid, JSON.stringify(endpoint ? { ...endpoint, token: '…' } : null))
  if (endpoint) report('and answers Windows', typeof (await rpc(endpoint, 'system.hello', { protocolVersion: PROTOCOL_VERSION }).catch((error: unknown) => String(error))) === 'object')
}

// Bytes both ways through the tunnel helper, over a real wsl.exe child's stdio.
async function tunnel(file: string): Promise<void> {
  const node = await findLinuxExecutable(distro, 'node', '/usr/local/bin:/usr/bin:/bin')
  if (node.status !== 'found') return report('tunnel: a real node in the distro', false, JSON.stringify(node))
  note('tunnel: node', (await runInDistro(distro, [node.path, '--version'])).stdout.trim())
  const dir = '/tmp/antumi-smoke'
  const put = await runInDistro(distro, ['/bin/sh', '-c', `mkdir -p ${dir} && cat > ${dir}/backend-tunnel.mjs`], { input: readFileSync(file) })
  report('tunnel: helper copied in over stdin', put.code === 0, put.stderr)

  const windowsEcho = net.createServer((socket) => socket.pipe(socket))
  await new Promise<void>((resolve) => windowsEcho.listen(0, '127.0.0.1', resolve))
  const address = windowsEcho.address()
  const windowsPort = address && typeof address === 'object' ? address.port : 0
  const linuxEcho = spawnInDistro(distro, [node.path, '-e', "require('net').createServer((s) => s.pipe(s)).listen(0, '127.0.0.1', function () { console.log(this.address().port) })"])
  const linuxPort = Number(await new Promise<string>((resolve) => linuxEcho.stdout?.once('data', (chunk: Buffer) => resolve(chunk.toString()))))
  note('tunnel: echo ports', { windowsPort, linuxPort })

  const helper = spawnInDistro(distro, [node.path, `${dir}/backend-tunnel.mjs`])
  let complaints = ''
  helper.stderr?.on('data', (chunk: Buffer) => { complaints += chunk.toString() })
  const exited = new Promise<number | null>((resolve) => helper.on('exit', resolve))
  if (!helper.stdout || !helper.stdin) throw new Error('helper has no stdio')
  const endpointFile = `${dir}/browser/host.json`
  const began = Date.now()
  const link = await connectTunnelHelper({
    fromHelper: helper.stdout,
    toHelper: helper.stdin,
    config: { listen: { endpointFile, endpoint: { token: 'smoke', protocolVersion: 3 } }, dial: { port: linuxPort } },
    appPort: windowsPort
  })
  report('tunnel: handshake', link.remotePort !== null && link.localPort !== undefined, `${Date.now() - began}ms ${JSON.stringify({ remotePort: link.remotePort, localPort: link.localPort })}`)

  // Windows to Linux: what the UI's connection to core rides when 127.0.0.1 does not get through.
  const sent = randomBytes(3 * 1024 * 1024)
  const got: Buffer[] = []
  const socket = net.connect(link.localPort ?? 0, '127.0.0.1')
  socket.on('data', (chunk: Buffer) => got.push(chunk))
  const done = new Promise<void>((resolve) => socket.on('close', () => resolve()))
  const sendBegan = Date.now()
  socket.end(sent)
  await Promise.race([done, sleep(30_000)])
  report('tunnel: 3MB Windows to Linux and back', sha(Buffer.concat(got)) === sha(sent), `${Date.now() - sendBegan}ms, ${Buffer.concat(got).length} bytes`)

  // Linux to Windows: core's connection to the browser host.
  const client = "const net = require('net'), crypto = require('crypto'); const s = net.connect(Number(process.argv[1]), '127.0.0.1'); const h = crypto.createHash('sha256'); let n = 0; s.on('data', (c) => { h.update(c); n += c.length }); s.on('close', () => console.log(n + ' ' + h.digest('hex'))); s.end(Buffer.alloc(1048576, 'antumi'))"
  const fromLinux = await runInDistro(distro, [node.path, '-e', client, String(link.remotePort)], { timeoutMs: 30_000 })
  report('tunnel: 1MB Linux to Windows and back', fromLinux.stdout.trim() === `1048576 ${sha(Buffer.alloc(1048576, 'antumi'))}`, JSON.stringify(fromLinux))

  const endpoint = await runInDistro(distro, ['/bin/cat', endpointFile])
  const written = endpoint.stdout.replace(/\s/g, '')
  report('tunnel: endpoint file names the helper port', written.includes(`"port":${String(link.remotePort)}`) && written.includes('"token":"smoke"'), written)
  note('tunnel: endpoint file mode', (await runInDistro(distro, ['/usr/bin/stat', '-c', '%a', endpointFile])).stdout.trim())

  helper.stdin.end()
  const code = await Promise.race([exited, sleep(10_000).then(() => 'still running' as const)])
  report('tunnel: helper leaves when its stdin closes', code === 0, `${String(code)} ${complaints}`)
  report('tunnel: endpoint file removed', (await runInDistro(distro, ['/usr/bin/test', '-e', endpointFile])).code === 1)
  linuxEcho.kill()
  windowsEcho.close()
}

main().then(
  () => {
    console.log(failed === 0 ? 'RESULT: all passed' : `RESULT: ${failed} failed`)
    process.exit(failed === 0 ? 0 : 1)
  },
  (error: unknown) => {
    console.error(error)
    process.exit(2)
  }
)
