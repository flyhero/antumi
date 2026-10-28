import { getLocale, localized, t, tr } from '../i18n'
import { isHelper } from '@antumi/protocol'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_KINDS, type AgentKind, type Conversation } from '@antumi/protocol'
import { openBeside, selectConversation, useCore, useSplitPanes } from '../core-store'
import { canSplit } from '../conversation-split'
import { endConversationDrag, startConversationDrag } from '../conversation-drag'
import { hasPrimaryModifier } from '../shortcut-keys'
import { conversationState, timeAgo } from '../conversation-state'
import { agentLabel } from '../labels'
import { CONVERSATION_DENSITIES, CONVERSATION_GROUPS, CONVERSATION_SORTS, setPreference, usePreferences, type Preferences } from '../preferences'
import { beginHandoff, ConversationContextMenu, newConversation, renameConversation } from './ConversationActions'
import { ConversationStatus } from './ConversationStatus'
import { ConversationPeek, useConversationPeek } from './ConversationPeek'
import { conversationActivity } from '../work-activity'
import { ContextMenu, MenuCheckboxItem, menuPoint, MenuRadioItem, MenuSubmenu, type MenuPoint } from './ContextMenu'
import { AgentIcon, ChatIcon, ChevronDownIcon, PlusIcon, SlidersIcon } from './icons'
import { primaryProjectName, projectName, projectNames } from './ProjectPicker'
import { SidebarCollapseButton } from './SidebarCollapseButton'
import { SidebarSearchField, SidebarSearchToggle } from './SidebarSearch'
import { TitleEditor } from './TitleEditor'

type GroupBy = Preferences['conversationGroup']
type SortBy = Preferences['conversationSort']
type Density = Preferences['conversationDensity']

const GROUP_LABEL: Record<GroupBy, string> = localized(() => ({ none: t('ConversationList.noGrouping'), project: t('ChatMentionMenu.project'), agent: t('ConversationList.agent'), status: t('ConversationList.runStatus') }))
const SORT_LABEL: Record<SortBy, string> = localized(() => ({ recent: t('ConversationList.recentActivity'), created: t('ConversationList.created'), title: t('ConversationList.title') }))
const DENSITY_LABEL: Record<Density, string> = localized(() => ({ comfortable: t('ConversationList.comfortable'), compact: t('ConversationList.compact') }))

const COMPARE: Record<SortBy, (a: Conversation, b: Conversation) => number> = {
  recent: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  title: (a, b) => a.title.localeCompare(b.title, getLocale())
}

// A group shows its first few rows, and a few more each time it is asked; the open conversation
// stays in sight wherever it falls.
export const GROUP_LIMIT = 6
export function shownRows(items: Conversation[], selected: string | null, limit = GROUP_LIMIT): Conversation[] {
  return items.filter((conversation, index) => index < limit || conversation.id === selected)
}

// Groups keep a fixed order where there is one (running first, agents as listed);
// projects go by name, with conversations that have no project last. A conversation belongs to its
// primary project, where its agent works; the others only lend it folders.
export function groupOf(conversation: Conversation, by: Exclude<GroupBy, 'none'>): { label: string; rank: number } {
  switch (by) {
    case 'project':
      return { label: primaryProjectName(conversation.projectPaths), rank: conversation.projectPaths.length > 0 ? 0 : 1 }
    case 'agent':
      return { label: agentLabel(conversation.agent), rank: AGENT_KINDS.indexOf(conversation.agent) }
    case 'status':
      return conversation.sessionId ? { label: t('ConversationList.running'), rank: 0 } : { label: t('ConversationList.stopped'), rank: 1 }
  }
}

// `project`: the primary project a project's group stands for, where its ＋ starts a conversation.
// `agent`: the agent an agent's group stands for, whose mark its heading carries for its rows.
type Group = { key: string; label: string | null; rank: number; items: Conversation[]; project?: string; agent?: AgentKind }

// Pinned conversations come first, in a group of their own, whatever the grouping.
function arrange(conversations: Conversation[], by: GroupBy, sort: SortBy): Group[] {
  const sorted = [...conversations].sort(COMPARE[sort])
  const pinned = sorted.filter((conversation) => conversation.pinnedAt != null)
  const rest = sorted.filter((conversation) => conversation.pinnedAt == null)
  const top: Group[] = pinned.length > 0 ? [{ key: 'pinned', label: t('ConversationList.pinned'), rank: -1, items: pinned }] : []
  if (by === 'none') return rest.length > 0 ? [...top, { key: 'all', label: null, rank: 0, items: rest }] : top
  const groups = new Map<string, Group>()
  for (const conversation of rest) {
    const { label, rank } = groupOf(conversation, by)
    const project = by === 'project' ? conversation.projectPaths[0] : undefined
    const group = groups.get(label) ?? { key: `group:${label}`, label, rank, items: [], ...(project ? { project } : {}), ...(by === 'agent' ? { agent: conversation.agent } : {}) }
    group.items.push(conversation)
    groups.set(label, group)
  }
  return [...top, ...[...groups.values()].sort((a, b) => a.rank - b.rank || (a.label ?? '').localeCompare(b.label ?? '', getLocale()))]
}

// By title or project name, ignoring case. Message text is searched by core.
function matches(conversation: Conversation, query: string): boolean {
  const needle = query.toLowerCase()
  return [conversation.title, ...conversation.projectPaths.map(projectName)].some((text) => text.toLowerCase().includes(needle))
}

const SEARCH_DELAY_MS = 200

// Snippets by conversation id, kept with the query they answer so a slow reply for an older
// query cannot label rows for a newer one.
type MessageHits = { query: string; snippets: Map<string, string> }

// Asks core once typing pauses. An older core without the method answers with no hits,
// which leaves title and project matches.
function useMessageHits(query: string): MessageHits {
  const rpc = useCore((s) => s.rpc)
  const [hits, setHits] = useState<MessageHits>({ query: '', snippets: new Map() })
  useEffect(() => {
    if (!query) return
    if (!rpc) {
      setHits({ query, snippets: new Map() })
      return
    }
    let current = true
    const timer = setTimeout(() => {
      void rpc.call('conversations.search', { query: query.slice(0, 200) })
        .catch(() => [])
        .then((found) => {
          if (current) setHits({ query, snippets: new Map(found.map((hit) => [hit.conversationId, hit.snippet])) })
        })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [rpc, query])
  return hits
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return <>{text}</>
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + query.length)}</mark>{text.slice(at + query.length)}</>
}

// Under a project's heading, the primary project goes without saying: only the others it reaches.
export function metaProjects(paths: readonly string[], underProject: boolean): string | null {
  if (!underProject) return projectNames(paths)
  const others = paths.slice(1)
  return others.length > 0 ? `+${others.map(projectName).join('、')}` : null
}

// The agent by its mark, which reads faster than its name and leaves room for the project; the name
// is its label and tooltip.
// Its agent and projects, then how it stands: while its agent works, what it is on; while it waits
// on the user, what it asked. `heading` is what the group it is listed under is named after, which
// the row leaves out.
function ConversationMeta({ conversation, heading = 'none' }: { conversation: Conversation; heading?: GroupBy }) {
  const agent = agentLabel(conversation.agent)
  const activity = conversationActivity(conversation, conversation.agent)
  const state = activity?.detail ?? conversationState(conversation).label
  const projects = metaProjects(conversation.projectPaths, heading === 'project')
  return (
    <>
      {heading !== 'agent' && <span className="conversation-agent" role="img" aria-label={agent} title={agent}><AgentIcon agent={conversation.agent} /></span>}
      {projects !== null && <>{projects}{' · '}</>}
      <span className="conversation-live" data-state={activity?.state}>{state}</span>
    </>
  )
}

// The time, a minute at a time, for how long ago each row last changed.
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function ViewMenu({ at, trigger, archived, onClose }: { at: MenuPoint; trigger: HTMLElement | null; archived: number; onClose: () => void }) {
  const groupBy = usePreferences((p) => p.conversationGroup)
  const sortBy = usePreferences((p) => p.conversationSort)
  const showArchived = usePreferences((p) => p.showArchivedConversations)
  const density = usePreferences((p) => p.conversationDensity)
  const [open, setOpen] = useState<'group' | 'sort' | 'density' | null>(null)
  const closeSubmenu = () => setOpen(null)
  return (
    <ContextMenu at={at} align="end" trigger={trigger} label={t('ConversationList.groupAndSortConversations')} onClose={onClose}>
      <MenuSubmenu label={t('ConversationList.groupBy')} value={GROUP_LABEL[groupBy]} open={open === 'group'} onOpen={() => setOpen('group')} onClose={closeSubmenu}>
        {CONVERSATION_GROUPS.map((value) => (
          <MenuRadioItem
            key={value}
            label={GROUP_LABEL[value]}
            checked={value === groupBy}
            onSelect={() => {
              setPreference('conversationGroup', value)
              onClose()
            }}
          />
        ))}
      </MenuSubmenu>
      <MenuSubmenu label={t('ConversationList.sortBy')} value={SORT_LABEL[sortBy]} open={open === 'sort'} onOpen={() => setOpen('sort')} onClose={closeSubmenu}>
        {CONVERSATION_SORTS.map((value) => (
          <MenuRadioItem
            key={value}
            label={SORT_LABEL[value]}
            checked={value === sortBy}
            onSelect={() => {
              setPreference('conversationSort', value)
              onClose()
            }}
          />
        ))}
      </MenuSubmenu>
      <MenuSubmenu label={t('ConversationList.density')} value={DENSITY_LABEL[density]} open={open === 'density'} onOpen={() => setOpen('density')} onClose={closeSubmenu}>
        {CONVERSATION_DENSITIES.map((value) => (
          <MenuRadioItem
            key={value}
            label={DENSITY_LABEL[value]}
            checked={value === density}
            onSelect={() => {
              setPreference('conversationDensity', value)
              onClose()
            }}
          />
        ))}
      </MenuSubmenu>
      {archived > 0 && (
        <>
          <div className="menu-separator" role="separator" />
          <MenuCheckboxItem label={t('ConversationList.showArchived', { archived: archived })} checked={showArchived} onSelect={() => setPreference('showArchivedConversations', !showArchived)} />
        </>
      )}
    </ContextMenu>
  )
}

export function ConversationList() {
  const now = useMinute()
  const [collapsed, setCollapsed] = useState(false)
  const conversations = useCore((s) => s.conversations)
  const selected = useCore((s) => s.selectedConversationId)
  const panes = useSplitPanes()
  // Opening beside the conversation in front: there has to be one, and another to put next to it.
  const splitWith = (conversation: Conversation): 'right' | 'other' | null => {
    const front = section === 'conversations' && selected ? conversations[selected] : undefined
    if (!front || front.id === conversation.id || !canSplit(front) || !canSplit(conversation) || panes?.includes(conversation.id)) return null
    return panes ? 'other' : 'right'
  }
  const section = useCore((s) => s.section)
  const groupBy = usePreferences((p) => p.conversationGroup)
  const sortBy = usePreferences((p) => p.conversationSort)
  // A task's conversation is reached from its task; a routine's from the routine's history; a group
  // chat member's from the group chat.
  const free = Object.values(conversations).filter((conversation) => !isHelper(conversation) && !conversation.taskId && !conversation.routineId && !conversation.discussionId && !conversation.squadRunId && !conversation.parentConversationId)
  // Archived ones are out of the list unless asked for in the view menu, then in a group of their
  // own at the end; a search finds them either way.
  const all = free.filter((conversation) => conversation.archivedAt == null)
  const archivedAll = free.filter((conversation) => conversation.archivedAt != null).sort(COMPARE[sortBy])
  const showArchived = usePreferences((p) => p.showArchivedConversations)
  const [archivedOpen, setArchivedOpen] = useState(true)
  // Null while the search box is closed. Groups left empty by a search drop out.
  const [query, setQuery] = useState<string | null>(null)
  const needle = query?.trim() ?? ''
  const searching = needle !== ''
  const messageHits = useMessageHits(needle)
  // Null until core has answered this query.
  const snippets = messageHits.query === needle ? messageHits.snippets : null
  const visible = searching
    ? all.filter((conversation) => matches(conversation, needle) || snippets?.has(conversation.id))
    : all
  const groups = arrange(visible, groupBy, sortBy)
  const archived = searching ? archivedAll.filter((conversation) => matches(conversation, needle) || snippets?.has(conversation.id)) : showArchived ? archivedAll : []
  // A search opens every group, so nothing it found is folded away.
  const folded = usePreferences((p) => p.foldedConversationGroups)
  const foldKey = (key: string) => `${groupBy}:${key}`
  const isFolded = (key: string) => !searching && folded.includes(foldKey(key))
  const toggleFold = (key: string) => {
    const id = foldKey(key)
    setPreference('foldedConversationGroups', folded.includes(id) ? folded.filter((each) => each !== id) : [...folded, id])
  }
  // How many rows each group shows beyond the first few; a search shows every row anyway.
  const [limits, setLimits] = useState<Record<string, number>>({})
  const limitOf = (key: string) => searching ? Infinity : limits[foldKey(key)] ?? GROUP_LIMIT
  const showMore = (key: string) => setLimits((current) => ({ ...current, [foldKey(key)]: limitOf(key) + GROUP_LIMIT }))
  const showLess = (key: string) => setLimits(({ [foldKey(key)]: _gone, ...rest }) => rest)
  const [menu, setMenu] = useState<{ id: string; at: MenuPoint } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [viewAt, setViewAt] = useState<MenuPoint | null>(null)
  const closeView = useCallback(() => setViewAt(null), [])
  const viewButton = useRef<HTMLButtonElement>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const menuConversation = menu ? conversations[menu.id] : undefined
  const density = usePreferences((p) => p.conversationDensity)
  const { peek, rowProps } = useConversationPeek()
  const peeked = peek && !menu && !renamingId ? conversations[peek.id] : undefined

  // heading: what the group the row is listed under is named after (its primary project, its agent).
  const row = (conversation: Conversation, heading: GroupBy = 'none') => {
    const snippet = searching ? snippets?.get(conversation.id) : undefined
    return <li key={conversation.id}>
      {renamingId === conversation.id
        ? <div className="task-row conversation-row" data-renaming>
          <ConversationStatus conversation={conversation} />
          <TitleEditor title={conversation.title} label={t('ConversationList.conversationTitle')} onSave={(title) => void renameConversation(conversation.id, title)} onDone={() => setRenamingId(null)} />
          <span className="task-row-meta"><ConversationMeta conversation={conversation} heading={heading} /></span>
        </div>
        : <button
          type="button"
          className="task-row conversation-row"
          data-conversation-id={conversation.id}
          data-menu-open={menu?.id === conversation.id || undefined}
          aria-current={section === 'conversations' && selected === conversation.id}
          draggable={canSplit(conversation)}
          {...rowProps(conversation.id)}
          onDragStart={(event) => startConversationDrag(event.dataTransfer, conversation.id)}
          onDragEnd={endConversationDrag}
          // ⌘-click opens it beside the one in front, as a link opens in a new tab.
          onClick={(event) => (hasPrimaryModifier(event) && splitWith(conversation) ? openBeside(conversation.id) : selectConversation(conversation.id))}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({ id: conversation.id, at: menuPoint(event) })
          }}
        >
          <ConversationStatus conversation={conversation} />
          <span className="task-row-title">{conversation.title}</span>
          {panes?.includes(conversation.id)
            ? <span className="pane-chip" data-active={selected === conversation.id} aria-label={t('ConversationList.inPane', { value1: panes.indexOf(conversation.id) + 1 })}>{panes.indexOf(conversation.id) + 1}</span>
            : <span className="conversation-age">{timeAgo(conversation.updatedAt, now)}</span>}
          <span className="task-row-meta"><ConversationMeta conversation={conversation} heading={heading} /></span>
          {snippet && <span className="conversation-snippet"><Highlighted text={snippet} query={needle} /></span>}
        </button>}
    </li>
  }

  return (
    <nav className="conversation-list" data-collapsed={collapsed} data-density={density} aria-label={t('ConversationList.conversations')}>
      <header className="task-list-header">
        <SidebarCollapseButton icon={<ChatIcon />} label={t('sidebar.conversations')} count={visible.length} collapsed={collapsed} controls="sidebar-conversations" onToggle={() => setCollapsed((value) => !value)} />
        <SidebarSearchToggle
          label={t('ConversationList.searchConversations')}
          query={query}
          onToggle={() => {
            setQuery((current) => (current === null ? '' : null))
            setCollapsed(false)
          }}
        />
        <button
          ref={viewButton}
          type="button"
          className="icon-button sidebar-tool"
          aria-label={t('ConversationList.groupAndSort')}
          aria-haspopup="menu"
          aria-expanded={viewAt !== null}
          data-tooltip={t('ConversationList.groupAndSort')}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            setViewAt((current) => (current ? null : { x: box.right, y: box.bottom + 4 }))
          }}
        >
          <SlidersIcon />
        </button>
        <button type="button" className="icon-button task-list-add sidebar-add" aria-label={t('ConversationList.newConversation')} onClick={() => newConversation()}><PlusIcon /></button>
      </header>
      {query !== null && !collapsed && (
        <SidebarSearchField label={t('ConversationList.searchConversations')} placeholder={t('ConversationList.titleProjectNameOrChatContent')} query={query} onChange={setQuery} />
      )}
      <div id="sidebar-conversations" className="sidebar-section-content" hidden={collapsed}>
      {free.length === 0 ? <p className="task-list-empty">{t('ConversationList.noConversationsYetClickAtTheTopRight')}</p> :
        visible.length === 0 && archived.length === 0 ? snippets && <p className="task-list-empty">{tr('ConversationList.noConversationsMatch', { needle: needle })}</p> :
        groups.map((group) => group.label === null
          ? <ul key={group.key}>{group.items.map((conversation) => row(conversation))}</ul>
          : <section key={group.key} className="conversation-group" aria-label={group.label}>
            <h3 className="conversation-group-title">
              <button type="button" className="conversation-group-fold" aria-expanded={!isFolded(group.key)} onClick={() => toggleFold(group.key)}>
                <ChevronDownIcon />
                {group.agent && <span className="conversation-group-agent"><AgentIcon agent={group.agent} /></span>}
                {group.label}
                <span className="count">{group.items.length}</span>
              </button>
              {group.project && (
                <button
                  type="button"
                  className="icon-button conversation-group-new sidebar-add"
                  aria-label={t('ConversationList.newConversationIn', { value1: group.label })}
                  title={t('ConversationList.newConversationIn', { value1: group.label })}
                  onClick={() => group.project && newConversation([group.project])}
                >
                  <PlusIcon />
                </button>
              )}
            </h3>
            {!isFolded(group.key) && <ul>
              {shownRows(group.items, selected, limitOf(group.key)).map((conversation) => row(conversation, group.key === 'pinned' ? 'none' : groupBy))}
              {!searching && group.items.length > GROUP_LIMIT && (() => {
                const hidden = group.items.length - shownRows(group.items, selected, limitOf(group.key)).length
                const more = limitOf(group.key) > GROUP_LIMIT
                return (
                  <li className="conversation-group-more-row">
                    {hidden > 0 && (
                      <button type="button" className="conversation-group-more" onClick={() => showMore(group.key)}>
                        {t('ConversationList.showMore', { hidden })}
                        <ChevronDownIcon />
                      </button>
                    )}
                    {more && (
                      <button type="button" className="conversation-group-more" data-beside={hidden > 0 || undefined} aria-expanded onClick={() => showLess(group.key)}>
                        {t('ConversationList.showLess')}
                        {hidden === 0 && <ChevronDownIcon />}
                      </button>
                    )}
                  </li>
                )
              })()}
            </ul>}
          </section>)}
      {archived.length > 0 && (
        <section className="conversation-group conversation-archive" aria-label={t('ConversationList.archived')}>
          <h3 className="conversation-group-title">
            <button type="button" className="conversation-group-fold" aria-expanded={searching || archivedOpen} onClick={() => setArchivedOpen(!archivedOpen)}>{tr('ConversationList.archived_718', { value1: <ChevronDownIcon />, value2: <span className="count">{archived.length}</span> })}</button>
          </h3>
          {(searching || archivedOpen) && <ul>{archived.map((conversation) => row(conversation))}</ul>}
        </section>
      )}
      </div>
      {peek && peeked && <ConversationPeek conversation={peeked} row={peek.row} />}
      {viewAt && <ViewMenu at={viewAt} trigger={viewButton.current} archived={archivedAll.length} onClose={closeView} />}
      {menu && menuConversation && (
        <ConversationContextMenu
          conversation={menuConversation}
          at={menu.at}
          onClose={closeMenu}
          onRename={() => setRenamingId(menuConversation.id)}
          onHandoff={() => beginHandoff(menuConversation)}
          split={splitWith(menuConversation)}
        />
      )}
    </nav>
  )
}
