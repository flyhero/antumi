import { z } from 'zod'
import { MAX_DETAILS_LENGTH, MAX_TASK_REPOS, shortTaskId } from '@antumi/protocol'
import { ChannelToolError, channelTool } from './channel-tool'
import { projectsOf } from './project'

export const taskCreate = channelTool({
  name: 'task_create',
  description: '把明确且可推进的项目需求建成 Antumi 里的待处理任务（不是飞书、Slack 等聊天平台自带的任务），不会开始执行。仅接入已允许创建任务时可用。按工作指令判断是否创建；普通咨询直接回答，关键信息缺失先追问。title 写目标，details 写需求、背景和验收标准；projects 使用 project_list 返回的项目名，不能传路径。每条消息最多创建一个任务，多项相关要求合并描述；重复调用返回同一任务。成功后回复任务编号和标题，说明这是 Antumi 里的任务、等待主人开始执行。',
  readOnly: false,
  inputSchema: {
    type: 'object', required: ['title', 'details', 'projects'], additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      details: { type: 'string', minLength: 1, maxLength: MAX_DETAILS_LENGTH },
      projects: { type: 'array', minItems: 1, maxItems: MAX_TASK_REPOS, items: { type: 'string' }, description: '授权项目的名称，如 app；至少一个' }
    }
  },
  params: z.strictObject({
    title: z.string().trim().min(1).max(200),
    details: z.string().trim().min(1).max(MAX_DETAILS_LENGTH),
    projects: z.array(z.string().min(1)).min(1).max(MAX_TASK_REPOS)
  }),
  async run(scope, input) {
    if (!scope.createTask) throw new ChannelToolError('这个接入没有允许创建任务，请主人在聊天平台接入设置中开启。')
    const allowed = new Set(projectsOf(scope).map((project) => project.name))
    if (input.projects.some((name) => !allowed.has(name))) throw new ChannelToolError('只能为授权项目创建任务；用 project_list 查看项目名，不能传路径。')
    const task = await scope.createTask(input)
    const text = JSON.stringify({ id: task.id, number: shortTaskId(task.id), title: task.title, status: task.status, message: task.status === 'pending' ? '已在 Antumi 里建好任务，等待主人开始执行。' : '这条消息已在 Antumi 里建过任务，返回当前任务，不会再次创建。' })
    return { text, target: `任务 ${shortTaskId(task.id)}：${task.title}`, bytes: Buffer.byteLength(text) }
  }
})
