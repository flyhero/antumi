import { z } from 'zod'
import { AGENT_CALL_TOOLS, AgentCallWorkspace, DirectAgentCall, type DelegationQuota, type DelegationTarget, type RpcConnection } from '@antumi/protocol'

const dispatchArguments = z.object({ profileId: z.string().uuid().optional(), ...DirectAgentCall.partial().shape, instruction: z.string().trim().min(1).max(20000), ref: z.string().min(1).max(200) })
const argumentsFor = {
  list: z.object({}),
  dispatch: dispatchArguments,
  // On a core that lays members' worktrees out; an older one would drop the field and share the directories.
  dispatchInWorktree: dispatchArguments.extend({ workspace: AgentCallWorkspace.optional() }),
  status: z.object({}),
  cancel: z.object({ callId: z.string().uuid() }),
  resume: z.object({ callId: z.string().uuid() })
}
// The quota as an agent reads it: the window's name, how much is used, and a local clock for its reset.
function quotaSummary(quota: DelegationQuota) {
  const { window } = quota
  return { state: quota.state, ...window ? { window: window.kind, ...window.model ? { model: window.model } : {}, usedPercent: Math.round(window.usedPercent),
    ...window.resetsAt ? { resetsAt: new Date(window.resetsAt).toLocaleString('zh-CN', { hour12: false }) } : {} } : {}, ...quota.stale ? { stale: true } : {} }
}
const listed = (target: DelegationTarget) => target.profileId
  ? { id: target.profileId, name: target.name, description: target.description, agent: target.agent, capability: target.capability, quota: quotaSummary(target.quota) }
  : { name: target.name, agent: target.agent, readOnly: target.readOnly, quota: quotaSummary(target.quota) }
const descriptions = {
  list: '查找当前会话可以调用的智能体。带 id 的是用户配置的智能体，返回名称、擅长的工作、所用外部智能体和能力；不带 id 的是本机可直接调用的外部智能体，readOnly 表示能否只读工作。quota 是委派时会用到的额度：ok 充足，tight 紧张，exhausted 已用完（委派会被拒绝，resetsAt 后恢复），unknown 未知，provider 走模型服务、不计订阅额度。委派前先看额度，紧张时优先选额度充足的。',
  dispatch: '委派独立子任务，立即返回调用记录。用户配置的智能体传 profileId；外部智能体传 agent，可选 model、effort，capability 默认 readOnly，需要修改文件时传 develop。二者只传其一。额度已用完的会被拒绝。instruction 须包含目标、必要背景、文件范围和交付要求；子会话不继承聊天历史。ref 为本次工作自定的唯一引用，重试沿用。派活后结束回合，系统在结果就绪后自动继续主会话。',
  workspace: 'workspace 默认 shared：成员直接在主会话的目录里改，同目录的开发委派排队。worktree：成员在从当前提交拉出的独立 worktree 和分支上做，几个这样的委派可以并行，主会话也不用等；适合跨很多目录、彼此不重叠的机械性改动。要求主会话只有一个可写项目、是 Git 仓库、没有未提交的改动（未跟踪文件也算）。成员结束时把工作提交到自己的分支，结果里带分支名和提交数，由你合并并在合并后重新验证。每个 worktree 都要跑项目的 setup（可能装依赖），小改动不值得。',
  status: '查看当前会话的委派记录、状态和结果。不要反复轮询，结果会自动投递；在这里已看到的完成结果不会再投递。',
  cancel: '取消当前会话的一项委派，停止其 Agent 和归属命令，保留工作记录和文件。',
  resume: '让一项失败或被取消的委派在它原来的子会话里接着做，保留它之前的进度，结果像新委派一样自动送回，并标明是续跑。因中断、额度或报错失败的委派，优先续跑而不是重新委派；已完成、没启动成功或已续跑 3 次的不能续跑。不接受新的任务描述：任务有变化时重新委派。'
}
// The error the project's untrusted setup gives, as an agent is told of it: the user allows it in settings.
const untrusted = (error: unknown) => error instanceof Error && 'reason' in error && error.reason === 'project-config-untrusted'
  ? `项目 ${error.message} 的 setup 命令还没确认，请用户到设置 → 项目确认后再派 worktree 委派` : null
// features: what the core serves, read when the tools are made; a worktree member needs delegation-worktree.
export function agentToolsOverCore(withCore: <T>(action: (rpc: RpcConnection) => Promise<T>) => Promise<T>, id: string, features: readonly string[] = []) {
  const worktrees = features.includes('delegation-worktree')
  return (['list', 'dispatch', 'status', 'cancel', 'resume'] as const).map((kind) => ({
    spec: { name: AGENT_CALL_TOOLS[kind], description: kind === 'dispatch' && worktrees ? `${descriptions.dispatch}${descriptions.workspace}` : descriptions[kind],
      inputSchema: z.toJSONSchema(kind === 'dispatch' && worktrees ? argumentsFor.dispatchInWorktree : argumentsFor[kind]),
      annotations: { readOnlyHint: kind === 'list' || kind === 'status', destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    run: async (raw: Record<string, unknown>) => {
      try {
        let result: unknown
        if (kind === 'list') result = await withCore(async (rpc) => rpc.features.includes('direct-agent-calls') ? (await rpc.call('agentCalls.targets', { id })).map(listed)
          : (await rpc.call('agentProfiles.available', { id })).map((profile) => ({ id: profile.id, name: profile.name, description: profile.description, agent: profile.agent, capability: profile.capability })))
        else if (kind === 'dispatch') {
          const parsed = argumentsFor.dispatchInWorktree.parse(raw)
          if (parsed.workspace === 'worktree' && !worktrees) throw new Error('这个 core 不支持 worktree 委派，请不传 workspace')
          result = await withCore((rpc) => rpc.call('agentCalls.dispatch', { id, ...(worktrees ? parsed : argumentsFor.dispatch.parse(raw)) })).catch((error: unknown) => { throw new Error(untrusted(error) ?? (error instanceof Error ? error.message : String(error))) })
        }
        else if (kind === 'status') result = await withCore((rpc) => rpc.call('agentCalls.list', { id, read: true }))
        else if (kind === 'cancel') result = await withCore((rpc) => rpc.call('agentCalls.cancel', { id, ...argumentsFor.cancel.parse(raw) }))
        else result = await withCore((rpc) => rpc.call('agentCalls.resume', { id, ...argumentsFor.resume.parse(raw) }))
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: false }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true }
      }
    }
  }))
}
