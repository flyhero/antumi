import { t } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import type { AgentKind, ChatItem, Conversation, Discussion, DiscussionMember } from '@antumi/protocol'
import { openAgentCall, useAgentCalls, useAgentCallsSupported } from '../agent-calls'
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

// An agent working for the page in a conversation of its own (a group chat member, a delegated
// agent) that waits on the user. open: its own conversation, where all of its turn is.
export type Waiter = { id: string; name: string; agent: AgentKind; conversationId: string; open: () => void }

// A member's own conversation, where all of its turn is: it is kept out of the list, so it may need
// fetching before it can be shown.
export async function openMember(member: DiscussionMember): Promise<void> {
  if (!useCore.getState().conversations[member.conversationId]) await loadConversation(member.conversationId)
  selectConversation(member.conversationId)
}

// What an agent asks of the user, answered here with the chat's own cards: its chat is held only
// while it waits. What the cards open beyond themselves (a plan, the changes, the browser) is in the
// agent's own conversation.
function WaiterRequest({ waiter, conversation }: { waiter: Waiter; conversation: Conversation }) {
  const items = useWatchedChat(waiter.conversationId)
  const pending = useMemo(() => items.filter((item): item is RequestItem => (item.kind === 'approval' || item.kind === 'question') && item.resolution === null), [items])
  const tools = useMemo(() => new Map(items.flatMap((item) => (item.kind === 'tool' ? [[item.id, item] as const] : []))), [items])
  const modes = useMemo(() => items.findLast((item): item is StateItem => item.kind === 'state')?.permissionModes ?? [], [items])
  const roots = useMemo(() => (conversation.projectPaths.length ? conversation.projectPaths : [conversation.workspacePath]), [conversation])
  const shorten = useMemo(() => pathShortener(roots), [roots])
  const surface = useMemo(() => {
    const open = () => waiter.open()
    return { ...conversationSurface(conversation), showPlan: open, showChanges: open, showFileChange: open, showBrowser: open, handoff: null, fork: null }
  }, [conversation, waiter])
  if (pending.length === 0) return <p className="agent-request-loading muted">{t('DashboardPanel.loading')}</p>
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

// The agents waiting on the user, above the page's composer: one at a time, a tab for each when
// several wait, so nothing needs their own conversations opened to be answered.
export function AgentRequests({ waiting, label }: { waiting: readonly Waiter[]; label: string }) {
  const conversations = useCore((s) => s.conversations)
  const [picked, setPicked] = useState<string | null>(null)
  const shown = waiting.find((waiter) => waiter.id === picked) ?? waiting[0]
  const conversation = shown ? conversations[shown.conversationId] : undefined
  // Their conversations are out of the list, so one may not be here yet.
  useEffect(() => {
    if (shown && !conversation) void loadConversation(shown.conversationId)
  }, [shown, conversation])
  if (!shown) return null
  return (
    <section className="agent-requests" aria-label={label}>
      <div className="agent-requests-head">
        {waiting.length > 1
          ? <div className="agent-requests-tabs" role="tablist" aria-label={label}>
            {waiting.map((waiter) => (
              <button key={waiter.id} type="button" role="tab" aria-selected={waiter === shown} className="agent-requests-tab" onClick={() => setPicked(waiter.id)}>
                <AgentIcon agent={waiter.agent} />{waiter.name}
              </button>
            ))}
          </div>
          : <span className="agent-requests-who"><AgentIcon agent={shown.agent} />{t('AgentRequests.waits', { name: shown.name })}</span>}
        <span className="chat-dock-spacer" />
        <button type="button" className="link-button" onClick={shown.open}>{t('AgentRequests.openConversation')}</button>
      </div>
      {conversation && <WaiterRequest key={shown.id} waiter={shown} conversation={conversation} />}
    </section>
  )
}

// A group chat's members waiting on the user.
export function DiscussionRequests({ discussion }: { discussion: Discussion }) {
  const waiting = useMemo(() => discussion.members.filter((member) => member.status === 'awaiting').map((member): Waiter => ({
    id: member.id, name: member.name, agent: member.agent, conversationId: member.conversationId, open: () => void openMember(member)
  })), [discussion.members])
  return <AgentRequests waiting={waiting} label={t('AgentRequests.membersLabel')} />
}

// A conversation's delegated agents waiting on the user, answered in the conversation that sent them.
export function DelegationRequests({ conversation }: { conversation: Conversation }) {
  const supported = useAgentCallsSupported(conversation)
  const { calls } = useAgentCalls(supported ? conversation.id : null)
  const waiting = useMemo(() => (calls ?? []).filter((call) => call.state === 'awaiting').map((call): Waiter => ({
    id: call.id, name: call.profile.name, agent: call.profile.agent, conversationId: call.conversationId, open: () => void openAgentCall(call)
  })), [calls])
  return <AgentRequests waiting={waiting} label={t('AgentRequests.delegationsLabel')} />
}
