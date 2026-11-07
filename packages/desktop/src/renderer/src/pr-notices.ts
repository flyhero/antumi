import type { PullRequestLink, Task } from '@antumi/protocol'
import type { Notice } from './attention'
import { t } from './i18n'
import { checksSummary } from './pull-requests'

// What to tell the user about a pull request between two states: its checks now failing, a
// reviewer asking for changes, or it merged. Judged on what core last fetched, so one just
// linked, with no earlier state, is no news; nor is anything on a task that is gone.
export function prNoticesBetween(prev: Readonly<Record<string, readonly PullRequestLink[]>>, next: Readonly<Record<string, readonly PullRequestLink[]>>, tasks: Readonly<Record<string, Pick<Task, 'title'>>>): Notice[] {
  const notices: Notice[] = []
  for (const [taskId, links] of Object.entries(next)) {
    const task = tasks[taskId]
    if (!task) continue
    for (const link of links) {
      const before = prev[taskId]?.find((entry) => entry.repoPath === link.repoPath && entry.number === link.number)
      if (!before?.status || !link.status || before === link) continue
      const target = { kind: 'pullRequest' as const, taskId }
      const title = task.title
      if (link.status.state === 'merged' && before.status.state !== 'merged') {
        notices.push({ title, body: t('PullRequest.notice.merged', { number: link.number }), target })
        continue
      }
      if (link.status.state !== 'open') continue
      if (checksSummary(link.status) === 'failure' && checksSummary(before.status) !== 'failure') {
        notices.push({ title, body: t('PullRequest.notice.checksFailed', { number: link.number }), target })
      }
      const known = new Set(before.status.reviews.map((review) => review.id))
      const asking = link.status.reviews.find((review) => review.state === 'changes_requested' && !known.has(review.id))
      if (asking) notices.push({ title, body: t('PullRequest.notice.changesRequested', { number: link.number, author: asking.author }), target })
    }
  }
  return notices
}
