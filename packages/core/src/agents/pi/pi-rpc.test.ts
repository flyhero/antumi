import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ChatItem } from '@antumi/protocol'
import type { ChatRecord, ChatStageOptions } from '../../chat-driver'
import { parseChatRecord } from '../../chat-log'
import { PiRpc } from './pi-rpc'

// Pi 1.0.4 as captured by orca (fixtures/pi-recordings.md), signed in to openai-codex.
const PREFERRED = { model: 'openai-codex/gpt-5.5', effort: 'off' }
const OPTIONS: ChatStageOptions = { cwd: '/work/repo', extraDirs: [], resume: null }
const CAPTURED: ChatStageOptions = { ...OPTIONS, preferred: PREFERRED }
const MODEL = { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai-codex', reasoning: true, input: ['text', 'image'], contextWindow: 272000, thinkingLevelMap: { xhigh: 'xhigh', minimal: 'low' } }
const TEXT_MODEL = { id: 'glm-5', name: 'GLM 5', provider: 'zai', reasoning: false, input: ['text'], contextWindow: 128000 }

const records = (name: string): ChatRecord[] => readFileSync(new URL(`./fixtures/${name}.jsonl`, import.meta.url), 'utf8').trim().split('\n').flatMap((line) => {
  const record = parseChatRecord(line)
  return record ? [record] : []
})
const items = <K extends ChatItem['kind']>(driver: PiRpc, kind: K) => driver.items.list().filter((item): item is Extract<ChatItem, { kind: K }> => item.kind === kind)
const state = (driver: PiRpc) => items(driver, 'state').at(-1)
// What a client sees, apart from when each item first showed and how often it changed.
const shown = (driver: PiRpc) => driver.items.list().filter((item) => item.kind !== 'state').map(({ at: _at, revision: _revision, ...item }) => item)
const Sent = z.looseObject({ id: z.string().optional(), type: z.string(), message: z.string().optional() })

function play(name: string, options: ChatStageOptions = CAPTURED): { live: PiRpc; replayed: PiRpc } {
  const live = new PiRpc('stage', options)
  const replayed = new PiRpc('stage', options)
  for (const record of records(name)) {
    live.apply(record)
    // The log keeps what logged() says of each frame from the agent, and the rest as it is.
    if (record.dir !== 'in') { replayed.apply(record); continue }
    const kept = live.logged(record.frame)
    if (kept !== null) replayed.apply({ ...record, frame: kept })
  }
  return { live, replayed }
}

// A driver past its handshake, on the model given.
function opened(options: ChatStageOptions = OPTIONS, model: object = MODEL): PiRpc {
  const driver = new PiRpc('stage', options)
  const frames = driver.due()
  expect(frames.map((frame) => Sent.parse(frame).type)).toEqual(['get_state', 'get_available_models', 'get_commands'])
  frames.forEach((frame) => driver.apply({ dir: 'out', at: 1, frame }))
  driver.apply({ dir: 'in', at: 2, frame: { id: 'pi-state', type: 'response', command: 'get_state', success: true, data: { model, thinkingLevel: 'medium', sessionFile: '/home/user/.pi/agent/sessions/--work-repo--/s.jsonl', sessionId: 's' } } })
  driver.apply({ dir: 'in', at: 2, frame: { id: 'pi-models', type: 'response', command: 'get_available_models', success: true, data: { models: [MODEL, TEXT_MODEL] } } })
  driver.apply({ dir: 'in', at: 2, frame: { id: 'pi-commands', type: 'response', command: 'get_commands', success: true, data: { commands: [{ name: 'antumi-mode', source: 'extension' }, { name: 'skill:review', description: 'Review a diff\nin detail', source: 'skill' }] } } })
  return driver
}

const send = (driver: PiRpc, text: string, at = 3) => {
  const { wire, logged } = driver.send(text)
  driver.apply({ dir: 'out', at, frame: logged })
  return Sent.parse(wire)
}
const receive = (driver: PiRpc, frame: unknown, at = 4) => driver.apply({ dir: 'in', at, frame })
const reply = (driver: PiRpc, text: string, at = 5) => {
  receive(driver, { type: 'message_start', message: { role: 'assistant', content: [] } }, at)
  receive(driver, { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text }], provider: 'openai-codex', model: 'gpt-5.5', stopReason: 'stop', usage: { input: 100, output: 20, cacheRead: 50, cacheWrite: 0, totalTokens: 170, cost: { total: 0.01 } } } }, at)
  receive(driver, { type: 'agent_end', messages: [] }, at)
  receive(driver, { type: 'agent_settled' }, at)
}

describe('Pi over RPC', () => {
  it('reads its state, models and commands, then sets the remembered model and effort', () => {
    const driver = new PiRpc('stage', CAPTURED)
    const { live } = play('pi-steer')
    expect(live.ready()).toBe(true)
    expect(state(live)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask', 'acceptEdits', 'plan', 'readOnly'], model: 'openai-codex/gpt-5.5', effort: 'off' })
    const model = state(live)?.models.find((each) => each.id === 'openai-codex/gpt-5.5')
    // xhigh is in its thinking map, max is not; minimal maps to low but is still offered.
    expect(model?.efforts).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
    expect(driver.ready()).toBe(false)
  })

  it('offers bypass only where the conversation allows it', () => {
    expect(state(opened(OPTIONS))?.permissionModes).toEqual(['ask', 'acceptEdits', 'plan', 'readOnly'])
    expect(state(opened({ ...OPTIONS, allowBypass: true }))?.permissionModes).toEqual(['ask', 'acceptEdits', 'plan', 'readOnly', 'bypass'])
    expect(state(opened({ ...OPTIONS, planOnly: true }))).toMatchObject({ permissionMode: 'plan', permissionModes: ['plan'] })
  })

  it('lists its commands but Antumi own mode switch', () => {
    expect(state(opened(OPTIONS))?.commands).toEqual([{ name: 'skill:review', description: 'Review a diff', argumentHint: null }])
  })

  it('shows a turn with a command, two messages sent into it, and what it cost, the same rebuilt from its log', () => {
    const { live, replayed } = play('pi-steer')
    expect(items(live, 'user').map((item) => [item.text.split(' ').slice(0, 3).join(' '), item.steer ?? false])).toEqual([['Use bash to', false], ['After the running', true], ['Then reply FOLLOWUP_CONSUMED', true]])
    expect(items(live, 'tool')).toEqual([expect.objectContaining({ name: 'commandExecution', title: 'printf capture-start; sleep 20; printf capture-finish', status: 'done', output: 'capture-startcapture-finish', execution: { status: 'completed', exitCode: 0 } })])
    expect(items(live, 'assistant').map((item) => [item.text, item.streaming])).toEqual([['STEER_CONSUMED', false], ['FOLLOWUP_CONSUMED', false]])
    const [turn] = items(live, 'turn')
    expect(turn).toMatchObject({ state: 'completed', error: null, metering: { calls: 3, callsEstimated: false } })
    expect(turn?.metering?.models.map((model) => model.model)).toEqual(['openai-codex/gpt-5.5'])
    expect(turn?.metering?.reportedCostUsd).toBeGreaterThan(0)
    expect(live.providerSessionId()).toMatch(/\.jsonl$/)
    expect(live.activity()).toBe('idle')
    expect(shown(replayed)).toEqual(shown(live))
  })

  it('shows an Antumi tool called through the extension, and a write refused in read-only mode', () => {
    // Recorded by Antumi on Pi 1.3.0 with its own extension and a one-tool MCP server.
    const { live, replayed } = play('pi-mcp-readonly', OPTIONS)
    expect(items(live, 'tool').map((item) => [item.name, item.status, item.output])).toEqual([
      ['mcp__antumi__echo', 'done', 'ECHO:hi'],
      ['Write', 'failed', '只读模式下不能运行write：只读代码、搜索文件，不要修改任何东西（Antumi）']
    ])
    expect(items(live, 'assistant').map((item) => item.text)).toEqual(['ECHO:hi', '被拒绝，原因是：只读模式下不能运行write。'])
    expect(items(live, 'turn').map((item) => item.state)).toEqual(['completed', 'completed'])
    expect(state(live)).toMatchObject({ permissionMode: 'readOnly', model: 'bailian/qwen3.7-flash-2026-07-15' })
    expect(shown(replayed)).toEqual(shown(live))
  })

  it('plans read-only, carries the plan out on approval, and shows each tool as it ended', () => {
    // Recorded by Antumi on Pi 1.3.0, through this driver: plan mode, the plan approved, then a screenshot.
    const keepImage = (data: string) => ({ id: `${createHash('sha256').update(data).digest('hex')}.png`, width: 1, height: 1 })
    const { live, replayed } = play('pi-plan-tools', { ...OPTIONS, preferred: { permissionMode: 'plan', model: 'bailian/qwen3.7-flash-2026-07-15' }, keepImage })
    expect(items(live, 'user').map((item) => item.text.slice(0, 10))).toEqual(['src/app.ts', '按这个计划开始执行。', '调用 mcp__an'])
    expect(items(live, 'approval')).toEqual([expect.objectContaining({ tool: 'plan', resolution: 'allowed', mode: 'ask' })])
    const tools = items(live, 'tool')
    // Nothing is left running: each call's end is read, whatever its result carries.
    expect(tools.filter((tool) => tool.status !== 'done' && tool.status !== 'failed')).toEqual([])
    // In plan mode a chained command is refused; the plain grep it tried next went through.
    expect(tools[1]).toMatchObject({ name: 'commandExecution', status: 'failed', output: expect.stringMatching(/^规划模式下不能运行/) })
    expect(tools[2]).toMatchObject({ name: 'commandExecution', status: 'done', execution: { status: 'completed', exitCode: 0 } })
    const edit = tools.find((tool) => tool.name === 'Edit')
    expect(edit?.diffs).toEqual([expect.objectContaining({ path: '/work/repo/src/app.ts', change: 'update', patch: expect.stringMatching(/^@@ -1,4 \+1,3 @@\n export function greet/) })])
    const screenshot = tools.find((tool) => tool.name === 'mcp__antumi__browser_screenshot')
    expect(screenshot?.images).toHaveLength(1)
    expect(items(live, 'turn').map((turn) => turn.state)).toEqual(['completed', 'completed', 'completed'])
    expect(state(live)?.permissionMode).toBe('ask')
    expect(shown(replayed)).toEqual(shown(live))
  })

  it('ends a turn stopped mid-command as interrupted, not failed', () => {
    const { live, replayed } = play('pi-abort')
    expect(items(live, 'turn')).toEqual([expect.objectContaining({ state: 'interrupted', error: null })])
    expect(items(live, 'tool')).toEqual([expect.objectContaining({ status: 'interrupted', output: 'capture-start\n\nCommand aborted' })])
    expect(shown(replayed)).toEqual(shown(live))
  })

  it('fails a turn the provider could not answer, with its words', () => {
    const { live, replayed } = play('pi-provider-error')
    expect(items(live, 'turn')).toEqual([expect.objectContaining({ state: 'failed', error: 'fetch failed' })])
    expect(shown(replayed)).toEqual(shown(live))
  })

  it('says how to sign in when no model is there to run', () => {
    const { live } = play('pi-signed-out')
    expect(live.ready()).toBe(false)
    expect(live.failure()).toMatch(/\/login/)
    expect(live.explainFailure('No API key found for the selected model.')).toMatch(/\/login/)
  })

  it('ends a command Pi runs itself as a turn, with what it said', () => {
    const { live, replayed } = play('pi-command')
    expect(items(live, 'turn')).toEqual([expect.objectContaining({ state: 'completed' })])
    expect(items(live, 'notice').map((notice) => notice.text)).toEqual(['command completed without a model call'])
    expect(shown(replayed)).toEqual(shown(live))
  })

  it('puts aside every dialog an extension opens', () => {
    const driver = opened(OPTIONS)
    send(driver, '/qa-dialogs')
    receive(driver, { type: 'extension_ui_request', id: 'ui-1', method: 'confirm', title: 'Continue?', message: 'Continue the capture?' })
    receive(driver, { type: 'extension_ui_request', id: 'ui-2', method: 'setStatus', statusKey: 'k', statusText: 'busy' })
    expect(driver.due()).toEqual([{ type: 'extension_ui_response', id: 'ui-1', cancelled: true }])
    driver.apply({ dir: 'out', at: 5, frame: { type: 'extension_ui_response', id: 'ui-1', cancelled: true } })
    expect(driver.due()).toEqual([])
    // Answered in the log, they are owed no more.
    const { live } = play('pi-dialogs')
    expect(live.due().filter((frame) => Sent.parse(frame).type === 'extension_ui_response')).toEqual([])
  })

  it('keeps no session to resume until Pi has written a message to it', () => {
    const driver = opened()
    expect(driver.providerSessionId()).toBeNull()
    send(driver, 'hello')
    receive(driver, { type: 'message_end', message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } })
    expect(driver.providerSessionId()).toBe('/home/user/.pi/agent/sessions/--work-repo--/s.jsonl')
    expect(opened({ ...OPTIONS, resume: '/home/user/.pi/agent/sessions/--work-repo--/s.jsonl' }).providerSessionId()).toBe('/home/user/.pi/agent/sessions/--work-repo--/s.jsonl')
  })

  it('on a model provider offers only its models, and starts on its default one', () => {
    const providerModels = [{ id: 'antumi-glm/glm-5', label: 'GLM 5', description: null, efforts: ['high'], isDefault: true }]
    const driver = opened({ ...OPTIONS, providerModels })
    expect(state(driver)?.models).toEqual(providerModels)
    expect(driver.ready()).toBe(false)
    const [initial] = driver.due()
    expect(initial).toEqual({ id: 'pi-initial-model', type: 'set_model', provider: 'antumi-glm', modelId: 'glm-5' })
    driver.apply({ dir: 'out', at: 3, frame: initial })
    receive(driver, { id: 'pi-initial-model', type: 'response', command: 'set_model', success: true, data: { ...MODEL, provider: 'antumi-glm', id: 'glm-5' } })
    expect(driver.ready()).toBe(true)
    expect(state(driver)?.model).toBe('antumi-glm/glm-5')
    // Pi lists the user's own models too; none of them is offered.
    expect(() => driver.setOption('model', 'openai-codex/gpt-5.5')).toThrow(/模型/)
    send(driver, 'hi')
    reply(driver, 'hello')
    // Pi prices a turn at the model's list price, which is not what the provider charges.
    expect(items(driver, 'turn').at(-1)).toMatchObject({ usage: { input: 150, output: 20 }, metering: { reportedCostUsd: null, models: [expect.objectContaining({ costUsd: null })] } })
  })

  it('fails the start on a model provider whose model Pi will not take, rather than run on another', () => {
    const driver = opened({ ...OPTIONS, providerModels: [{ id: 'antumi-glm/glm-5', label: 'GLM 5', description: null, efforts: [], isDefault: true }] })
    driver.due().forEach((frame) => driver.apply({ dir: 'out', at: 3, frame }))
    receive(driver, { id: 'pi-initial-model', type: 'response', command: 'set_model', success: false, error: 'Model not found: antumi-glm/glm-5' })
    expect(driver.ready()).toBe(false)
    expect(driver.failure()).toMatch(/服务商的模型/)
  })

  it('shows an item another record brought, as an imported session does', () => {
    const driver = new PiRpc('stage', OPTIONS)
    driver.apply({ dir: 'item', at: 1, item: { id: 'u:old', kind: 'user', text: 'from before', images: [], stageId: 'stage', revision: 1, at: 1 } })
    expect(items(driver, 'user').map((item) => item.text)).toEqual(['from before'])
  })

  it('takes a resumed session Pi opens empty as one that is gone', () => {
    // Pi 1.3.0 answers --session with a missing file by starting a new, empty session there.
    const driver = new PiRpc('stage', { ...OPTIONS, resume: '/gone.jsonl' })
    driver.due().forEach((frame) => driver.apply({ dir: 'out', at: 1, frame }))
    driver.apply({ dir: 'in', at: 2, frame: { id: 'pi-state', type: 'response', command: 'get_state', success: true, data: { model: MODEL, thinkingLevel: 'off', sessionFile: '/gone.jsonl', messageCount: 0 } } })
    expect(driver.sessionLost()).toBe(true)
    expect(driver.failure()).toMatch(/会话/)
  })

  it('tells a session that is gone from one that failed', () => {
    const driver = new PiRpc('stage', { ...OPTIONS, resume: '/gone.jsonl' })
    driver.apply({ dir: 'exit', at: 1, code: 1, stderr: 'Error: Session not found: /gone.jsonl' })
    expect(driver.sessionLost()).toBe(true)
    const other = new PiRpc('stage', { ...OPTIONS, resume: '/s.jsonl' })
    other.apply({ dir: 'exit', at: 1, code: 1, stderr: 'TypeError: boom' })
    expect(other.sessionLost()).toBe(false)
  })

  it('shows its tools as the chat labels them, with diffs from what they were given', () => {
    const driver = opened({ ...OPTIONS, keepImage: (data) => (data === 'cG5n' ? { id: 'a'.repeat(64) + '.png', width: 4, height: 3 } : null) })
    send(driver, 'go')
    const tool = (toolCallId: string, toolName: string, args: object, result: object = { content: [{ type: 'text', text: 'ok' }] }) => {
      receive(driver, { type: 'tool_execution_start', toolCallId, toolName, args })
      receive(driver, { type: 'tool_execution_end', toolCallId, toolName, result, isError: false })
    }
    tool('1', 'read', { path: 'src/a.ts' })
    tool('2', 'edit', { path: 'src/a.ts', edits: [{ oldText: 'a', newText: 'b' }] })
    tool('3', 'write', { path: 'src/b.ts', content: 'x\ny\n' })
    tool('4', 'grep', { pattern: 'TODO', path: 'src' })
    const screenshot = { content: [{ type: 'image', data: 'cG5n', mimeType: 'image/png' }] }
    receive(driver, { type: 'tool_execution_start', toolCallId: '5', toolName: 'mcp__antumi__browser_screenshot', args: {} })
    const end = { type: 'tool_execution_end', toolCallId: '5', toolName: 'mcp__antumi__browser_screenshot', result: screenshot, isError: false }
    receive(driver, end)
    expect(items(driver, 'tool').map((item) => [item.name, item.title, item.diffs.map((diff) => diff.patch)])).toEqual([
      ['Read', 'src/a.ts', []],
      ['Edit', 'src/a.ts', ['@@\n-a\n+b']],
      ['Write', 'src/b.ts', ['+x\n+y']],
      ['Grep', 'TODO · src', []],
      ['mcp__antumi__browser_screenshot', '', []]
    ])
    expect(items(driver, 'tool').at(-1)?.images).toEqual([{ id: 'a'.repeat(64) + '.png', width: 4, height: 3 }])
    // The log keeps the marker naming the stored copy, never the bytes.
    const kept = JSON.stringify(driver.logged(end))
    expect(kept).not.toContain('cG5n')
    expect(kept).toContain('antumi-image')
  })

  it('refuses images for a model that reads only text', () => {
    const driver = opened(OPTIONS, TEXT_MODEL)
    const image = { id: 'a'.repeat(64) + '.png', width: 1, height: 1, mime: 'image/png' as const, path: '/i.png', read: () => new Uint8Array([1]) }
    expect(() => driver.send('look', [image])).toThrow(/图片/)
  })

  it('switches model, effort and mode between turns, as Pi confirms them', () => {
    const driver = opened(OPTIONS)
    const [model] = driver.setOption('model', 'zai/glm-5')
    expect(model).toMatchObject({ type: 'set_model', provider: 'zai', modelId: 'glm-5' })
    driver.apply({ dir: 'out', at: 3, frame: model })
    expect(driver.optionResult(model)).toEqual({ pending: true, error: null })
    expect(() => driver.send('x')).toThrow(/确认/)
    receive(driver, { id: Sent.parse(model).id, type: 'response', command: 'set_model', success: true, data: TEXT_MODEL })
    expect(state(driver)).toMatchObject({ model: 'zai/glm-5' })
    // A model that does not reason takes no effort.
    expect(() => driver.setOption('effort', 'high')).toThrow(/effort/)
    const [mode] = driver.setOption('permissionMode', 'readOnly')
    expect(mode).toMatchObject({ type: 'prompt', message: '/antumi-mode readOnly' })
    driver.apply({ dir: 'out', at: 5, frame: mode })
    receive(driver, { id: Sent.parse(mode).id, type: 'response', command: 'prompt', success: true, data: { disposition: 'handled' } })
    expect(state(driver)?.permissionMode).toBe('readOnly')
    expect(items(driver, 'turn')).toEqual([])
    expect(() => driver.setOption('permissionMode', 'bypass')).toThrow(/bypass/)
  })

  it('keeps a plan-only stage in plan mode', () => {
    const driver = opened({ ...OPTIONS, planOnly: true })
    expect(() => driver.setOption('permissionMode', 'ask')).toThrow(/规划/)
  })

  it('takes a reply in plan mode as a plan to approve, carried out in the mode picked', () => {
    const driver = opened({ ...OPTIONS, preferred: { permissionMode: 'plan' } })
    const wire = send(driver, 'add a cache')
    // Pi has no plan mode: the model is told on the wire, the chat shows the message alone.
    expect(wire.message).toMatch(/^（Antumi 规划模式/)
    expect(items(driver, 'user').at(-1)?.text).toBe('add a cache')
    reply(driver, '1. Add an LRU\n2. Test it')
    expect(items(driver, 'approval')).toEqual([expect.objectContaining({ tool: 'plan', requestId: 'plan:pi:1', detail: '1. Add an LRU\n2. Test it', resolution: null })])
    expect(driver.waitingPlans()).toEqual(['plan:pi:1'])
    expect(driver.activity()).toBe('awaiting')
    const frames = driver.respond('plan:pi:1', { decision: 'allow' })
    expect(frames.map((frame) => Sent.parse(frame).message)).toEqual(['/antumi-mode ask', '按这个计划开始执行。'])
    frames.forEach((frame) => driver.apply({ dir: 'out', at: 6, frame }))
    expect(items(driver, 'approval').at(-1)).toMatchObject({ resolution: 'allowed', mode: 'ask' })
    expect(state(driver)?.permissionMode).toBe('ask')
    expect(driver.waitingPlans()).toEqual([])
  })

  it('carries a plan out in the automatic mode when it is allowed for the session, as a run nobody watches does', () => {
    const driver = opened({ ...OPTIONS, preferred: { permissionMode: 'plan' } })
    send(driver, 'add a cache')
    reply(driver, 'the plan')
    const frames = driver.respond('plan:pi:1', { decision: 'allowForSession' })
    expect(Sent.parse(frames[0]).message).toBe('/antumi-mode acceptEdits')
    frames.forEach((frame) => driver.apply({ dir: 'out', at: 6, frame }))
    expect(items(driver, 'approval').at(-1)).toMatchObject({ resolution: 'allowedForSession', mode: 'acceptEdits' })
  })

  it('plans on when a plan is sent back or kept for later', () => {
    const driver = opened({ ...OPTIONS, preferred: { permissionMode: 'plan' } })
    send(driver, 'add a cache')
    reply(driver, 'the plan')
    const [denied] = driver.respond('plan:pi:1', { decision: 'deny', message: 'smaller' })
    expect(Sent.parse(denied).message).toMatch(/继续规划：smaller$/)
    driver.apply({ dir: 'out', at: 6, frame: denied })
    expect(items(driver, 'approval').at(-1)).toMatchObject({ resolution: 'denied' })
    reply(driver, 'a smaller plan', 7)
    const [saved] = driver.respond('plan:pi:2', { decision: 'allow', saved: true })
    expect(Sent.parse(saved).message).toMatch(/计划已保存到任务里/)
    const readOnly = opened({ ...OPTIONS, planOnly: true })
    send(readOnly, 'plan it')
    reply(readOnly, 'the plan')
    expect(() => readOnly.respond('plan:pi:1', { decision: 'allow' })).toThrow(/规划/)
  })

  it('counts tokens and cost per model, cache reads in the input', () => {
    const driver = opened()
    send(driver, 'hi')
    reply(driver, 'hello')
    expect(items(driver, 'turn').at(-1)).toMatchObject({ usage: { input: 150, output: 20 }, metering: { models: [{ model: 'openai-codex/gpt-5.5', input: 150, output: 20, cacheRead: 50, cacheWrite: 0, cacheWrite1h: null, costUsd: 0.01 }], calls: 1, reportedCostUsd: 0.01 } })
    expect(state(driver)?.context).toEqual({ used: 170, window: 272000 })
    expect(driver.takeMessages().map((message) => [message.role, message.text, message.complete])).toEqual([['user', 'hi', false], ['assistant', 'hello', true]])
  })

  it('marks where its context was compacted, and a retry while it runs', () => {
    const driver = opened()
    send(driver, 'hi')
    receive(driver, { type: 'auto_retry_start', attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: '529 overloaded' })
    expect(state(driver)?.activity).toMatch(/1\/3/)
    receive(driver, { type: 'auto_retry_end', success: true, attempt: 2 })
    expect(state(driver)?.activity).toBeNull()
    receive(driver, { type: 'compaction_end', reason: 'threshold', result: {}, aborted: false, willRetry: false })
    expect(items(driver, 'notice').map((notice) => notice.text)).toEqual(['对话上下文已压缩'])
  })

  it('takes a message into the running turn, and starts the next with one that came as it ended', () => {
    const driver = opened()
    send(driver, 'first')
    expect(driver.canSteer()).toBe(true)
    const { logged } = driver.steer('also this')
    driver.apply({ dir: 'out', at: 4, frame: logged, ref: 'm2' })
    reply(driver, 'done')
    receive(driver, { id: Sent.parse(logged).id, type: 'response', command: 'prompt', success: true, data: { disposition: 'started' } }, 6)
    expect(items(driver, 'user').map((item) => [item.id, item.steer ?? false])).toEqual([['u:pi:1', false], ['u:m2', false]])
    expect(driver.activeTurnRef()).toBe('m2')
  })

  it('drops a message meant for that turn alone when Pi refuses it', () => {
    const driver = opened()
    send(driver, 'first')
    const { logged } = driver.steer('also this')
    driver.apply({ dir: 'out', at: 4, frame: logged, ref: 'm2', strict: true })
    receive(driver, { id: Sent.parse(logged).id, type: 'response', command: 'prompt', success: false, error: 'agent is not streaming' }, 5)
    expect(driver.items.get('u:m2')).toBeUndefined()
    expect(driver.items.get('steer-refused:m2')).toMatchObject({ kind: 'notice', text: expect.stringContaining('also this') })
    reply(driver, 'done')
    expect(driver.queuedToSend()).toBeNull()
  })
})
