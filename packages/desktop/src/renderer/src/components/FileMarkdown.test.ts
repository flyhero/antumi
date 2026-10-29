import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FileMarkdown, markdownFileReference } from './FileMarkdown'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined })
})

const render = (text: string) => renderToStaticMarkup(createElement(FileMarkdown, {
  text,
  file: { path: '/project/docs/guide.md', root: '/project', relative: 'docs/guide.md', kind: 'file' },
  scope: { conversationId: 'chat', roots: ['/project'] }
}))

describe('Markdown file preview', () => {
  it('renders headings, tables, code and safe HTML used by README files', () => {
    const html = render('<div align="center">\n\n# Guide\n\n</div>\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst ready = true\n```')
    expect(html).toContain('<h1>Guide</h1>')
    expect(html).toContain('<table>')
    expect(html).toContain('hljs-keyword')
    expect(html).not.toContain('&lt;div')
  })

  it('resolves local links and images against the document folder, including Windows and escaped filenames', () => {
    expect(markdownFileReference('../README.md#L12', '/project/docs/guide.md')).toEqual({ path: '/project/README.md', line: 12 })
    expect(markdownFileReference('images/a%20b.png', '/project/docs/guide.md')).toEqual({ path: '/project/docs/images/a b.png', line: null })
    expect(markdownFileReference('..\\README.md', 'C:\\project\\docs\\guide.md')).toEqual({ path: 'C:/project/README.md', line: null })
    expect(markdownFileReference('https://example.com/a', '/project/docs/guide.md')).toBeNull()
    expect(render('[Next](next.md)')).toContain('title="/project/docs/next.md"')
    expect(render('![Diagram](images/diagram.png)')).toContain('src="antumi-preview://file/project/docs/images/diagram.png"')
  })

  it('removes executable HTML and offers remote images as links', () => {
    const html = render('<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n<img src="images/a.png" onerror="alert(2)" />\n\n[bad](javascript:alert(3))\n\n![Badge](https://example.com/badge.png)')
    expect(html).not.toMatch(/<script|<iframe|onerror|javascript:|alert\(/)
    expect(html).not.toContain('src="https://example.com')
    expect(html).toContain('href="https://example.com/badge.png"')
  })
})
