import type { ProviderModel } from '@antumi/protocol'

// A token count as typed: 200000, 200k, 1M, 1.5m, 128_000. '' is unknown (null); anything else that
// is no positive whole count is undefined, which the form refuses.
export function parseTokens(text: string): number | null | undefined {
  const plain = text.trim().replace(/[,_\s]/g, '')
  if (!plain) return null
  const match = /^(\d+(?:\.\d+)?)([kKmM]?)$/.exec(plain)
  if (!match) return undefined
  const unit = match[2] === '' ? 1 : /k/i.test(match[2] ?? '') ? 1_000 : 1_000_000
  // Decimals only in thousands or millions, and only where they make a whole count: 1.5k, not 1.5.
  const value = Number((Number(match[1]) * unit).toFixed(3))
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

export function formatTokens(value: number | null): string {
  if (value === null) return ''
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`
  if (value % 1_000 === 0) return `${value / 1_000}k`
  return String(value)
}

// The list after picking among the models an endpoint listed: what stays picked keeps its place,
// what is newly picked follows in the listed order, and what the endpoint did not list is left alone.
export function pickedIds(current: readonly string[], listed: readonly string[], picked: ReadonlySet<string>): string[] {
  const listedSet = new Set(listed)
  const kept = current.filter((id) => !listedSet.has(id) || picked.has(id))
  return [...kept, ...listed.filter((id) => picked.has(id) && !kept.includes(id))]
}

// What is known of each model once a list is taken in: a listed model fills what is still unknown,
// never what the user or a preset gave.
export function withListed(known: readonly ProviderModel[], listed: readonly ProviderModel[]): ProviderModel[] {
  const byId = new Map(listed.map((model) => [model.id, model]))
  const filled = known.map((model) => {
    const found = byId.get(model.id)
    return found ? { ...model, label: model.label ?? found.label, contextWindow: model.contextWindow ?? found.contextWindow, maxOutput: model.maxOutput ?? found.maxOutput } : model
  })
  return [...filled, ...listed.filter((model) => !known.some((each) => each.id === model.id))]
}
