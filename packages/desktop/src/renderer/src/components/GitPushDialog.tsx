import { useEffect, useId, useRef, useState } from 'react'
import { trackedBranch, type GitOutgoing, type GitStatus, type GitTarget } from '@antumi/protocol'
import { getLocale, t } from '../i18n'
import { useCore } from '../core-store'
import { setPreference, usePreferences } from '../preferences'
import { useOccludesBrowser } from '../browser-occlusion'
import { projectName } from './ProjectPicker'

const SHOWN = 5

// Where a push goes, as IntelliJ's Push Commits shows it: the branch → remote : target, the target
// its upstream's by default and editable, and the commits that would go. A target of another name
// than the branch is called out, since a slip there pushes the work into someone else's branch.
export function GitPushDialog({ target, status, busy, push, close }: {
  target: GitTarget
  status: GitStatus
  busy: boolean
  push: (remote: string, name: string, force: boolean) => void
  close: () => void
}) {
  useOccludesBrowser()
  const rpc = useCore((s) => s.rpc)
  const dialog = useRef<HTMLDialogElement>(null)
  const listId = useId()
  const branch = status.branch ?? ''
  const tracked = trackedBranch(status.branches.find((entry) => entry.ref === `refs/heads/${branch}`))
  const [remote, setRemote] = useState(tracked?.remote ?? (status.remotes.includes('origin') ? 'origin' : status.remotes[0] ?? ''))
  const [name, setName] = useState(tracked?.name ?? branch)
  const [outgoing, setOutgoing] = useState<{ key: string; value: GitOutgoing | null } | null>(null)
  const remembered = usePreferences((s) => s.gitPushRejectedUpdate)
  const forceSupported = rpc?.features.includes('git-force-push') ?? false
  const [force, setForce] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])

  const trimmed = name.trim()
  const key = `${remote}\0${trimmed}`
  // Counted again as the target changes, once typing pauses.
  useEffect(() => {
    if (!rpc || !remote || !trimmed) return
    let live = true
    const timer = setTimeout(() => {
      void rpc.call('git.outgoing', { ...target, remote, name: trimmed }).then(
        (value) => { if (live) setOutgoing({ key, value }) },
        () => { if (live) setOutgoing({ key, value: null }) }
      )
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [rpc, key])

  const current = outgoing?.key === key ? outgoing.value : undefined
  const isNew = current?.isNew ?? false
  const upstream = tracked ? `${tracked.remote}/${tracked.name}` : null
  const other = trimmed !== '' && trimmed !== branch
  const remoteBranches = status.branches.filter((entry) => entry.remote === remote).map((entry) => entry.name)
  const enabled = !busy && Boolean(remote && trimmed && branch) && current !== undefined && (current === null || current.total > 0 || current.isNew || force)

  return <dialog ref={dialog} className="modal branch-dialog git-dialog git-push-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); if (enabled) push(remote, trimmed, force) }}>
      <h2>Push</h2><p className="muted">{projectName(target.project)}</p>
      <div className="git-push-route">
        <span className="mono">{branch}</span>
        <span className="muted" aria-hidden="true">→</span>
        <select className="input git-push-remote" aria-label={t('GitPush.remote')} value={remote} onChange={(event) => setRemote(event.target.value)}>
          {status.remotes.map((entry) => <option key={entry}>{entry}</option>)}
        </select>
        <span aria-hidden="true">:</span>
        <input className="input mono git-push-target" aria-label={t('GitPush.target')} list={listId} value={name} data-other={other || undefined} spellCheck={false} onChange={(event) => setName(event.target.value)} />
        <datalist id={listId}>{remoteBranches.map((entry) => <option key={entry} value={entry} />)}</datalist>
        {isNew && <span className="git-push-tag">{upstream ? t('GitPush.new') : t('GitPush.newAndUpstream')}</span>}
      </div>
      {other && <p className="git-push-other">{upstream ? t('GitPush.otherName', { name: trimmed, upstream }) : t('GitPush.otherNameNoUpstream', { name: trimmed })}</p>}
      <div className="git-push-commits">
        {current === undefined ? <p className="git-push-empty muted">{t('GitPush.loading')}</p>
          : current === null ? null
          : current.total === 0 && !current.isNew ? <p className="git-push-empty muted">{t('GitPush.nothing')}</p>
          : <>
            <div className="git-push-commits-head">{t('GitPush.commits', { count: current.total })}</div>
            {current.commits.slice(0, SHOWN).map((commit) => <div key={commit.sha} className="git-push-commit" title={`${commit.sha}\n${commit.subject}\n${commit.author}`}>
              <span className="mono muted">{commit.sha.slice(0, 7)}</span><span className="git-push-subject">{commit.subject}</span><span className="muted">{new Date(commit.date).toLocaleString(getLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>)}
            {current.total > SHOWN && <div className="git-push-commit git-push-more muted">{t('GitPush.more', { count: current.total - SHOWN })}</div>}
          </>}
      </div>
      <p className="git-push-note muted">
        {upstream ? t('GitPush.keepsUpstream', { upstream }) : isNew ? t('GitPush.createsUpstream', { name: trimmed }) : t('GitPush.setsUpstream')}
        {upstream && isNew && ` ${t('GitPush.creates', { name: trimmed })}`}
      </p>
      {remembered !== 'ask' && <p className="git-push-note muted">
        {remembered === 'merge' ? t('GitPush.rememberedMerge') : t('GitPush.rememberedRebase')}{' '}
        <button type="button" className="link-button" onClick={() => setPreference('gitPushRejectedUpdate', 'ask')}>{t('GitPush.askEachTime')}</button>
      </p>}
      {forceSupported && !isNew && <label className="git-push-remember"><input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />{t('GitPush.force')}</label>}
      {force && <p className="git-push-other">{t('GitPush.forceExplained', { target: `${remote}/${trimmed}` })}</p>}
      <div className="branch-commit-buttons">
        <button type="button" className="button" disabled={busy} onClick={close}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className={force ? 'button danger' : 'button primary'} disabled={!enabled}>{busy ? t('GitInspector.processing') : force ? 'Force Push' : other ? t('GitPush.pushTo', { name: trimmed }) : 'Push'}</button>
      </div>
    </form>
  </dialog>
}

// A push the remote turned away for commits the branch lacks: take them in, then push again.
export function GitPushRejectedDialog({ target, busy, choose, close }: {
  target: string
  busy: boolean
  choose: (method: 'merge' | 'rebase', remember: boolean) => void
  close: () => void
}) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const [remember, setRemember] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="modal branch-dialog git-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <div className="modal-body">
      <h2>{t('GitPush.rejectedTitle')}</h2>
      <p>{t('GitPush.rejectedExplained', { target })}</p>
      <label className="git-push-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />{t('GitPush.rememberChoice')}</label>
      <div className="branch-commit-buttons">
        <button className="button" disabled={busy} onClick={close}>{t('ChatCommandSettings.cancel')}</button>
        <button className="button" disabled={busy} onClick={() => choose('merge', remember)}>{t('GitPush.mergeAndPush')}</button>
        <button className="button primary" disabled={busy} onClick={() => choose('rebase', remember)}>{t('GitPush.rebaseAndPush')}</button>
      </div>
    </div>
  </dialog>
}
