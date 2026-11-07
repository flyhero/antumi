import type { PullRequestLink } from '@antumi/protocol'
import { t } from '../i18n'
import { checksSummary, openPullRequest, pullRequestState, type ChecksSummary, type PullRequestState } from '../pull-requests'

const STATE_LABEL: Record<PullRequestState, () => string> = {
  draft: () => t('PullRequest.state.draft'),
  open: () => t('PullRequest.state.open'),
  merged: () => t('PullRequest.state.merged'),
  closed: () => t('PullRequest.state.closed'),
  unknown: () => t('PullRequest.state.open')
}
const CHECKS_LABEL: Record<Exclude<ChecksSummary, 'none'>, () => string> = {
  success: () => t('PullRequest.checks.success'),
  failure: () => t('PullRequest.checks.failure'),
  running: () => t('PullRequest.checks.running')
}
const CHECKS_MARK: Record<Exclude<ChecksSummary, 'none'>, string> = { success: '✓', failure: '✗', running: '…' }

// A pull request as a tag: its number and where it stands, and how its checks went when it has
// any. Opens it in the browser.
export function PullRequestChip({ link }: { link: PullRequestLink }) {
  const state = pullRequestState(link)
  const checks = checksSummary(link.status)
  const label = [`#${link.number}`, STATE_LABEL[state](), ...(checks === 'none' ? [] : [CHECKS_LABEL[checks]()])].join(' · ')
  return (
    <button type="button" className="task-tag pr-chip" data-state={state} aria-label={label} title={`${link.status?.title ?? ''}\n${link.url}`.trim()} onClick={(event) => { event.stopPropagation(); openPullRequest(link) }}>
      <span className="mono">#{link.number}</span>
      <span>{STATE_LABEL[state]()}</span>
      {checks !== 'none' && <span className="pr-chip-checks" data-checks={checks} aria-hidden="true">{CHECKS_MARK[checks]}</span>}
    </button>
  )
}
