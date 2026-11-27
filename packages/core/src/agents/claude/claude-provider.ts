import type { ChatModel, ProviderModel } from '@antumi/protocol'
import { PROVIDER_MARK_ENV, providerChatModels, type ProviderLaunch } from '../../provider-launch'
import { anthropicBaseUrl, CLAUDE_1M_CONTEXT, parseClaudeModelId } from '../../provider-request'

// Claude Code takes a model it does not know as 200k tokens of context, unless its id ends [1m];
// that suffix it strips before a request.
export function claudeModelId(model: ProviderModel): string {
  const parsed = parseClaudeModelId(model.id)
  const oneMillion = parsed.oneMillion || (model.contextWindow !== null && model.contextWindow >= CLAUDE_1M_CONTEXT)
  return oneMillion ? `${parsed.id}[1m]` : parsed.id
}

export function claudeLaunchModelId(model: string): string {
  const parsed = parseClaudeModelId(model)
  return parsed.oneMillion ? `${parsed.id}[1m]` : parsed.id
}

export function matchClaudeProviderModel(model: string, offered: readonly ChatModel[]): ChatModel | undefined {
  const exact = offered.find((each) => each.id === model)
  if (exact) return exact
  const parsed = parseClaudeModelId(model)
  return parsed.oneMillion ? offered.find((each) => each.id === `${parsed.id}[1m]`) : undefined
}

export function claudeProviderModels(provider: Pick<ProviderLaunch, 'models' | 'defaultModel'>): ChatModel[] {
  const models = new Map<string, { row: ChatModel; label: string | null }>()
  for (const [index, row] of providerChatModels(provider, claudeModelId).entries()) {
    const existing = models.get(row.id)
    const label = existing?.label ?? provider.models[index]?.label ?? null
    const merged: ChatModel = {
      ...(existing?.row ?? row),
      label: label ?? existing?.row.label ?? row.label,
      isDefault: existing?.row.isDefault || row.isDefault
    }
    models.set(row.id, { row: merged, label })
  }
  return [...models.values()].map(({ row }) => row)
}

// Read before ANTHROPIC_BASE_URL decides where requests go: inherited from Antumi's own
// environment, any would send the stage elsewhere. The daemon cannot unset a variable, so these
// are set empty, which Claude Code reads as unset.
const CLEARED = [
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS',
  'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_GATEWAY', 'CLAUDE_CODE_USE_MANTLE',
  'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_CUSTOM_HEADERS',
  // It would pin the model over a switch made mid-chat (--model goes on the command line instead).
  'ANTHROPIC_MODEL'
]

// Claude Code on a provider, all through its environment: the user's settings.json may name an
// endpoint and key of its own, and MANAGED_BY_HOST makes the environment win over it. Its shell
// commands already run without the key; SUBPROCESS_ENV_SCRUB would add nothing but force every
// stage into the default permission mode (both checked on 2.1.288). The model aliases a subagent or
// command may name (opus, sonnet, haiku) map to the provider's models; a subagent that inherits
// runs on the chat's model.
export function claudeProviderEnv(provider: ProviderLaunch): Record<string, string> {
  const anthropic = provider.endpoint.anthropic
  const byId = (id: string) => provider.models.find((model) => model.id === id)
  const named = (id: string) => {
    const model = byId(id)
    return model ? claudeModelId(model) : claudeLaunchModelId(id)
  }
  // One limit for every model the chat may switch to, so the smallest of those under 1M.
  const windows = provider.models.flatMap((model) =>
    !parseClaudeModelId(model.id).oneMillion && model.contextWindow !== null && model.contextWindow < CLAUDE_1M_CONTEXT ? [model.contextWindow] : [])
  const headers = Object.entries(provider.headers)
  return {
    ...Object.fromEntries(CLEARED.map((name) => [name, ''])),
    ...anthropic?.env,
    // The provider's own headers, one `Name: value` a line; inherited ones stay cleared.
    ...(headers.length ? { ANTHROPIC_CUSTOM_HEADERS: headers.map(([name, value]) => `${name}: ${value}`).join('\n') } : {}),
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ANTHROPIC_BASE_URL: anthropicBaseUrl(provider.endpoint.baseUrl),
    ...(anthropic?.auth === 'api_key'
      ? { ANTHROPIC_API_KEY: provider.apiKey, ANTHROPIC_AUTH_TOKEN: '' }
      : { ANTHROPIC_AUTH_TOKEN: provider.apiKey, ANTHROPIC_API_KEY: '' }),
    ANTHROPIC_DEFAULT_OPUS_MODEL: named(provider.defaultModel),
    ANTHROPIC_DEFAULT_SONNET_MODEL: named(provider.defaultModel),
    ANTHROPIC_DEFAULT_HAIKU_MODEL: named(provider.smallModel),
    ANTHROPIC_SMALL_FAST_MODEL: named(provider.smallModel),
    ...(windows.length ? { CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(Math.min(...windows)) } : {}),
    [PROVIDER_MARK_ENV]: provider.providerId
  }
}
