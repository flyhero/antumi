import { z } from 'zod'
import {
  AgentProfileFields, ChatCommandFields, MANAGEMENT_EDIT_TOOLS, MANAGEMENT_READ_TOOLS, MANAGEMENT_TOOLS, SquadFields, rpcMethods,
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

function invalid(error: z.ZodError): Error {
  return new Error(`参数不对：${error.issues.map((issue) => `${issue.path.join('.') || '参数'} ${issue.message}`).join('；')}`)
}

function spec(name: string, description: string, input: z.ZodType) {
  const readOnly = MANAGEMENT_READ_TOOLS.includes(name)
  const edit = MANAGEMENT_EDIT_TOOLS.includes(name)
  return {
    name, description, inputSchema: z.toJSONSchema(input),
    annotations: { readOnlyHint: readOnly, destructiveHint: edit, idempotentHint: readOnly || edit || name === MANAGEMENT_TOOLS.skillSetActivation, openWorldHint: name === MANAGEMENT_TOOLS.skillSearch || name === MANAGEMENT_TOOLS.skillInstall }
  }
}

// Reuse the RPC contracts, with create-only schemas for the two save methods.
function tool<M extends RpcMethod>(name: string, feature: string, description: string, method: M, params: z.ZodType<RpcParams<M>>) {
  return {
    feature,
    spec: spec(name, description, params),
    run: async (withCore: WithCore, raw: Record<string, unknown>) => {
      const args = params.safeParse(raw)
      if (!args.success) throw invalid(args.error)
      return withCore((rpc) => rpc.call(method, args.data))
    }
  }
}

// An edit where the RPC saves the whole item: the fields given go over what core has saved, so one
// left out keeps its value rather than taking the default a new item would get.
function editTool<M extends RpcMethod>(name: string, feature: string, description: string, input: z.ZodObject, what: string,
  saved: (rpc: RpcConnection) => Promise<ReadonlyArray<{ id: string }>>, method: M, params: z.ZodType<RpcParams<M>>) {
  return {
    feature,
    spec: spec(name, description, input),
    run: async (withCore: WithCore, raw: Record<string, unknown>) => {
      const args = input.safeParse(raw)
      if (!args.success) throw invalid(args.error)
      const given = Object.fromEntries(Object.entries(args.data).filter(([key]) => key in raw))
      return withCore(async (rpc) => {
        const current = (await saved(rpc)).find((each) => each.id === given.id)
        if (!current) throw new Error(`找不到 ID 为 ${String(given.id)} 的${what}，先查询再修改`)
        const merged = params.safeParse({ ...current, ...given })
        if (!merged.success) throw invalid(merged.error)
        return rpc.call(method, merged.data)
      })
    }
  }
}

const EditId = z.object({ id: z.string().uuid() })

const tools = [
  tool(MANAGEMENT_TOOLS.profileList, 'agent-profiles',
    '列出全部已保存的智能体配置，包含 ID、归档状态、角色指令、外部智能体、模型、技能和 MCP 选择。创建团队或检查重名时用；可委派的智能体仍用 antumi_agent_list 查询。只读。',
    'agentProfiles.list', rpcMethods['agentProfiles.list'].params),
  tool(MANAGEMENT_TOOLS.profileCreate, 'agent-profiles',
    '创建「我的智能体」配置，不会启动会话或修改已有配置。name 和 agent 必填，其余沿用现有默认值；capability 默认只读，开发角色需显式设为 develop。创建前先查已有配置；成功返回配置和 ID。',
    'agentProfiles.save', AgentProfileFields.strict()),
  editTool(MANAGEMENT_TOOLS.profileUpdate, 'agent-profiles',
    '修改已保存的「我的智能体」配置。id 必填，只传要改的字段，未传的字段保持原值；数组字段（skills、mcpServers、callableProfiles）整体替换。先查询配置获取 ID 和当前值；不会启动会话，已在运行的会话不受影响。成功返回修改后的配置。',
    AgentProfileFields.partial().extend(EditId.shape).strict(), '智能体配置', (rpc) => rpc.call('agentProfiles.list', {}),
    'agentProfiles.save', rpcMethods['agentProfiles.save'].params),
  tool(MANAGEMENT_TOOLS.squadList, 'squads',
    '列出已保存的团队配置，包含 ID、归档状态、队长、成员和职责；不包含团队运行记录。只读。',
    'squads.list', rpcMethods['squads.list'].params),
  tool(MANAGEMENT_TOOLS.squadCreate, 'squads',
    '创建团队配置，不会启动任务。提供 2–5 名成员，成员 id 为各自唯一 UUID，leaderId 指向其中一名只读队长，至少一名成员 capability 为 develop。可用 profileId 引用已保存的智能体；先查询配置获取 ID。成功返回团队和 ID。',
    'squads.create', rpcMethods['squads.create'].params.strict()),
  editTool(MANAGEMENT_TOOLS.squadUpdate, 'squads',
    '修改已保存的团队配置。id 必填，只传要改的字段，未传的字段保持原值；members 整体替换，修改成员时传完整成员列表，并保持 leaderId 指向只读成员、至少一名 develop 成员。先查询团队获取 ID 和当前成员；正在运行的团队任务不受影响。成功返回修改后的团队。',
    z.object(SquadFields.shape).partial().extend(EditId.shape).strict(), '团队', (rpc) => rpc.call('squads.list', {}),
    'squads.update', rpcMethods['squads.update'].params),
  tool(MANAGEMENT_TOOLS.scheduleList, 'schedules',
    '列出一次性预约及近期执行记录，包含 ID、目标、状态、计划时间和错误。只读。',
    'schedules.list', rpcMethods['schedules.list'].params),
  tool(MANAGEMENT_TOOLS.scheduleCreate, 'schedules',
    '创建一次性预约：target.kind 为 task 时启动 taskId 指定的已有任务，为 conversation 时向 conversationId 指定的会话发送 text（空文本表示继续计划）。notBefore 是 Unix 毫秒时间戳，null 表示额度允许时尽快执行。目标 ID 须已知；周期重复执行使用 antumi_routine_create。成功返回预约和状态，表示已安排，未必已执行。',
    'schedules.create', rpcMethods['schedules.create'].params.strict()),
  tool(MANAGEMENT_TOOLS.scheduleUpdate, 'schedules',
    '修改还在等待的一次性预约。id 必填；notBefore 改执行时间（Unix 毫秒时间戳，null 表示额度允许时尽快执行）；text 改会话预约要发送的内容，任务预约不能改 text。已开始或已结束的预约不能修改。先查询预约获取 ID；成功返回修改后的预约。',
    'schedules.update', rpcMethods['schedules.update'].params.strict()),
  tool(MANAGEMENT_TOOLS.routineList, 'routines',
    '列出周期例程，包含 ID、周期、任务指令、启用状态、下次执行时间及最近一次结果。只读。',
    'routines.list', rpcMethods['routines.list'].params),
  tool(MANAGEMENT_TOOLS.routineCreate, 'routines',
    '创建例程，每次执行新开会话。schedule 支持 hourly、daily、weekdays、weekly 和 manual；时刻按 Antumi core 所在机器的本地时区，weekly.days 中 0 是周日。target.kind 为 new，指定外部智能体 agent（或 auto）、项目绝对路径 projectPaths 和工作指令 text；enabled 默认 true。返回例程和下次执行时间。',
    'routines.create', rpcMethods['routines.create'].params.strict()),
  tool(MANAGEMENT_TOOLS.routineUpdate, 'routines',
    '修改例程。id 必填，只传要改的字段：title、schedule、target 或 enabled（false 暂停、true 恢复），未传的保持原值；schedule 和 target 整体替换，格式同 antumi_routine_create。先查询例程获取 ID 和当前设置；正在执行的那次不受影响。返回修改后的例程和下次执行时间。',
    'routines.update', rpcMethods['routines.update'].params.strict()),
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
    'chatCommands.save', ChatCommandFields.strict()),
  editTool(MANAGEMENT_TOOLS.commandUpdate, 'chat-commands',
    '修改已保存的聊天斜杠命令。id 必填，只传要改的字段（name、description、prompt、projectPath），未传的保持原值；改名或改范围时不能与同一范围已有命令重名。先查询命令获取 ID；成功返回修改后的命令。',
    ChatCommandFields.partial().extend(EditId.shape).strict(), '聊天命令', (rpc) => rpc.call('chatCommands.list', {}),
    'chatCommands.save', rpcMethods['chatCommands.save'].params)
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
