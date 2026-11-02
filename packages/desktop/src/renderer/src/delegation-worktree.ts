import { agentCallOpen, type AgentCall } from '@antumi/protocol'
import { t } from './i18n'

// How a worktree delegation's worktree stands, in a few words: where it is being laid out, what
// git read in it when the call ended, or that the user cleaned it away.
export function worktreeStatusText(call: AgentCall): { text: string; warn: boolean } | null {
  if (call.workspace !== 'worktree') return null
  const { worktree } = call
  if (!worktree) return { text: call.state === 'queued' || call.state === 'starting' ? t('AgentProfiles.worktreeLayingOut') : '', warn: false }
  if (worktree.removed) return { text: t('AgentProfiles.worktreeRemoved'), warn: false }
  if (worktree.stage === 'setup' && agentCallOpen(call)) return { text: t('AgentProfiles.worktreeSetup'), warn: false }
  const { outcome } = worktree
  if (!outcome) return { text: '', warn: false }
  if (outcome.commits === null && outcome.changes === null) return { text: t('AgentProfiles.worktreeUnread'), warn: true }
  const parts = [t('AgentProfiles.worktreeOutcome', { commits: outcome.commits ?? '?', changes: outcome.changes ?? '?' })]
  if (outcome.branch !== null && outcome.branch !== worktree.branch) parts.push(t('AgentProfiles.worktreeOnOtherBranch', { branch: outcome.branch }))
  return { text: parts.join(' · '), warn: Boolean(outcome.changes) || (outcome.branch !== null && outcome.branch !== worktree.branch) }
}
