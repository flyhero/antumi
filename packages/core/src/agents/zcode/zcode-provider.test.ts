import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProviderLaunch } from '../../provider-launch'
import { zcodeProviderConfig, zcodeProviderLaunch, zcodeProviderModels } from './zcode-provider'

const provider = (wire: ProviderLaunch['endpoint']['wire'], baseUrl: string): ProviderLaunch => ({
  providerId: 'zhipu-glm-coding',
  headers: {},
  endpoint: { wire, baseUrl, anthropic: wire === 'anthropic' ? { baseUrl, auth: 'auth_token', env: {} } : null },
  models: [
    { id: 'glm-5.3', label: 'GLM-5.3', contextWindow: 1_000_000, maxOutput: 32_000, efforts: ['low', 'high'] },
    { id: 'glm-5.3-flash', label: null, contextWindow: null, maxOutput: null, efforts: [] }
  ],
  defaultModel: 'glm-5.3',
  smallModel: 'glm-5.3-flash',
  apiKey: 'sk-test'
})

let root: string
beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'antumi-zcode-provider-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('ZCode on a model provider', () => {
  it('offers the provider models under the provider ZCode is given', () => {
    expect(zcodeProviderModels(provider('openai-chat', 'https://x/v4'))).toEqual([
      { id: 'antumi-zhipu-glm-coding/glm-5.3', label: 'GLM-5.3', description: null, efforts: ['low', 'high'], isDefault: true, autoMode: true },
      { id: 'antumi-zhipu-glm-coding/glm-5.3-flash', label: 'glm-5.3-flash', description: null, efforts: [], isDefault: false, autoMode: true }
    ])
  })

  it('tells ZCode which models read images', () => {
    const seeing = { ...provider('openai-chat', 'https://api.example/v1'), models: [{ id: 'v', label: null, contextWindow: null, maxOutput: null, efforts: [], images: true }] }
    const rules = JSON.parse(zcodeProviderConfig(seeing)).config.modelConfigRules.providerModelRules
    expect(rules[0].config.properties).toEqual({ inputFormat: { supportsImage: true } })
  })

  it('names the API, address, models and efforts as ZCode reads them', () => {
    const chat = JSON.parse(zcodeProviderConfig(provider('openai-chat', 'https://open.bigmodel.cn/api/coding/paas/v4/')))
    expect(chat.config.providerConfigRules.providerRules[0]).toMatchObject({
      providerId: 'antumi-zhipu-glm-coding',
      config: { group: 'standard-personal', access: { type: 'api-key', apiKey: 'sk-test' }, api: { type: 'openai-chat-completions', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4' }, personalModelIds: ['glm-5.3', 'glm-5.3-flash'] }
    })
    expect(chat.config.defaultModelSelection).toEqual({ providerId: 'antumi-zhipu-glm-coding', modelId: 'glm-5.3' })
    expect(chat.config.modelConfigRules.providerModelRules).toEqual([
      { providerId: 'antumi-zhipu-glm-coding', modelId: 'glm-5.3', config: { enabled: true, properties: { contextWindow: 1_000_000 }, optionSpecs: { maxOutputTokens: { max: 32_000 }, reasoningLevel: { values: ['low', 'high'], map: 'reasoningLevel == "disabled" ? {} : {"reasoning_effort": reasoningLevel}' } } } },
      { providerId: 'antumi-zhipu-glm-coding', modelId: 'glm-5.3-flash', config: { enabled: true, optionSpecs: {} } }
    ])
    const responses = JSON.parse(zcodeProviderConfig(provider('openai-responses', 'https://open.bigmodel.cn/api/v1')))
    expect(responses.config.providerConfigRules.providerRules[0].config.api).toEqual({ type: 'openai-responses', baseUrl: 'https://open.bigmodel.cn/api/v1', headers: {} })
    expect(responses.config.modelConfigRules.providerModelRules[0].config.optionSpecs.reasoningLevel.map).toBe('reasoningLevel == "disabled" ? {} : {"reasoning": {"effort": reasoningLevel}}')
    // ZCode appends /v1/messages itself.
    const anthropic = JSON.parse(zcodeProviderConfig(provider('anthropic', 'https://open.bigmodel.cn/api/anthropic/v1')))
    expect(anthropic.config.providerConfigRules.providerRules[0].config.api).toEqual({ type: 'anthropic-messages', baseUrl: 'https://open.bigmodel.cn/api/anthropic', headers: {} })
    expect(anthropic.config.modelConfigRules.providerModelRules[0].config.optionSpecs.reasoningLevel).toBeUndefined()
  })

  it.skipIf(process.platform === 'win32')('writes the file in the stage folder alone and points every ZCode path there', async () => {
    const stage = { sessionsRoot: root, conversationId: 'c1', stageId: 's1' }
    const { env } = await zcodeProviderLaunch(stage, provider('anthropic', 'https://api.z.ai/api/anthropic'))
    const dir = path.join(root, 'c1', 'launch', 's1')
    expect(env).toEqual({
      ZCODE_DATA_BASE_DIR: dir,
      ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: path.join(dir, '.zcode', 'v2', 'provider_config.json'),
      ZCODE_CLI_CREDENTIALS_FILE: path.join(dir, '.zcode', 'v2', 'credentials.json'),
      ANTUMI_MODEL_PROVIDER: 'zhipu-glm-coding'
    })
    expect(statSync(dir).mode & 0o777).toBe(0o700)
    expect(statSync(env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE!).mode & 0o777).toBe(0o600)
    expect(readFileSync(env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE!, 'utf8')).toContain('"apiKey": "sk-test"')
    // The key is in the file only, never in the process environment.
    expect(Object.values(env).join(' ')).not.toContain('sk-test')
  })
})
