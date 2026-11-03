import { describe, expect, it } from 'vitest'
import { MODEL_PROVIDER_PRESETS } from './model-provider-presets'
import { AnthropicEndpoint, MODEL_PROVIDER_PRESET_IDS, ModelProvider, OpenAiEndpoint, ProviderModel, providerEndpoint, providerRouteKey, providerUrlProblem, providerWireFor } from './model-provider'

const provider = (changes: Partial<ModelProvider> = {}): ModelProvider => ({
  id: 'p1', name: 'P', preset: 'custom',
  anthropic: { baseUrl: 'https://a.example.com/anthropic', auth: 'auth_token', env: {} },
  openai: { chatUrl: 'https://a.example.com/v1', responsesUrl: null },
  models: [{ id: 'm', label: null, contextWindow: null, maxOutput: null, efforts: [] }],
  defaultModel: 'm', smallModel: 'm', agents: ['claude', 'codex', 'opencode', 'cursor'],
  hasKey: true, revision: 1, createdAt: 0, updatedAt: 0, ...changes
})

describe('model provider presets', () => {
  it.each(MODEL_PROVIDER_PRESET_IDS)('%s is a provider every agent it names can reach', (id) => {
    const preset = MODEL_PROVIDER_PRESETS[id]
    if (preset.anthropic) expect(AnthropicEndpoint.safeParse(preset.anthropic).success).toBe(true)
    if (preset.openai) expect(OpenAiEndpoint.safeParse(preset.openai).success).toBe(true)
    for (const model of preset.models) expect(ProviderModel.safeParse(model).success).toBe(true)
    const ids = preset.models.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(preset.defaultModel)
    expect(ids).toContain(preset.smallModel)
    for (const agent of preset.agents) expect(providerWireFor(preset, agent), agent).not.toBeNull()
    for (const url of [preset.keyUrl, preset.consoleUrl, preset.docsUrl]) expect(new URL(url).protocol).toBe('https:')
  })

  it('names Cursor in none, which runs only on its own account', () => {
    for (const preset of Object.values(MODEL_PROVIDER_PRESETS)) expect(preset.agents).not.toContain('cursor')
  })

  it('reads a provider of a preset it does not know as a custom one, keeping its endpoints', () => {
    const read = ModelProvider.parse({ ...provider(), preset: 'some-later-plan' })
    expect(read).toMatchObject({ preset: 'custom', anthropic: provider().anthropic, openai: provider().openai })
    expect(ModelProvider.parse(provider({ preset: 'deepseek' })).preset).toBe('deepseek')
  })
})

describe('providerUrlProblem', () => {
  it('takes https anywhere and plain http only on this machine', () => {
    expect(providerUrlProblem('https://ark.cn-beijing.volces.com/api/plan')).toBeNull()
    expect(providerUrlProblem('http://127.0.0.1:3425/v1')).toBeNull()
    expect(providerUrlProblem('http://localhost:8080')).toBeNull()
    expect(providerUrlProblem('http://example.com/v1')).toBe('insecure')
    expect(providerUrlProblem('ftp://example.com')).toBe('invalid')
    expect(providerUrlProblem('not a url')).toBe('invalid')
  })

  it('refuses an address that would carry a secret into config or a command line', () => {
    expect(providerUrlProblem('https://user:pass@example.com/v1')).toBe('credentials')
    expect(providerUrlProblem('https://example.com/v1?key=abc')).toBe('query')
    expect(providerUrlProblem('https://example.com/v1#frag')).toBe('query')
  })
})

describe('providerEndpoint', () => {
  it('gives each agent the first wire it prefers that the provider serves', () => {
    const both = provider({ openai: { chatUrl: 'https://a.example.com/chat', responsesUrl: 'https://a.example.com/responses' } })
    expect(providerEndpoint(both, 'claude')).toMatchObject({ wire: 'anthropic', baseUrl: 'https://a.example.com/anthropic' })
    expect(providerEndpoint(both, 'codex')).toMatchObject({ wire: 'openai-responses', baseUrl: 'https://a.example.com/responses' })
    expect(providerEndpoint(both, 'opencode')).toMatchObject({ wire: 'openai-chat' })
    expect(providerEndpoint(provider({ openai: { chatUrl: null, responsesUrl: 'https://a.example.com/v1' } }), 'opencode')).toMatchObject({ wire: 'openai-responses' })
  })

  it('serves no agent the provider leaves out, none that lacks the wire, and never Cursor', () => {
    expect(providerEndpoint(provider({ agents: ['claude'] }), 'opencode')).toBeNull()
    expect(providerEndpoint(provider(), 'codex')).toBeNull()
    expect(providerEndpoint(provider({ anthropic: null }), 'claude')).toBeNull()
    expect(providerWireFor(provider(), 'cursor')).toBeNull()
  })

  it('keys a route by provider, wire and address alone', () => {
    const endpoint = providerEndpoint(provider(), 'claude')
    if (!endpoint) throw new Error('expected an endpoint')
    expect(providerRouteKey('p1', endpoint)).toBe('p1|anthropic|https://a.example.com/anthropic')
  })
})
