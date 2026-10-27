import { z } from 'zod'
import { SQUAD_TOOL_NAMES, type RpcConnection, type SquadRun } from '@antumi/protocol'

const argumentsFor = {
  roster: z.object({}),
  dispatch: z.object({ memberId: z.string().uuid(), instruction: z.string().trim().min(1).max(20000), capability: z.enum(['readOnly', 'develop']), retryOf: z.string().uuid().optional() }),
  finish: z.object({ summary: z.string().trim().min(1).max(20000) })
}
const descriptions = {
  roster: '查看当前任务的团队成员、职责、工作指令和结果。',
  dispatch: '给当前团队成员派活，立即返回工作 ID。派活后结束回合，成员完成后系统自动唤醒负责人。retryOf 可替换一次失败或取消的工作。',
  finish: '负责人提交整体成果及验证摘要。所有工作须处理完毕，当前回合成功结束后任务进入待验收。'
}
export type SquadTools = ReturnType<typeof squadToolsOverCore>
export function squadToolsOverCore(withCore: <T>(action: (rpc: RpcConnection) => Promise<T>) => Promise<T>, conversationId: string, run: SquadRun) {
  const kinds = run.leaderConversationId === conversationId ? ['roster', 'dispatch', 'finish'] as const : ['roster'] as const
  return kinds.map((kind) => ({
    spec: {
      name: SQUAD_TOOL_NAMES[kind],
      description: descriptions[kind],
      inputSchema: z.toJSONSchema(argumentsFor[kind]),
      annotations: { readOnlyHint: kind === 'roster', destructiveHint: false, idempotentHint: kind === 'roster', openWorldHint: false }
    },
    run: async (raw: Record<string, unknown>) => {
      try {
        let result: unknown
        if (kind === 'roster') result = await withCore((rpc) => rpc.call('squads.roster', { id: conversationId }))
        else if (kind === 'dispatch') result = await withCore((rpc) => rpc.call('squads.dispatch', { id: conversationId, ...argumentsFor.dispatch.parse(raw) }))
        else result = await withCore((rpc) => rpc.call('squads.finish', { id: conversationId, ...argumentsFor.finish.parse(raw) }))
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: false }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true }
      }
    }
  }))
}
