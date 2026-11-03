import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ChangedFile } from '@antumi/protocol'
import { ChangedFiles } from './Inspector'

const preference = vi.hoisted(() => ({ view: 'list' as 'list' | 'tree' }))
vi.mock('../preferences', () => ({ usePreferences: (select: (state: { changedFilesView: 'list' | 'tree' }) => unknown) => select({ changedFilesView: preference.view }), setPreference: () => {} }))

const file = (path: string, patch: Partial<ChangedFile> = {}): ChangedFile => ({ path, oldPath: null, kind: 'modified', additions: 39, deletions: 0, ...patch })
const render = (files: ChangedFile[]) => renderToStaticMarkup(createElement(ChangedFiles, { label: '未提交的改动', files, empty: '没有未提交的改动', onOpen: () => {} }))

describe('changed files', () => {
  it('lists the files open under a row that folds them, counts in their colours', () => {
    const html = render([file('a/DraftRepository.java'), file('docs/design.md', { kind: 'untracked', additions: null, deletions: null })])
    expect(html).toMatch(/^<details class="inspector-fold" open="">/)
    expect(html).toContain('<span class="chat-diff-added">+39</span> <span class="chat-diff-removed">−0</span>')
    expect(html).toContain('2 个文件')
    expect(html).toContain('新文件')
  })

  it('says so, with nothing to fold, when there are none', () => {
    const html = render([])
    expect(html).not.toContain('<details')
    expect(html).toContain('没有未提交的改动')
  })

  it('shows the files under their folders once switched to the tree', () => {
    preference.view = 'tree'
    try {
      const html = render([file('packages/core/src/task-store.ts'), file('CHANGELOG.md')])
      expect(html).toContain('<summary title="packages/core/src">')
      expect(html).toContain('<span class="changed-file-name">task-store.ts</span>')
      expect(html).toContain('aria-label="平铺显示"')
    } finally {
      preference.view = 'list'
    }
  })
})
