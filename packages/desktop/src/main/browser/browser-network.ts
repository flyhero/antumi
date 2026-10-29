import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'playwright-core'
import type { BrowserNetworkDetail, BrowserNetworkRequest } from '@antumi/protocol'
import { HostError } from './host-error'

const LIMIT = 100
const SECRET = /authorization|cookie|token|password|passwd|secret|api[-_]?key|csrf/i

function headers(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).slice(0, 50).map(([key, value]) => [key, SECRET.test(key) ? '[redacted]' : value.slice(0, 2000)]))
}

export function diagnosticBody(value: string, limit: number): string {
  try {
    const redact = (item: unknown, depth = 0): unknown => {
      if (depth > 12) return '[truncated]'
      if (Array.isArray(item)) return item.slice(0, 200).map((value) => redact(value, depth + 1))
      if (item !== null && typeof item === 'object') return Object.fromEntries(Object.entries(item).slice(0, 200).map(([key, value]) => [key, SECRET.test(key) ? '[redacted]' : redact(value, depth + 1)]))
      return item
    }
    return JSON.stringify(redact(JSON.parse(value)), null, 2).slice(0, limit)
  } catch {
    return value.replace(/((?:password|passwd|secret|token|api[_-]?key|csrf)[\w-]*=)[^&\s]*/gi, '$1[redacted]').slice(0, limit)
  }
}

type Entry = { summary: BrowserNetworkRequest; request: Request; response: Response | null }
interface NetworkEvents {
  on(event: 'request' | 'requestfinished' | 'requestfailed', listener: (request: Request) => void): unknown
  on(event: 'response', listener: (response: Response) => void): unknown
}

export class BrowserNetwork {
  private entries: Entry[] = []
  private readonly requests = new WeakMap<Request, Entry>()

  attach(page: NetworkEvents): void {
    page.on('request', (request) => {
      const entry: Entry = { request, response: null, summary: { id: randomUUID(), method: request.method().slice(0, 20), url: request.url().slice(0, 4096), resourceType: request.resourceType().slice(0, 50), status: null, statusText: '', startedAt: Date.now(), durationMs: null, failure: null } }
      this.requests.set(request, entry)
      this.entries.push(entry)
      if (this.entries.length > LIMIT) this.entries.shift()
    })
    page.on('response', (response) => {
      const entry = this.requests.get(response.request())
      if (!entry) return
      entry.response = response
      entry.summary.status = response.status()
      entry.summary.statusText = response.statusText().slice(0, 200)
    })
    page.on('requestfinished', (request) => this.finish(request, null))
    page.on('requestfailed', (request) => this.finish(request, request.failure()?.errorText ?? 'request failed'))
  }

  private finish(request: Request, failure: string | null): void {
    const entry = this.requests.get(request)
    if (!entry) return
    entry.summary.durationMs = Math.max(0, Date.now() - entry.summary.startedAt)
    entry.summary.failure = failure?.slice(0, 500) ?? null
  }

  list(): BrowserNetworkRequest[] {
    return this.entries.map((entry) => ({ ...entry.summary }))
  }

  async detail(id: string): Promise<BrowserNetworkDetail> {
    const entry = this.entries.find((entry) => entry.summary.id === id)
    if (!entry) throw new HostError('browser-request-not-found', '请求已不在最近记录中，请刷新列表')
    const requestBody = entry.request.postData()
    const result: BrowserNetworkDetail = { id, requestHeaders: headers(entry.request.headers()), requestBody: requestBody ? diagnosticBody(requestBody, 8192) : null, responseHeaders: headers(entry.response?.headers() ?? {}), responseBody: null, bodyNote: null }
    const response = entry.response
    if (!response) { result.bodyNote = 'unavailable'; return result }
    if (!/text\/|json|javascript|xml|svg/i.test(response.headers()['content-type'] ?? '')) { result.bodyNote = 'binary'; return result }
    if (Number(response.headers()['content-length']) > 128 * 1024) { result.bodyNote = 'large'; return result }
    let timer: NodeJS.Timeout | undefined
    try {
      const text = await Promise.race([response.text(), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 2000); timer.unref() })])
      if (text === null) result.bodyNote = 'pending'
      else { result.responseBody = diagnosticBody(text, 16384); if (text.length > 16384) result.bodyNote = 'truncated' }
    } catch { result.bodyNote = 'unavailable' }
    finally { if (timer) clearTimeout(timer) }
    return result
  }
}
