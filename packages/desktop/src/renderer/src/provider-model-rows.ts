import type { ProviderModel } from '@antumi/protocol'
import { formatTokens, parseTokens, pickedIds } from './provider-model-limits'

// One model as the provider form's table edits it: each cell as typed, and the model as known
// (base), so what the table does not show, such as reasoningSummaries, stays as it was.
export type ModelRow = { key: string; id: string; label: string; context: string; output: string; efforts: string; images: boolean; base: ProviderModel | null }
export type RowProblem = 'id' | 'duplicate' | 'label' | 'context' | 'output' | 'efforts'

let made = 0
const rowKey = () => `model-row-${++made}`

export const blankRow = (id = ''): ModelRow => ({ key: rowKey(), id, label: '', context: '', output: '', efforts: '', images: false, base: null })

export function rowOf(model: ProviderModel): ModelRow {
  return {
    key: rowKey(), id: model.id, label: model.label ?? '', context: formatTokens(model.contextWindow), output: formatTokens(model.maxOutput),
    efforts: model.efforts.join(', '), images: model.images ?? false, base: model
  }
}

// low, high / low，high / low high: each once, in the order typed.
export const effortsOf = (text: string): string[] => [...new Set(text.split(/[,，\s]+/).map((effort) => effort.trim()).filter(Boolean))]

// What is wrong with each row, by its key. A row with no id and nothing else typed is just empty.
export function rowProblems(rows: readonly ModelRow[]): Map<string, RowProblem[]> {
  const seen = new Set<string>()
  const found = new Map<string, RowProblem[]>()
  for (const row of rows) {
    const id = row.id.trim()
    const problems: RowProblem[] = []
    if (!id && (row.label.trim() || row.context.trim() || row.output.trim() || row.efforts.trim())) problems.push('id')
    if (id.length > 200) problems.push('id')
    if (id && seen.has(id)) problems.push('duplicate')
    if (row.label.trim().length > 200) problems.push('label')
    if (parseTokens(row.context) === undefined) problems.push('context')
    if (parseTokens(row.output) === undefined) problems.push('output')
    const efforts = effortsOf(row.efforts)
    if (efforts.length > 10 || efforts.some((effort) => effort.length > 40)) problems.push('efforts')
    if (id) seen.add(id)
    if (problems.length) found.set(row.key, problems)
  }
  return found
}

// The models the rows make, the first of an id winning. images: whether the table sets it; where it
// does not (an older core), a model keeps what it had.
export function modelsOfRows(rows: readonly ModelRow[], images: boolean): ProviderModel[] {
  const models: ProviderModel[] = []
  for (const row of rows) {
    const id = row.id.trim()
    if (!id || models.some((model) => model.id === id)) continue
    const { images: had, ...base } = row.base ?? { id, label: null, contextWindow: null, maxOutput: null, efforts: [] }
    const seeing = images ? row.images : had ?? false
    models.push({
      ...base, id, label: row.label.trim() || null, contextWindow: parseTokens(row.context) ?? null, maxOutput: parseTokens(row.output) ?? null,
      efforts: effortsOf(row.efforts), ...(seeing ? { images: true } : {})
    })
  }
  return models
}

// The rows after picking among the models the endpoints listed: what stays picked keeps its place
// and gets what the list knows in the cells left empty, what is newly picked follows as listed, and
// what the list does not name is left alone.
export function withListedRows(rows: readonly ModelRow[], listed: readonly ProviderModel[], picked: ReadonlySet<string>): ModelRow[] {
  const byId = new Map(listed.map((model) => [model.id, model]))
  const kept = rows.filter((row) => row.id.trim())
  const ids = pickedIds(kept.map((row) => row.id.trim()), listed.map((model) => model.id), picked)
  return ids.map((id) => {
    const row = kept.find((each) => each.id.trim() === id)
    const found = byId.get(id)
    if (!row) return found ? rowOf(found) : blankRow(id)
    if (!found) return row
    return {
      ...row,
      label: row.label.trim() ? row.label : found.label ?? '',
      context: row.context.trim() ? row.context : formatTokens(found.contextWindow),
      output: row.output.trim() ? row.output : formatTokens(found.maxOutput),
      images: row.images || (found.images ?? false)
    }
  })
}

// Ids pasted one a line (anything after a space or tab ignored), added as rows unless already there.
export function withPastedRows(rows: readonly ModelRow[], text: string): ModelRow[] {
  const known = new Set(rows.map((row) => row.id.trim()).filter(Boolean))
  const added: ModelRow[] = []
  for (const line of text.split('\n')) {
    const id = line.trim().split(/[\s\t]+/)[0] ?? ''
    if (!id || known.has(id)) continue
    known.add(id)
    added.push(blankRow(id))
  }
  return [...rows.filter((row) => row.id.trim() || row.label.trim() || row.context.trim() || row.output.trim() || row.efforts.trim()), ...added]
}
