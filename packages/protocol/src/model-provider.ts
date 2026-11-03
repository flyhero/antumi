import { z } from 'zod'
import { AgentKind } from './agent'
import { agentDescriptor } from './agents'
import { ModelProviderId } from './model-provider-id'

// Third-party model providers (a coding plan's endpoints and key) that an agent can be started on in
// place of its own account. Core injects one into each agent process it starts; nothing goes into
// the agent's own configuration.

// How an agent's CLI talks to an endpoint.
export const ProviderWire = z.enum(['anthropic', 'openai-responses', 'openai-chat'])
export type ProviderWire = z.infer<typeof ProviderWire>

export { ModelProviderId }

export const MODEL_PROVIDER_PRESET_IDS = [
  'volcengine-agent-plan', 'volcengine-coding-plan', 'zhipu-glm-coding', 'zai-glm-coding', 'kimi-code', 'minimax-cn', 'minimax', 'bailian-token-plan', 'deepseek'
] as const
export const ModelProviderPresetId = z.enum(MODEL_PROVIDER_PRESET_IDS)
export type ModelProviderPresetId = z.infer<typeof ModelProviderPresetId>
export const ModelProviderPreset = z.union([ModelProviderPresetId, z.literal('custom')])
export type ModelProviderPreset = z.infer<typeof ModelProviderPreset>

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Why an address can't be a provider's: https anywhere, plain http only to this machine (a local
// gateway); no credentials, query or fragment, which would ride along in the config an agent is
// started with and on its command line.
export function providerUrlProblem(text: string): 'invalid' | 'insecure' | 'credentials' | 'query' | null {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return 'invalid'
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) return url.protocol === 'http:' ? 'insecure' : 'invalid'
  if (url.username || url.password) return 'credentials'
  if (url.search || url.hash) return 'query'
  return null
}

export const ProviderUrl = z.string().trim().max(2048).refine((text) => providerUrlProblem(text) === null)

// The only variables a provider sets on Claude Code besides its address, key and models: each tunes
// how it talks to the endpoint, none reroutes it or runs anything.
export const PROVIDER_CLAUDE_ENV = ['API_TIMEOUT_MS', 'ENABLE_TOOL_SEARCH', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_AUTO_COMPACT_WINDOW'] as const
export const ProviderClaudeEnv = z.enum(PROVIDER_CLAUDE_ENV)

// auth: how the key goes: a bearer token (ANTHROPIC_AUTH_TOKEN), or an x-api-key (ANTHROPIC_API_KEY),
// which some endpoints require and refuse the other.
export const AnthropicEndpoint = z.object({
  baseUrl: ProviderUrl,
  auth: z.enum(['auth_token', 'api_key']),
  env: z.partialRecord(ProviderClaudeEnv, z.string().max(200))
})
export type AnthropicEndpoint = z.infer<typeof AnthropicEndpoint>

// A provider's OpenAI-compatible endpoints: chat completions and Responses, which some serve at
// different paths. At least one.
export const OpenAiEndpoint = z.object({
  chatUrl: ProviderUrl.nullable(),
  responsesUrl: ProviderUrl.nullable()
}).refine((endpoint) => endpoint.chatUrl !== null || endpoint.responsesUrl !== null)
export type OpenAiEndpoint = z.infer<typeof OpenAiEndpoint>

// A model as the provider names it. contextWindow: what it takes, where known; agents assume less of
// a model they don't know. reasoningSummaries: whether its Responses endpoint returns them.
export const ProviderModel = z.object({
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().max(200).nullable(),
  contextWindow: z.number().int().positive().nullable(),
  maxOutput: z.number().int().positive().nullable(),
  efforts: z.array(z.string().min(1).max(40)).max(10),
  reasoningSummaries: z.boolean().optional()
})
export type ProviderModel = z.infer<typeof ProviderModel>

// As clients see one: endpoints already resolved (a preset's come from the preset table), never the
// key. revision rises with each save, so whatever is kept by provider can tell an edit.
export const ModelProvider = z.object({
  id: ModelProviderId,
  name: z.string().trim().min(1).max(60),
  // A preset a newer core knows reads as custom: its endpoints come resolved, and one unknown id
  // must not fail the whole list.
  preset: ModelProviderPreset.catch('custom'),
  anthropic: AnthropicEndpoint.nullable(),
  openai: OpenAiEndpoint.nullable(),
  models: z.array(ProviderModel).min(1).max(100),
  defaultModel: z.string(),
  smallModel: z.string(),
  agents: z.array(AgentKind),
  // A preset's provider whose models are the preset's own, which follow it from release to release.
  // Older cores leave it out.
  modelsFromPreset: z.boolean().optional(),
  hasKey: z.boolean(),
  revision: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type ModelProvider = z.infer<typeof ModelProvider>

// An edit. id null adds one. Endpoints are read only for a custom provider. apiKey null keeps the
// stored key; a new provider needs one.
export const ModelProviderInput = z.object({
  id: ModelProviderId.nullable(),
  name: z.string().trim().min(1).max(60),
  preset: ModelProviderPreset,
  anthropic: AnthropicEndpoint.nullable().optional(),
  openai: OpenAiEndpoint.nullable().optional(),
  models: z.array(ProviderModel).min(1).max(100),
  defaultModel: z.string().trim().min(1),
  smallModel: z.string().trim().min(1),
  agents: z.array(AgentKind),
  apiKey: z.string().trim().min(1).max(4096).nullable()
})
export type ModelProviderInput = z.infer<typeof ModelProviderInput>

// One request per endpoint and model, as an agent would send it. message: what the endpoint said,
// shortened and without the key.
export const ModelProviderCheck = z.object({
  wire: ProviderWire,
  model: z.string(),
  ok: z.boolean(),
  status: z.number().int().nullable(),
  message: z.string().nullable(),
  latencyMs: z.number().nullable()
})
export const ModelProviderProbe = z.object({ ok: z.boolean(), checks: z.array(ModelProviderCheck), at: z.number() })
export type ModelProviderProbe = z.infer<typeof ModelProviderProbe>

// The endpoint an agent reaches a provider at: the first wire, in the agent's order of preference,
// that the provider serves.
export type ProviderEndpoint = { wire: ProviderWire; baseUrl: string; anthropic: AnthropicEndpoint | null }

type Endpoints = Pick<ModelProvider, 'anthropic' | 'openai'>

function endpointFor(provider: Endpoints, wire: ProviderWire): ProviderEndpoint | null {
  if (wire === 'anthropic') return provider.anthropic ? { wire, baseUrl: provider.anthropic.baseUrl, anthropic: provider.anthropic } : null
  const url = wire === 'openai-responses' ? provider.openai?.responsesUrl : provider.openai?.chatUrl
  return url ? { wire, baseUrl: url, anthropic: null } : null
}

// Whether the agent could use the provider at all, whatever it is set to serve.
export function providerWireFor(provider: Endpoints, agent: AgentKind): ProviderEndpoint | null {
  for (const wire of agentDescriptor(agent).capabilities.modelProviders) {
    const endpoint = endpointFor(provider, wire)
    if (endpoint) return endpoint
  }
  return null
}

export function providerEndpoint(provider: Endpoints & Pick<ModelProvider, 'agents'>, agent: AgentKind): ProviderEndpoint | null {
  return provider.agents.includes(agent) ? providerWireFor(provider, agent) : null
}

// What a native session was opened against: a session resumes only where this is unchanged. Not
// secret, and blind to the key and the model list, which an agent picks up without a new session.
export function providerRouteKey(providerId: string, endpoint: Pick<ProviderEndpoint, 'wire' | 'baseUrl'>): string {
  return `${providerId}|${endpoint.wire}|${endpoint.baseUrl}`
}

// What a chat stage ran on, kept with the stage: the provider as it was then, never its key. A stage
// replays, and one still running is taken back after a restart, from this alone. key is
// providerRouteKey's.
export const ProviderRoute = z.object({
  providerId: ModelProviderId,
  name: z.string(),
  wire: ProviderWire,
  baseUrl: z.string(),
  anthropic: AnthropicEndpoint.nullable(),
  key: z.string(),
  models: z.array(ProviderModel),
  defaultModel: z.string(),
  smallModel: z.string()
})
export type ProviderRoute = z.infer<typeof ProviderRoute>

// What a conversation's next stage runs on, where the conversation was started on a provider:
// served, on it; agent-unsupported, the provider does not serve this agent, which runs on its own
// account; unavailable, the provider is gone, has no key or stopped serving an agent that ran on it,
// so the agent does not start rather than quietly run elsewhere.
export const ConversationRoute = z.object({
  providerId: ModelProviderId,
  name: z.string().nullable(),
  reason: z.enum(['served', 'agent-unsupported', 'unavailable'])
})
export type ConversationRoute = z.infer<typeof ConversationRoute>
