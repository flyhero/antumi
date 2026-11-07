import { useEffect, useState } from 'react'
import { PULL_REQUEST_MERGE_METHODS, type PullRequestCheck, type PullRequestComment, type PullRequestLink, type PullRequestMergeMethod, type PullRequestReview, type Task } from '@antumi/protocol'
import { askConfirm } from '../confirm-dialog'
import { timeAgo } from '../conversation-state'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { pullRequestProblemText } from '../labels'
import { checksSummary, openPullRequest, pullRequestState, refreshPullRequests, usePullRequests } from '../pull-requests'
import { projectName } from './ProjectPicker'
import { PullRequestChip } from './PullRequestChip'

const CHECK_MARK: Record<PullRequestCheck['state'], string> = { queued: '…', running: '…', success: '✓', failure: '✗', skipped: '–', neutral: '–' }
const REVIEW_LABEL: Record<PullRequestReview['state'], () => string> = {
  approved: () => t('PullRequest.review.approved'),
  changes_requested: () => t('PullRequest.review.changesRequested'),
  commented: () => t('PullRequest.review.commented')
}

// The task's pull requests as the host has them: where each stands, its checks, and what
// reviewers said. Failed checks and comments are picked and handed to the agent in the task's
// chat. While this is open, core follows the pull requests closely.
export function PullRequestPanel({ task }: { task: Task }) {
  const rpc = useCore((state) => state.rpc)
  const links = usePullRequests(task.id)
  useEffect(() => {
    if (!rpc) return
    void rpc.call('pullRequests.watch', { taskId: task.id, open: true }).catch(() => {})
    return () => { void rpc.call('pullRequests.watch', { taskId: task.id, open: false }).catch(() => {}) }
  }, [rpc, task.id])
  if (links.length === 0) return <p className="inspector-empty">{t('PullRequest.none')}</p>
  return (
    <div className="pr-panel">
      {links.map((link) => <LinkSection key={link.repoPath} task={task} link={link} named={links.length > 1} />)}
    </div>
  )
}

function LinkSection({ task, link, named }: { task: Task; link: PullRequestLink; named: boolean }) {
  const [chosenChecks, setChosenChecks] = useState<Set<string>>(new Set())
  const [chosenReviews, setChosenReviews] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const status = link.status
  const failed = status?.checks.filter((check) => check.state === 'failure') ?? []
  const reviews: (PullRequestReview | PullRequestComment)[] = [...(status?.reviews ?? []), ...(status?.comments ?? [])].sort((a, b) => timeOf(a) - timeOf(b))
  const toggle = (set: Set<string>, id: string, change: (next: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    change(next)
  }
  const handoff = async (kind: 'checks' | 'reviews', ids: Set<string>) => {
    setBusy(true)
    const done = await perform((rpc) => rpc.call('pullRequests.handoff', { taskId: task.id, repoPath: link.repoPath, kind, ids: [...ids] }))
    setBusy(false)
    if (done) (kind === 'checks' ? setChosenChecks : setChosenReviews)(new Set())
  }
  return (
    <section className="pr-panel-link" aria-label={`#${link.number}`}>
      <header className="pr-panel-head">
        {named && <span className="pr-panel-project">{projectName(link.repoPath)}</span>}
        <PullRequestChip link={link} />
        <button type="button" className="link-button pr-panel-title" onClick={() => openPullRequest(link)} title={link.url}>{status?.title ?? link.url}</button>
      </header>
      <p className="pr-panel-route muted">
        <span className="mono">{link.headBranch}</span> → <span className="mono">{link.base}</span>
        {status?.mergeable === 'conflicting' && <> · <span className="pr-panel-conflict">{t('PullRequest.mergeable.conflicting', { base: link.base })}</span></>}
        {status?.mergeable === 'mergeable' && pullRequestState(link) === 'open' && <> · {t('PullRequest.mergeable.mergeable')}</>}
      </p>
      <p className="pr-panel-refresh muted">
        {link.refreshing ? t('PullRequest.refreshing') : link.fetchedAt ? t('PullRequest.fetchedAt', { time: timeAgo(link.fetchedAt, Date.now()) }) : null}
        {!link.refreshing && <>{' '}<button type="button" className="link-button" onClick={() => void refreshPullRequests(task.id)}>{t('PullRequest.refreshNow')}</button></>}
      </p>
      {link.problem && <p className="pr-panel-problem" role="alert">{pullRequestProblemText(link.problem)}</p>}
      {status?.state === 'open' && <PushRow task={task} link={link} />}
      {status && status.state === 'open' && !status.draft && <MergeRow task={task} link={link} />}

      <h4 className="pr-panel-heading">{t('PullRequest.checksHeading')}</h4>
      {!status || status.checks.length === 0 ? <p className="muted pr-panel-empty">{t('PullRequest.noChecks')}</p> : (
        <ul className="pr-list">
          {status.checks.map((check) => (
            <li key={check.id} className="pr-item" data-state={check.state}>
              {check.state === 'failure'
                ? <input type="checkbox" aria-label={check.name} checked={chosenChecks.has(check.id)} onChange={() => toggle(chosenChecks, check.id, setChosenChecks)} />
                : <span className="pr-item-mark" aria-hidden="true">{CHECK_MARK[check.state]}</span>}
              {check.url ? <a className="pr-item-text" href={check.url} target="_blank" rel="noreferrer">{check.name}</a> : <span className="pr-item-text">{check.name}</span>}
              {check.state === 'failure' && <span className="pr-item-state">{t('PullRequest.checks.failedOne')}</span>}
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <div className="pr-panel-actions">
          <button type="button" className="button" disabled={busy || chosenChecks.size === 0} onClick={() => void handoff('checks', chosenChecks)}>{chosenChecks.size > 0 ? t('PullRequest.handoffChecksCount', { count: chosenChecks.size }) : t('PullRequest.handoffChecks')}</button>
        </div>
      )}

      <h4 className="pr-panel-heading">{t('PullRequest.reviewsHeading')}</h4>
      {reviews.length === 0 ? <p className="muted pr-panel-empty">{t('PullRequest.noReviews')}</p> : (
        <ul className="pr-list">
          {reviews.map((item) => (
            <li key={item.id} className="pr-item pr-review">
              <input type="checkbox" aria-label={item.author} checked={chosenReviews.has(item.id)} onChange={() => toggle(chosenReviews, item.id, setChosenReviews)} />
              <div className="pr-item-text">
                <div className="pr-review-head">
                  <strong>{item.author || t('PullRequest.reviewer')}</strong>
                  {'state' in item ? <span className="pr-review-state" data-state={item.state}>{REVIEW_LABEL[item.state]()}</span> : item.path ? <span className="mono muted">{item.path}{item.line ? `:${item.line}` : ''}</span> : null}
                  <span className="muted">{timeAgo(timeOf(item), Date.now())}</span>
                </div>
                {item.body && <div className="pr-review-body">{item.body}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {reviews.length > 0 && (
        <div className="pr-panel-actions">
          <button type="button" className="button" disabled={busy || chosenReviews.size === 0} onClick={() => void handoff('reviews', chosenReviews)}>{chosenReviews.size > 0 ? t('PullRequest.handoffReviewsCount', { count: chosenReviews.size }) : t('PullRequest.handoffReviews')}</button>
        </div>
      )}
    </section>
  )
}

// The branch has commits its pull request does not, as after the agent fixed what was handed to
// it: pushing them is what updates the pull request, so the step is offered here.
function PushRow({ task, link }: { task: Task; link: PullRequestLink }) {
  const rpc = useCore((state) => state.rpc)
  const gitRevision = useCore((state) => state.gitRevision)
  const [ahead, setAhead] = useState<{ count: number; branch: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!rpc) return
    let live = true
    void rpc.call('git.status', { kind: 'task', id: task.id, project: link.repoPath }).then(
      (status) => { if (live) setAhead(status.branch === link.headBranch && status.upstream && status.ahead > 0 ? { count: status.ahead, branch: status.branch } : null) },
      () => { if (live) setAhead(null) }
    )
    return () => { live = false }
  }, [rpc, task.id, task.updatedAt, link.repoPath, link.headBranch, link.status?.headSha, gitRevision])
  if (!ahead) return null
  const push = async () => {
    setBusy(true)
    const done = await perform((rpc) => rpc.call('git.execute', { kind: 'task', id: task.id, project: link.repoPath, action: { kind: 'push', from: ahead.branch } }))
    setBusy(false)
    if (done) await refreshPullRequests(task.id)
  }
  return (
    <div className="pr-push-row">
      <span className="pr-push-note">{t('PullRequest.unpushed', { count: ahead.count })}</span>
      <button type="button" className="button" disabled={busy} onClick={() => void push()}>{busy ? t('PullRequest.pushing') : t('PullRequest.push')}</button>
    </div>
  )
}

const METHOD_LABEL: Record<PullRequestMergeMethod, () => string> = {
  squash: () => t('PullRequest.mergeMethod.squash'),
  merge: () => t('PullRequest.mergeMethod.merge'),
  rebase: () => t('PullRequest.mergeMethod.rebase')
}

// Merging on the host, by the method chosen, squash first. What the host would refuse is said
// beside the button rather than found out by pressing it; the host still has the last word.
function MergeRow({ task, link }: { task: Task; link: PullRequestLink }) {
  const [method, setMethod] = useState<PullRequestMergeMethod>('squash')
  const [busy, setBusy] = useState(false)
  const status = link.status
  if (!status) return null
  const reason = status.mergeable === 'conflicting' ? t('PullRequest.mergeable.conflicting', { base: link.base })
    : checksSummary(status) === 'failure' ? t('PullRequest.checks.failure')
    : status.reviews.some((review) => review.state === 'changes_requested') ? t('PullRequest.review.changesRequested')
    : null
  const merge = async () => {
    if (!(await askConfirm({ message: t('PullRequest.mergeConfirm', { number: link.number, base: link.base, method: METHOD_LABEL[method]() }), confirm: t('PullRequest.merge') }))) return
    setBusy(true)
    await perform((rpc) => rpc.call('pullRequests.merge', { taskId: task.id, repoPath: link.repoPath, method, expectedHeadSha: status.headSha }))
    setBusy(false)
  }
  return (
    <div className="pr-merge-row">
      <select className="input pr-merge-method" aria-label={t('PullRequest.mergeMethodLabel')} value={method} onChange={(event) => setMethod(event.target.value as PullRequestMergeMethod)}>
        {PULL_REQUEST_MERGE_METHODS.map((each) => <option key={each} value={each}>{METHOD_LABEL[each]()}</option>)}
      </select>
      <button type="button" className="button primary" disabled={busy || link.refreshing} data-tooltip={reason ?? undefined} onClick={() => void merge()}>{busy ? t('PullRequest.merging') : t('PullRequest.merge')}</button>
      {reason && <span className="pr-merge-reason muted">{reason}</span>}
    </div>
  )
}

function timeOf(item: PullRequestReview | PullRequestComment): number {
  return 'submittedAt' in item ? item.submittedAt : item.createdAt
}
