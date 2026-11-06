import { describe, expect, it } from 'vitest'
import { formatProviderHeaders, parseProviderHeaders } from './provider-headers'

describe('provider headers as typed', () => {
  it('reads one Name: value a line, a value keeping its own colons', () => {
    const parsed = parseProviderHeaders('User-Agent: claude-cli/2.1.280 (external, cli)\n\n  X-Trace: a:b  \n')
    expect(parsed).toEqual({ headers: { 'User-Agent': 'claude-cli/2.1.280 (external, cli)', 'X-Trace': 'a:b' }, bad: [] })
    expect(parseProviderHeaders(formatProviderHeaders(parsed.headers)).headers).toEqual(parsed.headers)
  })

  it('names each line it refuses, keeping the rest', () => {
    const parsed = parseProviderHeaders('no colon\nAuthorization: Bearer x\nBad Name: v\nX-A: 1\nx-a: 2')
    expect(parsed.headers).toEqual({ 'X-A': '1' })
    expect(parsed.bad).toEqual([{ line: 1, problem: 'format' }, { line: 2, problem: 'reserved' }, { line: 3, problem: 'name' }, { line: 5, problem: 'duplicate' }])
  })

  it('stops at the most a provider takes', () => {
    const text = Array.from({ length: 21 }, (_, index) => `X-H${index}: v`).join('\n')
    expect(parseProviderHeaders(text).bad).toEqual([{ line: 21, problem: 'limit' }])
  })
})
