import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { ChatModel, ProviderModel } from '@antumi/protocol'
import { PROVIDER_MARK_ENV, providerChatModels, type ProviderLaunch } from '../../provider-launch'
import { anthropicBaseUrl } from '../../provider-request'
import { launchDir, launchRoot, privateDir, writePrivateFile, type StageRef } from '../../stage-launch'

// ZCode reads a model provider, key and all, only from its provider file (~/.zcode/v2/
// provider_config.json under its data folder): no variable or flag takes a key, and `${VAR}` in the
// file is sent as written. So a stage on a provider gets a data folder of its own, in the stage's
// private launch folder, holding a provider file with that one provider; ZCode keeps sessions,
// settings and logs under the user's home as ever, and core removes the folder once the process
// exits. The folder also hides the user's own providers and Z.ai sign-in from that process.

const providerId = (provider: Pick<ProviderLaunch, 'providerId'>) => `antumi-${provider.providerId}`

export function zcodeProviderModels(provider: Pick<ProviderLaunch, 'providerId' | 'models' | 'defaultModel'>): ChatModel[] {
  // Its guarded mode asks only where there is risk, whatever the model.
  return providerChatModels(provider, (model) => `${providerId(provider)}/${model.id}`).map((model) => ({ ...model, autoMode: true }))
}

// The API ZCode speaks to the endpoint, and the address it is given: ZCode appends
// /chat/completions, /responses, or /v1/messages to it (sending the key as a bearer token and as
// x-api-key there, so either kind of Anthropic endpoint takes it).
function api(provider: ProviderLaunch): { type: string; baseUrl: string } {
  const { endpoint } = provider
  if (endpoint.wire === 'anthropic') return { type: 'anthropic-messages', baseUrl: anthropicBaseUrl(endpoint.baseUrl) }
  return { type: endpoint.wire === 'openai-responses' ? 'openai-responses' : 'openai-chat-completions', baseUrl: endpoint.baseUrl.replace(/\/+$/, '') }
}

// A model's rule: its context window where the provider names one, its output cap, and its
// reasoning efforts as ZCode's thought levels, put into the request as the wire takes them. A model
// with none named keeps ZCode's defaults.
function modelRule(provider: ProviderLaunch, model: ProviderModel): Record<string, unknown> {
  const wire = provider.endpoint.wire
  const effort = wire === 'openai-responses' ? '{"reasoning": {"effort": reasoningLevel}}' : '{"reasoning_effort": reasoningLevel}'
  const reasoning = model.efforts.length && wire !== 'anthropic'
    ? { reasoningLevel: { values: model.efforts, map: `reasoningLevel == "disabled" ? {} : ${effort}` } }
    : {}
  return {
    providerId: providerId(provider),
    modelId: model.id,
    config: {
      enabled: true,
      ...(model.contextWindow !== null ? { properties: { contextWindow: model.contextWindow } } : {}),
      optionSpecs: { ...(model.maxOutput !== null ? { maxOutputTokens: { max: model.maxOutput } } : {}), ...reasoning }
    }
  }
}

export function zcodeProviderConfig(provider: ProviderLaunch): string {
  const id = providerId(provider)
  const models = provider.models.map((model) => model.id)
  return JSON.stringify({
    schemaVersion: 1,
    config: {
      providerConfigRules: {
        providerRules: [{
          providerId: id,
          providerName: provider.providerId,
          enabled: true,
          config: { group: 'standard-personal', access: { type: 'api-key', apiKey: provider.apiKey }, api: { ...api(provider), headers: { ...provider.headers } }, personalModelIds: models, modelOrder: models, visibility: 'visible' }
        }]
      },
      modelConfigRules: { providerModelRules: provider.models.map((model) => modelRule(provider, model)), manualProviderModelRules: [] },
      providerOrder: [id],
      defaultModelSelection: { providerId: id, modelId: provider.defaultModel }
    }
  }, null, 2)
}

// Writes the stage's ZCode data folder and names it, and every file ZCode might read a provider or
// a sign-in from, to the process: an inherited variable pointing elsewhere never wins.
export async function zcodeProviderLaunch(stage: StageRef, provider: ProviderLaunch): Promise<{ env: Record<string, string> }> {
  const dir = launchDir(stage)
  await privateDir(launchRoot(stage.sessionsRoot, stage.conversationId))
  await privateDir(dir)
  const v2 = path.join(dir, '.zcode', 'v2')
  await mkdir(v2, { recursive: true, mode: 0o700 })
  const file = path.join(v2, 'provider_config.json')
  await writePrivateFile(file, zcodeProviderConfig(provider))
  return {
    env: {
      ZCODE_DATA_BASE_DIR: dir,
      ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: file,
      ZCODE_CLI_CREDENTIALS_FILE: path.join(v2, 'credentials.json'),
      [PROVIDER_MARK_ENV]: provider.providerId
    }
  }
}
