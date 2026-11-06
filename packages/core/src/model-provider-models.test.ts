import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { fetchProviderModels, listedModel } from './model-provider-models'

const KEY = 'sk-list-secret-9012'
type Seen = { url: string; headers: IncomingHttpHeaders }
type Answer = { status: number; body: unknown; location?: string; delayMs?: number }

let server: Server | null = null
afterEach(() => { server?.close(); server = null })

async function serve(answer: (seen: Seen) => Answer): Promise<{ base: string; seen: Seen[] }> {
  const seen: Seen[] = []
  server = createServer((request, response) => {
    const entry = { url: request.url ?? '', headers: request.headers }
    seen.push(entry)
    const { status, body, location, delayMs } = answer(entry)
    setTimeout(() => {
      response.writeHead(status, { 'content-type': 'application/json', ...(location ? { location } : {}) })
      response.end(typeof body === 'string' ? body : JSON.stringify(body))
    }, delayMs ?? 0)
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return { base: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`, seen }
}

const openai = (base: string) => ({ anthropic: null, openai: { chatUrl: `${base}/v1`, responsesUrl: `${base}/v1/` } })
const anthropic = (base: string, auth: 'auth_token' | 'api_key' = 'api_key') => ({ anthropic: { baseUrl: `${base}/anthropic`, auth, env: {} }, openai: null })

describe('listedModel', () => {
  it('reads the context and output each kind of list names', () => {
    expect(listedModel({ id: 'a', context_length: 131072, top_provider: { max_completion_tokens: 8192 } }, 'openai-chat')).toEqual({ id: 'a', label: null, contextWindow: 131072, maxOutput: 8192, efforts: [] })
    expect(listedModel({ id: 'b', max_model_len: '32768' }, 'openai-chat')).toMatchObject({ contextWindow: 32768, maxOutput: null })
    expect(listedModel({ id: 'c', display_name: 'Claude C', max_input_tokens: 200000, max_tokens: 64000 }, 'anthropic')).toMatchObject({ label: 'Claude C', contextWindow: 200000, maxOutput: 64000 })
    expect(listedModel({ id: 'v', architecture: { input_modalities: ['text', 'image'] } }, 'openai-chat')).toMatchObject({ images: true })
    expect(listedModel({ id: 't', architecture: { input_modalities: ['text'] } }, 'openai-chat')).not.toHaveProperty('images')
    // max_tokens means either elsewhere, so it is no output there.
    expect(listedModel({ id: 'd', max_tokens: 4096 }, 'openai-chat')).toMatchObject({ maxOutput: null })
  })

  it('skips what has no usable id, and numbers that are no token count', () => {
    expect(listedModel({ name: 'no id' }, 'openai-chat')).toBeNull()
    expect(listedModel({ id: 'x'.repeat(201) }, 'openai-chat')).toBeNull()
    expect(listedModel('gpt', 'openai-chat')).toBeNull()
    expect(listedModel({ id: 'e', name: 'e', context_length: -1, max_output_tokens: 1.5 }, 'openai-chat')).toEqual({ id: 'e', label: null, contextWindow: null, maxOutput: null, efforts: [] })
  })
})

describe('fetchProviderModels', () => {
  it('asks one OpenAI base once, with the key as a bearer token', async () => {
    const { base, seen } = await serve(() => ({ status: 200, body: { object: 'list', data: [{ id: 'qwen3.8-max', context_length: 262144 }, { id: 'glm-5.3' }] } }))
    const found = await fetchProviderModels(openai(base), KEY)
    expect(seen.map((each) => each.url)).toEqual(['/v1/models'])
    expect(seen[0]?.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(found.models.map((model) => [model.id, model.contextWindow])).toEqual([['qwen3.8-max', 262144], ['glm-5.3', null]])
    expect(found.endpoints).toEqual([{ wire: 'openai-responses', ok: true, count: 2, status: 200, message: null }])
  })

  it('sends the provider\'s headers under its own auth', async () => {
    const { base, seen } = await serve(() => ({ status: 200, body: { data: [] } }))
    await fetchProviderModels(openai(base), KEY, { headers: { 'User-Agent': 'proxy-client/1', authorization: 'nope' } })
    expect(seen[0]?.headers).toMatchObject({ 'user-agent': 'proxy-client/1', authorization: `Bearer ${KEY}` })
  })

  it('pages an Anthropic list at its own address, and stops on a cursor it has seen', async () => {
    const { base, seen } = await serve(({ url }) => {
      const after = new URL(url, 'http://x').searchParams.get('after_id')
      if (after === null) return { status: 200, body: { data: [{ id: 'm1' }], has_more: true, last_id: 'm1' } }
      if (after === 'm1') return { status: 200, body: { data: [{ id: 'm2' }], has_more: true, last_id: 'm1' } }
      return { status: 500, body: {} }
    })
    const found = await fetchProviderModels(anthropic(base), KEY)
    expect(seen.map((each) => each.url)).toEqual(['/anthropic/v1/models?limit=1000', '/anthropic/v1/models?limit=1000&after_id=m1'])
    expect(seen[0]?.headers).toMatchObject({ 'x-api-key': KEY, 'anthropic-version': '2023-06-01' })
    expect(seen[0]?.headers.authorization).toBeUndefined()
    expect(found.models.map((model) => model.id)).toEqual(['m1', 'm2'])
  })

  it('merges a model several endpoints list, keeping what any of them knows', async () => {
    const { base } = await serve(({ url }) => ({
      status: 200,
      body: url.startsWith('/anthropic') ? { data: [{ id: 'shared', display_name: 'Shared' }, { id: 'only-a' }] } : { data: [{ id: 'shared', context_length: 1_000_000 }, { id: 'only-o' }] }
    }))
    const found = await fetchProviderModels({ ...anthropic(base, 'auth_token'), openai: openai(base).openai }, KEY)
    expect(found.models).toEqual([
      { id: 'shared', label: 'Shared', contextWindow: 1_000_000, maxOutput: null, efforts: [] },
      { id: 'only-a', label: null, contextWindow: null, maxOutput: null, efforts: [] },
      { id: 'only-o', label: null, contextWindow: null, maxOutput: null, efforts: [] }
    ])
  })

  it('keeps the models of the endpoints that answered, and says what the others did without the key', async () => {
    const { base } = await serve(({ url }) => (url.startsWith('/anthropic')
      ? { status: 401, body: { error: { message: `invalid key ${KEY}` } } }
      : { status: 200, body: { data: [{ id: 'ok' }] } }))
    const found = await fetchProviderModels({ ...anthropic(base), openai: openai(base).openai }, KEY)
    expect(found.models.map((model) => model.id)).toEqual(['ok'])
    expect(found.endpoints[0]).toEqual({ wire: 'anthropic', ok: false, count: 0, status: 401, message: 'invalid key ***' })
  })

  it.each([
    ['a reply with no list', { status: 200, body: { hello: 'world' } }, /没有模型列表/],
    ['a reply too large to read', { status: 200, body: 'x'.repeat(4 * 1024 * 1024 + 1) }, /回应太大/],
    ['a redirect', { status: 302, body: {}, location: 'https://elsewhere.example.com/models' }, /连不上/],
    ['no answer in time', { status: 200, body: { data: [] }, delayMs: 500 }, /秒内没有回应/]
  ])('fails on %s', async (_label, answer, message) => {
    const { base } = await serve(() => answer)
    const found = await fetchProviderModels(openai(base), KEY, { timeoutMs: 100 })
    expect(found.models).toEqual([])
    expect(found.endpoints[0]).toMatchObject({ ok: false, message: expect.stringMatching(message) })
  })
})
