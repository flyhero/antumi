import { z } from 'zod'
import { AgentProfile } from './agent-profile'
import { AgentKind } from './agent'
import { agentDescriptor } from './agents'
import { ChatPermissionMode } from './chat'

export const SQUAD_TOOL_NAMES = { roster: 'antumi_squad_roster', dispatch: 'antumi_squad_dispatch', finish: 'antumi_squad_finish' } as const

export const SquadMember = z.object({
  profileId: z.string().uuid().nullable().optional(),
  profile: AgentProfile.optional(),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  agent: AgentKind,
  model: z.string().trim().min(1).max(200).nullable().default(null),
  effort: z.string().trim().min(1).max(200).nullable().default(null),
  role: z.string().trim().max(2000).default(''),
  capability: z.enum(['readOnly', 'develop']).default('readOnly')
})
export type SquadMember = z.infer<typeof SquadMember>

export const SquadFields = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  instructions: z.string().trim().max(10000).default(''),
  members: z.array(SquadMember).min(2).max(5),
  leaderId: z.string().uuid()
}).superRefine((squad, ctx) => {
  const leader = squad.members.find((member) => member.id === squad.leaderId)
  if (!leader || leader.capability !== 'readOnly') ctx.addIssue({ code: 'custom', message: '队长必须是只读成员', params: { reason: 'squad-leader-read-only' }, path: ['leaderId'] })
  if (!squad.members.some((member) => member.capability === 'develop')) ctx.addIssue({ code: 'custom', message: '至少需要一名开发成员', params: { reason: 'squad-developer-required' }, path: ['members'] })
  if (new Set(squad.members.map((member) => member.id)).size !== squad.members.length || new Set(squad.members.map((member) => member.name.toLowerCase())).size !== squad.members.length) ctx.addIssue({ code: 'custom', message: '成员标识和名称不能重复', params: { reason: 'squad-member-duplicate' }, path: ['members'] })
})
export type SquadFields = z.input<typeof SquadFields>

export const Squad = SquadFields.safeExtend({
  id: z.string().uuid(),
  archivedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Squad = z.infer<typeof Squad>

export function agentSupportsReadOnly(agent: AgentKind): boolean {
  return agentDescriptor(agent).capabilities.readOnly !== false
}

export function agentSupportsPlan(agent: AgentKind, backend?: string | null): boolean {
  const descriptor = agentDescriptor(agent)
  const modes = backend && descriptor.backendModes?.[backend] ? descriptor.backendModes[backend] : Object.keys(descriptor.modes)
  return modes.includes('plan')
}

export type SquadReadOnlyIssue = { memberId: string; memberName: string; agent: AgentKind; leader: boolean }

export function squadReadOnlyIssues(squad: Pick<Squad, 'members' | 'leaderId'>): SquadReadOnlyIssue[] {
  const issues: SquadReadOnlyIssue[] = []
  for (const member of squad.members) {
    const leader = member.id === squad.leaderId
    if ((!leader && member.capability !== 'readOnly') || agentSupportsReadOnly(member.agent)) continue
    const issue = { memberId: member.id, memberName: member.name, agent: member.agent, leader }
    if (leader) issues.unshift(issue)
    else issues.push(issue)
  }
  return issues
}

export const SquadWork = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
  conversationId: z.string().uuid().nullable(),
  instruction: z.string().trim().min(1).max(20000),
  capability: z.enum(['readOnly', 'develop']),
  state: z.enum(['queued', 'starting', 'running', 'awaiting', 'completed', 'failed', 'cancelled']),
  result: z.string().nullable(),
  error: z.string().nullable(),
  delivered: z.boolean(),
  retryOf: z.string().uuid().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type SquadWork = z.infer<typeof SquadWork>

export const SquadRun = z.object({
  id: z.string().uuid(),
  taskId: z.string(),
  squad: Squad,
  leaderConversationId: z.string().uuid().nullable(),
  state: z.enum(['running', 'paused', 'review', 'cancelled']),
  permissionMode: ChatPermissionMode,
  allowBypass: z.boolean(),
  summary: z.string().nullable(),
  delivery: z.object({ id: z.string(), workIds: z.array(z.string().uuid()), text: z.string() }).nullable().default(null),
  works: z.array(SquadWork),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type SquadRun = z.infer<typeof SquadRun>

export const SquadPlanRef = z.object({ stageId: z.string().uuid(), requestId: z.string().min(1).max(200) })
export type SquadPlanRef = z.infer<typeof SquadPlanRef>

export function squadModes(squad: Pick<Squad, 'members'>, allowBypass = false): ChatPermissionMode[] {
  return ChatPermissionMode.options.filter((mode) => mode !== 'plan' && mode !== 'readOnly' && (mode !== 'bypass' || allowBypass)
    && squad.members.filter((member) => member.capability === 'develop').every((member) => agentDescriptor(member.agent).startModes.includes(mode) || (mode === 'bypass' && agentDescriptor(member.agent).capabilities.bypass)))
}

export function checkSquadStart(task: { status: string; repos: readonly unknown[] }, dependencies: readonly { status: string }[], plan = false): string | null {
  if (task.status !== 'pending' && !(plan && task.status === 'running')) return 'not-pending'
  if (!task.repos.length) return 'missing-repo'
  return dependencies.some((dependency) => dependency.status !== 'done') ? 'dependencies-unfinished' : null
}

export function squadWorkOpen(work: Pick<SquadWork, 'state'>): boolean {
  return work.state === 'queued' || squadWorkActive(work)
}

export function squadWorkActive(work: Pick<SquadWork, 'state'>): boolean {
  return work.state === 'starting' || work.state === 'running' || work.state === 'awaiting'
}
