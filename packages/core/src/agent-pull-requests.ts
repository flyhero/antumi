import type { AgentKind, AgentPullRequestRun, ChatDecision, PullRequestBlocker } from '@antumi/protocol'
import { adapterOf } from './agents'
import { TERMINAL_DECISION_WAIT_MS } from './agent-terminals'
import type { PullRequestService } from './pull-request-service'
import { Rejection } from './rejection'

type Owner = { agent: AgentKind; taskId: string | null; readOnly: boolean }
type Fields = { repoPath?: string; base?: string; title: string; body: string; draft: boolean }

const BLOCKED: Record<Exclude<PullRequestBlocker, 'existing-pr' | 'base-missing'>, string> = {
  'not-github': '这个项目的 origin 不在 GitHub 上。',
  'detached-head': 'worktree 没有检出分支。',
  auth: '这台电脑上没有 GitHub 凭据，请用户登录 gh 或在 Antumi 的设置里登录 GitHub。',
  'head-is-default': '分支就是仓库的默认分支，不能给它开 PR。',
  dirty: '还有未提交的改动，先全部提交再开 PR。',
  'no-commits': '分支上还没有新的提交。'
}

// Opens a pull request an agent asks for, for its task's branch, once the user lets it. An agent
// that asks for MCP tools itself has the request go straight through; for one that asks nothing
// (Codex), Antumi asks in the chat, as it does before running a command in a terminal.
export class AgentPullRequests {
  private readonly allowOnce = new Map<string, Set<string>>()

  constructor(
    private readonly owner: (conversationId: string) => Owner,
    private readonly pullRequests: Pick<PullRequestService, 'check' | 'create'>,
    private readonly ask: (conversationId: string, title: string, detail: string) => Promise<ChatDecision>,
    private readonly waitMs = TERMINAL_DECISION_WAIT_MS
  ) {}

  async run(conversationId: string, fields: Fields): Promise<AgentPullRequestRun> {
    const owner = this.owner(conversationId)
    if (!owner.taskId) throw new Rejection('pull-request-not-task', '这条会话不是任务，没有可开 PR 的分支。')
    if (owner.readOnly) throw new Rejection('read-only-workspace', '只读的会话不能开 PR。')
    const [eligibility] = await this.pullRequests.check(owner.taskId, fields.repoPath)
    if (!eligibility) throw new Rejection('repo-not-found', '任务没有这个项目。')
    if (eligibility.blocker === 'existing-pr') {
      if (eligibility.existing) return { outcome: 'created', link: eligibility.existing }
      throw new Rejection('pull-request-existing-pr', '这个分支已经有 PR。')
    }
    if (eligibility.blocker && eligibility.blocker !== 'base-missing') throw new Rejection(`pull-request-${eligibility.blocker}`, BLOCKED[eligibility.blocker])
    const base = fields.base ?? (eligibility.blocker === 'base-missing' ? eligibility.baseFallback : eligibility.base) ?? ''
    const headBranch = eligibility.headBranch ?? ''
    // The same request again, after the user said yes, is the one they said yes to.
    const key = `${eligibility.repoPath}\0${base}\0${fields.title}`
    if (adapterOf(owner.agent).mcpApproval === 'antumi' && !this.takeOnce(conversationId, key)) {
      // An answer that comes after the wait still counts, for the agent's next try.
      const asked = Promise.resolve().then(() => this.ask(conversationId, fields.title, `${headBranch} → ${base}`)).then(
        (decision) => {
          if (decision !== 'deny') this.remember(conversationId, key)
          return decision
        },
        (): ChatDecision => 'deny'
      )
      const decision = await Promise.race([asked, new Promise<null>((resolve) => setTimeout(() => resolve(null), this.waitMs).unref())])
      if (decision === null) return { outcome: 'awaiting' }
      if (decision === 'deny') return { outcome: 'denied' }
      this.takeOnce(conversationId, key)
    }
    const link = await this.pullRequests.create({ taskId: owner.taskId, repoPath: eligibility.repoPath, base, title: fields.title, body: fields.body, draft: fields.draft, from: headBranch }, { byAgent: true })
    return { outcome: 'created', link }
  }

  private remember(conversationId: string, key: string): void {
    const keys = this.allowOnce.get(conversationId) ?? new Set<string>()
    keys.add(key)
    this.allowOnce.set(conversationId, keys)
  }

  // A one-time yes, spent by the request it was given for.
  private takeOnce(conversationId: string, key: string): boolean {
    return this.allowOnce.get(conversationId)?.delete(key) ?? false
  }
}
