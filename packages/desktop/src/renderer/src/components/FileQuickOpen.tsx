import { t } from '../i18n'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ProjectFileMatch } from '@antumi/protocol'
import { setFileQuickOpen, showFilesPanel, useCore, useFilesScope } from '../core-store'
import { showResolvedFile } from '../file-actions'
import { fileScopeKey, revealedFolder, updateFileTabs } from '../file-tabs'
import { isDarkTheme, onThemeChange } from '../appearance'
import { FileTypeIcon } from './FileTypeIcon'
import { SearchIcon } from './icons'
import './files-panel.css'

const SEARCH_DELAY_MS = 120

// Where a match sits under its project; empty at the top level, where the name says it all.
function folderOf(relative: string): string {
  return relative.replace(/[\\/]?[^\\/]*$/, '')
}

// ⌘P: a file of the files panel's folders by a few letters of its name, opened there.
export function FileQuickOpen() {
  const scope = useFilesScope()
  const rpc = useCore((s) => s.rpc)
  const dark = useSyncExternalStore(onThemeChange, isDarkTheme, () => false)
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<ProjectFileMatch[] | null>(null)
  const [selected, setSelected] = useState(0)
  const roots = scope?.roots ?? []

  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    if (!rpc || roots.length === 0) { setMatches([]); return }
    let current = true
    const timer = setTimeout(() => {
      void rpc.call('projects.searchFiles', { roots: [...roots], query: query.trim() }).catch(() => []).then((found) => {
        if (current) { setMatches(found); setSelected(0) }
      })
    }, SEARCH_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [rpc, query, roots.join('\0')])

  const close = () => setFileQuickOpen(false)
  const choose = (match: ProjectFileMatch | undefined) => {
    if (!match || !scope) return
    close()
    if (match.kind === 'file') {
      showResolvedFile(scope, { path: match.path, root: match.root, relative: match.relative, kind: 'file' }, null)
    } else {
      updateFileTabs(fileScopeKey(scope), (state) => revealedFolder({ ...state, tree: true }, roots, match.path))
      showFilesPanel(scope)
    }
  }

  return <dialog ref={dialog} className="modal file-quick-open" aria-label={t('FilesPanel.goToFile')} onCancel={(event) => { event.preventDefault(); close() }}
    onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <label className="file-quick-open-field">
      <SearchIcon />
      <input
        autoFocus
        value={query}
        spellCheck={false}
        placeholder={roots.length ? t('FilesPanel.searchFilesIn', { value1: roots.map((root) => root.split(/[\\/]/).at(-1)).join('、') }) : t('FilesPanel.openAConversationWithAProject')}
        aria-label={t('FilesPanel.goToFile')}
        aria-controls="file-quick-open-list"
        aria-activedescendant={matches?.[selected] ? `file-quick-open-${selected}` : undefined}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const count = matches?.length ?? 0
            if (count) setSelected((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            choose(matches?.[selected])
          }
        }}
      />
    </label>
    <ul id="file-quick-open-list" className="file-quick-open-list" role="listbox" aria-label={t('FilesPanel.matchingFiles')}>
      {matches?.map((match, index) => <li key={match.path} id={`file-quick-open-${index}`} role="option" aria-selected={index === selected}
        className="file-quick-open-row" onMouseMove={() => setSelected(index)} onClick={() => choose(match)}>
        <FileTypeIcon path={match.path} directory={match.kind === 'directory'} dark={dark} />
        <span className="file-quick-open-name">{match.path.split(/[\\/]/).at(-1)}{match.kind === 'directory' ? '/' : ''}</span>
        {folderOf(match.relative) && <span className="file-quick-open-detail muted">{folderOf(match.relative)}</span>}
      </li>)}
      {matches?.length === 0 && roots.length > 0 && <li className="file-quick-open-empty muted" role="presentation">{t('FileTree.noMatchingFiles')}</li>}
    </ul>
  </dialog>
}
