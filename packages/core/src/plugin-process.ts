import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { PLUGIN_PROTOCOL_VERSION, PluginMessage, pluginSchemas, type PluginManifest, type PluginMethod, type PluginParams, type PluginResult } from '@antumi/protocol'
import { SourceError } from './source-error'
import type { LoginSession, SourceCredential, SourceProvider } from './source-provider'

const MAX_OUTPUT = 8 * 1024 * 1024
const RESERVED_ENV = /^(?:NODE_|ELECTRON_|ANTUMI_HOME$|LD_|DYLD_)/
// What a plugin writes to stderr goes to core's log, as far as a log can take it from one call.
const LOGGED_LINES = 50
const LOGGED_LINE_LENGTH = 500

// Lines as they complete, each cut to a length and stripped of control characters, up to a count.
export function stderrLines(log: (line: string) => void, limit = LOGGED_LINES): { write(chunk: Buffer): void; end(): void } {
  let partial = ''
  let logged = 0
  const emit = (line: string) => {
    const text = line.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim()
    if (!text || logged > limit) return
    logged += 1
    log(logged > limit ? '…（后面的输出没有记录）' : text.length > LOGGED_LINE_LENGTH ? `${text.slice(0, LOGGED_LINE_LENGTH)}…` : text)
  }
  return {
    write(chunk) {
      const lines = (partial + chunk.toString('utf8')).split('\n')
      partial = lines.pop() ?? ''
      if (partial.length > LOGGED_LINE_LENGTH * 4) partial = partial.slice(0, LOGGED_LINE_LENGTH * 4)
      lines.forEach(emit)
    },
    end() {
      if (partial) emit(partial)
      partial = ''
    }
  }
}

export function pluginEnvironment(names: readonly string[], env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { PATH: env.PATH ?? '', ELECTRON_RUN_AS_NODE: '1' }
  for (const name of names) {
    if (RESERVED_ENV.test(name)) throw new Error(`插件不能声明运行时变量 ${name}`)
    if (env[name] !== undefined) result[name] = env[name]
  }
  return result
}

// A process lives for one operation, including all of a login's questions.
export class PluginProcess {
  private readonly controllers = new Set<AbortController>()
  private stopped = false

  constructor(
    readonly manifest: PluginManifest,
    private readonly main: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly log: (line: string) => void = (line) => console.error(`[antumi-core] plugin ${manifest.id}: ${line}`)
  ) {}

  stop(): void {
    this.stopped = true
    for (const controller of this.controllers) controller.abort()
  }

  call<M extends PluginMethod>(method: M, params: PluginParams<M>, signal?: AbortSignal, session?: LoginSession): Promise<PluginResult<M>> {
    if (this.stopped) return Promise.reject(new SourceError('request-failed', '插件已停止'))
    const controller = new AbortController()
    this.controllers.add(controller)
    const abort = AbortSignal.any([controller.signal, ...(signal ? [signal] : []), AbortSignal.timeout(method === 'login' ? 15 * 60_000 : 120_000)])
    const result = this.invoke(method, params, abort, session)
    void result.finally(() => this.controllers.delete(controller)).catch(() => {})
    return result
  }

  private invoke<M extends PluginMethod>(method: M, params: PluginParams<M>, signal: AbortSignal, session?: LoginSession): Promise<PluginResult<M>> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new SourceError('request-failed', '插件调用已取消')); return }
      const child = spawn(process.execPath, [this.main], {
        cwd: dirname(this.main), env: pluginEnvironment(this.manifest.env, this.env),
        shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']
      })
      let chunks: Buffer[] = []
      let buffered = 0
      let bytes = 0
      let stderrBytes = 0
      let handshaken = false
      let answering = false
      const promptIds = new Set<string>()
      let outcome: { value: PluginResult<M> } | { error: Error } | undefined
      let force: ReturnType<typeof setTimeout> | undefined
      const kill = (hard: boolean) => {
        if (!child.pid) return
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill())
        } else {
          try { process.kill(-child.pid, hard ? 'SIGKILL' : 'SIGTERM') } catch { /* Already exited. */ }
        }
      }
      const finish = (next: NonNullable<typeof outcome>) => {
        if (outcome) return
        outcome = next
        clearTimeout(handshakeTimer)
        signal.removeEventListener('abort', cancel)
        child.stdin.end()
        kill(false)
        force = setTimeout(() => kill(true), 500)
        force.unref()
      }
      const fail = (message: string) => finish({ error: new SourceError('request-failed', message) })
      const cancel = () => fail('插件调用已取消或超时')
      const send = (message: unknown) => { if (!outcome) child.stdin.write(`${JSON.stringify(message)}\n`) }
      const handshakeTimer = setTimeout(() => fail('插件握手超时'), 5000)
      signal.addEventListener('abort', cancel, { once: true })
      child.stdin.on('error', () => fail('插件输入已关闭'))
      child.on('error', () => fail('无法启动插件进程'))
      const stderr = stderrLines(this.log)
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes > MAX_OUTPUT) fail('插件日志超出大小限制')
        else stderr.write(chunk)
      })
      child.stderr.on('end', () => stderr.end())
      child.stdout.on('data', (chunk: Buffer) => {
        if (outcome) return
        bytes += chunk.length
        if (bytes > (method === 'fetch' && handshaken ? 72 * 1024 * 1024 : MAX_OUTPUT)) { fail('插件输出超出大小限制'); return }
        let at = 0
        while (at < chunk.length && !outcome) {
          const end = chunk.indexOf(10, at)
          const part = chunk.subarray(at, end < 0 ? chunk.length : end)
          chunks.push(part)
          buffered += part.length
          if (end < 0) break
          const line = Buffer.concat(chunks, buffered).toString('utf8')
          chunks = []
          buffered = 0
          at = end + 1
          try {
            const message = PluginMessage.parse(JSON.parse(line))
            if (message.type === 'notify' || message.type === 'prompt') {
              if (!handshaken || method !== 'login' || !session) throw new Error('callback outside login')
              if (message.type === 'notify') { session.notify(message.notice); continue }
              if (answering || promptIds.has(message.id) || promptIds.size >= 32) throw new Error('invalid prompt')
              promptIds.add(message.id)
              answering = true
              void session.prompt(message.prompt).then((value) => {
                answering = false
                send({ type: 'answer', id: message.id, value })
              }, () => fail('插件登录已取消'))
              continue
            }
            if (message.id !== (handshaken ? 'call' : 'hello') || answering) throw new Error('unexpected response')
            if (message.type === 'error') {
              finish({ error: new SourceError(message.error.code, message.error.message) })
              break
            }
            if (!handshaken) {
              const hello = pluginSchemas.handshake.result.parse(message.result)
              const expected = this.manifest.contributes.sources.map((source) => source.id).sort()
              if (hello.id !== this.manifest.id || hello.version !== this.manifest.version || JSON.stringify([...hello.sources].sort()) !== JSON.stringify(expected)) throw new Error('manifest mismatch')
              clearTimeout(handshakeTimer)
              if (method === 'handshake') finish({ value: pluginSchemas[method].result.parse(message.result) })
              else {
                handshaken = true
                send({ type: 'call', id: 'call', method, params: pluginSchemas[method].params.parse(params) })
              }
            } else finish({ value: pluginSchemas[method].result.parse(message.result) })
          } catch { fail('插件返回了无效的协议消息') }
        }
      })
      child.on('close', () => {
        clearTimeout(handshakeTimer)
        clearTimeout(force)
        signal.removeEventListener('abort', cancel)
        if (!outcome) reject(new SourceError('request-failed', '插件在返回结果前退出'))
        else if ('error' in outcome) reject(outcome.error)
        else resolve(outcome.value)
      })
      send({ type: 'call', id: 'hello', method: 'handshake', params: { protocolVersion: PLUGIN_PROTOCOL_VERSION } })
    })
  }

  async providers(): Promise<SourceProvider[]> {
    await this.call('handshake', { protocolVersion: PLUGIN_PROTOCOL_VERSION })
    const providers: SourceProvider[] = []
    for (const source of this.manifest.contributes.sources) {
      const credential: SourceCredential | null = await this.call('envCredential', { source: source.id }, AbortSignal.timeout(10_000))
      const timed = () => AbortSignal.timeout(20_000)
      providers.push({
        ...source,
        envCredential: () => credential,
        normalizeSettings: (settings) => this.call('normalizeSettings', { source: source.id, settings }, timed()),
        normalizeKey: (key) => this.call('normalizeKey', { source: source.id, key }, timed()),
        login: (session, settings, signal) => this.call('login', { source: source.id, settings }, signal, session),
        list: (settings, credential, signal) => this.call('list', { source: source.id, settings, credential }, signal),
        fetch: async (settings, credential, key, signal, options) => {
          const detail = await this.call('fetch', { source: source.id, settings, credential, key, ...(options?.images === false ? { images: false } : {}) }, signal)
          return { ...detail, images: detail.images?.map((image) => ({ name: image.name, bytes: Buffer.from(image.base64, 'base64') })) }
        }
      })
    }
    return providers
  }
}
