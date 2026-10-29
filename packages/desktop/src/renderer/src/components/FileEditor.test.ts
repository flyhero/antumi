import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { EMPTY_FILE_TABS, fileScopeKey, openedFile, useFileTabs } from '../file-tabs'
import { FileEditor } from './FileEditor'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})
// Rendered on the server a store reads its initial state; these read what the test set.
vi.mock('zustand', async (original) => {
  const actual = await original<typeof import('zustand')>()
  return { ...actual, create: <T>() => (initializer: StateCreator<T>) => {
    const store = actual.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const SCOPE = { conversationId: 'chat', roots: ['/work/app'] }
const KEY = fileScopeKey(SCOPE)
const render = (tree: boolean) => {
  useFileTabs.setState({ [KEY]: { ...EMPTY_FILE_TABS, tree } })
  return renderToStaticMarkup(createElement(FileEditor, { scope: SCOPE, updatedAt: 0, editor: true }))
}

beforeEach(() => useFileTabs.setState({}, true))

describe('file editor', () => {
  it('previews image files directly without offering text search or Markdown modes', () => {
    for (const name of ['shot.PNG', 'photo.jpeg', 'animation.gif', 'photo.webp', 'photo.avif', 'photo.bmp', 'favicon.ico']) {
      useFileTabs.setState({ [KEY]: openedFile(EMPTY_FILE_TABS, { path: `/work/app/My images/#${name}`, root: '/work/app', relative: `My images/#${name}`, kind: 'file' }, null) })
      const html = renderToStaticMarkup(createElement(FileEditor, { scope: SCOPE, updatedAt: 0, editor: true }))
      expect(html).toContain('aria-label="图片预览"')
      expect(html).toContain(`src="antumi-preview://file/work/app/My%20images/%23${name}?v=`)
      expect(html).not.toContain('搜索文件内容')
      expect(html).not.toContain('Markdown 显示方式')
      expect(html).not.toContain('正在读取文件')
    }
  })

  it('defaults SVG to preview and keeps source editing available', () => {
    useFileTabs.setState({ [KEY]: openedFile(EMPTY_FILE_TABS, { path: '/work/app/icon.SVG', root: '/work/app', relative: 'icon.SVG', kind: 'file' }, null) })
    const html = renderToStaticMarkup(createElement(FileEditor, { scope: SCOPE, updatedAt: 0, editor: true }))
    expect(html).toContain('SVG 显示方式')
    expect(html).toContain('aria-checked="true">预览</button>')
    expect(html).toContain('aria-checked="false">编辑</button>')
  })

  it('offers edit and preview in the file location bar for Markdown files only', () => {
    for (const name of ['README.md', 'notes.MD', 'guide.markdown', 'app.ts']) {
      useFileTabs.setState({ [KEY]: openedFile(EMPTY_FILE_TABS, { path: `/work/app/${name}`, root: '/work/app', relative: name, kind: 'file' }, null) })
      const html = renderToStaticMarkup(createElement(FileEditor, { scope: SCOPE, updatedAt: 0, editor: true }))
      expect(html.includes('Markdown 显示方式')).toBe(name !== 'app.ts')
      if (name !== 'app.ts') expect(html).toContain('aria-checked="false">预览</button>')
    }
  })

  it('folds the tree away and keeps the button that opens it again, with no file open', () => {
    const folded = render(false)
    expect(folded).toContain('aria-label="打开文件树"')
    expect(folded).toContain('aria-pressed="false"')
    expect(folded).toContain('打开文件树选择文件。')
    expect(folded).not.toContain('file-editor-tree')
    expect(render(true)).toContain('aria-label="收起文件树"')
  })
})
