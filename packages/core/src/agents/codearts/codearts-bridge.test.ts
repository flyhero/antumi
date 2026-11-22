import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CodeartsApiError, CodeartsBridge, type CodeartsApi } from './codearts-bridge'

const PROVIDERS = { providers: [{ id: 'huaweicloud-maas', name: 'HuaweiCloud', models: { 'glm-5.3': { id: 'glm-5.3', name: 'GLM-5.3', limit: { context: 128000, output: 8192 } } } }], default: { 'huaweicloud-maas': 'glm-5.3' } }

// The server as the bridge sees it, answering as CodeArts 26.11.11's did: its requests are kept,
// and the events are the ones it streamed.
function server(messages: unknown[] = [], commands: unknown[] = [], providers: unknown = PROVIDERS, skillDirs: string[] = []) {
  const calls: { method: string; path: string; directory: string; body?: unknown }[] = []
  const api: CodeartsApi = async (method, path, directory, body) => {
    calls.push({ method, path, directory, ...(body === undefined ? {} : { body }) })
    if (path === '/session') return { id: 'ses_1', directory }
    if (path === '/session/ses_1' || path === '/session/ses_old') return { id: path.slice(9) }
    if (path === '/session/ses_child') return { id: 'ses_child', parentID: 'ses_1' }
    if (path === '/session/ses_gone') throw new CodeartsApiError(404, 'Session not found: ses_gone')
    if (path === '/session/ses_1/fork') return { id: 'ses_2' }
    if (path.endsWith('/message')) return messages
    if (path === '/config/providers') return providers
    if (path === '/command') return commands
    if (path === '/config') return { model: 'huaweicloud-maas/glm-5.3' }
    if (path === '/agent') return [{ name: 'build', mode: 'primary' }, { name: 'antumi-auto', mode: 'primary', description: 'Automatic' }, { name: 'general', mode: 'subagent' }, { name: 'title', mode: 'primary', hidden: true }]
    return {}
  }
  const sent: Record<string, unknown>[] = []
  const bridge = new CodeartsBridge(api, (frame) => sent.push(JSON.parse(JSON.stringify(frame))), Promise.resolve(), '26.11.11', skillDirs)
  const event = (type: string, properties: unknown) => bridge.event({ directory: '/work', payload: { type, properties } })
  const updates = () => sent.flatMap((frame) => frame.method === 'session/update' ? [(frame.params as { update: Record<string, unknown> }).update] : [])
  const answer = (id: string) => sent.find((frame) => frame.id === id && frame.method === undefined)
  return { calls, sent, bridge, event, updates, answer }
}

const newSession = (mcpServers: unknown[] = []) => ({ jsonrpc: '2.0', id: 'new', method: 'session/new', params: { cwd: '/work', mcpServers } })
const prompt = (text: string) => ({ jsonrpc: '2.0', id: 'p', method: 'session/prompt', params: { sessionId: 'ses_1', prompt: [{ type: 'text', text }] } })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const assistant = { info: { id: 'msg_a', role: 'assistant', sessionID: 'ses_1', providerID: 'huaweicloud-maas', modelID: 'glm-5.3', cost: 0.5, tokens: { input: 1000, output: 20, reasoning: 0, cache: { read: 200, write: 0 } } }, parts: [] }

describe('CodeArts bridge', () => {
  it('opens a session with its models and primary agents as config options, and Antumi’s MCP servers added to its server alone', async () => {
    const { bridge, calls, answer } = server()
    await bridge.receive(newSession([{ name: 'antumi', command: 'node', args: ['mcp.js'], env: [{ name: 'TOKEN', value: 't' }] }, { type: 'http', name: 'docs', url: 'https://example.com/mcp', headers: [{ name: 'authorization', value: 'Bearer x' }] }]))
    expect(calls.filter((call) => call.path === '/mcp').map((call) => call.body)).toEqual([
      { name: 'antumi', config: { type: 'local', command: ['node', 'mcp.js'], environment: { TOKEN: 't' } } },
      { name: 'docs', config: { type: 'remote', url: 'https://example.com/mcp', headers: { authorization: 'Bearer x' } } }
    ])
    expect(answer('new')?.result).toEqual({
      sessionId: 'ses_1',
      configOptions: [
        { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'huaweicloud-maas/glm-5.3', options: [{ value: 'huaweicloud-maas/glm-5.3', name: 'GLM-5.3', contextWindow: 128000 }] },
        { id: 'mode', name: 'Session Mode', category: 'mode', type: 'select', currentValue: 'build', options: [{ value: 'build', name: 'build' }, { value: 'antumi-auto', name: 'antumi-auto', description: 'Automatic' }] }
      ]
    })
    await bridge.receive({ jsonrpc: '2.0', id: 'mode', method: 'session/set_config_option', params: { sessionId: 'ses_1', configId: 'mode', value: 'general' } })
    expect(answer('mode')).toMatchObject({ error: { message: 'Mode not found: general' } })
  })

  it('says what each model takes and costs, offers its reasoning levels, and sends only a chosen one', async () => {
    const providers = { providers: [{ id: 'huaweicloud-maas', name: 'HuaweiCloud', models: {
      'glm-5.3': { id: 'glm-5.3', name: 'GLM-5.3', limit: { context: 1048576 }, options: { creditRatioDisplay: '0.12x' }, variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } } },
      'glm-mini': { id: 'glm-mini', name: 'GLM Mini', limit: { context: 0 } }
    } }], default: { 'huaweicloud-maas': 'glm-5.3' } }
    const { bridge, calls, answer, event } = server([], [], providers)
    await bridge.receive(newSession())
    expect(answer('new')?.result).toMatchObject({
      configOptions: [
        { id: 'model', options: [{ value: 'huaweicloud-maas/glm-5.3', contextWindow: 1048576, costRate: '0.12x' }, { value: 'huaweicloud-maas/glm-mini', name: 'GLM Mini' }] },
        { id: 'mode' },
        { id: 'variant', category: 'thought_level', currentValue: 'default', options: [{ value: 'low' }, { value: 'high' }, { value: 'default' }] }
      ]
    })
    const options = (answer('new')?.result as { configOptions: { options: Record<string, unknown>[] }[] }).configOptions[0]?.options
    expect(options?.[1]).not.toHaveProperty('contextWindow')
    const first = bridge.receive(prompt('hi'))
    await flush()
    expect(calls.findLast((call) => call.path === '/session/ses_1/prompt_async')?.body).not.toHaveProperty('variant')
    await event('session.idle', { sessionID: 'ses_1' })
    await first
    await bridge.receive({ jsonrpc: '2.0', id: 'v', method: 'session/set_config_option', params: { sessionId: 'ses_1', configId: 'variant', value: 'high' } })
    const second = bridge.receive(prompt('again'))
    await flush()
    expect(calls.findLast((call) => call.path === '/session/ses_1/prompt_async')?.body).toMatchObject({ variant: 'high' })
    await event('session.idle', { sessionID: 'ses_1' })
    await second
    await bridge.receive({ jsonrpc: '2.0', id: 'd', method: 'session/set_config_option', params: { sessionId: 'ses_1', configId: 'variant', value: 'default' } })
    expect(answer('d')?.result).toMatchObject({ configOptions: [{ id: 'model' }, { id: 'mode' }, { id: 'variant', currentValue: 'default' }] })
    await bridge.receive({ jsonrpc: '2.0', id: 'x', method: 'session/set_config_option', params: { sessionId: 'ses_1', configId: 'variant', value: 'ultra' } })
    expect(answer('x')).toMatchObject({ error: { message: 'Unknown reasoning level: ultra' } })
  })

  it('offers its commands and the skills it loads, and expands either before it prompts', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'codearts-skills-'))
    mkdirSync(path.join(root, 'demo'))
    writeFileSync(path.join(root, 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Demo skill\n---\nDo it.\n')
    mkdirSync(path.join(root, 'compact'))
    writeFileSync(path.join(root, 'compact', 'SKILL.md'), '---\nname: compact\ndescription: Never offered\n---\n')
    try {
      const { bridge, calls, updates, event } = server([], [{ name: 'compact', description: 'Compact the chat', template: 'Compact: $ARGUMENTS' }], PROVIDERS, [root])
      await bridge.receive(newSession())
      expect(updates().find((update) => update.sessionUpdate === 'available_commands_update')).toEqual({
        sessionUpdate: 'available_commands_update',
        availableCommands: [
          { name: 'compact', description: 'Compact the chat' },
          { name: 'demo', description: 'Demo skill', kind: 'skill' }
        ]
      })
      const first = bridge.receive(prompt('/compact now'))
      await flush()
      expect(calls.find((call) => call.path === '/session/ses_1/prompt_async')?.body).toMatchObject({ parts: [{ text: 'Compact: now' }] })
      await event('session.idle', { sessionID: 'ses_1' })
      await first
      const second = bridge.receive(prompt('/demo go'))
      await flush()
      expect(calls.filter((call) => call.path === '/session/ses_1/prompt_async').at(-1)?.body).toMatchObject({ parts: [{ text: `请使用技能「demo」，说明在 ${path.join(root, 'demo', 'SKILL.md')}。go` }] })
      await event('session.idle', { sessionID: 'ses_1' })
      await second
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('sends a prompt without waiting on it, streams its words and thoughts, and answers once the session is idle', async () => {
    const { bridge, event, calls, updates, answer } = server([assistant])
    await bridge.receive(newSession())
    await bridge.receive({ jsonrpc: '2.0', id: 'mode', method: 'session/set_config_option', params: { sessionId: 'ses_1', configId: 'mode', value: 'antumi-auto' } })
    const running = bridge.receive(prompt('hi'))
    await flush()
    expect(calls.find((call) => call.path === '/session/ses_1/prompt_async')?.body).toEqual({ parts: [{ type: 'text', text: 'hi' }], model: { providerID: 'huaweicloud-maas', modelID: 'glm-5.3' }, agent: 'antumi-auto' })
    await event('message.updated', { info: { id: 'msg_u', role: 'user', sessionID: 'ses_1' } })
    // What CodeArts adds to the user's message is the user's, and its own reminder is hidden.
    await event('message.part.updated', { part: { id: 'prt_r', sessionID: 'ses_1', messageID: 'msg_u', type: 'text', text: '', synthetic: true } })
    await event('message.part.delta', { sessionID: 'ses_1', messageID: 'msg_u', partID: 'prt_r', field: 'text', delta: '<system-reminder>' })
    await event('message.updated', { info: { id: 'msg_a', role: 'assistant', sessionID: 'ses_1' } })
    await event('message.part.updated', { part: { id: 'prt_t', sessionID: 'ses_1', messageID: 'msg_a', type: 'reasoning', text: '' } })
    await event('message.part.delta', { sessionID: 'ses_1', messageID: 'msg_a', partID: 'prt_t', field: 'text', delta: 'thinking' })
    await event('message.part.updated', { part: { id: 'prt_a', sessionID: 'ses_1', messageID: 'msg_a', type: 'text', text: '' } })
    await event('message.part.delta', { sessionID: 'ses_1', messageID: 'msg_a', partID: 'prt_a', field: 'text', delta: 'Hello' })
    expect(answer('p')).toBeUndefined()
    await event('session.idle', { sessionID: 'ses_1' })
    await running
    expect(updates()).toEqual([
      { sessionUpdate: 'agent_thought_chunk', messageId: 'msg_a', content: { type: 'text', text: 'thinking' } },
      { sessionUpdate: 'agent_message_chunk', messageId: 'msg_a', content: { type: 'text', text: 'Hello' } },
      { sessionUpdate: 'usage_update', used: 1200, size: 128000, cost: { amount: 0.5, currency: 'USD' } }
    ])
    expect(answer('p')?.result).toEqual({ stopReason: 'end_turn', usage: { inputTokens: 1000, outputTokens: 20, cachedReadTokens: 200, totalTokens: 1220 } })
  })

  it('fails a turn with the error its session reported, and stops one when told', async () => {
    const failing = server([])
    await failing.bridge.receive(newSession())
    const turn = failing.bridge.receive(prompt('hi'))
    await flush()
    await failing.event('session.error', { sessionID: 'ses_1', error: { name: 'UnknownError', data: { message: 'Model not found: mock/smoke.' } } })
    await failing.event('session.status', { sessionID: 'ses_1', status: { type: 'idle' } })
    await turn
    expect(failing.answer('p')).toMatchObject({ error: { code: -32603, message: 'Model not found: mock/smoke.' } })

    const stopped = server([])
    await stopped.bridge.receive(newSession())
    const running = stopped.bridge.receive(prompt('hi'))
    await flush()
    await stopped.bridge.receive({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 'ses_1' } })
    expect(stopped.calls.some((call) => call.path === '/session/ses_1/abort')).toBe(true)
    await stopped.event('session.error', { sessionID: 'ses_1', error: { name: 'MessageAbortedError' } })
    await stopped.event('session.idle', { sessionID: 'ses_1' })
    await running
    expect(stopped.answer('p')?.result).toEqual({ stopReason: 'cancelled' })
  })

  it('shows a tool’s calls, leaves out the tool_call that only leads to an MCP tool, and keeps a todo list', async () => {
    const { bridge, event, updates } = server()
    await bridge.receive(newSession())
    const part = (callID: string, tool: string, state: unknown) => event('message.part.updated', { part: { id: `prt_${callID}`, sessionID: 'ses_1', messageID: 'msg_a', type: 'tool', callID, tool, state } })
    await part('c1', 'tool_call', { status: 'running', input: { id: 'antumi_echo', args: { text: 'hi' } }, metadata: {} })
    await part('c2', 'antumi_echo', { status: 'completed', input: { text: 'hi' }, output: 'echo:hi', title: '', metadata: {} })
    await part('c3', 'write', { status: 'completed', input: { filePath: '/work/a.txt', content: 'hello\n' }, output: 'Wrote file successfully.', title: 'a.txt', metadata: {} })
    await part('c4', 'todowrite', { status: 'completed', input: {}, output: JSON.stringify([{ content: 'Test it', status: 'in_progress' }]), title: '1 todo', metadata: {} })
    expect(updates().map((update) => [update.sessionUpdate, update.toolCallId ?? null, update.status ?? null])).toEqual([
      ['tool_call', 'c2', 'pending'], ['tool_call_update', 'c2', 'completed'],
      ['tool_call', 'c3', 'pending'], ['tool_call_update', 'c3', 'completed'],
      ['tool_call', 'c4', 'pending'], ['plan', null, null], ['tool_call_update', 'c4', 'completed']
    ])
    expect(updates()[3]).toMatchObject({ content: [{ type: 'content' }, { type: 'diff', path: '/work/a.txt', newText: 'hello\n' }] })
    expect(updates()[3]?.content).not.toContainEqual(expect.objectContaining({ oldText: expect.anything() }))
    expect(updates()[5]).toEqual({ sessionUpdate: 'plan', entries: [{ priority: 'medium', status: 'in_progress', content: 'Test it' }] })
  })

  it('asks Antumi for a permission, a risky command shown as the command, and replies with what Antumi chose', async () => {
    const { bridge, event, sent, calls } = server()
    await bridge.receive(newSession())
    await event('permission.asked', { id: 'per_1', sessionID: 'ses_1', permission: 'blacklisted_bash', patterns: ['rmdir /work/junk'], metadata: { blacklisted: { command: 'rmdir /work/junk', message: '删除目录' } }, always: [], tool: { messageID: 'msg_a', callID: 'c1' } })
    await flush()
    const request = sent.find((frame) => frame.method === 'session/request_permission')
    expect(request?.params).toMatchObject({ sessionId: 'ses_1', toolCall: { toolCallId: 'c1', title: 'bash', kind: 'execute', rawInput: { command: 'rmdir /work/junk', description: '删除目录' } } })
    await bridge.receive({ jsonrpc: '2.0', id: request?.id, result: { outcome: { outcome: 'selected', optionId: 'once' } } })
    await flush()
    // Refused, Antumi cancels the request, which is a rejection to CodeArts.
    await event('permission.asked', { id: 'per_2', sessionID: 'ses_1', permission: 'external_directory', patterns: ['/etc/*'], metadata: {}, always: [] })
    await flush()
    const second = sent.filter((frame) => frame.method === 'session/request_permission').at(-1)
    await bridge.receive({ jsonrpc: '2.0', id: second?.id, result: { outcome: { outcome: 'cancelled' } } })
    await flush()
    expect(calls.filter((call) => call.path.startsWith('/permission/')).map((call) => [call.path, call.body])).toEqual([['/permission/per_1/reply', { reply: 'once' }], ['/permission/per_2/reply', { reply: 'reject' }]])
  })

  it('asks for a subagent’s permission under the session it runs for, and refuses a question it cannot pass on', async () => {
    const { bridge, event, sent, calls } = server()
    await bridge.receive(newSession())
    await event('permission.asked', { id: 'per_1', sessionID: 'ses_child', permission: 'bash', patterns: ['ls'], metadata: {}, always: [] })
    await flush()
    expect(sent.find((frame) => frame.method === 'session/request_permission')?.params).toMatchObject({ sessionId: 'ses_1' })
    await event('question.asked', { id: 'que_1', sessionID: 'ses_1', questions: [] })
    expect(calls.some((call) => call.path === '/question/que_1/reject')).toBe(true)
  })

  it('loads a session with its history and its last model and agent, and says when it is gone', async () => {
    const history = [
      { info: { id: 'msg_u', role: 'user', sessionID: 'ses_old', agent: 'antumi-auto', model: { providerID: 'huaweicloud-maas', modelID: 'glm-5.3' } }, parts: [{ id: 'prt_1', sessionID: 'ses_old', messageID: 'msg_u', type: 'text', text: 'hi' }, { id: 'prt_2', sessionID: 'ses_old', messageID: 'msg_u', type: 'text', text: '<system-reminder>', synthetic: true }] },
      { info: { id: 'msg_a', role: 'assistant', sessionID: 'ses_old' }, parts: [{ id: 'prt_3', sessionID: 'ses_old', messageID: 'msg_a', type: 'text', text: 'Hello' }] }
    ]
    const { bridge, updates, answer } = server(history)
    await bridge.receive({ jsonrpc: '2.0', id: 'load', method: 'session/load', params: { sessionId: 'ses_old', cwd: '/work', mcpServers: [] } })
    expect(updates().map((update) => [update.sessionUpdate, (update.content as { text: string }).text])).toEqual([['user_message_chunk', 'hi'], ['agent_message_chunk', 'Hello']])
    expect(answer('load')?.result).toMatchObject({ configOptions: [{ currentValue: 'huaweicloud-maas/glm-5.3' }, { currentValue: 'antumi-auto' }] })
    await bridge.receive({ jsonrpc: '2.0', id: 'gone', method: 'session/load', params: { sessionId: 'ses_gone', cwd: '/work', mcpServers: [] } })
    expect(answer('gone')).toMatchObject({ error: { code: -32002, message: 'Session not found: ses_gone' } })
  })

  it('answers a start the server could not make with its reason', async () => {
    const failed = Promise.reject(new Error('认证失败，没有设置环境变量CODEARTS_CLI_AK/CODEARTS_CLI_SK'))
    failed.catch(() => {})
    const sent: Record<string, unknown>[] = []
    await new CodeartsBridge(async () => ({}), (frame) => sent.push(JSON.parse(JSON.stringify(frame))), failed).receive({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: {} })
    expect(sent).toEqual([{ jsonrpc: '2.0', id: 'init', error: { code: -32603, message: '认证失败，没有设置环境变量CODEARTS_CLI_AK/CODEARTS_CLI_SK' } }])
  })
})
