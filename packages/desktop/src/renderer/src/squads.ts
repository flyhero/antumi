import { useEffect } from 'react'
import { agentSupportsReadOnly, type AgentKind, type AgentProfile, type Squad, type SquadFields, type SquadMember, type SquadReadOnlyIssue, type SquadRun } from '@antumi/protocol'
import { perform, selectSquad, useCore } from './core-store'
import { replaySummaryChanges } from './attention-summaries'
import { t } from './i18n'
import { agentLabel } from './labels'

// Mirrors SquadService.resolve: linked roles supply the engine and model while each squad slot keeps its name and capability.
export function resolveSquadMembers(members: readonly SquadMember[], profiles: Readonly<Record<string, AgentProfile>>): SquadMember[] {
  return members.map((member) => {
    const profile = member.profileId ? profiles[member.profileId] : undefined
    if (!profile) return member
    return { ...member, agent: profile.agent, model: profile.model, effort: profile.effort }
  })
}

export function resolveSquadRoster(squad: Pick<Squad, 'members' | 'leaderId'>, profiles: Readonly<Record<string, AgentProfile>>): SquadMember[] {
  return resolveSquadMembers(squad.members, profiles)
}

export function defaultSquadMembers(installed: readonly AgentKind[], labels: {
  leader: string; leaderRole: string; developer: string; developerRole: string; reviewer: string; reviewerRole: string
}, createId: () => string = () => crypto.randomUUID()): SquadMember[] {
  const [leader = 'claude', reviewer = leader] = installed.filter(agentSupportsReadOnly)
  return [
    { id: createId(), name: labels.leader, agent: leader, model: null, effort: null, role: labels.leaderRole, capability: 'readOnly' },
    { id: createId(), name: labels.developer, agent: installed[0] ?? 'claude', model: null, effort: null, role: labels.developerRole, capability: 'develop' },
    { id: createId(), name: labels.reviewer, agent: reviewer, model: null, effort: null, role: labels.reviewerRole, capability: 'readOnly' }
  ]
}

export function defaultAddedMember(installed: readonly AgentKind[], name: string, createId: () => string = () => crypto.randomUUID()): SquadMember {
  const reader = installed.find(agentSupportsReadOnly)
  return { id: createId(), name, agent: reader ?? installed[0] ?? 'claude', model: null, effort: null, role: '', capability: reader ? 'readOnly' : 'develop' }
}

export function squadReadOnlyIssueText(issue: SquadReadOnlyIssue): string {
  return t(issue.leader ? 'SquadLaunchDialog.leaderReadOnlyUnsupported' : 'SquadLaunchDialog.memberReadOnlyUnsupported', {
    name: issue.memberName, agent: agentLabel(issue.agent)
  })
}

export async function saveSquad(fields: SquadFields, id?: string): Promise<Squad | null> {
  const squad = await perform((rpc) => id ? rpc.call('squads.update', { id, ...fields }) : rpc.call('squads.create', fields))
  if (squad) {
    useCore.setState((state) => ({ squads: { ...state.squads, [squad.id]: squad } }))
    selectSquad(squad.id)
  }
  return squad
}

export function useSquadRuns(taskId: string): SquadRun[] {
  const rpc = useCore((state) => state.rpc)
  const runs = useCore((state) => state.squadRuns)
  useEffect(() => {
    if (!rpc?.features.includes('squads')) return
    let current = true
    const changes = new Map<string, SquadRun | null>()
    const off = rpc.on('squads.runChanged', ({ run }) => { if (run.taskId === taskId) changes.set(run.id, run) })
    void rpc.call('squads.runs', { id: taskId }).then((list) => {
      if (!current) return
      useCore.setState((state) => ({ squadRuns: { ...state.squadRuns, ...replaySummaryChanges(list, changes) } }))
    }, (error: unknown) => {
      if (current) useCore.setState({ error: error instanceof Error ? error.message : String(error) })
    }).finally(off)
    return () => { current = false; off() }
  }, [rpc, taskId])
  return Object.values(runs).filter((run) => run.taskId === taskId).sort((a, b) => b.createdAt - a.createdAt)
}
