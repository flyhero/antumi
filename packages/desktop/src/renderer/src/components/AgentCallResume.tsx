import { useEffect, useId, useRef, useState } from 'react'
import type { AgentCall, AgentCallResumeCheck, Conversation } from '@antumi/protocol'
import { showAgentCalls } from '../agent-calls'
import { useOccludesBrowser } from '../browser-occlusion'
import { perform, useCore } from '../core-store'
import { localized, t } from '../i18n'
import { DelegationDialog } from './AgentDelegation'
import { CloseIcon, WarningIcon } from './icons'

const BLOCKED: Record<NonNullable<AgentCallResumeCheck['blocker']>, string> = localized(() => ({
  open: t('AgentCallResume.blockedOpen'),
  completed: t('AgentCallResume.blockedCompleted'),
  'not-started': t('AgentCallResume.blockedNotStarted'),
  limit: t('AgentCallResume.blockedLimit'),
  'read-only': t('AgentCallResume.blockedReadOnly'),
  'parent-gone': t('AgentCallResume.blockedParentGone'),
  quota: t('AgentCallResume.blockedQuota'),
  gone: t('AgentCallResume.blockedGone')
}))

// The task a call was sent with, to send again: its agent by profile where that is still one of the
// user's, else as it is.
function delegatedAgain(call: AgentCall, profiles: Readonly<Record<string, unknown>>): { target: string; goal: string } {
  return { target: profiles[call.profile.id] ? call.profile.id : `agent:${call.profile.agent}`, goal: call.instruction }
}

// Going on with a call that stopped short, once the user has weighed what changed since: how many
// turns the conversation took, and whether a later call already did the work. They may add a word
// for the agent, or send the task again fresh instead.
function ResumeDialog({ call, conversation, onClose, onAgain }: { call: AgentCall; conversation: Conversation; onClose(): void; onAgain(): void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const rpc = useCore((s) => s.rpc)
  const [check, setCheck] = useState<AgentCallResumeCheck | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useEffect(() => {
    if (!rpc) return
    let current = true
    void perform((each) => each.call('agentCalls.resumeCheck', { id: conversation.id, callId: call.id })).then((found) => { if (current && found) setCheck(found) })
    return () => { current = false }
  }, [rpc, conversation.id, call.id])
  const resume = async () => {
    if (busy || !check || check.blocker) return
    setBusy(true)
    const resumed = await perform((each) => each.call('agentCalls.resume', { id: conversation.id, callId: call.id, ...(note.trim() ? { note: note.trim() } : {}) }))
    setBusy(false)
    if (resumed) onClose()
  }
  return <dialog ref={dialog} className="modal delegation-dialog agent-call-resume" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void resume() }}>
      <header className="modal-header"><h2 id={titleId}>{t('AgentCallResume.title', { name: call.profile.name })}</h2><button type="button" className="icon-button modal-close" aria-label={t('BackdropPicker.close')} disabled={busy} onClick={onClose}><CloseIcon /></button></header>
      <p className="delegation-hint muted">{t('AgentCallResume.hint')}</p>
      {!check ? <p className="muted">{t('DashboardPanel.loading')}</p> : check.blocker ? (
        <p className="agent-call-resume-warning"><WarningIcon />{BLOCKED[check.blocker]}</p>
      ) : (
        <>
          {check.turnsSince > 0 && <p className="agent-call-resume-warning"><WarningIcon />{t('AgentCallResume.turnsSince', { count: check.turnsSince })}</p>}
          {check.redoneBy && <p className="agent-call-resume-warning"><WarningIcon />{t('AgentCallResume.redone')}</p>}
          <label className="delegation-field">{t('AgentCallResume.note')}<textarea className="input" autoFocus rows={3} maxLength={4000} placeholder={t('AgentCallResume.notePlaceholder')} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} /></label>
        </>
      )}
      <footer className="modal-footer">
        <button type="button" className="link-button delegation-history" disabled={busy} onClick={onAgain}>{t('AgentCallResume.again')}</button>
        <button type="button" className="button ghost" disabled={busy} onClick={onClose}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={busy || !check || check.blocker !== null}>{busy ? t('AgentProfiles.starting') : t('AgentCallResume.resume')}</button>
      </footer>
    </form>
  </dialog>
}

// The way back into a call that stopped short, from where its card is: go on with it, or send the
// task again in a fresh conversation.
export function AgentCallResume({ call, inspector }: { call: AgentCall; inspector: 'task' | 'conversation' }) {
  const conversation = useCore((s) => s.conversations[call.parentId])
  const profiles = useCore((s) => s.agentProfiles)
  const [step, setStep] = useState<'closed' | 'resume' | 'again'>('closed')
  if (!conversation) return null
  return <>
    <button type="button" className="link-button" onClick={() => setStep('resume')}>{t('AgentCallResume.resume')}</button>
    {step === 'resume' && <ResumeDialog call={call} conversation={conversation} onClose={() => setStep('closed')} onAgain={() => setStep('again')} />}
    {step === 'again' && <DelegationDialog conversation={conversation} initial={delegatedAgain(call, profiles)} onClose={() => setStep('closed')} onHistory={() => showAgentCalls(inspector)} />}
  </>
}
