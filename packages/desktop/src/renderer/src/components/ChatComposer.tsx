import { getLocale, t, tr } from '../i18n'
import { HelperStartOptions } from './HelperModelPicker'
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { chatReferencesIn, chatReferencesFor, type ChatReference, agentDescriptor, canReuseConversation, type ChatImage, type ChatItem, type ChatQueued, type Conversation } from '@antumi/protocol'
import { perform, useChatImagesSupported, useChatOptionsSupported, useCore, useFileMentionsSupported, useScheduleImagesSupported, useSchedulesSupported } from '../core-store'
import { agentEntries, antumiEntries } from '../chat-commands'
import { composeMessage, parseQuotes, setQuotes, useQuotes, type ChatQuote } from '../chat-quotes'
import { takeDraft } from '../chat-drafts'
import { messageReferences, shiftMentions, readMentionedText, writeMentionedText } from '../chat-mentions'
import { saidText, usePlans } from '../chat-state'
import { QuoteCards } from './ChatQuoteCards'
import { agentLabel } from '../labels'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { workingPlaceholder } from '../composer-placeholder'
import { useChatSurface } from './chat-surface'
import { ChatAddMenu, ChatImageStrip, useComposerImages } from './ChatImages'
import { useChatCommandMenu } from './ChatCommandMenu'
import { useChatMentionMenu } from './ChatMentionMenu'
import { MentionField, useMentionedText } from './ChatMentionField'
import { ChatOptionsBar } from './ChatOptionsBar'
import { RouteBadge } from './RouteBadge'
import { HandoffAgentPicker, HandoffModePicker, HandoffModelPicker, useComposerHandoff } from './ChatHandoff'
import { ChevronDownIcon, ClockIcon, CloseIcon, EnterIcon, PencilIcon, StopIcon } from './icons'
import { SchedulePicker } from './SchedulePicker'
import { createSchedule } from '../schedules'
import { ChatMessageRelay } from './chat-message-relay'
import { composerDraft, EMPTY_DRAFT, saveComposerDraft } from '../composer-drafts'
import { useOccludesBrowser } from '../browser-occlusion'
import { sendWayKeys, sendWays, type SendWay } from '../chat-send-ways'
import { sendToNewConversation, useReuseConversationSupported } from './ConversationActions'
import { useInitialMessages } from '../initial-messages'

// Enter sends and Shift+Enter breaks the line; Enter while an input method is composing picks a
// candidate instead.
export function sendsMessage(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing
}

// ⌘⇧Enter (Ctrl+Shift+Enter elsewhere) sends to a new conversation on this one's settings.
export function sendsToNewConversation(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key === 'Enter' && event.shiftKey && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing
}

// ⌘Enter (Ctrl+Enter elsewhere) sends into the running turn instead of queueing.
export function steersMessage(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing
}

// Tab or →, alone, takes the suggestion the empty input shows.
function takesSuggestion(event: KeyboardEvent<HTMLElement>): boolean {
  const alone = !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.nativeEvent.isComposing
  return alone && (event.key === 'Tab' || event.key === 'ArrowRight')
}

// Images from two sources in order, each once.
export function mergeImages(first: readonly ChatImage[], second: readonly ChatImage[]): ChatImage[] {
  const known = new Set(first.map((image) => image.id))
  return [...first, ...second.filter((image) => !known.has(image.id))]
}

type StateItem = Extract<ChatItem, { kind: 'state' }>

// A waiting message as its row reads it: what the user wrote, and how many passages it quotes.
function queuedText(text: string): string {
  const { quotes, body } = parseQuotes(text)
  const quoted = quotes.length ? t('ChatComposer.quotes', { value1: quotes.length }) : ''
  return `${quoted}${body}` || t('ChatComposer.imagesOnly')
}

// Sends what the input holds later, unattended: once its time comes and the agent has quota again.
// An empty input schedules carrying out the plan the chat has; with no plan, it schedules nothing.
function ScheduleSendButton({ conversationId, text, references, quotes, images, disabledReason, onScheduled }: {
  conversationId: string
  // What the input holds, which the picker starts from and lets the user change there.
  text: string
  references: ChatReference[]
  quotes: readonly ChatQuote[]
  // The pictures in the input, by their names in core's attachment store, which keeps them.
  images: readonly string[]
  disabledReason: string | null
  onScheduled: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const planned = usePlans(conversationId).length > 0
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => {
    if (!open) setDraft(text)
    setOpen(!open)
  }
  const extras = [images.length ? t('ChatComposer.images', { value1: images.length }) : null, quotes.length ? t('ChatComposer.quotes_242', { value1: quotes.length }) : null].filter(Boolean)
  return (
    <span className="menu-anchor chat-schedule-anchor">
      <button
        type="button"
        className="tool-button chat-schedule-button"
        aria-label={t('ChatComposer.scheduleMessage')}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabledReason !== null}
        data-tooltip={disabledReason ?? t('ChatComposer.scheduleSendWhenQuotaResetsOrAtA')}
        data-tooltip-side="top-end"
        onClick={toggle}
      >
        <ClockIcon />
      </button>
      {open && (
        <SchedulePicker
          title={t('ChatComposer.scheduleMessage')}
          align="end"
          empty={!planned && draft.trim() === '' && quotes.length === 0 && images.length === 0}
          onSchedule={async (notBefore) => {
            const message = composeMessage(quotes, draft)
            const run = await createSchedule({ kind: 'conversation', conversationId, text: message.trim(), references: chatReferencesFor(draft, message.trim(), shiftMentions(references, text, draft, null)), ...(images.length ? { images: [...images] } : {}) }, notBefore)
            if (run) onScheduled()
            return run !== null
          }}
          onClose={close}
        >
          {/* The message itself, written or changed here; empty, the agent carries out the chat's plan. */}
          <textarea
            className="input schedule-message"
            rows={3}
            value={draft}
            aria-label={t('ChatComposer.instructionsToSendToAgentWhenDue')}
            placeholder={planned ? t('ChatComposer.instructionsWhenDueLeaveEmptyToImplementThe') : t('ChatComposer.messageToSendWhenDue')}
            onChange={(event) => setDraft(event.target.value)}
          />
          {extras.length > 0 && (
            <div className="schedule-extras">
              {extras.map((extra) => <span key={extra} className="schedule-extra">{tr('ChatComposer.attach', { extra: extra })}</span>)}
            </div>
          )}
        </SchedulePicker>
      )}
    </span>
  )
}

// The messages waiting above the input, in the order they will go: one per turn as each ends. A
// failed turn holds them; the first is released from the header, any of them from its row. Each
// can be edited back into the input, dropped, or, where the agent takes it, put into the running
// turn at once.
function QueuedRow({ entry, index, steerable, onEdit, onRelease, onNow, onCancel }: {
  entry: ChatQueued
  index: number
  steerable: boolean
  onEdit: (entry: ChatQueued) => void
  onRelease: (ref: string) => void
  onNow: (ref: string) => void
  onCancel: (ref: string) => void
}) {
  return (
    <>
      {index >= 0 && <span className="chat-queued-index">{index + 1}.</span>}
      <span className="chat-queued-text" title={entry.text}>{queuedText(entry.text)}</span>
      {entry.images.length > 0 && <span className="chat-queued-images">{tr('ChatComposer.images', { value1: entry.images.length })}</span>}
      <span className="chat-queued-actions">
        {entry.held && index > 0 && (
          <button type="button" className="chat-queued-action" aria-label={t('ChatComposer.sendThisMessage')} data-tooltip={t('ChatComposer.sendThisMessage')} data-tooltip-side="top-end" onClick={() => onRelease(entry.ref)}><EnterIcon /></button>
        )}
        {steerable && (
          <button type="button" className="chat-queued-action" aria-label={t('ChatComposer.insertIntoTheCurrentTurnImmediately')} data-tooltip={t('ChatComposer.insertNow')} data-tooltip-side="top-end" onClick={() => onNow(entry.ref)}><EnterIcon /></button>
        )}
        <button type="button" className="chat-queued-action" aria-label={t('ChatComposer.editInComposer')} data-tooltip={t('chatTools.edit')} data-tooltip-side="top-end" onClick={() => onEdit(entry)}><PencilIcon /></button>
        <button type="button" className="chat-queued-action" aria-label={t('ChatCommandSettings.delete')} data-tooltip={t('ChatCommandSettings.delete')} data-tooltip-side="top-end" onClick={() => onCancel(entry.ref)}><CloseIcon /></button>
      </span>
    </>
  )
}

// The messages waiting to go, at the top of the dock. One shows as it is; several fold to a line
// saying how many and which goes next, opening on a click. A failed turn holds them; the first is
// released from the header, any other from its row. Each can be edited back into the input,
// dropped, or, where the agent takes it, put into the running turn at once.
function QueuedList({ queue, held, steerable, ...actions }: {
  queue: readonly ChatQueued[]
  held: boolean
  steerable: boolean
  onEdit: (entry: ChatQueued) => void
  onRelease: (ref: string) => void
  onNow: (ref: string) => void
  onCancel: (ref: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [first] = queue
  if (first && queue.length === 1) {
    return (
      <div className="chat-queue chat-queue-one chat-queued" data-held={held || undefined}>
        <span className="chat-queue-label">{held ? t('ChatComposer.previousTurnUnfinishedNotSent') : t('ChatComposer.sendAfterThisTurn')}</span>
        <QueuedRow entry={first} index={-1} steerable={steerable} {...actions} />
      </div>
    )
  }
  return (
    <div className="chat-queue" data-held={held || undefined}>
      <div className="chat-queue-head">
        <button type="button" className="chat-queue-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="chat-queue-label">{held ? t('ChatComposer.unsentMessages', { value1: queue.length }) : t('ChatComposer.queuedMessages', { value1: queue.length })}</span>
          {!open && first && <span className="chat-queue-next">{tr('ChatComposer.next', { value1: <span>{queuedText(first.text)}</span> })}</span>}
          <span className="chat-tool-chevron" aria-hidden="true"><ChevronDownIcon /></span>
        </button>
        {held && first && <button type="button" className="link-button" onClick={() => actions.onRelease(first.ref)}>{t('ChatComposer.resumeSendingTheFirstMessage')}</button>}
      </div>
      {open && (
        <ol className="chat-queue-list">
          {queue.map((entry, index) => (
            <li key={entry.ref} className="chat-queued" data-held={entry.held || undefined}>
              <QueuedRow entry={entry} index={index} steerable={steerable} {...actions} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

type SendRow = { way: SendWay; label: string; disabled: boolean; run: () => void }

// Over send (or stop): every way the input can go now, each with its keys, as Claude's desktop app
// shows them. A row also does what it names, for whoever reaches for the pointer.
function SendCard({ rows, note, children }: { rows: readonly SendRow[]; note: string | null; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const later = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), delay)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <span
      className="chat-send-anchor"
      // As slow to come as a tooltip; a moment to go, so the pointer can cross to the card.
      onPointerEnter={() => later(true, open ? 0 : 300)}
      onPointerLeave={() => later(false, 120)}
      onClickCapture={() => later(false, 0)}
    >
      {children}
      {open && <SendCardRows rows={rows} note={note} />}
    </span>
  )
}

function SendCardRows({ rows, note }: { rows: readonly SendRow[]; note: string | null }) {
  useOccludesBrowser()
  return (
    <div className="chat-send-card" role="group" aria-label={t('ChatComposer.waysToSend')}>
      {note && <div className="chat-send-card-note">{note}</div>}
      {rows.map((row) => (
        <button key={row.way} type="button" className="chat-send-card-row" disabled={row.disabled} onClick={row.run}>
          <span>{row.label}</span>
          <span className="chat-send-card-keys">{sendWayKeys(row.way).map((key) => <kbd key={key}>{key}</kbd>)}</span>
        </button>
      ))}
    </div>
  )
}

// Enter sends when the agent is idle; while it works, Enter queues the message behind any already
// waiting, and ⌘Enter puts it into the running turn where the agent takes that. With no agent
// running, it starts one on the same session first. The corner button sends, or stops the turn.
// Images pasted, dropped or picked from the ＋ below sit above the text until it goes. `state` is
// the running stage's, for the options row.
export function ChatComposer({ conversation, state, compact = false }: { conversation: Conversation; state: StateItem | null; compact?: boolean }) {
  const { id } = conversation
  const initialMessage = useInitialMessages((messages) => messages[id])
  const surface = useChatSurface()
  const beginRelay = useContext(ChatMessageRelay)
  const [draft] = useState(() => composerDraft(id))
  const { value, setText, setValue } = useMentionedText({ text: draft.text, mentions: draft.mentions })
  const { text } = value
  const [busy, setBusy] = useState(false)
  const quotes = useQuotes(id)
  const imagesSupported = useChatImagesSupported()
  const optionsSupported = useChatOptionsSupported()
  const schedulesSupported = useSchedulesSupported()
  const scheduleImagesSupported = useScheduleImagesSupported()
  const mentionsSupported = useFileMentionsSupported()
  const attached = useComposerImages(draft.images)
  useEffect(() => saveComposerDraft(id, { ...value, images: attached.images }), [id, value, attached.images])
  // A message left here for the user, as a fork leaves the message it stopped before.
  useEffect(() => {
    const draft = takeDraft(id)
    if (!draft) return
    const { quotes: quoted, body } = parseQuotes(saidText(draft.text))
    setValue(readMentionedText(body, chatReferencesIn(draft.text, body, draft.references)))
    if (quoted.length > 0) setQuotes(id, quoted)
    attached.setImages([...draft.images])
    // Once, when the composer shows for this conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const running = conversation.sessionId !== null
  // An older core reports only the first waiting message, without a ref to act on it by.
  const queue: readonly ChatQueued[] = !running || !state ? []
    : state.queue.length > 0 ? state.queue
      : state.queued ? [{ ref: '', text: state.queued.text, held: state.queued.held, images: state.queued.images }] : []
  const steerable = Boolean(state?.steerable)
  const turn = conversation.chat?.turn ?? null
  const idle = running && turn === 'idle'
  const working = running && (turn === 'running' || turn === 'awaiting')
  // An older core takes a message only between turns.
  const queueable = optionsSupported && working
  const stopped = !running
  const starting = Boolean(conversation.starting) || (stopped && busy) || Boolean(initialMessage)
  const initialHint = initialMessage ? initialMessage.phase === 'failed' ? t('ChatComposer.retryTheFirstMessageAboveFirst') : initialMessage.phase === 'sending' ? t('ChatComposer.sendingFirstMessage') : t('ChatComposer.starting', { value1: agentLabel(conversation.agent) }) : null
  const canTake = (idle || queueable || stopped) && !busy && !starting && !surface.sendBlocker && !conversation.delegation?.writing && attached.uploading === 0
  const canSend = canTake && (text.trim() !== '' || attached.images.length > 0 || quotes.length > 0)
  // What the agent guesses comes next, as Claude Code shows it: grey in the empty input, Tab or →
  // takes it, typing anything else puts it away for good.
  const [dismissed, setDismissed] = useState<string | null>(null)
  const offered = idle ? conversation.chat?.suggestion ?? null : null
  // Another agent picked in the agent switch: the next send hands the chat to it instead.
  const handoff = useComposerHandoff(conversation)
  const handingOff = handoff.target?.agent ?? null
  const suggestion = !handingOff && offered && offered !== dismissed && text === '' && attached.images.length === 0 && quotes.length === 0 && !surface.sendBlocker ? offered : null
  const canSteer = !handingOff && queueable && steerable && canSend
  // Not held by this conversation's turn: the new one runs beside it.
  const reusable = useReuseConversationSupported() && canReuseConversation(conversation) && !compact
  const canSendNew = reusable && !handingOff && !busy && !starting && attached.uploading === 0 && (text.trim() !== '' || attached.images.length > 0 || quotes.length > 0)
  const chatCommands = useCore((s) => s.chatCommands)
  const commandEntries = useMemo(
    () => [...antumiEntries(chatCommands, conversation.projectPaths), ...agentEntries(state?.commands ?? [])],
    [chatCommands, conversation.projectPaths, state?.commands, getLocale()]
  )
  const commandMenu = useChatCommandMenu({
    text,
    entries: commandEntries,
    agentLabel: agentLabel(conversation.agent),
    setText,
    sendCommand: (command) => void send(false, command)
  })
  const mentionMenu = useChatMentionMenu({ conversationId: conversation.id, value, setText, setValue, roots: conversation.projectPaths, cwd: conversation.workspacePath, agent: conversation.agent })
  // The input as the agent reads it, each mention written out.
  const writtenMessage = writeMentionedText(value, handingOff ?? conversation.agent)
  const written = writtenMessage.text
  // steer: into the running turn now; otherwise a message while the agent works waits its turn.
  // The user's own command expands into the input to be read over, rather than going.
  const send = async (steer = false, message = written) => {
    const expanded = commandMenu.expand(message)
    if (expanded !== null) {
      setText(expanded)
      return
    }
    // Quotes go before what the user wrote; a command must open its message, so it goes alone.
    const quoting = quotes.length > 0 && !message.trim().startsWith('/')
    const composed = quoting ? composeMessage(quotes, message) : message.trim()
    if (!canTake || (composed === '' && attached.images.length === 0) || (steer && !canSteer)) return
    setBusy(true)
    const images = attached.images
    // Getting ready resolves once the agent can take it; if that fails, the text stays to try again.
    const ready = await surface.prepareSend(stopped)
    const relay = ready && (!queueable || steer) ? beginRelay(composed, images.map((image) => image.id), mentionMenu.inputProps.input.current?.contentDOM ?? null) : null
    const sent = ready && await perform((rpc) => rpc.call('conversations.send', {
      id,
      text: composed,
      ...(rpc.features.includes('chat-references') ? { references: messageReferences(writtenMessage, composed) } : {}),
      ...(images.length ? { images: images.map((image) => image.id) } : {}),
      ...(queueable ? (steer ? { steer: true } : { queue: true }) : {})
    }))
    setBusy(false)
    if (sent) {
      relay?.accept()
      setText('')
      attached.setImages([])
      if (quoting) setQuotes(id, [])
    } else relay?.cancel()
  }
  // The view moves to the new conversation as it opens, so the input is cleared in storage too.
  const sendNew = async () => {
    const expanded = commandMenu.expand(written)
    if (expanded !== null) {
      setText(expanded)
      return
    }
    const quoting = quotes.length > 0 && !written.trim().startsWith('/')
    const composed = quoting ? composeMessage(quotes, written) : written.trim()
    if (!canSendNew || (composed === '' && attached.images.length === 0)) return
    setBusy(true)
    const went = await sendToNewConversation(conversation, composed, attached.images, messageReferences(writtenMessage, composed))
    setBusy(false)
    if (!went) return
    setText('')
    attached.setImages([])
    if (quoting) setQuotes(id, [])
    saveComposerDraft(id, EMPTY_DRAFT)
  }
  // The message goes with the handoff as the note the new agent reads first; images wait for the next.
  const handOff = async () => {
    if (busy || starting || handoff.blocker) return
    const quoting = quotes.length > 0
    setBusy(true)
    const message = quoting ? composeMessage(quotes, written) : written.trim()
    const went = await handoff.send(message, messageReferences(writtenMessage, message))
    setBusy(false)
    if (went) {
      setText('')
      if (quoting) setQuotes(id, [])
    }
  }
  // Picking an agent to hand to, here or from elsewhere, leads to the input that sends it.
  useEffect(() => {
    if (handingOff) mentionMenu.inputProps.input.current?.focus()
    // Only when the agent picked changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handingOff])
  const cancelQueued = (ref: string) => perform((rpc) => rpc.call('conversations.cancelQueued', { id, ...(ref ? { ref } : {}) }))
  const releaseQueued = (ref: string) => void perform((rpc) => rpc.call('conversations.sendQueued', { id, ...(ref ? { ref } : {}) }))
  const sendQueuedNow = (ref: string) => void perform((rpc) => rpc.call('conversations.sendQueued', { id, ...(ref ? { ref } : {}), now: true }))
  const editQueued = async (entry: ChatQueued) => {
    if (await cancelQueued(entry.ref)) {
      const parsed = parseQuotes(entry.text)
      if (parsed.quotes.length) setQuotes(id, [...parsed.quotes, ...quotes])
      const restored = readMentionedText(parsed.body, chatReferencesIn(entry.text, parsed.body, entry.references))
      setValue((current) => {
        const prefix = restored.text + (restored.text && current.text ? '\n\n' : '')
        return { text: prefix + current.text, mentions: [...restored.mentions, ...current.mentions.map((mention) => ({ ...mention, start: mention.start + prefix.length, end: mention.end + prefix.length }))] }
      })
      attached.setImages((current) => mergeImages(entry.images, current))
    }
  }
  const interrupt = () => void perform((rpc) => rpc.call('conversations.interrupt', { id }))
  const sendRow: Record<SendWay, Omit<SendRow, 'way'>> = {
    send: { label: t('ChatComposer.send'), disabled: !canSend, run: () => void send() },
    interrupt: { label: t('ChatComposer.interrupt'), disabled: false, run: interrupt },
    queue: { label: t('ChatComposer.sendAfterTheTurn'), disabled: !canSend, run: () => void send() },
    steer: { label: t('ChatComposer.insertNow'), disabled: !canSteer, run: () => void send(true) },
    newConversation: { label: t('ChatComposer.sendToNewConversation'), disabled: !canSendNew, run: () => void sendNew() }
  }
  const sendRows = sendWays({ working, queueable, steerable, reusable }).map((way) => ({ way, ...sendRow[way] }))
  return (
    <>
    {queue.length > 0 && (
      <QueuedList
        queue={queue}
        held={queue.some((entry) => entry.held)}
        steerable={steerable && working}
        onEdit={(entry) => void editQueued(entry)}
        onRelease={releaseQueued}
        onNow={sendQueuedNow}
        onCancel={(ref) => void cancelQueued(ref)}
      />
    )}
    <div
      className="chat-input-card"
      data-working={working || starting || undefined}
      data-awaiting={turn === 'awaiting' || undefined}
      onDragOver={imagesSupported ? attached.handlers.onDragOver : undefined}
      onDrop={imagesSupported ? attached.handlers.onDrop : undefined}
    >
      {commandMenu.menu}
      {mentionMenu.menu}
      {quotes.length > 0 && <QuoteCards conversationId={id} quotes={quotes} onDone={() => mentionMenu.inputProps.input.current?.focus()} />}
      {imagesSupported && <ChatImageStrip images={attached.images} uploading={attached.uploading} onRemove={attached.remove} />}
      <MentionField
        value={value}
        aria-label={t('ChatComposer.messageToAgent')}
        {...commandMenu.inputProps}
        {...mentionMenu.inputProps}
        readOnly={starting}
        autoFocus={compact}
        placeholder={compact ? t('ChatComposer.askHelper') :
          handingOff ? t('ChatComposer.handOffToAddInstructionsOrPressEnter', { value1: agentLabel(handingOff) })
          : surface.sendBlocker ?? initialHint ?? suggestion ?? (idle || stopped ? t('ChatComposer.messageAgentEnterToSendShiftEnterFor', { value1: commandEntries.length > 0 ? t('ChatComposer.forCommands') : '', value2: mentionsSupported ? t('ChatComposer.toReferenceFiles') : '' })
            : workingPlaceholder({ awaiting: turn === 'awaiting', queueable, steerable }))
        }
        setValue={(next) => {
          if (suggestion && next.text) setDismissed(suggestion)
          setValue(next)
        }}
        onPasteCapture={imagesSupported ? attached.handlers.onPaste : undefined}
        onKeyDownCapture={(event) => {
          if (commandMenu.onKeyDown(event) || mentionMenu.onKeyDown(event)) return
          if (handingOff && (steersMessage(event) || sendsMessage(event))) {
            event.preventDefault()
            void handOff()
          } else if (suggestion && takesSuggestion(event)) {
            event.preventDefault()
            setText(suggestion)
          } else if (reusable && sendsToNewConversation(event)) {
            event.preventDefault()
            void sendNew()
          } else if (steersMessage(event)) {
            event.preventDefault()
            void send(true)
          } else if (sendsMessage(event)) {
            event.preventDefault()
            void send()
          } else if (event.key === 'Escape' && working && !event.nativeEvent.isComposing) {
            event.preventDefault()
            interrupt()
          }
        }}
      />
      {/* Under the input, inside its box: what goes with the message, how the agent runs, and send. */}
      <div className="chat-options">
        {imagesSupported && <ChatAddMenu disabled={starting} onAdd={attached.add} />}
        {!compact && handoff.targets.length > 0 && <HandoffAgentPicker conversationId={id} handoff={handoff} disabled={busy || starting} />}
        {!compact && !handoff.target && <RouteBadge conversation={conversation} locked />}
        {handingOff ? (
          <>
            <HandoffModePicker conversationId={id} handoff={handoff} />
            <span className="chat-dock-spacer" />
            <HandoffModelPicker conversationId={id} agent={handingOff} />
          </>
        ) : optionsSupported && state ? <ChatOptionsBar compact={compact} conversation={conversation} state={state} /> : compact ? <HelperStartOptions conversation={conversation} /> : null}
        {suggestion && (
          <span className="chat-suggestion-hint" aria-hidden="true">{tr('ChatComposer.useSuggestion', { value1: <kbd>Tab</kbd> })}</span>
        )}
        {/* A routine's chat is out of the list and its follow-ups light nothing: a run scheduled
            here would finish unseen. Running again belongs to the routine's own schedule. */}
        {!handingOff && schedulesSupported && agentDescriptor(conversation.agent).capabilities.unattended && !conversation.routineId && !conversation.helperOf && (
          <ScheduleSendButton
            conversationId={id}
            text={written}
            references={writtenMessage.references}
            quotes={quotes}
            images={attached.images.map((image) => image.id)}
            disabledReason={
              attached.uploading > 0 ? t('ChatComposer.imagesAreStillUploading')
                : attached.images.length > 0 && !scheduleImagesSupported ? t('ChatComposer.thisCoreCannotScheduleMessagesWithImagesYet')
                  : surface.sendBlocker ?? null
            }
            onScheduled={() => {
              setText('')
              setQuotes(id, [])
              attached.setImages([])
            }}
          />
        )}
        {canSteer && (
          <button type="button" className="button ghost chat-steer-button" data-tooltip-side="top-end" data-tooltip={t('ChatComposer.sendToAgentNowWithoutWaitingForThis', { PRIMARY_KEY_LABEL: PRIMARY_KEY_LABEL })} onClick={() => void send(true)}>{t('ChatComposer.insertNow')}</button>
        )}
        {handingOff ? (
          <button
            type="button"
            className="button primary chat-handoff-send"
            aria-label={t('ChatComposer.handOffTo', { value1: agentLabel(handingOff) })}
            data-tooltip-side="top-end"
            aria-disabled={handoff.blocker !== null}
            data-tooltip={handoff.blocker ? t('ChatComposer.cannotHandOffYet', { value1: handoff.blocker }) : t('ChatComposer.handOffToEnter', { value1: handoff.stopsRunning ? t('ChatComposer.stop', { value1: agentLabel(handoff.from) }) : '', value2: agentLabel(handingOff) })}
            disabled={busy || starting}
            onClick={() => void handOff()}
          >{t('ChatComposer.handOff')}</button>
        ) : (
          <SendCard rows={sendRows} note={initialHint ?? (starting ? t('ChatComposer.starting', { value1: agentLabel(conversation.agent) }) : null)}>
            {working ? (
              <button type="button" className="chat-input-button" data-stop aria-label={t('ChatComposer.interruptThisTurnEsc')} onClick={interrupt}>
                <StopIcon />
              </button>
            ) : (
              <button type="button" className="chat-input-button" aria-label={t('ChatComposer.sendEnter')} disabled={!canSend} onClick={() => void send()}>
                <EnterIcon />
              </button>
            )}
          </SendCard>
        )}
      </div>
    </div>
    </>
  )
}
