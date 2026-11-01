import { describe, expect, it } from 'vitest'
import { researchAssignments } from './discussion-research'

const members = [{ id: 'c', name: 'Cid' }, { id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob Lee' }]

describe('research assignments', () => {
  it("reads the parts under the chair's 分工 line, by member name", () => {
    const text = '先按层拆。\n\n**分工：**\n- Ann：查 core 的调度\n- **bob lee**: 查协议兼容\n- Cid：汇总\n- Dan：没这个人\n\n## 其他\n- Ann：不算'
    expect([...researchAssignments(text, members, 'c')]).toEqual([['a', '查 core 的调度'], ['b', '查协议兼容']])
  })

  it('finds nothing without the line', () => {
    expect(researchAssignments('- Ann：查 core', members, 'c').size).toBe(0)
  })
})
