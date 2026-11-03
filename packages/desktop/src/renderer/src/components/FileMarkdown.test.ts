import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FileMarkdown, markdownFileReference } from './FileMarkdown'
import { MARKDOWN_THEMES } from '../markdown-themes'
import { MarkdownThemePack } from '../markdown-theme-packs'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined })
})

const render = (text: string, theme?: string, packs?: readonly MarkdownThemePack[]) => renderToStaticMarkup(createElement(FileMarkdown, {
  text,
  theme,
  packs,
  file: { path: '/project/docs/guide.md', root: '/project', relative: 'docs/guide.md', kind: 'file' },
  scope: { conversationId: 'chat', roots: ['/project'] }
}))

describe('Markdown file preview', () => {
  it('renders an installed theme through the same sanitized file renderer', () => {
    const pack = MarkdownThemePack.parse({ format: 'antumi-markdown-theme', version: 1, id: '5dde10ce-045e-42d5-b2d7-3510edf38fc1', name: 'Custom', base: 'quiet', css: 'h2 { border-left: 3px solid var(--md-primary-color); }' })
    const html = render('## Custom\n\n[Next](next.md)\n\n<script>alert(1)</script>', `user:${pack.id}`, [pack])
    expect(html).toContain('data-md-theme="quiet"')
    expect(html).toContain('data-md-scope=')
    expect(html).toContain('@scope')
    expect(html).toContain('title="/project/docs/next.md"')
    expect(html).not.toContain('<script')
    expect(render('# Fallback', `user:${pack.id}`)).toContain('data-md-theme="default"')
  })
  it.each(MARKDOWN_THEMES)('keeps GFM, highlighting and safe file links in the %s theme', (theme) => {
    const html = render('# Heading\n\n- [x] Read\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst ready = true\n```\n\n[Next](next.md)\n\n<script>alert(1)</script>', theme)
    expect(html).toContain(`data-md-theme="${theme}"`)
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<table>')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('title="/project/docs/next.md"')
    expect(html).not.toContain('<script')
  })
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
