import type { ModelProvider, ModelProviderModels, ProviderModel, ProviderWire } from '@antumi/protocol'
import { anthropicBaseUrl, failureText, trimmed } from './provider-request'

// The models a provider's endpoints list (GET /models), with whatever each tells of a model's
// context and output: most list ids alone, some (OpenRouter, vLLM, Kimi, Anthropic) say more under
// names of their own. Never throws.

const BODY_LIMIT = 4 * 1024 * 1024
const PAGE_LIMIT = 10
const MODEL_LIMIT = 2000

const CONTEXT_FIELDS = ['context_length', 'context_window', 'max_model_len', 'max_input_tokens', 'max_context_length', 'inputTokenLimit']
const OUTPUT_FIELDS = ['max_completion_tokens', 'max_output_tokens', 'outputTokenLimit']

type Listing = { wire: ProviderWire; url: string; headers: Record<string, string>; paged: boolean }
type Found = { ok: true; models: ProviderModel[]; status: number } | { ok: false; status: number | null; message: string }

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null

function tokens(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null
}

function firstTokens(item: Record<string, unknown>, fields: readonly string[]): number | null {
  for (const field of fields) {
    const found = tokens(item[field])
    if (found !== null) return found
  }
  return null
}

// One model as an endpoint lists it; null where it has no usable id.
export function listedModel(value: unknown, wire: ProviderWire): ProviderModel | null {
  const item = record(value)
  const id = typeof item?.id === 'string' ? item.id.trim() : ''
  if (!item || !id || id.length > 200) return null
  const named = [item.display_name, item.name].find((name) => typeof name === 'string' && name.trim() && name.trim() !== id)
  const label = typeof named === 'string' ? named.trim().slice(0, 200) : null
  // Anthropic's max_tokens is what a reply may take; elsewhere it is used for either.
  const output = firstTokens(item, OUTPUT_FIELDS) ?? tokens(record(item.top_provider)?.max_completion_tokens) ?? (wire === 'anthropic' ? tokens(item.max_tokens) : null)
  return { id, label, contextWindow: firstTokens(item, CONTEXT_FIELDS) ?? tokens(record(item.top_provider)?.context_length), maxOutput: output, efforts: [] }
}

function listings(provider: Pick<ModelProvider, 'anthropic' | 'openai'>, apiKey: string): Listing[] {
  const found: Listing[] = []
  if (provider.anthropic) {
    const auth: Record<string, string> = provider.anthropic.auth === 'api_key' ? { 'x-api-key': apiKey } : { authorization: `Bearer ${apiKey}` }
    found.push({ wire: 'anthropic', url: `${anthropicBaseUrl(provider.anthropic.baseUrl)}/v1/models`, headers: { ...auth, 'anthropic-version': '2023-06-01' }, paged: true })
  }
  // Responses and chat completions mostly share one base, and so one list.
  const openai: [ProviderWire, string | null | undefined][] = [['openai-responses', provider.openai?.responsesUrl], ['openai-chat', provider.openai?.chatUrl]]
  for (const [wire, base] of openai) {
    const url = base ? `${trimmed(base)}/models` : null
    if (url && !found.some((each) => each.url === url)) found.push({ wire, url, headers: { authorization: `Bearer ${apiKey}` }, paged: false })
  }
  return found
}

// The body as text, refused past the limit rather than read whole.
async function limitedText(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return null
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > BODY_LIMIT) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function list(listing: Listing, apiKey: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Found> {
  // One deadline for every page.
  const signal = AbortSignal.timeout(timeoutMs)
  const models: ProviderModel[] = []
  const cursors = new Set<string>()
  let after: string | null = null
  let status = 0
  for (let page = 0; page < PAGE_LIMIT; page++) {
    // Pages go on at the address given, the cursor only a parameter of it: never an address the reply names.
    const url = new URL(listing.url)
    if (listing.paged) url.searchParams.set('limit', '1000')
    if (after !== null) url.searchParams.set('after_id', after)
    let response: Response
    try {
      response = await fetchImpl(url, { headers: listing.headers, redirect: 'error', signal })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      const reason = timedOut ? `${Math.round(timeoutMs / 1000)} 秒内没有回应` : `连不上 ${url.host}：${error instanceof Error ? error.message : String(error)}`
      return { ok: false, status: null, message: failureText(reason, apiKey) }
    }
    status = response.status
    let text: string | null
    try {
      text = await limitedText(response)
    } catch (error) {
      return { ok: false, status, message: failureText(`读回应失败：${error instanceof Error ? error.message : String(error)}`, apiKey) }
    }
    if (text === null) return { ok: false, status, message: '回应太大' }
    if (!response.ok) return { ok: false, status, message: failureText(text || response.statusText, apiKey) }
    let body: Record<string, unknown> | null
    try {
      body = record(JSON.parse(text))
    } catch {
      body = null
    }
    const items = body?.data ?? body?.models
    if (!Array.isArray(items)) return { ok: false, status, message: failureText(`回应里没有模型列表：${text}`, apiKey) }
    for (const item of items) {
      const model = listedModel(item, listing.wire)
      if (model && models.length < MODEL_LIMIT) models.push(model)
    }
    const next = listing.paged && body?.has_more === true && typeof body.last_id === 'string' ? body.last_id : null
    if (next === null || cursors.has(next) || models.length >= MODEL_LIMIT) break
    cursors.add(next)
    after = next
  }
  return { ok: true, models, status }
}

// Several endpoints may list one model: the first to name it keeps its place and label, and what one
// leaves unknown another may tell.
function merged(lists: ProviderModel[][]): ProviderModel[] {
  const byId = new Map<string, ProviderModel>()
  for (const model of lists.flat()) {
    const known = byId.get(model.id)
    byId.set(model.id, known
      ? { ...known, label: known.label ?? model.label, contextWindow: known.contextWindow ?? model.contextWindow, maxOutput: known.maxOutput ?? model.maxOutput }
      : model)
  }
  return [...byId.values()]
}

export async function fetchProviderModels(provider: Pick<ModelProvider, 'anthropic' | 'openai'>, apiKey: string, { fetchImpl = fetch, timeoutMs = 30_000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<ModelProviderModels> {
  const results = await Promise.all(listings(provider, apiKey).map(async (listing) => ({ wire: listing.wire, result: await list(listing, apiKey, fetchImpl, timeoutMs) })))
  return {
    models: merged(results.flatMap(({ result }) => (result.ok ? [result.models] : []))),
    endpoints: results.map(({ wire, result }) => ({
      wire, ok: result.ok, count: result.ok ? result.models.length : 0, status: result.status, message: result.ok ? null : result.message
    }))
  }
}
