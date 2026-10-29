import { t, tr } from '../i18n'
import { useContext, useState } from 'react'
import { focusPaneInput, selectConversation, setSchedulesOpen, useCore } from '../core-store'
import { composerDraft } from '../composer-drafts'
import { useShortcutLabel } from '../keyboard-shortcuts'
import { cancelSchedule, openRunsForConversation, runAction, scheduleState } from '../schedules'
import { helperAllowsMode, isHelper, isPlanApproval, type ChatItem, type Conversation } from '@antumi/protocol'
import { itemKey } from '../chat-state'
import { toolLabel } from '../chat-tools'
import { useChatSurface } from './chat-surface'
import { ArchivedBar } from './ArchivedBar'
import { ChatComposer } from './ChatComposer'
import { AgentDelegation } from './AgentDelegation'
import { archiveConversation } from './ConversationActions'
import { ChatMessageList, type SentMessage } from './ChatMessageList'
import { ChatPlanCard } from './ChatPlan'
import { ChatProjects } from './ChatProjects'
import { ChatApprovalCard, ChatQuestionCard, type RequestItem } from './ChatRequestCards'
import { ChatPaths } from './ChatToolCard'
import { ChatTodosChip } from './ChatTodos'
import { useConversationPane, type ConversationPane } from './conversation-pane'
import { ArrowUpIcon, ClockIcon, CloseIcon } from './icons'
import { changeLineTotals, useChangedFiles } from './Inspector'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
type StateItem = Extract<ChatItem, { kind: 'state' }>

// What the project holds uncommitted, read again whenever a call finishes; a click opens the
// inspector with the files.
function ChangesChip({ conversation, finishedCalls }: { conversation: Conversation; finishedCalls: number }) {
  const surface = useChatSurface()
  const files = useChangedFiles(surface.changes, conversation.updatedAt, finishedCalls) ?? []
  if (files.length === 0) return null
  // New and binary files have no line counts; a row of only those would read +0 −0.
  const counted = files.filter((file) => file.additions !== null && file.deletions !== null)
  const totals = changeLineTotals(counted)
  return (
    <button
      type="button"
      className="chat-changes"
      data-tooltip={surface.changesHint}
      onClick={surface.showChanges}
    >
      <span>{tr('ChatDock.filesChanged', { value1: files.length })}</span>
      {counted.length > 0 && (
        <span className="chat-diff-count mono">
          <span className="chat-diff-added">+{totals.added}</span>
          <span className="chat-diff-removed">−{totals.removed}</span>
        </span>
      )}
    </button>
  )
}

// What a waiting request is called on its tab: the call it asks about, or what it asks.
function RequestTabLabel({ item }: { item: RequestItem }) {
  const shorten = useContext(ChatPaths)
  if (item.kind === 'question') return <>{tr('ChatDock.question', { value1: item.questions[0]?.header ? ` · ${item.questions[0].header}` : '' })}</>
  if (isPlanApproval(item)) return <>{t('chatTools.plan')}</>
  return <>{toolLabel(item.tool)} <span className="mono">{shorten(item.title)}</span></>
}

// The requests waiting on the user, in the composer's place: one at a time, behind a tab each when
// there are several, so the newest cannot push the rest out of reach.
export function PendingRequests({ conversation, pending, tools, modes }: { conversation: Conversation; pending: readonly RequestItem[]; tools: ReadonlyMap<string, ToolItem>; modes: readonly string[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const shown = pending.find((item) => itemKey(item) === activeKey) ?? pending[0]
  if (!shown) return null
  const at = pending.indexOf(shown)
  return (
    <div className="chat-intervention" data-pending-hotkey-scope>
      {pending.length > 1 && (
        <div className="chat-intervention-tabs" role="tablist" aria-label={t('ChatDock.requestsAwaitingYourResponse')}>
          {pending.map((item) => (
            <button
              key={itemKey(item)}
              type="button"
              role="tab"
              aria-selected={item === shown}
              className="chat-intervention-tab"
              onClick={() => setActiveKey(itemKey(item))}
            >
              <RequestTabLabel item={item} />
            </button>
          ))}
          <span className="chat-intervention-count">{at + 1} / {pending.length}</span>
        </div>
      )}
      {shown.kind === 'question'
        ? <ChatQuestionCard key={itemKey(shown)} conversationId={conversation.id} item={shown} />
        : isPlanApproval(shown)
          ? <ChatPlanCard key={itemKey(shown)} conversationId={conversation.id} item={shown} modes={modes} />
          : <ChatApprovalCard singleApproval={Boolean(conversation.helperOf)} key={itemKey(shown)} conversationId={conversation.id} item={shown} tool={shown.toolItemId ? tools.get(shown.toolItemId) : undefined} />}
    </div>
  )
}

// What is scheduled to go on in this chat later, above the composer, each to manage or cancel.
function ChatSchedules({ conversationId }: { conversationId: string }) {
  const runs = openRunsForConversation(useCore((s) => s.schedules), conversationId)
  if (runs.length === 0) return null
  const now = Date.now()
  return (
    <>
      {runs.map((run) => (
        <div key={run.id} className="chat-queue chat-queue-one chat-queued chat-scheduled">
          <span className="chat-queue-label">{tr('ChatDock.scheduled', { value1: scheduleState(run, now) })}</span>
          <span className="chat-queued-text" title={runAction(run)}>{runAction(run)}</span>
          <span className="chat-queued-actions">
            <button type="button" className="chat-queued-action" aria-label={t('ChatDock.manageSchedule')} data-tooltip={t('ChatDock.manageSchedule')} data-tooltip-side="top-end" onClick={() => setSchedulesOpen(true)}><ClockIcon /></button>
            <button type="button" className="chat-queued-action" aria-label={t('ChatDock.cancelSchedule')} data-tooltip={t('ChatDock.cancelSchedule')} data-tooltip-side="top-end" onClick={() => void cancelSchedule(run.id)}><CloseIcon /></button>
          </span>
        </div>
      ))}
    </>
  )
}

// The other column's composer, folded to a line: what was being written there, if anything, and the
// keys that bring it to the front.
function PaneReply({ conversationId, pane }: { conversationId: string; pane: ConversationPane }) {
  const shortcut = useShortcutLabel(pane.index === 0 ? 'focus-left' : 'focus-right')
  const draft = composerDraft(conversationId).text.trim().split('\n')[0] ?? ''
  return (
    <button type="button" className="chat-pane-reply" onClick={() => { pane.focus(); focusPaneInput(pane.index) }}>
      <span className="chat-pane-reply-text" data-draft={draft ? true : undefined}>{draft ? t('ChatDock.draft', { draft: draft }) : t('ChatDock.replyInThisPane')}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
}

// Everything that waits on the user sits here, above the composer, so it cannot scroll out of view.
export function ChatDock({ conversation, state, pending, tools, finishedCalls, onPrevious, sent, onJump, compact = false }: {
  compact?: boolean
  conversation: Conversation
  // The running stage's state; null for an older core or before the stage reports one.
  state: StateItem | null
  pending: readonly RequestItem[]
  tools: ReadonlyMap<string, ToolItem>
  finishedCalls: number
  onPrevious: () => void
  sent: readonly SentMessage[]
  onJump: (key: string) => void
}) {
  const inspectable = useChatSurface().changes !== null
  const running = conversation.sessionId !== null
  const waiting = running && pending.length > 0
  const archived = conversation.archivedAt != null
  // The column not in front keeps its composer, draft and all, behind a one-line way back to it.
  const pane = useConversationPane()
  const resting = pane !== null && !pane.active
  return (
    <div className="chat-dock">
      {!compact && <div className="chat-dock-header">
        <ChatProjects conversation={conversation} />
        {running && state && <ChatTodosChip todos={state.todos} />}
        {inspectable && <ChangesChip conversation={conversation} finishedCalls={finishedCalls} />}
          <span className="chat-dock-spacer" />
          <AgentDelegation key={conversation.id} conversation={conversation} />
        <ChatMessageList messages={sent} onJump={onJump} />
        <button type="button" className="tool-button" aria-label={t('ChatDock.previousMessage')} data-tooltip={t('ChatDock.previousMessage')} onClick={onPrevious}>
          <ArrowUpIcon />
        </button>
      </div>}
      <ChatSchedules conversationId={conversation.id} />
      {waiting && <PendingRequests conversation={conversation} pending={pending} tools={tools} modes={(state?.permissionModes ?? []).filter((mode) => !isHelper(conversation) || helperAllowsMode(mode))} />}
      {archived && <ArchivedBar what={t('BrowserPanel.conversation')} onRestore={() => archiveConversation(conversation.id, false)} />}
      {/* The composer stays mounted while a request or the archive takes its place, so a draft is not lost. */}
      <div className="chat-dock-composer" hidden={waiting || archived || resting || Boolean(conversation.parentConversationId)}>
        <ChatComposer compact={compact} conversation={conversation} state={state} />
      </div>
      {conversation.parentConversationId && !waiting && <p className="muted"><button type="button" className="link-button" onClick={() => selectConversation(conversation.parentConversationId ?? null)}>{t('AgentProfiles.parent')}</button></p>}
      {resting && !waiting && !archived && <PaneReply conversationId={conversation.id} pane={pane} />}
    </div>
  )
}
