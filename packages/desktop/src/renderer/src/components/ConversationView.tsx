import { useAgentCalls, useAgentCallsSupported } from '../agent-calls'
import { t, tr } from '../i18n'
import { RouteBadge } from './RouteBadge'
import { useHelper, useHelperSupported } from '../helper-conversations'
import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { usePlans } from '../chat-state'
import { markRoutineRunSeen, openBeside, openOverview, selectConversation, selectDiscussion, setConversationInspectorOpen, setRoutinesOpen, useCore, useWireLogShown } from '../core-store'
import { conversationState } from '../conversation-state'
import { agentLabel } from '../labels'
import { primaryProjectName } from './ProjectPicker'
import { BranchStatus } from './BranchStatus'
import { SourceLink } from './SourceLink'
import { ConversationChat } from './ConversationChat'
import { ConversationInspector } from './ConversationInspector'
import { ConversationStatus } from './ConversationStatus'
import { beginHandoff, newConversationFrom, renameConversation, useReuseConversationSupported } from './ConversationActions'
import { CloseIcon, CopyIcon, InspectorIcon, SplitIcon } from './icons'
import { useShortcutLabel } from '../keyboard-shortcuts'
import { DEFAULT_SIDE_PANEL_RATIO } from './side-panel-size'
import { TitleEditor } from './TitleEditor'
import { useOpenTodoCount, useTodosShown } from '../conversation-todos'
import { CONVERSATION_DRAG_TYPE, draggedConversation } from '../conversation-drag'
import type { ConversationPane } from './conversation-pane'
import { canReuseConversation, type AgentKind, type Conversation } from '@antumi/protocol'

// Where a fork came from: a way back while the source is still here.
function ForkOrigin({ id }: { id: string }) {
  const source = useCore((state) => state.conversations[id])
  return (
    <span className="muted conversation-origin">
      {source
        ? <>{tr('ConversationView.forkedFrom', { value1: <button type="button" className="link-button" onClick={() => selectConversation(id)}>{source.title}</button> })}</>
        : t('ConversationView.forkedFromADeletedConversation')}
    </span>
  )
}

// Whether the conversation has anything for the inspector to show, and what its button says.
export function useConversationPanel(conversation: Conversation | undefined) {
  const id = conversation?.id ?? ''
  const delegationSupported = useAgentCallsSupported(conversation)
  const { calls } = useAgentCalls(delegationSupported ? id : null)
  const helperSupported = useHelperSupported(conversation)
  const helper = useHelper(helperSupported ? id : null)
  const plans = usePlans(id)
  const wire = useWireLogShown()
  const todosShown = useTodosShown()
  const todoLeft = useOpenTodoCount(todosShown && conversation ? id : null)
  // A managed workspace is Antumi's own scratch folder: nothing of the user's to compare, but the
  // inspector still shows the agent's plans.
  const inspectable = (conversation?.projectPaths.length ?? 0) > 0
  const hasPanel = Boolean(calls?.length || helper || inspectable || plans.length > 0 || wire || todosShown)
  const hint = todoLeft > 0 ? t('ConversationView.inspectorToDos', { todoLeft: todoLeft }) : inspectable ? t('ConversationView.viewChanges') : plans.length > 0 ? t('ConversationView.viewPlan') : wire ? t('ConversationView.viewRawData') : t('chatTools.listToDos')
  return { hasPanel, wire, todoLeft, hint }
}

// One conversation: the whole pane, or, in a split, one of its two columns (pane), whose header
// says which and closes the column rather than the conversation. A split's inspector is its own.
export function ConversationView({ id, pane }: { id: string; pane?: ConversationPane & { onClose: () => void } }) {
  const paneKey = useShortcutLabel(pane?.index === 1 ? 'focus-right' : 'focus-left')
  const conversation = useCore((state) => state.conversations[id])
  const helperSupported = useHelperSupported(conversation)
  const helper = useHelper(helperSupported ? id : null)
  // Stable, so the chat's surface is not rebuilt on every render.
  const openHandoff = useCallback((agent?: AgentKind) => {
    const current = useCore.getState().conversations[id]
    if (current) beginHandoff(current, agent)
  }, [id])
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const reuseSupported = useReuseConversationSupported()
  const inspectorOpen = useCore((state) => state.conversationInspectorOpen)
  const [panelRatio, setPanelRatio] = useState(DEFAULT_SIDE_PANEL_RATIO)
  const { hasPanel, wire, todoLeft, hint } = useConversationPanel(conversation)
  // A conversation dragged from the list over the right half opens there, beside this one.
  const [dropping, setDropping] = useState(false)
  const routine = useCore((state) => state.routines.find((each) => each.id === conversation?.routineId) ?? null)
  const discussion = useCore((state) => (conversation?.discussionId ? state.discussions[conversation.discussionId] : undefined) ?? null)
  const routineId = conversation?.routineId ?? null
  const turn = conversation?.chat?.turn ?? null
  // Looking at a routine's conversation, with the window in front, is looking at its run: when
  // it opens, when the window comes back, and when the run ends while it is in view.
  useEffect(() => {
    if (!routineId) return
    const look = () => { if (document.hasFocus()) markRoutineRunSeen(id) }
    look()
    window.addEventListener('focus', look)
    return () => window.removeEventListener('focus', look)
  }, [id, routineId, turn])
  if (!conversation) return null
  // The agent starts with the next message and goes when idle: no continue or stop to press.
  const state = conversationState(conversation)
  const archived = conversation.archivedAt != null
  const action = async (run: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    await run()
    setBusy(false)
  }
  const rename = (title: string) => void action(() => renameConversation(id, title))
  const inspecting = inspectorOpen && (!pane || pane.active)
  const dropProps = pane ? {} : {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(CONVERSATION_DRAG_TYPE) || draggedConversation() === id) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (!dropping) setDropping(true)
    },
    onDragLeave: (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDropping(false)
    },
    onDrop: (event: DragEvent) => {
      const dropped = event.dataTransfer.getData(CONVERSATION_DRAG_TYPE)
      setDropping(false)
      if (dropped && dropped !== id) {
        event.preventDefault()
        openBeside(dropped)
      }
    }
  }
  return <section
    className="detail terminal-view conversation-view"
    aria-label={pane ? t('ConversationView.pane', { value1: pane.index + 1, value2: conversation.title }) : t('ConversationView.conversation', { value1: conversation.title })}
    data-split-pane={pane ? pane.index + 1 : undefined}
    data-pane-active={pane ? pane.active : undefined}
    // Working anywhere in a column brings it to the front, the click or key going on as it was.
    onPointerDownCapture={pane && !pane.active ? pane.focus : undefined}
    onFocusCapture={pane && !pane.active ? pane.focus : undefined}
    {...dropProps}
  >
    <header className="detail-header conversation-header">
      {pane && <button type="button" className="pane-chip" data-active={pane.active} aria-label={[t('ConversationView.paneLabel', { number: pane.index + 1, active: pane.active ? t('ConversationView.active') : '' }), paneKey].filter(Boolean).join(' · ')} data-tooltip={paneKey || undefined} onClick={pane.focus}>{pane.index + 1}</button>}
      <ConversationStatus conversation={conversation} />
      <div className="header-meta">
        {renaming
          ? <TitleEditor title={conversation.title} label={t('ConversationList.conversationTitle')} onSave={rename} onDone={() => setRenaming(false)} />
          : <button type="button" className="terminal-view-title conversation-title" title={t('ConversationView.clickToRename', { value1: conversation.title })} disabled={busy} onClick={() => setRenaming(true)}>{conversation.title}</button>}
        <span className="muted">{agentLabel(conversation.agent)}</span>
        <RouteBadge conversation={conversation} />
        <span className="muted" title={conversation.projectPaths.join('\n') || conversation.workspacePath}>{primaryProjectName(conversation.projectPaths)}</span>
        <BranchStatus target={{ kind: 'conversation', id }} updatedAt={conversation.updatedAt} />
        <span className={state.failed ? 'conversation-exit-failed' : 'muted'} title={state.detail ?? undefined}>{state.label}</span>
        {archived && <span className="archived-tag">{t('ConversationList.archived')}</span>}
        {conversation.parentConversationId && <button type="button" className="link-button" onClick={() => selectConversation(conversation.parentConversationId ?? null)}>{t('AgentProfiles.parent')}</button>}
        {conversation.profile && <span className="muted">{conversation.profile.name}</span>}
        {conversation.forkedFromId && <ForkOrigin id={conversation.forkedFromId} />}
        {conversation.source && <span className="muted conversation-origin">{tr('ConversationView.investigate', { value1: conversation.source.name, value2: <SourceLink source={conversation.source} /> })}</span>}
        {conversation.routineId && (
          <span className="muted conversation-origin">{tr('ConversationView.fromRoutine', { value1: routine ? `「${routine.title}」` : '', value2: <button type="button" className="link-button" onClick={() => setRoutinesOpen(true, 'routines')}>{t('ConversationView.backToRoutine')}</button> })}</span>
        )}
        {conversation.discussionId && (
          <span className="muted conversation-origin" title={t('ConversationView.messagesSentHereGoOnlyToThisMember')}>{tr('ConversationView.memberOfGroupChat', { value1: discussion ? `「${discussion.title}」` : '', value2: <button type="button" className="link-button" onClick={() => conversation.discussionId && selectDiscussion(conversation.discussionId)}>{t('ConversationView.backToGroupChat')}</button> })}</span>
        )}
      </div>
      <div className="toolbar">
        {reuseSupported && canReuseConversation(conversation) && <button type="button" className="tool-button" aria-label={t('ConversationActions.newWithSameConfiguration')} data-tooltip={t('ConversationView.startABlankConversationWithTheCurrentConfiguration')} disabled={busy} onClick={() => void action(() => newConversationFrom(conversation))}><CopyIcon /></button>}
        {hasPanel && (
          <button
            type="button"
            className="tool-button"
            aria-label={todoLeft > 0 ? t('ConversationView.inspectorToDos_739', { todoLeft: todoLeft }) : t('ConversationView.inspector')}
            aria-pressed={inspecting}
            data-tooltip={inspecting ? t('ConversationView.collapseInspector') : hint}
            onClick={() => setConversationInspectorOpen(!inspecting)}
          >
            <InspectorIcon />
            {helper?.chat?.turn === 'awaiting' && <span className="helper-attention-dot tool-button-dot" role="img" aria-label={t('ConversationView.helperNeedsYourResponse')} />}
            {!inspecting && todoLeft > 0 && <span className="tool-button-badge" aria-hidden="true">{todoLeft}</span>}
          </button>
        )}
        <span className="toolbar-separator" aria-hidden="true" />
        {pane
          ? <button type="button" className="tool-button" aria-label={t('ConversationView.closeThisPane')} data-tooltip={t('ConversationView.closeThisPane')} onClick={pane.onClose}><CloseIcon /></button>
          : <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={openOverview}><CloseIcon /></button>}
      </div>
    </header>
    <div className="terminal-body">
      <ConversationChat conversation={conversation} onHandoff={conversation.discussionId || conversation.parentConversationId ? undefined : openHandoff} />
      {!pane && hasPanel && inspectorOpen && <ConversationInspector conversation={conversation} widthRatio={panelRatio} onWidthRatioChange={setPanelRatio} wire={wire} />}
    </div>
    {dropping && <div className="split-drop" aria-hidden="true"><SplitIcon /><strong>{t('ConversationView.releaseToOpenInARightSplitPane')}</strong></div>}
  </section>
}
