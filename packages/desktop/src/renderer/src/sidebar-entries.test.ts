import { describe, expect, it } from 'vitest'
import { SourceDescriptor } from '@antumi/protocol'
import { inboxLocked } from './sidebar-entries'

describe('inbox entry', () => {
  it('shows once a plugin brings a source, and not before', () => {
    expect(inboxLocked(null)).toBe(false)
    expect(inboxLocked([])).toBe(false)
    const source = SourceDescriptor.parse({ provider: 'github', name: 'GitHub', settings: [], instances: [] })
    expect(inboxLocked([source])).toBe(true)
  })
})
