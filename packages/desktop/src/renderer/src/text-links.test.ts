import { describe, expect, it } from 'vitest'
import { textLinks } from './text-links'

const hrefs = (text: string) => textLinks(text).flatMap((part) => (part.kind === 'link' ? [part.href] : []))

describe('textLinks', () => {
  it('leaves text without an address as it is', () => {
    expect(textLinks('看看这个')).toEqual([{ kind: 'text', text: '看看这个' }])
    expect(textLinks('')).toEqual([])
  })

  it('splits an address out of the text around it, keeping every character', () => {
    const text = '读下 https://claude.dev/blog/building-effective-agent-automations/， 看看有什么可借鉴的？'
    const parts = textLinks(text)
    expect(parts).toEqual([
      { kind: 'text', text: '读下 ' },
      { kind: 'link', href: 'https://claude.dev/blog/building-effective-agent-automations/' },
      { kind: 'text', text: '， 看看有什么可借鉴的？' }
    ])
    expect(parts.map((part) => (part.kind === 'link' ? part.href : part.text)).join('')).toBe(text)
  })

  it('ends an address where Chinese follows it with no space', () => {
    expect(hrefs('打开https://example.com/a?b=1看看')).toEqual(['https://example.com/a?b=1'])
    expect(hrefs('见（https://example.com/x）')).toEqual(['https://example.com/x'])
  })

  it('leaves out the sentence punctuation after an address', () => {
    expect(hrefs('See https://example.com/docs.')).toEqual(['https://example.com/docs'])
    expect(hrefs('Is it https://example.com/?')).toEqual(['https://example.com/'])
    expect(hrefs('"https://example.com/q", then')).toEqual(['https://example.com/q'])
  })

  it('keeps a closing bracket the address opened, and drops one it did not', () => {
    expect(hrefs('(see https://en.wikipedia.org/wiki/Mermaid_(software))')).toEqual(['https://en.wikipedia.org/wiki/Mermaid_(software)'])
    expect(hrefs('(see https://example.com/a)')).toEqual(['https://example.com/a'])
  })

  it('finds every address, on any line', () => {
    expect(hrefs('one http://a.example\ntwo https://b.example/x y')).toEqual(['http://a.example', 'https://b.example/x'])
  })

  it('takes only web addresses with something after the scheme', () => {
    expect(hrefs('https:// and ftp://example.com and file:///tmp/a')).toEqual([])
  })
})
