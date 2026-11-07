import { z } from 'zod'

const tokens = z.number().int().nonnegative()
const dollars = z.number().nonnegative()

// Input includes cached reads and writes. Null means the provider did not report a category.
export const ModelTokens = z.object({
  model: z.string().nullable(),
  input: tokens,
  output: tokens,
  cacheRead: tokens.nullable(),
  cacheWrite: tokens.nullable(),
  cacheWrite1h: tokens.nullable(),
  costUsd: dollars.nullable(),
  // The input length of each request, needed when pricing depends on prompt length.
  requestInputs: z.array(tokens).optional()
})
export type ModelTokens = z.infer<typeof ModelTokens>

export const ModelMetering = z.object({
  models: z.array(ModelTokens),
  calls: tokens.nullable(),
  callsEstimated: z.boolean(),
  reportedCostUsd: dollars.nullable()
})
export type ModelMetering = z.infer<typeof ModelMetering>

export const TokenRates = z.object({ input: dollars, output: dollars, cacheRead: dollars, cacheWrite: dollars, cacheWrite1h: dollars })
export type TokenRates = z.infer<typeof TokenRates>
export const ModelPrice = z.object({
  model: z.string(),
  updatedAt: z.string(),
  source: z.string(),
  validFrom: z.string(),
  validUntil: z.string().optional(),
  rates: TokenRates,
  longContext: z.object({ above: tokens, rates: TokenRates }).optional()
})
export type ModelPrice = z.infer<typeof ModelPrice>

export const CostBaseline = z.object({ model: z.string().nullable(), context: tokens.nullable(), price: ModelPrice.nullable() })
export type CostBaseline = z.infer<typeof CostBaseline>

export const SmallModelKind = z.enum(['translation', 'commitMessage', 'helper', 'title', 'pullRequest'])
export type SmallModelKind = z.infer<typeof SmallModelKind>
export const SmallModelCost = z.object({
  costUsd: dollars.nullable(),
  savedUsd: dollars.nullable(),
  modelDifferenceUsd: z.number().nullable(),
  contextSavedUsd: dollars.nullable(),
  baseline: CostBaseline,
  calls: tokens.nullable(),
  callsEstimated: z.boolean(),
  prices: z.array(ModelPrice),
  completed: z.boolean()
})
export type SmallModelCost = z.infer<typeof SmallModelCost>

export const SmallModelTotals = z.object({
  count: tokens,
  tokens: tokens,
  measured: tokens,
  priced: tokens,
  estimated: tokens,
  costUsd: dollars.nullable(),
  savedUsd: dollars.nullable()
})
export type SmallModelTotals = z.infer<typeof SmallModelTotals>
export const SmallModelStats = z.object({
  current: SmallModelTotals,
  previous: SmallModelTotals,
  kinds: z.array(SmallModelTotals.extend({ kind: SmallModelKind }))
})
export type SmallModelStats = z.infer<typeof SmallModelStats>

export const meteringTokens = (usage: ModelMetering) => usage.models.reduce((sum, model) => sum + model.input + model.output, 0)

export function ratesAt(price: ModelPrice, input: number): TokenRates {
  return price.longContext && input > price.longContext.above ? price.longContext.rates : price.rates
}

export function tokenCost(usage: ModelTokens, price: ModelPrice, context = 0): number | null {
  const { cacheRead, cacheWrite, cacheWrite1h } = usage
  if (cacheRead === null || cacheWrite === null || (cacheWrite1h !== null && cacheWrite1h > cacheWrite) || cacheRead + cacheWrite > usage.input) return null
  const lengths = usage.requestInputs ?? []
  // Aggregate tokens alone cannot tell which requests crossed a pricing boundary.
  if (price.longContext && context <= price.longContext.above && lengths.length === 0 && context + usage.input > price.longContext.above) return null
  const rates = ratesAt(price, context + (lengths[0] ?? 0))
  if (lengths.some((length) => ratesAt(price, context + length) !== rates)) return null
  if (cacheWrite1h === null && rates.cacheWrite !== rates.cacheWrite1h) return null
  const hourWrites = cacheWrite1h ?? 0
  return ((usage.input - cacheRead - cacheWrite) * rates.input + usage.output * rates.output + cacheRead * rates.cacheRead
    + (cacheWrite - hourWrites) * rates.cacheWrite + hourWrites * rates.cacheWrite1h) / 1_000_000
}
