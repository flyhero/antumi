import { describe, expect, it } from 'vitest'
import type { ProviderModel } from '@antumi/protocol'
import { formatTokens, parseTokens, pickedIds, withListed } from './provider-model-limits'

const model = (id: string, more: Partial<ProviderModel> = {}): ProviderModel => ({ id, label: null, contextWindow: null, maxOutput: null, efforts: [], ...more })

describe('token counts as typed', () => {
  it.each([
    ['', null], ['  ', null], ['200000', 200_000], ['200k', 200_000], ['1M', 1_000_000], ['1.5m', 1_500_000], ['128_000', 128_000], ['1,048,576', 1_048_576]
  ])('reads %j as %j', (text, value) => expect(parseTokens(text)).toBe(value))

  it.each(['0', '-5', 'abc', '1.5', '2g', '1e6'])('refuses %j', (text) => expect(parseTokens(text)).toBeUndefined())

  it('writes a count back the short way where it is whole', () => {
    expect([formatTokens(null), formatTokens(1_000_000), formatTokens(200_000), formatTokens(131_072)]).toEqual(['', '1M', '200k', '131072'])
    expect(parseTokens(formatTokens(262_144))).toBe(262_144)
  })
})

describe('taking in a listed model list', () => {
  it('keeps what stays picked in place, adds the newly picked, and leaves what was not listed', () => {
    expect(pickedIds(['mine', 'a', 'b'], ['a', 'b', 'c', 'd'], new Set(['b', 'd', 'c']))).toEqual(['mine', 'b', 'c', 'd'])
  })

  it('fills only what is unknown, keeping a model\'s efforts and label', () => {
    const known = [model('a', { label: 'A', contextWindow: 64_000, efforts: ['high'], reasoningSummaries: false }), model('b')]
    const listed = [model('a', { label: 'Other', contextWindow: 200_000, maxOutput: 8_000 }), model('b', { contextWindow: 32_000 }), model('c', { contextWindow: 1_000 })]
    expect(withListed(known, listed)).toEqual([
      model('a', { label: 'A', contextWindow: 64_000, maxOutput: 8_000, efforts: ['high'], reasoningSummaries: false }),
      model('b', { contextWindow: 32_000 }),
      model('c', { contextWindow: 1_000 })
    ])
  })
})
