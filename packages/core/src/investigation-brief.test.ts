import { describe, expect, it } from 'vitest'
import { investigationBrief } from './investigation-brief'

const source = { provider: 'demo', instance: 'default', name: 'Demo', key: 'D-1', url: 'https://example.test/D-1' }
const snapshot = { markdown: 'It breaks', fetchedAt: 0, images: [] }

describe('investigationBrief', () => {
  it('stops at a finding when opened by hand', () => {
    const brief = investigationBrief(source, snapshot, [])
    expect(brief).toContain('缺什么信息就问我')
    expect(brief).toContain('到这里停下，不要修改代码')
  })

  it('asks nothing and leaves how far to go to the mode and note when automatic', () => {
    const brief = investigationBrief(source, snapshot, [], 0, true)
    expect(brief).not.toContain('问我')
    expect(brief).not.toContain('到这里停下')
    expect(brief).toContain('按最合理的假设继续')
  })
})
