import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { anthropicMessagesUrl, askProvider, failureText } from './provider-request'
import { probeModelProvider } from './model-provider-probe'

type Seen = { method: string | undefined; url: string | undefined; headers: IncomingHttpHeaders; body: Record<string, unknown> }

let server: Server | null = null
const portOf = (listening: Server | null) => {
  const address = listening?.address()
  return typeof address === 'object' && address ? address.port : 0
}
afterEach(() => { server?.close(); server = null })

// A provider at a local address: answers each path as its wire would, or with the given status.
async function serve(answer: (seen: Seen) => { status: number; body: unknown; location?: string }): Promise<{ base: string; seen: Seen[] }> {
  const seen: Seen[] = []
  server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk: Buffer) => { raw += chunk.toString() })
    request.on('end', () => {
      const entry = { method: request.method, url: request.url, headers: request.headers, body: raw ? JSON.parse(raw) : {} }
      seen.push(entry)
      const { status, body, location } = answer(entry)
      response.writeHead(status, { 'content-type': 'application/json', ...(location ? { location } : {}) })
      response.end(JSON.stringify(body))
    })
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  return { base: `http://127.0.0.1:${portOf(server)}`, seen }
}

describe('askProvider', () => {
  it('sends each wire its own path, auth header and body, and reads the reply', async () => {
    const { base, seen } = await serve(({ url }) => ({
      status: 200,
      body: url?.endsWith('/v1/messages') ? { content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 3, output_tokens: 1 } }
        : url?.endsWith('/responses') ? { output: [{ content: [{ type: 'output_text', text: 'hi' }] }], usage: { input_tokens: 3, output_tokens: 1 } }
        : { choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }
    }))
    const anthropic = { baseUrl: `${base}/api/plan`, auth: 'auth_token' as const, env: {} }
    expect(await askProvider({ endpoint: { wire: 'anthropic', baseUrl: anthropic.baseUrl, anthropic }, apiKey: 'k', model: 'm' }, 'q')).toMatchObject({ ok: true, text: 'hi', usage: { input: 3, output: 1 } })
    const keyed = { ...anthropic, auth: 'api_key' as const }
    await askProvider({ endpoint: { wire: 'anthropic', baseUrl: `${base}/coding/`, anthropic: keyed }, apiKey: 'k2', model: 'm' }, 'q')
    expect(await askProvider({ endpoint: { wire: 'openai-responses', baseUrl: `${base}/api/plan/v3`, anthropic: null }, apiKey: 'k', model: 'm' }, 'q')).toMatchObject({ ok: true, text: 'hi' })
    expect(await askProvider({ endpoint: { wire: 'openai-chat', baseUrl: `${base}/paas/v4/`, anthropic: null }, apiKey: 'k', model: 'm' }, 'q')).toMatchObject({ ok: true, text: 'hi', usage: { input: 3, output: 1 } })
    expect(seen.map((entry) => entry.url)).toEqual(['/api/plan/v1/messages', '/coding/v1/messages', '/api/plan/v3/responses', '/paas/v4/chat/completions'])
    expect(seen[0]?.headers.authorization).toBe('Bearer k')
    expect(seen[0]?.headers['anthropic-version']).toBe('2023-06-01')
    expect(seen[1]?.headers['x-api-key']).toBe('k2')
    expect(seen[1]?.headers.authorization).toBeUndefined()
    expect(seen[2]?.body).toMatchObject({ model: 'm', store: false })
  })

  it('reports what a refusal said without the key, and never follows a redirect', async () => {
    const { base } = await serve(({ url }) => url?.includes('redirect')
      ? { status: 302, body: {}, location: 'https://elsewhere.example.com' }
      : { status: 401, body: { error: { message: 'invalid key sk-secret-1' } } })
    expect(await askProvider({ endpoint: { wire: 'openai-chat', baseUrl: base, anthropic: null }, apiKey: 'sk-secret-1', model: 'm' }, 'q')).toMatchObject({ ok: false, status: 401, message: 'invalid key ***' })
    const redirected = await askProvider({ endpoint: { wire: 'openai-chat', baseUrl: `${base}/redirect`, anthropic: null }, apiKey: 'k', model: 'm' }, 'q')
    expect(redirected.ok).toBe(false)
  })

  it('gives up after its timeout', async () => {
    server = createServer(() => {})
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const reply = await askProvider({ endpoint: { wire: 'openai-chat', baseUrl: `http://127.0.0.1:${portOf(server)}`, anthropic: null }, apiKey: 'k', model: 'm' }, 'q', { timeoutMs: 200 })
    expect(reply).toMatchObject({ ok: false, status: null })
  })
})

describe('anthropicMessagesUrl and failureText', () => {
  it('puts /v1/messages on an address once', () => {
    expect(anthropicMessagesUrl('https://a.example.com/api/anthropic')).toBe('https://a.example.com/api/anthropic/v1/messages')
    expect(anthropicMessagesUrl('https://a.example.com/v1')).toBe('https://a.example.com/v1/messages')
    expect(anthropicMessagesUrl('https://a.example.com/v1/messages/')).toBe('https://a.example.com/v1/messages')
  })

  it('shortens what it shows', () => {
    expect(failureText('x'.repeat(500), 'k').length).toBeLessThan(310)
  })
})

describe('probeModelProvider', () => {
  it('asks every endpoint with the default and small model', async () => {
    const { base, seen } = await serve(({ body }) => (body.model === 'small' ? { status: 404, body: { error: { message: 'model not found' } } } : { status: 200, body: { choices: [{ message: { content: 'ok' } }] } }))
    const probe = await probeModelProvider({ anthropic: null, openai: { chatUrl: base, responsesUrl: null }, defaultModel: 'big', smallModel: 'small' }, 'k')
    expect(probe.ok).toBe(false)
    expect(probe.checks.map((check) => [check.wire, check.model, check.ok, check.status])).toEqual([['openai-chat', 'big', true, 200], ['openai-chat', 'small', false, 404]])
    expect(seen).toHaveLength(2)
  })

  it('asks one request at a time, and stops once the provider refuses the key or asks to slow down', async () => {
    const { base, seen } = await serve(({ url }) => (url?.endsWith('/v1/messages')
      ? { status: 429, body: { error: { message: 'slow down' } } }
      : { status: 200, body: { choices: [{ message: { content: 'ok' } }] } }))
    const probe = await probeModelProvider({ anthropic: { baseUrl: base, auth: 'api_key', env: {} }, openai: { chatUrl: base, responsesUrl: null }, defaultModel: 'big', smallModel: 'small' }, 'k')
    expect(probe.ok).toBe(false)
    expect(probe.checks.map((check) => [check.wire, check.model, check.status])).toEqual([['anthropic', 'big', 429]])
    // Asked one at a time, nothing went out after the 429: the Chat endpoint was never reached.
    expect(seen).toHaveLength(1)
  })

  it('does not ask an endpoint that does not answer again for its other model', async () => {
    const probe = await probeModelProvider({ anthropic: null, openai: { chatUrl: 'http://127.0.0.1:9/v1', responsesUrl: null }, defaultModel: 'big', smallModel: 'small' }, 'k', { timeoutMs: 2_000 })
    expect(probe.checks).toHaveLength(1)
    expect(probe.checks[0]).toMatchObject({ ok: false, status: null })
  })

  it('sends the provider\'s headers, and leaves out the small model where small jobs do not go to it', async () => {
    const { base, seen } = await serve(() => ({ status: 200, body: { choices: [{ message: { content: 'ok' } }] } }))
    const probe = await probeModelProvider({ anthropic: null, openai: { chatUrl: base, responsesUrl: null }, defaultModel: 'big', smallModel: 'small', headers: { 'User-Agent': 'proxy-client/1', 'Content-Type': 'text/plain' }, smallJobs: 'account' }, 'k')
    expect(probe.checks.map((check) => check.model)).toEqual(['big'])
    expect(seen[0]?.headers).toMatchObject({ 'user-agent': 'proxy-client/1', 'content-type': 'application/json', authorization: 'Bearer k' })
  })
})
