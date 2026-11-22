import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { CodeartsApiError, CodeartsBridge } from './agents/codearts/codearts-bridge'

// What an agent stage runs for CodeArts: its local server, started for this process alone on a
// port of its own with a password no one else has, and the bridge between it and the ACP Antumi
// speaks on stdio. The daemon stops the two together (the process group, or the tree on Windows).

const at = process.argv.indexOf('--codearts')
const executable = at >= 0 ? process.argv[at + 1] : undefined
if (!executable) {
  process.stderr.write('usage: codearts-bridge --codearts <executable>\n')
  process.exit(2)
}

const START_TIMEOUT_MS = 60_000
const user = 'antumi'
const password = randomBytes(24).toString('hex')
const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

// Ours, rather than its default 4096, which OpenCode's own server takes too.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port')))
    })
  })
}

// What it printed, as a person would read it: without colours, its frame drawing and its pointer
// to its log. A folder it does not trust is trusted in its own terminal: its trust covers the
// folders inside, so one for Antumi's worktrees covers them all.
function readable(printed: string): string {
  const lines = printed.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((line) => line.replace(/^[\s│●◆◇└┌├─]+/, '').trim()).filter((line) => line && !/^Error: Unexpected error, check log file/.test(line))
  const untrusted = lines.some((line) => line.startsWith('文件夹未被信任'))
  return [...new Set(lines)].join('\n') + (untrusted ? '\n在终端进入这个目录运行 codearts，按提示信任它后重试；信任上层目录（如 Antumi 的 worktree 目录）可一并信任其中的项目。' : '')
}

const port = await freePort()
const env: NodeJS.ProcessEnv = { ...process.env, CODEARTS_SERVER_USERNAME: user, CODEARTS_SERVER_PASSWORD: password }
delete env.ELECTRON_RUN_AS_NODE

// Its project skills, then the user's, then Antumi's library: the first folder of a name wins, and
// the project's goes first in the config too so its server loads the same skill.
const projectSkills = path.join(process.cwd(), '.codeartsdoer', 'skills')
const userSkills = path.join(os.homedir(), '.codeartsdoer', 'skills')
const ConfigSchema = z.looseObject({ skills: z.looseObject({ paths: z.array(z.string()).optional() }).optional() })
const config = (() => { try { return ConfigSchema.safeParse(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '')).data } catch { return undefined } })()
const librarySkills = config?.skills?.paths ?? []
if (config && env.OPENCODE_CONFIG_CONTENT) env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...config, skills: { ...(config.skills ?? {}), paths: [projectSkills, ...librarySkills.filter((dir) => dir !== projectSkills)] } })
const skillDirs = [...new Set([projectSkills, userSkills, ...librarySkills])]

const server = spawn(executable, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let printed = ''
let stopping = false

const listening = new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`CodeArts 本地服务 ${START_TIMEOUT_MS / 1000} 秒内没有启动`)), START_TIMEOUT_MS)
  const read = (chunk: Buffer) => {
    // Kept only until it listens: what it says before is what a failure is.
    if (printed.length < 64 * 1024) printed += chunk.toString()
    const url = /listening on (http:\/\/\S+)/.exec(printed)?.[1]
    if (url) { clearTimeout(timer); resolve(url.replace(/\u001b\[[0-9;]*m/g, '')) }
  }
  server.stdout.on('data', read)
  server.stderr.on('data', read)
  server.once('error', (error) => { clearTimeout(timer); reject(error) })
  server.once('exit', () => { clearTimeout(timer); reject(new Error(readable(printed) || 'CodeArts 本地服务启动失败')) })
})

const Failure = z.looseObject({ message: z.string().optional(), data: z.looseObject({ message: z.string().optional() }).optional() })

async function api(method: 'GET' | 'POST', path: string, directory: string, body?: unknown): Promise<unknown> {
  const base = await listening
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}directory=${encodeURIComponent(directory)}`
  const response = await fetch(url, { method, headers: { authorization, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  let json: unknown = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  if (!response.ok) {
    const error = Failure.safeParse(json).data
    throw new CodeartsApiError(response.status, error?.data?.message ?? error?.message ?? (text || response.statusText))
  }
  return json
}

const write = (frame: unknown) => { process.stdout.write(`${JSON.stringify(frame)}\n`) }

// Ready once it listens and its event stream is open: no update of a first turn is missed.
let streamOpen: () => void = () => {}
const streaming = new Promise<void>((resolve) => { streamOpen = resolve })
const ready = Promise.all([listening, streaming]).then(() => {})
ready.catch(() => {})
const bridge = new CodeartsBridge(api, write, ready, process.env.npm_package_version ?? '1', skillDirs)

async function stream(): Promise<void> {
  // A server that never listened has said why already.
  const base = await listening.catch(() => null)
  if (!base) return
  while (!stopping) {
    try {
      const response = await fetch(`${base}/global/event`, { headers: { authorization, accept: 'text/event-stream' } })
      if (!response.body) throw new Error('no event stream')
      streamOpen()
      const decoder = new TextDecoder()
      let buffer = ''
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
          if (!data) continue
          let event: unknown
          try { event = JSON.parse(data) } catch { continue }
          // In order: a part's updates follow its start, a turn's end follows its updates.
          await bridge.event(event).catch((error: unknown) => process.stderr.write(`codearts-bridge: ${error instanceof Error ? error.message : String(error)}\n`))
        }
      }
    } catch {
      // Dropped: open it again, unless the server is gone.
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

function stop(code: number): void {
  if (stopping) return
  stopping = true
  server.kill('SIGTERM')
  const force = setTimeout(() => server.kill('SIGKILL'), 3000)
  force.unref()
  server.once('exit', () => process.exit(code))
  if (server.exitCode !== null || server.signalCode !== null) process.exit(code)
}

listening.catch((error: unknown) => {
  // Its own words for why (no access key, a folder not trusted) are the failure Antumi shows.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
})
void stream()
server.once('exit', (code) => {
  if (!stopping) {
    process.stderr.write(`${readable(printed) || `CodeArts 本地服务已退出（${code ?? 'signal'}）`}\n`)
    stopping = true
    // The process ending is what the driver reads; a second lets an answer it is owed go first.
    setTimeout(() => process.exit(1), 1000)
  }
})

const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  if (!line.trim()) return
  let frame: unknown
  try { frame = JSON.parse(line) } catch { return }
  // Not awaited: an answer to a permission request must get through while a prompt runs.
  void bridge.receive(frame)
})
lines.on('close', () => stop(0))
process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))
