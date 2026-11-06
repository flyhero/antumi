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

// Request headers sent to a provider besides those each agent sets itself, such as a client name a
// proxy in front of subscription accounts expects. Never a header that carries the key or frames the
// request, which the agent sets; names are unique whatever their case. Not secret: kept in the
// settings file and shown to clients.
const RESERVED_HEADERS = new Set(['authorization', 'proxy-authorization', 'x-api-key', 'host', 'content-length', 'content-type', 'transfer-encoding', 'connection'])
export const PROVIDER_HEADER_LIMIT = 20

export function providerHeaderProblem(name: string, value: string): 'name' | 'reserved' | 'value' | null {
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(name)) return 'name'
  if (RESERVED_HEADERS.has(name.toLowerCase())) return 'reserved'
  if (value.length > 1000 || /[\r\n\0]/.test(value)) return 'value'
  return null
}

export const ProviderHeaders = z.record(z.string(), z.string())
  .refine((headers) => Object.entries(headers).every(([name, value]) => providerHeaderProblem(name, value) === null))
  .refine((headers) => Object.keys(headers).length <= PROVIDER_HEADER_LIMIT && new Set(Object.keys(headers).map((name) => name.toLowerCase())).size === Object.keys(headers).length)
export type ProviderHeaders = z.infer<typeof ProviderHeaders>

// Where a conversation's small jobs on the provider go (titles, translations, commit messages):
// the provider's small model, the agent's own account, or nowhere.
export const ProviderSmallJobs = z.enum(['provider', 'account', 'off'])
export type ProviderSmallJobs = z.infer<typeof ProviderSmallJobs>

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

// The same models in the same order, each as the preset has it: what the preset's list looks like
// once edited back. A model given another context or output is the user's own.
export function sameModels(models: readonly ProviderModel[], others: readonly ProviderModel[]): boolean {
  return models.length === others.length && models.every((model, index) => {
    const other = others[index]
    return other !== undefined && model.id === other.id && model.label === other.label && model.contextWindow === other.contextWindow && model.maxOutput === other.maxOutput
      && model.efforts.join('\n') === other.efforts.join('\n') && (model.reasoningSummaries ?? false) === (other.reasoningSummaries ?? false)
  })
}

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
  // Older cores leave these out: no headers, small jobs on the provider.
  headers: ProviderHeaders.optional(),
  smallJobs: ProviderSmallJobs.optional(),
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
  apiKey: z.string().trim().min(1).max(4096).nullable(),
  // Left out (an older client), what was saved stays.
  headers: ProviderHeaders.optional(),
  smallJobs: ProviderSmallJobs.optional()
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

// The models a provider's endpoints list, asked of the endpoints in a form not yet saved. apiKey null
// takes the key of the provider saved as id, which goes only to the addresses it was saved with.
export const ModelProviderModelsQuery = z.object({
  id: ModelProviderId.nullable(),
  preset: ModelProviderPreset,
  anthropic: AnthropicEndpoint.nullable().optional(),
  openai: OpenAiEndpoint.nullable().optional(),
  apiKey: z.string().trim().min(1).max(4096).nullable(),
  headers: ProviderHeaders.optional()
})
export type ModelProviderModelsQuery = z.infer<typeof ModelProviderModelsQuery>

// models: every endpoint's, by id, with what any of them told of a model's context and output;
// most list only ids. One entry per endpoint asked, message as for a probe.
export const ModelProviderModels = z.object({
  models: z.array(ProviderModel),
  endpoints: z.array(z.object({ wire: ProviderWire, ok: z.boolean(), count: z.number().int().nonnegative(), status: z.number().int().nullable(), message: z.string().nullable() }))
})
export type ModelProviderModels = z.infer<typeof ModelProviderModels>

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
  smallModel: z.string(),
  // Absent on stages that ran before them: no headers, small jobs on the provider.
  headers: ProviderHeaders.optional(),
  smallJobs: ProviderSmallJobs.optional()
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
