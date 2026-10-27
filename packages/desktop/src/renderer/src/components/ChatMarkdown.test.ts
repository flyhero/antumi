import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ChatMarkdown } from './ChatMarkdown'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

const render = (text: string) => renderToStaticMarkup(createElement(ChatMarkdown, { text, highlight: false }))
const url = 'https://example.com/design'

describe('chat link presentation', () => {
  it('spaces links beside Chinese through emphasis without inserting text or inline icons', () => {
    const html = render(`参见**[设计方案](${url})**写好了。`)
    expect(html).toContain('chat-link-space-before chat-link-space-after')
    expect(html).not.toContain('<svg')
    expect(html.replace(/<[^>]+>/g, '')).toBe('参见设计方案写好了。')
    expect(html).toContain(`title="${url}"`)
    expect(html).toContain('target="_blank" rel="noreferrer"')
  })

  it('keeps punctuation, existing whitespace and English spacing intact', () => {
    for (const text of [`「[方案](${url})」，已完成。`, `查看 [方案](${url}) 后继续。`, `Read [the design](${url})before editing.`]) {
      const html = render(text)
      expect(html).not.toContain('chat-link-space-')
      expect(html).not.toContain('<svg')
    }
    expect(render(`[方案](${url})写好了`)).toContain('chat-link-space-after')
    expect(render(`查看[方案](${url})。`)).toContain('chat-link-space-before')
  })

  it('adds an accessible decorative icon only to web links on their own line', () => {
    for (const text of [`[设计方案](${url})`, `说明\n[设计方案](${url})\n下一行`, `- **[设计方案](${url})**`]) {
      const html = render(text)
      expect(html).toContain('chat-link-standalone')
      expect(html).toContain('<svg')
      expect(html).toContain('aria-hidden="true"')
      expect(html).toContain('class="chat-web-link-label">设计方案</span>')
    }
    for (const text of ['[章节](#section)', '[源文件](src/app.ts)', '`[代码](https://example.com)`', '[危险](javascript:alert(1))']) {
      expect(render(text)).not.toContain('chat-web-link')
      expect(render(text)).not.toContain('chat-link-standalone')
    }
  })
})
