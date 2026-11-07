import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Conversation, PULL_REQUEST_TOOLS, createRpcClient, type AgentPullRequestRun, type PullRequestLink, type RpcConnection } from '@antumi/protocol'
import { describeLink, pullRequestToolsOverCore } from './mcp-pull-request-tools'

const CONVERSATION = '00000000-0000-4000-8000-000000000001'
const Frame = z.object({ id: z.number(), method: z.string(), params: z.unknown() })

const link: PullRequestLink = {
  taskId: 'task', repoPath: '/repo', repo: { host: 'github', owner: 'o', name: 'r' }, number: 7, url: 'https://github.com/o/r/pull/7', headBranch: 'antumi/abc', base: 'main', problem: null, fetchedAt: 1, refreshing: false,
  status: { state: 'open', draft: false, title: 'T', headSha: 'a'.repeat(40), base: 'main', mergeable: 'conflicting', mergedAt: null, updatedAt: 0,
    checks: [{ id: 'run:1', name: 'test', state: 'failure', url: 'https://ci/1', completedAt: null }],
    reviews: [{ id: 'review:1', author: 'ann', state: 'changes_requested', body: 'Needs tests\nmore', submittedAt: 0 }],
    comments: [{ id: 'diff:1', author: 'bob', path: 'src/a.ts', line: 3, body: 'Rename', url: 'https://github.com/c/1', resolved: null, createdAt: 0 }] }
}

// A core that answers what the tools ask of it, and records each call.
function tools(answers: { taskId?: string | null; run?: AgentPullRequestRun; links?: PullRequestLink[] } = {}) {
  const calls: { method: string; params: unknown }[] = []
  const answer = (method: string, params: unknown): unknown => {
    calls.push({ method, params })
    if (method === 'conversations.get') {
      return Conversation.parse({ id: CONVERSATION, title: 't', titleLocked: false, agent: 'codex', workspacePath: '/repo', projectPaths: ['/repo'], managedWorkspace: false, sessionId: null, createdAt: 0, updatedAt: 0, taskId: answers.taskId === undefined ? 'task' : answers.taskId })
    }
    if (method === 'pullRequests.agentCreate') return answers.run ?? { outcome: 'created', link }
    return answers.links ?? [link]
  }
  const client = createRpcClient((text) => {
    const frame = Frame.parse(JSON.parse(text))
    queueMicrotask(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: answer(frame.method, frame.params) })))
  })
  const rpc: RpcConnection = { ...client, features: ['pull-requests'], close: () => {}, closed: new Promise(() => {}) }
  const withCore = async <T>(action: (connection: RpcConnection) => Promise<T>) => action(rpc)
  const [status, create] = pullRequestToolsOverCore(withCore, CONVERSATION)
  return { status: status!, create: create!, calls }
}

describe('pull request MCP tools', () => {
  it('asks the user through Antumi, not through the agent: neither tool reads as reaching the outside world', () => {
    const { status, create } = tools()
    expect(status.spec).toMatchObject({ name: PULL_REQUEST_TOOLS.status, annotations: { readOnlyHint: true, openWorldHint: false } })
    expect(create.spec).toMatchObject({ name: PULL_REQUEST_TOOLS.create, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } })
  })

  it('opens the pull request for the conversation, and says when the user is still to answer or said no', async () => {
    const created = tools()
    const result = await created.create.run({ title: 'Add PRs', body: 'Why.' })
    expect(created.calls.at(-1)).toEqual({ method: 'pullRequests.agentCreate', params: { conversationId: CONVERSATION, title: 'Add PRs', body: 'Why.', draft: false } })
    expect(result).toMatchObject({ isError: false, content: [{ text: expect.stringContaining('https://github.com/o/r/pull/7') }] })
    expect((await tools({ run: { outcome: 'awaiting' } }).create.run({ title: 'T' })).content[0]?.text).toContain('等待用户确认')
    expect(await tools({ run: { outcome: 'denied' } }).create.run({ title: 'T' })).toMatchObject({ isError: true })
    expect(await tools().create.run({ title: '' })).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('参数不对') }] })
  })

  it('reads where the task pull requests stand, and that a plain conversation has none', async () => {
    expect((await tools().status.run({})).content[0]?.text).toBe(describeLink(link))
    expect((await tools({ links: [] }).status.run({})).content[0]?.text).toBe('这个任务还没有 PR。')
    expect((await tools({ taskId: null }).status.run({})).content[0]?.text).toBe('这条会话不是任务，没有 PR。')
  })

  it('describes checks, changes asked for, comments and conflicts in a few lines', () => {
    const text = describeLink(link)
    expect(text).toContain('状态：开放，与目标分支有冲突')
    expect(text).toContain('检查：test failure（https://ci/1）')
    expect(text).toContain('要求修改：ann：Needs tests')
    expect(text).toContain('评论 1 条：bob 在 src/a.ts:3：Rename')
  })
})
