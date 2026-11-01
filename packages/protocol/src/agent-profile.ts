import { z } from 'zod'
import { AgentKind } from './agent'
import { SkillRef } from './skills'
import { ModelProviderId } from './model-provider'
import { UsageWindow } from './usage'

export const AgentProfileFields = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(2000).default(''),
  instructions: z.string().trim().max(20000).default(''),
  agent: AgentKind,
  model: z.string().trim().min(1).max(200).nullable().default(null),
  effort: z.string().trim().min(1).max(200).nullable().default(null),
  modelProvider: ModelProviderId.nullable().default(null),
  capability: z.enum(['readOnly', 'develop']).default('readOnly'),
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
  capability: z.enum(['readOnly', 'develop']).nullable(), readOnly: z.boolean(), quota: DelegationQuota
})
export type DelegationTarget = z.infer<typeof DelegationTarget>
export const DirectAgentCall = z.object({
  agent: AgentKind,
  model: z.string().trim().min(1).max(200).optional(),
  effort: z.string().trim().min(1).max(200).optional(),
  capability: z.enum(['readOnly', 'develop']).optional()
})
export type DirectAgentCall = z.infer<typeof DirectAgentCall>

export const AgentCall = z.object({
  id: z.string().uuid(), parentId: z.string().uuid(), conversationId: z.string().uuid(),
  profile: AgentProfile, instruction: z.string().trim().min(1).max(20000),
  ref: z.string().nullable().default(null),
  permissionMode: z.string(), readOnly: z.boolean(),
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
