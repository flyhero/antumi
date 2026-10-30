import { getLocale, t } from '../i18n'
import { lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { languages } from '@codemirror/language-data'
import { bracketMatching, codeFolding, foldGutter, foldKeymap, HighlightStyle, indentOnInput, LanguageDescription, syntaxHighlighting } from '@codemirror/language'
import { findNext, findPrevious, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, Prec, type Text } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { tags } from '@lezer/highlight'
import { perform } from '../core-store'
import { dropFileDraft, fileDraft, fileScopeKey, fileScopeParams, keepFileDraft, markedDirty, registerFileDraft, saveFileScroll, updateFileTabs, useFileTabs, type FileScope, type FileTab } from '../file-tabs'
import { copyFileText } from '../file-actions'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { CheckIcon, CopyIcon, DocumentIcon } from './icons'
import { isShortcut, useShortcutLabel } from '../keyboard-shortcuts'
import { createFileSearchPanel, runFileSearchShortcut } from '../file-search-panel'
import { FileImage } from './FileImage'

const FileMarkdown = lazy(() => import('./FileMarkdown').then((module) => ({ default: module.FileMarkdown })))

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: tags.comment, color: 'var(--code-comment)' },
  { tag: [tags.function(tags.variableName), tags.heading], color: 'var(--code-title)' },
  { tag: [tags.typeName, tags.className], color: 'var(--code-type)' },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName], color: 'var(--code-variable)' }
])

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--surface)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: 'var(--chat-font-size, 14px)', lineHeight: '1.7' },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--text)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': { color: 'var(--text-3)', backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)' },
  '.cm-foldGutter .cm-gutterElement': { cursor: 'pointer', padding: '0 4px' },
  '.cm-foldPlaceholder': { color: 'var(--text-muted)', backgroundColor: 'var(--fill-2)', border: 'none', borderRadius: 'var(--radius-xs)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--fill-2)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--fill-2)', outline: '1px solid var(--text-3)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--accent-bg)' },
  '.cm-panels': { color: 'var(--text)', backgroundColor: 'var(--surface)', borderColor: 'var(--border)' },
  '.cm-searchMatch': { backgroundColor: 'var(--fill-2)', outline: '1px solid var(--text-3)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--accent-bg)', outline: '1px solid var(--accent)' }
})

const markers = indentationMarkers({ thickness: 1, colors: { light: 'var(--border-2)', dark: 'var(--border-2)', activeLight: 'var(--text-3)', activeDark: 'var(--text-3)' } })

const fold = foldGutter({
  markerDOM: (open) => {
    const marker = document.createElement('span')
    marker.className = 'file-fold-marker'
    marker.dataset.open = String(open)
    marker.textContent = '›'
    return marker
  }
})

// Shared by every editor, so a draft's state could move between them; a compartment is only a key.
const wrapping = new Compartment()
const editing = new Compartment()
const wording = new Compartment()
const editorPhrases = () => EditorState.phrases.of({ 'Fold line': t('FileSource.fold'), 'Unfold line': t('FileSource.expand'), 'folded code': t('FileSource.foldedCode') })

function editable(on: boolean, label: string) {
  return [
    EditorState.readOnly.of(!on), EditorView.editable.of(on),
    EditorView.contentAttributes.of({ 'aria-label': label, 'aria-readonly': String(!on), tabindex: '0' })
  ]
}

// CodeMirror counts any line break as one; a file written with CRLF keeps them when saved.
function lineSeparator(text: string) {
  return text.includes('\r\n') ? [EditorState.lineSeparator.of('\r\n')] : []
}

// What is on disk: the text the editor was loaded from or last saved, and its mtime.
export type FileDisk = { text: string; mtimeMs: number | null }
export type FileSourceHandle = { search(): void; save(): void }
// `disk`: the file changed on disk under unsaved edits; `conflict`: a save found it changed.
type Notice = 'disk' | 'conflict' | null

export function FileSource({ scope, tab, disk, wrap, writable, preview, ref }: {
  scope: FileScope; tab: FileTab; disk: FileDisk; wrap: boolean; writable: boolean; preview: boolean; ref?: Ref<FileSourceHandle>
}) {
  const key = fileScopeKey(scope)
  const host = useRef<HTMLDivElement>(null)
  const saveKey = useShortcutLabel('save-file')
  const editor = useRef<EditorView | null>(null)
  const base = useRef<{ text: string; doc: Text | null; mtimeMs: number | null }>({ text: disk.text, doc: null, mtimeMs: disk.mtimeMs })
  const [menu, setMenu] = useState<{ at: MenuPoint; selected: string; text: string } | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [saving, setSaving] = useState(false)
  const [previewText, setPreviewText] = useState(disk.text)
  const close = useCallback(() => setMenu(null), [])
  const path = tab.file.path
  const writableNow = useRef(writable)
  writableNow.current = writable

  const baseDoc = (view: EditorView) => {
    base.current.doc ??= view.state.toText(base.current.text)
    return base.current.doc
  }
  const setBase = (text: string, mtimeMs: number | null) => { base.current = { text, doc: null, mtimeMs } }
  const syncDirty = (view: EditorView) => {
    const dirty = !view.state.doc.eq(baseDoc(view))
    updateFileTabs(key, (state) => markedDirty(state, path, dirty))
    return dirty
  }
  const replace = (view: EditorView, text: string) => {
    const top = view.scrollDOM.scrollTop
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: view.state.toText(text) } })
    view.scrollDOM.scrollTop = top
  }

  const save = async (force = false) => {
    const view = editor.current
    if (!view || !writableNow.current || saving) return
    const text = view.state.sliceDoc()
    setSaving(true)
    const result = await perform((rpc) => rpc.call('files.write', { ...fileScopeParams(scope), path, text, expectedMtimeMs: force ? null : base.current.mtimeMs }))
    setSaving(false)
    if (!result || editor.current !== view) return
    if (result.kind === 'conflict') { setNotice('conflict'); return }
    setBase(text, result.mtimeMs)
    setNotice(null)
    if (!syncDirty(view)) dropFileDraft(key, path)
  }
  const saveRef = useRef(save)
  saveRef.current = save

  // Throws the unsaved edits away for what is on disk now.
  const reload = async () => {
    const view = editor.current
    if (!view) return
    const read = await perform((rpc) => rpc.call('files.read', { ...fileScopeParams(scope), path }))
    if (read?.kind !== 'text' || editor.current !== view) return
    setBase(read.text, read.mtimeMs ?? null)
    replace(view, read.text)
    setNotice(null)
    syncDirty(view)
    dropFileDraft(key, path)
  }

  useImperativeHandle(ref, () => ({
    search: () => { if (editor.current) openSearchPanel(editor.current) },
    save: () => { void saveRef.current() }
  }), [])

  useEffect(() => {
    if (!host.current) return
    let current = true
    const language = new Compartment()
    const draft = fileDraft(key, path)
    if (draft) setBase(draft.base, draft.mtimeMs)
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: draft?.text ?? disk.text,
        extensions: [
          lineSeparator(draft?.base ?? disk.text),
          editing.of(editable(writableNow.current, path)),
          Prec.highest(EditorView.domEventHandlers({ keydown: (event, view) => {
            if (runFileSearchShortcut(event, view)) return true
            if (!isShortcut('save-file', event)) return false
            event.preventDefault()
            if (!event.repeat) void saveRef.current()
            return true
          } })),
          lineNumbers(), fold, codeFolding(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
          history(), indentOnInput(), bracketMatching(), markers,
          keymap.of([...searchKeymap.filter((binding) => binding.run !== openSearchPanel && binding.run !== findNext && binding.run !== findPrevious), ...historyKeymap, ...foldKeymap, ...defaultKeymap, indentWithTab]), search({ top: true, createPanel: createFileSearchPanel }),
          wording.of(editorPhrases()),
          EditorView.updateListener.of((update) => { if (update.docChanged) syncDirty(update.view) }),
          wrapping.of(wrap ? EditorView.lineWrapping : []), language.of([]), syntaxHighlighting(highlight), theme
        ]
      })
    })
    editor.current = view
    const releaseDraft = registerFileDraft(key, path, () => view.state.doc.eq(baseDoc(view))
      ? null : { text: view.state.sliceDoc(), base: base.current.text, mtimeMs: base.current.mtimeMs })
    syncDirty(view)
    const saved = useFileTabs.getState()[key]?.tabs.find((tab) => tab.file.path === path)
    const restore = requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = saved?.scrollTop ?? 0
      view.scrollDOM.scrollLeft = saved?.scrollLeft ?? 0
    })
    const scroll = () => saveFileScroll(key, path, view.scrollDOM.scrollTop, view.scrollDOM.scrollLeft)
    view.scrollDOM.addEventListener('scroll', scroll)
    const description = LanguageDescription.matchFilename(languages, path.split(/[\\/]/).at(-1) ?? path)
    if (description) void description.load().then((support) => {
      if (current) view.dispatch({ effects: language.reconfigure(support) })
    }).catch(() => {})
    return () => {
      releaseDraft()
      current = false
      cancelAnimationFrame(restore)
      view.scrollDOM.removeEventListener('scroll', scroll)
      // Kept while the tab stays open, so switching tabs or panels loses nothing; a closed tab was confirmed.
      const open = useFileTabs.getState()[key]?.tabs.some((tab) => tab.file.path === path)
      if (open && !view.state.doc.eq(baseDoc(view))) keepFileDraft(key, path, { text: view.state.sliceDoc(), base: base.current.text, mtimeMs: base.current.mtimeMs })
      else dropFileDraft(key, path)
      view.destroy()
      editor.current = null
    }
  }, [key, path])

  // A fresh read: taken as is under no edits, else only noted, so typing is never thrown away.
  useEffect(() => {
    const view = editor.current
    if (!view) return
    if (view.state.sliceDoc() === disk.text) {
      setBase(disk.text, disk.mtimeMs)
      setNotice(null)
      syncDirty(view)
    } else if (view.state.doc.eq(baseDoc(view))) {
      setBase(disk.text, disk.mtimeMs)
      replace(view, disk.text)
    } else if (disk.text !== base.current.text) {
      setNotice((notice) => notice ?? 'disk')
    }
  }, [disk])
  useEffect(() => { editor.current?.dispatch({ effects: wording.reconfigure(editorPhrases()) }) }, [getLocale()])
  useEffect(() => { editor.current?.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) }) }, [wrap])
  useEffect(() => { editor.current?.dispatch({ effects: editing.reconfigure(editable(writable, path)) }) }, [writable, path])
  useEffect(() => {
    if (preview) setPreviewText(editor.current?.state.sliceDoc() ?? disk.text)
    else editor.current?.requestMeasure()
  }, [preview, disk])
  useEffect(() => {
    const view = editor.current
    if (!view || tab.line === null) return
    const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, tab.line))).from
    const frame = requestAnimationFrame(() => {
      view.dispatch({ selection: { anchor: line }, effects: EditorView.scrollIntoView(line, { y: 'center' }) })
      view.focus()
      updateFileTabs(key, (state) => ({ ...state, tabs: state.tabs.map((each) => each.file.path === path && each.reveal === tab.reveal ? { ...each, line: null } : each) }))
    })
    return () => cancelAnimationFrame(frame)
  }, [key, path, tab.line, tab.reveal])

  return <>
    {notice && <div className="file-notice" role="alert">
      <span>{notice === 'conflict' ? t('FileSource.saveFailedFileChangedOnDisk') : t('FileSource.fileChangedOnDiskAndYouHaveUnsaved')}</span>
      <button type="button" className="link-button" onClick={() => { if (window.confirm(t('FileSource.discardUnsavedChangesAndReloadTheFileFrom'))) void reload() }}>{t('FileSource.reload')}</button>
      {notice === 'conflict'
        ? <button type="button" className="link-button" onClick={() => void save(true)}>{t('FileSource.overwrite')}</button>
        : <button type="button" className="link-button" onClick={() => setNotice(null)}>{t('FileSource.keepMyChanges')}</button>}
    </div>}
    {preview && (/\.svg$/i.test(path)
      ? <FileImage path={path} text={previewText} />
      : <div className="file-markdown-scroll" tabIndex={0} role="region" aria-label={t('FileSource.markdownPreview')}><Suspense fallback={<p className="inspector-empty muted" role="status">{t('FileSource.renderingMarkdown')}</p>}><FileMarkdown text={previewText} file={tab.file} scope={scope} /></Suspense></div>)}
    <div className="file-source" hidden={preview} ref={host} onContextMenu={(event) => {
      event.preventDefault()
      const view = editor.current
      if (!view) return
      const selection = view.state.selection.main
      setMenu({ at: menuPoint(event), selected: view.state.sliceDoc(selection.from, selection.to), text: view.state.sliceDoc() })
    }}>
      {menu && <ContextMenu at={menu.at} label={t('FileSource.fileContent')} onClose={close}>
        {writable && tab.dirty && <MenuItem label={t('FileEditor.save')} icon={<CheckIcon />} hint={saveKey} onSelect={() => { close(); void save() }} />}
        {menu.selected && <MenuItem label={t('ChatContextMenu.copySelection')} icon={<CopyIcon />} onSelect={() => { close(); void copyFileText(menu.selected) }} />}
        <MenuItem label={t('FileSource.copyAllContent')} icon={<DocumentIcon />} onSelect={() => { close(); void copyFileText(menu.text) }} />
      </ContextMenu>}
    </div>
  </>
}
