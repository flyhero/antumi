import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatItem } from '@antumi/protocol'
import { ChatToolCard, ChatToolRun } from './ChatToolCard'
import { ChatFindExpansion } from '../chat-disclosure'
import { StopBackground } from '../background-work'

const opened = vi.hoisted(() => new Set<string>())
vi.mock('../chat-disclosure', async (original) => ({ ...await original<typeof import('../chat-disclosure')>(), useDisclosure: (key: string) => [opened.has(key), () => {}] }))
vi.mock('../core-store', () => ({ showTerminal: vi.fn() }))
beforeEach(() => opened.clear())

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
const tool = (id: string, changes: Partial<ToolItem> = {}): ToolItem => ({
  id, kind: 'tool', stageId: 'stage', revision: 1, at: 0, name: 'commandExecution', title: 'rg missing .',
  input: null, output: null, status: 'failed', diffs: [], execution: { status: 'completed', exitCode: 1 }, ...changes
})
const run = (tools: ToolItem[]) => renderToStaticMarkup(createElement(ChatToolRun, { tools }))

describe('Antumi MCP cards', () => {
  it('shows readable action and resolved object in both card paths, preserving raw details', () => {
    const item = tool('mcp', { name: 'mcp__antumi__antumi_agent_profile_update', title: 'profile-id',
      status: 'done', execution: undefined, input: '{"id":"profile-id","description":"New role"}', output: '{"id":"profile-id","name":"Reviewer"}' })
    opened.add('call:stage/mcp')
    opened.add('card:stage/mcp')
    for (const html of [run([item]), renderToStaticMarkup(createElement(ChatToolCard, { item }))]) {
      expect(html).toContain('修改智能体')
      expect(html).toContain('title="Reviewer"')
      expect(html).toContain('data-kind="agent"')
      expect(html).toContain('New role')
      expect(html).toContain('profile-id')
      expect(html).not.toContain('antumi · antumi_agent_profile_update')
    }
  })

  it('preserves failed status and does not present an error output as a result count', () => {
    const html = renderToStaticMarkup(createElement(ChatToolCard, { item: tool('bad-mcp', {
      name: 'antumi.antumi_skill_list', status: 'failed', execution: undefined, output: 'Connection failed'
    }) }))
    expect(html).toContain('查看技能')
    expect(html).toContain('data-status="failed"')
    expect(html).not.toContain('0 项')
  })

  it('uses the parsed object beside a running grouped summary too', () => {
    const html = run([
      tool('first', { name: 'antumi.antumi_skill_list', status: 'done', execution: undefined }),
      tool('search', { name: 'antumi.antumi_skill_search', status: 'running', at: Date.now(), execution: undefined,
        title: 'raw driver title', input: '{"query":"design"}' })
    ])
    expect(html).toContain('搜索技能 1 次')
    expect(html).toContain('title="design"')
    expect(html).not.toContain('raw driver title')
  })
})

describe('command cards', () => {
  it('exposes full output only while searching for both grouped and standalone calls', () => {
    const command = tool('long', { output: 'x'.repeat(5000) + 'unique tail' })
    opened.add('call:stage/long')
    opened.add('card:stage/long')
    for (const card of [createElement(ChatToolCard, { item: command }), createElement(ChatToolRun, { tools: [command] })]) {
      expect(renderToStaticMarkup(card)).not.toContain('unique tail')
      expect(renderToStaticMarkup(createElement(ChatFindExpansion.Provider, { value: true }, card))).toContain('unique tail')
    }
  })

  it.each([[19, 1], [21, 3]])('keeps the collapsed %i-command group quiet with %i nonzero exits', (count, exits) => {
    const tools = Array.from({ length: count }, (_, index) => tool(String(index), index < exits ? {} : {
      status: 'done', execution: { status: 'completed', exitCode: 0 }
    }))
    const html = run(tools)
    expect(html).toContain(`运行 ${count} 个命令`)
    expect(html).not.toContain('异常')
    expect(html).not.toContain('失败')
    expect(html).not.toContain('data-status="failed"')
    opened.add('run:stage/0')
    expect(run(tools)).not.toContain('exit 1')
    opened.add('call:stage/0')
    expect(run(tools)).toContain('exit 1')
  })

  it('lets a command with only an exit result open, keeping it out of the row status', () => {
    const command = tool('empty')
    const collapsed = run([command])
    expect(collapsed).not.toContain('disabled')
    expect(collapsed).not.toContain('exit 1')
    expect(collapsed).not.toContain('失败')
    opened.add('call:stage/empty')
    expect(run([command])).toContain('aria-label="退出码 1"')
    opened.add('card:stage/empty')
    expect(renderToStaticMarkup(createElement(ChatToolCard, { item: command }))).toContain('exit 1')
  })

  it('shows a test failure output and its exit code without calling it a success', () => {
    opened.add('call:stage/test')
    const html = run([tool('test', { title: 'pnpm test', input: 'pnpm test', output: '1 test failed' })])
    expect(html).toContain('pnpm test')
    expect(html).toContain('1 test failed')
    expect(html).toContain('exit 1')
    expect(html).not.toContain('成功')
  })

  it('keeps actual exceptions, refusals and interruptions visible while the group runs', () => {
    const html = run([
      tool('normal'), tool('running', { status: 'running', execution: undefined }),
      tool('unknown', { name: 'Bash', execution: undefined }),
      tool('failure', { execution: { status: 'failed', exitCode: 2 } }),
      tool('denied', { status: 'denied' }), tool('interrupted', { status: 'interrupted' })
    ])
    expect(html).toContain('aria-label="进行中"')
    expect(html).toContain('2 项异常')
    expect(html).toContain('1 项已拒绝')
    expect(html).toContain('1 项已中断')
  })

  it.each([0, null])('does not invent a nonzero badge for exit %s', (exitCode) => {
    opened.add('call:stage/known')
    expect(run([tool('known', { execution: { status: 'completed', exitCode } })])).not.toContain('exit ')
  })

  it('retains failure presentation from an older core', () => {
    const html = run([tool('old', { execution: undefined }), tool('new')])
    expect(html).toContain('1 项异常')
    opened.add('run:stage/old')
    expect(run([tool('old', { execution: undefined }), tool('new')])).toContain('失败')
  })
})

describe('background commands', () => {
  const background = (changes: Partial<ToolItem> = {}) => tool('dev', { name: 'Bash', title: 'pnpm dev', description: 'Run dev server', status: 'running', execution: undefined, background: true, at: Date.now(), ...changes })

  it('tags one running in the background, with when its limit falls where the agent set one', () => {
    const html = run([background({ backgroundLimitMs: 2 * 3_600_000 })])
    expect(html).toContain('data-tool-key="stage/dev"')
    expect(html).toContain('>后台<')
    expect(html).toContain('到上限')
    expect(run([background()])).not.toContain('到上限')
  })

  it('says a command its time limit stopped ran out its time, not that it was interrupted', () => {
    const html = run([background({ status: 'interrupted', stopReason: 'timeLimit', backgroundLimitMs: 1_800_000 })])
    expect(html).toContain('跑满 30 分钟上限，被停止')
    expect(html).not.toContain('已中断')
    expect(run([background({ status: 'interrupted' })])).toContain('已中断')
  })

  it('offers to stop one the chat can stop, beside its row, and says when the user stopped it', () => {
    const stoppable = background({ stoppable: true })
    const offered = renderToStaticMarkup(createElement(StopBackground.Provider, { value: async () => true }, createElement(ChatToolRun, { tools: [stoppable] })))
    expect(offered).toContain('data-stoppable="true"')
    expect(offered).toMatch(/<\/button><button type="button" class="chat-background-stop" aria-label="停止 Run dev server">停止<\/button>/)
    // Not without a way to stop it, nor once it has ended.
    expect(run([stoppable])).not.toContain('chat-background-stop')
    expect(renderToStaticMarkup(createElement(StopBackground.Provider, { value: async () => true }, createElement(ChatToolRun, { tools: [background({ stoppable: true, status: 'interrupted', stopReason: 'user' })] }))))
      .not.toContain('chat-background-stop')
    const stopped = run([background({ status: 'interrupted', stopReason: 'user' })])
    expect(stopped).toContain('已手动停止')
    expect(stopped).not.toContain('已中断')
  })
})
