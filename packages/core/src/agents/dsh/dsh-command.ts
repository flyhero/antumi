import path from 'node:path'
import { DSH_CONFIG_ENV, DSH_PROVIDER_KEY_ENV, DshRuntimeConfig, DshMode } from '@antumi/protocol'
import { antumiReadTools, type AgentCommand } from '../../agent-command'
import type { AgentLaunch } from '../agent-adapter'
import { PROVIDER_MARK_ENV, providerChatModels, type ProviderLaunch } from '../../provider-launch'
import { anthropicBaseUrl } from '../../provider-request'

export const DSH_PROVIDER_ENV = 'ANTUMI_DSH_PROVIDER'
const providerName = (provider: Pick<ProviderLaunch, 'providerId'>) => `antumi-${provider.providerId}`
const LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
export const dshProviderModels = (provider: Pick<ProviderLaunch, 'providerId' | 'models' | 'defaultModel'>) => providerChatModels(provider, (model) => JSON.stringify([providerName(provider), model.id])).map((model) => ({ ...model, efforts: model.efforts.filter((level) => LEVELS.has(level)) }))

export function dshProvider(provider: ProviderLaunch): Record<string, unknown> {
  const anthropic = provider.endpoint.wire === 'anthropic'
  return { [providerName(provider)]: {
    displayName: provider.providerId,
    apiKeyEnv: DSH_PROVIDER_KEY_ENV,
    api: anthropic ? 'anthropic-messages' : provider.endpoint.wire === 'openai-responses' ? 'openai-responses' : 'openai-completions',
    baseURL: anthropic ? anthropicBaseUrl(provider.endpoint.baseUrl) : provider.endpoint.baseUrl.replace(/\/+$/, ''),
    ...(Object.keys(provider.headers).length || (anthropic && provider.endpoint.anthropic?.auth === 'auth_token')
      ? { headers: { ...provider.headers, ...(anthropic && provider.endpoint.anthropic?.auth === 'auth_token' ? { authorization: `Bearer \${${DSH_PROVIDER_KEY_ENV}}` } : {}) } }
      : {}),
    models: provider.models.map((model) => ({
      id: model.id, name: model.label ?? model.id, input: ['text'],
      contextWindow: model.contextWindow ?? 128_000, maxTokens: model.maxOutput ?? 16_384,
      reasoningEfforts: model.efforts.some((level) => LEVELS.has(level)) ? Object.fromEntries(model.efforts.filter((level) => LEVELS.has(level)).map((level) => [level, level])) : false
    }))
  } }
}

export function dshRuntimeConfig(launch: AgentLaunch): DshRuntimeConfig {
  const lock = launch.planOnly ? 'plan' : launch.readOnly ? 'readOnly' : null
  const wanted = DshMode.safeParse(launch.preferred?.permissionMode)
  const mode = lock ?? (wanted.success && (wanted.data !== 'bypass' || launch.allowBypass) ? wanted.data : 'ask')
  return {
    mode, lock, allowBypass: Boolean(launch.allowBypass) && !lock,
    workDirs: [...launch.extraProjects, ...(launch.knowledgeBase?.write ? [launch.knowledgeBase.path] : [])],
    noEdit: [...(launch.planOnly?.dirs ?? launch.readOnly?.dirs ?? []), ...(launch.references ?? []), ...(launch.knowledgeBase && !launch.knowledgeBase.write ? [launch.knowledgeBase.path] : [])],
    readTools: antumiReadTools(launch.todos !== false).map((tool) => `mcp__antumi__${tool}`),
    skills: launch.skills ? [path.join(launch.skills.dir, '.agents', 'skills')] : [],
    ...(launch.provider ? { initialModel: { provider: providerName(launch.provider), model: launch.provider.defaultModel } } : {})
  }
}

export function dshCommand(launch: AgentLaunch): AgentCommand {
  return {
    command: 'dsh', args: ['--profile', 'antumi'],
    env: {
      [DSH_CONFIG_ENV]: JSON.stringify(dshRuntimeConfig(launch)),
      ...(launch.provider ? {
        [DSH_PROVIDER_ENV]: JSON.stringify(dshProvider(launch.provider)),
        [DSH_PROVIDER_KEY_ENV]: launch.provider.apiKey,
        [PROVIDER_MARK_ENV]: launch.provider.providerId
      } : {})
    }
  }
}
