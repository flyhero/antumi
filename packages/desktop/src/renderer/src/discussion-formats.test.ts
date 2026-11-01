import { describe, expect, it } from 'vitest'
import { DEFAULT_DISCUSSION_REQUIREMENTS } from '@antumi/protocol'
import { coreFormat, discussionTurns, formatSetup } from './discussion-formats'

describe('discussion formats', () => {
  it('leaves a round table to the default requirements and the first member as chair', () => {
    expect(formatSetup('roundtable', 3)).toEqual({ roles: ['', '', ''], chair: 0, requirements: DEFAULT_DISCUSSION_REQUIREMENTS, rounds: 3 })
  })

  it('sets a debate on fixed sides, with the last of three or more as its judge', () => {
    const three = formatSetup('debate', 3)
    expect(three.roles.map((role) => role.slice(0, 2))).toEqual(['正方', '反方', '裁判'])
    expect(three.chair).toBe(2)
    const four = formatSetup('debate', 4)
    expect(four.roles.map((role) => role.slice(0, 2))).toEqual(['正方', '反方', '正方', '裁判'])
    const two = formatSetup('debate', 2)
    expect(two.roles.map((role) => role.slice(0, 2))).toEqual(['正方', '反方'])
    expect(two.chair).toBe(0)
    expect(two.requirements).toContain('不因对方的论点改变立场')
  })

  it('asks a relay to build on what was said, and counts a round table at its longest', () => {
    expect(formatSetup('relay', 2).requirements).toContain('在别人已有内容的基础上补充')
    expect(discussionTurns('roundtable', 3, 3)).toEqual({ least: 7, most: 10 })
  })

  it('runs only a review as a format of its own, two revisions by default, its turns from one per member up', () => {
    expect(coreFormat('debate')).toBe('roundtable')
    expect(coreFormat('review')).toBe('review')
    expect(coreFormat('research')).toBe('research')
    expect(discussionTurns('research', 3, 3)).toEqual({ least: 4, most: 4 })
    expect(formatSetup('review', 3).rounds).toBe(2)
    expect(discussionTurns('review', 3, 2)).toEqual({ least: 3, most: 9 })
  })
})
