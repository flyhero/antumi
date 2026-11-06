import type { ProviderEndpoint } from '@antumi/protocol'

// One request to a model provider, as an agent would send it over that wire: what testing a
// provider and the small jobs run on it (titles, translations) share. A non-2xx answer, a redirect,
// a timeout or an unreachable address comes back as a failure with what the endpoint said, never
// with the key in it.

// headers: the provider's own (ModelProvider.headers), under the ones the wire needs.
export type ProviderCall = { endpoint: ProviderEndpoint; apiKey: string; model: string; headers?: Readonly<Record<string, string>> }
export type ProviderReply =
  | { ok: true; text: string; usage: { input: number; output: number } | null; status: number; latencyMs: number }
  | { ok: false; status: number | null; message: string; latencyMs: number }

const MESSAGE_LIMIT = 300

// Agents add the version segment themselves; one already on the address would go twice.
export function trimmed(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

// Where an Anthropic client is pointed: it adds /v1/messages itself.
export function anthropicBaseUrl(baseUrl: string): string {
  return trimmed(baseUrl).replace(/\/v1(\/messages)?$/, '')
}

export function anthropicMessagesUrl(baseUrl: string): string {
  return `${anthropicBaseUrl(baseUrl)}/v1/messages`
}

type Built = { url: string; headers: Record<string, string>; body: unknown }

// The provider's headers under the ones a request needs: one the request sets, in any case, is
// the request's alone.
export function withProviderHeaders(own: Readonly<Record<string, string>>, needed: Record<string, string>): Record<string, string> {
  const taken = new Set(Object.keys(needed).map((name) => name.toLowerCase()))
  return { ...Object.fromEntries(Object.entries(own).filter(([name]) => !taken.has(name.toLowerCase()))), ...needed }
}

function build({ endpoint, apiKey, model, headers: own = {} }: ProviderCall, prompt: string, maxTokens: number): Built {
  const json = { 'content-type': 'application/json' }
  if (endpoint.wire === 'anthropic') {
    const auth: Record<string, string> = endpoint.anthropic?.auth === 'api_key' ? { 'x-api-key': apiKey } : { authorization: `Bearer ${apiKey}` }
    return {
      url: anthropicMessagesUrl(endpoint.baseUrl),
      headers: withProviderHeaders(own, { ...json, ...auth, 'anthropic-version': '2023-06-01' }),
      body: { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }
    }
  }
  const headers = withProviderHeaders(own, { ...json, authorization: `Bearer ${apiKey}` })
  return endpoint.wire === 'openai-responses'
    ? { url: `${trimmed(endpoint.baseUrl)}/responses`, headers, body: { model, input: prompt, max_output_tokens: maxTokens, store: false } }
    : { url: `${trimmed(endpoint.baseUrl)}/chat/completions`, headers, body: { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens } }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function replyText(wire: ProviderEndpoint['wire'], body: Record<string, unknown>): string {
  if (wire === 'anthropic') return list(body.content).map((part) => record(part)?.text).filter((text) => typeof text === 'string').join('')
  if (wire === 'openai-chat') {
    const content = record(record(list(body.choices)[0])?.message)?.content
    return typeof content === 'string' ? content : ''
  }
  if (typeof body.output_text === 'string') return body.output_text
  return list(body.output).flatMap((item) => list(record(item)?.content)).map((part) => record(part)?.text).filter((text) => typeof text === 'string').join('')
}

function replyUsage(wire: ProviderEndpoint['wire'], body: Record<string, unknown>): { input: number; output: number } | null {
  const usage = record(body.usage)
  if (!usage) return null
  return wire === 'openai-chat'
    ? { input: count(usage.prompt_tokens), output: count(usage.completion_tokens) }
    : { input: count(usage.input_tokens), output: count(usage.output_tokens) }
}

// What a failed answer says, as its error object puts it where it has one; shortened, and with the
// key cut out in case the endpoint echoed it.
export function failureText(text: string, apiKey: string): string {
  let said = text.trim()
  try {
    const parsed = record(JSON.parse(said))
    const error = parsed?.error
    const message = typeof error === 'string' ? error : record(error)?.message ?? parsed?.message
    if (typeof message === 'string' && message.trim()) said = message.trim()
  } catch {
    // Not JSON: the text as it came.
  }
  const redacted = apiKey ? said.split(apiKey).join('***') : said
  return redacted.length > MESSAGE_LIMIT ? `${redacted.slice(0, MESSAGE_LIMIT)}…` : redacted
}

export async function askProvider(call: ProviderCall, prompt: string, { maxTokens = 16, timeoutMs = 30_000, fetchImpl = fetch }: { maxTokens?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<ProviderReply> {
  const { url, headers, body } = build(call, prompt, maxTokens)
  const started = Date.now()
  const elapsed = () => Date.now() - started
  let response: Response
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    const reason = timedOut ? `${Math.round(timeoutMs / 1000)} 秒内没有回应` : `连不上 ${new URL(url).host}：${error instanceof Error ? error.message : String(error)}`
    return { ok: false, status: null, message: failureText(reason, call.apiKey), latencyMs: elapsed() }
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) return { ok: false, status: response.status, message: failureText(text || response.statusText, call.apiKey), latencyMs: elapsed() }
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = record(JSON.parse(text))
  } catch {
    parsed = null
  }
  if (!parsed) return { ok: false, status: response.status, message: failureText(`回应不是 JSON：${text}`, call.apiKey), latencyMs: elapsed() }
  return { ok: true, text: replyText(call.endpoint.wire, parsed), usage: replyUsage(call.endpoint.wire, parsed), status: response.status, latencyMs: elapsed() }
}
