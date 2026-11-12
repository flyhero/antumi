import { describe, expect, it } from 'vitest'
import { limitChatPage } from './chat-page-limit'

describe('limitChatPage', () => {
  it('leaves a page within the limit alone', () => {
    expect(limitChatPage([[1, 2], [3]], 4, 5)).toEqual({ items: [1, 2, 3], first: 4, truncated: false })
  })

  it('drops whole old stages, which the next page back still reaches', () => {
    expect(limitChatPage([[1, 2], [3, 4]], 4, 2)).toEqual({ items: [3, 4], first: 5, truncated: false })
  })

  it('cuts the oldest stage kept, and says so', () => {
    expect(limitChatPage([[1, 2], [3, 4, 5]], 2, 2)).toEqual({ items: [4, 5], first: 3, truncated: true })
    expect(limitChatPage([[1, 2, 3]], 0, 1)).toEqual({ items: [3], first: 0, truncated: true })
  })
})
