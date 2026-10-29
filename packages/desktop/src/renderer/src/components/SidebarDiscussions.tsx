import { t, tr } from '../i18n'
import { useCallback, useRef, useState } from 'react'
import { checkArchiveDiscussion, type Discussion } from '@antumi/protocol'
import { openDiscussionDraft, selectDiscussion, useCore, useDiscussionArchiveSupported, useDiscussionsSupported } from '../core-store'
import { archiveDiscussion, deleteDiscussion, discussionProgress, renameDiscussion, setDiscussionPinned } from '../discussions'
import { agentLabel } from '../labels'
import { setPreference, usePreferences } from '../preferences'
import { ContextMenu, MenuCheckboxItem, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { AgentIcon, ArchiveIcon, ChevronDownIcon, GroupChatIcon, PencilIcon, PinIcon, PlusIcon, SlidersIcon, TrashIcon } from './icons'
import { SidebarCollapseButton } from './SidebarCollapseButton'
import { TitleEditor } from './TitleEditor'
import { useSidebarEntryMenu } from './SidebarEntryMenu'

export async function removeDiscussion(discussion: Discussion): Promise<void> {
  if (!window.confirm(t('SidebarDiscussions.deleteGroupChatMemberConversationsAndPostsAre', { value1: discussion.title }))) return
  await deleteDiscussion(discussion.id)
}

// Pinned first, then the latest to move.
function arranged(discussions: Record<string, Discussion>): Discussion[] {
  return Object.values(discussions).sort((a, b) =>
    (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || b.updatedAt - a.updatedAt)
}

// A dot for where it stands: someone at work, someone waiting on the user, or quiet.
export function DiscussionDot({ discussion }: { discussion: Discussion }) {
  const awaiting = discussion.members.some((member) => member.status === 'awaiting')
  const working = discussion.members.some((member) => member.status === 'working')
  const tone = awaiting ? 'awaiting' : working ? 'working' : discussion.state === 'done' ? 'done' : 'idle'
  const label = awaiting ? t('SidebarDiscussions.aMemberNeedsYourApproval') : working ? t('SidebarDiscussions.aMemberIsSpeaking') : discussionProgress(discussion)
  return <span className="discussion-dot" data-tone={tone} role="img" aria-label={label} title={label} />
}

export function DiscussionMarks({ discussion }: { discussion: Discussion }) {
  return (
    <span className="discussion-marks">
      {discussion.members.map((member) => (
        <span key={member.id} className="conversation-agent" role="img" aria-label={`${member.name}（${agentLabel(member.agent)}）`} title={member.name}>
          <AgentIcon agent={member.agent} />
        </span>
      ))}
    </span>
  )
}

// The sidebar's group chats, a section of their own: their members' conversations stay out of the
// conversation list, and are reached from here.
export function SidebarDiscussions() {
  const supported = useDiscussionsSupported()
  const discussions = useCore((s) => s.discussions)
  const selected = useCore((s) => s.selectedDiscussionId)
  const section = useCore((s) => s.section)
  const [collapsed, setCollapsed] = useState(false)
  const entryMenu = useSidebarEntryMenu('discussions')
  const [menu, setMenu] = useState<{ id: string; at: MenuPoint } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(true)
  const archivable = useDiscussionArchiveSupported()
  const showArchived = usePreferences((p) => p.showArchivedDiscussions)
  const [viewAt, setViewAt] = useState<MenuPoint | null>(null)
  const closeView = useCallback(() => setViewAt(null), [])
  const viewButton = useRef<HTMLButtonElement>(null)
  if (!supported) return null
  // Archived ones are out of the list unless asked for in the view menu, as conversations are; then
  // they wait at the end.
  const list = arranged(discussions).filter((discussion) => discussion.archivedAt === null)
  const archivedAll = arranged(discussions).filter((discussion) => discussion.archivedAt !== null)
  const archived = showArchived ? archivedAll : []
  const menuDiscussion = menu ? discussions[menu.id] : undefined
  const pick = (action: () => void) => () => {
    closeMenu()
    action()
  }

  const row = (discussion: Discussion) => (
    <li key={discussion.id}>
      {renamingId === discussion.id ? (
        <div className="task-row conversation-row" data-renaming>
          <DiscussionDot discussion={discussion} />
          <TitleEditor title={discussion.title} label={t('DiscussionView.groupChatTitle')} onSave={(title) => void renameDiscussion(discussion.id, title)} onDone={() => setRenamingId(null)} />
        </div>
      ) : (
        <button
          type="button"
          className="task-row conversation-row"
          data-menu-open={menu?.id === discussion.id || undefined}
          aria-current={section === 'discussions' && selected === discussion.id}
          onClick={() => selectDiscussion(discussion.id)}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({ id: discussion.id, at: menuPoint(event) })
          }}
        >
          <DiscussionDot discussion={discussion} />
          <span className="task-row-title" title={discussion.title}>{discussion.title}</span>
          <span className="task-row-meta"><DiscussionMarks discussion={discussion} />{discussionProgress(discussion)}</span>
        </button>
      )}
    </li>
  )

  return (
    <nav className="sidebar-discussions" data-collapsed={collapsed} aria-label={t('DiscussionView.groupChat_910')}>
      <header className="task-list-header" onContextMenu={entryMenu.onContextMenu}>
        {entryMenu.menu}
        <SidebarCollapseButton icon={<GroupChatIcon />} label={t('DiscussionView.groupChat_910')} count={list.length} collapsed={collapsed} controls="sidebar-discussions" onToggle={() => setCollapsed((value) => !value)} />
        {archivedAll.length > 0 && (
          <button
            ref={viewButton}
            type="button"
            className="icon-button sidebar-tool"
            aria-label={t('SidebarDiscussions.listOptions')}
            aria-haspopup="menu"
            aria-expanded={viewAt !== null}
            data-tooltip={t('SidebarDiscussions.listOptions')}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect()
              setViewAt((current) => (current ? null : { x: box.right, y: box.bottom + 4 }))
            }}
          >
            <SlidersIcon />
          </button>
        )}
        <button type="button" className="icon-button task-list-add sidebar-add" aria-label={t('SidebarDiscussions.newGroupChat')} data-tooltip={t('SidebarDiscussions.newGroupChat')} onClick={() => openDiscussionDraft()}><PlusIcon /></button>
      </header>
      {viewAt && (
        <ContextMenu at={viewAt} align="end" trigger={viewButton.current} label={t('SidebarDiscussions.groupChatListOptions')} onClose={closeView}>
          <MenuCheckboxItem label={t('SidebarDiscussions.showArchived', { value1: archivedAll.length })} checked={showArchived} onSelect={() => setPreference('showArchivedDiscussions', !showArchived)} />
        </ContextMenu>
      )}
      <div id="sidebar-discussions" className="sidebar-section-content" hidden={collapsed}>
        {(list.length > 0 || archived.length > 0) && (
          <>
            <ul>{list.map(row)}</ul>
            {archived.length > 0 && (
              <section className="conversation-group conversation-archive" aria-label={t('SidebarDiscussions.archivedGroupChats')}>
                <h3 className="conversation-group-title">
                  <button type="button" className="conversation-group-fold" aria-expanded={archivedOpen} onClick={() => setArchivedOpen(!archivedOpen)}>{tr('ConversationList.archived_718', { value1: <ChevronDownIcon />, value2: <span className="count">{archived.length}</span> })}</button>
                </h3>
                {archivedOpen && <ul>{archived.map(row)}</ul>}
              </section>
            )}
          </>
        )}
      </div>
      {menu && menuDiscussion && (
        <ContextMenu at={menu.at} label={t('SidebarDiscussions.actionsForGroupChat', { value1: menuDiscussion.title })} onClose={closeMenu}>
          <MenuItem label={menuDiscussion.pinnedAt !== null ? t('ConversationActions.unpin') : t('ConversationActions.pin')} icon={<PinIcon />} onSelect={pick(() => void setDiscussionPinned(menuDiscussion.id, menuDiscussion.pinnedAt === null))} />
          <MenuItem label={t('ConversationActions.rename')} icon={<PencilIcon />} onSelect={pick(() => setRenamingId(menuDiscussion.id))} />
          <MenuItem label={t('SidebarDiscussions.newGroupChatWithTheSameMembers')} icon={<GroupChatIcon />} onSelect={pick(() => openDiscussionDraft(menuDiscussion))} />
          {archivable && (menuDiscussion.archivedAt !== null
            ? <MenuItem label={t('ArchivedBar.unarchive')} icon={<ArchiveIcon />} onSelect={pick(() => void archiveDiscussion(menuDiscussion.id, false))} />
            : <MenuItem
              label={t('ConversationActions.archive')}
              icon={<ArchiveIcon />}
              hint={checkArchiveDiscussion(menuDiscussion) ? t('SidebarDiscussions.waitUntilMembersFinishOrPauseFirst') : null}
              disabled={checkArchiveDiscussion(menuDiscussion) !== null}
              onSelect={pick(() => void archiveDiscussion(menuDiscussion.id, true))}
            />)}
          <div className="menu-separator" role="separator" />
          <MenuItem label={t('SidebarDiscussions.deleteGroupChat')} icon={<TrashIcon />} danger onSelect={pick(() => void removeDiscussion(menuDiscussion))} />
        </ContextMenu>
      )}
    </nav>
  )
}
