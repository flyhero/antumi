import type { ModelPrice, TokenRates } from '../model-cost'

const UPDATED = '2026-10-14'
const CLAUDE_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing'
const OPENAI_SOURCE = 'https://developers.openai.com/api/docs/pricing'
const GEMINI_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing'
const rates = (input: number, output: number, read = input / 10): TokenRates => ({ input, output, cacheRead: read, cacheWrite: input * 1.25, cacheWrite1h: input * 2 })
const price = (model: string, source: string, costs: TokenRates): ModelPrice => ({ model, source, rates: costs, updatedAt: UPDATED, validFrom: UPDATED })
const long = (entry: ModelPrice, above: number, costs: TokenRates): ModelPrice => ({ ...entry, longContext: { above, rates: costs } })

export const CLAUDE_PRICES: readonly ModelPrice[] = [
  price('claude-opus-5-5', CLAUDE_SOURCE, rates(4, 20, 0.2)),
  price('claude-sonnet-5-5', CLAUDE_SOURCE, rates(2, 10, 0.1)),
  long(price('claude-haiku-5-5', CLAUDE_SOURCE, rates(0.1, 0.5)), 100_000, rates(0.5, 2.5)),
  ...['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5'].map((model) => price(model, CLAUDE_SOURCE, rates(5, 25))),
  price('claude-sonnet-5', CLAUDE_SOURCE, rates(2, 10)),
  price('claude-sonnet-4-6', CLAUDE_SOURCE, rates(3, 15)),
  long(price('claude-sonnet-4-5', CLAUDE_SOURCE, rates(3, 15)), 200_000, rates(6, 22.5)),
  price('claude-haiku-4-5', CLAUDE_SOURCE, rates(1, 5))
]

const CODEX_RATES = [
  ['gpt-6.1-sol', 2, 10, 0.1], ['gpt-6-sol', 2, 10, 0.2], ['gpt-6-astra', 10, 50, 1],
  ['gpt-6-luna', 0.1, 0.5, 0.01], ['gpt-5.6-sol', 4, 20, 0.4], ['gpt-5.6-luna', 0.2, 1.2, 0.02]
] as const
const codexRates = (input: number, output: number, read: number): TokenRates => ({ ...rates(input, output, read), cacheWrite1h: input * 1.25 })
export const CODEX_PRICES: readonly ModelPrice[] = CODEX_RATES.map(([model, input, output, read]) =>
  long(price(model, OPENAI_SOURCE, codexRates(input, output, read)), 272_000, codexRates(input * 2, output * 1.5, read * 2))
)

const flash = price('gemini-3.8-flash', GEMINI_SOURCE, { ...rates(0.75, 3.75, 0.075), cacheWrite: 0.75, cacheWrite1h: 0.75 })
const geminiRates = (input: number, output: number): TokenRates => ({ ...rates(input, output), cacheWrite: input, cacheWrite1h: input })
export const GEMINI_PRICES: readonly ModelPrice[] = [
  { ...flash, validUntil: '2026-12-31' },
  { ...flash, validFrom: '2027-01-01', rates: geminiRates(1.5, 7.5) },
  long({ ...price('gemini-2.5-pro', GEMINI_SOURCE, geminiRates(1.25, 10)), updatedAt: '2026-10-29', validFrom: '2026-10-29' }, 200_000, geminiRates(2.5, 15)),
  ...['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-customtools'].map((model) => long({ ...price(model, GEMINI_SOURCE, geminiRates(2, 12)), updatedAt: '2026-10-29', validFrom: '2026-10-29' }, 200_000, geminiRates(4, 18)))
]
export const CURSOR_PRICES: readonly ModelPrice[] = [
  ...CLAUDE_PRICES, ...CODEX_PRICES, ...GEMINI_PRICES
]

// Only versioned names, including dated provider snapshots; unresolved aliases stay unknown.
export function modelPrice(prices: readonly ModelPrice[] | undefined, model: string | null, at: number): ModelPrice | null {
  if (!model) return null
  const name = model.replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, '')
  const date = new Date(at).toISOString().slice(0, 10)
  return prices?.find((entry) => entry.model === name && entry.validFrom <= date && (!entry.validUntil || entry.validUntil >= date)) ?? null
}
