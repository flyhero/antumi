import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { PLUGIN_PROTOCOL_VERSION, PluginAnswer, PluginBrowserAnswer, PluginCall, PluginManifest, PluginMessage, pluginSchemas } from '../../protocol/src/plugin.js'
import { PluginBrowserRequest, PluginBrowserResult } from '../../protocol/src/plugin-browser.js'
import { LoginNotice, LoginPrompt } from '../../protocol/src/source.js'
import { SourceError, sourceProblem } from './source-error.js'
import type { LoginSession, SourcePlugin } from './source-plugin.js'

export type PluginPageContext = { signal: AbortSignal; browser(request: PluginBrowserRequest): Promise<PluginBrowserResult> }
export type PluginPageHandler = (params: unknown, context: PluginPageContext) => unknown | Promise<unknown>
export type PluginPages = Record<string, Record<string, PluginPageHandler>>

type SourceOptions = {
  manifest: unknown
  sources: readonly SourcePlugin[]
  input?: Readable
  output?: Writable
  env?: Readonly<Record<string, string | undefined>>
}

export function runPlugin(options: Omit<SourceOptions, 'sources'> & { sources?: readonly SourcePlugin[]; pages?: PluginPages }): { close(): void } {
  const manifest = PluginManifest.parse(options.manifest)
  const registered = options.sources ?? []
  const pages = options.pages ?? {}
  const expectedPages = manifest.contributes.pages.map((page) => page.id)
  if (new Set(expectedPages).size !== expectedPages.length || Object.keys(pages).length !== expectedPages.length || expectedPages.some((id) => !Object.hasOwn(pages, id))) throw new Error('Plugin pages must match the manifest exactly')
  const sources = new Map(registered.map((source) => [source.id, source]))
  const expected = manifest.contributes.sources.map((source) => source.id)
  if (sources.size !== registered.length || new Set(expected).size !== expected.length || sources.size !== expected.length || expected.some((id) => !sources.has(id))) {
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
  let browserSupported = false
  let binarySupported = false
  let browserPending: { id: string; resolve(value: PluginBrowserResult): void; reject(error: Error): void } | undefined
  const close = () => {
    if (closed) return
    closed = true
    controller.abort()
    pending?.reject(new SourceError('login-cancelled', '登录已取消'))
    pending = undefined
    browserPending?.reject(new SourceError('request-failed', '浏览器请求已取消'))
    browserPending = undefined
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
      const { protocolVersion, features } = pluginSchemas.handshake.params.parse(request.params)
      if (handshaken || protocolVersion !== PLUGIN_PROTOCOL_VERSION) throw new SourceError('request-failed', '不支持的插件协议版本')
      handshaken = true
      browserSupported = features?.includes('browser-sessions') ?? false
      binarySupported = features?.includes('browser-binary') ?? false
      return pluginSchemas.handshake.result.parse({ protocolVersion: PLUGIN_PROTOCOL_VERSION, id: manifest.id, version: manifest.version, sources: expected, pages: expectedPages })
    }
    if (!handshaken || called) throw new SourceError('request-failed', '每个插件进程必须先握手，再执行一个操作')
    called = true
    const method = request.method
    if (method === 'page') {
      const { page, method: name, params } = pluginSchemas.page.params.parse(request.params)
      const handlers = Object.hasOwn(pages, page) ? pages[page] : undefined
      const handler = handlers && Object.hasOwn(handlers, name) ? handlers[name] : undefined
      if (typeof handler !== 'function') throw new SourceError('not-found', '插件未声明这个页面或方法')
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
      const browser = (raw: PluginBrowserRequest): Promise<PluginBrowserResult> => {
        if (!browserSupported) return Promise.reject(new SourceError('request-failed', '当前 Antumi 不支持插件登录，请升级 Antumi'))
        if (raw.action === 'request' && raw.bodyEncoding === 'base64' && !binarySupported) return Promise.reject(new SourceError('request-failed', '当前 Antumi 不支持上传文件，请升级 Antumi'))
        if (browserPending) return Promise.reject(new SourceError('request-failed', '请等待上一个浏览器请求完成'))
        signal.throwIfAborted()
        const request = PluginBrowserRequest.parse(raw)
        return new Promise((resolve, reject) => {
          const id = `browser-${++counter}`
          const abort = () => { browserPending = undefined; reject(new SourceError('request-failed', '浏览器请求已取消或超时')) }
          signal.addEventListener('abort', abort, { once: true })
          browserPending = {
            id,
            resolve: (result) => { signal.removeEventListener('abort', abort); resolve(result) },
            reject: (error) => { signal.removeEventListener('abort', abort); reject(error) }
          }
          send({ type: 'browser', id, request })
        })
      }
      try { return { result: await handler(params, { signal, browser }) } }
      catch (error) {
        if (error instanceof Error && !(error instanceof SourceError)) throw new SourceError('request-failed', error.message)
        throw error
      }
    }
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
      case 'image': {
        const { settings, credential, key, id } = pluginSchemas.image.params.parse(params)
        if (!source.image) throw new SourceError('request-failed', '来源不支持读取评论图片')
        const image = await source.image(settings, credential, key, id, signal)
        return { name: image.name, base64: Buffer.from(image.bytes).toString('base64') }
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
    const browserAnswer = PluginBrowserAnswer.safeParse(raw)
    if (browserAnswer.success) {
      if (!browserPending || browserPending.id !== browserAnswer.data.id) { fail(); return }
      const waiting = browserPending
      browserPending = undefined
      if (browserAnswer.data.error !== undefined) waiting.reject(new SourceError('request-failed', browserAnswer.data.error))
      else {
        const result = PluginBrowserResult.safeParse(browserAnswer.data.result)
        if (!result.success) { waiting.reject(new SourceError('request-failed', '无效的浏览器响应')); fail(); return }
        waiting.resolve(result.data)
      }
      return
    }
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
      if (pending || browserPending) throw new SourceError('request-failed', '插件没有等待宿主调用完成')
      send({ type: 'result', id: request.data.id, result: pluginSchemas[request.data.method].result.parse(result) })
    }).catch((error: unknown) => {
      send({ type: 'error', id: request.data.id, error: sourceProblem(error) })
    }).finally(() => { busy = false })
  })
  return { close }
}

export const runSourcePlugin: (options: SourceOptions) => { close(): void } = runPlugin
