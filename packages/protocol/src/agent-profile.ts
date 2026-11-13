import { z } from 'zod'
import { AgentKind } from './agent'
import { SkillRef } from './skills'
import { ModelProviderId } from './model-provider'
import { UsageWindow } from './usage'

// The modes a developing profile may be set to work in when delegated to, least to most left to it.
export const DELEGATION_MODES = ['ask', 'acceptEdits', 'auto', 'bypass'] as const
export const DelegationMode = z.enum(DELEGATION_MODES)
export type DelegationMode = z.infer<typeof DelegationMode>

export const AgentProfileFields = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(2000).default(''),
  instructions: z.string().trim().max(20000).default(''),
  agent: AgentKind,
  model: z.string().trim().min(1).max(200).nullable().default(null),
  effort: z.string().trim().min(1).max(200).nullable().default(null),
  modelProvider: ModelProviderId.nullable().default(null),
  capability: z.enum(['readOnly', 'develop']).default('readOnly'),
  // What a developing profile works in when delegated to, whatever the caller's mode; null, the
  // caller's (feature agent-profile-delegation-mode). Only the user sets it: Antumi's MCP tools don't.
  delegationMode: DelegationMode.nullable().default(null),
  skills: z.array(SkillRef).max(100).nullable().default(null),
  mcpServers: z.array(z.string().min(1).max(200)).max(100).nullable().default(null),
  callableProfiles: z.array(z.string().uuid()).max(100).default([])
})
export type AgentProfileFields = z.input<typeof AgentProfileFields>
export const AgentProfile = AgentProfileFields.extend({
  id: z.string().uuid(), archivedAt: z.number().nullable(), createdAt: z.number(), updatedAt: z.number()
})
export type AgentProfile = z.infer<typeof AgentProfile>

// How much an agent has left as a delegation to it would find it: its account's tightest window as
// quotaVerdict reads it, or `provider` where it runs on a model provider, which has no such quota.
export const DelegationQuota = z.object({
  state: z.enum(['ok', 'tight', 'exhausted', 'unknown', 'provider']), window: UsageWindow.nullable(), stale: z.boolean()
})
export type DelegationQuota = z.infer<typeof DelegationQuota>
// Whom a conversation can delegate to: a saved profile, or (profileId null) an agent ready on this
// machine called as it is. capability: the profile's, null where the caller picks it. readOnly:
// whether it can work with its folders read-only.
export const DelegationTarget = z.object({
  profileId: z.string().uuid().nullable(), name: z.string(), description: z.string(), agent: AgentKind,
  capability: z.enum(['readOnly', 'develop']).nullable(), readOnly: z.boolean(), quota: DelegationQuota,
  // The provider an agent called as it is would run on, whose models a caller picks from; null
  // on its own account. Older cores leave it out.
  modelProvider: ModelProviderId.nullable().optional()
})
export type DelegationTarget = z.infer<typeof DelegationTarget>
export const DirectAgentCall = z.object({
  agent: AgentKind,
  model: z.string().trim().min(1).max(200).optional(),
  effort: z.string().trim().min(1).max(200).optional(),
  capability: z.enum(['readOnly', 'develop']).optional()
})
export type DirectAgentCall = z.infer<typeof DirectAgentCall>

// Where a developing member works: in the caller's own directories (shared), one such member at a
// time; or in a worktree of its own on a branch from the caller's commit (worktree), beside the
// caller and others like it, for the caller to merge (feature delegation-worktree).
export const AgentCallWorkspace = z.enum(['shared', 'worktree'])
export type AgentCallWorkspace = z.infer<typeof AgentCallWorkspace>
// What git read in the member's worktree when the call ended; null fields it could not read.
export const AgentCallWorktreeOutcome = z.object({
  // The branch checked out, which should be the call's own; the member may have switched.
  branch: z.string().nullable(), head: z.string().nullable(),
  // Commits since the base, and uncommitted files, untracked ones included.
  commits: z.number().int().nullable(), changes: z.number().int().nullable(),
  error: z.string().nullable()
})
export type AgentCallWorktreeOutcome = z.infer<typeof AgentCallWorktreeOutcome>
export const AgentCallWorktree = z.object({
  // The caller's checkout the worktree came from: a task's worktree where the caller is a task.
  source: z.string(),
  dir: z.string(), branch: z.string(),
  // The commit the branch starts from, read before setup ran.
  base: z.string(),
  // Laying out: the worktree is made, then the project's setup runs, then the member starts.
  stage: z.enum(['setup', 'ready']).default('ready'),
  setupFailures: z.array(z.string()).default([]),
  outcome: AgentCallWorktreeOutcome.nullable().default(null),
  // The user cleaned the worktree away; its branch and commits remain.
  removed: z.boolean().default(false)
})
export type AgentCallWorktree = z.infer<typeof AgentCallWorktree>

export const AgentCall = z.object({
  id: z.string().uuid(), parentId: z.string().uuid(), conversationId: z.string().uuid(),
  profile: AgentProfile, instruction: z.string().trim().min(1).max(20000),
  ref: z.string().nullable().default(null),
  permissionMode: z.string(), readOnly: z.boolean(),
  // Older cores leave both out: shared, with no worktree.
  workspace: AgentCallWorkspace.default('shared'),
  worktree: AgentCallWorktree.nullable().default(null),
  state: z.enum(['queued', 'starting', 'running', 'awaiting', 'completed', 'failed', 'cancelled']),
  result: z.string().nullable(), error: z.string().nullable(), delivered: z.boolean(),
  // What a queued call waits for: the caller's turn to end, another edit in the same directories to
  // finish, or a free slot under the concurrency limits.
  waiting: z.enum(['parent', 'writer', 'capacity']).nullable().optional(),
  // How many times it was taken up again after it stopped short (feature agent-call-resume), when it
  // last ended, and what the latest go on from: how it had ended, how many turns the caller took
  // since, and what the user added. Older cores leave them out.
  attempt: z.number().int().nonnegative().default(0),
  endedAt: z.number().nullable().default(null),
  resumedFrom: z.object({
    state: z.enum(['failed', 'cancelled']), error: z.string().nullable(), endedAt: z.number().nullable(),
    turnsSince: z.number().int().nonnegative(), note: z.string().nullable()
  }).nullable().default(null),
  createdAt: z.number(), updatedAt: z.number()
})
export type AgentCall = z.infer<typeof AgentCall>
export function agentCallOpen(call: Pick<AgentCall, 'state'>): boolean {
  return ['queued', 'starting', 'running', 'awaiting'].includes(call.state)
}

// A call is taken up again at most this many times, so a caller cannot retry it without end.
export const MAX_AGENT_CALL_RESUMES = 3
// The reason a call never got its own conversation, which leaves nothing to go on from.
export const AGENT_CALL_NOT_STARTED = '成员启动中断，请重新委派'

export type AgentCallResumeBlocker = 'open' | 'completed' | 'not-started' | 'limit' | 'read-only' | 'parent-gone'

// Whether a call that stopped short can go on in its own conversation, where it left off. One still
// at work, or done, has nothing to go on with; one whose conversation never started has nowhere to.
// A call that edits goes on only while the caller may still edit: going on never widens what the
// user allowed. `caller`: null when the conversation that sent it is gone or archived.
export function checkResumeAgentCall(call: Pick<AgentCall, 'state' | 'error' | 'attempt' | 'readOnly'>, caller: { readOnly: boolean } | null): AgentCallResumeBlocker | null {
  if (agentCallOpen(call)) return 'open'
  if (call.state === 'completed') return 'completed'
  if (call.error === AGENT_CALL_NOT_STARTED) return 'not-started'
  if (call.attempt >= MAX_AGENT_CALL_RESUMES) return 'limit'
  if (!caller) return 'parent-gone'
  return !call.readOnly && caller.readOnly ? 'read-only' : null
}

// What going on means now, for the user to weigh it: how many turns the caller took since the call
// stopped, and a later call that did the same work, if one finished.
export const AgentCallResumeCheck = z.object({
  blocker: z.enum(['open', 'completed', 'not-started', 'limit', 'read-only', 'parent-gone', 'quota', 'gone']).nullable(),
  turnsSince: z.number().int().nonnegative(),
  redoneBy: z.string().uuid().nullable()
})
export type AgentCallResumeCheck = z.infer<typeof AgentCallResumeCheck>

export const AGENT_CALL_TOOLS = {
  list: 'antumi_agent_list', dispatch: 'antumi_agent_dispatch', status: 'antumi_agent_status', cancel: 'antumi_agent_cancel', resume: 'antumi_agent_resume'
} as const
