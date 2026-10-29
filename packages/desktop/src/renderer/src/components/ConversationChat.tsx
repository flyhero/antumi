import { getLocale, t, tr } from '../i18n'
import { HelperTurnCost } from './HelperTurnCost'
import { addQuote } from '../chat-quotes'
import { focusChatInput } from '../helper-conversations'
import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CODEX_IMAGE_GENERATION, cursorProviderError, isBrowserTool, isPlanApproval, isPreviewTool, chatReferencesIn, parseHandoffMessage, toolImagePath, type AgentKind, type ChatItem, type Conversation, type ConversationStage } from '@antumi/protocol'
import { ChatBrowserTabs, firstBrowserCall, shouldOpenBrowser, useWatchBrowserTabs } from '../browser-state'
import { ChatBrowserCard, ChatBrowserRun, ChatShotCard } from './ChatBrowserCard'
import { chatBlocks, dropChat, finalReplies, foldsOfTools, itemKey, pathShortener, prependChatPage, previousTodos, saidText, setChatPage, stageAgents, thoughtDurations, timeline, useChat, type ChatBlock, type TimelineEntry, type TurnAgent, type TurnFile } from '../chat-state'
import { ChatDisclosureScope, ChatFindExpansion, setOpened, useDisclosure } from '../chat-disclosure'
import { isCompaction, noticeSummary, readableNotice } from '../chat-notices'
import { parseQuotes, withoutQuoteMarkers } from '../chat-quotes'
import { formatTokens, isSubagent, thoughtFor, workedFor } from '../chat-tools'
import { perform, useCore } from '../core-store'
import { shownAccountName } from '../agent-accounts'
import { ChatSurfaceContext, conversationSurface, useChatSurface, type ChatSurface } from './chat-surface'
import { forkConversation } from './ConversationActions'
import { agentLabel, chatDayAndTime, dayAndTime, messageTime } from '../labels'
import { usePreferences } from '../preferences'
import { ChatDock } from './ChatDock'
import { AgentDelegationResult } from './AgentDelegation'
import { isAgentCallResult, useAgentCalls, useAgentCallsSupported } from '../agent-calls'
import { withDelegations } from '../delegation-timeline'
import { ChatDelegationGroup } from './ChatDelegationGroup'
import { ProjectRunNotice } from './ProjectRunNotice'
import { ChatImageStrip } from './ChatImages'
import { ChatMarkdown, ChatRoots } from './ChatMarkdown'
import { ChatUserText } from './ChatUserText'
import { ChatFilesContext, useChatContextMenu } from './ChatContextMenu'
import { ChatCopyRegion } from './ChatCopyRegion'
import { copyTextForItem } from '../message-copy'
import { ChatRunScope } from './ChatCodeRun'
import { ChatPlanLine } from './ChatPlan'
import { ChatRequestLine, type RequestItem } from './ChatRequestCards'
import { ChatSubagents } from './ChatSubagents'
import { ChatTodosLine, TodoHistory } from './ChatTodos'
import { ChatUsageLimitEntry } from './ChatUsageLimit'
import { ChatWorking, type WorkingPhase } from './ChatWorking'
import { CopyButton } from './CopyButton'
import { ChatEditsCard, ChatPaths, ChatToolCard, ChatToolRun, editDisclosures } from './ChatToolCard'
import { ChatPreviewCard } from './ChatPreviewCard'
import { SelectionComment } from './SelectionComment'
import { effortLabel } from './ChatOptionsBar'
import { ChatMessageRelay, useMessageRelay } from './chat-message-relay'
import { useChatTypeface } from '../chat-typeface'
import { freshKeys, useJustFinished } from '../chat-motion'
import { acknowledgeInitialMessage, sendInitialMessage, useInitialMessages, type InitialMessage } from '../initial-messages'
import { Spinner } from './Spinner'
import { TranslateButton, useTranslated } from './TranslateButton'
import { ChatFind, useChatFindState, type ChatHistoryResult } from './ChatFind'
import { ArrowDownIcon, ChevronDownIcon, ChevronRightIcon, FileChangesIcon, AgentIcon, ForkIcon } from './icons'
import { StopBackground } from '../background-work'
import { activityOf } from '../chat-activity'
import { ChatActivityStep } from './ChatActivityStep'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
const NO_ITEMS: ChatItem[] = []
// Within this many pixels of the bottom, new output keeps the list scrolled to the end.
const PINNED_SLACK = 48
// Scrolled back further than this, the list offers a way down to the latest.
const AWAY_SLACK = 240
// A message this close under the top edge already counts as the one in view.
const IN_VIEW_SLACK = 8

// What a turn sent and received, when the agent counted: "↑ 42k ↓ 6.8k".
function tokensText(item: Extract<ChatItem, { kind: 'turn' }>): string {
  if (!item.usage) return ''
  return 'total' in item.usage
    ? t('ConversationChat.totalTokens', { value1: formatTokens(item.usage.total) })
    : ` · ↑ ${formatTokens(item.usage.input)} ↓ ${formatTokens(item.usage.output)}`
}

// How a turn ended, how long it ran and what it cost: the one place the turn's totals read.
function turnText(item: Extract<ChatItem, { kind: 'turn' }>): string {
  const took = (item.durationMs !== null ? ` · ${workedFor(item.durationMs)}` : '') + tokensText(item)
  // What opened a turn of the agent's own; an older core, or an agent that does not say, leaves it unnamed.
  const why = !item.resumed ? '' : item.resumedBy === 'command' ? t('ConversationChat.resumedAfterBackgroundCommand') : item.resumedBy === 'subagent' ? t('ConversationChat.resumedAfterSubAgentReturned') : t('ConversationChat.autoResumed')
  if (item.state === 'completed') return t('ConversationChat.completed', { why: why, took: took })
  if (item.state === 'interrupted') return t('ConversationChat.interrupted', { why: why, took: took, value3: item.error ? `：${readableNotice(item.error)}` : '' })
  return t('ConversationChat.failed', { why: why, took: took, value3: item.error ? `：${readableNotice(item.error)}` : '' })
}

function MessageTime({ at }: { at: number }) {
  return <time className="chat-message-time" dateTime={new Date(at).toISOString()} title={dayAndTime(at)}>{messageTime(at)}</time>
}

// A task's chat says where each stage ran: only planning beside the projects, or in its worktrees;
// and, once the task was redone, which go at it the stage belongs to.
function StageDivider({ conversationId, stage, task }: { conversationId: string; stage: ConversationStage; task: boolean }) {
  const attempts = useCore((s) => {
    const taskId = s.conversations[conversationId]?.taskId
    return taskId ? s.tasks[taskId]?.attempts : undefined
  })
  const where = stage.planOnly ? t('ConversationChat.readOnlyPlanning') : task ? t('ConversationChat.runningInWorktree') : ''
  const attempt = attempts && attempts.length > 0 ? t('ConversationChat.attempt', { value1: 1 + attempts.filter((each) => each.at <= stage.startedAt).length }) : ''
  return <div className="chat-stage">{agentLabel(stage.agent)} · {chatDayAndTime(stage.startedAt)}{where}{attempt}</div>
}

// How long each finished thought took, by item key.
const Thoughts = createContext<ReadonlyMap<string, number>>(new Map())

// The turn item that closes a final reply, by the reply's block key: its outcome reads on the
// reply's own line of actions, and the turn's own line is left out.
const Endings = createContext<ReadonlyMap<string, TurnItem>>(new Map())
const MergedTurns = createContext<ReadonlySet<string>>(new Set())
// Final replies whose actions a turn's change card carries: finished, though they show no time.
const CarriedReplies = createContext<ReadonlySet<string>>(new Set())

type ReasoningItem = Extract<ChatItem, { kind: 'reasoning' }>

// A thought opens while it streams and closes a moment after, saying how long it took; once the
// user opens or closes it, it stays as they left it.
function Reasoning({ item }: { item: ReasoningItem }) {
  const took = useContext(Thoughts).get(itemKey(item))
  const searching = useContext(ChatFindExpansion)
  // Open while it streams and a moment after; open for good once the user opens it.
  const [kept, keep] = useDisclosure(`thought:${itemKey(item)}`)
  const [streaming, setStreaming] = useState(item.streaming)
  useEffect(() => {
    if (item.streaming) {
      setStreaming(true)
      return
    }
    const timer = setTimeout(() => setStreaming(false), 1000)
    return () => clearTimeout(timer)
  }, [item.streaming])
  const open = kept || streaming
  const label = item.streaming ? t('ConversationChat.thinking') : took !== undefined ? t('ConversationChat.thoughtFor', { value1: thoughtFor(took) }) : t('ConversationChat.reasoning')
  // While it streams, the thought keeps its newest line in view, as the agent writes it.
  const text = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = text.current
    if (item.streaming && element) element.scrollTop = element.scrollHeight
  }, [item.text, item.streaming, open])
  return (
    <div className="chat-reasoning">
      <button
        type="button"
        className="chat-fold-header"
        aria-expanded={open}
        onClick={() => {
          if (searching) return
          keep(!open)
          if (open) setStreaming(false)
        }}
      >
        <span className="chat-tool-chevron" aria-hidden="true"><ChevronRightIcon /></span>
        <span className={item.streaming ? 'chat-sheen' : undefined}>{label}</span>
      </button>
      {open && (
        <div className="chat-reasoning-body" data-streaming={item.streaming || undefined}>
          <div ref={text} className="chat-reasoning-text">{item.text}</div>
        </div>
      )}
    </div>
  )
}

// While the chat is read: the shape of a message and a reply, pulsing one row after another.
function ChatSkeleton() {
  const rows = ['user', 'line', 'line', 'short', 'user', 'line', 'short']
  return (
    <div className="chat-skeleton" role="status" aria-label={t('ConversationChat.loadingChatHistory')}>
      {rows.map((row, index) => <span key={index} className="chat-skeleton-row" data-row={row} style={{ animationDelay: `${index * 120}ms` }} />)}
    </div>
  )
}

type UserItem = Extract<ChatItem, { kind: 'user' }>

// Scrolls the chat to an entry and marks it a moment: for a quote, back to the passage it took.
const JumpToEntry = createContext<(key: string) => void>(() => {})

// Forks the conversation at this item, where the chat's owner allows it: a new conversation that
// holds the chat to here (through the turn for an agent's reply; before the message, which then
// waits in the input, for the user's).
function ForkButton({ item }: { item: ChatItem }) {
  const surface = useChatSurface()
  if (!surface.fork) return null
  const label = item.kind === 'user' ? t('ConversationChat.forkBeforeThisMessageCreateAConversationUp') : t('ConversationChat.forkHereCreateAConversationThroughThisTurn')
  return (
    <button type="button" className="copy-button fork-button" aria-label="fork" data-tooltip={label} onClick={() => surface.fork?.(item)}>
      <ForkIcon />
    </button>
  )
}

function UserMessageFooter({ item }: { item: UserItem }) {
  return (
    <div className="chat-user-footer">
      <MessageTime at={item.at} />
      {saidText(item.text) && <CopyButton text={withoutQuoteMarkers(saidText(item.text))} label={t('ConversationChat.copyMessage')} />}
      <ForkButton item={item} />
    </div>
  )
}

// The passages a message quotes, over what it says: each opens the reply it came from, where that
// is still in the chat.
function UserQuotes({ quotes }: { quotes: ReturnType<typeof parseQuotes>['quotes'] }) {
  const jump = useContext(JumpToEntry)
  return (
    <div className="chat-user-quotes">
      {quotes.map((quote, index) => (
        <div key={index} className="chat-user-quote">
          <button type="button" className="chat-user-quote-text" disabled={!quote.source} title={quote.source ? t('ConversationChat.jumpToOriginalQuote') : undefined} onClick={() => quote.source && jump(quote.source)}>
            {quote.text}
          </button>
          {quote.note && <div className="chat-user-quote-note">{quote.note}</div>}
        </div>
      ))}
    </div>
  )
}

// A long message the user sent, such as a task's first prompt, shows its start until opened.
function UserMessage({ item, pending = false }: { item: UserItem; pending?: boolean }) {
  const [open, setOpen] = useDisclosure(`message:${itemKey(item)}`)
  const { byStage, current } = useContext(ChatAgent)
  const handoff = parseHandoffMessage(item.text)
  const { quotes, body } = parseQuotes(saidText(item.text))
  // A handoff the user added nothing to: a line saying so, where the agent's head still goes under.
  if (handoff && !body && quotes.length === 0 && item.images.length === 0) {
    return (
      <>
        <div className="chat-user-handoff">{tr('ConversationChat.handedOffToWithNoAdditionalInstructions', { value1: agentLabel((byStage.get(item.stageId) ?? current).agent) })}</div>
        {!pending && <UserMessageFooter item={item} />}
      </>
    )
  }
  const long = body.split('\n').length > 12 || body.length > 1200
  return (
    <>
      <div className="chat-user" data-clipped={(long && !open) || undefined} data-steer={item.steer || undefined}>
        {item.steer && <span className="chat-user-steer" title={t('ConversationChat.messageInsertedDuringTheTurn')}>{t('ConversationChat.additionalInstructions')}</span>}
        <ChatImageStrip images={item.images} />
        {quotes.length > 0 && <UserQuotes quotes={quotes} />}
        <ChatUserText text={body} references={chatReferencesIn(item.text, body, item.references)} />
      </div>
      {long && (
        <div className="chat-user-more">
          <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t('ChatPlan.collapse') : t('ConversationChat.expandFullText')}
          </button>
        </div>
      )}
      {!pending && <UserMessageFooter item={item} />}
    </>
  )
}

function InitialMessageEntry({ id, agent, message }: { id: string; agent: AgentKind; message: InitialMessage }) {
  const rpc = useCore((state) => state.rpc)
  return (
    <>
      <div className="chat-entry" data-user>
        <UserMessage pending item={{ kind: 'user', id: `u:${message.ref}`, stageId: 'pending', revision: 0, at: message.at, text: message.text, images: message.images, references: message.references }} />
      </div>
      {message.phase === 'failed' ? (
        <div className="chat-initial-error chat-notice" data-level="error" role="alert">
          <span>{tr('ConversationChat.firstMessageNotSent', { value1: message.error })}</span>
          <button type="button" className="button ghost" disabled={!rpc} onClick={() => { if (rpc) void sendInitialMessage(id, rpc) }}>{t('ChatContextMenu.retry')}</button>
        </div>
      ) : (
        <div className="chat-working" role="status">
          <Spinner />
          <span>{message.phase === 'starting' ? t('ChatComposer.starting', { value1: agentLabel(agent) }) : t('ChatComposer.sendingFirstMessage')}</span>
        </div>
      )}
    </>
  )
}

type NoticeItem = Extract<ChatItem, { kind: 'notice' }>

// A notice is one line, opening onto the rest; where the context was compacted is a divider.
function ChatNotice({ conversationId, item }: { conversationId: string; item: NoticeItem }) {
  const [open, setOpen] = useDisclosure(`notice:${itemKey(item)}`)
  const [retrying, setRetrying] = useState(false)
  if (isCompaction(item.text)) return <div className="chat-divider" role="separator">{t('ConversationChat.contextCompacted')}</div>
  const text = readableNotice(item.text)
  const { first, more } = noticeSummary(text)
  const retry = item.action?.kind === 'retryTurn' ? async () => {
    setRetrying(true)
    try {
      await perform((rpc) => rpc.call('conversations.retryTurn', {
        id: conversationId,
        stageId: item.stageId,
        itemId: item.id
      }))
    } finally {
      setRetrying(false)
    }
  } : null
  const action = retry && (
    <button type="button" className="button chat-notice-action" disabled={retrying} onClick={() => void retry()}>
      {item.action?.stop ? (retrying ? t('ConversationChat.stopping') : t('ConversationChat.stopAndRetry')) : retrying ? t('ConversationChat.reconnecting') : t('ConversationChat.reconnectAndRetry')}
    </button>
  )
  if (!more) return <div className="chat-notice chat-notice-actionable" data-level={item.level}><span>{text}</span>{action}</div>
  // The words stay out of the button, so an error's output can be selected and copied.
  return (
    <div className="chat-notice chat-notice-long chat-notice-actionable" data-level={item.level}>
      <button type="button" className="chat-notice-toggle" aria-expanded={open} aria-label={open ? t('ChatPlan.collapse') : t('ConversationChat.expandFullText')} onClick={() => setOpen(!open)}>
        <span className="chat-tool-chevron" aria-hidden="true"><ChevronRightIcon /></span>
      </button>
      <div className="chat-notice-text" data-open={open || undefined} onClick={open ? undefined : () => setOpen(true)}>{open ? text : first}</div>
      {action}
    </div>
  )
}

const ChatVariant = createContext<'full' | 'compact'>('full')
const FoldedTurns = createContext<ReadonlySet<string>>(new Set())

function helperDuration(turn: TurnItem, workMs: number | null = null): string {
  return t('ConversationChat.workedForS', { value1: Math.max(1, Math.round((turn.durationMs ?? workMs ?? 0) / 1000)) })
}

function AssistantReply({ conversationId, item, completedAt, ending, blockKey }: {
  conversationId: string
  item: Extract<ChatItem, { kind: 'assistant' }>
  completedAt: number | undefined
  ending: TurnItem | undefined
  blockKey: string
}) {
  const compact = useContext(ChatVariant) === 'compact'
  const foldedTurns = useContext(FoldedTurns)
  // A stored reply can still end in Cursor's raw transport error. Say what happened instead.
  const failure = item.streaming ? null : cursorProviderError(item.text, getLocale())
  const text = failure ? failure.rest : item.text
  const parentId = useCore((s) => s.conversations[conversationId]?.helperOf)
  const box = useRef<HTMLDivElement>(null)
  // Finished once it has its time, or once a change card below carries its actions.
  const carried = useContext(CarriedReplies).has(blockKey)
  const translated = useTranslated(conversationId, blockKey, text, (completedAt !== undefined || carried) && !item.streaming, box)
  const { shown } = translated
  return (
    <div ref={box} className="chat-assistant" data-streaming={item.streaming || undefined} data-translated={shown !== text || undefined}>
      {shown && <ChatMarkdown text={shown} highlight={!item.streaming} runnable={!item.streaming} />}
      {failure && <div className="chat-notice" data-level="warning">{failure.detail}</div>}
      {(completedAt !== undefined || (parentId && !item.streaming)) && text && (
        <div className="chat-message-actions">
          <CopyButton text={shown} label={shown !== text ? t('ChatContextMenu.copyTranslation') : t('ConversationChat.copyReply')} />
          {completedAt !== undefined && <MessageTime at={completedAt} />}
          {ending && (!compact || ending.state !== 'completed' || !foldedTurns.has(itemKey(ending))) && <><span className="chat-turn chat-turn-inline" data-state={ending.state}>{compact && ending.state === 'completed' ? helperDuration(ending) : turnText(ending)}</span>{compact && <HelperTurnCost turn={ending} />}</>}
          {translated.foreign && <TranslateButton translated={translated} what={t('ConversationChat.thisReply')} />}
          <ForkButton item={item} />
          {parentId && <button type="button" className="link-button helper-quote-button" onClick={() => { addQuote(parentId, null, shown); focusChatInput(parentId) }}>{t('ConversationChat.quoteInMainConversation')}</button>}
        </div>
      )}
    </div>
  )
}

function Item({ conversationId, item, completedAt, blockKey }: { conversationId: string; item: ChatItem; completedAt: number | undefined; blockKey: string }) {
  const ending = useContext(Endings).get(blockKey)
  const compact = useContext(ChatVariant) === 'compact'
  switch (item.kind) {
    case 'user':
      if (isAgentCallResult(item)) return <AgentDelegationResult />
      return <UserMessage item={item} />
    case 'assistant':
      return <AssistantReply conversationId={conversationId} item={item} completedAt={completedAt} ending={ending} blockKey={blockKey} />
    case 'reasoning':
      return <Reasoning item={item} />
    case 'tool':
      if (isPreviewTool(item.name)) return <ChatPreviewCard conversationId={conversationId} item={item} />
      if (isBrowserTool(item.name)) return <ChatBrowserCard item={item} />
      return item.images?.length || toolImagePath(item) || item.name === CODEX_IMAGE_GENERATION ? <ChatShotCard item={item} /> : <ChatToolCard item={item} />
    case 'approval':
      return isPlanApproval(item) ? <ChatPlanLine item={item} /> : <ChatRequestLine item={item} />
    case 'question':
      return <ChatRequestLine item={item} />
    case 'turn':
      return <div className="chat-turn" data-state={item.state}>{compact && item.state === 'completed' ? helperDuration(item) : turnText(item)}{compact && <HelperTurnCost turn={item} />}</div>
    case 'notice':
      return <ChatNotice conversationId={conversationId} item={item} />
    case 'todos':
      return <ChatTodosLine item={item} />
    case 'usageLimit':
      return <ChatUsageLimitEntry conversationId={conversationId} item={item} />
    case 'state':
      return null
  }
}

// Who answers and on what, for the head that opens each of the agent's turns: the stage the turn ran
// in, for an earlier one (another agent's, before a handoff); the conversation as it is now for the
// latest, or for a stage not known yet.
type ChatAgents = { current: TurnAgent; byStage: ReadonlyMap<string, TurnAgent>; latest: string | null }
const ChatAgent = createContext<ChatAgents>({ current: { agent: 'claude', model: null, effort: null }, byStage: new Map(), latest: null })

// Opens the agent's turn under the user's message: its icon and name, the model it runs and how
// hard it reasons, and when the message it answers came in. While that turn runs, a ring turns around the icon; one waiting
// on the user holds it still, in the colour of the request.
function TurnHead({ at, stageId, messageKey, live }: { at: number; stageId: string; messageKey: string; live: 'running' | 'awaiting' | null }) {
  const { current, byStage, latest } = useContext(ChatAgent)
  const { agent, model, effort, provider, account } = (stageId !== latest && byStage.get(stageId)) || current
  const accountLabel = useCore((s) => shownAccountName(s.accounts, agent, account))
  return (
    <div className="chat-turn-head" data-relay-for={messageKey}>
      <span className="chat-turn-head-icon" data-live={live ?? undefined} aria-hidden="true"><AgentIcon agent={agent} /></span>
      <span className="chat-turn-head-name">{agentLabel(agent)}</span>
      {model && <span className="chat-turn-head-model" title={t('ConversationChat.model', { model: model })}>{model}</span>}
      {model && effort && <span className="chat-turn-head-effort" title={t('ConversationChat.reasoningEffort', { value1: effortLabel(effort) })}>{effortLabel(effort)}</span>}
      {provider && <span className="chat-turn-head-provider" title={t('RouteBadge.onProvider', { value1: provider })}>{provider}</span>}
      {accountLabel && <span className="chat-turn-head-provider" title={t('AgentAccounts.onAccount', { value1: accountLabel })}>{accountLabel}</span>}
      <MessageTime at={at} />
    </div>
  )
}

// The user's message a block is, if it is one: the head goes under it.
function userItem(block: ChatBlock): Extract<ChatItem, { kind: 'user' }> | null {
  const item = block.kind === 'entry' && block.entry.kind === 'item' ? block.entry.item : null
  return item?.kind === 'user' ? item : null
}

function userAt(block: ChatBlock): number | null {
  return userItem(block)?.at ?? null
}

// The user's own messages are what ↑ steps back through.
function isUserEntry(entry: TimelineEntry): boolean {
  return entry.kind === 'item' && entry.item.kind === 'user' && !isAgentCallResult(entry.item)
}

type TurnItem = Extract<ChatItem, { kind: 'turn' }>

// A finished turn's work, behind how long it took; opening it shows the calls, thinking and replies
// on the way to its answer.
// The turn's work in one line: how many calls, and how long they ran before the answer. The kinds
// of call are the expanded list's business, and the turn's outcome and cost read under the answer.
function foldText(steps: number, workMs: number | null): string {
  return [steps > 0 ? t('ConversationChat.steps', { steps: steps }) : t('ConversationChat.workDetails'), workMs !== null ? workedFor(workMs) : null].filter(Boolean).join(' · ')
}

// Opens a turn's work at one of the files it changed: for the list of them under its answer.
type FoldState = { reveal: (key: string | null, path: string) => void }
const Folds = createContext<FoldState>({ reveal: () => {} })

function TurnFold({ foldKey, conversationId, turn, blocks, task, replies, steps, workMs }: { foldKey: string; conversationId: string; turn: TurnItem; blocks: readonly ChatBlock[]; task: boolean; replies: ReadonlyMap<string, number>; steps: number; workMs: number | null }) {
  const compact = useContext(ChatVariant) === 'compact'
  const [open, setOpen] = useDisclosure(foldKey)
  // The header stays where the work is, so the fold opens under the line that opened it.
  return (
    <div className="chat-entry">
      <div className="chat-fold" data-fold={foldKey} data-open={open || undefined} data-state={turn.state}>
        <button type="button" className="chat-fold-header" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="chat-tool-chevron" aria-hidden="true"><ChevronRightIcon /></span>
          {compact ? helperDuration(turn, workMs) : foldText(steps, workMs)}
          {compact && <HelperTurnCost turn={turn} />}
        </button>
        {open && (
          <div className="chat-fold-body">
            {blocks.map((block, index) => <ActivityBlock key={block.key} conversationId={conversationId} block={block} next={blocks[index + 1]} task={task} replies={replies} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// The files a finished turn changed, under its answer: three up front, then the rest on demand.
// A file in the projects opens its current diff in the inspector, where changes are available; one
// outside them (a plan under ~/.claude, say) has no git diff, so it opens the turn's own edit, and
// review is offered only when some file is in the projects.
function TurnChanges({ conversationId, fold, files, turn, reply, collapsible }: { conversationId: string; fold: string; files: readonly TurnFile[]; turn: TurnItem; reply: { key: string; text: string } | null; collapsible: boolean }) {
  const [showAll, setShowAll] = useDisclosure(`changes:${fold}`)
  // The reply above shares its translation by its key; it is the one that comes into view to start
  // one on its own, so this keeps no box.
  const noBox = useRef<HTMLElement>(null)
  const translated = useTranslated(reply ? conversationId : null, reply?.key ?? '', reply?.text ?? '', reply !== null, noBox)
  const folds = useContext(Folds)
  const surface = useChatSurface()
  const shorten = useContext(ChatPaths)
  const { added, removed } = files.reduce((sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }), { added: 0, removed: 0 })
  const hidden = Math.max(files.length - 3, 0)
  const shown = showAll ? files : files.slice(0, 3)
  const inProject = (path: string) => surface.changes !== null && surface.inProject(path)
  const reviewable = files.some((file) => inProject(file.path))
  return (
    <div className="chat-turn-result">
      <div className="chat-changes-rollup">
        <div className="chat-changes-header">
          <span className="chat-changes-icon" aria-hidden="true"><FileChangesIcon /></span>
          <div className="chat-changes-summary">
            <strong>{tr('ConversationChat.modifiedFiles', { value1: files.length })}</strong>
            <span className="chat-diff-count mono">
              <span className="chat-diff-added">+{added}</span>
              <span className="chat-diff-removed">−{removed}</span>
            </span>
          </div>
          {reviewable && (
            <button type="button" className="button chat-changes-review" onClick={surface.showChanges} title={t('ConversationChat.viewAllProjectChangesInInspector')}>{t('ConversationChat.review')}</button>
          )}
        </div>
        <div className="chat-changes-files">
          {shown.map((file) => {
            const path = shorten(file.path)
            const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
            const directory = slash === -1 ? '' : path.slice(0, slash + 1)
            const name = slash === -1 ? path : path.slice(slash + 1)
            const edit = { conversationId, fold: collapsible ? fold : null, path: file.path }
            const outside = surface.changes !== null && !inProject(file.path)
            return (
              <button key={file.path} type="button" className="chat-changes-file" data-change={file.change} data-file-path={file.path} title={outside ? t('ConversationChat.outsideProjectClickToViewThisTurnS', { value1: file.path }) : file.path}
                onClick={() => inProject(file.path) ? surface.showFileChange(file.path, edit) : folds.reveal(edit.fold, file.path)}>
                {outside && <span className="chat-changes-kind" data-kind="outside">{t('ConversationChat.outsideProject')}</span>}
                {file.change !== 'update' && (
                  <span className="chat-changes-kind" data-kind={file.change}>{file.change === 'add' ? t('ConversationChat.new') : t('ChatCommandSettings.delete')}</span>
                )}
                <span className="chat-changes-path mono">
                  {directory && <span className="chat-changes-directory">{directory}</span>}
                  <span className="chat-changes-name">{name}</span>
                </span>
                <span className="chat-diff-count mono">
                  <span className="chat-diff-added">+{file.added}</span>
                  <span className="chat-diff-removed">−{file.removed}</span>
                </span>
              </button>
            )
          })}
          {hidden > 0 && (
            <button type="button" className="chat-changes-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
              {showAll ? t('ConversationChat.collapseFileList') : t('ConversationChat.showMoreFiles', { hidden: hidden })}
              <span aria-hidden="true"><ChevronDownIcon /></span>
            </button>
          )}
        </div>
      </div>
      <div className="chat-message-actions chat-turn-actions">
        {reply && <CopyButton text={translated.shown} label={translated.shown !== reply.text ? t('ChatContextMenu.copyTranslation') : t('ConversationChat.copyReply')} />}
        {reply && <MessageTime at={turn.at} />}
        <span className="chat-turn-summary-static" data-state={turn.state}>{turnText(turn)}</span>
        {translated.foreign && <TranslateButton translated={translated} what={t('ConversationChat.thisReply')} />}
        <ForkButton item={turn} />
      </div>
    </div>
  )
}

function ActivityBlock({ next, ...props }: Parameters<typeof Block>[0] & { next: ChatBlock | undefined }) {
  const activity = activityOf(props.block)
  return <ChatActivityStep activity={activity} connected={Boolean(activity && next && activityOf(next))}><Block {...props} /></ChatActivityStep>
}

// `fresh` is a block that arrived while the chat was open: it enters with a motion.
function Block({ conversationId, block, task, replies, fresh }: { conversationId: string; block: ChatBlock; task: boolean; replies: ReadonlyMap<string, number>; fresh?: boolean }) {
  const compact = useContext(ChatVariant) === 'compact'
  const entering = fresh || undefined
  if (block.kind === 'delegation') return <div className="chat-entry" data-entry-key={block.key}><ChatDelegationGroup calls={block.calls} fresh={fresh} /></div>
  if (compact && block.kind === 'changes') return null
  if (block.kind === 'browser') return <ChatCopyRegion text={block.tools.map(copyTextForItem).join('\n\n')}><div className="chat-entry" data-fresh={entering}><ChatBrowserRun tools={block.tools} /></div></ChatCopyRegion>
  if (block.kind === 'tools') return <ChatCopyRegion text={block.tools.map(copyTextForItem).join('\n\n')}><div className="chat-entry" data-fresh={entering}><ChatToolRun tools={block.tools} /></div></ChatCopyRegion>
  if (block.kind === 'agents') return <ChatCopyRegion text={block.tools.map(copyTextForItem).join('\n\n')}><div className="chat-entry" data-fresh={entering}><ChatSubagents tools={block.tools} fresh={fresh} /></div></ChatCopyRegion>
  if (block.kind === 'edits') return <ChatCopyRegion text={block.tools.map(copyTextForItem).join('\n\n')}><div className="chat-entry" data-fresh={entering}><ChatEditsCard path={block.path} tools={block.tools} /></div></ChatCopyRegion>
  if (block.kind === 'changes') return <ChatCopyRegion text={block.files.map((file) => `${file.path} +${file.added} −${file.removed}`).join('\n')}><div className="chat-entry" data-fresh={entering}><TurnChanges conversationId={conversationId} fold={block.fold} files={block.files} turn={block.turn} reply={block.reply} collapsible={block.collapsible} /></div></ChatCopyRegion>
  if (block.kind === 'fold') return <TurnFold foldKey={block.key} conversationId={conversationId} turn={block.turn} blocks={block.blocks} task={task} replies={replies} steps={block.steps} workMs={block.workMs} />
  const { entry } = block
  const merged = useContext(MergedTurns)
  if (compact && entry.kind === 'stage') return null
  if (entry.kind === 'item' && entry.item.kind === 'turn' && merged.has(block.key)) return null
  return (
    <ChatCopyRegion text={entry.kind === 'item' ? copyTextForItem(entry.item) : ''}>
    <div className="chat-entry" data-user={isUserEntry(entry) || undefined} data-entry-key={block.key} data-fresh={entering}>
      {entry.kind === 'stage' ? <StageDivider conversationId={conversationId} stage={entry.stage} task={task} />
        : <Item conversationId={conversationId} item={entry.item} completedAt={replies.get(block.key)} blockKey={block.key} />}
    </div>
    </ChatCopyRegion>
  )
}

// A conversation whose latest stage runs in chat mode: every stage in order, then the composer.
// What it does beyond itself comes from the surface it is shown on: a free conversation's own
// unless another is given, as a task's chat does.
export function ConversationChat({ conversation, surface, onHandoff, variant = 'full' }: { conversation: Conversation; surface?: ChatSurface; onHandoff?: (agent?: AgentKind) => void; variant?: 'full' | 'compact' }) {
  const { id } = conversation
  const initialMessage = useInitialMessages((messages) => messages[id])
  const width = usePreferences((s) => s.chatWidth)
  const typeface = useChatTypeface()
  const view = useRef<HTMLDivElement>(null)
  const forkSupported = useCore((s) => s.rpc?.features.includes('conversation-fork') ?? false)
  const fork = useCallback((item: ChatItem) => void forkConversation(conversation.id, item), [conversation.id])
  const own = useMemo(() => conversationSurface(conversation, onHandoff ?? null, forkSupported ? fork : null), [conversation, onHandoff, forkSupported, fork, getLocale()])
  const shown = surface ?? own
  const rpc = useCore((s) => s.rpc)
  const page = useChat((s) => s[id])
  const [stages, setStages] = useState<ConversationStage[]>([])
  const list = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const find = useChatFindState(id)
  const findOpened = useCallback(() => { pinned.current = false }, [])
  const olderRequest = useRef<{ id: string; promise: Promise<ChatHistoryResult> } | null>(null)
  const [away, setAway] = useState(false)
  // Every block shown so far, so one that arrives while the chat is open can enter with a motion;
  // older history loaded on request is simply there.
  const seen = useRef<Set<string> | null>(null)
  // Once a block has entered it stays marked: dropping the mark mid-motion would cut it short.
  const entered = useRef(new Set<string>())
  const olderLoaded = useRef(false)
  useEffect(() => {
    seen.current = null
    entered.current = new Set()
  }, [id])

  // Watching makes core send this conversation's item changes to this window until it lets go.
  useEffect(() => {
    if (!rpc) return
    let current = true
    rpc.call('conversations.watchChat', { id }).then(
      (result) => current && setChatPage(id, result),
      () => {}
    )
    return () => {
      current = false
      dropChat(id)
      void rpc.call('conversations.unwatchChat', { id }).catch(() => {})
    }
  }, [rpc, id])

  // A new stage starts with a new session; earlier stages do not change.
  useEffect(() => {
    if (!rpc) return
    let current = true
    rpc.call('conversations.stages', { id }).then(
      (nextStages) => {
        if (current) setStages(nextStages)
      },
      () => {}
    )
    return () => {
      current = false
    }
  }, [rpc, id, conversation.sessionId])

  const items = page?.items ?? NO_ITEMS
  const browserTabs = useWatchBrowserTabs(items.some((item) => item.kind === 'tool' && isBrowserTool(item.name)) ? id : null)
  useEffect(() => acknowledgeInitialMessage(id, items), [id, items])
  // A task's redos, each starting its chat over.
  const attempts = useCore((s) => (conversation.taskId ? s.tasks[conversation.taskId]?.attempts : undefined))
  const redoneAt = useMemo(() => (attempts ?? []).map((attempt) => attempt.at), [attempts, getLocale()])
  const entries = useMemo(() => {
    // A plan shows with its approval; the call's own card would only repeat it.
    const plans = new Set(items.flatMap((item) =>
      item.kind === 'approval' && isPlanApproval(item) && item.toolItemId ? [itemKey({ stageId: item.stageId, id: item.toolItemId })] : []))
    // A turn the usage limit stopped says so on a line of its own, after it: the turn's error and
    // the words the CLI ended it with would only repeat that.
    const limited = new Set(items.flatMap((item) =>
      item.kind === 'usageLimit' ? [itemKey({ stageId: item.stageId, id: item.id.replace(/^limit:/, 'turn:') })] : []))
    const limitWords = new Set(items.flatMap((item) => (item.kind === 'usageLimit' && item.message ? [`${item.stageId}\n${item.message.trim()}`] : [])))
    return timeline(stages, items, redoneAt).flatMap((entry): TimelineEntry[] => {
      if (entry.kind !== 'item') return [entry]
      const { item } = entry
      if (plans.has(itemKey(item))) return []
      if (item.kind === 'assistant' && limitWords.has(`${item.stageId}\n${item.text.trim()}`)) return []
      return item.kind === 'turn' && limited.has(itemKey(item)) ? [{ kind: 'item', item: { ...item, error: null } }] : [entry]
    })
  }, [stages, items, redoneAt, getLocale()])
  const foldTurns = usePreferences((s) => s.foldTurns)
  const delegationSupported = useAgentCallsSupported(conversation)
  const { calls } = useAgentCalls(delegationSupported ? id : null)
  const blocks = useMemo(() => {
    const grouped = chatBlocks(entries, { foldTurns: variant === 'compact' || foldTurns })
    return page && calls?.length ? withDelegations(grouped, calls, Boolean(page.before)) : grouped
  }, [entries, foldTurns, variant, calls, page?.before, Boolean(page), getLocale()])
  for (const key of freshKeys(seen.current, blocks.map((block) => block.key), olderLoaded.current)) entered.current.add(key)
  useEffect(() => {
    if (!page) return
    seen.current = new Set([...(seen.current ?? []), ...blocks.map((block) => block.key)])
    olderLoaded.current = false
  }, [page, blocks])
  const foldedTurns = useMemo(() => new Set(blocks.flatMap((block) => block.kind === 'fold' ? [itemKey(block.turn)] : [])), [blocks, getLocale()])
  const { replies, carried } = useMemo(() => {
    const found = finalReplies(entries)
    const carried = new Set<string>()
    // A turn with a change card moves these actions below that card.
    for (const block of blocks) {
      if (variant !== 'compact' && block.kind === 'changes' && block.reply) {
        found.delete(block.reply.key)
        carried.add(block.reply.key)
      }
    }
    return { replies: found, carried }
  }, [entries, blocks, variant, getLocale()])
  // A turn's own line, when it follows the reply it closes and that reply keeps its actions, joins
  // that line instead of standing under it.
  const { endings, mergedTurns } = useMemo(() => {
    const endings = new Map<string, TurnItem>()
    const mergedTurns = new Set<string>()
    blocks.forEach((block, index) => {
      const previous = blocks[index - 1]
      const turn = block.kind === 'entry' && block.entry.kind === 'item' && block.entry.item.kind === 'turn' ? block.entry.item : null
      if (turn && previous && replies.has(previous.key)) {
        endings.set(previous.key, turn)
        mergedTurns.add(block.key)
      }
    })
    return { endings, mergedTurns }
  }, [blocks, replies, getLocale()])
  const folds = useMemo<FoldState>(() => ({
    // Opens the turn's work and the cards that edited the file, then brings its diff into view.
    reveal: (key, path) => {
      if (key) setOpened(id, key, true)
      pinned.current = false
      const scope = () => key ? list.current?.querySelector(`[data-fold="${CSS.escape(key)}"]`) : list.current
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const found = scope()
        if (!found) return
        for (const disclosure of editDisclosures(found, path)) setOpened(id, disclosure, true)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          scope()?.querySelector(`[data-diff-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }))
      }))
    }
  }), [id, getLocale()])
  // The inspector sends the user back here when git has nothing left of a file this chat edited.
  const reveal = useCore((s) => s.chatReveal?.conversationId === id ? s.chatReveal : null)
  useEffect(() => {
    if (reveal) folds.reveal(reveal.fold, reveal.path)
  }, [reveal?.seq])
  const thoughts = useMemo(() => thoughtDurations(items), [items, getLocale()])
  const todoHistory = useMemo(() => previousTodos(items), [items, getLocale()])
  // What the user sent, in order, for the dock's list of them.
  const sent = useMemo(() => blocks.flatMap((block) => {
    if (block.kind !== 'entry' || !isUserEntry(block.entry)) return []
    const { entry } = block
    if (entry.kind !== 'item' || entry.item.kind !== 'user') return [{ key: block.key, text: '' }]
    const { quotes, body } = parseQuotes(saidText(entry.item.text))
    return [{ key: block.key, text: `${quotes.length ? t('ChatComposer.quotes', { value1: quotes.length }) : ''}${body || t('ConversationChat.handoff')}` }]
  }), [blocks, getLocale()])
  const tools = useMemo(
    () => new Map(items.flatMap((item) => (item.kind === 'tool' ? [[item.id, item] as const] : []))),
    [items, getLocale()]
  )
  const pending = useMemo(
    () => items.filter((item): item is RequestItem => (item.kind === 'approval' || item.kind === 'question') && item.resolution === null),
    [items, getLocale()]
  )
  const finishedCalls = useMemo(() => items.filter((item) => item.kind === 'tool' && item.status !== 'running').length, [items, getLocale()])
  // Each stage has one; the running stage's is the newest.
  const state = useMemo(() => items.findLast((item): item is Extract<ChatItem, { kind: 'state' }> => item.kind === 'state') ?? null, [items, getLocale()])

  // A plan the agent proposes opens beside the conversation, once; the user may close it again.
  const waitingPlan = pending.find(isPlanApproval)
  const waitingPlanKey = waitingPlan ? itemKey(waitingPlan) : null
  const shownPlan = useRef<string | null>(null)
  const showPlan = shown.showPlan
  useEffect(() => {
    if (!waitingPlanKey || shownPlan.current === waitingPlanKey) return
    shownPlan.current = waitingPlanKey
    showPlan(waitingPlanKey)
  }, [waitingPlanKey, showPlan])

  // The browser's live view opens beside the conversation when the agent first uses it, once per
  // conversation; a call still running keeps old history from opening it on a revisit.
  const browserCall = useMemo(() => firstBrowserCall(items), [items, getLocale()])
  const shownBrowser = useRef<string | null>(null)
  const showBrowser = shown.showBrowser
  useEffect(() => {
    if (!browserCall || shownBrowser.current === conversation.id || !shouldOpenBrowser()) return
    shownBrowser.current = conversation.id
    showBrowser()
  }, [browserCall, conversation.id, showBrowser])

  // The working line comes and goes with the turn, below the entries: pinned to the end, the list
  // follows it too, or the line (and the relay's dot that runs to it) sits just under the edge.
  const turnState = conversation.chat?.turn
  useLayoutEffect(() => {
    const element = list.current
    if (element && !find.open && pinned.current) element.scrollTop = element.scrollHeight
  }, [entries, turnState, find.open])

  // A request docking below makes the list shorter; one pinned to the end stays there.
  useEffect(() => {
    const element = list.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      if (!find.open && pinned.current) element.scrollTop = element.scrollHeight
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [find.open])

  // Scrolls to the nearest of the user's messages above what is in view.
  const previous = () => {
    const element = list.current
    if (!element) return
    const top = element.scrollTop
    const above = [...element.querySelectorAll<HTMLElement>('[data-user]')].filter((entry) => entry.offsetTop < top - IN_VIEW_SLACK)
    const target = above.at(-1)
    if (!target) return
    pinned.current = false
    element.scrollTo({ top: target.offsetTop - IN_VIEW_SLACK, behavior: 'smooth' })
  }

  // Brings a call into view from the working line's list of background work: opens the fold that
  // holds it and the call itself, then marks it for a moment so the eye finds it.
  const foldOf = useMemo(() => foldsOfTools(blocks), [blocks])
  const revealTool = useCallback((tool: Extract<ChatItem, { kind: 'tool' }>) => {
    const key = itemKey(tool)
    const fold = foldOf.get(key)
    if (fold) setOpened(id, fold, true)
    setOpened(id, `call:${key}`, true)
    pinned.current = false
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const element = list.current
      const target = element?.querySelector<HTMLElement>(`[data-tool-key="${CSS.escape(key)}"]`)
      if (!element || !target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.dataset.flash = ''
      setTimeout(() => delete target.dataset.flash, 1500)
    }))
  }, [id, foldOf])

  // Brings one of the user's messages into view, and marks it for a moment so the eye finds it.
  const jumpTo = useCallback((key: string) => jump(key), [])
  const jump = (key: string) => {
    const element = list.current
    const target = element?.querySelector<HTMLElement>(`[data-entry-key="${CSS.escape(key)}"]`)
    if (!element || !target) return
    pinned.current = false
    element.scrollTo({ top: target.offsetTop - IN_VIEW_SLACK, behavior: 'smooth' })
    target.dataset.flash = ''
    setTimeout(() => delete target.dataset.flash, 1500)
  }

  const loadOlder = useCallback((): Promise<ChatHistoryResult> => {
    if (olderRequest.current?.id === id) return olderRequest.current.promise
    const load = async (): Promise<ChatHistoryResult> => {
      const before = useChat.getState()[id]?.before
      if (!before) return 'done'
      const older = await perform((connection) => connection.call('conversations.chatItems', { id, before }))
      if (!useChat.getState()[id]) return 'done'
      if (!older || older.before === before) return 'failed'
      pinned.current = false
      olderLoaded.current = true
      prependChatPage(id, older)
      return 'loaded'
    }
    const promise = load().finally(() => { if (olderRequest.current?.promise === promise) olderRequest.current = null })
    olderRequest.current = { id, promise }
    return promise
  }, [id])

  const roots = useMemo(
    () => (conversation.projectPaths.length ? conversation.projectPaths : [conversation.workspacePath]),
    [conversation.projectPaths, conversation.workspacePath, getLocale()]
  )
  const shorten = useMemo(() => pathShortener(roots), [roots, getLocale()])
  // A reply's shell blocks run in this conversation's own terminal tab, in its folder.
  const runScope = useMemo(() => ({ key: conversation.id, cwd: conversation.workspacePath }), [conversation.id, conversation.workspacePath, getLocale()])
  const turn = conversation.sessionId ? (conversation.chat?.turn ?? null) : null
  // What kind of step the turn is at, and what it has out in the background (subagents, and
  // commands run there), for the working line; the step itself shows in the conversation, just above it.
  const running = useMemo(() => {
    const tools = items.filter((item): item is Extract<ChatItem, { kind: 'tool' }> => item.kind === 'tool' && item.status === 'running')
    const background = tools.filter((tool) => isSubagent(tool.name) || tool.background)
    const last = items.at(-1)
    const phase: WorkingPhase = turn === 'awaiting' ? 'asking'
      : tools.some((tool) => !isSubagent(tool.name) && !tool.background) ? 'tools'
      : last?.kind === 'reasoning' && last.streaming ? 'thinking'
        : last?.kind === 'assistant' && last.streaming ? 'replying'
          : tools.length > 0 ? 'waiting' : 'working'
    return { phase, background }
  }, [items, turn, getLocale()])
  // The model as the stage runs it, or as the next stage would start; by its label where the agent gives one.
  const modelId = state?.model ?? conversation.chatOptions?.model ?? null
  // The effort the same way; left out where the agent runs its default without saying which.
  const effort = state?.effort ?? conversation.chatOptions?.effort ?? null
  const agentInfo = useMemo(() => ({
    current: { agent: conversation.agent, model: modelId ? (state?.models.find((each) => each.id === modelId)?.label ?? modelId) : null, effort, provider: conversation.route?.reason === 'served' ? conversation.route.name : null, account: stages.at(-1)?.agent === conversation.agent ? stages.at(-1)?.account ?? null : null },
    byStage: stageAgents(stages, items),
    latest: stages.at(-1)?.id ?? null
  }), [conversation.agent, conversation.route, modelId, state?.models, effort, stages, items, getLocale()])
  // A turn runs from the message that set it going.
  const since = useMemo(() => items.findLast((item) => item.kind === 'user')?.at ?? null, [items, getLocale()])
  const beginRelay = useMessageRelay(view, list, items, id)
  const lastUserKey = blocks.findLast((block) => userItem(block) !== null)?.key
  const fileScope = useMemo(() => ({ conversationId: id, inspector: shown.inspector, roots }), [id, shown.inspector, roots, getLocale()])
  const contextMenu = useChatContextMenu(list, fileScope)
  const stopBackground = useCallback(async (tool: { id: string }) => (await perform((rpc) => rpc.call('conversations.stopBackground', { id, itemId: tool.id }))) !== null, [id])
  return (
    <ChatVariant.Provider value={variant}>
    <FoldedTurns.Provider value={foldedTurns}>
    <ChatSurfaceContext.Provider value={shown}>
    <ChatAgent.Provider value={agentInfo}>
    <ChatPaths.Provider value={shorten}>
    <StopBackground.Provider value={stopBackground}>
    <ChatRoots.Provider value={roots}>
    <ChatBrowserTabs.Provider value={browserTabs}>
    <ChatFilesContext.Provider value={fileScope}>
    <ChatRunScope.Provider value={runScope}>
    <Thoughts.Provider value={thoughts}>
    <Endings.Provider value={endings}>
    <MergedTurns.Provider value={mergedTurns}>
    <CarriedReplies.Provider value={carried}>
    <ChatDisclosureScope.Provider value={id}>
    <ChatFindExpansion.Provider value={find.searching}>
    <Folds.Provider value={folds}>
    <TodoHistory.Provider value={todoHistory}>
    <JumpToEntry.Provider value={jumpTo}>
    <ChatMessageRelay.Provider value={beginRelay}>
    <div className="chat-view" data-variant={variant} data-conversation-id={id} ref={view} data-searching={find.searching || undefined} data-width={width} {...typeface}>
      {variant !== 'compact' && <ChatFind key={id} state={find} scope={view} container={list} onOpen={findOpened} hasOlder={Boolean(page?.before)} loadOlder={loadOlder} />}
      <div
        className="chat-list"
        ref={list}
        onContextMenu={contextMenu.onContextMenu}
        onKeyDown={contextMenu.onKeyDown}
        onPointerDownCapture={contextMenu.onPointerDown}
        onScroll={(event) => {
          const element = event.currentTarget
          const below = element.scrollHeight - element.scrollTop - element.clientHeight
          pinned.current = !find.open && below < PINNED_SLACK
          setAway(below > AWAY_SLACK)
        }}
      >
        {page?.before && <button type="button" className="link-button chat-older" onClick={() => void loadOlder()}>{t('ConversationChat.loadEarlierMessages')}</button>}
        {!page && !initialMessage && <ChatSkeleton />}
        {blocks.map((block, index) => {
          const next = blocks[index + 1]
          const message = userItem(block)
          const sentAt = message?.at ?? null
          const entering = entered.current.has(block.key)
          // The head under the latest message is the running turn's, while it runs.
          const live = (turn === 'running' || turn === 'awaiting') && block.key === lastUserKey ? turn : null
          // A message's answer opens with the agent's head, under the message: as soon as it is sent
          // and the turn runs, before the agent has said anything, and kept in place once it does.
          const head = sentAt !== null && (next ? userAt(next) === null : live !== null)
          return (
            <Fragment key={block.key}>
              <ActivityBlock conversationId={id} block={block} next={next} task={Boolean(conversation.taskId)} replies={replies} fresh={entering} />
              {variant !== 'compact' && head && message && <div className="chat-entry" data-fresh={entering || undefined}><TurnHead at={message.at} stageId={message.stageId} messageKey={block.key} live={live} /></div>}
            </Fragment>
          )
        })}
        {initialMessage && !items.some((item) => item.kind === 'user' && item.id === `u:${initialMessage.ref}`) && (
          <InitialMessageEntry id={id} agent={conversation.agent} message={initialMessage} />
        )}
        {(turn === 'running' || turn === 'awaiting') && (
          <ChatWorking
            phase={running.phase}
            tokens={state?.turnUsage?.output ?? null}
            background={running.background}
            since={since}
            onReveal={revealTool}
          />
        )}
        {away && (
          <button
            type="button"
            className="chat-latest"
            onClick={() => {
              pinned.current = true
              list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
            }}
          >{tr('ConversationChat.jumpToLatest', { value1: <ArrowDownIcon /> })}</button>
        )}
      </div>
      <ProjectRunNotice conversationId={conversation.id} />
      <ChatDock compact={variant === 'compact'} conversation={conversation} state={state} pending={pending} tools={tools} finishedCalls={finishedCalls} onPrevious={previous} sent={sent} onJump={jump} />
      {variant !== 'compact' && <SelectionComment
        conversationId={id}
        container={list}
        region=".chat-assistant"
        sourceOf={(reply) => reply.closest<HTMLElement>('[data-entry-key]')?.dataset.entryKey ?? null}
        name="reply"
        label={t('ConversationChat.commentOnThisReply')}
        hidden={contextMenu.open}
        onAdded={() => list.current?.closest('.chat-view')?.querySelector<HTMLElement>('.chat-input')?.focus()}
      />}
      {contextMenu.menu}
    </div>
    </ChatMessageRelay.Provider>
    </JumpToEntry.Provider>
    </TodoHistory.Provider>
    </Folds.Provider>
    </ChatFindExpansion.Provider>
    </ChatDisclosureScope.Provider>
    </CarriedReplies.Provider>
    </MergedTurns.Provider>
    </Endings.Provider>
    </Thoughts.Provider>
    </ChatRunScope.Provider>
    </ChatFilesContext.Provider>
    </ChatBrowserTabs.Provider>
    </ChatRoots.Provider>
    </StopBackground.Provider>
    </ChatPaths.Provider>
    </ChatAgent.Provider>
    </ChatSurfaceContext.Provider>
    </FoldedTurns.Provider>
    </ChatVariant.Provider>
  )
}
