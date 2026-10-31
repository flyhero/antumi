import { getLocale, t } from '../i18n'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import type { ProjectFileMatch, ResolvedFile } from '@antumi/protocol'
import { useCore } from '../core-store'
import { fileScopeKey, fileScopeParams, type FileScope } from '../file-tabs'
import { FileMenu } from './FileMenu'
import { ChevronRightIcon, SearchIcon } from './icons'
import { FileTypeIcon } from './FileTypeIcon'
import { isDarkTheme, onThemeChange } from '../appearance'
import { baseName, treeRows, type Listing, type Row } from '../file-tree-rows'

const SEARCH_DELAY_MS = 150
function relativeTo(root: string, path: string): string {
  return path === root ? '.' : path.slice(root.length + 1)
}

export function FileTree({ scope, roots, expanded, active, reveal, refresh, onToggle, onOpen }: {
  scope: FileScope
  roots: readonly string[]
  expanded: readonly string[]
  active: string | null
  // Goes up each time the active file is opened, again too: each time is one to scroll to.
  reveal: number
  // Changes whenever the folders may have changed on disk.
  refresh: string
  onToggle(folder: string): void
  onOpen(file: ResolvedFile): void
}) {
  const rpc = useCore((state) => state.rpc)
  const dark = useSyncExternalStore(onThemeChange, isDarkTheme, () => false)
  const key = fileScopeKey(scope)
  const [listings, setListings] = useState<Record<string, Listing>>({})
  const requested = useRef<{ refresh: string; folders: Set<string> }>({ refresh, folders: new Set() })
  const [filter, setFilter] = useState('')
  const [matches, setMatches] = useState<ProjectFileMatch[] | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const query = filter.startsWith('?') ? filter.slice(1).trim() : null

  useEffect(() => { setListings({}); requested.current = { refresh, folders: new Set() } }, [key])

  const { rows, needed: shown } = useMemo(() => treeRows(roots, expanded, listings), [roots, expanded, listings, getLocale()])

  // The open folders the tree shows; again, all of them, when the disk may have changed.
  useEffect(() => {
    if (!rpc) return
    if (requested.current.refresh !== refresh) requested.current = { refresh, folders: new Set() }
    for (const folder of shown) {
      if (requested.current.folders.has(folder)) continue
      requested.current.folders.add(folder)
      void rpc.call('files.list', { ...fileScopeParams(scope), path: folder })
        .then((listing): Listing => listing, (): Listing => 'error')
        .then((listing) => setListings((listings) => ({ ...listings, [folder]: listing })))
    }
  }, [rpc, key, refresh, shown.join('\0')])

  useEffect(() => {
    if (query === null || !rpc || roots.length === 0) { setMatches(null); return }
    let current = true
    const timer = setTimeout(() => {
      void rpc.call('projects.searchFiles', { roots: [...roots], query }).catch(() => []).then((found) => { if (current) setMatches(found) })
    }, SEARCH_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [rpc, query, roots.join('\0')])

  const shownRows: Row[] = query !== null
    ? (matches ?? []).map((match) => ({ path: match.path, name: baseName(match.path), kind: match.kind, depth: 0, root: match.root, detail: match.relative }))
    : filter.trim()
      ? rows.filter((row) => row.depth > 0 && row.kind !== 'other' && row.name.toLowerCase().includes(filter.trim().toLowerCase())).map((row) => ({ ...row, depth: 0, detail: relativeTo(row.root, row.path) }))
      : rows

  // A file opened is scrolled to once: tried again as rows change, since its folders open and load
  // one by one, but no more once it is shown, or every folder opened after (and every refresh)
  // would pull the tree back to it. A filter cleared brings it back into view.
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    if (filter) revealed.current = null
    const opening = active && `${reveal}\0${active}`
    if (!opening || filter || revealed.current === opening) return
    const row = list.current?.querySelector(`[data-path="${CSS.escape(active)}"]`)
    if (!row) return
    row.scrollIntoView({ block: 'nearest' })
    revealed.current = opening
  }, [active, reveal, filter, rows])

  // A compacted chain acts as its last folder: what it shows, and what its menu reveals.
  const resolved = (row: Row): ResolvedFile => {
    const path = row.folder ?? row.path
    return { path, root: row.root, relative: relativeTo(row.root, path), kind: row.kind === 'directory' ? 'directory' : 'file' }
  }
  const choose = (row: Row) => {
    if (row.kind === 'directory') {
      if (filter) {
        setFilter('')
        if (!expanded.includes(row.path)) onToggle(row.path)
      } else onToggle(row.path)
    } else if (row.kind === 'file') onOpen(resolved(row))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('.file-tree-row') ?? [])]
    const index = buttons.findIndex((button) => button === document.activeElement)
    const row = shownRows[index]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus()
    } else if (row?.kind === 'directory' && !filter && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      if (expanded.includes(row.path) === (event.key === 'ArrowLeft')) onToggle(row.path)
    }
  }

  return <div className="file-tree">
    <label className="file-tree-filter">
      <SearchIcon />
      <input
        value={filter}
        placeholder={t('FileTree.filterOrTypeToSearchTheEntireProject')}
        aria-label={t('FileTree.filterFiles')}
        spellCheck={false}
        onChange={(event) => setFilter(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && filter) { event.preventDefault(); event.stopPropagation(); setFilter('') }
          if (event.key === 'ArrowDown') { event.preventDefault(); list.current?.querySelector<HTMLButtonElement>('.file-tree-row')?.focus() }
        }}
      />
    </label>
    <div className="file-tree-list" ref={list} role="tree" aria-label={t('FileTree.projectFiles')} onKeyDown={onKeyDown}>
      {shownRows.map((row) => {
        const open = row.kind === 'directory' && !row.detail && expanded.includes(row.path)
        const failed = open && listings[row.folder ?? row.path] === 'error'
        const button = <button
          type="button"
          className="file-tree-row"
          role="treeitem"
          aria-level={row.depth + 1}
          aria-expanded={row.kind === 'directory' && !row.detail ? open : undefined}
          aria-selected={row.path === active}
          data-path={row.path}
          data-kind={row.kind}
          disabled={row.kind === 'other'}
          title={row.detail ?? row.folder ?? row.path}
          onClick={() => choose(row)}
        >
          {Array.from({ length: row.depth }, (_, index) => <span key={index} className="file-tree-indent" aria-hidden />)}
          <span className="file-tree-chevron" data-open={open || undefined} aria-hidden>{row.kind === 'directory' && <ChevronRightIcon />}</span>
          {row.kind !== 'other' && <FileTypeIcon path={row.folder ?? row.path} directory={row.kind === 'directory'} expanded={open} root={row.path === row.root} dark={dark} />}
          <span className="file-tree-name">{row.name}</span>
          {row.detail && <span className="file-tree-detail muted">{row.detail}</span>}
          {failed && <span className="file-tree-detail muted">{t('FileTree.cannotRead')}</span>}
        </button>
        return row.kind === 'other' ? <div key={row.path}>{button}</div> : <FileMenu key={row.path} scope={scope} file={resolved(row)} inPanel>{button}</FileMenu>
      })}
      {query !== null && matches?.length === 0 && <p className="file-tree-empty muted">{t('FileTree.noMatchingFiles')}</p>}
      {query === null && filter.trim() && shownRows.length === 0 && <p className="file-tree-empty muted">{t('FileTree.noMatchesInExpandedFoldersStartWithTo')}</p>}
    </div>
  </div>
}
