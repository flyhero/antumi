import { providerEndpoint, providerRouteKey, type AgentKind, type ConversationRoute, type ConversationStage, type ModelProvider, type ProviderEndpoint, type ProviderRoute } from '@antumi/protocol'
import type { ResolvedModelProvider } from './model-providers'
import type { ProviderLaunch } from './provider-launch'

// What an agent's next stage in a conversation runs on. own: its own account, the conversation
// being on none, or the provider not serving this agent (unsupported); provider: the route and the
// key to start it with; unavailable: the agent does not start.
export type RouteDecision =
  | { kind: 'own'; unsupported: boolean }
  | { kind: 'provider'; route: ProviderRoute; apiKey: string }
  | { kind: 'unavailable'; message: string }

export function providerRoute(provider: ModelProvider, endpoint: ProviderEndpoint): ProviderRoute {
  return {
    providerId: provider.id, name: provider.name, wire: endpoint.wire, baseUrl: endpoint.baseUrl, anthropic: endpoint.anthropic,
    key: providerRouteKey(provider.id, endpoint), models: provider.models, defaultModel: provider.defaultModel, smallModel: provider.smallModel,
    headers: provider.headers ?? {}, smallJobs: provider.smallJobs ?? 'provider'
  }
}

// chosen: the conversation's provider; previous: this agent's latest stage in it. An agent that ran
// here goes on as it ran: on its own account if the provider did not serve it, and on the provider
// only while the provider still serves it, never quietly falling back to its own account.
export function decideRoute(chosen: string | null, agent: AgentKind, previous: ConversationStage | null, resolved: ResolvedModelProvider | null): RouteDecision {
  if (chosen === null) return { kind: 'own', unsupported: false }
  if (previous && !previous.route) return { kind: 'own', unsupported: true }
  if (!resolved) return { kind: 'unavailable', message: '这个会话的服务商已删除或没有 API Key，请在设置里补上后重试' }
  const endpoint = providerEndpoint(resolved.provider, agent)
  if (!endpoint) return previous ? { kind: 'unavailable', message: `服务商「${resolved.provider.name}」不再服务这个 Agent` } : { kind: 'own', unsupported: true }
  return { kind: 'provider', route: providerRoute(resolved.provider, endpoint), apiKey: resolved.apiKey }
}

export function conversationRoute(chosen: string | null, decision: RouteDecision, name: string | null): ConversationRoute | null {
  if (chosen === null) return null
  const reason = decision.kind === 'provider' ? 'served' : decision.kind === 'own' ? 'agent-unsupported' : 'unavailable'
  return { providerId: chosen, name, reason }
}

// A native session goes on only on the route it was opened on.
export function sameRoute(a: ProviderRoute | null | undefined, b: ProviderRoute | null | undefined): boolean {
  return (a?.key ?? null) === (b?.key ?? null)
}

export function providerLaunch(route: ProviderRoute, apiKey: string): ProviderLaunch {
  return {
    providerId: route.providerId, endpoint: { wire: route.wire, baseUrl: route.baseUrl, anthropic: route.anthropic },
    models: route.models, defaultModel: route.defaultModel, smallModel: route.smallModel, headers: route.headers ?? {}, apiKey
  }
}
