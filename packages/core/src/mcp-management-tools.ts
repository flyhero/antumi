import { z } from 'zod'
import {
  AgentProfileFields, ChatCommandFields, MANAGEMENT_READ_TOOLS, MANAGEMENT_TOOLS, rpcMethods,
  type Conversation, type RpcConnection, type RpcMethod, type RpcParams
} from '@antumi/protocol'

type WithCore = <T>(action: (rpc: RpcConnection) => Promise<T>) => Promise<T>
type Access = 'none' | 'readOnly' | 'write'

function managementAccess(conversation: Conversation, squad: boolean): Access {
  if (squad || conversation.parentConversationId || conversation.discussionId || conversation.squadRunId
    || conversation.routineId || conversation.helperOf || conversation.archivedAt != null) return 'none'
  return conversation.workspaceReadOnly || conversation.planOnly
    || ['plan', 'readOnly'].includes(conversation.chatOptions?.permissionMode ?? '') ? 'readOnly' : 'write'
}

async function scope(rpc: RpcConnection, id: string) {
  const conversation = await rpc.call('conversations.get', { id })
  if (managementAccess(conversation, false) === 'none') return 'none'
  // A task's leader has no squadRunId; its planning stage may not have a run yet either.
  if (conversation.taskId && rpc.features.includes('squads')) {
    const task = await rpc.call('tasks.get', { id: conversation.taskId })
    if (task.squadId) return 'none'
  }
  const squad = rpc.features.includes('squads') && await rpc.call('squads.roster', { id })
  return managementAccess(conversation, Boolean(squad))
}

// Reuse the RPC contracts, with create-only schemas for the two save methods.
function tool<M extends RpcMethod>(name: string, feature: string, description: string, method: M, params: z.ZodType<RpcParams<M>>) {
  const readOnly = MANAGEMENT_READ_TOOLS.includes(name)
  return {
    feature,
    spec: {
      name, description, inputSchema: z.toJSONSchema(params),
      annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: readOnly || name === MANAGEMENT_TOOLS.skillSetActivation, openWorldHint: name === MANAGEMENT_TOOLS.skillSearch || name === MANAGEMENT_TOOLS.skillInstall }
    },
    run: async (withCore: WithCore, raw: Record<string, unknown>) => {
      const args = params.safeParse(raw)
      if (!args.success) throw new Error(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.') || '参数'} ${issue.message}`).join('；')}`)
      return withCore((rpc) => rpc.call(method, args.data))
    }
  }
}

const tools = [
  tool(MANAGEMENT_TOOLS.profileList, 'agent-profiles',
    '列出全部已保存的智能体配置，包含 ID、归档状态、角色指令、外部智能体、模型、技能和 MCP 选择。创建团队或检查重名时用；可委派的智能体仍用 antumi_agent_list 查询。只读。',
    'agentProfiles.list', rpcMethods['agentProfiles.list'].params),
  tool(MANAGEMENT_TOOLS.profileCreate, 'agent-profiles',
    '创建「我的智能体」配置，不会启动会话或修改已有配置。name 和 agent 必填，其余沿用现有默认值；capability 默认只读，开发角色需显式设为 develop。创建前先查已有配置；成功返回配置和 ID。',
    'agentProfiles.save', AgentProfileFields.strict()),
  tool(MANAGEMENT_TOOLS.squadList, 'squads',
    '列出已保存的团队配置，包含 ID、归档状态、队长、成员和职责；不包含团队运行记录。只读。',
    'squads.list', rpcMethods['squads.list'].params),
  tool(MANAGEMENT_TOOLS.squadCreate, 'squads',
    '创建团队配置，不会启动任务。提供 2–5 名成员，成员 id 为各自唯一 UUID，leaderId 指向其中一名只读队长，至少一名成员 capability 为 develop。可用 profileId 引用已保存的智能体；先查询配置获取 ID。成功返回团队和 ID。',
    'squads.create', rpcMethods['squads.create'].params.strict()),
  tool(MANAGEMENT_TOOLS.scheduleList, 'schedules',
    '列出一次性预约及近期执行记录，包含 ID、目标、状态、计划时间和错误。只读。',
    'schedules.list', rpcMethods['schedules.list'].params),
  tool(MANAGEMENT_TOOLS.scheduleCreate, 'schedules',
    '创建一次性预约：target.kind 为 task 时启动 taskId 指定的已有任务，为 conversation 时向 conversationId 指定的会话发送 text（空文本表示继续计划）。notBefore 是 Unix 毫秒时间戳，null 表示额度允许时尽快执行。目标 ID 须已知；周期重复执行使用 antumi_routine_create。成功返回预约和状态，表示已安排，未必已执行。',
    'schedules.create', rpcMethods['schedules.create'].params.strict()),
  tool(MANAGEMENT_TOOLS.routineList, 'routines',
    '列出周期例程，包含 ID、周期、任务指令、启用状态、下次执行时间及最近一次结果。只读。',
    'routines.list', rpcMethods['routines.list'].params),
  tool(MANAGEMENT_TOOLS.routineCreate, 'routines',
    '创建例程，每次执行新开会话。schedule 支持 hourly、daily、weekdays、weekly 和 manual；时刻按 Antumi core 所在机器的本地时区，weekly.days 中 0 是周日。target.kind 为 new，指定外部智能体 agent（或 auto）、项目绝对路径 projectPaths 和工作指令 text；enabled 默认 true。返回例程和下次执行时间。',
    'routines.create', rpcMethods['routines.create'].params.strict()),
  tool(MANAGEMENT_TOOLS.skillList, 'skills-library',
    '列出 Antumi 已安装的技能仓库、仓库 ID、可用技能和启用策略。安装前检查是否已有，启用前从结果选择技能名称。只读。',
    'skills.list', rpcMethods['skills.list'].params),
  tool(MANAGEMENT_TOOLS.skillSearch, 'skills-search',
    '按 query 搜索公开技能市场，返回匹配仓库地址与技能名称；搜索不会安装。安装的是技能所在的整个仓库。只读，会访问公开索引。',
    'skills.search', rpcMethods['skills.search'].params.strict()),
  tool(MANAGEMENT_TOOLS.skillInstall, 'skills-library',
    '从 https Git 仓库地址 url 安装技能到 Antumi 技能库，固定在当前提交，不修改外部智能体自己的配置。安装成功默认不启用，返回仓库 ID 和技能列表；按用户要求再调用 antumi_skill_set_activation 显式启用。重复安装会报错，不自动更新。',
    'skills.install', rpcMethods['skills.install'].params.strict()),
  tool(MANAGEMENT_TOOLS.skillSetActivation, 'skills-activation',
    '显式设置已安装仓库 id 的技能启用策略。activation.mode 为 selected 时 skills 是启用的名称列表，为 all 时启用全部可用技能；agents 为 null 表示全部兼容的外部智能体，数组表示指定范围。本次设置替换该仓库的原策略，先查询当前策略再按用户要求修改；重名冲突会拒绝。下次启动智能体时生效。',
    'skills.setActivation', rpcMethods['skills.setActivation'].params.strict()),
  tool(MANAGEMENT_TOOLS.commandList, 'chat-commands',
    '列出用户保存的聊天斜杠命令，包含 ID、名称、说明、提示词和项目范围。创建前查询，避免同一范围重名。只读。',
    'chatCommands.list', rpcMethods['chatCommands.list'].params),
  tool(MANAGEMENT_TOOLS.commandCreate, 'chat-commands',
    '创建聊天斜杠命令，不修改已有命令。name 不带 /，description 是简短说明，prompt 是提示词（可用 $ARGUMENTS 代入命令后的输入），projectPath 为 null 时全局可用，为项目绝对路径时仅该项目可用。成功返回命令和 ID。',
    'chatCommands.save', ChatCommandFields.strict())
]

export async function managementToolsOverCore(withCore: WithCore, id: string, planOnly = false) {
  const initial = await withCore(async (rpc) => ({ access: await scope(rpc, id), features: rpc.features }))
  if (initial.access === 'none') return []
  return tools.filter((entry) => initial.features.includes(entry.feature)
    && (!(planOnly || initial.access === 'readOnly') || entry.spec.annotations.readOnlyHint))
    .map((entry) => ({
      spec: entry.spec,
      run: async (raw: Record<string, unknown>) => {
        try {
          const result = await entry.run(async (action) => withCore(async (rpc) => {
            if (!rpc.features.includes(entry.feature)) throw new Error('当前 Antumi core 不支持这项操作')
            const access = await scope(rpc, id)
            if (access === 'none') throw new Error('当前会话不能使用 Antumi 管理工具')
            if ((planOnly || access === 'readOnly') && !entry.spec.annotations.readOnlyHint) throw new Error('规划或只读模式只能查询 Antumi 配置，不能创建、安装或启用')
            return action(rpc)
          }), raw)
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: false }
        } catch (error) {
          return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true }
        }
      }
    }))
}
