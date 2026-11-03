import { localized, t, tr } from '../i18n'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import type { Conversation, Discussion } from '@antumi/protocol'
import { openBeside, selectConversation, selectDiscussion, useCore, useDiscussionsSupported, useSplitPanes } from '../core-store'
import { arrangeItems, conversationItem, discussionItem, GROUP_LIMIT, itemArchived, itemMatches, itemShown, shownRows, sortItems, type ItemGroup, type ListItem } from '../conversation-list-items'
import { isListedConversation } from '../search-palette'
import { discussionProgress, renameDiscussion } from '../discussions'
import { DiscussionContextMenu, DiscussionMark, DiscussionMarks } from './DiscussionActions'
import { canSplit } from '../conversation-split'
import { endConversationDrag, startConversationDrag } from '../conversation-drag'
import { hasPrimaryModifier } from '../shortcut-keys'
import { conversationState, timeAgo } from '../conversation-state'
import { agentLabel } from '../labels'
import { CONVERSATION_DENSITIES, CONVERSATION_GROUPS, CONVERSATION_KINDS, CONVERSATION_SORTS, setPreference, usePreferences, type Preferences } from '../preferences'
import { beginHandoff, ConversationContextMenu, newConversation, renameConversation } from './ConversationActions'
import { ConversationStatus } from './ConversationStatus'
import { ConversationGroupActivity } from './ConversationGroupActivity'
import { ConversationPeek, DiscussionPeek, useConversationPeek } from './ConversationPeek'
import { conversationActivity } from '../work-activity'
import { ContextMenu, MenuCheckboxItem, menuPoint, MenuRadioItem, MenuSubmenu, type MenuPoint } from './ContextMenu'
import { AgentIcon, ChatIcon, ChevronDownIcon, CloseIcon, FolderIcon, GroupChatIcon, PinIcon, PlusIcon, RobotIcon, SlidersIcon } from './icons'
import { ProjectIcon } from './ProjectIcon'
import { projectName, projectNames } from './ProjectPicker'
import { SidebarCollapseButton } from './SidebarCollapseButton'
import { SidebarSearchField, SidebarSearchToggle } from './SidebarSearch'
import { TitleEditor } from './TitleEditor'
import { ContextUsage } from './ContextUsage'

type GroupBy = Preferences['conversationGroup']
type SortBy = Preferences['conversationSort']
type Density = Preferences['conversationDensity']
type Kinds = Preferences['conversationKinds']

const GROUP_LABEL: Record<GroupBy, string> = localized(() => ({ none: t('ConversationList.noGrouping'), project: t('ChatMentionMenu.project'), agent: t('ConversationList.agent'), status: t('ConversationList.runStatus') }))
const SORT_LABEL: Record<SortBy, string> = localized(() => ({ recent: t('ConversationList.recentActivity'), created: t('ConversationList.created'), title: t('ConversationList.title') }))
const DENSITY_LABEL: Record<Density, string> = localized(() => ({ comfortable: t('ConversationList.comfortable'), compact: t('ConversationList.compact') }))
const KINDS_LABEL: Record<Kinds, string> = localized(() => ({ all: t('ConversationList.kindsAll'), conversations: t('ConversationList.kindsConversations'), discussions: t('ConversationList.kindsDiscussions') }))

// Project folders, pins, agent marks and the group chat mark head their groups; status groups keep a chevron.
function groupMark(group: ItemGroup, by: GroupBy) {
  if (group.key === 'pinned') return <PinIcon />
  if (group.agent) return <AgentIcon agent={group.agent} />
  if (group.discussions) return <GroupChatIcon />
  if (by === 'project') return group.project ? <ProjectIcon path={group.project} /> : <FolderIcon />
  return null
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

function ConversationIdentity({ profile }: { profile: Conversation['profile'] }) {
  if (!profile) return null
  return <span className="conversation-identity" title={profile.name} aria-label={`${t('ConversationPeek.agent')}: ${profile.name}`}>
    <RobotIcon />
    <span className="conversation-identity-name">{profile.name}</span>
  </span>
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

// Its members' marks and where it stands; that it is a group chat, its status mark says.
function DiscussionMeta({ discussion, heading = 'none' }: { discussion: Discussion; heading?: GroupBy }) {
  const projects = metaProjects(discussion.projectPaths, heading === 'project')
  return (
    <>
      <DiscussionMarks discussion={discussion} />
      {projects !== null && <>{projects}{' · '}</>}
      <span className="conversation-live">{discussionProgress(discussion)}</span>
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

function ViewMenu({ at, trigger, archived, kinds, onClose }: { at: MenuPoint; trigger: HTMLElement | null; archived: number; kinds: boolean; onClose: () => void }) {
  const shownKinds = usePreferences((p) => p.conversationKinds)
  const groupBy = usePreferences((p) => p.conversationGroup)
  const sortBy = usePreferences((p) => p.conversationSort)
  const showArchived = usePreferences((p) => p.showArchivedConversations)
  const density = usePreferences((p) => p.conversationDensity)
  const [open, setOpen] = useState<'kinds' | 'group' | 'sort' | 'density' | null>(null)
  const closeSubmenu = () => setOpen(null)
  return (
    <ContextMenu at={at} align="end" trigger={trigger} label={t('ConversationList.groupAndSortConversations')} onClose={onClose}>
      {kinds && (
        <MenuSubmenu label={t('ConversationList.show')} value={KINDS_LABEL[shownKinds]} open={open === 'kinds'} onOpen={() => setOpen('kinds')} onClose={closeSubmenu}>
          {CONVERSATION_KINDS.map((value) => (
            <MenuRadioItem
              key={value}
              label={KINDS_LABEL[value]}
              checked={value === shownKinds}
              onSelect={() => {
                setPreference('conversationKinds', value)
                onClose()
              }}
            />
          ))}
        </MenuSubmenu>
      )}
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
  const discussions = useCore((s) => s.discussions)
  const selected = useCore((s) => s.selectedConversationId)
  const selectedDiscussion = useCore((s) => s.selectedDiscussionId)
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
  // Group chats are listed beside conversations where core runs them; the view menu can keep to one kind.
  const discussionsSupported = useDiscussionsSupported()
  const savedKinds = usePreferences((p) => p.conversationKinds)
  const kinds = discussionsSupported ? savedKinds : 'all'
  // A task's conversation is reached from its task; a routine's from the routine's history; a group
  // chat member's from the group chat.
  const free = [
    ...Object.values(conversations).filter(isListedConversation).map(conversationItem),
    ...(discussionsSupported ? Object.values(discussions).map(discussionItem) : [])
  ].filter((item) => itemShown(item, kinds))
  // Archived ones are out of the list unless asked for in the view menu, then in a group of their
  // own at the end; a search finds them either way.
  const all = free.filter((item) => !itemArchived(item))
  const archivedAll = sortItems(free.filter(itemArchived), sortBy)
  const showArchived = usePreferences((p) => p.showArchivedConversations)
  const [archivedOpen, setArchivedOpen] = useState(true)
  // Null while the search box is closed. Groups left empty by a search drop out.
  const [query, setQuery] = useState<string | null>(null)
  const needle = query?.trim() ?? ''
  const searching = needle !== ''
  const messageHits = useMessageHits(needle)
  // Null until core has answered this query. Only conversations are searched by what was said.
  const snippets = messageHits.query === needle ? messageHits.snippets : null
  const found = (item: ListItem) => itemMatches(item, needle) || Boolean(snippets?.has(item.id))
  const visible = searching ? all.filter(found) : all
  const groups = arrangeItems(visible, groupBy, sortBy)
  const archived = searching ? archivedAll.filter(found) : showArchived ? archivedAll : []
  // The open one, a conversation or a group chat, stays in sight in its group.
  const current = section === 'conversations' ? selected : section === 'discussions' ? selectedDiscussion : null
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
  const menuDiscussion = menu ? discussions[menu.id] : undefined
  const density = usePreferences((p) => p.conversationDensity)
  const { peek, rowProps } = useConversationPeek()
  const peekable = peek && !menu && !renamingId ? peek : null
  const peeked = peekable ? conversations[peekable.id] : undefined
  const peekedDiscussion = peekable ? discussions[peekable.id] : undefined
  const openMenu = (id: string) => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    setMenu({ id, at: menuPoint(event) })
  }

  // heading: what the group the row is listed under is named after (its primary project, its agent).
  const conversationRow = (conversation: Conversation, heading: GroupBy) => {
    const snippet = searching ? snippets?.get(conversation.id) : undefined
    return <li key={conversation.id}>
      {renamingId === conversation.id
        ? <div className="task-row conversation-row" data-renaming>
          <ConversationStatus conversation={conversation} />
          <span className="conversation-title">
            <ConversationIdentity profile={conversation.profile} />
            <TitleEditor title={conversation.title} label={t('ConversationList.conversationTitle')} onSave={(title) => void renameConversation(conversation.id, title)} onDone={() => setRenamingId(null)} />
          </span>
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
          onContextMenu={openMenu(conversation.id)}
        >
          <ConversationStatus conversation={conversation} />
          <span className="conversation-title">
            <ConversationIdentity profile={conversation.profile} />
            <span className="task-row-title">{conversation.title}</span>
          </span>
          <span className="conversation-trailing">
            {panes?.includes(conversation.id)
              ? <span className="pane-chip" data-active={selected === conversation.id} aria-label={t('ConversationList.inPane', { value1: panes.indexOf(conversation.id) + 1 })}>{panes.indexOf(conversation.id) + 1}</span>
              : <span className="conversation-age" title={timeAgo(conversation.updatedAt, now)}>{timeAgo(conversation.updatedAt, now, 'compact')}</span>}
            {density !== 'compact' && conversation.context && <ContextUsage context={conversation.context} showTokens />}
          </span>
          <span className="task-row-meta"><ConversationMeta conversation={conversation} heading={heading} /></span>
          {snippet && <span className="conversation-snippet"><Highlighted text={snippet} query={needle} /></span>}
        </button>}
    </li>
  }

  // A group chat opens its page: it is not dragged into a split, as its members' conversations are not.
  const discussionRow = (discussion: Discussion, heading: GroupBy) => (
    <li key={discussion.id}>
      {renamingId === discussion.id
        ? <div className="task-row conversation-row" data-renaming>
          <DiscussionMark discussion={discussion} />
          <TitleEditor title={discussion.title} label={t('DiscussionView.groupChatTitle')} onSave={(title) => void renameDiscussion(discussion.id, title)} onDone={() => setRenamingId(null)} />
          <span className="task-row-meta"><DiscussionMeta discussion={discussion} heading={heading} /></span>
        </div>
        : <button
          type="button"
          className="task-row conversation-row"
          data-discussion-id={discussion.id}
          data-menu-open={menu?.id === discussion.id || undefined}
          aria-current={section === 'discussions' && selectedDiscussion === discussion.id}
          {...rowProps(discussion.id)}
          onClick={() => selectDiscussion(discussion.id)}
          onContextMenu={openMenu(discussion.id)}
        >
          <DiscussionMark discussion={discussion} />
          <span className="task-row-title">{discussion.title}</span>
          <span className="conversation-age" title={timeAgo(discussion.updatedAt, now)}>{timeAgo(discussion.updatedAt, now, 'compact')}</span>
          <span className="task-row-meta"><DiscussionMeta discussion={discussion} heading={heading} /></span>
        </button>}
    </li>
  )

  const row = (item: ListItem, heading: GroupBy = 'none') => item.kind === 'conversation' ? conversationRow(item.conversation, heading) : discussionRow(item.discussion, heading)

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
      {kinds !== 'all' && !collapsed && (
        <p className="conversation-list-filter">
          <span>{KINDS_LABEL[kinds]}</span>
          <button type="button" className="icon-button" aria-label={t('ConversationList.showAllKinds')} data-tooltip={t('ConversationList.showAllKinds')} onClick={() => setPreference('conversationKinds', 'all')}><CloseIcon /></button>
        </p>
      )}
      <div id="sidebar-conversations" className="sidebar-section-content" hidden={collapsed}>
      {free.length === 0 ? <p className="task-list-empty">{kinds === 'discussions' ? t('ConversationList.noGroupChatsYet') : t('ConversationList.noConversationsYetClickAtTheTopRight')}</p> :
        visible.length === 0 && archived.length === 0 ? snippets && <p className="task-list-empty">{tr('ConversationList.noConversationsMatch', { needle: needle })}</p> :
        groups.map((group) => {
          if (group.label === null) return <ul key={group.key}>{group.items.map((item) => row(item))}</ul>
          const mark = groupMark(group, groupBy)
          return <section key={group.key} className="conversation-group" data-tree={mark ? '' : undefined} aria-label={group.label}>
            <h3 className="conversation-group-title">
              <button type="button" className="conversation-group-fold" aria-expanded={!isFolded(group.key)} onClick={() => toggleFold(group.key)}>
                {mark ? <span className="conversation-group-mark">{mark}</span> : <ChevronDownIcon />}
                <span className="conversation-group-label">{group.label}</span>
                <span className="count">{group.items.length}</span>
                {isFolded(group.key) && <ConversationGroupActivity items={group.items} />}
                {mark && <ChevronDownIcon />}
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
              {shownRows(group.items, current, limitOf(group.key)).map((item) => row(item, group.key === 'pinned' ? 'none' : groupBy))}
              {!searching && group.items.length > GROUP_LIMIT && (() => {
                const hidden = group.items.length - shownRows(group.items, current, limitOf(group.key)).length
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
          </section>
        })}
      {archived.length > 0 && (
        <section className="conversation-group conversation-archive" aria-label={t('ConversationList.archived')}>
          <h3 className="conversation-group-title">
            <button type="button" className="conversation-group-fold" aria-expanded={searching || archivedOpen} onClick={() => setArchivedOpen(!archivedOpen)}>{tr('ConversationList.archived_718', { value1: <ChevronDownIcon />, value2: <span className="count">{archived.length}</span> })}</button>
          </h3>
          {(searching || archivedOpen) && <ul>{archived.map((item) => row(item))}</ul>}
        </section>
      )}
      </div>
      {peekable && peeked && <ConversationPeek conversation={peeked} row={peekable.row} />}
      {peekable && peekedDiscussion && <DiscussionPeek discussion={peekedDiscussion} row={peekable.row} />}
      {viewAt && <ViewMenu at={viewAt} trigger={viewButton.current} archived={archivedAll.length} kinds={discussionsSupported} onClose={closeView} />}
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
      {menu && menuDiscussion && (
        <DiscussionContextMenu discussion={menuDiscussion} at={menu.at} onClose={closeMenu} onRename={() => setRenamingId(menuDiscussion.id)} />
      )}
    </nav>
  )
}
