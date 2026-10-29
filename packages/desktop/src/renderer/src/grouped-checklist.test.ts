import { describe, expect, it } from 'vitest'
import { checklistSize, filterChecklist, groupPicked, withGroup, type ChecklistGroup } from './grouped-checklist'

const groups: ChecklistGroup[] = [
  { id: 'design', label: 'design-skills', items: [{ id: 'design/logo', label: 'logo', detail: 'Draw a brand mark' }, { id: 'design/slides', label: 'slides', detail: null }] },
  { id: 'docs', label: 'docs-kit', items: [{ id: 'docs/pdf', label: 'pdf', detail: 'Read and write PDF files' }] }
]

describe('grouped checklist', () => {
  it('keeps a group whose name matches whole, and otherwise only the items that match', () => {
    expect(filterChecklist(groups, '')).toEqual(groups)
    expect(filterChecklist(groups, 'DESIGN')).toEqual([groups[0]])
    expect(filterChecklist(groups, 'brand')).toEqual([{ ...groups[0], items: [groups[0]!.items[0]] }])
    expect(filterChecklist(groups, 'pdf write')).toEqual([groups[1]])
    expect(filterChecklist(groups, 'nothing')).toEqual([])
    expect(checklistSize(groups)).toBe(3)
  })

  it('counts and toggles a whole group, keeping the order things were picked in', () => {
    expect(groupPicked(groups[0]!, new Set(['design/slides']))).toEqual({ picked: 1, all: false })
    expect(groupPicked(groups[1]!, new Set(['docs/pdf']))).toEqual({ picked: 1, all: true })
    expect(withGroup(['docs/pdf', 'design/slides'], groups[0]!, true)).toEqual(['docs/pdf', 'design/slides', 'design/logo'])
    expect(withGroup(['docs/pdf', 'design/slides'], groups[0]!, false)).toEqual(['docs/pdf'])
  })
})
