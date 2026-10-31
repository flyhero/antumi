import { z } from 'zod'
import { AGENT_CALL_TOOLS, DirectAgentCall, type DelegationQuota, type DelegationTarget, type RpcConnection } from '@antumi/protocol'

const argumentsFor = {
  list: z.object({}),
  dispatch: z.object({ profileId: z.string().uuid().optional(), ...DirectAgentCall.partial().shape, instruction: z.string().trim().min(1).max(20000), ref: z.string().min(1).max(200) }),
  status: z.object({}),
  cancel: z.object({ callId: z.string().uuid() })
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
  status: '查看当前会话的委派记录、状态和结果。不要反复轮询，结果会自动投递。',
  cancel: '取消当前会话的一项委派，停止其 Agent 和归属命令，保留工作记录和文件。'
}
export function agentToolsOverCore(withCore: <T>(action: (rpc: RpcConnection) => Promise<T>) => Promise<T>, id: string) {
  return (['list', 'dispatch', 'status', 'cancel'] as const).map((kind) => ({
    spec: { name: AGENT_CALL_TOOLS[kind], description: descriptions[kind], inputSchema: z.toJSONSchema(argumentsFor[kind]),
      annotations: { readOnlyHint: kind === 'list' || kind === 'status', destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    run: async (raw: Record<string, unknown>) => {
      try {
        let result: unknown
        if (kind === 'list') result = await withCore(async (rpc) => rpc.features.includes('direct-agent-calls') ? (await rpc.call('agentCalls.targets', { id })).map(listed)
          : (await rpc.call('agentProfiles.available', { id })).map((profile) => ({ id: profile.id, name: profile.name, description: profile.description, agent: profile.agent, capability: profile.capability })))
        else if (kind === 'dispatch') result = await withCore((rpc) => rpc.call('agentCalls.dispatch', { id, ...argumentsFor.dispatch.parse(raw) }))
        else if (kind === 'status') result = await withCore((rpc) => rpc.call('agentCalls.list', { id }))
        else result = await withCore((rpc) => rpc.call('agentCalls.cancel', { id, ...argumentsFor.cancel.parse(raw) }))
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: false }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true }
      }
    }
  }))
}
