import { randomUUID } from 'node:crypto'
import { canDelegate, callerReadOnly, ChatPermissionMode, squadCallOpen, squadModes, squadReadOnlyIssues, type AgentKind, type Conversation, type DelegationQuota, type Squad, type SquadCall, type SquadCallTarget, type SquadRun } from '@antumi/protocol'
import type { AgentProfileService } from './agent-profile-service'
import { delegatedMode } from './agent-profile-service'
import type { ConversationService } from './conversation-service'
import type { DelegationResultSource } from './delegation-delivery-service'
import { committedHead, describeWorktreeOutcome, readWorktreeOutcome } from './delegation-worktree'
import { Rejection } from './rejection'
import type { SquadCallStore } from './squad-call-store'
import { squadReadOnlyReason, type SquadService } from './squad-service'
import type { TaskService } from './task-service'
import { gitTopLevel } from './workspace'

type Member = Squad['members'][number]
type Options = {
  changed(call: SquadCall): void
  quota(member: Member): DelegationQuota
  disabled(): readonly AgentKind[]
  trust(paths: string[]): Promise<unknown>
}

// A chat's request becomes an ordinary task; SquadService remains the sole team scheduler.
export class SquadCallService {
  private chain: Promise<unknown> = Promise.resolve()
  private readonly starting = new Set<string>()
  private scheduled = false
  private closed = false
  constructor(private readonly store: SquadCallStore, private readonly tasks: TaskService, private readonly squads: SquadService,
    private readonly chats: ConversationService, private readonly profiles: AgentProfileService, private readonly options: Options) {}
  snapshot(taskId: string): Squad | null { return this.store.forTask(taskId)?.squad ?? null }
  starts(taskId: string): ReadonlyMap<string, string> {
    return new Map(this.store.forTask(taskId)?.sources.flatMap((source) => source.base ? [[source.path, source.base] as const] : []) ?? [])
  }
  brief(taskId: string): string {
    return this.store.forTask(taskId)
      ? '\n此任务来自主会话的团队委派。请派开发成员完成必要验证并把任务改动提交到各自任务分支，之后才可提交成果；不要 push、合并或切换分支。主会话收到结果后负责合并和重新验证。'
      : ''
  }
  memberAllowed(member: Member): void {
    if (this.options.disabled().includes(member.agent)) throw new Rejection('agent-disabled', '成员使用的外部智能体已停用')
    if (this.options.quota(member).state === 'exhausted') throw new Rejection('agent-quota-exhausted', `${member.name} 的额度已用完，请改派其他成员或等待额度恢复`)
  }
  private eligible(parent: Conversation): boolean {
    return canDelegate(parent, Boolean(parent.taskId && this.tasks.get(parent.taskId).squadId))
  }
  targets(id: string): SquadCallTarget[] {
    const parent = this.chats.get(id)
    if (!this.eligible(parent)) return []
    return this.squads.list().filter((squad) => squad.archivedAt === null && (!parent.profile || parent.profile.callableSquads.includes(squad.id))).map((saved) => {
      let squad = saved
      let reason: string | null = null
      try { squad = this.squads.resolve(saved) } catch (error) { reason = error instanceof Error ? error.message : String(error) }
      if (callerReadOnly(parent)) reason = '当前会话只能规划或读取，不能启动开发团队'
      if (squad.members.some((member) => this.options.disabled().includes(member.agent))) reason = '团队成员使用的外部智能体已停用'
      const modes = squadModes(squad, this.chats.allowsBypass(id))
      const mode = ChatPermissionMode.parse(delegatedMode(parent.chatOptions?.permissionMode, this.chats.allowsBypass(id), modes))
      if (!modes.includes(mode)) reason = '团队成员不支持当前授权范围内的权限模式'
      const quotas = squad.members.map((member) => ({ memberId: member.id, quota: this.options.quota(member) }))
      if (quotas.find((entry) => entry.memberId === squad.leaderId)?.quota.state === 'exhausted') reason = '队长的额度已用完'
      const readOnlyIssue = !reason ? squadReadOnlyIssues(squad)[0] : undefined
      if (readOnlyIssue) reason = squadReadOnlyReason(readOnlyIssue)
      return { squad, reason, permissionMode: reason ? null : mode, quotas }
    })
  }
  list(id: string, read = false): SquadCall[] {
    this.chats.get(id)
    if (read) for (const call of this.store.list(id)) if (call.deliveredVersion < call.version) this.patch(call.id, { deliveredVersion: call.version })
    return this.store.list(id)
  }
  summary(id: string): { open: number; awaiting: number } {
    const calls = this.store.list(id).filter(squadCallOpen)
    return { open: calls.length, awaiting: calls.filter((call) => call.state === 'awaiting' || call.state === 'paused').length }
  }
  async dispatch(id: string, squadId: string, instruction: string, ref: string, images: string[] = []): Promise<SquadCall> {
    return this.serially(async () => {
      if (this.closed) throw new Rejection('core-stopping')
      const existing = this.store.list(id).find((call) => call.ref === ref)
      if (existing) {
        if (existing.squad.id !== squadId || existing.instruction !== instruction.trim() || JSON.stringify(existing.images) !== JSON.stringify(images)) throw new Rejection('invalid-params', '调用引用已经用于其他团队工作')
        return existing
      }
      const parent = this.chats.get(id)
      const target = this.targets(id).find((entry) => entry.squad.id === squadId)
      if (!target || target.reason || !target.permissionMode) throw new Rejection('squad-call-forbidden', target?.reason ?? '当前会话不能调用这个团队')
      if (this.store.list(id).filter(squadCallOpen).length + this.profiles.calls(id).filter((call) => ['queued', 'starting', 'running', 'awaiting'].includes(call.state)).length >= 10) throw new Rejection('agent-call-limit', '请先等待已有委派完成')
      const writable = parent.projectPaths.filter((source) => !parent.referencePaths?.includes(source))
      if (!writable.length) throw new Rejection('missing-repo', '请先为会话选择可写的 Git 项目')
      const roots = new Set<string>()
      const sources: SquadCall['sources'] = []
      for (const source of writable) {
        const root = await gitTopLevel(source)
        if (!root) throw new Rejection('worktree-not-git', `${source} 不是 Git 项目，不能创建独立团队工作区`)
        if (roots.has(root)) throw new Rejection('repo-duplicate', '多个可写目录指向同一 Git 仓库')
        roots.add(root)
        sources.push({ path: source, base: await committedHead(source), reference: false })
      }
      for (const source of parent.referencePaths ?? []) sources.push({ path: source, base: null, reference: true })
      await this.options.trust(writable)
      const at = Date.now()
      const call: SquadCall = { id: randomUUID(), parentId: id, taskId: randomUUID(), ref, squad: target.squad,
        instruction: instruction.trim(), images, sources, permissionMode: target.permissionMode, allowBypass: target.permissionMode === 'bypass' && this.chats.allowsBypass(id),
        runId: null, state: 'queued', result: null, error: null, version: 0, deliveredVersion: 0, outcomes: [], createdAt: at, updatedAt: at }
      await this.tasks.createLinkedTask({
        title: call.instruction.split('\n')[0]!.slice(0, 100), details: call.instruction, agent: call.squad.members.find((member) => member.id === call.squad.leaderId)!.agent,
        squadId: call.squad.id, images, repos: call.sources.map((source) => ({ path: source.path, worktreePath: null, branch: null, startRef: null, start: null, reference: source.reference }))
      }, this.store.link(call))
      this.options.changed(call)
      this.tick()
      return call
    })
  }
  async cancel(id: string, callId: string): Promise<SquadCall> {
    const call = this.store.get(callId)
    if (call.parentId !== id) throw new Rejection('squad-call-forbidden')
    await this.tasks.cancel(call.taskId, '主会话取消了团队调用')
    return this.patch(call.id, { state: 'cancelled', version: call.version + 1, error: '团队任务已取消' })
  }
  async beforeStart(taskId: string): Promise<void> {
    const call = this.store.forTask(taskId)
    if (!call) return
    this.memberAllowed(call.squad.members.find((member) => member.id === call.squad.leaderId)!)
    const task = this.tasks.get(call.taskId)
    for (const source of call.sources.filter((entry) => !entry.reference && !task.repos.find((repo) => repo.path === entry.path)?.worktreePath)) {
      if (await committedHead(source.path) !== source.base) throw new Rejection('squad-source-changed', `${source.path} 的提交已改变，请重新发起团队调用`)
    }
  }
  async beforeFinish(run: SquadRun): Promise<void> {
    const call = this.store.forTask(run.taskId)
    if (!call) return
    const outcomes = await this.outcomes(call)
    if (outcomes.some((entry) => entry.outcome.error || entry.outcome.changes !== 0 || entry.outcome.branch !== entry.branch)) {
      throw new Rejection('squad-work-uncommitted', '工作区尚未提交、分支已改变或 Git 状态无法确认，请派开发成员处理后再提交成果')
    }
  }
  deliverySource(): DelegationResultSource {
    return {
      name: 'squad', parents: () => [...new Set(this.store.list().filter((call) => squadCallOpen(call) || call.version > call.deliveredVersion).map((call) => call.parentId))],
      pending: (id) => this.store.list(id).filter((call) => call.version > call.deliveredVersion).map((call) => ({
        source: 'squad', key: call.id, version: call.version,
        body: { kind: 'squad', callId: call.id, name: call.squad.name, state: call.state, result: call.result, error: call.error,
          taskId: call.taskId, runId: call.runId, version: call.version, outcomes: call.outcomes }
      })),
      acknowledge: (entries) => { for (const entry of entries) { const call = this.store.get(entry.key); if (entry.version > call.deliveredVersion) this.patch(call.id, { deliveredVersion: entry.version }) } },
      active: (id) => this.store.list(id).some((call) => ['queued', 'starting', 'running'].includes(call.state)),
      writing: () => false
    }
  }
  tick(): void {
    if (this.closed || this.scheduled) return
    this.scheduled = true
    setImmediate(() => {
      this.scheduled = false
      if (this.closed) return
      void this.serially(() => this.advance()).catch((error: unknown) => console.error('[antumi-core] team call failed', error))
    })
  }
  async reconcile(): Promise<void> {
    for (const call of this.store.list().filter((entry) => entry.state === 'starting')) {
      const task = this.tasks.list().find((entry) => entry.id === call.taskId)
      if (task?.status === 'pending' && !this.squads.runs(task.id).length) this.patch(call.id, { state: 'queued' })
    }
    await this.serially(() => this.advance())
  }
  async close(): Promise<void> { if (this.closed) return; this.closed = true; await this.chain.catch(() => {}); this.store.close() }
  private async outcomes(call: SquadCall): Promise<SquadCall['outcomes']> {
    const task = this.tasks.get(call.taskId)
    return Promise.all(task.repos.filter((repo) => !repo.reference).map(async (repo) => {
      const source = call.sources.find((entry) => entry.path === repo.path)
      if (!repo.worktreePath || !repo.branch || !source?.base) throw new Rejection('squad-workspace-missing', '团队工作区或固定起点已丢失')
      return { source: repo.path, dir: repo.worktreePath, branch: repo.branch, base: source.base, outcome: await readWorktreeOutcome(repo.worktreePath, source.base) }
    }))
  }
  private async advance(): Promise<void> {
    const tasks = new Map(this.tasks.list().map((task) => [task.id, task]))
    for (const call of this.store.list()) {
      if (this.starting.has(call.id)) continue
      const task = tasks.get(call.taskId)
      if (!task) { if (call.error !== '团队任务已删除') this.patch(call.id, { state: 'failed', error: '团队任务已删除', version: call.version + 1 }); continue }
      const run = this.squads.runs(task.id)[0]
      if (task.status === 'abandoned') { if (call.state !== 'cancelled') this.patch(call.id, { state: 'cancelled', version: call.version + 1 }); continue }
      if (run) {
        if (run.state === 'cancelled') { if (call.state !== 'cancelled') this.patch(call.id, { state: 'cancelled', version: call.version + 1 }); continue }
        if (run.state === 'review' && (call.state !== 'review' || call.runId !== run.id)) {
          const outcomes = await this.outcomes(call)
          const result = [run.summary, ...outcomes.map((entry) => describeWorktreeOutcome(entry.branch, entry.outcome))].filter(Boolean).join('\n\n')
          this.patch(call.id, { state: 'review', runId: run.id, result, error: null, outcomes, version: call.version + 1 })
        } else if (run.state === 'running') {
          const state = this.squads.awaiting(task.id) ? 'awaiting' : 'running'
          if (call.state !== state || call.runId !== run.id) this.patch(call.id, { state, runId: run.id, error: null })
        } else if (run.state === 'paused' && call.state !== 'paused') this.patch(call.id, { state: 'paused', runId: run.id })
        continue
      }
      if (call.state !== 'queued') continue
      const leader = call.squad.members.find((member) => member.id === call.squad.leaderId)!
      if (!this.chats.capacityAvailable(leader.agent)) continue
      this.starting.add(call.id)
      this.patch(call.id, { state: 'starting' })
      void this.start(call).catch((error: unknown) => {
        if (this.closed) return
        const message = error instanceof Error ? error.message : String(error)
        const current = this.store.get(call.id)
        this.patch(call.id, { state: 'failed', error: message, version: current.version + 1 })
      }).finally(() => { this.starting.delete(call.id); this.tick() })
    }
  }
  private async start(call: SquadCall): Promise<void> {
    let permissionMode = call.permissionMode
    let allowBypass = call.allowBypass
    const parent = this.chats.listAll().find((entry) => entry.id === call.parentId)
    if (parent && parent.archivedAt == null) {
      if (callerReadOnly(parent)) throw new Rejection('squad-call-forbidden', '主会话现在只允许读取，不能启动开发团队')
      allowBypass = this.chats.allowsBypass(parent.id)
      const modes = squadModes(call.squad, allowBypass)
      permissionMode = ChatPermissionMode.parse(delegatedMode(parent.chatOptions?.permissionMode, allowBypass, modes))
      if (!modes.includes(permissionMode)) throw new Rejection('chat-option-invalid')
    }
    allowBypass = permissionMode === 'bypass' && allowBypass
    this.patch(call.id, { permissionMode, allowBypass })
    await this.squads.start(call.taskId, allowBypass, { permissionMode }, call.squad.id)
  }
  private patch(id: string, fields: Partial<SquadCall>): SquadCall {
    const call = this.store.patch(id, fields); this.options.changed(call); return call
  }
  private serially<T>(action: () => Promise<T>): Promise<T> {
    const next = this.chain.catch(() => {}).then(action); this.chain = next; return next
  }
}
