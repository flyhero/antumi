import { getLocale, useLocale, t } from '../i18n'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import { create } from 'zustand'
import type { ChatItem, Conversation } from '@antumi/protocol'
import { dropChat, pathShortener, setChatPage, useChat } from '../chat-state'
import { dismissError, perform, useCore } from '../core-store'
import { layoutRequestPopup, onRequestPopupGeometry, onRequestPopupWanted, openFromRequestPopup, setRequestPopupInteractive } from '../desktop-bridge'
import { agentLabel } from '../labels'
import { usePreferences } from '../preferences'
import { popupKey, popupKind, popupLabel, popupQueue, type PopupEntry, type PopupKind } from '../request-popup'
import { ChatSurfaceContext, type ChatSurface } from './chat-surface'
import { PendingRequests } from './ChatDock'
import { ChatRoots } from './ChatMarkdown'
import type { RequestItem } from './ChatRequestCards'
import { ChatPaths } from './ChatToolCard'
import { scheduleErrorToastDismiss } from './ErrorToast'
import { AgentIcon, ChevronRightIcon, CloseIcon, DocumentIcon, HelpIcon, LockIcon, PopInIcon } from './icons'

type StateItem = Extract<ChatItem, { kind: 'state' }>

const NO_ITEMS: readonly ChatItem[] = []
const NONE_CLOSED: ReadonlySet<string> = new Set()
// Asked for, with nothing to show by then (answered in the meantime): the card stays down.
const GIVE_UP_MS = 5000
// The header's mark of what is asked: the words are its label, for the pointer and a reader.
const KIND_ICON: Record<PopupKind, JSX.Element> = { question: <HelpIcon />, plan: <DocumentIcon />, permission: <LockIcon /> }

// Whether the main window wants the card up. Followed from the page's start: main says so as soon
// as the page loads, which may be before React has mounted anything to hear it.
const useWanted = create<boolean>()(() => false)
const setWanted = (wanted: boolean) => useWanted.setState(wanted, true)

export function followRequestPopup(): void {
  onRequestPopupWanted(setWanted)
  // How the card is drawn (styles.css): an island, joined to the notch when there is one.
  onRequestPopupGeometry(({ island, notch }) => {
    const root = document.documentElement
    if (island) root.dataset.island = notch ? 'notch' : 'floating'
    else delete root.dataset.island
    root.style.setProperty('--notch-width', `${notch?.width ?? 0}px`)
    root.style.setProperty('--notch-height', `${notch?.height ?? 0}px`)
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
export function RequestPopup() {
  useLocale((state) => state.locale)
  const wanted = useWanted()
  const [closed, setClosed] = useState(NONE_CLOSED)
  const [picked, setPicked] = useState<string | null>(null)
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const error = useCore((s) => s.error)
  const fontSize = usePreferences((s) => s.chatFontSize)
  const queue = useMemo(() => popupQueue({ tasks, conversations }, closed), [tasks, conversations, closed, getLocale()])
  const at = Math.max(0, queue.findIndex((each) => each.conversationId === picked))
  const entry = wanted ? queue[at] : undefined
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
  // answering one chat does not flash the window down and up again on its way to the next.
  const frame = useRef<HTMLDivElement>(null)
  const shown = useRef(false)
  const active = entry !== undefined
  const ready = active && pending.length > 0
  useLayoutEffect(() => {
    const node = frame.current
    if (!active || !node || !(ready || shown.current)) {
      if (!active) shown.current = false
      layoutRequestPopup(false, 0)
      return
    }
    shown.current = true
    const report = () => layoutRequestPopup(true, node.getBoundingClientRect().height)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [active, ready])

  // An island's window lets clicks through until the pointer is on the card, which keeps them
  // while the pointer stays, or something on it still has the keyboard (a reply being typed).
  const card = useRef<HTMLElement>(null)
  const pointerOn = useRef(false)
  useEffect(() => {
    const node = card.current
    if (!node) return
    const enter = () => {
      pointerOn.current = true
      setRequestPopupInteractive(true)
    }
    const leave = () => {
      pointerOn.current = false
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
  }, [active])

  // All answered: done until asked again. Asked for but nothing came up in time: the same.
  useEffect(() => {
    if (!wanted || queue.length > 0) return
    const timer = setTimeout(() => setWanted(false), shown.current ? 0 : GIVE_UP_MS)
    return () => clearTimeout(timer)
  }, [wanted, queue.length])

  if (!entry || !conversation || !surface) return <div ref={frame} />
  const close = () => {
    setClosed(new Set([...closed, ...queue.map((each) => popupKey(each.conversationId, each.request))]))
    setWanted(false)
  }
  const step = (by: number) => setPicked(queue[(at + by + queue.length) % queue.length]?.conversationId ?? null)
  return (
    <div ref={frame} className="request-popup-frame">
      <section ref={card} className="chat-view request-popup" data-font-size={fontSize} aria-label={t('ChatDock.requestsAwaitingYourResponse')}>
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
          <button type="button" className="request-popup-open" aria-label={t('RequestPopup.openInAntumi')} title={t('RequestPopup.openInAntumi')} onClick={() => openFromRequestPopup(entry.target)}><PopInIcon /></button>
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
    </div>
  )
}
