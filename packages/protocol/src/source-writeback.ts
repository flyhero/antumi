import { AgentKind } from './agent'
import { ModelProviderId } from './model-provider-id'
import { z } from 'zod'
import { ISSUE_STATUS_CATEGORIES, SourceId, SourceKey } from './source'
import { SourceUpdateTarget } from './source-comments'

// Writing back to the issue a task or an investigation came from: moving its status and posting
// comments. A plugin offers it with writeback: 1; see docs/SOURCE-WRITEBACK.md.

// The agent's tool for drafting the summary; it writes to Antumi only, so it asks the user nothing.
export const SOURCE_REPORT_TOOL = 'source_report'
export const SOURCE_TASK_READ_TOOLS = ['source_task_options', 'source_task_catalog'] as const
// An automatic investigation's tool for opening the issue's task, where the user allows it.
export const SOURCE_TASK_CREATE_TOOL = 'source_task_create'

export const MAX_WRITEBACK_COMMENT = 20_000
export const MAX_SOURCE_REPORT = 8_000
// What a summary for an issue may run to: the prompt asks for 300 characters, this leaves slack, and
// past it source_report refuses so the agent writes a shorter one.
export const SOURCE_REPORT_LIMIT = 600

const StatusCategory = z.enum(ISSUE_STATUS_CATEGORIES)

// One status the issue can move to now. id is the plugin's own (a Jira transition, a Linear state)
// and goes back to it unread; action is what the tracker calls the move, when it names one.
export const SourceTransitionOption = z.object({
  id: z.string().min(1).max(500),
  name: z.string().min(1).max(100),
  action: z.string().min(1).max(100).optional(),
  category: StatusCategory,
  // The status the move ends in, by the tracker's id for it, where it has one.
  toStatusId: z.string().min(1).max(500).optional()
})
export type SourceTransitionOption = z.infer<typeof SourceTransitionOption>

// Someone on the tracker, by an id that stays the same: an account id, a login, a nick.
export const SourceUser = z.object({ id: z.string().min(1).max(500), name: z.string().max(200) })
export type SourceUser = z.infer<typeof SourceUser>
const Named = z.object({ id: z.string().min(1).max(500), name: z.string().max(200) })

// Besides where the issue can go: who it is with and what it is, as the tracker has it now. These
// are facts only, what to make of them is core's (sourceOwnership, resolveLane); a plugin from
// before SDK 0.7 leaves them out. See docs/SOURCE-AUTOMATION.md.
export const SourceTransitions = z.object({
  status: z.string().max(100),
  statusCategory: StatusCategory,
  options: z.array(SourceTransitionOption).max(100),
  statusId: z.string().min(1).max(500).optional(),
  // The account these calls run as, and everyone the issue is assigned to; empty when no one is.
  viewer: SourceUser.optional(),
  assignees: z.array(SourceUser).max(50).optional(),
  reporter: SourceUser.nullable().optional(),
  // The issue's type (a bug, a story) and the project or team it is in.
  type: Named.optional(),
  scope: Named.optional()
})
export type SourceTransitions = z.infer<typeof SourceTransitions>

// Whose the issue is, to the account Antumi writes as. A rule writes to an issue that is the
// user's alone, or no one's; never to one that is someone else's, as once it is handed to QA.
// unknown: the plugin does not say, so a rule runs as it did before there was a guard.
export const SOURCE_OWNERSHIPS = ['sole', 'unassigned', 'shared', 'other', 'unknown'] as const
export const SourceOwnership = z.enum(SOURCE_OWNERSHIPS)
export type SourceOwnership = z.infer<typeof SourceOwnership>

export function sourceOwnership({ viewer, assignees }: Pick<SourceTransitions, 'viewer' | 'assignees'>): SourceOwnership {
  if (!viewer || !assignees) return 'unknown'
  if (assignees.length === 0) return 'unassigned'
  if (!assignees.some((assignee) => assignee.id === viewer.id)) return 'other'
  return assignees.length === 1 ? 'sole' : 'shared'
}

export const SourceStatusResult = z.object({ status: z.string().max(100), statusCategory: StatusCategory })
export type SourceStatusResult = z.infer<typeof SourceStatusResult>

export const SourceCommentResult = z.object({ id: z.string().min(1).max(500), url: z.string().max(4000).nullable() })
export type SourceCommentResult = z.infer<typeof SourceCommentResult>

export const SOURCE_WRITE_TRIGGERS = ['manual', 'start', 'review', 'done'] as const
export const SourceWriteTrigger = z.enum(SOURCE_WRITE_TRIGGERS)
export type SourceWriteTrigger = z.infer<typeof SourceWriteTrigger>

// pending: recorded, not answered yet; uncertain: the call may or may not have reached the tracker.
export const SourceWriteState = z.enum(['pending', 'sent', 'skipped', 'failed', 'uncertain'])
export type SourceWriteState = z.infer<typeof SourceWriteState>

export const SourceWrite = z.object({
  id: z.string().uuid(),
  target: SourceUpdateTarget,
  provider: SourceId, instance: SourceId, key: SourceKey,
  kind: z.enum(['status', 'comment']),
  trigger: SourceWriteTrigger,
  // The status asked for, or the comment's text.
  detail: z.string(),
  // Where the comment's text came from, when a rule wrote it.
  origin: z.enum(['report', 'last-reply', 'user']).nullable(),
  state: SourceWriteState,
  // The status after the move, or the comment's id and link on the tracker.
  result: z.string().nullable(),
  url: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.number(), updatedAt: z.number(),
  // Of a rule's write: whose the issue was found to be, and the lane the rule came from (a type
  // id, or * for the source's own rules). Absent on a write by hand and on older records.
  guard: SourceOwnership.optional(),
  lane: z.string().max(500).optional(),
  // A dry run: detail is what would have been written, and nothing was.
  planned: z.boolean().optional(),
  // How many times a status move was tried before this record of it.
  attempts: z.number().int().nonnegative().optional(),
  // An undelivered rule to resume when the user retries after a source outage.
  intentId: z.number().int().positive().optional()
})
export type SourceWrite = z.infer<typeof SourceWrite>

// How the agent's work on the issue ended: handed over, a question answered, waiting on an answer
// from the tracker, or stuck. Core acts on it; the agent never writes to the tracker itself.
export const SOURCE_OUTCOMES = ['delivered', 'answered', 'needs_input', 'blocked'] as const
export const SourceOutcome = z.enum(SOURCE_OUTCOMES)
export type SourceOutcome = z.infer<typeof SourceOutcome>

// The summary the agent drafted for the issue; Antumi posts it, never the agent. verification is
// for whoever checks the work next: how to, and what it touches.
export const SourceTaskProposal = z.object({
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(100000),
  agent: AgentKind,
  model: z.string().trim().min(1).max(200).nullable().optional(),
  effort: z.string().trim().min(1).max(200).nullable().optional(),
  modelProvider: ModelProviderId.nullable().optional(),
  dependsOn: z.array(z.string().uuid()).max(50).optional(),
  repos: z.array(z.object({
    path: z.string().trim().min(1).max(4000),
    reference: z.boolean().optional(),
    startRef: z.string().trim().min(1).max(500).nullable().optional()
  }).strict()).min(1).max(10)
}).strict()
export type SourceTaskProposal = z.infer<typeof SourceTaskProposal>

export const SourceReport = z.object({
  text: z.string().max(MAX_SOURCE_REPORT), updatedAt: z.number(),
  outcome: SourceOutcome.optional(),
  verification: z.string().max(SOURCE_REPORT_LIMIT).optional(),
  question: z.string().max(SOURCE_REPORT_LIMIT).optional(),
  blocker: z.string().max(SOURCE_REPORT_LIMIT).optional()
})
export type SourceReport = z.infer<typeof SourceReport>

// What a rule would write at one stage, asked before the task gets there: nothing is written.
export const SourceWritePlan = z.object({
  target: SourceUpdateTarget,
  trigger: z.enum(['start', 'review', 'done']),
  ownership: SourceOwnership,
  dryRun: z.boolean(),
  // The lane the rules come from, and whether it leaves issues of this type alone.
  lane: z.string(),
  off: z.boolean().default(false),
  status: z.string(),
  actions: z.array(z.object({
    kind: z.enum(['status', 'comment']),
    // The status it would move to, or the comment's text (empty when written from the last reply).
    detail: z.string(),
    will: z.boolean(),
    reason: z.string().nullable()
  }))
})
export type SourceWritePlan = z.infer<typeof SourceWritePlan>

export const SourceWriteback = z.object({
  target: SourceUpdateTarget,
  supported: z.boolean(),
  // Whether the tracker takes comments, or only status moves.
  comments: z.boolean().default(true),
  report: SourceReport.nullable(),
  writes: z.array(SourceWrite),
  // A task from a chat platform whose summary goes back to its thread: its agent drafts one too,
  // though there is no issue to write back to. Older cores leave it out.
  reportable: z.boolean().optional()
})
export type SourceWriteback = z.infer<typeof SourceWriteback>

const RANK = { todo: 0, doing: 1, done: 2 } as const

// The option a rule's names pick: the first name that matches exactly one option, by status or by
// action. null when none does; skip when the issue is already there or past it.
export function pickTransition(transitions: SourceTransitions, names: string): { option: SourceTransitionOption } | { skip: 'already' | 'backwards' } | null {
  const wanted = names.split('|').map((name) => name.trim().toLowerCase()).filter(Boolean)
  for (const name of wanted) {
    if (transitions.status.trim().toLowerCase() === name) return { skip: 'already' }
    const matches = transitions.options.filter((option) => option.name.trim().toLowerCase() === name || option.action?.trim().toLowerCase() === name)
    const [option] = matches
    if (matches.length !== 1 || !option) continue
    const from = transitions.statusCategory
    const to = option.category
    // From done, a status of no known kind may well be a reopening, so it counts as going back.
    if (from !== 'unknown' && (to === 'unknown' ? from === 'done' : RANK[from] > RANK[to])) return { skip: 'backwards' }
    return { option }
  }
  return null
}
