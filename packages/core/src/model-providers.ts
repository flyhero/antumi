import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  AgentKind, AnthropicEndpoint, MODEL_PROVIDER_PRESETS, ModelProviderId, ModelProviderPreset, OpenAiEndpoint, ProviderHeaders, ProviderModel, ProviderSmallJobs, agentDescriptor, providerUrlProblem, providerWireFor, sameModels,
  type ModelProvider, type ModelProviderInput, type ModelProviderModels, type ModelProviderModelsQuery, type ModelProviderProbe
} from '@antumi/protocol'
import { readJsonIfExists, writePrivateJson } from '@antumi/protocol/node'
import type { CredentialStore } from './credential-store'
import { fetchProviderModels } from './model-provider-models'
import { probeModelProvider } from './model-provider-probe'
import { Rejection } from './rejection'

// A provider as the file keeps it. A preset's endpoints aren't kept: they come from the preset
// table at each use, so a release that fixes one fixes every provider made from it. Nor are its
// models while the user keeps the preset's list (null): a release that adds or retires one reaches
// those providers too, and their default and small model follow the preset's unless chosen. keyRef names
// the credential holding its key, a new one per key: an edit writes the new key, then the list
// naming it, then drops the old, so a failure midway never pairs one address with another's key.
const Saved = z.object({
  id: ModelProviderId,
  name: z.string(),
  preset: ModelProviderPreset,
  anthropic: AnthropicEndpoint.nullable(),
  openai: OpenAiEndpoint.nullable(),
  models: z.array(ProviderModel).nullable(),
  defaultModel: z.string().nullable(),
  smallModel: z.string().nullable(),
  agents: z.array(AgentKind),
  // Absent in files written before them: none, and small jobs on the provider.
  headers: ProviderHeaders.optional(),
  smallJobs: ProviderSmallJobs.optional(),
  keyRef: z.string().nullable(),
  revision: z.number().int(),
  createdAt: z.number(),
  updatedAt: z.number()
})
type Saved = z.infer<typeof Saved>
const SavedFile = z.object({ version: z.literal(1), providers: z.array(Saved) })

// Keys sit under the credential store's `model-provider`, one record per keyRef.
const CREDENTIALS = 'model-provider'

export type ResolvedModelProvider = { provider: ModelProvider; apiKey: string }

const URL_PROBLEM: Record<'invalid' | 'insecure' | 'credentials' | 'query', string> = {
  invalid: '地址不是有效的 URL',
  insecure: '远程地址只接受 https://，http:// 只能连本机',
  credentials: '地址里不能带用户名或密码',
  query: '地址里不能带 ? 参数或 # 片段'
}

// The user's model providers: settings in one file, keys in the credential store, so the file holds
// nothing secret. Changes run one at a time.
export class ModelProviderStore {
  private providers: Saved[] = []
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly file: string,
    private readonly credentials: CredentialStore,
    private readonly changed: (providers: ModelProvider[]) => void = () => {},
    private readonly newId: (preset: string) => string = (preset) => `${preset}-${randomBytes(3).toString('hex')}`
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await readJsonIfExists(this.file)
      const parsed = raw === undefined ? null : SavedFile.safeParse(raw)
      if (parsed && !parsed.success) console.error(`[antumi-core] ${this.file} is not a list of model providers; ignoring it until one is saved`)
      this.providers = parsed?.success ? parsed.data.providers : []
    } catch (error) {
      console.error(`[antumi-core] cannot read ${this.file}:`, error instanceof Error ? error.message : error)
      this.providers = []
    }
    // Keys an edit wrote but never got to name, or failed to drop.
    const named = new Set(this.providers.map((provider) => provider.keyRef))
    for (const ref of this.credentials.instances(CREDENTIALS)) {
      if (!named.has(ref)) await this.credentials.delete(CREDENTIALS, ref).catch(() => {})
    }
  }

  list(): ModelProvider[] {
    return this.providers.map((saved) => this.shown(saved))
  }

  get(id: string): ModelProvider | null {
    const saved = this.providers.find((each) => each.id === id)
    return saved ? this.shown(saved) : null
  }

  // With its key, for whatever starts an agent on it or asks it something; never sent to a client.
  resolve(id: string): ResolvedModelProvider | null {
    const saved = this.providers.find((each) => each.id === id)
    const apiKey = saved ? this.keyOf(saved) : null
    return saved && apiKey ? { provider: this.shown(saved), apiKey } : null
  }

  async probe(id: string): Promise<ModelProviderProbe> {
    this.require(id)
    const resolved = this.resolve(id)
    if (!resolved) throw new Rejection('model-provider-key-missing', '这个服务商还没有填 API Key')
    return probeModelProvider(resolved.provider, resolved.apiKey)
  }

  // A key kept goes only where it was saved to go: a client could otherwise send it anywhere by
  // naming a new address and leaving the key out.
  async fetchModels(query: ModelProviderModelsQuery): Promise<ModelProviderModels> {
    const endpoints = endpointsOf(query)
    checkEndpoints(endpoints)
    const apiKey = query.apiKey ?? this.keptKey(query.id, endpoints)
    const saved = query.id === null ? null : this.require(query.id)
    return fetchProviderModels(endpoints, apiKey, { headers: query.headers ?? saved?.headers ?? {} })
  }

  save(input: ModelProviderInput): Promise<ModelProvider> {
    return this.serially(async () => {
      const previous = input.id === null ? null : this.require(input.id)
      const endpoints = endpointsOf(input)
      checkEndpoints(endpoints)
      if (input.apiKey === null && previous) this.keptKey(previous.id, endpoints)
      const ids = input.models.map((model) => model.id)
      if (new Set(ids).size !== ids.length) throw new Rejection('model-provider-model-missing', '模型列表里有重复的名字')
      for (const model of [input.defaultModel, input.smallModel]) {
        if (!ids.includes(model)) throw new Rejection('model-provider-model-missing', `模型 ${model} 不在模型列表里`)
      }
      const agents = [...new Set(input.agents)]
      for (const agent of agents) {
        if (!providerWireFor(endpoints, agent)) throw new Rejection('model-provider-agent-unsupported', `${agentDescriptor(agent).label} 用不了这个服务商的接口`)
      }
      if (input.apiKey === null && !(previous && this.keyOf(previous))) throw new Rejection('model-provider-key-missing', '还没有填 API Key')
      const now = Date.now()
      const id = previous?.id ?? this.newId(input.preset)
      const revision = (previous?.revision ?? 0) + 1
      const keyRef = input.apiKey === null ? previous?.keyRef ?? null : `${id}.${revision}`
      if (input.apiKey !== null && keyRef !== null) {
        await this.credentials.set(CREDENTIALS, keyRef, { kind: 'model-provider', payload: { apiKey: input.apiKey }, account: null, updatedAt: now })
      }
      // The preset's own list, kept as the preset's so it follows the table; the user's, as given.
      const preset = input.preset === 'custom' ? null : MODEL_PROVIDER_PRESETS[input.preset]
      const follows = preset !== null && sameModels(input.models, preset.models)
      const saved: Saved = {
        id, name: input.name, preset: input.preset,
        anthropic: input.preset === 'custom' ? endpoints.anthropic : null,
        openai: input.preset === 'custom' ? endpoints.openai : null,
        models: follows ? null : input.models,
        defaultModel: follows && input.defaultModel === preset.defaultModel ? null : input.defaultModel,
        smallModel: follows && input.smallModel === preset.smallModel ? null : input.smallModel,
        agents,
        // An older client sends neither: what was saved stays.
        headers: input.headers ?? previous?.headers ?? {},
        smallJobs: input.smallJobs ?? previous?.smallJobs ?? 'provider',
        keyRef, revision, createdAt: previous?.createdAt ?? now, updatedAt: now
      }
      await this.write(previous ? this.providers.map((each) => (each.id === id ? saved : each)) : [...this.providers, saved])
      if (previous?.keyRef && previous.keyRef !== keyRef) await this.credentials.delete(CREDENTIALS, previous.keyRef).catch(() => {})
      return this.shown(saved)
    })
  }

  remove(id: string): Promise<void> {
    return this.serially(async () => {
      const saved = this.require(id)
      await this.write(this.providers.filter((each) => each.id !== id))
      if (saved.keyRef) await this.credentials.delete(CREDENTIALS, saved.keyRef).catch(() => {})
    })
  }

  private shown(saved: Saved): ModelProvider {
    const { keyRef: _keyRef, ...rest } = saved
    const preset = saved.preset === 'custom' ? null : MODEL_PROVIDER_PRESETS[saved.preset]
    const models = saved.models ?? (preset ? [...preset.models] : [])
    const ids = models.map((model) => model.id)
    // A model chosen from the preset's list that a release retired gives way to the preset's own.
    const pick = (chosen: string | null, presets: string | undefined) => (chosen !== null && ids.includes(chosen) ? chosen : presets !== undefined && ids.includes(presets) ? presets : ids[0] ?? '')
    return {
      ...rest,
      anthropic: preset ? preset.anthropic : saved.anthropic,
      openai: preset ? preset.openai : saved.openai,
      models,
      defaultModel: pick(saved.defaultModel, preset?.defaultModel),
      smallModel: pick(saved.smallModel, preset?.smallModel),
      modelsFromPreset: saved.models === null,
      headers: saved.headers ?? {},
      smallJobs: saved.smallJobs ?? 'provider',
      hasKey: this.keyOf(saved) !== null
    }
  }

  // The saved provider's key, for endpoints at the addresses it has now.
  private keptKey(id: string | null, endpoints: Pick<ModelProvider, 'anthropic' | 'openai'>): string {
    const saved = id === null ? null : this.require(id)
    const apiKey = saved ? this.keyOf(saved) : null
    if (!saved || !apiKey) throw new Rejection('model-provider-key-missing', '还没有填 API Key')
    if (addresses(this.shown(saved)) !== addresses(endpoints)) throw new Rejection('model-provider-key-missing', '换了接口地址，要重新填 API Key')
    return apiKey
  }

  private keyOf(saved: Saved): string | null {
    return saved.keyRef ? this.credentials.get(CREDENTIALS, saved.keyRef)?.payload.apiKey ?? null : null
  }

  private require(id: string): Saved {
    const saved = this.providers.find((each) => each.id === id)
    if (!saved) throw new Rejection('model-provider-unknown', '没有这个服务商')
    return saved
  }

  private serially<T>(action: () => Promise<T>): Promise<T> {
    const result = this.chain.catch(() => {}).then(action)
    this.chain = result
    return result
  }

  private async write(providers: Saved[]): Promise<void> {
    await writePrivateJson(this.file, { version: 1, providers })
    this.providers = providers
    this.changed(this.list())
  }
}

function endpointsOf(input: Pick<ModelProviderInput, 'preset' | 'anthropic' | 'openai'>): Pick<ModelProvider, 'anthropic' | 'openai'> {
  return input.preset === 'custom'
    ? { anthropic: input.anthropic ?? null, openai: input.openai ?? null }
    : { anthropic: MODEL_PROVIDER_PRESETS[input.preset].anthropic, openai: MODEL_PROVIDER_PRESETS[input.preset].openai }
}

// Where a key would be sent: what keeps one may differ in anything else.
function addresses(endpoints: Pick<ModelProvider, 'anthropic' | 'openai'>): string {
  return JSON.stringify([endpoints.anthropic?.baseUrl ?? null, endpoints.openai?.chatUrl ?? null, endpoints.openai?.responsesUrl ?? null])
}

function checkEndpoints(endpoints: Pick<ModelProvider, 'anthropic' | 'openai'>): void {
  if (!endpoints.anthropic && !endpoints.openai) throw new Rejection('model-provider-endpoint-missing', '至少要填一个接口地址')
  const urls = [endpoints.anthropic?.baseUrl, endpoints.openai?.chatUrl, endpoints.openai?.responsesUrl].filter((url) => typeof url === 'string')
  for (const url of urls) {
    const problem = providerUrlProblem(url)
    if (problem) throw new Rejection('model-provider-insecure-url', URL_PROBLEM[problem])
  }
}
