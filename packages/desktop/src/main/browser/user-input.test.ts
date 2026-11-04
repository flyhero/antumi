import { describe, expect, it } from 'vitest'
import { UserInputs } from './user-input'

describe('UserInputs', () => {
  it('tells core of the user\'s clicks and keys at most once a second, never of an agent\'s or of scrolling', () => {
    const inputs = new UserInputs()
    expect(inputs.note('t', 'mouseDown', false, 0)).toBe(true)
    expect(inputs.note('t', 'keyDown', false, 500)).toBe(false)
    expect(inputs.note('t', 'keyDown', false, 1_000)).toBe(true)
    expect(inputs.note('t', 'mouseWheel', false, 5_000)).toBe(false)
    expect(inputs.note('t', 'mouseDown', true, 5_000)).toBe(false)
  })

  it('gives the user the tab a link they just clicked opens, not one an agent or the page opened', () => {
    const inputs = new UserInputs()
    inputs.note('t', 'mouseDown', false, 10_000)
    // A click core was not told of, within the second, still counts.
    expect(inputs.note('t', 'mouseDown', false, 10_500)).toBe(false)
    expect(inputs.opensForUser('t', false, 12_400)).toBe(true)
    expect(inputs.opensForUser('t', false, 10_300)).toBe(true)
    expect(inputs.opensForUser('t', true, 10_300)).toBe(false)
    expect(inputs.opensForUser('t', false, 13_000)).toBe(false)
    expect(inputs.opensForUser('other', false, 10_300)).toBe(false)
    inputs.forget('t')
    expect(inputs.opensForUser('t', false, 10_300)).toBe(false)
  })
})
