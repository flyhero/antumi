import { describe, expect, it } from 'vitest'
import { Squad, SquadFields, agentSupportsPlan, agentSupportsReadOnly, checkSquadStart, squadModes, squadReadOnlyIssues } from './squad'
import { Task } from './task'
import { checkScheduleTask } from './schedule'
import { rpcSchemas } from './rpc'

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const fields = () => ({ name: 'Delivery', leaderId: id(1), members: [
  { id: id(1), name: 'Lead', agent: 'claude' as const, capability: 'readOnly' as const },
  { id: id(2), name: 'Build', agent: 'codex' as const, capability: 'develop' as const },
  { id: id(3), name: 'Review', agent: 'cursor' as const, capability: 'readOnly' as const }
] })
describe('squad contracts', () => {
  it('supports repeated agent kinds with distinct roles and rejects invalid rosters', () => {
    const squad = fields()
    expect(SquadFields.parse(squad).members[0]?.role).toBe('')
    expect(SquadFields.safeParse({ ...squad, leaderId: id(9) }).success).toBe(false)
    expect(SquadFields.safeParse({ ...squad, leaderId: id(2) }).success).toBe(false)
    expect(SquadFields.safeParse({ ...squad, members: squad.members.map((member) => ({ ...member, capability: 'readOnly' })) }).success).toBe(false)
    expect(SquadFields.safeParse({ ...squad, members: [squad.members[0], squad.members[0], squad.members[1]] }).success).toBe(false)
    expect(SquadFields.safeParse({ ...squad, members: [squad.members[0], { ...squad.members[1], name: 'lead' }] }).success).toBe(false)
  })
  it.each(['gemini', 'codebuddy', 'kimi'] as const)('requires %s to work as a developer', (agent) => {
    expect(agentSupportsReadOnly(agent)).toBe(false)
    const squad = SquadFields.parse(fields())
    expect(squadReadOnlyIssues({ ...squad, members: squad.members.map((member) =>
      member.capability === 'develop' ? { ...member, agent } : member) })).toEqual([])
  })

  it.each(['claude', 'codex', 'cursor', 'opencode', 'pi', 'dsh', 'zcode', 'codearts', 'antigravity'] as const)('%s supports read-only work', (agent) => {
    expect(agentSupportsReadOnly(agent)).toBe(true)
  })

  it('checks backend-specific plan mode support for squad leaders', () => {
    expect(agentSupportsPlan('antigravity', 'agy-cli')).toBe(true)
    expect(agentSupportsPlan('antigravity', 'managed-acp')).toBe(false)
    expect(agentSupportsPlan('antigravity', null)).toBe(true)
    expect(agentSupportsPlan('claude', null)).toBe(true)
  })

  it('loads legacy squads and reports an unsupported lead before the other read-only members', () => {
    const squad = Squad.parse({ ...fields(), id: id(4), archivedAt: null, createdAt: 0, updatedAt: 0, members: [
      { id: id(3), name: 'Review', agent: 'kimi', capability: 'readOnly' },
      { id: id(2), name: 'Build', agent: 'antigravity', capability: 'develop' },
      { id: id(1), name: 'Lead', agent: 'gemini', capability: 'readOnly' }
    ] })
    expect(squadReadOnlyIssues(squad)).toEqual([
      { memberId: id(1), memberName: 'Lead', agent: 'gemini', leader: true },
      { memberId: id(3), memberName: 'Review', agent: 'kimi', leader: false }
    ])
  })

  it('offers the intersection of development modes without promoting permissions', () => {
    const squad = SquadFields.parse(fields())
    expect(squadModes(squad)).toEqual(['ask', 'acceptEdits'])
    expect(squadModes(squad, true)).toContain('bypass')
    const mixed = { ...squad, members: [...squad.members, { ...squad.members[1]!, id: id(4), agent: 'cursor' as const }] }
    expect(squadModes(mixed, true)).toEqual(['ask'])
  })
  it('blocks unfinished dependencies, running reassignment and scheduled squad execution', () => {
    const task = Task.parse({ id: 't', title: 'Task', details: '', status: 'pending', repos: [{ path: '/p', branch: null, worktreePath: null }], dependsOn: [], agent: 'claude', squadId: id(5), createdAt: 0, updatedAt: 0 })
    expect(checkSquadStart(task, [{ status: 'review' }])).toBe('dependencies-unfinished')
    expect(checkSquadStart({ ...task, status: 'running' }, [])).toBe('not-pending')
    expect(checkSquadStart({ ...task, status: 'running' }, [], true)).toBeNull()
    expect(checkScheduleTask(task, [])).toBe('squad-schedule-unsupported')
    expect(rpcSchemas['squads.start'].params.parse({ id: 't', squadId: id(5) }).permissionMode).toBe('ask')
  })
})
