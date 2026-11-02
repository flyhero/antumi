import type { GitAction } from '@antumi/protocol'
import { openConversationDraft, useCore } from './core-store'
import { t } from './i18n'

// What went wrong on the Git page: the operation as git would name it, the error git gave, and the
// files it stopped on.
export type GitProblem = { operation: string; message: string | null; conflicts: readonly string[] }

export type ConflictExcerpt = { file: string; lines: readonly string[]; cut: boolean }

const CONTEXT_LINES = 2
const FILE_LINES = 80
const TOTAL_LINES = 240

const short = (ref: string) => ref.replace(/^refs\/(heads|remotes|tags)\//, '')

// The action as git would say it, for the agent: `merge feature`, `push origin/main`.
export function describeGitAction(action: GitAction): string {
  switch (action.kind) {
    case 'push': return ['push', action.remote && action.name ? `${action.remote}/${action.name}` : action.remote ?? action.name].filter(Boolean).join(' ')
    case 'fetch': return ['fetch', action.remote].filter(Boolean).join(' ')
    case 'commit': return action.push ? 'commit && push' : 'commit'
    case 'update': return ['update', short(action.ref), action.method && `(${action.method})`].filter(Boolean).join(' ')
    case 'create': return `branch ${action.name} ${short(action.ref)}`
    case 'rename': return `branch -m ${short(action.ref)} ${action.name}`
    case 'tag': return `tag ${action.name} ${short(action.ref)}`
    case 'track': return `branch --set-upstream-to ${action.upstream ? short(action.upstream) : '(none)'} ${short(action.ref)}`
    case 'resolve': return `add ${action.file}`
    case 'pull': case 'continue': case 'abort': return action.kind
    case 'switch': case 'delete': case 'detach': case 'merge': case 'rebase': return `${action.kind} ${short(action.ref)}`
  }
}

// The conflicted hunks of a file, each with a little context, so the agent sees what clashed
// without the whole file; it reads the rest itself.
export function conflictExcerpt(text: string, limit = FILE_LINES): { lines: string[]; cut: boolean } {
  const all = text.split('\n')
  const keep = new Set<number>()
  let start = -1
  all.forEach((line, index) => {
    if (line.startsWith('<<<<<<<')) start = index
    else if (line.startsWith('>>>>>>>') && start >= 0) {
      for (let at = Math.max(0, start - CONTEXT_LINES); at <= Math.min(all.length - 1, index + CONTEXT_LINES); at++) keep.add(at)
      start = -1
    }
  })
  const lines: string[] = []
  let last = -1
  for (const index of [...keep].sort((a, b) => a - b)) {
    if (lines.length >= limit) return { lines, cut: true }
    if (last >= 0 && index > last + 1) lines.push('…')
    lines.push(all[index] ?? '')
    last = index
  }
  return { lines, cut: false }
}

export function gitProblemPrompt(problem: GitProblem, where: { directory: string; branch: string | null }, excerpts: readonly ConflictExcerpt[]): string {
  const { operation } = problem
  const parts = [
    problem.conflicts.length > 0 ? t('GitHandoff.conflictIntro', { operation }) : t('GitHandoff.failureIntro', { operation }),
    [`- ${t('GitHandoff.directory')}：${where.directory}`, `- ${t('GitHandoff.branch')}：${where.branch ?? t('GitInspector.detachedHead')}`, `- ${t('GitHandoff.operation')}：git ${operation}`].join('\n')
  ]
  if (problem.message) parts.push(`${t('GitHandoff.output')}\n\n\`\`\`\n${problem.message.trim()}\n\`\`\``)
  if (problem.conflicts.length > 0) {
    parts.push(`${t('GitHandoff.conflictedFiles')}\n\n${problem.conflicts.map((file) => `- ${file}`).join('\n')}`)
    for (const excerpt of excerpts) {
      parts.push(`\`${excerpt.file}\`\n\n\`\`\`\n${excerpt.lines.join('\n')}${excerpt.cut ? `\n${t('GitHandoff.cut')}` : ''}\n\`\`\``)
    }
  }
  parts.push(problem.conflicts.length > 0 ? t('GitHandoff.conflictAsk') : t('GitHandoff.failureAsk'))
  return parts.join('\n\n')
}

// A new conversation in the checkout the action ran in, its first message written: the action, what
// git said and, for conflicts, the clashing code. The user reads it over and sends it.
export async function handGitProblemToAgent(problem: GitProblem, where: { directory: string; branch: string | null }): Promise<void> {
  const { rpc } = useCore.getState()
  const excerpts: ConflictExcerpt[] = []
  let budget = TOTAL_LINES
  for (const file of problem.conflicts) {
    if (!rpc || budget <= 0) break
    const read = await rpc.call('files.read', { roots: [where.directory], path: `${where.directory.replace(/[\\/]$/, '')}/${file}` }).catch(() => null)
    if (read?.kind !== 'text') continue
    const excerpt = conflictExcerpt(read.text, Math.min(FILE_LINES, budget))
    if (excerpt.lines.length === 0) continue
    budget -= excerpt.lines.length
    excerpts.push({ file, ...excerpt })
  }
  openConversationDraft([where.directory])
  useCore.setState({ conversationDraftCarry: { text: gitProblemPrompt(problem, where, excerpts), projects: [where.directory], agent: null, model: null } })
}
