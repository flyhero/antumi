import { useEffect, useRef, useState } from 'react'
import { agentCallOpen, type AgentCall, type Conversation } from '@antumi/protocol'
import { openGit, perform, showError, useCore } from '../core-store'
import { callModelText, worktreeStatusText } from '../delegation-worktree'
import { t } from '../i18n'
import { chatDayAndTime } from '../labels'
import { ProfileAvatar } from './AgentAvatar'
import { openAgentCall, useAgentCalls } from '../agent-calls'
import './agent-calls.css'

export function AgentCalls({ conversation }: { conversation: Conversation }) {
  const { calls, error } = useAgentCalls(conversation.id)
  const [cancelling, setCancelling] = useState<string[]>([])
  const parentId = conversation.id
  const cancel = async (call: AgentCall) => {
    setCancelling((items) => [...items, call.id])
    await perform((rpc) => rpc.call('agentCalls.cancel', { id: parentId, callId: call.id }))
    setCancelling((items) => items.filter((id) => id !== call.id))
  }
  const focus = useCore((state) => state.agentCallFocus)
  const gitProjects = useCore((state) => state.rpc?.features.includes('git-projects') ?? false)
  const [copied, setCopied] = useState<string | null>(null)
  const copyBranch = async (call: AgentCall) => {
    if (!call.worktree) return
    try { await navigator.clipboard.writeText(call.worktree.branch); setCopied(call.id); setTimeout(() => setCopied((current) => current === call.id ? null : current), 2000) } catch { showError(t('fileActions.copyFailedTryAgain')) }
  }
  const list = useRef<HTMLOListElement>(null)
  // A card's 详情 brings its record into view.
  useEffect(() => {
    if (focus) list.current?.querySelector(`[data-call-id="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focus, calls?.length])
  const working = calls?.filter(agentCallOpen).length ?? 0
  const ordered = [...(calls ?? [])].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  return <section className="delegation-panel" aria-label={t('AgentProfiles.calls')}>
    <header className="delegation-panel-header"><strong>{t('AgentProfiles.history')}</strong><span className="muted">{calls?.length ?? 0}{working > 0 && ` · ${t('AgentProfiles.running')} ${working}`}</span></header>
    {error && <p className="inspector-empty" role="alert">{error}</p>}
    {!error && calls === null && <p className="inspector-empty muted">{t('AgentProfiles.loadingCalls')}</p>}
    {calls?.length === 0 && <p className="inspector-empty muted">{t('AgentProfiles.noCalls')}</p>}
    {ordered.length > 0 && <ol ref={list} className="delegation-list" aria-label={t('AgentProfiles.history')}>
    {ordered.map((call) => <li className="delegation-item" key={call.id} data-call-id={call.id} data-focused={call.id === focus || undefined}>
      <article className="delegation-record">
      <div className="delegation-record-head"><ProfileAvatar profile={call.profile} /><strong>{call.profile.name}</strong>{callModelText(call) && <span className="delegation-model muted">{callModelText(call)}</span>}<span className="delegation-status" data-state={call.state}>{t(`AgentProfiles.${call.state}`)}</span></div>
      <time className="muted" dateTime={new Date(call.createdAt).toISOString()}>{chatDayAndTime(call.createdAt)}</time>
      <details className="delegation-instruction"><summary title={call.instruction}>{call.instruction.split('\n').filter((line) => line.trim()).slice(0, 2).join(' · ')}</summary><p>{call.instruction}</p></details>
      {(() => { const worktree = worktreeStatusText(call); return worktree && <p className="delegation-worktree" data-warn={worktree.warn || undefined}><span className="delegation-badge">{t('AgentProfiles.worktreeBadge')}</span>{call.worktree && <span className="mono" title={call.worktree.dir}>{call.worktree.branch}</span>}{worktree.text && <span>{worktree.text}</span>}</p> })()}
      {call.result && <details key={`result:${call.id === focus}`} className="delegation-result" open={call.id === focus || undefined}><summary>{t('AgentProfiles.result')}</summary><p>{call.result}</p></details>}
      {call.error && <p className="modal-error" role="status">{call.error}</p>}
      <footer className="delegation-record-actions">
        {call.state !== 'queued' && call.state !== 'starting' && <button type="button" className="link-button" onClick={() => void openAgentCall(call)}>{t('AgentProfiles.openConversation')}</button>}
        {call.worktree && <button type="button" className="link-button" onClick={() => void copyBranch(call)}>{copied === call.id ? t('AgentProfiles.branchCopied') : t('AgentProfiles.copyBranch')}</button>}
        {call.worktree && gitProjects && <button type="button" className="link-button" onClick={() => openGit(call.worktree?.source)}>{t('GitPage.openInGit')}</button>}
        {agentCallOpen(call) && <button type="button" className="link-button" disabled={cancelling.includes(call.id)} onClick={() => void cancel(call)}>{t('AgentProfiles.cancelCall')}</button>}
      </footer>
      </article>
    </li>)}
    </ol>}
  </section>
}
