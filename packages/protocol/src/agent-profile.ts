import { z } from 'zod'
import { AgentKind } from './agent'
import { SkillRef } from './skills'
import { ModelProviderId } from './model-provider'

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
  createdAt: z.number(), updatedAt: z.number()
})
export type AgentCall = z.infer<typeof AgentCall>
export function agentCallOpen(call: Pick<AgentCall, 'state'>): boolean {
  return ['queued', 'starting', 'running', 'awaiting'].includes(call.state)
}

export const AGENT_CALL_TOOLS = {
  list: 'antumi_agent_list', dispatch: 'antumi_agent_dispatch', status: 'antumi_agent_status', cancel: 'antumi_agent_cancel'
} as const
