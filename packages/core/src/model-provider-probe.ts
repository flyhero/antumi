import type { ModelProvider, ModelProviderProbe, ProviderEndpoint } from '@antumi/protocol'
import { askProvider } from './provider-request'

// Every endpoint the provider has, asked a one-word question by its default and small model: what
// the user sees before an agent starts on it. It proves the address, key and model answer; an
// agent's streaming and tools are another matter, which its first turn shows. Never throws.
export async function probeModelProvider(provider: Pick<ModelProvider, 'anthropic' | 'openai' | 'defaultModel' | 'smallModel' | 'headers' | 'smallJobs'>, apiKey: string, { fetchImpl = fetch, now = Date.now, timeoutMs = 30_000 }: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number } = {}): Promise<ModelProviderProbe> {
  const endpoints: ProviderEndpoint[] = [
    ...(provider.anthropic ? [{ wire: 'anthropic' as const, baseUrl: provider.anthropic.baseUrl, anthropic: provider.anthropic }] : []),
    ...(provider.openai?.responsesUrl ? [{ wire: 'openai-responses' as const, baseUrl: provider.openai.responsesUrl, anthropic: null }] : []),
    ...(provider.openai?.chatUrl ? [{ wire: 'openai-chat' as const, baseUrl: provider.openai.chatUrl, anthropic: null }] : [])
  ]
  // The small model only where small jobs go to it: each request is one more the provider sees.
  const models = [...new Set([provider.defaultModel, ...((provider.smallJobs ?? 'provider') === 'provider' ? [provider.smallModel] : [])])]
  const checks = await Promise.all(endpoints.flatMap((endpoint) => models.map(async (model) => {
    const reply = await askProvider({ endpoint, apiKey, model, headers: provider.headers ?? {} }, 'Reply with: ok', { fetchImpl, timeoutMs })
    return { wire: endpoint.wire, model, ok: reply.ok, status: reply.status, message: reply.ok ? null : reply.message, latencyMs: reply.latencyMs }
  })))
  return { ok: checks.length > 0 && checks.every((check) => check.ok), checks, at: now() }
}
