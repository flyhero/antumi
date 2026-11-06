import { describe, expect, it } from 'vitest'
import { AGENT_KINDS, agentDescriptor, MODEL_PROVIDER_PRESETS, providerEndpoint, type AgentKind, type ProviderModel } from '@antumi/protocol'
import { adapterOf } from './agents'
import { PROVIDER_KEY_ENV, PROVIDER_MARK_ENV, type ProviderLaunch } from './provider-launch'

const KEY = 'sk-provider-secret-5678'
const models: ProviderModel[] = [
  { id: 'glm-5.3', label: 'GLM-5.3', contextWindow: 1_000_000, maxOutput: 128_000, efforts: ['high'] },
  { id: 'glm-5.3-air', label: null, contextWindow: 128_000, maxOutput: 32_000, efforts: [] },
  { id: 'glm-5.3-flash', label: null, contextWindow: 200_000, maxOutput: null, efforts: [] }
]

function launchOn(agent: AgentKind, preset: keyof typeof MODEL_PROVIDER_PRESETS = 'zhipu-glm-coding'): ProviderLaunch {
  const { anthropic, openai } = MODEL_PROVIDER_PRESETS[preset]
  const endpoint = providerEndpoint({ anthropic, openai, agents: [agent] }, agent)
  if (!endpoint) throw new Error(`${preset} serves no ${agent}`)
  return { providerId: 'glm-1', endpoint, models, defaultModel: 'glm-5.3', smallModel: 'glm-5.3-flash', headers: {}, apiKey: KEY }
}

const start = (agent: AgentKind, provider: ProviderLaunch, model?: string) =>
  adapterOf(agent).command({ providerSessionId: null, resume: false, handoffPath: null, extraProjects: [], provider, ...(model ? { preferred: { model } } : {}) })

describe('starting an agent on a model provider', () => {
  it.each(AGENT_KINDS)('lets %s take a provider exactly where its descriptor says it can', (kind) => {
    expect(Boolean(adapterOf(kind).providerModels)).toBe(agentDescriptor(kind).capabilities.modelProviders.length > 0)
  })

  // ZCode reads a key from a file only: its stage gets one of its own (zcode-provider.test.ts).
  it.each(AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.modelProviders.length > 0 && kind !== 'zcode'))('keeps the key out of %s\'s command line and config, and marks its process', (kind) => {
    const command = start(kind, launchOn(kind))
    expect(command.args.join(' ')).not.toContain(KEY)
    expect(command.env?.OPENCODE_CONFIG_CONTENT ?? '').not.toContain(KEY)
    expect(Object.values(command.env ?? {})).toContain(KEY)
    expect(command.env?.[PROVIDER_MARK_ENV]).toBe('glm-1')
  })

  it('starts ZCode as ever, the key nowhere on its command', () => {
    const command = start('zcode', launchOn('zcode'))
    expect(command).toEqual({ command: 'zcode', args: ['app-server', '--stdio'] })
  })

  it('points Claude at the provider through its environment, over whatever it would inherit', () => {
    const command = start('claude', launchOn('claude'))
    expect(command.env).toMatchObject({
      CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
      ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic', ANTHROPIC_AUTH_TOKEN: KEY, ANTHROPIC_API_KEY: '',
      CLAUDE_CODE_USE_BEDROCK: '', CLAUDE_CODE_USE_VERTEX: '', CLAUDE_CODE_OAUTH_TOKEN: '', ANTHROPIC_MODEL: '',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.3[1m]', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.3-flash',
      // The smallest window under 1M, so no model it may switch to runs past its own.
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: '128000',
      API_TIMEOUT_MS: '3000000'
    })
    expect(command.args.slice(command.args.indexOf('--model'), command.args.indexOf('--model') + 2)).toEqual(['--model', 'glm-5.3[1m]'])
    expect(start('claude', launchOn('claude'), 'glm-5.3-air').args).toContain('glm-5.3-air')
    expect(adapterOf('claude').providerModels?.(launchOn('claude')).map((model) => [model.id, model.label, model.isDefault])).toEqual([
      ['glm-5.3[1m]', 'GLM-5.3', true], ['glm-5.3-air', 'glm-5.3-air', false], ['glm-5.3-flash', 'glm-5.3-flash', false]
    ])
  })

  it('sends Claude\'s key as x-api-key where the provider takes that', () => {
    expect(start('claude', launchOn('claude', 'kimi-code')).env).toMatchObject({ ANTHROPIC_BASE_URL: 'https://api.kimi.com/coding', ANTHROPIC_API_KEY: KEY, ANTHROPIC_AUTH_TOKEN: '', ENABLE_TOOL_SEARCH: 'false' })
  })

  it('gives Codex a model provider of its own that reads the key from its environment', () => {
    const command = start('codex', launchOn('codex', 'volcengine-agent-plan'), 'glm-5.3-air')
    expect(command.args).toEqual(expect.arrayContaining([
      'model_provider="antumi-glm-1"',
      'model_providers.antumi-glm-1={name="antumi-glm-1",base_url="https://ark.cn-beijing.volces.com/api/plan/v3",env_key="ANTUMI_MODEL_PROVIDER_KEY",wire_api="responses",requires_openai_auth=false}',
      'model="glm-5.3-air"',
      'model_context_window=128000',
      // Its shell commands would see the key otherwise.
      'shell_environment_policy.set.ANTUMI_MODEL_PROVIDER_KEY=""'
    ]))
    expect(command.env?.[PROVIDER_KEY_ENV]).toBe(KEY)
    expect(command.args).not.toContain('model_reasoning_summary="none"')
    const quiet = { ...launchOn('codex', 'volcengine-agent-plan'), models: [{ ...models[0]!, reasoningSummaries: false }] }
    expect(start('codex', quiet).args).toContain('model_reasoning_summary="none"')
  })

  it('adds the provider to OpenCode\'s config with a reference to the key, and starts on its model', () => {
    const command = start('opencode', launchOn('opencode'))
    const config = JSON.parse(command.env?.OPENCODE_CONFIG_CONTENT ?? '{}')
    expect(config).toMatchObject({
      model: 'antumi-glm-1/glm-5.3', small_model: 'antumi-glm-1/glm-5.3-flash',
      provider: { 'antumi-glm-1': {
        npm: '@ai-sdk/openai-compatible',
        options: { baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4', apiKey: '{env:ANTUMI_MODEL_PROVIDER_KEY}' },
        models: { 'glm-5.3': { name: 'GLM-5.3', limit: { context: 1_000_000, output: 128_000 }, reasoning: true }, 'glm-5.3-flash': { name: 'glm-5.3-flash' } }
      } }
    })
    // A known context with no known output still limits it, on the output pi and dsh assume.
    expect(config.provider['antumi-glm-1'].models['glm-5.3-flash'].limit).toEqual({ context: 200_000, output: 16_384 })
    const unknown = { ...launchOn('opencode'), models: [{ ...models[0]!, contextWindow: null }] }
    expect(JSON.parse(start('opencode', unknown).env?.OPENCODE_CONFIG_CONTENT ?? '{}').provider['antumi-glm-1'].models['glm-5.3']).not.toHaveProperty('limit')
    const anthropic = JSON.parse(start('opencode', launchOn('opencode', 'minimax')).env?.OPENCODE_CONFIG_CONTENT ?? '{}')
    expect(anthropic.provider['antumi-glm-1']).toMatchObject({
      npm: '@ai-sdk/anthropic',
      options: { baseURL: 'https://api.minimax.io/anthropic/v1', apiKey: '{env:ANTUMI_MODEL_PROVIDER_KEY}', headers: { authorization: 'Bearer {env:ANTUMI_MODEL_PROVIDER_KEY}' } }
    })
    expect(adapterOf('opencode').providerModels?.(launchOn('opencode')).map((model) => model.id)).toEqual(['antumi-glm-1/glm-5.3', 'antumi-glm-1/glm-5.3-air', 'antumi-glm-1/glm-5.3-flash'])
  })

  it('tells the agents that must be told which models read images', () => {
    const seeing = { ...launchOn('opencode'), models: [{ ...models[0]!, images: true }, models[1]!] }
    const opencode = JSON.parse(start('opencode', seeing).env?.OPENCODE_CONFIG_CONTENT ?? '{}').provider['antumi-glm-1'].models
    expect(opencode['glm-5.3'].modalities).toEqual({ input: ['text', 'image'], output: ['text'] })
    expect(opencode['glm-5.3-air']).not.toHaveProperty('modalities')
  })

  it('sends the provider\'s own headers from every agent that can run on it', () => {
    const headers = { 'User-Agent': 'proxy-client/1', 'X-Team': 'antumi' }
    const on = (agent: AgentKind, preset: keyof typeof MODEL_PROVIDER_PRESETS = 'zhipu-glm-coding') => ({ ...launchOn(agent, preset), headers })
    expect(start('claude', on('claude')).env?.ANTHROPIC_CUSTOM_HEADERS).toBe('User-Agent: proxy-client/1\nX-Team: antumi')
    expect(start('claude', launchOn('claude')).env?.ANTHROPIC_CUSTOM_HEADERS).toBe('')
    expect(start('codex', on('codex', 'volcengine-agent-plan')).args.join(' ')).toContain('http_headers={"User-Agent"="proxy-client/1","X-Team"="antumi"}')
    const opencode = JSON.parse(start('opencode', on('opencode')).env?.OPENCODE_CONFIG_CONTENT ?? '{}')
    expect(opencode.provider['antumi-glm-1'].options.headers).toEqual(headers)
    const minimax = JSON.parse(start('opencode', on('opencode', 'minimax')).env?.OPENCODE_CONFIG_CONTENT ?? '{}')
    expect(minimax.provider['antumi-glm-1'].options.headers).toEqual({ ...headers, authorization: 'Bearer {env:ANTUMI_MODEL_PROVIDER_KEY}' })
  })

  it('leaves an agent on its own account without a provider', () => {
    for (const kind of AGENT_KINDS) {
      const command = adapterOf(kind).command({ providerSessionId: null, resume: false, handoffPath: null, extraProjects: [] })
      expect(command.env?.[PROVIDER_MARK_ENV]).toBeUndefined()
      expect(command.args.join(' ')).not.toContain('model_provider')
    }
  })
})
