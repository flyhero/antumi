import { localized, t, tr } from '../i18n'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import type { Conversation, Discussion, Task } from '@antumi/protocol'
import { openBeside, selectConversation, selectDiscussion, selectTask, useCore, useDiscussionsSupported, useSplitPanes, useTaskRowsSupported } from '../core-store'
import { arrangeItems, conversationItem, discussionItem, GROUP_LIMIT, itemArchived, itemConversation, itemMatches, itemShown, shownRows, sortItems, taskItem, type ItemGroup, type ListItem } from '../conversation-list-items'
import { isListedConversation } from '../search-palette'
import { attentionSummaryMode } from '../attention-summaries'
import { saveTaskText } from '../unsaved-edits'
import { STATUS_LABEL } from '../labels'
import { StatusIcon } from './StatusIcon'
import { TaskContextMenu } from './TaskActions'
import { discussionProgress, renameDiscussion } from '../discussions'
import { DiscussionContextMenu, DiscussionMark, DiscussionMarks } from './DiscussionActions'
import { canSplit } from '../conversation-split'
import { endConversationDrag, startConversationDrag } from '../conversation-drag'
import { hasPrimaryModifier } from '../shortcut-keys'
import { conversationGlyph, conversationState, timeAgo } from '../conversation-state'
import { agentLabel } from '../labels'
import { CONVERSATION_DENSITIES, CONVERSATION_GROUPS, CONVERSATION_KINDS, CONVERSATION_SORTS, setPreference, usePreferences, type Preferences } from '../preferences'
import { beginHandoff, ConversationContextMenu, newConversation, renameConversation } from './ConversationActions'
import { ConversationMark } from './ConversationStatus'
import { ConversationGroupActivity } from './ConversationGroupActivity'
import { ConversationPeek, DiscussionPeek, useConversationPeek } from './ConversationPeek'
import { conversationActivity } from '../work-activity'
import { ContextMenu, MenuCheckboxItem, menuPoint, MenuRadioItem, MenuSubmenu, type MenuPoint } from './ContextMenu'
import { AgentIcon, BoardIcon, ChatIcon, ChevronDownIcon, CloseIcon, FolderIcon, GroupChatIcon, PinIcon, PlusIcon, SlidersIcon } from './icons'
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
const KINDS_LABEL: Record<Kinds, string> = localized(() => ({ all: t('ConversationList.kindsAll'), conversations: t('ConversationList.kindsConversations'), discussions: t('ConversationList.kindsDiscussions'), tasks: t('ConversationList.kindsTasks') }))

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
function useMessageHits(query: string, includeTasks: boolean): MessageHits {
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
      void rpc.call('conversations.search', { query: query.slice(0, 200), ...(includeTasks ? { includeTasks } : {}) })
        .catch(() => [])
        .then((found) => {
          if (current) setHits({ query, snippets: new Map(found.map((hit) => [hit.conversationId, hit.snippet])) })
        })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [rpc, query, includeTasks])
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

// The agent's name before the title; that it is one of the user's agents, the robot in the status
// column says (ConversationMark).
function ConversationIdentity({ profile }: { profile: Conversation['profile'] }) {
  if (!profile) return null
  return <span className="conversation-identity" title={profile.name} aria-label={`${t('ConversationPeek.agent')}: ${profile.name}`}>
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
      {/* Its logo already leads the row, unless a robot stands there for one of the user's agents. */}
      {heading !== 'agent' && conversation.profile && <span className="conversation-agent" role="img" aria-label={agent} title={agent}><AgentIcon agent={conversation.agent} /></span>}
      {projects !== null && <>{projects}{' · '}</>}
      <span className="conversation-live" data-state={activity?.state}>{state}</span>
    </>
  )
}

// A task's row carries the task mark in the status column, the board's icon as the sidebar's 任务
// entry has it, coloured as a conversation's dot would be: amber when its chat waits on the user,
// red when it failed, the accent when a turn finished unseen. The task's status sits small at the
// mark's bottom right, in the shape the board gives it.
function TaskMark({ task, conversation }: { task: Task; conversation: Conversation }) {
  const unseen = useCore((s) => Boolean(s.unseen[conversation.id]))
  const glyph = conversationGlyph(conversation, unseen)
  const state = conversationState(conversation)
  const label = glyph === 'unseen' ? t('ConversationStatus.newActivity') : state.label
  return (
    <span className="task-mark" data-glyph={glyph} role="img" aria-label={`${t('sidebar.tasks')} · ${STATUS_LABEL[task.status]} · ${label}`} title={`${STATUS_LABEL[task.status]} · ${state.detail ?? label}`}>
      <BoardIcon />
      <span className="task-mark-status"><StatusIcon status={task.status} decorative /></span>
    </span>
  )
}

// As a conversation's, with the task's status between the projects and how its chat stands.
function TaskMeta({ task, conversation, heading = 'none' }: { task: Task; conversation: Conversation; heading?: GroupBy }) {
  const agent = agentLabel(conversation.agent)
  const activity = conversationActivity(conversation, conversation.agent)
  const state = activity?.detail ?? conversationState(conversation).label
  const projects = metaProjects(task.repos.map((repo) => repo.path), heading === 'project')
  return (
    <>
      {heading !== 'agent' && <span className="conversation-agent" role="img" aria-label={agent} title={agent}><AgentIcon agent={conversation.agent} /></span>}
      {projects !== null && <>{projects}{' · '}</>}
      <span className="status-pill conversation-task-status" data-status={task.status}>{STATUS_LABEL[task.status]}</span>{' · '}
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

// kinds: what the list can be kept to, beyond all; the submenu goes when there is only one kind.
function ViewMenu({ at, trigger, archived, kinds, onClose }: { at: MenuPoint; trigger: HTMLElement | null; archived: number; kinds: readonly Kinds[]; onClose: () => void }) {
  const shownKinds = usePreferences((p) => p.conversationKinds)
  const groupBy = usePreferences((p) => p.conversationGroup)
  const sortBy = usePreferences((p) => p.conversationSort)
  const showArchived = usePreferences((p) => p.showArchivedConversations)
  const density = usePreferences((p) => p.conversationDensity)
  const [open, setOpen] = useState<'kinds' | 'group' | 'sort' | 'density' | null>(null)
  const closeSubmenu = () => setOpen(null)
  return (
    <ContextMenu at={at} align="end" trigger={trigger} label={t('ConversationList.groupAndSortConversations')} onClose={onClose}>
      {kinds.length > 2 && (
        <MenuSubmenu label={t('ConversationList.show')} value={KINDS_LABEL[shownKinds]} open={open === 'kinds'} onOpen={() => setOpen('kinds')} onClose={closeSubmenu}>
          {kinds.map((value) => (
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
  const tasks = useCore((s) => s.tasks)
  const selected = useCore((s) => s.selectedConversationId)
  const selectedDiscussion = useCore((s) => s.selectedDiscussionId)
  const selectedTask = useCore((s) => s.selectedId)
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
  // Group chats are listed beside conversations where core runs them, and started tasks where core
  // sends their chats; the view menu can keep to one kind.
  const discussionsSupported = useDiscussionsSupported()
  const tasksListed = useCore((s) => (s.rpc ? attentionSummaryMode(s.rpc) === 'complete' : false))
  const taskRowsSupported = useTaskRowsSupported()
  const kindChoices: readonly Kinds[] = CONVERSATION_KINDS.filter((kind) => (kind !== 'discussions' || discussionsSupported) && (kind !== 'tasks' || tasksListed))
  const savedKinds = usePreferences((p) => p.conversationKinds)
  const kinds = kindChoices.includes(savedKinds) ? savedKinds : 'all'
  // A task's chat is listed as the task's row; a routine's conversation is reached from the
  // routine's history; a group chat member's from the group chat.
  const free = [
    ...Object.values(conversations).filter(isListedConversation).map(conversationItem),
    ...(discussionsSupported ? Object.values(discussions).map(discussionItem) : []),
    ...(tasksListed ? Object.values(tasks).flatMap((task) => {
      const conversation = task.conversationId ? conversations[task.conversationId] : undefined
      return conversation ? [taskItem(task, conversation)] : []
    }) : [])
  ].filter((item) => itemShown(item, kinds))
  const byId = new Map(free.map((item) => [item.id, item]))
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
  const messageHits = useMessageHits(needle, tasksListed && taskRowsSupported)
  // Null until core has answered this query. Only conversations and tasks' chats are searched by
  // what was said; a hit names the chat, which a task's row holds.
  const snippets = messageHits.query === needle ? messageHits.snippets : null
  const snippetOf = (item: ListItem) => snippets?.get(itemConversation(item)?.id ?? '')
  const found = (item: ListItem) => itemMatches(item, needle) || snippetOf(item) !== undefined
  const visible = searching ? all.filter(found) : all
  const groups = arrangeItems(visible, groupBy, sortBy)
  const archived = searching ? archivedAll.filter(found) : showArchived ? archivedAll : []
  // The open one, a conversation, a group chat or a task, stays in sight in its group.
  const current = section === 'conversations' ? selected : section === 'discussions' ? selectedDiscussion : section === 'tasks' ? selectedTask : null
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
  const menuItem = menu ? byId.get(menu.id) : undefined
  const density = usePreferences((p) => p.conversationDensity)
  const { peek, rowProps } = useConversationPeek()
  const peekable = peek && !menu && !renamingId ? peek : null
  const peekedItem = peekable ? byId.get(peekable.id) : undefined
  // A task's row peeks at its chat, which is what the row's activity is about.
  const peeked = peekedItem && peekedItem.kind !== 'discussion' ? peekedItem.conversation : undefined
  const peekedDiscussion = peekedItem?.kind === 'discussion' ? peekedItem.discussion : undefined
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
          <ConversationMark conversation={conversation} />
          <span className="conversation-row-title">
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
          <ConversationMark conversation={conversation} />
          <span className="conversation-row-title">
            <ConversationIdentity profile={conversation.profile} />
            <span className="task-row-title">{conversation.title}</span>
          </span>
          <span className="conversation-trailing">
            {panes?.includes(conversation.id)
              ? <span className="pane-chip" data-active={selected === conversation.id} aria-label={t('ConversationList.inPane', { value1: panes.indexOf(conversation.id) + 1 })}>{panes.indexOf(conversation.id) + 1}</span>
              : <span className="conversation-age">{timeAgo(conversation.updatedAt, now)}</span>}
            {conversation.context && <ContextUsage context={conversation.context} showTokens shape="meter" />}
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
          <span className="conversation-age">{timeAgo(discussion.updatedAt, now)}</span>
          <span className="task-row-meta"><DiscussionMeta discussion={discussion} heading={heading} /></span>
        </button>}
    </li>
  )

  // A task's row opens the task on its chat, where the task's own header and toolbar are; it is not
  // dragged into a split, as its chat cannot stand beside a conversation.
  const taskRow = (task: Task, conversation: Conversation, heading: GroupBy) => {
    const snippet = searching ? snippets?.get(conversation.id) : undefined
    return <li key={task.id}>
      {renamingId === task.id
        ? <div className="task-row conversation-row" data-renaming>
          <TaskMark task={task} conversation={conversation} />
          <span className="conversation-row-title">
            <TitleEditor title={task.title} label={t('NewTaskDialog.taskTitle')} onSave={(title) => saveTaskText(task.id, 'title', title)} onDone={() => setRenamingId(null)} />
          </span>
          <span className="task-row-meta"><TaskMeta task={task} conversation={conversation} heading={heading} /></span>
        </div>
        : <button
          type="button"
          className="task-row conversation-row"
          data-task-id={task.id}
          data-menu-open={menu?.id === task.id || undefined}
          aria-current={section === 'tasks' && selectedTask === task.id}
          {...rowProps(task.id)}
          onClick={() => selectTask(task.id, 'chat')}
          onContextMenu={openMenu(task.id)}
        >
          <TaskMark task={task} conversation={conversation} />
          <span className="conversation-row-title">
            <span className="task-row-title">{task.title}</span>
          </span>
          <span className="conversation-trailing">
            <span className="conversation-age">{timeAgo(Math.max(task.updatedAt, conversation.updatedAt), now)}</span>
            {conversation.context && <ContextUsage context={conversation.context} showTokens shape="meter" />}
          </span>
          <span className="task-row-meta"><TaskMeta task={task} conversation={conversation} heading={heading} /></span>
          {snippet && <span className="conversation-snippet"><Highlighted text={snippet} query={needle} /></span>}
        </button>}
    </li>
  }

  const row = (item: ListItem, heading: GroupBy = 'none') => {
    switch (item.kind) {
      case 'conversation': return conversationRow(item.conversation, heading)
      case 'discussion': return discussionRow(item.discussion, heading)
      case 'task': return taskRow(item.task, item.conversation, heading)
    }
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
      {kinds !== 'all' && !collapsed && (
        <p className="conversation-list-filter">
          <span>{KINDS_LABEL[kinds]}</span>
          <button type="button" className="icon-button" aria-label={t('ConversationList.showAllKinds')} data-tooltip={t('ConversationList.showAllKinds')} onClick={() => setPreference('conversationKinds', 'all')}><CloseIcon /></button>
        </p>
      )}
      <div id="sidebar-conversations" className="sidebar-section-content" hidden={collapsed}>
      {free.length === 0 ? <p className="task-list-empty">{kinds === 'discussions' ? t('ConversationList.noGroupChatsYet') : kinds === 'tasks' ? t('ConversationList.noStartedTasksYet') : t('ConversationList.noConversationsYetClickAtTheTopRight')}</p> :
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
      {viewAt && <ViewMenu at={viewAt} trigger={viewButton.current} archived={archivedAll.length} kinds={kindChoices} onClose={closeView} />}
      {menu && menuItem?.kind === 'conversation' && (
        <ConversationContextMenu
          conversation={menuItem.conversation}
          at={menu.at}
          onClose={closeMenu}
          onRename={() => setRenamingId(menuItem.id)}
          onHandoff={() => beginHandoff(menuItem.conversation)}
          split={splitWith(menuItem.conversation)}
        />
      )}
      {menu && menuItem?.kind === 'discussion' && (
        <DiscussionContextMenu discussion={menuItem.discussion} at={menu.at} onClose={closeMenu} onRename={() => setRenamingId(menuItem.id)} />
      )}
      {menu && menuItem?.kind === 'task' && (
        <TaskContextMenu task={menuItem.task} chat={menuItem.conversation} at={menu.at} onClose={closeMenu} onRename={() => setRenamingId(menuItem.id)} />
      )}
    </nav>
  )
}
