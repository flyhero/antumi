import { t } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import type { ChatItem, Conversation, Discussion, DiscussionMember } from '@antumi/protocol'
import { pathShortener } from '../chat-state'
import { useWatchedChat } from '../chat-watch'
import { loadConversation, selectConversation, useCore } from '../core-store'
import { conversationSurface, ChatSurfaceContext } from './chat-surface'
import { PendingRequests } from './ChatDock'
import { ChatRoots } from './ChatMarkdown'
import type { RequestItem } from './ChatRequestCards'
import { ChatPaths } from './ChatToolCard'
import { AgentIcon } from './icons'

type StateItem = Extract<ChatItem, { kind: 'state' }>

// A member's own conversation, where all of its turn is: it is kept out of the list, so it may need
// fetching before it can be shown.
export async function openMember(member: DiscussionMember): Promise<void> {
  if (!useCore.getState().conversations[member.conversationId]) await loadConversation(member.conversationId)
  selectConversation(member.conversationId)
}

// What a member asks of the user, answered on the group chat's page with the chat's own cards: its
// chat is watched only while it waits. What the cards open beyond themselves (a plan, the changes,
// the browser) is in the member's own conversation.
function MemberRequest({ member, conversation }: { member: DiscussionMember; conversation: Conversation }) {
  const items = useWatchedChat(member.conversationId)
  const pending = useMemo(() => items.filter((item): item is RequestItem => (item.kind === 'approval' || item.kind === 'question') && item.resolution === null), [items])
  const tools = useMemo(() => new Map(items.flatMap((item) => (item.kind === 'tool' ? [[item.id, item] as const] : []))), [items])
  const modes = useMemo(() => items.findLast((item): item is StateItem => item.kind === 'state')?.permissionModes ?? [], [items])
  const roots = useMemo(() => (conversation.projectPaths.length ? conversation.projectPaths : [conversation.workspacePath]), [conversation])
  const shorten = useMemo(() => pathShortener(roots), [roots])
  const surface = useMemo(() => {
    const open = () => void openMember(member)
    return { ...conversationSurface(conversation), showPlan: open, showChanges: open, showFileChange: open, showBrowser: open, handoff: null, fork: null }
  }, [conversation, member])
  if (pending.length === 0) return <p className="discussion-request-loading muted">{t('DashboardPanel.loading')}</p>
  return (
    <ChatSurfaceContext.Provider value={surface}>
      <ChatPaths.Provider value={shorten}>
        <ChatRoots.Provider value={roots}>
          <PendingRequests conversation={conversation} pending={pending} tools={tools} modes={modes} />
        </ChatRoots.Provider>
      </ChatPaths.Provider>
    </ChatSurfaceContext.Provider>
  )
}

// The members waiting on the user, above the group chat's composer: one at a time, a tab for each
// when several wait, so nothing needs their own conversations opened to be answered.
export function DiscussionRequests({ discussion }: { discussion: Discussion }) {
  const conversations = useCore((s) => s.conversations)
  const waiting = discussion.members.filter((member) => member.status === 'awaiting')
  const [picked, setPicked] = useState<string | null>(null)
  const shown = waiting.find((member) => member.id === picked) ?? waiting[0]
  const conversation = shown ? conversations[shown.conversationId] : undefined
  // Members' conversations are out of the list, so one may not be here yet.
  useEffect(() => {
    if (shown && !conversation) void loadConversation(shown.conversationId)
  }, [shown, conversation])
  if (!shown) return null
  return (
    <section className="discussion-requests" aria-label={t('DiscussionRequests.label')}>
      <div className="discussion-requests-head">
        {waiting.length > 1
          ? <div className="discussion-requests-tabs" role="tablist" aria-label={t('DiscussionRequests.label')}>
            {waiting.map((member) => (
              <button key={member.id} type="button" role="tab" aria-selected={member === shown} className="discussion-requests-tab" onClick={() => setPicked(member.id)}>
                <AgentIcon agent={member.agent} />{member.name}
              </button>
            ))}
          </div>
          : <span className="discussion-requests-who"><AgentIcon agent={shown.agent} />{t('DiscussionRequests.waits', { name: shown.name })}</span>}
        <span className="chat-dock-spacer" />
        <button type="button" className="link-button" onClick={() => void openMember(shown)}>{t('DiscussionRequests.openMember')}</button>
      </div>
      {conversation && <MemberRequest key={shown.id} member={shown} conversation={conversation} />}
    </section>
  )
}
