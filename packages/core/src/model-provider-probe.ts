import type { ModelProvider, ModelProviderProbe, ProviderEndpoint } from '@antumi/protocol'

type ModelProviderCheck = ModelProviderProbe['checks'][number]
const REFUSED = new Set([401, 403, 429])
import { askProvider } from './provider-request'

// Every endpoint the provider has, asked a one-word question by its default and small model: what
// the user sees before an agent starts on it. It proves the address, key and model answer; an
// agent's streaming and tools are another matter, which its first turn shows. Never throws.
// One request at a time, and none after the provider refuses the key or says to slow down (401,
// 403, 429): a burst, or more requests after a refusal, is what a provider's limits are wary of.
// An endpoint that does not answer at all is not asked again for its other model.
export async function probeModelProvider(provider: Pick<ModelProvider, 'anthropic' | 'openai' | 'defaultModel' | 'smallModel' | 'headers' | 'smallJobs'>, apiKey: string, { fetchImpl = fetch, now = Date.now, timeoutMs = 30_000 }: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number } = {}): Promise<ModelProviderProbe> {
  const endpoints: ProviderEndpoint[] = [
    ...(provider.anthropic ? [{ wire: 'anthropic' as const, baseUrl: provider.anthropic.baseUrl, anthropic: provider.anthropic }] : []),
    ...(provider.openai?.responsesUrl ? [{ wire: 'openai-responses' as const, baseUrl: provider.openai.responsesUrl, anthropic: null }] : []),
    ...(provider.openai?.chatUrl ? [{ wire: 'openai-chat' as const, baseUrl: provider.openai.chatUrl, anthropic: null }] : [])
  ]
  // The small model only where small jobs go to it: each request is one more the provider sees.
  const models = [...new Set([provider.defaultModel, ...((provider.smallJobs ?? 'provider') === 'provider' ? [provider.smallModel] : [])])]
  const checks: ModelProviderCheck[] = []
  asking: for (const endpoint of endpoints) {
    for (const model of models) {
      const reply = await askProvider({ endpoint, apiKey, model, headers: provider.headers ?? {} }, 'Reply with: ok', { fetchImpl, timeoutMs })
      checks.push({ wire: endpoint.wire, model, ok: reply.ok, status: reply.status, message: reply.ok ? null : reply.message, latencyMs: reply.latencyMs })
      if (!reply.ok && reply.status !== null && REFUSED.has(reply.status)) break asking
      if (!reply.ok && reply.status === null) break
    }
  }
  return { ok: checks.length > 0 && checks.length === endpoints.length * models.length && checks.every((check) => check.ok), checks, at: now() }
}
