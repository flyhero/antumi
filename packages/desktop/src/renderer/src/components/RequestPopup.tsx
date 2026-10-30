import { getLocale, useLocale, t } from '../i18n'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import { create } from 'zustand'
import type { AgentKind, ChatItem, Conversation } from '@antumi/protocol'
import { dropChat, pathShortener, setChatPage, useChat } from '../chat-state'
import { dismissError, perform, useCore } from '../core-store'
import { layoutRequestPopup, onRequestPopupGeometry, onRequestPopupWanted, openFromRequestPopup, setRequestPopupInteractive, type PopupGeometry } from '../desktop-bridge'
import type { ActionableTarget } from '../attention'
import { agentLabel } from '../labels'
import { usePreferences } from '../preferences'
import { islandActivity, popupKey, popupKind, popupLabel, popupQueue, type ActivityEntry, type PopupEntry, type PopupKind } from '../request-popup'
import { ChatSurfaceContext, type ChatSurface } from './chat-surface'
import { PendingRequests } from './ChatDock'
import { ChatRoots } from './ChatMarkdown'
import type { RequestItem } from './ChatRequestCards'
import { ChatPaths } from './ChatToolCard'
import { scheduleErrorToastDismiss } from './ErrorToast'
import { AgentIcon, ChevronRightIcon, CloseIcon, DocumentIcon, HelpIcon, LockIcon, PopInIcon } from './icons'
import { AntHead, AntMoodMark, antMood } from './AntHead'

type StateItem = Extract<ChatItem, { kind: 'state' }>

const NO_ITEMS: readonly ChatItem[] = []
const NONE_CLOSED: ReadonlySet<string> = new Set()
// Asked for, with nothing to show by then (answered in the meantime): the card stays down.
const GIVE_UP_MS = 5000
// How many agents' marks the island's leading ear holds.
const EAR_MARKS = 3
// The header's mark of what is asked: the words are its label, for the pointer and a reader.
const KIND_ICON: Record<PopupKind, JSX.Element> = { question: <HelpIcon />, plan: <DocumentIcon />, permission: <LockIcon /> }

// Whether the main window wants the card up. Followed from the page's start: main says so as soon
// as the page loads, which may be before React has mounted anything to hear it.
const useWanted = create<boolean>()(() => false)
const setWanted = (wanted: boolean) => useWanted.setState(wanted, true)
// How main placed the window: an island over the menu bar, or a plain card under it.
const useGeometry = create<PopupGeometry>()(() => ({ island: false, notch: null }))

export function followRequestPopup(): void {
  onRequestPopupWanted(setWanted)
  // How the card is drawn (styles.css): an island, joined to the notch when there is one.
  onRequestPopupGeometry((geometry) => {
    const { island, notch } = geometry
    const root = document.documentElement
    if (island) root.dataset.island = notch ? 'notch' : 'floating'
    else delete root.dataset.island
    root.style.setProperty('--notch-width', `${notch?.width ?? 0}px`)
    root.style.setProperty('--notch-height', `${notch?.height ?? 0}px`)
    useGeometry.setState(geometry, true)
  })
}

// The card's chat does what the card cannot in the main window, where the whole of it is.
function popupSurface(entry: PopupEntry, conversation: Conversation | undefined): ChatSurface {
  const open = () => openFromRequestPopup(entry.target)
  const { target } = entry
  return {
    inspector: target.kind === 'task' ? 'task' : 'conversation',
    showPlan: open,
    showChanges: open,
    showFileChange: open,
    inProject: () => false,
    showBrowser: open,
    changes: null,
    changesHint: '',
    prepareSend: async () => false,
    sendBlocker: null,
    // A task that may only plan keeps its plan for later, as its chat does (TaskChat).
    savePlan: target.kind === 'task' && conversation?.planOnly
      ? async (item) => {
          await perform((rpc) => rpc.call('tasks.savePlan', { id: target.id, stageId: item.stageId, requestId: item.requestId }))
        }
      : null,
    planNote: () => null,
    handoff: null,
    fork: null
  }
}

// The chat's items while the card shows it, kept current as the chat view keeps its own.
function useWatchedChat(conversationId: string | null): readonly ChatItem[] {
  const rpc = useCore((s) => s.rpc)
  useEffect(() => {
    if (!rpc || !conversationId) return
    let current = true
    rpc.call('conversations.watchChat', { id: conversationId }).then(
      (result) => current && setChatPage(conversationId, result),
      () => {}
    )
    return () => {
      current = false
      dropChat(conversationId)
      void rpc.call('conversations.unwatchChat', { id: conversationId }).catch(() => {})
    }
  }, [rpc, conversationId])
  return useChat((s) => (conversationId ? s[conversationId]?.items : undefined)) ?? NO_ITEMS
}

// The window at the top of the screen: what agents wait on while the user is in another app, one
// chat at a time, answered with the chat's own cards. It comes up when the main window asks and
// has something to show, and goes when all is answered, the user closes it, or main puts it away.
// Kept up always (the island setting), it stays small at the notch with the agents at work on
// one side and what waits on the other, and opens under the pointer: on the card when something
// waits, else on the agents at work.
export function RequestPopup() {
  useLocale((state) => state.locale)
  const wanted = useWanted()
  const island = useGeometry((s) => s.island)
  const notch = useGeometry((s) => s.notch)
  const islandSetting = usePreferences((s) => s.island)
  const always = island && islandSetting === 'always'
  const [hovered, setHovered] = useState(false)
  const [closed, setClosed] = useState(NONE_CLOSED)
  const [picked, setPicked] = useState<string | null>(null)
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const error = useCore((s) => s.error)
  const fontSize = usePreferences((s) => s.chatFontSize)
  const queue = useMemo(() => popupQueue({ tasks, conversations }, closed), [tasks, conversations, closed, getLocale()])
  const activity = useMemo(() => (always ? islandActivity({ tasks, conversations }) : []), [always, tasks, conversations, getLocale()])
  const at = Math.max(0, queue.findIndex((each) => each.conversationId === picked))
  const entry = wanted || (always && hovered) ? queue[at] : undefined
  const conversation = entry ? conversations[entry.conversationId] : undefined
  const items = useWatchedChat(entry?.conversationId ?? null)
  const pending = useMemo(
    () => items.filter((item): item is RequestItem => (item.kind === 'approval' || item.kind === 'question') && item.resolution === null),
    [items, getLocale()]
  )
  const tools = useMemo(() => new Map(items.flatMap((item) => (item.kind === 'tool' ? [[item.id, item] as const] : []))), [items, getLocale()])
  const state = useMemo(() => items.findLast((item): item is StateItem => item.kind === 'state') ?? null, [items, getLocale()])
  const roots = useMemo(
    () => (conversation ? (conversation.projectPaths.length ? conversation.projectPaths : [conversation.workspacePath]) : []),
    [conversation, getLocale()]
  )
  const shorten = useMemo(() => pathShortener(roots), [roots, getLocale()])
  const surface = useMemo(() => (entry ? popupSurface(entry, conversation) : null), [entry, conversation, getLocale()])

  useEffect(() => (error ? scheduleErrorToastDismiss(dismissError) : undefined), [error])

  // Up once there is something to answer; once up, kept while the next chat's items load, so
  // answering one chat does not flash the window down and up again on its way to the next. An
  // island kept up always is up whatever it shows at a notch, where with nothing to say it is
  // the notch and no more; floating on a display without one, it would be a stray black pill,
  // so there it is up only with something to say.
  const frame = useRef<HTMLDivElement>(null)
  const shown = useRef(false)
  const active = entry !== undefined && conversation !== undefined
  const ready = active && pending.length > 0
  const kept = always && (notch !== null || queue.length > 0 || activity.length > 0)
  const present = kept || active
  useLayoutEffect(() => {
    const node = frame.current
    if (!node || !(kept || (active && (ready || shown.current)))) {
      if (!active) shown.current = false
      layoutRequestPopup(false, 0)
      return
    }
    if (active) shown.current = true
    const report = () => layoutRequestPopup(true, node.getBoundingClientRect().height)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [kept, active, ready])

  // An island's window lets clicks through until the pointer is on the card, which keeps them
  // while the pointer stays, or something on it still has the keyboard (a reply being typed).
  // The pointer on it also opens an island kept up always.
  const card = useRef<HTMLDivElement>(null)
  const pointerOn = useRef(false)
  useEffect(() => {
    const node = card.current
    if (!node) return
    const enter = () => {
      pointerOn.current = true
      setHovered(true)
      setRequestPopupInteractive(true)
    }
    const leave = () => {
      pointerOn.current = false
      setHovered(false)
      if (!node.contains(document.activeElement)) setRequestPopupInteractive(false)
    }
    const focusLeft = (event: FocusEvent) => {
      if (!pointerOn.current && !(event.relatedTarget instanceof Node && node.contains(event.relatedTarget))) setRequestPopupInteractive(false)
    }
    const blurred = () => {
      if (!pointerOn.current) setRequestPopupInteractive(false)
    }
    node.addEventListener('mouseenter', enter)
    node.addEventListener('mouseleave', leave)
    node.addEventListener('focusout', focusLeft)
    window.addEventListener('blur', blurred)
    return () => {
      node.removeEventListener('mouseenter', enter)
      node.removeEventListener('mouseleave', leave)
      node.removeEventListener('focusout', focusLeft)
      window.removeEventListener('blur', blurred)
    }
  }, [present])

  // All answered: done until asked again. Asked for but nothing came up in time: the same.
  useEffect(() => {
    if (!wanted || queue.length > 0) return
    const timer = setTimeout(() => setWanted(false), shown.current ? 0 : GIVE_UP_MS)
    return () => clearTimeout(timer)
  }, [wanted, queue.length])

  if (!present) return <div ref={frame} />
  // With nothing to open on, the pointer leaves the island as it is: the ant at rest.
  const expanded = active || (hovered && activity.length > 0)
  // The folded island's leading ear: the agents of what its trailing ear speaks of, those
  // waiting on the user first, then those at work.
  const marks = [...new Set([
    ...queue.flatMap((each) => conversations[each.conversationId]?.agent ?? []),
    ...activity.map((each) => each.agent)
  ])].slice(0, EAR_MARKS)
  // Both fold the island at once, though the pointer is still on it from the click: it opens
  // again once the pointer leaves and comes back.
  const close = () => {
    setClosed(new Set([...closed, ...queue.map((each) => popupKey(each.conversationId, each.request))]))
    setWanted(false)
    setHovered(false)
  }
  const open = (target: ActionableTarget) => {
    setHovered(false)
    openFromRequestPopup(target)
  }
  const step = (by: number) => setPicked(queue[(at + by + queue.length) % queue.length]?.conversationId ?? null)
  return (
    <div ref={frame} className="request-popup-frame" data-expanded={expanded}>
      <div ref={card} className="island">
        {entry && conversation && surface
          ? (
              <section className="chat-view request-popup" data-font-size={fontSize} aria-label={t('ChatDock.requestsAwaitingYourResponse')}>
                <header className="request-popup-header">
                  <span className="request-popup-label" role="img" aria-label={popupLabel(entry.request)} title={popupLabel(entry.request)}>{KIND_ICON[popupKind(entry.request)]}</span>
                  <span className="request-popup-title" title={entry.title}>{entry.title}</span>
                  <span className="request-popup-agent" role="img" aria-label={agentLabel(conversation.agent)} title={agentLabel(conversation.agent)}><AgentIcon agent={conversation.agent} /></span>
                  <span className="request-popup-spacer" />
                  {queue.length > 1 && (
                    <span className="request-popup-pager">
                      <button type="button" className="request-popup-step" data-direction="previous" aria-label={t('ChatRequestCards.previous')} onClick={() => step(-1)}><ChevronRightIcon /></button>
                      <span className="request-popup-count">{at + 1} / {queue.length}</span>
                      <button type="button" className="request-popup-step" aria-label={t('ChatRequestCards.next')} onClick={() => step(1)}><ChevronRightIcon /></button>
                    </span>
                  )}
                  <button type="button" className="request-popup-open" aria-label={t('RequestPopup.openInAntumi')} title={t('RequestPopup.openInAntumi')} onClick={() => open(entry.target)}><PopInIcon /></button>
                  <button type="button" className="request-popup-close" aria-label={t('RequestPopup.collapseShowAgainForNewRequests')} title={t('RequestPopup.collapseShowAgainForNewRequests')} onClick={close}><CloseIcon /></button>
                </header>
                {error && <p className="request-popup-error" role="alert">{error}</p>}
                <ChatSurfaceContext.Provider value={surface}>
                  <ChatPaths.Provider value={shorten}>
                    <ChatRoots.Provider value={roots}>
                      {pending.length > 0
                        ? <PendingRequests conversation={conversation} pending={pending} tools={tools} modes={state?.permissionModes ?? []} />
                        : <p className="request-popup-loading">{t('DashboardPanel.loading')}</p>}
                    </ChatRoots.Provider>
                  </ChatPaths.Provider>
                </ChatSurfaceContext.Provider>
              </section>
            )
          : expanded
            ? <Activity entries={activity} onOpen={open} />
            : <Compact waiting={queue.length} activity={activity} agents={marks} />}
      </div>
    </div>
  )
}

// The island folded: the agents' marks on one side of the notch, and on the other what waits on
// the user, else how many are at work; with nothing to say, the ant at rest and its mood.
function Compact({ waiting, activity, agents }: { waiting: number; activity: readonly ActivityEntry[]; agents: readonly AgentKind[] }) {
  const notch = useGeometry((s) => s.notch)
  // At rest the ant keeps the notch company, with a mood that turns with the hour.
  const idle = waiting === 0 && activity.length === 0
  const mood = antMood(new Date().getHours())
  return (
    <div className="island-compact" data-idle={idle}>
      <span className="island-ear island-ear-leading">
        {idle
          ? <AntHead asleep={mood === 'sleep'} />
          : agents.map((agent) => <span key={agent} className="island-mark" role="img" aria-label={agentLabel(agent)}><AgentIcon agent={agent} /></span>)}
      </span>
      {notch && <span className="island-notch" aria-hidden="true" />}
      <span className="island-ear island-ear-trailing">
        {waiting > 0
          ? <span className="island-badge" data-tone="accent">{t('RequestPopup.waitingOnYou', { count: waiting })}</span>
          : activity.length > 0
            ? <span className="island-badge">{t('RequestPopup.agentsWorking', { count: activity.length })}</span>
            : idle && <AntMoodMark mood={mood} />}
      </span>
    </div>
  )
}

// The island open with nothing to answer: each agent at work, leading to its chat in the window.
function Activity({ entries, onOpen }: { entries: readonly ActivityEntry[]; onOpen: (target: ActionableTarget) => void }) {
  return (
    <section className="island-activity" aria-label={t('RequestPopup.agentsAtWork')}>
      {entries.map((entry) => (
        <button key={entry.conversationId} type="button" className="island-row" onClick={() => onOpen(entry.target)}>
          <span className="island-mark"><AgentIcon agent={entry.agent} /></span>
          <span className="island-row-title">{entry.title}</span>
          <span className="island-row-state">{t('TaskActivity.running')}</span>
        </button>
      ))}
    </section>
  )
}
