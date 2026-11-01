import { describe, expect, it } from 'vitest'
import { defaultProjectColor, PROJECT_COLORS, projectColor, projectColorKey } from './project-colors'

describe('project colors', () => {
  it('keeps defaults stable across equivalent path spellings', () => {
    expect(defaultProjectColor('/projects/antumi/')).toBe(defaultProjectColor('/projects/antumi'))
    expect(defaultProjectColor('C:\\projects\\antumi\\')).toBe(defaultProjectColor('C:/projects/antumi'))
    expect(new Set(Array.from({ length: 40 }, (_, i) => defaultProjectColor(`/projects/app-${i}`))).size).toBe(PROJECT_COLORS.length)
  })

  it('applies an override to just its project, and restores the default when removed', () => {
    const path = '/projects/antumi/'
    const overrides = { [projectColorKey(path)]: 'pink' } as const
    expect(projectColor(path, overrides)).toBe('pink')
    expect(projectColor('/projects/other', overrides)).toBe(defaultProjectColor('/projects/other'))
    expect(projectColor(path, {})).toBe(defaultProjectColor(path))
  })
})
