import { z } from 'zod'
import type { ChatModel, ProviderModel } from '@antumi/protocol'
import { providerChatModels, type ProviderLaunch } from '../../provider-launch'

// A model as Pi lists it (get_available_models, get_state, set_model): its provider and id name it.
export const PiModel = z.looseObject({
  id: z.string(),
  provider: z.string(),
  name: z.string().optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  contextWindow: z.number().optional(),
  // A level mapped to null is one the model lacks; xhigh and max only where the map names them.
  thinkingLevelMap: z.record(z.string(), z.string().nullable()).optional()
})
export type PiModel = z.infer<typeof PiModel>

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const OPTIONAL_LEVELS: ReadonlySet<string> = new Set(['xhigh', 'max'])

// Antumi names a Pi model provider/id, the selector Pi itself takes.
export const piModelId = (model: Pick<PiModel, 'provider' | 'id'>) => `${model.provider}/${model.id}`

export function parsePiModelId(value: string): { provider: string; modelId: string } | null {
  const slash = value.indexOf('/')
  return slash > 0 && slash < value.length - 1 ? { provider: value.slice(0, slash), modelId: value.slice(slash + 1) } : null
}

// The thinking levels a model takes, as Pi decides them: none for a model that does not reason.
export function piEfforts(model: PiModel): string[] {
  if (!model.reasoning) return []
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    return mapped !== null && (!OPTIONAL_LEVELS.has(level) || mapped !== undefined)
  })
}

export function piModels(models: readonly PiModel[], current: string | null): ChatModel[] {
  return models.map((model) => {
    const id = piModelId(model)
    return { id, label: model.name || id, description: model.provider, efforts: piEfforts(model), isDefault: id === current }
  })
}

// A model provider as Pi registers one (registerProvider): named for Antumi, so it never clashes
// with one the user configured, and its models as Pi takes them.
export const piProviderName = (provider: Pick<ProviderLaunch, 'providerId'>) => `antumi-${provider.providerId}`

// A provider's effort levels that Pi has; Pi offers a model exactly these, mapped to themselves.
const piLevels = (model: ProviderModel) => model.efforts.filter((effort) => THINKING_LEVELS.some((level) => level === effort))

export function piProviderModels(provider: Pick<ProviderLaunch, 'providerId' | 'models' | 'defaultModel'>): ChatModel[] {
  return providerChatModels(provider, (model) => `${piProviderName(provider)}/${model.id}`).map((model, index) => {
    const source = provider.models[index]
    return { ...model, efforts: source ? piLevels(source) : [] }
  })
}

// The models as registerProvider takes them. Pi needs a context window and an output limit; where
// the provider gives none, ones every coding model takes. It reports no prices: Antumi keeps none.
export function piProviderEntries(provider: Pick<ProviderLaunch, 'models'>): PiProviderModel[] {
  return provider.models.map((model) => {
    const levels = piLevels(model)
    return {
      id: model.id,
      name: model.label ?? model.id,
      reasoning: levels.length > 0,
      input: model.images ? ['text', 'image'] : ['text'],
      contextWindow: model.contextWindow ?? 128_000,
      maxTokens: model.maxOutput ?? 16_384,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      ...(levels.length ? { thinkingLevelMap: Object.fromEntries(THINKING_LEVELS.map((level) => [level, levels.includes(level) ? level : null])) } : {})
    }
  })
}

export type PiProviderModel = {
  id: string
  name: string
  reasoning: boolean
  input: string[]
  contextWindow: number
  maxTokens: number
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number }
  thinkingLevelMap?: Record<string, string | null>
}
