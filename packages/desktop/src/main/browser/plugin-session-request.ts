import type { ClientRequestConstructorOptions } from 'electron'
import type { PluginBrowserResponse } from '@antumi/protocol'
import type { BrowserHostParsedParams } from '@antumi/protocol/node'
import { HostError } from './host-error'

type Request = Extract<BrowserHostParsedParams<'plugin.session'>['request'], { action: 'request' }>
type ResponseHeaders = Record<string, string | string[]>
interface NativeResponse {
  statusCode: number
  headers: ResponseHeaders
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  on(event: 'end' | 'aborted', listener: () => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}
export interface PluginSessionRequest {
  on(event: 'redirect', listener: (status: number, method: string, url: string, headers: ResponseHeaders) => void): unknown
  on(event: 'response', listener: (response: NativeResponse) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  end(body?: string | Buffer): void
  abort(): void
}

function exposedHeaders(headers: ResponseHeaders): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (['content-type', 'location', 'retry-after'].includes(name.toLowerCase())) result[name.toLowerCase()] = Array.isArray(value) ? value[0] ?? '' : value
  }
  return result
}

// net.request exposes redirect responses; Electron's session.fetch rejects redirect: manual.
export async function pluginSessionRequest(origin: string, request: Request, signal: AbortSignal, create: (options: ClientRequestConstructorOptions) => PluginSessionRequest, requestOrigins: readonly string[] = []): Promise<PluginBrowserResponse> {
  signal.throwIfAborted()
  const target = request.origin ?? origin
  if (target !== origin && !requestOrigins.includes(target)) throw new HostError('plugin-site-denied', '插件请求不能离开声明的站点')
  const url = new URL(request.path, target)
  if (url.origin !== target) throw new HostError('plugin-site-denied', '插件请求不能离开登录站点')
  const headers: Record<string, string> = { ...request.headers }
  for (const name of Object.keys(headers)) {
    if (!['accept', 'content-type', 'x-csrf-token', 'x-requested-with', 'x-shared-session-key', 'discourse-present', 'dont-chunk'].includes(name.toLowerCase()) || /[\r\n]/.test(headers[name] ?? '')) throw new HostError('plugin-site-denied', '不允许的插件请求头')
  }
  headers.Referer = `${origin}/`
  headers['Cache-Control'] = 'no-store'
  if (request.method === 'POST') headers.Origin = origin
  return new Promise((resolve, reject) => {
    const native = create({ url: url.href, method: request.method, headers, credentials: 'include', redirect: 'manual' })
    let settled = false
    const finish = (result: PluginBrowserResponse | Error) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    const abort = () => { finish(new HostError('plugin-request-cancelled', '浏览器请求已取消或超时')); native.abort() }
    signal.addEventListener('abort', abort, { once: true })
    native.on('error', () => finish(new HostError('plugin-request-failed', '浏览器请求失败，请检查网络或登录状态')))
    native.on('redirect', (status, _method, location, headers) => {
      finish({ status, headers: { ...exposedHeaders(headers), location }, body: '' })
      native.abort()
    })
    native.on('response', (response) => {
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > 4 * 1024 * 1024) {
          finish(new HostError('plugin-response-large', '站点响应超过 4 MiB'))
          native.abort()
        } else if (!settled) chunks.push(chunk)
      })
      response.on('error', () => finish(new HostError('plugin-request-failed', '站点响应中断')))
      response.on('aborted', () => finish(new HostError('plugin-request-failed', '站点响应中断')))
      response.on('end', () => finish({ status: response.statusCode, headers: exposedHeaders(response.headers), body: Buffer.concat(chunks).toString('utf8') }))
    })
    if (signal.aborted) abort()
    else native.end(request.bodyEncoding === 'base64' ? Buffer.from(request.body ?? '', 'base64') : request.body)
  })
}
