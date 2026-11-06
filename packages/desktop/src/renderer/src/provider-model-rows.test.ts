import { describe, expect, it } from 'vitest'
import type { ProviderModel } from '@antumi/protocol'
import { blankRow, effortsOf, modelsOfRows, rowOf, rowProblems, withListedRows, withPastedRows, type ModelRow } from './provider-model-rows'

const model = (id: string, more: Partial<ProviderModel> = {}): ProviderModel => ({ id, label: null, contextWindow: null, maxOutput: null, efforts: [], ...more })
const typed = (cells: Partial<ModelRow>): ModelRow => ({ ...blankRow(), ...cells })

describe('provider model rows', () => {
  it('turns a model into cells and back without losing what the table does not show', () => {
    const known = model('glm-5.3', { label: 'GLM-5.3', contextWindow: 200_000, maxOutput: 128_000, efforts: ['low', 'high'], reasoningSummaries: false, images: true })
    expect(rowOf(known)).toMatchObject({ id: 'glm-5.3', label: 'GLM-5.3', context: '200k', output: '128k', efforts: 'low, high', images: true })
    expect(modelsOfRows([rowOf(known)], true)).toEqual([known])
  })

  it('reads every cell as typed, the first row of an id winning and empty rows dropped', () => {
    const rows = [typed({ id: ' a ', label: ' A ', context: '1M', output: '', efforts: 'low，high high', images: true }), blankRow(), typed({ id: 'a', context: '8k' })]
    expect(modelsOfRows(rows, true)).toEqual([model('a', { label: 'A', contextWindow: 1_000_000, efforts: ['low', 'high'], images: true })])
  })

  it('keeps a model\'s image support where the table does not set it', () => {
    const row = { ...rowOf(model('v', { images: true })), images: false }
    expect(modelsOfRows([row], false)[0]?.images).toBe(true)
    expect(modelsOfRows([row], true)[0]).not.toHaveProperty('images')
  })

  it('names what is wrong in each row', () => {
    const rows = [typed({ id: 'a', context: '1.5' }), typed({ id: 'a' }), typed({ label: 'no id' }), typed({ id: 'b', efforts: Array.from({ length: 11 }, (_, index) => `e${index}`).join(',') }), blankRow()]
    expect([...rowProblems(rows).values()]).toEqual([['context'], ['duplicate'], ['id'], ['efforts']])
  })

  it('splits efforts on commas, either kind, and spaces', () => {
    expect(effortsOf(' low, medium，high  max ')).toEqual(['low', 'medium', 'high', 'max'])
  })

  it('takes a listed model list in: picked rows keep their place and typed cells, new ones follow, unlisted ones stay', () => {
    const rows = [typed({ id: 'mine', context: '64k' }), typed({ id: 'a', context: '' }), typed({ id: 'b', context: '32k' })]
    const listed = [model('a', { label: 'A', contextWindow: 200_000, images: true }), model('b', { contextWindow: 1_000 }), model('c', { contextWindow: 8_000 })]
    const next = withListedRows(rows, listed, new Set(['a', 'c']))
    expect(next.map((row) => [row.id, row.label, row.context, row.images])).toEqual([['mine', '', '64k', false], ['a', 'A', '200k', true], ['c', '', '8k', false]])
  })

  it('adds pasted ids one a line, skipping those already there and anything after a space', () => {
    const next = withPastedRows([typed({ id: 'a' }), blankRow()], 'a\n b  200k\n\nc\tnote\nb')
    expect(next.map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })
})
