import { useEffect, useRef, useState } from 'react'
import type { PullRequestEligibility, Task } from '@antumi/protocol'
import { useOccludesBrowser } from '../browser-occlusion'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { pullRequestBlockerText } from '../labels'
import { openPullRequest, receivePullRequests } from '../pull-requests'
import { projectName } from './ProjectPicker'

type Draft = { base: string; title: string; body: string; model: string | null; drafting: boolean; failed: boolean }
type Section = { eligibility: PullRequestEligibility; draft: Draft }

// One pull request per repo the task writes to. Opening checks each branch; one that can have a
// pull request gets a title and description drafted, which the user edits; one that cannot says
// why. A start branch missing from the remote falls back to the default branch, said as much.
export function CreatePullRequestDialog({ task, close }: { task: Task; close: () => void }) {
  useOccludesBrowser()
  const rpc = useCore((s) => s.rpc)
  const dialog = useRef<HTMLDialogElement>(null)
  const [sections, setSections] = useState<Section[] | null>(null)
  const [draftPr, setDraftPr] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])

  useEffect(() => {
    if (!rpc) return
    let live = true
    void rpc.call('pullRequests.check', { taskId: task.id }).then((found) => {
      if (!live) return
      setDraftPr(found.some((entry) => entry.draftDefault === true))
      setSections(found.map((eligibility) => {
        const base = eligibility.blocker === 'base-missing' ? eligibility.baseFallback ?? '' : eligibility.base ?? ''
        const ready = eligibility.blocker === null || eligibility.blocker === 'base-missing'
        return { eligibility, draft: { base, title: '', body: '', model: null, drafting: ready, failed: false } }
      }))
      for (const eligibility of found) {
        if (eligibility.blocker !== null && eligibility.blocker !== 'base-missing') continue
        const base = eligibility.blocker === 'base-missing' ? eligibility.baseFallback ?? '' : eligibility.base ?? ''
        void rpc.call('pullRequests.draft', { taskId: task.id, repoPath: eligibility.repoPath, base }).then(
          (drafted) => { if (live) update(eligibility.repoPath, (draft) => ({ ...draft, title: draft.title || drafted.title, body: draft.body || drafted.body, model: drafted.model, drafting: false })) },
          () => { if (live) update(eligibility.repoPath, (draft) => ({ ...draft, drafting: false, failed: true })) }
        )
      }
    }, () => { if (live) { close() } })
    return () => { live = false }
  }, [rpc, task.id])

  const update = (repoPath: string, change: (draft: Draft) => Draft) =>
    setSections((current) => current?.map((section) => section.eligibility.repoPath === repoPath ? { ...section, draft: change(section.draft) } : section) ?? null)

  const creatable = (sections ?? []).filter(({ eligibility, draft }) => (eligibility.blocker === null || eligibility.blocker === 'base-missing') && !draft.drafting && draft.title.trim() && draft.base.trim())
  const enabled = !busy && creatable.length > 0 && (sections ?? []).every(({ draft }) => !draft.drafting)

  const create = async () => {
    setBusy(true)
    let created = 0
    for (const { eligibility, draft } of creatable) {
      const from = eligibility.headBranch ?? ''
      const link = await perform((rpc) => rpc.call('pullRequests.create', { taskId: task.id, repoPath: eligibility.repoPath, base: draft.base.trim(), title: draft.title.trim(), body: draft.body, draft: draftPr, from }))
      if (!link) break
      created += 1
      receivePullRequests(task.id, (await perform((rpc) => rpc.call('pullRequests.list', { taskId: task.id }))) ?? [link])
      if (creatable.length === 1) openPullRequest(link)
    }
    setBusy(false)
    if (created === creatable.length) close()
  }

  return <dialog ref={dialog} className="modal branch-dialog git-dialog pr-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); if (enabled) void create() }}>
      <h2>{t('PullRequest.create')}</h2>
      <p className="muted">{task.title}</p>
      {sections === null ? <p className="muted">{t('PullRequest.checking')}</p> : sections.map(({ eligibility, draft }) => {
        const blocked = eligibility.blocker !== null && eligibility.blocker !== 'base-missing'
        return (
          <section key={eligibility.repoPath} className="pr-section">
            {sections.length > 1 && <h3>{projectName(eligibility.repoPath)}</h3>}
            {eligibility.blocker === 'existing-pr' && eligibility.existing ? (
              <p className="pr-note">{pullRequestBlockerText(eligibility)}{' '}<button type="button" className="link-button" onClick={() => eligibility.existing && openPullRequest(eligibility.existing)}>{t('PullRequest.viewNumber', { number: eligibility.existing.number })}</button></p>
            ) : blocked ? (
              <p className="pr-note" role="alert">{pullRequestBlockerText(eligibility)}</p>
            ) : (
              <>
                {eligibility.blocker === 'base-missing' && <p className="pr-note">{pullRequestBlockerText(eligibility)}</p>}
                <div className="pr-route">
                  <span className="mono">{eligibility.headBranch}</span>
                  <span className="muted" aria-hidden="true">→</span>
                  <input className="input mono pr-base" aria-label={t('PullRequest.base')} value={draft.base} spellCheck={false} onChange={(event) => update(eligibility.repoPath, (current) => ({ ...current, base: event.target.value }))} />
                  {eligibility.needsPush && <span className="git-push-tag">{t('PullRequest.willPush')}</span>}
                </div>
                <input className="input pr-title" aria-label={t('PullRequest.titleField')} placeholder={draft.drafting ? t('PullRequest.drafting') : t('PullRequest.titleField')} value={draft.title} maxLength={256} onChange={(event) => update(eligibility.repoPath, (current) => ({ ...current, title: event.target.value }))} />
                <textarea className="input pr-body" aria-label={t('PullRequest.body')} placeholder={draft.drafting ? t('PullRequest.drafting') : t('PullRequest.body')} value={draft.body} rows={10} onChange={(event) => update(eligibility.repoPath, (current) => ({ ...current, body: event.target.value }))} />
                {draft.failed ? <p className="pr-note muted">{t('PullRequest.draftFailed')}</p> : draft.model ? <p className="pr-note muted">{t('PullRequest.draftedBy', { model: draft.model })}</p> : null}
              </>
            )}
          </section>
        )
      })}
      <div className="branch-commit-buttons">
        <label className="pr-draft-toggle"><input type="checkbox" checked={draftPr} onChange={(event) => setDraftPr(event.target.checked)} />{t('PullRequest.draftPr')}</label>
        <button type="button" className="button" disabled={busy} onClick={close}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={!enabled}>{busy ? t('PullRequest.creating') : t('PullRequest.create')}</button>
      </div>
    </form>
  </dialog>
}
