import { z } from 'zod'
import { PULL_REQUEST_TOOLS, type PullRequestLink, type RpcConnection } from '@antumi/protocol'

type WithCore = <T>(action: (rpc: RpcConnection) => Promise<T>) => Promise<T>
type Result = { content: { type: 'text'; text: string }[]; isError: boolean }

const CreateInput = z.object({
  title: z.string().trim().min(1).max(256),
  body: z.string().max(65_536).default(''),
  base: z.string().trim().min(1).max(500).optional(),
  repoPath: z.string().trim().min(1).optional(),
  draft: z.boolean().default(false)
})

const text = (value: string, isError = false): Result => ({ content: [{ type: 'text', text: value }], isError })

// A pull request as the model reads it.
export function describeLink(link: PullRequestLink): string {
  const status = link.status
  const lines = [`PR #${link.number}：${link.url}`, `项目：${link.repoPath}`, `分支：${link.headBranch} → ${link.base}`]
  if (!status) return [...lines, '状态：还没读到'].join('\n')
  lines.push(`状态：${status.state === 'merged' ? '已合并' : status.state === 'closed' ? '已关闭' : status.draft ? '草稿' : '开放'}${status.mergeable === 'conflicting' ? '，与目标分支有冲突' : ''}`)
  if (status.checks.length > 0) lines.push(`检查：${status.checks.map((check) => `${check.name} ${check.state}${check.url ? `（${check.url}）` : ''}`).join('；')}`)
  const asking = status.reviews.filter((review) => review.state === 'changes_requested')
  if (asking.length > 0) lines.push(`要求修改：${asking.map((review) => `${review.author}：${review.body.split('\n')[0] ?? ''}`).join('；')}`)
  if (status.comments.length > 0) lines.push(`评论 ${status.comments.length} 条：${status.comments.slice(-5).map((comment) => `${comment.author}${comment.path ? ` 在 ${comment.path}${comment.line ? `:${comment.line}` : ''}` : ''}：${comment.body.split('\n')[0] ?? ''}`).join('；')}`)
  if (link.problem) lines.push(`上次读取失败：${link.problem.message}`)
  return lines.join('\n')
}

// The pull request tools for the agent of a task's chat, each a call to core. Reading is free;
// opening goes through the user where the agent asks nothing for MCP tools itself.
export function pullRequestToolsOverCore(withCore: WithCore, conversationId: string) {
  const taskOf = async (rpc: RpcConnection): Promise<string | null> => (await rpc.call('conversations.get', { id: conversationId })).taskId ?? null
  const attempt = async (work: () => Promise<Result>): Promise<Result> => {
    try {
      return await work()
    } catch (error) {
      return text(`没能完成：${error instanceof Error ? error.message : String(error)}`, true)
    }
  }
  return [
    {
      spec: {
        name: PULL_REQUEST_TOOLS.status,
        description: '查看这个任务在 GitHub 上的 pull request：编号、链接、状态、检查结果、评审意见和最近的评论。任务没有 PR 时说明没有。只读。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      run: (_raw: Record<string, unknown>) => attempt(() => withCore(async (rpc) => {
        const taskId = await taskOf(rpc)
        if (!taskId) return text('这条会话不是任务，没有 PR。')
        const links = await rpc.call('pullRequests.refresh', { taskId }).catch(() => rpc.call('pullRequests.list', { taskId }))
        return text(links.length === 0 ? '这个任务还没有 PR。' : links.map(describeLink).join('\n\n'))
      }))
    },
    {
      spec: {
        name: PULL_REQUEST_TOOLS.create,
        description: '为这个任务的分支在 GitHub 上开 pull request：先提交全部改动，Antumi 会推送分支再创建。title 是标题，body 是说明（写为什么改、行为有什么不同），base 不给就用分支的起点或仓库默认分支，draft 为 true 开草稿；repoPath 只在任务有多个项目时才需要，填项目路径或你所在的工作目录都行。' +
          '可能要用户先在对话里确认：返回「等待用户确认」时先停下，等用户同意后再用同样的参数调用一次。分支已经有 PR 时返回那个。',
        inputSchema: z.toJSONSchema(CreateInput),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
      },
      run: (raw: Record<string, unknown>) => attempt(async () => {
        const args = CreateInput.safeParse(raw)
        if (!args.success) return text(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.') || '参数'} ${issue.message}`).join('；')}`, true)
        const run = await withCore((rpc) => rpc.call('pullRequests.agentCreate', { conversationId, ...args.data }))
        if (run.outcome === 'awaiting') return text('等待用户确认：已在对话里请用户确认这个 PR。先停下，等用户同意后再用同样的参数调用一次。')
        if (run.outcome === 'denied') return text('用户没有同意开这个 PR。', true)
        return text(`已开 PR #${run.link.number}：${run.link.url}\n分支 ${run.link.headBranch} → ${run.link.base}。用户会在任务上看到它；之后用 ${PULL_REQUEST_TOOLS.status} 看检查和评审。`)
      })
    }
  ]
}
