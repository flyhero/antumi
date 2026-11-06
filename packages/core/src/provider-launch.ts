import type { ChatModel, ProviderEndpoint, ProviderModel } from '@antumi/protocol'

// A stage on a model provider, as its agent is started: the endpoint this agent speaks to, the
// key, and the provider's models by their ids at the provider. The key goes into the process
// environment only, never argv or a config the agent is handed as text; ZCode, which reads a key
// from its provider file alone, gets one in the stage's private launch folder (zcode-provider.ts).
export type ProviderLaunch = {
  providerId: string
  endpoint: ProviderEndpoint
  models: readonly ProviderModel[]
  defaultModel: string
  smallModel: string
  // Sent on every request besides the agent's own (ModelProvider.headers).
  headers: Readonly<Record<string, string>>
  apiKey: string
}

// Marks a process as running on a provider, so Antumi's MCP launcher keeps the key from the
// user's servers. The provider's id, nothing secret.
export const PROVIDER_MARK_ENV = 'ANTUMI_MODEL_PROVIDER'
// The key, for an agent whose config names the variable to read it from.
export const PROVIDER_KEY_ENV = 'ANTUMI_MODEL_PROVIDER_KEY'

// The provider's models as an agent's catalog, each under the id the agent takes it by.
export function providerChatModels(provider: Pick<ProviderLaunch, 'models' | 'defaultModel'>, agentId: (model: ProviderModel) => string): ChatModel[] {
  return provider.models.map((model) => ({ id: agentId(model), label: model.label ?? model.id, description: null, efforts: [...model.efforts], isDefault: model.id === provider.defaultModel }))
}
