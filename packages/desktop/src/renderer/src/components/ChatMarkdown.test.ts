import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Task } from '@antumi/protocol'
import { ChatMarkdown } from './ChatMarkdown'
import { TaskPlanCard } from './TaskPlanCard'
import { FileMarkdown } from './FileMarkdown'
import { usePreferences } from '../preferences'
import { MARKDOWN_THEMES } from '../markdown-themes'
import { MarkdownThemePack } from '../markdown-theme-packs'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

// Read the live fixture rather than Zustand's server-rendering initial snapshot.
vi.mock('../preferences', async (load) => {
  const actual = await load<typeof import('../preferences')>()
  const useLivePreferences = <T>(select: (state: ReturnType<typeof actual.usePreferences.getState>) => T) => select(actual.usePreferences.getState())
  return { ...actual, usePreferences: Object.assign(useLivePreferences, actual.usePreferences) }
})

const originalPreferences = usePreferences.getState()
afterEach(() => usePreferences.setState(originalPreferences))

const render = (text: string) => renderToStaticMarkup(createElement(ChatMarkdown, { text, highlight: false }))
const url = 'https://example.com/design'

describe('inline visualization replies', () => {
  const text = '\uE200visualize\uE202{"path":"/work/status-preview.html"}\uE201'
  it('leaves the marker as text outside an opted-in assistant reply', () => {
    expect(render(text)).toContain('visualize')
    expect(render(text)).not.toContain('chat-visualization')
  })
  it('renders opted-in references as independent blocks while code examples stay code', () => {
    const html = renderToStaticMarkup(createElement(ChatMarkdown, { text: `Before\n\n${text}\n\nAfter\n\n\`\`\`text\n${text}\n\`\`\``, visualization: { conversationId: 'chat', stageId: 'stage' } }))
    expect(html).toContain('chat-visualization')
    expect(html).toContain('<p>Before</p>')
    expect(html).toContain('<p>After</p>')
    expect(html).toContain('code__pre')
    expect(html.match(/visualize/g)?.length).toBe(1)
  })
})

describe('Markdown themes in conversations and plans', () => {
  it.each(MARKDOWN_THEMES)('applies %s to chat replies while keeping GFM, code actions and safe links', (theme) => {
    usePreferences.setState({ markdownTheme: theme })
    const html = renderToStaticMarkup(createElement(ChatMarkdown, { text: '# Heading\n\n- [x] Read\n\n```js\nconst ready = true\n```\n\n[Design](https://example.com)\n\n<script>alert(1)</script>' }))
    expect(html).toContain(`data-md-theme="${theme}"`)
    expect(html).not.toContain('file-markdown')
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('chat-code-actions')
    expect(html).toContain('class="code__pre"')
    expect(html).toContain('target="_blank" rel="noreferrer"')
    expect(html).not.toContain('<script')
  })

  it('shares reading settings across replies, plans and files instead of using legacy theme typography', () => {
    const pack = MarkdownThemePack.parse({ format: 'antumi-markdown-theme', version: 1, id: '5dde10ce-045e-42d5-b2d7-3510edf38fc1', name: 'Shared', base: 'neon', fontSize: 16, css: 'h2 { border-left: 3px solid var(--md-primary-color); }' })
    usePreferences.setState({ markdownTheme: `user:${pack.id}`, markdownThemePacks: [pack], chatFontSize: 18, chatLineHeight: 2, chatParagraphSpacing: 0.8, chatWidth: 'medium' })
    const task = Task.parse({ id: 'saved-plan', title: 'Saved plan', details: '', status: 'pending', repos: [], dependsOn: [], agent: 'claude', createdAt: 1, updatedAt: 1, plan: { markdown: '## Plan\n\n- [ ] Implement', agent: 'claude', approved: false, stageId: null, requestId: null, createdAt: 1 } })
    const plan = () => renderToStaticMarkup(createElement(TaskPlanCard, { task }))
    const file = renderToStaticMarkup(createElement(FileMarkdown, { text: '## File', theme: `user:${pack.id}`, packs: [pack], file: { path: '/file.md', kind: 'file', root: null, relative: null }, scope: { conversationId: null, roots: [] } }))
    for (const html of [render('## Reply'), plan(), file]) {
      expect(html).toContain('data-md-theme="neon"')
      expect(html).toContain('@scope')
      expect(html).toContain('data-md-scope=')
      expect(html).toContain('--reading-size:18px')
      expect(html).toContain('--reading-line-height:2')
      expect(html).toContain('--reading-paragraph-spacing:0.8em')
      expect(html).toContain('--reading-width:1200px')
      expect(html).not.toContain('--md-font-size')
    }
    expect(plan()).toContain('<h2>Plan</h2>')
    expect(plan()).toContain('aria-label="已保存的计划"')
    usePreferences.setState({ markdownThemePacks: [] })
    for (const html of [render('## Reply'), plan()]) {
      expect(html).toContain('data-md-theme="default"')
      expect(html).not.toContain('@scope')
    }
  })
})

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
