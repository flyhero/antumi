import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ProjectFileMatch } from '@antumi/protocol'
import { closeSearch, selectConversation, selectTask, useCore, useFilesScope } from '../core-store'
import { revealFilesFolder, showResolvedFile } from '../file-actions'
import { isDarkTheme, onThemeChange } from '../appearance'
import { t } from '../i18n'
import { agentEntries, conversationEntries, matchScore, recentEntries, searchSections, SEARCH_CATEGORIES, taskEntries, type SearchCategory, type SearchEntry, type SearchKind, type SearchSection } from '../search-palette'
import { openAgentProfile } from './AgentProfiles'
import { FileTypeIcon } from './FileTypeIcon'
import { AgentIcon, BoardIcon, RobotIcon, SearchIcon } from './icons'
import { projectName } from './ProjectPicker'
import './search-palette.css'

const FILE_DELAY_MS = 120
const MESSAGE_DELAY_MS = 200

const CATEGORY_LABEL = {
  all: 'SearchPalette.all', conversations: 'SearchPalette.conversations', tasks: 'SearchPalette.tasks', agents: 'SearchPalette.agents', files: 'SearchPalette.files'
} as const satisfies Record<SearchCategory, string>

// Where a file sits under its project; empty at the top level, where the name says it all.
function folderOf(relative: string): string {
  return relative.replace(/[\\/]?[^\\/]*$/, '')
}

// Conversations found by what was said in them, kept with the query they answer so a slow reply
// for an older query cannot label rows for a newer one.
function useMessageHits(query: string, wanted: boolean): ReadonlyMap<string, string> {
  const rpc = useCore((s) => s.rpc)
  const [hits, setHits] = useState<{ query: string; snippets: ReadonlyMap<string, string> }>({ query: '', snippets: new Map() })
  useEffect(() => {
    if (!rpc || !wanted || !query) return
    let current = true
    const timer = setTimeout(() => {
      void rpc.call('conversations.search', { query: query.slice(0, 200) }).catch(() => []).then((found) => {
        if (current) setHits({ query, snippets: new Map(found.map((hit) => [hit.conversationId, hit.snippet])) })
      })
    }, MESSAGE_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [rpc, query, wanted])
  return hits.query === query ? hits.snippets : new Map()
}

// Files of the folders the files panel shows, by a few letters of their name.
function useFileMatches(query: string, wanted: boolean, roots: readonly string[]): ProjectFileMatch[] {
  const rpc = useCore((s) => s.rpc)
  const [matches, setMatches] = useState<{ query: string; found: ProjectFileMatch[] }>({ query: '', found: [] })
  useEffect(() => {
    if (!rpc || !wanted || roots.length === 0) return
    let current = true
    const timer = setTimeout(() => {
      void rpc.call('projects.searchFiles', { roots: [...roots], query }).catch(() => []).then((found) => {
        if (current) setMatches({ query, found })
      })
    }, FILE_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [rpc, query, wanted, roots.join('\0')])
  return matches.query === query ? matches.found : []
}

export function SearchPalette({ initial }: { initial: SearchCategory }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<SearchCategory>(initial)
  const [selected, setSelected] = useState(0)
  const conversations = useCore((s) => s.conversations)
  const tasks = useCore((s) => s.tasks)
  const profiles = useCore((s) => s.agentProfiles)
  const scope = useFilesScope()
  const dark = useSyncExternalStore(onThemeChange, isDarkTheme, () => false)
  const roots = scope?.roots ?? []
  const needle = query.trim()
  const wants = (kind: SearchKind) => category === 'all' || category === kind
  const snippets = useMessageHits(needle, wants('conversations'))
  const files = useFileMatches(needle, wants('files') && (needle !== '' || category === 'files'), roots)

  useEffect(() => { dialog.current?.showModal() }, [])

  const sections: SearchSection[] = useMemo(() => {
    const conversationProject = (conversation: { workspacePath: string; projectPaths: readonly string[] }) => {
      const [primary] = conversation.projectPaths
      return primary ? projectName(primary) : null
    }
    const taskProject = (task: { repos: readonly { path: string }[] }) => (task.repos[0] ? projectName(task.repos[0].path) : null)
    if (!needle && category === 'all') {
      const recent = recentEntries(Object.values(conversations), Object.values(tasks), { conversation: conversationProject, task: taskProject })
      return recent.length > 0 ? [{ kind: 'conversations', entries: recent }] : []
    }
    const fileEntries: SearchEntry[] = files.map((match, index) => ({
      kind: 'files', id: match.path, title: `${match.path.split(/[\\/]/).at(-1) ?? match.path}${match.kind === 'directory' ? '/' : ''}`,
      detail: folderOf(match.relative) || null, at: -index, score: needle ? Math.max(1, matchScore(match.path.split(/[\\/]/).at(-1) ?? '', needle)) : 1
    }))
    const entries = needle
      ? [...conversationEntries(Object.values(conversations), needle, snippets, conversationProject), ...taskEntries(Object.values(tasks), needle, taskProject), ...agentEntries(Object.values(profiles), needle), ...fileEntries]
      : category === 'files' ? fileEntries
        : category === 'conversations' || category === 'tasks' ? recentEntries(Object.values(conversations), Object.values(tasks), { conversation: conversationProject, task: taskProject }).filter((entry) => entry.kind === category)
          : category === 'agents' ? agentEntries(Object.values(profiles), '') : []
    return searchSections(entries, category)
  }, [needle, category, conversations, tasks, profiles, snippets, files])

  const rows = sections.flatMap((section) => section.entries)
  const recent = !needle && category === 'all'
  useEffect(() => { setSelected(0) }, [needle, category])

  const choose = (entry: SearchEntry | undefined) => {
    if (!entry) return
    closeSearch()
    if (entry.kind === 'conversations') selectConversation(entry.id)
    else if (entry.kind === 'tasks') selectTask(entry.id)
    else if (entry.kind === 'agents') openAgentProfile(entry.id)
    else if (scope) {
      const match = files.find((each) => each.path === entry.id)
      if (!match) return
      if (match.kind === 'file') showResolvedFile(scope, { path: match.path, root: match.root, relative: match.relative, kind: 'file' }, null)
      else revealFilesFolder(scope, match.path)
    }
  }

  const icon = (entry: SearchEntry): ReactNode => {
    if (entry.kind === 'conversations') return <AgentIcon agent={conversations[entry.id]?.agent ?? null} />
    if (entry.kind === 'tasks') return <BoardIcon />
    if (entry.kind === 'agents') return <RobotIcon />
    return <FileTypeIcon path={entry.id} directory={entry.title.endsWith('/')} dark={dark} />
  }

  const moveCategory = (step: number) => {
    const at = SEARCH_CATEGORIES.indexOf(category)
    setCategory(SEARCH_CATEGORIES[(at + step + SEARCH_CATEGORIES.length) % SEARCH_CATEGORIES.length]!)
  }

  let index = -1
  return <dialog ref={dialog} className="modal search-palette" aria-label={t('SearchPalette.label')} onCancel={(event) => { event.preventDefault(); closeSearch() }}
    onClick={(event) => { if (event.target === event.currentTarget) closeSearch() }}>
    <label className="search-palette-field">
      <SearchIcon />
      <input
        autoFocus
        value={query}
        spellCheck={false}
        autoComplete="off"
        placeholder={t(category === 'files' && roots.length === 0 ? 'FilesPanel.openAConversationWithAProject' : 'SearchPalette.placeholder')}
        aria-label={t('SearchPalette.label')}
        aria-controls="search-palette-list"
        aria-activedescendant={rows[selected] ? `search-palette-${selected}` : undefined}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Tab') {
            event.preventDefault()
            moveCategory(event.shiftKey ? -1 : 1)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (rows.length) setSelected((at) => (at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            choose(rows[selected])
          }
        }}
      />
    </label>
    <div className="search-palette-tabs" role="tablist" aria-label={t('SearchPalette.label')}>
      {SEARCH_CATEGORIES.map((each) => <button key={each} type="button" role="tab" aria-selected={each === category} className="search-palette-tab"
        onMouseDown={(event) => event.preventDefault()} onClick={() => setCategory(each)}>{t(CATEGORY_LABEL[each])}</button>)}
    </div>
    <div id="search-palette-list" className="search-palette-list" role="listbox" aria-label={t('SearchPalette.label')}>
      {sections.map((section) => <section key={section.kind} className="search-palette-section">
        {(recent || category === 'all') && <h3 className="search-palette-heading">{recent ? t('SearchPalette.recent') : t(CATEGORY_LABEL[section.kind])}</h3>}
        {section.entries.map((entry) => {
          index += 1
          const at = index
          return <div key={`${entry.kind}/${entry.id}`} id={`search-palette-${at}`} role="option" aria-selected={at === selected}
            className="search-palette-row" onMouseMove={() => setSelected(at)} onClick={() => choose(entry)}>
            <span className="search-palette-icon">{icon(entry)}</span>
            <span className="search-palette-title">{entry.title}</span>
            {entry.detail && <span className="search-palette-detail muted" title={entry.detail}>{entry.detail}</span>}
          </div>
        })}
      </section>)}
      {rows.length === 0 && (needle || category !== 'all') && <p className="search-palette-empty muted">{t('SearchPalette.noMatches')}</p>}
    </div>
    <p className="search-palette-hint muted">{t('SearchPalette.hint')}</p>
  </dialog>
}
