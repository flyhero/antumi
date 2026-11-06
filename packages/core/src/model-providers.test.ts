import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MODEL_PROVIDER_PRESETS, type ModelProviderInput } from '@antumi/protocol'
import { CredentialStore } from './credential-store'
import { ModelProviderStore } from './model-providers'

const KEY = 'sk-ark-secret-key-1234'
const models = [{ id: 'ark-code-latest', label: null, contextWindow: null, maxOutput: null, efforts: [] }]
const preset = (changes: Partial<ModelProviderInput> = {}): ModelProviderInput => ({
  id: null, name: '火山', preset: 'volcengine-agent-plan', models, defaultModel: 'ark-code-latest', smallModel: 'ark-code-latest',
  agents: ['claude', 'codex', 'opencode'], apiKey: KEY, ...changes
})
const custom = (changes: Partial<ModelProviderInput> = {}): ModelProviderInput => preset({
  name: 'Gateway', preset: 'custom', agents: ['claude'],
  anthropic: { baseUrl: 'http://127.0.0.1:4000', auth: 'auth_token', env: {} }, openai: null, ...changes
})

describe('ModelProviderStore', () => {
  let dir: string
  let file: string
  let credentials: CredentialStore
  let store: ModelProviderStore
  let seq: number
  beforeEach(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-providers-'))
    file = path.join(dir, 'model-providers.json')
    credentials = new CredentialStore(path.join(dir, 'credentials.json'))
    await credentials.load()
    seq = 0
    store = new ModelProviderStore(file, credentials, () => {}, (kind) => `${kind}-${++seq}`)
    await store.load()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps the key out of its file, and a preset\'s endpoints in the preset table', async () => {
    const saved = await store.save(preset())
    expect(saved).toMatchObject({ id: 'volcengine-agent-plan-1', hasKey: true, revision: 1, anthropic: { baseUrl: 'https://ark.cn-beijing.volces.com/api/plan' } })
    const text = await readFile(file, 'utf8')
    expect(text).not.toContain(KEY)
    expect(JSON.parse(text).providers[0]).toMatchObject({ anthropic: null, openai: null })
    expect(store.resolve(saved.id)?.apiKey).toBe(KEY)
    expect(JSON.stringify(store.list())).not.toContain(KEY)
  })

  it('keeps a preset\'s own models as the preset\'s, so they follow it, and an edited list as given', async () => {
    const own = MODEL_PROVIDER_PRESETS['volcengine-agent-plan']
    const followed = await store.save(preset({ models: [...own.models], defaultModel: own.defaultModel, smallModel: own.smallModel }))
    expect(followed).toMatchObject({ modelsFromPreset: true, defaultModel: own.defaultModel })
    expect(followed.models.map((model) => model.id)).toEqual(own.models.map((model) => model.id))
    expect(JSON.parse(await readFile(file, 'utf8')).providers[0]).toMatchObject({ models: null, defaultModel: null, smallModel: null })
    const edited = await store.save(preset({ id: followed.id, apiKey: null }))
    expect(edited).toMatchObject({ modelsFromPreset: false, models, defaultModel: 'ark-code-latest' })
  })

  it('gives a model the preset no longer lists way to the preset\'s default', async () => {
    const own = MODEL_PROVIDER_PRESETS['zhipu-glm-coding']
    await writeFile(file, JSON.stringify({ version: 1, providers: [{
      id: 'zhipu-glm-coding-9', name: '智谱', preset: 'zhipu-glm-coding', anthropic: null, openai: null,
      models: null, defaultModel: 'glm-4.5-retired', smallModel: null, agents: ['claude'], keyRef: null, revision: 1, createdAt: 1, updatedAt: 1
    }] }))
    await store.load()
    expect(store.get('zhipu-glm-coding-9')).toMatchObject({ modelsFromPreset: true, defaultModel: own.defaultModel, smallModel: own.smallModel })
  })

  it('ignores endpoints given for a preset', async () => {
    const saved = await store.save(preset({ anthropic: { baseUrl: 'https://evil.example.com', auth: 'auth_token', env: {} } }))
    expect(saved.anthropic?.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/plan')
  })

  it('keeps the key an edit leaves out, and swaps in a new one without leaving the old behind', async () => {
    const first = await store.save(preset())
    const renamed = await store.save(preset({ id: first.id, name: '火山 2', apiKey: null }))
    expect(renamed).toMatchObject({ name: '火山 2', revision: 2, hasKey: true })
    expect(store.resolve(first.id)?.apiKey).toBe(KEY)
    await store.save(preset({ id: first.id, apiKey: 'sk-new' }))
    expect(store.resolve(first.id)?.apiKey).toBe('sk-new')
    expect(credentials.instances('model-provider')).toEqual([`${first.id}.3`])
  })

  it('drops a key nothing names when it loads', async () => {
    const saved = await store.save(preset())
    await credentials.set('model-provider', `${saved.id}.9`, { kind: 'model-provider', payload: { apiKey: 'orphan' }, account: null, updatedAt: 0 })
    const reloaded = new ModelProviderStore(file, credentials)
    await reloaded.load()
    expect(credentials.instances('model-provider')).toEqual([`${saved.id}.1`])
    expect(reloaded.resolve(saved.id)?.apiKey).toBe(KEY)
  })

  it('removes a provider with its key', async () => {
    const saved = await store.save(preset())
    await store.remove(saved.id)
    expect(store.list()).toEqual([])
    expect(credentials.instances('model-provider')).toEqual([])
  })

  it.each([
    ['a new provider without a key', preset({ apiKey: null }), 'model-provider-key-missing'],
    ['a default model not in the list', preset({ defaultModel: 'other' }), 'model-provider-model-missing'],
    ['the same model twice', preset({ models: [...models, ...models] }), 'model-provider-model-missing'],
    ['an agent the endpoints can\'t serve', preset({ preset: 'kimi-code', models: [{ ...models[0]!, id: 'kimi-for-coding' }], defaultModel: 'kimi-for-coding', smallModel: 'kimi-for-coding', agents: ['codex'] }), 'model-provider-agent-unsupported'],
    ['a custom provider with no endpoint', custom({ anthropic: null }), 'model-provider-endpoint-missing'],
    ['plain http to another machine', custom({ anthropic: { baseUrl: 'http://gateway.example.com', auth: 'auth_token', env: {} } }), 'model-provider-insecure-url'],
    ['credentials in the address', custom({ anthropic: { baseUrl: 'https://u:p@gateway.example.com', auth: 'auth_token', env: {} } }), 'model-provider-insecure-url']
  ])('refuses %s', async (_label, input, reason) => {
    await expect(store.save(input)).rejects.toMatchObject({ reason })
    expect(store.list()).toEqual([])
  })

  it('keeps a key only for the addresses it was saved with', async () => {
    const saved = await store.save(custom())
    const moved = { anthropic: { baseUrl: 'https://evil.example.com', auth: 'auth_token' as const, env: {} } }
    await expect(store.save(custom({ id: saved.id, apiKey: null, ...moved }))).rejects.toMatchObject({ reason: 'model-provider-key-missing' })
    await expect(store.fetchModels({ id: saved.id, preset: 'custom', ...moved, openai: null, apiKey: null })).rejects.toMatchObject({ reason: 'model-provider-key-missing' })
    await expect(store.save(custom({ id: saved.id, apiKey: null, preset: 'volcengine-agent-plan' }))).rejects.toMatchObject({ reason: 'model-provider-key-missing' })
    // A new key may go anywhere; the old one stays where it was.
    expect(await store.save(custom({ id: saved.id, apiKey: 'sk-evil', ...moved }))).toMatchObject({ anthropic: { baseUrl: 'https://evil.example.com' } })
    expect(store.resolve(saved.id)?.apiKey).toBe('sk-evil')
    await expect(store.fetchModels({ id: null, preset: 'custom', anthropic: null, openai: null, apiKey: KEY })).rejects.toMatchObject({ reason: 'model-provider-endpoint-missing' })
  })

  it('keeps a preset\'s model with a context of the user\'s own as the user\'s', async () => {
    const own = MODEL_PROVIDER_PRESETS['zhipu-glm-coding']
    const sized = own.models.map((model, index) => (index === 0 ? { ...model, contextWindow: 64_000, maxOutput: 8_000 } : model))
    const saved = await store.save(preset({ preset: 'zhipu-glm-coding', models: sized, defaultModel: own.defaultModel, smallModel: own.smallModel, agents: ['claude'] }))
    expect(saved.modelsFromPreset).toBe(false)
    expect(saved.models[0]).toMatchObject({ contextWindow: 64_000, maxOutput: 8_000, efforts: own.models[0]?.efforts })
    const restored = await store.save(preset({ id: saved.id, apiKey: null, preset: 'zhipu-glm-coding', models: [...own.models], defaultModel: own.defaultModel, smallModel: own.smallModel, agents: ['claude'] }))
    expect(restored.modelsFromPreset).toBe(true)
  })

  it('takes a custom provider\'s own endpoints, and http on this machine', async () => {
    const saved = await store.save(custom())
    expect(saved).toMatchObject({ preset: 'custom', anthropic: { baseUrl: 'http://127.0.0.1:4000' }, agents: ['claude'] })
  })
})
