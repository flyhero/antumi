import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { PLUGIN_PROTOCOL_VERSION, PluginAnswer, PluginCall, PluginManifest, PluginMessage, pluginSchemas } from '../../protocol/src/plugin.js'
import { LoginNotice, LoginPrompt } from '../../protocol/src/source.js'
import { SourceError, sourceProblem } from './source-error.js'
import type { LoginSession, SourcePlugin } from './source-plugin.js'

type Options = {
  manifest: unknown
  sources: readonly SourcePlugin[]
  input?: Readable
  output?: Writable
  env?: Readonly<Record<string, string | undefined>>
}

export function runSourcePlugin(options: Options): { close(): void } {
  const manifest = PluginManifest.parse(options.manifest)
  const sources = new Map(options.sources.map((source) => [source.id, source]))
  const expected = manifest.contributes.sources.map((source) => source.id)
  if (sources.size !== options.sources.length || new Set(expected).size !== expected.length || sources.size !== expected.length || expected.some((id) => !sources.has(id))) {
    throw new Error('Plugin sources must match the manifest exactly')
  }
  if (manifest.contributes.sources.some((entry) => entry.commentSync === 1 && !sources.get(entry.id)?.comments)) throw new Error('Comment sync capability requires a comments implementation')
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const env = options.env ?? process.env
  const lines = createInterface({ input, crlfDelay: Infinity })
  const controller = new AbortController()
  let closed = false
  let busy = false
  let handshaken = false
  let called = false
  let counter = 0
  let bytes = 0
  let pending: { id: string; resolve(value: string): void; reject(error: Error): void } | undefined
  const close = () => {
    if (closed) return
    closed = true
    controller.abort()
    pending?.reject(new SourceError('login-cancelled', '登录已取消'))
    pending = undefined
    input.off('data', count)
    input.off('error', close)
    output.off('error', close)
    lines.close()
    input.pause()
  }
  const fail = () => {
    if (input === process.stdin) process.exitCode = 1
    close()
  }
  const count = (chunk: Buffer | string) => {
    bytes += Buffer.byteLength(chunk)
    if (bytes > 8 * 1024 * 1024) fail()
  }
  const send = (message: unknown) => {
    if (!closed) output.write(`${JSON.stringify(PluginMessage.parse(message))}\n`)
  }

  async function dispatch(request: typeof PluginCall._output): Promise<unknown> {
    if (request.method === 'handshake') {
      const { protocolVersion } = pluginSchemas.handshake.params.parse(request.params)
      if (handshaken || protocolVersion !== PLUGIN_PROTOCOL_VERSION) throw new SourceError('request-failed', '不支持的插件协议版本')
      handshaken = true
      return pluginSchemas.handshake.result.parse({ protocolVersion: PLUGIN_PROTOCOL_VERSION, id: manifest.id, version: manifest.version, sources: expected })
    }
    if (!handshaken || called) throw new SourceError('request-failed', '每个插件进程必须先握手，再执行一个操作')
    called = true
    const method = request.method
    const params = pluginSchemas[method].params.parse(request.params)
    const source = sources.get(params.source)
    if (!source) throw new SourceError('not-found', '插件未声明这个任务来源')
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(method === 'login' ? 15 * 60_000 : 120_000)])
    const session: LoginSession = {
      prompt: (value) => {
        const prompt = LoginPrompt.parse(value)
        if (pending) return Promise.reject(new SourceError('request-failed', '同一时间只能等待一个登录问题'))
        signal.throwIfAborted()
        return new Promise<string>((resolve, reject) => {
          const id = `prompt-${++counter}`
          if (counter > 32) { reject(new SourceError('request-failed', '登录问题过多')); return }
          const abort = () => {
            pending = undefined
            reject(new SourceError('login-timeout', '登录已取消或超时'))
          }
          signal.addEventListener('abort', abort, { once: true })
          pending = {
            id,
            resolve: (answer) => { signal.removeEventListener('abort', abort); resolve(answer) },
            reject: (error) => { signal.removeEventListener('abort', abort); reject(error) }
          }
          send({ type: 'prompt', id, prompt })
        })
      },
      notify: (notice) => send({ type: 'notify', notice: LoginNotice.parse(notice) })
    }
    switch (method) {
      case 'normalizeSettings': return source.normalizeSettings(pluginSchemas.normalizeSettings.params.parse(params).settings)
      case 'normalizeKey': {
        const { key } = pluginSchemas.normalizeKey.params.parse(params)
        return source.normalizeKey?.(key) ?? key
      }
      case 'envCredential': return source.envCredential?.(env) ?? null
      case 'login': return source.login(session, pluginSchemas.login.params.parse(params).settings, signal)
      case 'list': {
        const { settings, credential } = pluginSchemas.list.params.parse(params)
        return source.list(settings, credential, signal)
      }
      case 'comments': {
        const { settings, credential, key, checkpoint, continuation } = pluginSchemas.comments.params.parse(params)
        if (!source.comments) throw new SourceError('request-failed', '来源不支持评论同步')
        return source.comments(settings, credential, key, signal, { checkpoint, continuation })
      }
      case 'fetch': {
        const { settings, credential, key, images } = pluginSchemas.fetch.params.parse(params)
        const detail = await source.fetch(settings, credential, key, signal, { images: images ?? true })
        return { ...detail, images: detail.images?.map((image) => ({ name: image.name, base64: Buffer.from(image.bytes).toString('base64') })) }
      }
    }
  }

  input.on('data', count)
  input.on('error', close)
  output.on('error', close)
  lines.on('close', close)
  lines.on('line', (line) => {
    if (closed) return
    let raw: unknown
    try { raw = JSON.parse(line) } catch { fail(); return }
    const answer = PluginAnswer.safeParse(raw)
    if (answer.success) {
      if (!pending || pending.id !== answer.data.id) { fail(); return }
      const question = pending
      pending = undefined
      question.resolve(answer.data.value)
      return
    }
    const request = PluginCall.safeParse(raw)
    if (!request.success || busy) { fail(); return }
    busy = true
    void dispatch(request.data).then((result) => {
      if (pending) throw new SourceError('request-failed', '登录流程没有等待问题的回答')
      send({ type: 'result', id: request.data.id, result: pluginSchemas[request.data.method].result.parse(result) })
    }).catch((error: unknown) => {
      send({ type: 'error', id: request.data.id, error: sourceProblem(error) })
    }).finally(() => { busy = false })
  })
  return { close }
}
