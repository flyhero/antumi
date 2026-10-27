import { z } from 'zod'
import { AGENT_CALL_TOOLS, type RpcConnection } from '@antumi/protocol'

const argumentsFor = {
  list: z.object({}),
  dispatch: z.object({ profileId: z.string().uuid(), instruction: z.string().trim().min(1).max(20000), ref: z.string().min(1).max(200) }),
  status: z.object({}),
  cancel: z.object({ callId: z.string().uuid() })
}
const descriptions = {
  list: '查找当前会话可以调用的智能体，返回名称、擅长的工作、所用外部智能体和能力。',
  dispatch: '委派独立子任务，立即返回调用记录。instruction 须包含目标、必要背景、文件范围和交付要求；子会话不继承聊天历史。ref 为本次工作自定的唯一引用，重试沿用。派活后结束回合，系统在结果就绪后自动继续主会话。',
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
        if (kind === 'list') result = (await withCore((rpc) => rpc.call('agentProfiles.available', { id }))).map((profile) => ({ id: profile.id, name: profile.name, description: profile.description, agent: profile.agent, capability: profile.capability }))
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
