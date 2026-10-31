import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ChatItem } from '@antumi/protocol'
import { ChatApprovalCard, ChatRequestLine } from './ChatRequestCards'

vi.mock('../core-store', () => ({ perform: vi.fn() }))

type ApprovalItem = Extract<ChatItem, { kind: 'approval' }>
type ToolItem = Extract<ChatItem, { kind: 'tool' }>

const command = 'cd ~/.codex && rg -n session src | head -20'
const approval: ApprovalItem = {
  id: 'a:1', stageId: 'stage', revision: 1, at: 0, kind: 'approval', requestId: '1', tool: 'commandExecution',
  title: command, detail: '子 Agent 的请求：Not in allowlist: rg', toolItemId: 'tool:inner', decisions: ['allow', 'deny'], resolution: null
}
const render = (tool?: ToolItem) => renderToStaticMarkup(createElement(ChatApprovalCard, { conversationId: 'conversation', item: approval, tool }))

describe('approval card', () => {
  it('shows a subagent command in full, since no call in the chat holds it', () => {
    const html = render()
    expect(html).toContain('子 Agent 的请求：Not in allowlist: rg')
    expect(html).toContain(`<pre>${command.replace('&&', '&amp;&amp;')}</pre>`)
  })
  it('names a call to Antumi\'s tools as the timeline does, not by the agent\'s title for it', () => {
    const input = JSON.stringify({ agent: 'claude', instruction: '计算 1+2', ref: 'calc-1-plus-2' })
    const item: ApprovalItem = { ...approval, tool: 'antumi.antumi_agent_dispatch', title: 'antumi-antumi_agent_dispatch: antumi_agent_dispatch', detail: null, toolItemId: 'tool:call' }
    const tool: ToolItem = { id: 'tool:call', stageId: 'stage', revision: 1, at: 0, kind: 'tool', name: 'antumi.antumi_agent_dispatch', title: 'antumi: antumi_agent_dispatch', input, status: 'running', output: null, diffs: [] }
    for (const html of [renderToStaticMarkup(createElement(ChatApprovalCard, { conversationId: 'conversation', item, tool })), renderToStaticMarkup(createElement(ChatRequestLine, { item, tool }))]) {
      expect(html).toContain('calc-1-plus-2')
      expect(html).not.toContain('antumi-antumi_agent_dispatch')
    }
  })
  it('takes the command from the call when the chat has it', () => {
    const tool: ToolItem = { id: 'tool:inner', stageId: 'stage', revision: 1, at: 0, kind: 'tool', name: 'commandExecution', title: 'rg', input: 'rg -n session', status: 'running', output: null, diffs: [] }
    expect(render(tool)).toContain('<pre>rg -n session</pre>')
  })
})

it('offers only one-time approval for the helper, without suggesting a permission mode switch', () => {
  const item: ApprovalItem = { ...approval, decisions: ['allow', 'allowForSession', 'deny'], choices: [
    { id: 'once', decision: 'allow', label: '允许一次', grants: [] },
    { id: 'session', decision: 'allowForSession', label: '本会话都允许', grants: [] },
    { id: 'rule', decision: 'allow', label: '保存规则', grants: [{ kind: 'rules', scope: 'local', behavior: 'allow', values: ['rm'] }] },
    { id: 'deny', decision: 'deny', grants: [] }
  ] }
  const html = renderToStaticMarkup(createElement(ChatApprovalCard, { conversationId: 'helper', item, tool: undefined, singleApproval: true }))
  expect(html).toContain('允许一次')
  expect(html).not.toContain('本会话都允许')
  expect(html).not.toContain('保存规则')
  expect(html).not.toContain('换个权限模式')
})
