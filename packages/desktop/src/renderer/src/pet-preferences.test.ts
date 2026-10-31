import { describe, expect, it } from 'vitest'
import { PET_STYLES, PetLevelPreference, PetSizePreference, PetStylePreference } from './pet-preferences'

describe('pet preferences', () => {
  it('keeps all three styles and falls back safely for old or unknown preferences', () => {
    for (const style of PET_STYLES) expect(PetStylePreference.parse(style)).toBe(style)
    expect(PetStylePreference.parse(undefined)).toBe('clay')
    expect(PetStylePreference.parse('new-pet')).toBe('new-pet')
    expect(PetStylePreference.parse('../bad')).toBe('clay')
    expect(PetLevelPreference.parse('off')).toBe('off')
    expect(PetLevelPreference.parse(undefined)).toBe('medium')
  })
  it('rejects unusable sizes without breaking the other preferences', () => {
    for (const size of [60, 64, 80, 120, 192]) expect(PetSizePreference.parse(size)).toBe(size)
    for (const size of [0, -1, 59, 193, 300, 60.5, '120', undefined]) expect(PetSizePreference.parse(size)).toBe(80)
  })
})
