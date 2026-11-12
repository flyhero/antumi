import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { PluginManifest, PluginMessage } from '../../protocol/src/plugin'
import { runSourcePlugin } from './source-runtime'
import { SourceError } from './source-error'
import type { SourcePlugin } from './source-plugin'

const manifest = PluginManifest.parse({
  id: 'test.source', version: '1.0.0', engines: { antumi: '>=0.15.11 <1.0.0' },
  contributes: { sources: [{ id: 'demo', name: 'Demo', settings: [] }] },
  entry: { runtime: 'node', main: 'main.mjs' }
})
const source: SourcePlugin = {
  id: 'demo', normalizeSettings: (settings) => ({ ...settings }),
  login: async (session) => {
    session.notify({ message: 'Signing in' })
    const account = await session.prompt({ kind: 'text', label: 'Account' })
    const token = await session.prompt({ kind: 'secret', label: 'Token' })
    return { account, credential: { kind: 'token', payload: { token } } }
  },
  list: async () => [],
  fetch: async () => { throw new SourceError('not-found', 'No such issue') }
}

const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })

function harness(overrides: Partial<SourcePlugin> = {}) {
  const input = new PassThrough()
  const output = new PassThrough()
  const messages: (typeof PluginMessage._output)[] = []
  output.on('data', (chunk: Buffer) => messages.push(PluginMessage.parse(JSON.parse(chunk.toString()))))
  const runtime = runSourcePlugin({ manifest, sources: [{ ...source, ...overrides }], input, output })
  cleanup.push(() => { runtime.close(); input.destroy(); output.destroy() })
  const send = (value: unknown) => input.write(`${JSON.stringify(value)}\n`)
  const call = (method: string, params: unknown) => send({ type: 'call', id: method, method, params })
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
  return { input, messages, send, call, tick, async hello() { call('handshake', { protocolVersion: 1 }); await tick() } }
}

describe('source SDK protocol runtime', () => {
  it('uses the existing v1 handshake and default optional methods', async () => {
    const h = harness()
    await h.hello()
    expect(h.messages[0]).toMatchObject({ type: 'result', result: { protocolVersion: 1, sources: ['demo'] } })
    h.call('normalizeKey', { source: 'demo', key: 'DEMO-1' })
    await h.tick()
    expect(h.messages[1]).toEqual({ type: 'result', id: 'normalizeKey', result: 'DEMO-1' })
  })

  it('dispatches incremental comment pages through the optional v1 operation', async () => {
    const h = harness({ comments: async (_settings, _credential, _key, _signal, options) => ({ comments: [], continuation: null, checkpoint: options.checkpoint }) })
    await h.hello()
    h.call('comments', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} }, key: 'DEMO-1', checkpoint: { createdAt: 1000, ids: ['one'] }, continuation: null })
    await h.tick()
    expect(h.messages[1]).toMatchObject({ type: 'result', result: { comments: [], checkpoint: { createdAt: 1000, ids: ['one'] } } })
  })

  it('hands over a comment image by id, encoded for the host', async () => {
    const h = harness({ image: async (_settings, _credential, key, id) => ({ name: `${key}-${id}.png`, bytes: new Uint8Array([1, 2, 3]) }) })
    await h.hello()
    h.call('image', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} }, key: 'DEMO-1', id: '42' })
    await h.tick(); await h.tick()
    expect(h.messages[1]).toEqual({ type: 'result', id: 'image', result: { name: 'DEMO-1-42.png', base64: 'AQID' } })
  })
  it('requires implementations for advertised comment capabilities', () => {
    expect(() => runSourcePlugin({ manifest: { ...manifest, contributes: { sources: [{ ...manifest.contributes.sources[0], commentSync: 1 }] } }, sources: [source] })).toThrow('comments implementation')
  })

  it('keeps sequential login questions and notifications in the same operation', async () => {
    const h = harness()
    await h.hello()
    h.call('login', { source: 'demo', settings: {} })
    await h.tick()
    expect(h.messages[1]).toEqual({ type: 'notify', notice: { message: 'Signing in' } })
    expect(h.messages[2]).toMatchObject({ type: 'prompt', id: 'prompt-1' })
    h.send({ type: 'answer', id: 'prompt-1', value: 'alice' })
    await h.tick()
    expect(h.messages[3]).toMatchObject({ type: 'prompt', id: 'prompt-2', prompt: { kind: 'secret' } })
    h.send({ type: 'answer', id: 'prompt-2', value: 'secret' })
    await h.tick()
    expect(h.messages[4]).toEqual({ type: 'result', id: 'login', result: { account: 'alice', credential: { kind: 'token', payload: { token: 'secret' } } } })
  })

  it('rejects operations before handshake and unsupported protocol versions', async () => {
    const h = harness()
    h.call('list', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} } })
    await h.tick()
    expect(h.messages[0]).toMatchObject({ type: 'error', error: { code: 'request-failed' } })
    const other = harness()
    other.call('handshake', { protocolVersion: 2 })
    await other.tick()
    expect(other.messages[0]).toMatchObject({ type: 'error' })
  })

  it('validates returned issues without exposing the invalid payload', async () => {
    const h = harness({ list: async () => [{ key: '../secret', title: 'token-secret', url: '', status: '', statusCategory: 'todo', type: '', priority: null, updatedAt: null }] })
    await h.hello()
    h.call('list', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} } })
    await h.tick()
    expect(h.messages[1]).toMatchObject({ type: 'error', error: { code: 'request-failed' } })
    expect(JSON.stringify(h.messages)).not.toContain('token-secret')
  })

  it('preserves deliberate source errors and hides unexpected failures', async () => {
    const h = harness()
    await h.hello()
    h.call('fetch', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} }, key: 'DEMO-1' })
    await h.tick()
    expect(h.messages[1]).toMatchObject({ type: 'error', error: { code: 'not-found', message: 'No such issue' } })
    const other = harness({ list: async () => { throw new Error('token-secret') } })
    await other.hello()
    other.call('list', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} } })
    await other.tick()
    expect(JSON.stringify(other.messages)).not.toContain('token-secret')
  })

  it('tells a plugin whether the images are wanted now, and passes on how many it left out', async () => {
    const asked: unknown[] = []
    const h = harness({ fetch: async (_settings, _credential, key, _signal, options) => {
      asked.push(options)
      return { key, title: 'Demo', url: 'https://example.test/1', status: 'open', statusCategory: 'todo', type: 'Issue', priority: null, updatedAt: null, markdown: 'Text', ...(options?.images === false ? { imagesDeferred: 2 } : {}) }
    } })
    await h.hello()
    h.call('fetch', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} }, key: 'DEMO-1', images: false })
    await h.tick()
    expect(asked).toEqual([{ images: false }])
    expect(h.messages[1]).toMatchObject({ type: 'result', result: { imagesDeferred: 2 } })
    const other = harness({ fetch: async (_settings, _credential, key, _signal, options) => {
      asked.push(options)
      return { key, title: 'Demo', url: 'https://example.test/1', status: 'open', statusCategory: 'todo', type: 'Issue', priority: null, updatedAt: null, markdown: 'Text' }
    } })
    await other.hello()
    other.call('fetch', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} }, key: 'DEMO-1' })
    await other.tick()
    expect(asked[1]).toEqual({ images: true })
  })

  it('aborts a running operation when the host disconnects', async () => {
    let signal: AbortSignal | undefined
    const h = harness({ list: async (_settings, _credential, current) => { signal = current; return new Promise(() => {}) } })
    await h.hello()
    h.call('list', { source: 'demo', settings: {}, credential: { kind: 'token', payload: {} } })
    await h.tick()
    h.input.end()
    await h.tick()
    expect(signal?.aborted).toBe(true)
  })

  it('rejects duplicate source registrations', () => {
    expect(() => runSourcePlugin({ manifest, sources: [source, source] })).toThrow('match the manifest')
  })
})
