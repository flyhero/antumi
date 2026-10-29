import { localized, t, tr } from '../i18n'
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import type { FileRead, ResolvedFile } from '@antumi/protocol'
import { useCore } from '../core-store'
import { canOpenWith } from '../desktop-bridge'
import { isImagePath } from '../file-links'
import { closedFile, dropFileDraft, EMPTY_FILE_TABS, expandedFolders, fileScopeKey, fileScopeParams, openedFile, revealedFile, revealedFolder, toggledFolder, updateFileTabs, useFileTabs, type FileScope, type FileTab } from '../file-tabs'
import { MAX_FILE_TREE_WIDTH, MIN_FILE_TREE_WIDTH, setPreference, usePreferences } from '../preferences'
import { isShortcut, useShortcutLabel } from '../keyboard-shortcuts'
import { FileSource, type FileDisk, type FileSourceHandle } from './FileSource'
import { FileImage } from './FileImage'
import { FileTree } from './FileTree'
import { OpenWithButton } from './OpenWithButton'
import { useFocusCount } from './Inspector'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { FileMenu, FileMenuItems } from './FileMenu'
import { Segmented } from './SettingsControls'
import { CheckIcon, CloseIcon, MoreIcon, RefreshIcon, SearchIcon, SidebarIcon } from './icons'

const REASON: Record<Extract<FileRead, { kind: 'unavailable' }>['reason'], string> = localized(() => ({
  'not-found': t('FileEditor.fileDoesNotExistItMayHaveBeen'),
  'is-directory': t('FileEditor.thisIsADirectoryAndCannotBeOpened'),
  binary: t('FileEditor.thisFileIsNotUtf8TextAnd'),
  'too-large': t('FileEditor.thisFileExceeds2MibAndCannotBe'),
  unreadable: t('FileEditor.cannotReadFileCheckAccessPermissions')
}))

function FileContent({ scope, tab, wrap, writable, source, refresh, preview }: {
  scope: FileScope; tab: FileTab; wrap: boolean; writable: boolean; source: RefObject<FileSourceHandle | null>; refresh: string; preview: boolean
}) {
  const rpc = useCore((state) => state.rpc)
  const [result, setResult] = useState<FileRead | null>(null)
  const [loading, setLoading] = useState(true)
  const path = tab.file.path
  useEffect(() => {
    if (!rpc) return
    let current = true
    setLoading(true)
    void rpc.call('files.read', { ...fileScopeParams(scope), path }).catch(() => ({ kind: 'unavailable', reason: 'unreadable' } as const)).then((read) => {
      if (current) { setResult(read); setLoading(false) }
    })
    return () => { current = false }
  }, [rpc, fileScopeKey(scope), path, refresh])
  const disk = useMemo<FileDisk | null>(() => result?.kind === 'text' ? { text: result.text, mtimeMs: result.mtimeMs ?? null } : null, [result])
  return <div className="file-editor-content" data-file-path={path} aria-busy={loading}>
    {disk
      ? <FileSource ref={source} scope={scope} tab={tab} disk={disk} wrap={wrap} writable={writable} preview={preview} />
      : result?.kind === 'unavailable' && preview && /\.svg$/i.test(path)
        ? <FileImage path={path} version={refresh} />
        : <p className="inspector-empty muted" role="status">{result?.kind === 'unavailable' ? REASON[result.reason] : t('FileEditor.readingFile')}</p>}
  </div>
}

// Where the file sits: its project, then its folders, the middle ones folded away when there are many.
function Breadcrumb({ file, onFolder }: { file: ResolvedFile; onFolder(folder: string): void }) {
  if (file.root === null || file.relative === null) return <div className="file-editor-crumbs mono" title={file.path}><span className="file-editor-crumb-current">{file.path}</span></div>
  const root = file.root
  const separator = file.path.charAt(root.length) || '/'
  const parts = file.relative.split(/[\\/]/)
  const folders = parts.slice(0, -1).map((name, index) => ({ name, path: [root, ...parts.slice(0, index + 1)].join(separator) }))
  const crumbs = [{ name: root.split(/[\\/]/).filter(Boolean).at(-1) ?? root, path: root }, ...folders]
  const shown = crumbs.length > 4 ? [crumbs[0], null, ...crumbs.slice(-2)] : crumbs
  return <nav className="file-editor-crumbs" aria-label={t('FileEditor.fileLocation')} title={file.path}>
    {shown.map((crumb, index) => <span key={crumb?.path ?? `gap-${index}`} className="file-editor-crumb">
      {crumb ? <button type="button" className="file-editor-crumb-button" onClick={() => onFolder(crumb.path)}>{crumb.name}</button> : <span className="muted">…</span>}
      <span className="muted" aria-hidden>/</span>
    </span>)}
    <span className="file-editor-crumb-current">{parts.at(-1)}</span>
  </nav>
}

function TreeResizer({ width, onWidth }: { width: number; onWidth(width: number): void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const clamp = (value: number) => Math.round(Math.min(MAX_FILE_TREE_WIDTH, Math.max(MIN_FILE_TREE_WIDTH, value)))
  return <div
    className="file-editor-resizer"
    role="separator"
    aria-orientation="vertical"
    aria-label={t('FileEditor.resizeFileTree')}
    aria-valuenow={width}
    aria-valuemin={MIN_FILE_TREE_WIDTH}
    aria-valuemax={MAX_FILE_TREE_WIDTH}
    tabIndex={0}
    data-dragging={dragging !== null || undefined}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(event.clientX - width) }}
    onPointerMove={(event) => { if (dragging !== null) onWidth(clamp(event.clientX - dragging)) }}
    onPointerUp={() => setDragging(null)}
    onPointerCancel={() => setDragging(null)}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onWidth(clamp(width + (event.key === 'ArrowLeft' ? -16 : 16))) }
    }}
  />
}

// The files panel's body: the folders' files on the left, the open ones on the right. Without
// core's file-editor it is the earlier preview: read-only, with no tree.
export function FileEditor({ scope, updatedAt, editor }: { scope: FileScope; updatedAt: number; editor: boolean }) {
  const saveKey = useShortcutLabel('save-file')
  const findKey = useShortcutLabel('find-content')
  const key = fileScopeKey(scope)
  const { roots } = scope
  const state = useFileTabs((state) => state[key] ?? EMPTY_FILE_TABS)
  const treeWidth = usePreferences((preferences) => preferences.fileTreeWidth)
  const focus = useFocusCount()
  const source = useRef<FileSourceHandle>(null)
  const modeLabel = useId()
  const more = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const refresh = `${focus}:${updatedAt}:${refreshCount}`
  const active = state.tabs.find((tab) => tab.file.path === state.active)
  const markdown = active && /\.(?:md|markdown|mdown|mkd)$/i.test(active.file.path)
  const svg = active && /\.svg$/i.test(active.file.path)
  const image = active && isImagePath(active.file.path)
  const text = active && (!image || svg)
  const preview = Boolean((markdown || svg) && active.preview)
  const browsable = editor && roots.length > 0
  const tree = browsable && state.tree
  const expanded = expandedFolders(state, roots)

  useEffect(() => {
    if (editor && active) updateFileTabs(key, (state) => revealedFile(state, roots, active.file.path))
  }, [editor, key, active?.file.path, active?.reveal, roots.join('\0')])

  const close = (tab: FileTab) => {
    if (tab.dirty && !window.confirm(t('FileEditor.hasUnsavedChangesCloseAndDiscardThem', { value1: tab.file.path.split(/[\\/]/).at(-1) }))) return
    updateFileTabs(key, (state) => closedFile(state, tab.file.path))
    dropFileDraft(key, tab.file.path)
  }
  const open = (file: ResolvedFile) => updateFileTabs(key, (state) => openedFile(state, file, null))
  const showFolder = (folder: string) => updateFileTabs(key, (state) => revealedFolder({ ...state, tree: true }, roots, folder))
  // With a tree to browse, the bar stays even with the tree folded away, so it can be opened again.
  if (!active && !browsable) return <p className="inspector-empty muted">{t('FileEditor.clickAFileInTheChatToPreview')}</p>

  const writable = editor && active?.file.root != null && Boolean(text)
  const name = (tab: FileTab) => tab.file.path.split(/[\\/]/).at(-1) ?? tab.file.path
  const setPreview = (preview: boolean) => updateFileTabs(key, (state) => ({ ...state, tabs: state.tabs.map((tab) => tab.file.path === active?.file.path ? { ...tab, preview } : tab) }))
  return <div className="file-editor" onKeyDown={(event) => {
    if (isShortcut('save-file', event.nativeEvent)) { event.preventDefault(); if (!event.repeat) source.current?.save() }
    else if (preview && isShortcut('find-content', event.nativeEvent)) {
      event.preventDefault(); setPreview(false); requestAnimationFrame(() => source.current?.search())
    }
  }}>
    <div className="file-editor-bar">
      {browsable && <button type="button" className="tool-button" aria-label={state.tree ? t('FileEditor.collapseFileTree') : t('FileEditor.openFileTree')} aria-pressed={state.tree} title={state.tree ? t('FileEditor.collapseFileTree') : t('FileEditor.openFileTree')} onClick={() => updateFileTabs(key, (state) => ({ ...state, tree: !state.tree }))}><SidebarIcon /></button>}
      <div className="file-editor-tabs" role="tablist" aria-label={t('FileEditor.openFiles')}>
        {state.tabs.map((tab) => <div className="file-editor-tab" key={tab.file.path} data-active={tab.file.path === state.active || undefined} data-dirty={tab.dirty || undefined}>
          <FileMenu scope={scope} file={tab.file} inPanel>
            <button type="button" role="tab" aria-selected={tab.file.path === state.active} title={tab.dirty ? t('FileEditor.unsaved', { value1: tab.file.path }) : tab.file.path} onClick={() => updateFileTabs(key, (state) => ({ ...state, active: tab.file.path }))}>
              {name(tab)}
              {state.tabs.some((other) => other.file.path !== tab.file.path && name(other) === name(tab)) && <span className="muted"> · {tab.file.relative ?? tab.file.path}</span>}
            </button>
          </FileMenu>
          <button type="button" className="file-editor-tab-close" aria-label={t('FileEditor.closeFile', { value1: tab.file.path, value2: tab.dirty ? t('FileEditor.unsaved_948') : '' })} onClick={() => close(tab)}>
            <span className="file-editor-tab-dot" aria-hidden /><CloseIcon />
          </button>
        </div>)}
      </div>
      {active && canOpenWith() && <OpenWithButton file={active.file} />}
      {text && <button type="button" className="tool-button" aria-label={t('FileEditor.searchFileContents')} title={[t('FileEditor.searchFileContents'), findKey].filter(Boolean).join(' · ')} onClick={() => { setPreview(false); requestAnimationFrame(() => source.current?.search()) }}><SearchIcon /></button>}
      <button type="button" className="tool-button" ref={more} aria-label={t('FileEditor.moreActions')} aria-haspopup="menu" aria-expanded={menu !== null} onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenu((menu) => menu ? null : { x: bounds.right, y: bounds.bottom + 4 })
      }}><MoreIcon /></button>
      {menu && <ContextMenu at={menu} align="end" trigger={more.current} label={t('FileEditor.fileActions')} onClose={() => setMenu(null)}>
        {writable && active?.dirty && <MenuItem label={t('FileEditor.save')} icon={<CheckIcon />} hint={saveKey} onSelect={() => { setMenu(null); source.current?.save() }} />}
        {text && <MenuItem label={state.wrap ? t('FileEditor.disableWordWrap') : t('FileEditor.wordWrap')} icon={<span aria-hidden>↩</span>} onSelect={() => { setMenu(null); updateFileTabs(key, (state) => ({ ...state, wrap: !state.wrap })) }} />}
        <MenuItem label={t('BrowserPanel.reload')} icon={<RefreshIcon />} onSelect={() => { setMenu(null); setRefreshCount((count) => count + 1) }} />
        {active && <><div className="menu-separator" role="separator" /><FileMenuItems scope={scope} file={active.file} inPanel onClose={() => setMenu(null)} /></>}
      </ContextMenu>}
    </div>
    <div className="file-editor-main">
      {tree && <>
        <div className="file-editor-tree" style={{ width: treeWidth }}>
          <FileTree scope={scope} roots={roots} expanded={expanded} active={active?.file.path ?? null} refresh={refresh}
            onToggle={(folder) => updateFileTabs(key, (state) => toggledFolder(state, roots, folder))} onOpen={open} />
        </div>
        <TreeResizer width={treeWidth} onWidth={(width) => setPreference('fileTreeWidth', width)} />
      </>}
      <div className="file-editor-pane">
        {active ? <>
          <div className="file-editor-location">
            <Breadcrumb file={active.file} onFolder={showFolder} />
            {(markdown || svg) && <div className="file-editor-mode">
              <span id={modeLabel} className="visually-hidden">{tr('FileEditor.viewMode', { value1: svg ? 'SVG' : 'Markdown' })}</span>
              <Segmented labelId={modeLabel} value={preview ? 'preview' : 'edit'} options={[{ value: 'edit', label: writable ? t('chatTools.edit') : t('FileEditor.source') }, { value: 'preview', label: t('chatTools.preview') }]} onChange={(mode) => setPreview(mode === 'preview')} />
            </div>}
          </div>
          {image && !svg ? <FileImage key={active.file.path} path={active.file.path} version={refresh} />
            : <FileContent key={active.file.path} scope={scope} tab={active} wrap={state.wrap} writable={writable} source={source} refresh={refresh} preview={preview} />}
        </> : <p className="inspector-empty muted">{tree ? t('FileEditor.selectAFileOnTheLeft') : t('FileEditor.openTheFileTreeToSelectAFile')}</p>}
      </div>
    </div>
  </div>
}
