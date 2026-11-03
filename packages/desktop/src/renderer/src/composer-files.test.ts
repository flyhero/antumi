import { describe, expect, it } from 'vitest'
import { pastedLines } from './composer-files'

describe('pastedLines', () => {
  it('counts lines however they end, a last line break adding none', () => {
    expect(pastedLines('one')).toBe(1)
    expect(pastedLines('one\ntwo\n')).toBe(2)
    expect(pastedLines('one\r\ntwo\r\nthree')).toBe(3)
    expect(pastedLines('one\n\n')).toBe(2)
  })
})
