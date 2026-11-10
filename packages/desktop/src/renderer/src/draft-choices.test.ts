import { describe, expect, it } from 'vitest'
import { rememberedPick } from './draft-choices'

const models = [{ id: 'opus', efforts: ['high', 'max'] }, { id: 'sonnet', efforts: [] }]

describe('rememberedPick', () => {
  it('starts on the model and effort picked last', () => {
    expect(rememberedPick({ model: 'opus', effort: 'max' }, models)).toEqual({ model: 'opus', effort: 'max' })
  })

  it('drops what the catalog no longer has', () => {
    expect(rememberedPick({ model: 'sonnet', effort: 'max' }, models)).toEqual({ model: 'sonnet' })
    expect(rememberedPick({ model: 'haiku', effort: 'high' }, models)).toEqual({})
  })

  it('waits for the catalog', () => {
    expect(rememberedPick({ model: 'opus' }, undefined)).toEqual({})
    expect(rememberedPick(undefined, models)).toEqual({})
  })
})
