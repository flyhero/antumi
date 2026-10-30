import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GitBranch, GitTag } from '@antumi/protocol'
import { t } from '../i18n'
import { branchGroupIds, branchMatch, branchRows, type BranchRow } from '../git-branches'
import { setPreference, usePreferences } from '../preferences'
import { ContextMenu, MenuCheckboxItem, menuPoint, type MenuPoint } from './ContextMenu'
import { BranchIcon, CheckIcon, ChevronRightIcon, CollapseAllIcon, ExpandAllIcon, MoreIcon, StarIcon, TagIcon } from './icons'

function Highlight({ text, query }: { text: string; query: string }) {
  const matches = new Set(branchMatch(text, query) ?? [])
  let offset = 0
  return <>{Array.from(text).map((char) => { const index = offset; offset += char.length; return matches.has(index) ? <mark key={index}>{char}</mark> : <span key={index}>{char}</span> })}</>
}

export function GitBranchTree({ branches, tags, recent, selected, current, directory, pick, actions, tagActions, toggleFavorite, favoriting, onMenuClose }: {
  branches: GitBranch[]; tags: GitTag[]; recent: string[]; selected: string; current: string | null; directory: string;
  pick: (ref: string) => void; actions: (branch: GitBranch, close: () => void) => ReactNode; tagActions: (tag: GitTag, close: () => void) => ReactNode;
  toggleFavorite?: (branch: GitBranch) => void; favoriting: ReadonlySet<string>; onMenuClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [active, setActive] = useState('HEAD')
  const [menu, setMenu] = useState<{ row: BranchRow; at: MenuPoint } | null>(null)
  const [settings, setSettings] = useState<MenuPoint | null>(null)
  const grouped = usePreferences((s) => s.gitGroupByDirectory)
  const showRecent = usePreferences((s) => s.gitShowRecent)
  const showTags = usePreferences((s) => s.gitShowTags)
  const foldedGroups = usePreferences((s) => s.gitFoldedGroups)
  const tree = useRef<HTMLDivElement>(null)
  const prefix = useId()
  const folded = useMemo(() => new Set(foldedGroups[directory] ?? branchGroupIds({ branches, tags, current, recent, grouped, showRecent, showTags }, 1)), [foldedGroups, directory, branches, tags, current, recent, grouped, showRecent, showTags])
  const groupIds = useMemo(() => branchGroupIds({ branches, tags, current, recent, grouped, showRecent, showTags }), [branches, tags, current, recent, grouped, showRecent, showTags])
  const searching = Boolean(query.trim())
  const rows = branchRows({ branches, tags, current, recent, query, favoritesOnly: favoritesOnly && Boolean(toggleFavorite), grouped, showRecent, showTags, folded })
  const menuRow = menu?.row
  const menuBranch = menuRow?.kind === 'branch' ? branches.find((branch) => branch.ref === menuRow.branch.ref) : undefined
  const menuTag = menuRow?.kind === 'tag' ? tags.find((tag) => tag.ref === menuRow.tag.ref) : undefined
  const activeIndex = Math.max(0, rows.findIndex((row) => row.id === active))
  const selectedRef = (row: BranchRow) => row.kind === 'branch' ? row.branch.ref : row.kind === 'tag' ? row.tag.ref : row.kind === 'filter' ? row.ref : null
  const title = (row: BranchRow) => row.kind !== 'group' ? '' : row.section === 'recent' ? t('GitPage.recentBranches') : row.section === 'local' ? t('GitInspector.local') : row.section === 'remote' ? t('GitInspector.remote') : row.section === 'tags' ? t('GitPage.tags') : row.label
  const toggle = (row: BranchRow, open?: boolean) => {
    if (row.kind !== 'group') return
    const next = new Set(folded)
    if (open ?? !row.open) next.delete(row.id)
    else next.add(row.id)
    setPreference('gitFoldedGroups', { ...foldedGroups, [directory]: [...next] })
  }
  const anyOpen = groupIds.some((id) => !folded.has(id))
  const expandAll = (open: boolean) => {
    setPreference('gitFoldedGroups', { ...foldedGroups, [directory]: open ? [] : groupIds })
    setActive('')
  }
  const revealMenu = (row: BranchRow, at?: MenuPoint) => {
    if (row.kind !== 'branch' && row.kind !== 'tag') return
    setActive(row.id)
    const bounds = document.getElementById(`${prefix}-${rows.indexOf(row)}`)?.getBoundingClientRect()
    setMenu({ row, at: at ?? { x: bounds?.right ?? 0, y: bounds?.top ?? 0 } })
  }
  const activate = (row: BranchRow) => { setActive(row.id); if (row.kind === 'group') toggle(row); else { const ref = selectedRef(row); if (ref) pick(ref) } }
  const closeMenu = () => { setMenu(null); onMenuClose(); tree.current?.focus() }
  useEffect(() => {
    if (menu || settings) return
    document.getElementById(`${prefix}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, query])
  useEffect(() => {
    if (!menu) return
    if (menuRow?.kind === 'branch' && !menuBranch || menuRow?.kind === 'tag' && !menuTag) closeMenu()
  }, [branches, tags])
  return <>
    <div className="git-branch-search">
      <input className="input" aria-label={t('ConversationBranches.searchBranches')} placeholder={t('GitPage.searchRefs')} value={query}
        onChange={(event) => { setQuery(event.target.value); setActive('') }}
        onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActive(rows[0]?.id ?? ''); tree.current?.focus() } if (event.key === 'Escape') setQuery('') }} />
      {toggleFavorite && <button className="tool-button git-branch-star" aria-label={t('GitInspector.favoritesOnly')} title={t('GitInspector.favoritesOnly')} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}><StarIcon /></button>}
      {/* One button for both: while any group is open it folds them all, and once none is, opens them. */}
      <button type="button" className="tool-button" aria-label={t(anyOpen ? 'GitPage.collapseAll' : 'GitPage.expandAll')} data-tooltip={t(searching ? 'GitPage.searchAutoExpands' : anyOpen ? 'GitPage.collapseAll' : 'GitPage.expandAll')} disabled={searching || !groupIds.length} onClick={() => expandAll(!anyOpen)}>{anyOpen ? <CollapseAllIcon /> : <ExpandAllIcon />}</button>
      <button className="tool-button" aria-label={t('GitPage.viewOptions')} onClick={(event) => setSettings(menuPoint(event))}><MoreIcon /></button>
    </div>
    <div ref={tree} className="git-branch-list" role="tree" aria-label={t('GitInspector.branches')} tabIndex={0} aria-activedescendant={rows.length ? `${prefix}-${activeIndex}` : undefined}
      onKeyDown={(event) => {
        const row = rows[activeIndex]
        if (!row) return
        const move = (index: number) => setActive(rows[Math.max(0, Math.min(rows.length - 1, index))]?.id ?? '')
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(activeIndex + (event.key === 'ArrowDown' ? 1 : -1)) }
        else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); move(event.key === 'Home' ? 0 : rows.length - 1) }
        else if (event.key === 'ArrowRight') { event.preventDefault(); if (row.kind === 'group') { if (row.open) move(activeIndex + 1); else toggle(row, true) } else revealMenu(row) }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); if (row.kind === 'group' && row.open) toggle(row, false); else if (row.parent) setActive(row.parent) }
        else if (event.key === 'Enter') { event.preventDefault(); activate(row) }
        else if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); revealMenu(row) }
      }}>
      {rows.map((row, index) => {
        const branch = row.kind === 'branch' ? row.branch : null
        const ref = selectedRef(row)
        const label = row.kind === 'filter' ? t(row.ref === 'HEAD' ? 'GitInspector.headCurrentBranch' : 'GitInspector.allBranches') : row.kind === 'group' ? title(row) : query.trim() && branch?.remote ? `${branch.remote}/${branch.name}` : row.label
        const style = { '--git-depth': row.depth }
        return <div key={row.id} id={`${prefix}-${index}`} role="treeitem" aria-level={row.depth + 1} aria-expanded={row.kind === 'group' ? row.open : undefined} aria-selected={ref ? ref === selected : undefined}
          className="git-branch-row" data-selected={ref === selected || undefined} data-active={index === activeIndex || undefined} data-current={branch?.name === current && !branch.remote || undefined} data-group={row.kind === 'group' || undefined}
          style={style} onClick={() => { activate(row); tree.current?.focus() }}
          onContextMenu={(event) => { if (row.kind === 'branch' || row.kind === 'tag') { event.preventDefault(); revealMenu(row, menuPoint(event)) } }}
          title={branch ? `${branch.remote ? `${branch.remote}/` : ''}${branch.name}${branch.upstream ? ` → ${branch.upstream}` : ''}${branch.worktree ? `\n${branch.worktree}` : ''}` : label}>
          {row.kind === 'group' ? <span className="git-group-chevron" data-open={row.open}><ChevronRightIcon /></span>
            : branch && toggleFavorite ? <button className="tool-button git-branch-star" tabIndex={-1} aria-label={t(branch.favorite ? 'GitInspector.removeFavoriteFor' : 'GitInspector.addFavoriteFor', { name: branch.name })} aria-pressed={Boolean(branch.favorite)} disabled={favoriting.has(branch.ref)} onClick={(event) => { event.stopPropagation(); toggleFavorite(branch) }}><StarIcon /></button>
              : row.kind === 'tag' ? <TagIcon /> : <BranchIcon />}
          <span className={row.kind === 'group' ? 'git-tree-name' : 'git-tree-name mono'}><Highlight text={label} query={query} /></span>
          {row.kind === 'group' && <span className="git-tree-count">{row.count}</span>}
          {branch && <>
            {branch.name === current && !branch.remote && <CheckIcon />}
            {Boolean(branch.ahead || branch.behind) && <span className="git-branch-track" title={t('GitInspector.aheadBehind', { ahead: branch.ahead ?? 0, behind: branch.behind ?? 0 })}>{Boolean(branch.behind) && <span data-side="behind">↓{branch.behind}</span>}{Boolean(branch.ahead) && <span data-side="ahead">↑{branch.ahead}</span>}</span>}
            {(branch.protected || branch.worktree && branch.name !== current) && <span className="git-branch-badge">{t(branch.protected ? 'GitInspector.task' : 'GitInspector.checkedOut')}</span>}
          </>}
        </div>
      })}
      {!rows.some((row) => row.kind === 'branch' || row.kind === 'tag' || row.kind === 'group') && <p className="git-message muted">{t('GitInspector.noMatchingBranches')}</p>}
    </div>
    {menu && <ContextMenu at={menu.at} label={t('GitInspector.branchActions')} onClose={closeMenu}>{menuBranch ? actions(menuBranch, closeMenu) : menuTag ? tagActions(menuTag, closeMenu) : null}</ContextMenu>}
    {settings && <ContextMenu at={settings} label={t('GitPage.viewOptions')} onClose={() => setSettings(null)}>
      <MenuCheckboxItem label={t('GitPage.groupByDirectory')} checked={grouped} onSelect={() => setPreference('gitGroupByDirectory', !grouped)} />
      <MenuCheckboxItem label={t('GitPage.showRecent')} checked={showRecent} onSelect={() => setPreference('gitShowRecent', !showRecent)} />
      <MenuCheckboxItem label={t('GitPage.showTags')} checked={showTags} onSelect={() => setPreference('gitShowTags', !showTags)} />
    </ContextMenu>}
  </>
}
