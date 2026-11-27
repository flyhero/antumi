import { z } from 'zod'
import { AGENT_KINDS, agentDescriptor, AgentKind, MAX_SOURCE_REPORT, SourceTaskProposal, SOURCE_OUTCOMES, SOURCE_REPORT_LIMIT, SOURCE_REPORT_TOOL, SOURCE_TASK_CREATE_TOOL, SOURCE_TASK_READ_TOOLS, type RpcConnection } from '@antumi/protocol'
import { reportRules, RESULT_FIELDS, type ReportAudience } from './source-report-prompt'

type WithCore = <T>(action: (rpc: RpcConnection) => Promise<T>) => Promise<T>
type Result = { content: { type: 'text'; text: string }[]; isError: boolean }

// summary alone is the tool as it first was; the rest says how the work ended, for core to act on.
const Note = z.string().trim().max(SOURCE_REPORT_LIMIT).optional()
const ReportInput = z.object({ summary: z.string().trim().min(1).max(MAX_SOURCE_REPORT), outcome: z.enum(SOURCE_OUTCOMES).optional(), verification: Note, question: Note, blocker: Note })
const text = (value: string, isError = false): Result => ({ content: [{ type: 'text', text: value }], isError })

// The summary tool for the agent of a task or investigation from an issue that can be written back
// to (docs/SOURCE-WRITEBACK.md), or of a task from a chat platform reported in its thread
// (audience chat, docs/CHANNEL-LOOP.md). It drafts; Antumi posts, by the user's rules or hand.
// tasks: an automatic investigation, which may open the issue's task where its source allows (core decides).
export function sourceToolsOverCore(withCore: WithCore, conversationId: string, { tasks = true, audience = 'issue' }: { tasks?: boolean; audience?: ReportAudience } = {}) {
  const posting = audience === 'chat'
    ? '它不会直接发出去：Antumi 在提交验收时把它发回提出需求的聊天话题。'
    : '它不会直接发出去：用户设置了规则时，Antumi 在提交验收或验收通过时把它作为评论发到事项上，否则由用户决定。你不能用它改事项状态。'
  const tools = [
    {
      spec: {
        name: SOURCE_REPORT_TOOL,
        description: `${audience === 'chat' ? '给提出这个任务的同事' : '给这个任务来源的事项（Jira、GitHub 等）'}写一条完成总结，存为草稿。做完工作、交给用户验收前调用；之后又改了就再调用一次覆盖。超过 ${SOURCE_REPORT_LIMIT} 字会被退回。\n${reportRules('', audience)}\n${RESULT_FIELDS}\n` + posting,
        inputSchema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: `总结正文，2 到 4 句，${SOURCE_REPORT_LIMIT} 字以内` },
            outcome: { type: 'string', enum: [...SOURCE_OUTCOMES], description: '这次工作的结果：delivered 已交付等验证，answered 只答复了问题，needs_input 缺信息无法继续，blocked 受阻' },
            verification: { type: 'string', description: '给验证的人看：怎么验、影响哪些地方。一两句，会作为单独一段附在评论后面' },
            question: { type: 'string', description: 'outcome 是 needs_input 时：要问报告人的一个具体问题' },
            blocker: { type: 'string', description: 'outcome 是 blocked 时：被什么挡住了' }
          },
          required: ['summary'],
          additionalProperties: false
        },
        // Writes to Antumi alone, never to the tracker or the workspace, so it is fine while planning.
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      run: async (raw: Record<string, unknown>): Promise<Result> => {
        const args = ReportInput.safeParse(raw)
        if (!args.success) return text(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`, true)
        const { summary, ...result } = args.data
        try {
          await withCore((rpc) => rpc.call('sources.saveReport', { conversationId, text: summary, ...result }))
          return text('已存为事项总结草稿。用户会在任务的来源区块看到它。')
        } catch (error) {
          return text(`没能保存：${error instanceof Error ? error.message : String(error)}`, true)
        }
      }
    },
    {
      spec: {
        name: SOURCE_TASK_READ_TOOLS[0],
        description: `只读查询新建任务可用的已登记项目、可用外部智能体及模型服务商。返回项目绝对路径；可结合事项所属项目、仓库地址、README 和代码判断任务应使用的项目，不需要用户维护项目映射。不会创建或启动任务，新建用 ${SOURCE_TASK_CREATE_TOOL}。`,
        inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      run: async (): Promise<Result> => {
        try {
          return await withCore(async (rpc) => {
            const [projects, environment, providers, settings] = await Promise.all([rpc.call('projects.recent', {}), rpc.call('system.environment', {}), rpc.call('modelProviders.list', {}), rpc.call('system.chatSettings', {})])
            const agents = AGENT_KINDS.flatMap((agent) => environment.checks.some((check) => check.tool === agent && check.status === 'ok' && !check.problem && !settings.disabledAgents?.includes(agent)) ? [{ agent, name: agentDescriptor(agent).label }] : [])
            return text(JSON.stringify({ projects, agents, modelProviders: providers.map((provider) => ({ id: provider.id, name: provider.name, agents: provider.agents, hasKey: provider.hasKey })) }))
          })
        } catch (error) { return text(error instanceof Error ? error.message : String(error), true) }
      }
    },
    {
      spec: {
        name: SOURCE_TASK_READ_TOOLS[1],
        description: `只读查询某个执行 Agent 的真实模型目录和可用推理强度。新建任务前先查询，选择返回的模型 ID 和 effort；不指定或填 null 表示使用该 Agent 的默认值。不会创建或启动任务，新建用 ${SOURCE_TASK_CREATE_TOOL}。`,
        inputSchema: { type: 'object', properties: { agent: { type: 'string', enum: [...AGENT_KINDS] }, modelProvider: { type: 'string' } }, required: ['agent'], additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      run: async (raw: Record<string, unknown>): Promise<Result> => {
        const args = z.object({ agent: AgentKind, modelProvider: z.string().min(1).max(100).optional() }).safeParse(raw)
        if (!args.success) return text('请选择有效的 Agent 和服务商', true)
        try { return await withCore(async (rpc) => text(JSON.stringify(await rpc.call('conversations.chatCatalog', args.data)))) }
        catch (error) { return text(error instanceof Error ? error.message : String(error), true) }
      }
    },
    {
      spec: {
        name: SOURCE_TASK_CREATE_TOOL,
        description: '为这个事项新建一个任务并立即开始：执行 Agent 在独立工作区完成，通过项目的交付检查后交给用户验收，GitHub 仓库会自动创建 PR。只在自动排查且用户允许新建任务时可用；一个事项只能建一个任务，PR 类事项不能建。' +
          `先用 ${SOURCE_TASK_READ_TOOLS[0]} 选项目和执行 Agent，用 ${SOURCE_TASK_READ_TOOLS[1]} 选模型和推理强度；不填模型等表示用该 Agent 的默认值。权限按用户的无人值守设置，不能在这里指定。被退回时按错误修正后再调用。`,
        inputSchema: {
          ...Object.fromEntries(Object.entries(z.toJSONSchema(SourceTaskProposal)).filter(([key]) => key !== '$schema')),
          description: 'details 写清任务目标和验收标准，并要求做完后检查、提交，再用 source_report 交付。repos 的第一个项目必须可写；startRef 是分支起点，只能是 HEAD、refs/heads/<分支> 或 refs/remotes/origin/<分支>，不填用远端默认分支。'
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
      },
      run: async (raw: Record<string, unknown>): Promise<Result> => {
        const args = SourceTaskProposal.safeParse(raw)
        if (!args.success) return text(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`, true)
        try {
          const task = await withCore((rpc) => rpc.call('sources.createTask', { id: conversationId, task: args.data }))
          return text(`已新建任务「${task.title}」（${task.id}），会在执行 Agent 有空位时开始。之后由 Antumi 推进：检查通过后交给用户验收。`)
        } catch (error) {
          return text(`没有新建：${error instanceof Error ? error.message : String(error)}`, true)
        }
      }
    }
  ]
  return tasks ? tools : tools.filter((tool) => tool.spec.name !== SOURCE_TASK_CREATE_TOOL)
}
