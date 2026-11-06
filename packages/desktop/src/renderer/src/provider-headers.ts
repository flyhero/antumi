import { PROVIDER_HEADER_LIMIT, providerHeaderProblem } from '@antumi/protocol'

// A provider's extra request headers as typed, one `Name: value` a line. bad: the lines (from 1)
// the form refuses, with why.
export type ParsedHeaders = { headers: Record<string, string>; bad: Array<{ line: number; problem: 'format' | 'name' | 'reserved' | 'value' | 'duplicate' | 'limit' }> }

export function parseProviderHeaders(text: string): ParsedHeaders {
  const headers: Record<string, string> = {}
  const bad: ParsedHeaders['bad'] = []
  const seen = new Set<string>()
  text.split('\n').forEach((raw, index) => {
    const line = index + 1
    if (!raw.trim()) return
    const colon = raw.indexOf(':')
    if (colon <= 0) { bad.push({ line, problem: 'format' }); return }
    const name = raw.slice(0, colon).trim()
    const value = raw.slice(colon + 1).trim()
    const problem = providerHeaderProblem(name, value)
    if (problem) { bad.push({ line, problem }); return }
    if (seen.has(name.toLowerCase())) { bad.push({ line, problem: 'duplicate' }); return }
    if (seen.size >= PROVIDER_HEADER_LIMIT) { bad.push({ line, problem: 'limit' }); return }
    seen.add(name.toLowerCase())
    headers[name] = value
  })
  return { headers, bad }
}

export const formatProviderHeaders = (headers: Readonly<Record<string, string>>): string =>
  Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\n')
