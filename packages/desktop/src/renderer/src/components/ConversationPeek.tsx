import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type { Conversation, ProjectBranches } from '@antumi/protocol'
import { useCore } from '../core-store'
import { conversationState, timeAgo } from '../conversation-state'
import { getLocale, t } from '../i18n'
import { agentLabel } from '../labels'
import { conversationActivity } from '../work-activity'
import { AgentIcon } from './icons'

const OPEN_DELAY_MS = 500
const CLOSE_DELAY_MS = 100

type Peek = { id: string; row: DOMRect }

// Which row the pointer rests on, once it has rested a moment; moving on to the next row while
// one is open shows that one at once, as tooltips do. A scroll moves the rows from under it, and
// typing means the user is at work elsewhere, the pointer only left where it was.
export function useConversationPeek(): { peek: Peek | null; rowProps: (id: string) => { onPointerEnter: (event: PointerEvent<HTMLElement>) => void; onPointerLeave: () => void; onPointerDown: () => void } } {
  const [peek, setPeek] = useState<Peek | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const later = (next: Peek | null, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPeek(next), delay)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!peek) return
    const close = () => setPeek(null)
    document.addEventListener('scroll', close, true)
    document.addEventListener('keydown', close, true)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', close, true)
      window.removeEventListener('blur', close)
    }
  }, [peek])
  return {
    peek,
    rowProps: (id) => ({
      onPointerEnter: (event) => later({ id, row: event.currentTarget.getBoundingClientRect() }, peek ? 0 : OPEN_DELAY_MS),
      onPointerLeave: () => later(null, CLOSE_DELAY_MS),
      onPointerDown: () => later(null, 0)
    })
  }
}

// The branch its agent works on, asked for when the details open: no list keeps it.
function useBranch(conversation: Conversation): ProjectBranches | null | undefined {
  const rpc = useCore((s) => s.rpc)
  const path = conversation.projectPaths.length > 0 ? conversation.workspacePath : null
  const [found, setFound] = useState<ProjectBranches | null | undefined>(undefined)
  useEffect(() => {
    if (!rpc || !path) return setFound(null)
    let current = true
    // Not through perform: details that cannot say leave the branch out.
    rpc.call('projects.branches', { path }).then((next) => current && setFound(next), () => current && setFound(null))
    return () => { current = false }
  }, [rpc, path])
  return found
}

function when(at: number): string {
  return new Date(at).toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// What a conversation's row leaves out, beside it: the whole title, who works where and on which
// branch, and since when. Shown in the top layer, over whatever the row sits next to, and never in
// the pointer's way.
export function ConversationPeek({ conversation, row }: { conversation: Conversation; row: DOMRect }) {
  const panel = useRef<HTMLDivElement>(null)
  const branch = useBranch(conversation)
  const activity = conversationActivity(conversation, conversation.agent)
  const state = activity?.detail ?? conversationState(conversation).label
  const worktree = !conversation.managedWorkspace && conversation.projectPaths.length > 0 && conversation.workspacePath !== conversation.projectPaths[0]
  const model = conversation.chatOptions?.model

  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    element.popover = 'manual'
    element.showPopover()
    const place = () => {
      const { clientWidth, clientHeight } = document.documentElement
      const size = element.getBoundingClientRect()
      const right = row.right + 8
      const left = right + size.width <= clientWidth - 8 ? right : Math.max(8, row.left - 8 - size.width)
      Object.assign(element.style, { left: `${left}px`, top: `${Math.min(Math.max(8, row.top), clientHeight - 8 - size.height)}px` })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    return () => {
      observer.disconnect()
      element.hidePopover()
    }
  }, [row])

  return (
    <div ref={panel} className="conversation-peek" role="tooltip" aria-label={t('ConversationPeek.details')}>
      <div className="conversation-peek-title">{conversation.title}</div>
      <dl>
        <dt>{t('ConversationPeek.agent')}</dt>
        <dd className="conversation-peek-agent">
          <AgentIcon agent={conversation.agent} />
          <span>{[agentLabel(conversation.agent), conversation.profile?.name, model].filter(Boolean).join(' · ')}</span>
        </dd>
        <dt>{t('ConversationPeek.status')}</dt>
        <dd className="conversation-live" data-state={activity?.state}>{state}</dd>
        <dt>{t('ConversationPeek.projects')}</dt>
        <dd>{conversation.projectPaths.length > 0
          ? conversation.projectPaths.map((path) => <span key={path} className="conversation-peek-path" dir="ltr">{path}</span>)
          : <span className="muted">{t('ConversationPeek.noProject')}</span>}</dd>
        {worktree && <>
          <dt>{t('ConversationPeek.workspace')}</dt>
          <dd><span className="conversation-peek-path" dir="ltr">{conversation.workspacePath}</span></dd>
        </>}
        {branch?.git && <>
          <dt>{t('ConversationPeek.branch')}</dt>
          <dd>
            <span className="conversation-peek-path" dir="ltr">{branch.branch ?? t('ConversationPeek.detached')}</span>
            {branch.changes > 0 && <span className="muted">{t('ConversationPeek.changes', { count: branch.changes })}</span>}
          </dd>
        </>}
        <dt>{t('ConversationPeek.time')}</dt>
        <dd>{t('ConversationPeek.createdUpdated', { created: when(conversation.createdAt), updated: timeAgo(conversation.updatedAt, Date.now()) })}</dd>
      </dl>
    </div>
  )
}
