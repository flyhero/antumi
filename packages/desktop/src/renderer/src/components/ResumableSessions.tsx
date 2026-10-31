import { useState } from 'react'
import type { AgentKind, ExternalSession } from '@antumi/protocol'
import { getLocale, t } from '../i18n'
import { agentLabel, agoText } from '../labels'
import { resumeSession } from '../external-sessions'
import { AgentIcon } from './icons'
import { projectName } from './ProjectPicker'
import './resumable-sessions.css'

export function resumableSummary(count: number, agents: readonly AgentKind[]): string {
  const labels = agents.map((agent) => agentLabel(agent))
  // Chinese puts spaces around 和 between Latin names; Intl.ListFormat does not.
  const names = getLocale() === 'en' || labels.length < 2 ? new Intl.ListFormat('en', { type: 'conjunction' }).format(labels) : `${labels.slice(0, -1).join('、')} 和 ${labels.at(-1)}`
  return t('ResumableSessions.found', { count, agents: names })
}

// Sessions run in a terminal, each one click from going on as a conversation here.
export function ResumableSessionList({ sessions, onResumed }: { sessions: readonly ExternalSession[]; onResumed?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const resume = async (session: ExternalSession) => {
    setBusy(session.sessionId)
    try {
      if (await resumeSession(session)) onResumed?.()
    } finally {
      setBusy(null)
    }
  }
  return (
    <ul className="resumable-sessions">
      {sessions.map((session) => (
        <li key={`${session.agent}:${session.sessionId}`} className="resumable-session">
          <span className="overview-avatar" title={agentLabel(session.agent)}><AgentIcon agent={session.agent} /></span>
          <span className="resumable-session-main">
            <span className="resumable-session-title" title={session.firstPrompt}>{session.title}</span>
            <span className="resumable-session-meta"><span title={session.cwd}>{projectName(session.cwd)}</span><span>{agoText(session.updatedAt)}</span>{session.source === 'desktop' && <span>{t('SessionImportSettings.desktop')}</span>}{session.continuation === 'handoff' && <span title={t('SessionImportSettings.handoffHint')}>{t('SessionImportSettings.handoff')}</span>}</span>
          </span>
          <button type="button" className="button" disabled={busy !== null} aria-label={t('ResumableSessions.resumeLabel', { title: session.title })} onClick={() => void resume(session)}>
            {t(busy === session.sessionId ? 'ResumableSessions.resuming' : 'ResumableSessions.resume')}
          </button>
        </li>
      ))}
    </ul>
  )
}
