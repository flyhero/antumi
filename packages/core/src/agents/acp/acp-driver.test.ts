import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ChatItem } from '@antumi/protocol'
import type { ChatStageOptions } from '../../chat-driver'
import { AcpDriver } from './acp-driver'
import type { AcpDialect } from './acp-dialect'

// An agent that speaks plain ACP and adds nothing: what a new agent's dialect starts from.
const plain: AcpDialect = { name: 'Plain', idPrefix: 'plain', modes: { ask: 'default', plan: 'plan' } }
const OPTIONS: ChatStageOptions = { cwd: '/work', extraDirs: [], resume: null }
const Request = z.looseObject({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional(), params: z.unknown().optional(), error: z.looseObject({ code: z.number() }).optional() })
const modes = { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }] }

const receive = (driver: AcpDriver, frame: unknown, at = 2) => driver.apply({ dir: 'in', at, frame })
const due = (driver: AcpDriver) => {
  const frames = driver.due()
  frames.forEach((frame) => driver.apply({ dir: 'out', at: 1, frame }))
  return frames.map((frame) => Request.parse(frame))
}
const items = <K extends ChatItem['kind']>(driver: AcpDriver, kind: K) => driver.items.list().filter((item): item is Extract<ChatItem, { kind: K }> => item.kind === kind)

function opened(options: ChatStageOptions = OPTIONS): AcpDriver {
  const driver = new AcpDriver(plain, 'stage', options)
  due(driver)
  // Listing auth methods asks nothing of a dialect that names none: the CLI is signed in on its own.
  receive(driver, { id: 'plain-init', result: { protocolVersion: 1, authMethods: [{ id: 'oauth' }] } })
  due(driver)
  receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
  return driver
}

describe('ACP without a dialect of its own', () => {
  it('opens a session with nothing but the standard handshake', () => {
    const driver = new AcpDriver(plain, 'stage', OPTIONS)
    const [init] = due(driver)
    expect(init).toMatchObject({ id: 'plain-init', method: 'initialize', params: { clientCapabilities: { terminal: false } } })
    expect(JSON.stringify(init)).not.toContain('_meta')
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1, authMethods: [{ id: 'oauth' }] } })
    expect(due(driver).map((frame) => frame.method)).toEqual(['session/new'])
    receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
    expect(driver.ready()).toBe(true)
    expect(driver.failure()).toBeNull()
    expect(items(driver, 'state').at(-1)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask', 'plan'] })
  })

  it('runs a turn: streamed reply, a command named by its kind, an approval, the end', () => {
    const driver = opened()
    const message = driver.send('hello')
    driver.apply({ dir: 'out', at: 3, frame: message.logged })
    expect(Request.parse(message.wire)).toMatchObject({ id: 'plain-prompt-1', method: 'session/prompt' })
    expect(driver.turnSignal(message.logged, 'out')).toBe('prompt')

    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Running the tests.' } } } })
    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'tool_call', toolCallId: 'call', title: 'pnpm test', kind: 'execute', status: 'pending', rawInput: { command: 'pnpm test' } } } })
    receive(driver, { id: 7, method: 'session/request_permission', params: { sessionId: 'session', toolCall: { toolCallId: 'call', title: 'pnpm test', kind: 'execute' }, options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }] } })
    expect(driver.activity()).toBe('awaiting')
    const [approval] = items(driver, 'approval')
    expect(approval).toMatchObject({ tool: 'commandExecution', title: 'pnpm test' })
    const answer = driver.respond(approval!.requestId, { decision: 'allow', choice: 'yes' })
    expect(answer).toEqual([{ jsonrpc: '2.0', id: 7, result: { outcome: { outcome: 'selected', optionId: 'yes' } } }])
    answer.forEach((frame) => driver.apply({ dir: 'out', at: 4, frame }))

    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'tool_call_update', toolCallId: 'call', status: 'completed', rawOutput: { exitCode: 0 } } } })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn' } })
    // The command itself, as Claude's and Codex's cards show one, not the JSON it came in.
    expect(items(driver, 'tool')[0]).toMatchObject({ name: 'commandExecution', input: 'pnpm test', status: 'done', execution: { status: 'completed', exitCode: 0 } })
    expect(items(driver, 'turn')[0]).toMatchObject({ state: 'completed', error: null })
    expect(driver.takeMessages().map((each) => each.role)).toEqual(['user', 'assistant'])
  })

  it('refuses an edit of a reference project itself, and leaves other requests to the user', () => {
    const driver = opened({ ...OPTIONS, references: ['/refs/docs'] })
    driver.apply({ dir: 'out', at: 3, frame: driver.send('hello').logged })
    const options = [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }]
    const ask = (id: number, toolCall: object) => receive(driver, { id, method: 'session/request_permission', params: { sessionId: 'session', toolCall, options } })
    ask(7, { toolCallId: 'edit', title: 'Edit `/refs/docs/README.md`', kind: 'edit', content: [{ type: 'diff', path: '/refs/docs/README.md', oldText: 'a', newText: 'b' }] })
    expect(due(driver)).toEqual([{ jsonrpc: '2.0', id: 7, result: { outcome: { outcome: 'selected', optionId: 'no' } } }])
    expect(items(driver, 'approval')[0]).toMatchObject({ resolution: 'denied', detail: expect.stringContaining('/refs/docs/README.md') })
    // Antigravity names the file in the request's locations, with no diff.
    ask(10, { toolCallId: 'write', title: 'Run write_to_file?', kind: 'edit', locations: [{ path: '/refs/docs/new.md' }], rawInput: { TargetFile: '/refs/docs/new.md' } })
    expect(due(driver)).toEqual([{ jsonrpc: '2.0', id: 10, result: { outcome: { outcome: 'selected', optionId: 'no' } } }])
    expect(driver.activity()).not.toBe('awaiting')
    // Reading there, editing elsewhere, or a folder that only shares the name, is the user's to answer.
    ask(8, { toolCallId: 'read', title: 'Read', kind: 'read', locations: [{ path: '/refs/docs/README.md' }] })
    ask(9, { toolCallId: 'other', title: 'Edit', kind: 'edit', rawInput: { filePath: '/refs/docs-v2/README.md' } })
    expect(due(driver)).toEqual([])
    expect(items(driver, 'approval').filter((item) => item.resolution === null)).toHaveLength(2)
  })

  it('answers a bare decision with the option of its kind, and refuses one it offers none of', () => {
    const driver = opened()
    driver.apply({ dir: 'out', at: 3, frame: driver.send('hello').logged })
    receive(driver, { id: 7, method: 'session/request_permission', params: { sessionId: 'session', toolCall: { toolCallId: 'call', title: 'pnpm test', kind: 'execute' }, options: [{ optionId: 'always', name: 'Always', kind: 'allow_always' }, { optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }] } })
    const [approval] = items(driver, 'approval')
    expect(driver.respond(approval!.requestId, { decision: 'allow' })).toEqual([{ jsonrpc: '2.0', id: 7, result: { outcome: { outcome: 'selected', optionId: 'yes' } } }])
    expect(driver.respond(approval!.requestId, { decision: 'allowForSession' })).toEqual([{ jsonrpc: '2.0', id: 7, result: { outcome: { outcome: 'selected', optionId: 'always' } } }])

    receive(driver, { id: 8, method: 'session/request_permission', params: { sessionId: 'session', toolCall: { toolCallId: 'other', title: 'rm', kind: 'execute' }, options: [{ optionId: 'always', name: 'Always', kind: 'allow_always' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }] } })
    const second = items(driver, 'approval').find((item) => item.requestId !== approval!.requestId)
    expect(() => driver.respond(second!.requestId, { decision: 'allow' })).toThrow(expect.objectContaining({ reason: 'chat-option-invalid' }))
  })

  it('shows no input for a call on a file its title names, and the rest of a search\'s', () => {
    const driver = opened()
    driver.apply({ dir: 'out', at: 3, frame: driver.send('look').logged })
    const call = (toolCallId: string, kind: string, rawInput: unknown) => receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'tool_call', toolCallId, title: kind, kind, status: 'completed', rawInput } } })
    call('read', 'read', { path: '/work/a.ts' })
    call('search', 'search', { path: '/work', pattern: 'TODO' })
    expect(items(driver, 'tool').map((tool) => [tool.title, tool.input])).toEqual([['/work/a.ts', null], ['/work', '{"path":"/work","pattern":"TODO"}']])
  })

  it('tells the agent of the user\'s vault ahead of its first prompt only, and only on the wire', () => {
    const driver = new AcpDriver(plain, 'stage', { ...OPTIONS, knowledgeBase: { path: '/notes/vault', write: true } })
    due(driver)
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1, agentCapabilities: { sessionCapabilities: { additionalDirectories: true } } } })
    const [session] = due(driver)
    expect(session).toMatchObject({ method: 'session/new', params: { additionalDirectories: ['/notes/vault'] } })
    receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
    const first = driver.send('hello')
    expect(Request.parse(first.wire).params).toMatchObject({ prompt: [{ type: 'text', text: expect.stringMatching(/^用户的 Obsidian 知识库在 \/notes\/vault。[\s\S]*\n\nhello$/) }] })
    expect(Request.parse(first.logged).params).toEqual({ sessionId: 'session', prompt: [{ type: 'text', text: 'hello' }] })
    driver.apply({ dir: 'out', at: 3, frame: first.logged })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn' } })
    expect(Request.parse(driver.send('again').wire).params).toMatchObject({ prompt: [{ type: 'text', text: 'again' }] })
    // A vault it may not write is no folder of the session: it reads the vault by its path.
    const reading = new AcpDriver(plain, 'stage', { ...OPTIONS, knowledgeBase: { path: '/notes/vault', write: false } })
    due(reading)
    receive(reading, { id: 'plain-init', result: { protocolVersion: 1, agentCapabilities: { sessionCapabilities: { additionalDirectories: true } } } })
    expect(JSON.stringify(due(reading))).not.toContain('additionalDirectories')
  })

  it('gives extra folders to an agent that names the capability with an object, as the protocol now does', () => {
    const driver = new AcpDriver(plain, 'stage', { ...OPTIONS, extraDirs: ['/other'] })
    due(driver)
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1, agentCapabilities: { sessionCapabilities: { additionalDirectories: {} } } } })
    expect(driver.failure()).toBeNull()
    expect(due(driver)).toEqual([expect.objectContaining({ method: 'session/new', params: expect.objectContaining({ additionalDirectories: ['/other'] }) })])
  })

  it('refuses requests from extensions it never declared', () => {
    const driver = opened()
    const message = driver.send('hello')
    driver.apply({ dir: 'out', at: 3, frame: message.logged })
    receive(driver, { id: 8, method: 'cursor/ask_question', params: { toolCallId: 'q', questions: [{ id: 'a', prompt: 'Which?', options: [] }] } })
    expect(items(driver, 'question')).toEqual([])
    expect(due(driver)).toContainEqual(expect.objectContaining({ id: 8, error: expect.objectContaining({ code: -32601 }) }))
  })

  it('passes Markdown conventions only on the first wire prompt', () => {
    const driver = new AcpDriver(plain, 'stage', { ...OPTIONS, knowledgeBase: { path: '/notes/plain', write: true, kind: 'markdown' } })
    due(driver)
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1 } })
    due(driver)
    receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
    const first = driver.send('hello')
    expect(JSON.stringify(first.wire)).toContain('普通 Markdown')
    expect(JSON.stringify(first.wire)).toContain('相对路径链接')
    expect(JSON.stringify(first.wire)).not.toContain('Obsidian')
    expect(JSON.stringify(first.logged)).not.toContain('知识库')
    driver.apply({ dir: 'out', at: 3, frame: first.logged })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn' } })
    expect(JSON.stringify(driver.send('again').wire)).not.toContain('知识库')
  })

  it('switches modes by the ids its dialect maps Antumi\'s to', () => {
    const driver = opened()
    expect(Request.parse(driver.setOption('permissionMode', 'plan')[0])).toMatchObject({ method: 'session/set_mode', params: { modeId: 'plan' } })
    expect(() => driver.setOption('permissionMode', 'readOnly')).toThrow()
  })

  it('counts a turn\'s tokens as its answer reports them, cache in the input and reasoning in the output', () => {
    const driver = opened()
    const turn = (n: number, usage: unknown, cost?: number) => {
      const message = driver.send(`turn ${n}`)
      driver.apply({ dir: 'out', at: 3, frame: message.logged })
      if (cost !== undefined) receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'usage_update', used: 1000, size: 200000, cost: { amount: cost, currency: 'USD' } } } })
      receive(driver, { id: `plain-prompt-${n}`, result: { stopReason: 'end_turn', ...(usage ? { usage } : {}) } })
      return items(driver, 'turn').at(-1)
    }
    // The session's cost is a running total: a turn's is what it added.
    expect(turn(1, { inputTokens: 100, outputTokens: 20, thoughtTokens: 5, cachedReadTokens: 900, totalTokens: 1025 }, 0.25)).toMatchObject({
      usage: { input: 1000, output: 25 },
      metering: { models: [{ input: 1000, output: 25, cacheRead: 900, cacheWrite: null, costUsd: 0.25 }], reportedCostUsd: 0.25 }
    })
    expect(turn(2, { inputTokens: 10, outputTokens: 2 }, 0.4)).toMatchObject({ usage: { input: 10, output: 2 }, metering: { reportedCostUsd: 0.15 } })
    // An agent that reports neither leaves the turn without: nothing is made up.
    const silent = turn(3, null)
    expect(silent).not.toHaveProperty('usage')
    expect(silent).not.toHaveProperty('metering')
    // Token reporting does not mean the provider also reported a zero-dollar bill.
    expect(turn(4, { inputTokens: 10, outputTokens: 2 })).toMatchObject({ metering: { reportedCostUsd: null, models: [{ costUsd: null }] } })
  })

  it('on a provider, offers only its models, keeps no cost, and fails rather than run another model', () => {
    const providerModels = [{ id: 'antumi-ark/ark-code-latest', label: 'Ark Code', description: null, efforts: [], isDefault: true }]
    const models = { currentModelId: 'antumi-ark/ark-code-latest', availableModels: [{ modelId: 'opencode/big-pickle', name: 'Big Pickle' }, { modelId: 'antumi-ark/ark-code-latest', name: 'ark-code-latest' }] }
    const start = (model: string) => {
      const driver = new AcpDriver(plain, 'stage', { ...OPTIONS, providerModels, preferred: { model } })
      due(driver)
      receive(driver, { id: 'plain-init', result: { protocolVersion: 1 } })
      due(driver)
      receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes, models } })
      return driver
    }
    const driver = start('antumi-ark/ark-code-latest')
    expect(driver.failure()).toBeNull()
    expect(items(driver, 'state').at(-1)?.models).toEqual([{ id: 'antumi-ark/ark-code-latest', label: 'Ark Code', description: null, efforts: [], isDefault: true }])
    const message = driver.send('hi')
    driver.apply({ dir: 'out', at: 3, frame: message.logged })
    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'usage_update', used: 1000, size: 200000, cost: { amount: 0.5, currency: 'USD' } } } })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 2 } } })
    expect(items(driver, 'turn').at(-1)).toMatchObject({ usage: { input: 10, output: 2 }, metering: { models: [{ costUsd: null }], reportedCostUsd: null } })
    expect(() => driver.setOption('model', 'opencode/big-pickle')).toThrow(expect.objectContaining({ reason: 'chat-option-invalid' }))
    expect(start('opencode/big-pickle').failure()).toContain('opencode/big-pickle')
  })

  it('leaves a resumed session\'s first cost unknown: its running total before the turn is not known', () => {
    const driver = new AcpDriver(plain, 'stage', { ...OPTIONS, resume: 'session' })
    due(driver)
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } })
    due(driver)
    receive(driver, { id: 'plain-session', result: { modes } })
    const message = driver.send('again')
    driver.apply({ dir: 'out', at: 3, frame: message.logged })
    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'usage_update', used: 1000, size: 200000, cost: { amount: 3, currency: 'USD' } } } })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 2 } } })
    expect(items(driver, 'turn').at(-1)).toMatchObject({ usage: { input: 10, output: 2 }, metering: { reportedCostUsd: null } })
  })
})
