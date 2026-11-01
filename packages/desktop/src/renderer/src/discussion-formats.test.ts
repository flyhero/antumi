import { describe, expect, it } from 'vitest'
import { chosenFormat, defaultRounds, discussionTurns, recommendFormat } from './discussion-formats'

const all = ['roundtable', 'review', 'research'] as const

describe('discussion formats', () => {
  it('recommends a review for a document, research for something to find out, and a round table otherwise', () => {
    expect(recommendFormat('起草「提醒设置」页的交互稿', all)).toEqual({ format: 'review', reason: 'draft' })
    expect(recommendFormat('Write a proposal for the cache', all).format).toBe('review')
    expect(recommendFormat('站点构建为什么变慢？', all)).toEqual({ format: 'research', reason: 'research' })
    expect(recommendFormat('Look into why the build is slow', all).format).toBe('research')
    expect(recommendFormat('缓存放 core 还是 desktop？', all)).toEqual({ format: 'roundtable', reason: 'discuss' })
    expect(recommendFormat('  ', all)).toEqual({ format: 'roundtable', reason: null })
  })

  it('goes by whichever kind of word comes first, and only to formats core runs', () => {
    expect(recommendFormat('为什么要写文档？', all).format).toBe('research')
    expect(recommendFormat('写一份文档，说明为什么变慢', all).format).toBe('review')
    expect(recommendFormat('起草一份提案', ['roundtable']).format).toBe('roundtable')
  })

  it('runs what was picked, or what auto recommends, and falls back to a round table core can run', () => {
    expect(chosenFormat('auto', 'review', all)).toBe('review')
    expect(chosenFormat('research', 'review', all)).toBe('research')
    expect(chosenFormat('review', 'roundtable', ['roundtable'])).toBe('roundtable')
    expect(chosenFormat('auto', 'research', ['roundtable'])).toBe('roundtable')
  })

  it('counts rounds for a round table, revisions for a review, and turns at their fewest and most', () => {
    expect(defaultRounds('roundtable')).toBe(3)
    expect(defaultRounds('review')).toBe(2)
    expect(discussionTurns('roundtable', 3, 3)).toEqual({ least: 7, most: 10 })
    expect(discussionTurns('review', 3, 2)).toEqual({ least: 3, most: 9 })
    expect(discussionTurns('research', 3, 3)).toEqual({ least: 4, most: 4 })
  })
})
