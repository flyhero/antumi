import { describe, expect, it } from 'vitest'
import { debateStances, DISCUSSION_REQUIREMENT_PRESETS } from './discussion-requirements'

describe('discussion requirement presets', () => {
  it('sets a debate on fixed sides, with the last of three or more judging and chairing', () => {
    const three = debateStances(3)
    expect(three.roles.map((role) => role.slice(0, 2))).toEqual(['正方', '反方', '裁判'])
    expect(three.chair).toBe(2)
    expect(debateStances(4).roles.map((role) => role.slice(0, 2))).toEqual(['正方', '反方', '正方', '裁判'])
    expect(debateStances(2)).toMatchObject({ chair: 0 })
    expect(debateStances(2).roles.map((role) => role.slice(0, 2))).toEqual(['正方', '反方'])
  })

  it('keeps debate and relay to the round table, and has only the debate set stances', () => {
    const roundtableOnly = DISCUSSION_REQUIREMENT_PRESETS.filter((preset) => preset.roundtable).map((preset) => preset.id)
    expect(roundtableOnly).toEqual(['debate', 'relay'])
    expect(DISCUSSION_REQUIREMENT_PRESETS.filter((preset) => preset.stances).map((preset) => preset.id)).toEqual(['debate'])
    expect(DISCUSSION_REQUIREMENT_PRESETS.find((preset) => preset.id === 'relay')?.text).toContain('在别人已有内容的基础上补充')
  })
})
