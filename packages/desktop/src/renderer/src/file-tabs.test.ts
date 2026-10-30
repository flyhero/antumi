import { afterEach, expect, it } from 'vitest'
import type { ResolvedFile } from '@antumi/protocol'
import { closedFile, EMPTY_FILE_TABS, expandedFolders, exportFileTabs, fileDraft, fileScopeKey, fileScopeParams, forgetFileTabs, importFileTabs, keepFileDraft, markedDirty, openedFile, registerFileDraft, revealedFile, revealedFolder, saveFileScroll, toggledFolder, updateFileTabs, useFileTabs } from './file-tabs'

const file: ResolvedFile = { path: '/project/a.ts', root: '/project', relative: 'a.ts', kind: 'file' }
afterEach(() => importFileTabs({ tabs: {}, drafts: [] }))

it('deduplicates file tabs while honoring another request to reveal a line', () => {
  const first = openedFile(EMPTY_FILE_TABS, file, 10)
  const moved = { ...first, tabs: first.tabs.map((tab) => ({ ...tab, scrollTop: 300 })) }
  const again = openedFile(moved, file, 20)
  expect(again.tabs).toHaveLength(1)
  expect(again.tabs[0]).toMatchObject({ line: 20, reveal: 2, scrollTop: 300 })
})

it('selects a neighboring tab on close, the file tree still showing', () => {
  const next = { ...file, path: '/project/b.ts', relative: 'b.ts' }
  const both = openedFile(openedFile(EMPTY_FILE_TABS, file, null), next, null)
  const one = closedFile(both, next.path)
  expect(one.active).toBe(file.path)
  expect(closedFile(one, file.path)).toMatchObject({ tabs: [], active: null, tree: true })
})

it('keys open files by their folders, so chats on one checkout share them', () => {
  expect(fileScopeKey({ conversationId: 'a', roots: ['/wt/one'] })).toBe(fileScopeKey({ conversationId: 'b', roots: ['/wt/one'] }))
  expect(fileScopeKey({ conversationId: 'a', roots: ['/wt/one'] })).not.toBe(fileScopeKey({ conversationId: 'a', roots: ['/wt/two'] }))
  expect(fileScopeKey({ conversationId: 'a', roots: [] })).not.toBe(fileScopeKey({ conversationId: 'b', roots: [] }))
  expect(fileScopeParams({ conversationId: 'a', roots: ['/wt/one'] })).toEqual({ conversationId: 'a' })
  expect(fileScopeParams({ conversationId: null, roots: ['/wt/one'] })).toEqual({ roots: ['/wt/one'] })
})

it('isolates selections and scroll positions between conversations and cleans deleted ones', () => {
  for (const id of ['first', 'second']) updateFileTabs(id, (state) => openedFile(state, file, null))
  saveFileScroll('first', file.path, 100, 20)
  expect(useFileTabs.getState().first?.tabs[0]?.scrollTop).toBe(100)
  expect(useFileTabs.getState().second?.tabs[0]?.scrollTop).toBe(0)
  forgetFileTabs('first')
  expect(useFileTabs.getState().first).toBeUndefined()
  expect(useFileTabs.getState().second).toBeDefined()
})

it('marks a tab dirty and keeps it so when the file is opened again', () => {
  const dirty = markedDirty(openedFile(EMPTY_FILE_TABS, file, null), file.path, true)
  expect(dirty.tabs[0]?.dirty).toBe(true)
  expect(markedDirty(dirty, file.path, true)).toBe(dirty)
  expect(openedFile(dirty, file, 3).tabs[0]?.dirty).toBe(true)
})

it('remembers a file preview across tab switches, and returns to source for a requested line', () => {
  const document = { ...file, path: '/project/README.md', relative: 'README.md' }
  const opened = openedFile(EMPTY_FILE_TABS, document, null)
  const preview = { ...opened, tabs: opened.tabs.map((tab) => ({ ...tab, preview: true, scrollTop: 120, dirty: true })) }
  const switched = openedFile(preview, file, null)
  expect(switched.tabs.find((tab) => tab.file.path === document.path)).toMatchObject({ preview: true, dirty: true })
  expect(openedFile(switched, document, null).tabs[0]).toMatchObject({ preview: true, scrollTop: 120, dirty: true })
  expect(openedFile(switched, document, 20).tabs[0]).toMatchObject({ preview: false, line: 20, scrollTop: 120, dirty: true })
})

it('opens SVG in preview, remembers a source choice, and honors source line navigation', () => {
  const svg = { ...file, path: '/project/icon.SVG', relative: 'icon.SVG' }
  const opened = openedFile(EMPTY_FILE_TABS, svg, null)
  expect(opened.tabs[0]?.preview).toBe(true)
  const source = { ...opened, tabs: opened.tabs.map((tab) => ({ ...tab, preview: false })) }
  expect(openedFile(source, svg, null).tabs[0]?.preview).toBe(false)
  expect(openedFile(opened, svg, 5).tabs[0]).toMatchObject({ preview: false, line: 5 })
})

it('moves open files and unsaved text with a snapshot', () => {
  updateFileTabs('scope', (state) => openedFile(state, file, 4))
  keepFileDraft('scope', file.path, { text: 'next', base: 'was', mtimeMs: 10 })
  const snapshot = exportFileTabs()
  useFileTabs.setState({}, true)
  importFileTabs(snapshot)
  expect(useFileTabs.getState().scope?.tabs[0]?.file.path).toBe(file.path)
  expect(useFileTabs.getState().scope?.tabs[0]?.line).toBe(4)
  const again = exportFileTabs()
  expect(again.drafts).toEqual([{ id: 'scope', path: file.path, text: 'next', base: 'was', mtimeMs: 10 }])
})

it('captures the live editor before it unmounts and preserves a multi-project scope', () => {
  const key = fileScopeKey({ conversationId: 'chat', roots: ['/one', '/two'] })
  updateFileTabs(key, (state) => openedFile(state, file, null))
  keepFileDraft(key, file.path, { text: 'old draft', base: 'disk', mtimeMs: 1 })
  let text = 'still mounted'
  const release = registerFileDraft(key, file.path, () => ({ text, base: 'disk', mtimeMs: 1 }))
  try {
    expect(exportFileTabs().drafts).toEqual([{ id: key, path: file.path, text, base: 'disk', mtimeMs: 1 }])
    text = 'latest keystroke'
    const snapshot = exportFileTabs()
    importFileTabs({ tabs: {}, drafts: [] })
    importFileTabs(snapshot)
    expect(fileDraft(key, file.path)?.text).toBe('latest keystroke')
  } finally { release() }
})

it('does not transfer a cached draft after the live editor saved or undid its edits', () => {
  keepFileDraft('scope', file.path, { text: 'stale', base: 'disk', mtimeMs: 1 })
  const release = registerFileDraft('scope', file.path, () => null)
  try { expect(exportFileTabs().drafts).toEqual([]) } finally { release() }
})

it('opens every project until a folder is folded, and reveals a file by opening its folders', () => {
  const roots = ['/project', '/other']
  expect(expandedFolders(EMPTY_FILE_TABS, roots)).toEqual(roots)
  const folded = toggledFolder(EMPTY_FILE_TABS, roots, '/project')
  expect(expandedFolders(folded, roots)).toEqual(['/other'])
  const revealed = revealedFile(folded, roots, '/project/src/deep/a.ts')
  expect(expandedFolders(revealed, roots)).toEqual(['/other', '/project', '/project/src', '/project/src/deep'])
  expect(revealedFile(revealed, roots, '/project/src/b.ts')).toBe(revealed)
  expect(revealedFile(folded, roots, '/elsewhere/a.ts')).toBe(folded)
  expect(revealedFile(folded, ['/project'], '/project-other/a.ts')).toBe(folded)
  expect(expandedFolders(revealedFolder(folded, roots, '/project'), roots)).toEqual(['/other', '/project'])
  expect(expandedFolders(revealedFile(EMPTY_FILE_TABS, ['C:\\repo'], 'C:\\repo\\src\\a.ts'), ['C:\\repo'])).toEqual(['C:\\repo', 'C:\\repo\\src'])
})
