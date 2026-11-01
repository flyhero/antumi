import { t } from '../i18n'
import { checkArchiveDiscussion, type Discussion } from '@antumi/protocol'
import { openDiscussionDraft, useDiscussionArchiveSupported } from '../core-store'
import { archiveDiscussion, deleteDiscussion, discussionProgress, setDiscussionPinned } from '../discussions'
import { agentLabel } from '../labels'
import { askConfirm } from '../confirm-dialog'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { AgentIcon, ArchiveIcon, GroupChatIcon, PencilIcon, PinIcon, TrashIcon } from './icons'

export async function removeDiscussion(discussion: Discussion): Promise<void> {
  if (!await askConfirm({ message: t('SidebarDiscussions.deleteGroupChatMemberConversationsAndPostsAre', { value1: discussion.title }), confirm: t('ChatCommandSettings.delete'), danger: true })) return
  await deleteDiscussion(discussion.id)
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

// What a group chat's row offers on a right click. An archived one is not pinned or unpinned until
// it is taken out again, as with conversations.
export function DiscussionContextMenu({ discussion, at, onClose, onRename }: { discussion: Discussion; at: MenuPoint; onClose: () => void; onRename: () => void }) {
  const archivable = useDiscussionArchiveSupported()
  const archived = discussion.archivedAt !== null
  const pick = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <ContextMenu at={at} label={t('SidebarDiscussions.actionsForGroupChat', { value1: discussion.title })} onClose={onClose}>
      {!archived && <MenuItem label={discussion.pinnedAt !== null ? t('ConversationActions.unpin') : t('ConversationActions.pin')} icon={<PinIcon />} onSelect={pick(() => void setDiscussionPinned(discussion.id, discussion.pinnedAt === null))} />}
      <MenuItem label={t('ConversationActions.rename')} icon={<PencilIcon />} onSelect={pick(onRename)} />
      <MenuItem label={t('SidebarDiscussions.newGroupChatWithTheSameMembers')} icon={<GroupChatIcon />} onSelect={pick(() => openDiscussionDraft(discussion))} />
      {archivable && (archived
        ? <MenuItem label={t('ArchivedBar.unarchive')} icon={<ArchiveIcon />} onSelect={pick(() => void archiveDiscussion(discussion.id, false))} />
        : <MenuItem
          label={t('ConversationActions.archive')}
          icon={<ArchiveIcon />}
          hint={checkArchiveDiscussion(discussion) ? t('SidebarDiscussions.waitUntilMembersFinishOrPauseFirst') : null}
          disabled={checkArchiveDiscussion(discussion) !== null}
          onSelect={pick(() => void archiveDiscussion(discussion.id, true))}
        />)}
      <div className="menu-separator" role="separator" />
      <MenuItem label={t('SidebarDiscussions.deleteGroupChat')} icon={<TrashIcon />} danger onSelect={pick(() => void removeDiscussion(discussion))} />
    </ContextMenu>
  )
}
