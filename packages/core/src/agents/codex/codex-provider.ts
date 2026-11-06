import { PROVIDER_KEY_ENV, PROVIDER_MARK_ENV, providerChatModels, type ProviderLaunch } from '../../provider-launch'

export const codexProviderModels = (provider: Pick<ProviderLaunch, 'models' | 'defaultModel'>) => providerChatModels(provider, (model) => model.id)

// Codex on a provider: a model provider of its own in config overrides, under a name fixed by the
// provider's id, so a thread resumed later finds it again. It reads the key from the variable the
// entry names, which only the environment carries. Codex asks any model for reasoning summaries and
// assumes a small window for one it does not know (0.160.1), so a model is told otherwise where the
// provider says so.
export function codexProviderLaunch(provider: ProviderLaunch, model: string | undefined): { args: string[]; env: Record<string, string> } {
  const name = `antumi-${provider.providerId}`
  const chosen = model ?? provider.defaultModel
  const entry = { name, base_url: provider.endpoint.baseUrl, env_key: PROVIDER_KEY_ENV, wire_api: 'responses' }
  const headers = Object.entries(provider.headers)
  const httpHeaders = headers.length ? `,http_headers={${headers.map(([name, value]) => `${JSON.stringify(name)}=${JSON.stringify(value)}`).join(',')}}` : ''
  const table = `{${Object.entries(entry).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(',')},requires_openai_auth=false${httpHeaders}}`
  const picked = provider.models.find((each) => each.id === chosen)
  return {
    args: [
      '-c', `model_provider=${JSON.stringify(name)}`,
      '-c', `model_providers.${name}=${table}`,
      '-c', `model=${JSON.stringify(chosen)}`,
      ...(picked?.contextWindow ? ['-c', `model_context_window=${picked.contextWindow}`] : []),
      ...(picked?.reasoningSummaries === false ? ['-c', 'model_reasoning_summary="none"'] : []),
      // Its shell commands inherit its environment, key and all (0.160.1): there the key is empty.
      '-c', `shell_environment_policy.set.${PROVIDER_KEY_ENV}=""`
    ],
    env: { [PROVIDER_KEY_ENV]: provider.apiKey, [PROVIDER_MARK_ENV]: provider.providerId }
  }
}
