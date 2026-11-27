import { providerEndpoint, type AgentKind, type ChatCatalog, type ModelProvider } from '@antumi/protocol'

// The providers an agent can start on: ones with a key that serve it.
export function servingProviders(providers: readonly ModelProvider[], agent: AgentKind): ModelProvider[] {
  return providers.filter((provider) => provider.hasKey && providerEndpoint(provider, agent) !== null)
}

// The provider picked, where it serves this agent; another agent runs on its own account.
export function providerFor(providers: readonly ModelProvider[], id: string | null | undefined, agent: AgentKind | null): ModelProvider | null {
  if (!id || !agent) return null
  return servingProviders(providers, agent).find((provider) => provider.id === id) ?? null
}

// What an agent's models are kept under: a provider offers its own, which an edit may change.
export function catalogKey(agent: AgentKind, provider: ModelProvider | null): string {
  return provider ? `${agent}|${provider.id}|${provider.revision}` : agent
}

// The small model under the id used in the catalog, including Claude's context suffix or a provider prefix.
export function providerSmallModel(catalog: ChatCatalog | null, smallModel: string | null | undefined): string | null {
  if (!catalog || !smallModel) return null
  const { models } = catalog
  const exact = models.find((model) => model.id === smallModel)
  if (exact) return exact.id
  const base = smallModel.replace(/(?:\s*\[1m\])+$/i, '').trim() || smallModel
  return models.find((model) => model.id === base + '[1m]' || model.id.endsWith('/' + smallModel))?.id ?? null
}
