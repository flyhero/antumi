import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { agentDescriptor, agentSupportsReadOnly, type ChatItem } from '@antumi/protocol'
import type { AgentLaunch } from '../agent-adapter'
import { antigravityAccounts } from './antigravity-account'
import type { ChatRecord, ChatStageOptions } from '../../chat-driver'
import { AcpDriver } from '../acp/acp-driver'
import { antigravityDialect, antigravityAgyCliDialect, dialectForBackend } from './antigravity-dialect'
import { antigravity } from './antigravity-adapter'
import * as antigravityRuntime from './antigravity-runtime'
import * as chatCatalog from '../../chat-catalog'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import * as backendRuntime from './antigravity-backend'
import { backendDataDir, agyCliTokenFile, setAntigravityRuntimeMode } from './antigravity-backend'
import { writePrivateJson } from './antigravity-credentials'
import { antigravitySessionRoots, discoverAntigravitySessionRoots, antigravityTranscripts } from './antigravity-transcripts'

// As Antigravity ACP 1.4.1 answered on darwin-arm64 (2026-10-22), trimmed to what Antumi reads.
const initialized = {
  protocolVersion: 1,
  agentCapabilities: { loadSession: true, promptCapabilities: { image: true, audio: true, embeddedContext: true }, mcpCapabilities: { http: true, sse: true }, sessionCapabilities: { list: {}, resume: {} }, auth: { logout: {} } },
  authMethods: [{ id: 'oauth-personal', name: 'Log in with Google' }, { id: 'oauth-business', name: 'Log in with Gemini Enterprise' }, { id: 'gemini-api-key', name: 'Gemini API key' }, { id: 'agent-platform', name: 'Gemini Enterprise Agent Platform' }],
  agentInfo: { name: 'antigravity-acp', title: 'Google Antigravity', version: '1.4.1' }
}
const modes = [{ id: 'default', name: 'Default' }, { id: 'auto_edit', name: 'Auto Edit' }, { id: 'yolo', name: 'YOLO' }]
const opened = {
  sessionId: 'dfd164ec-2ebf-4623-8400-51e4627faaad',
  modes: { currentModeId: 'default', availableModes: modes },
  configOptions: [
    { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'gemini-3.8-flash', options: [{ value: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }, { value: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' }] },
    { id: 'thinking_level', name: 'Thinking Level', category: 'thought_level', type: 'select', currentValue: 'high', options: [{ value: 'low', name: 'Low' }, { value: 'medium', name: 'Medium' }, { value: 'high', name: 'High' }] },
    { id: 'mode', name: 'Session Mode', category: 'mode', type: 'select', currentValue: 'default', options: modes.map(({ id, name }) => ({ value: id, name })) }
  ]
}

const Request = z.looseObject({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional(), params: z.unknown().optional() })
const items = <K extends ChatItem['kind']>(driver: AcpDriver, kind: K) => driver.items.list().filter((item): item is Extract<ChatItem, { kind: K }> => item.kind === kind)

function start(options: Partial<ChatStageOptions> = {}) {
  const driver = new AcpDriver(antigravityDialect, 'stage', { cwd: '/project', extraDirs: [], resume: null, ...options })
  const records: ChatRecord[] = []
  const apply = (record: ChatRecord) => { records.push(record); driver.apply(record) }
  const receive = (frame: unknown) => apply({ dir: 'in', at: records.length, frame })
  const due = () => driver.due().map((frame) => { apply({ dir: 'out', at: records.length, frame }); return Request.parse(frame) })
  const sent = [...due()]
  receive({ id: 'antigravity-init', result: initialized })
  sent.push(...due())
  receive({ id: 'antigravity-auth', result: {} })
  sent.push(...due())
  receive({ id: 'antigravity-session', result: opened })
  sent.push(...due())
  return { driver, apply, receive, due, sent, records }
}

function configFor(model: string, levels: string[] | null, mode = 'default', models = ['gemini-3.8-flash', 'gemini-3.1-pro']) {
  return { configOptions: [
    { id: 'model', name: 'Model', category: 'model', currentValue: model, options: models.map((value) => ({ value, name: value })) },
    ...(levels ? [{ id: 'thinking_level', name: 'Thinking Level', category: 'thought_level', currentValue: levels[0], options: levels.map((value) => ({ value, name: value })) }] : []),
    { id: 'mode', name: 'Session Mode', category: 'mode', currentValue: mode, options: modes.map(({ id, name }) => ({ value: id, name })) }
  ] }
}

describe('Antigravity ACP', () => {
  it('skips the catalog when signed out and removes only its probe session files when signed in', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'antumi-antigravity-catalog-'))
    const previousHome = process.env.GEMINI_HOME
    const sessions = path.join(root, 'antigravity-acp', 'conversations')
    const probeSessionId = 'probe-session'
    const keepSessionId = 'keep-session'
    const three = ['low', 'medium', 'high']
    const four = [...three, 'xhigh']
    const runtime = vi.spyOn(antigravityRuntime, 'requireAntigravity').mockResolvedValue(process.execPath)
    // Exercise the adapter and real driver without launching the installed server.
    const probe = vi.spyOn(chatCatalog, 'probeChatCatalog').mockImplementation(async (driver, command, cwd, timeoutMs) => {
      expect(command.command).toBe(process.execPath)
      expect(command.unsetEnv).toEqual(expect.arrayContaining(['GEMINI_API_KEY', 'GOOGLE_CLOUD_PROJECT']))
      expect(cwd).toBe(root)
      expect(timeoutMs).toBe(60_000)
      const answer = (result: unknown) => {
        const frames = driver.due()
        expect(frames).toHaveLength(1)
        const frame = Request.parse(frames[0])
        driver.apply({ dir: 'out', at: 0, frame })
        driver.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
        return frame
      }
      answer(initialized)
      answer({})
      expect(answer({ sessionId: probeSessionId, ...configFor('gemini-3.8-flash', three) }).method).toBe('session/new')
      await Promise.all(['.db', '.db-wal', '.db-shm', '.meta'].map((suffix) => writeFile(path.join(sessions, probeSessionId + suffix), 'probe data')))
      expect(answer(configFor('gemini-3.1-pro', four)).params).toMatchObject({ configId: 'model', value: 'gemini-3.1-pro' })
      expect(driver.due()).toEqual([])
      return chatCatalog.catalogOf(driver.items.list())
    })
    try {
      process.env.GEMINI_HOME = root
      const catalog = antigravity.catalog
      if (!catalog) throw new Error('missing Antigravity catalog')
      expect(await catalog(root)).toBeNull()
      expect(runtime).not.toHaveBeenCalled()
      expect(probe).not.toHaveBeenCalled()

      await mkdir(sessions, { recursive: true })
      await writeFile(path.join(root, 'antigravity-acp', 'acp_token.json'), JSON.stringify({ client_id: 'client', client_secret: 'secret', refresh_token: 'refresh' }))
      await writeFile(path.join(sessions, keepSessionId + '.db'), 'existing session')
      expect((await catalog(root))?.models.map((model) => [model.id, model.efforts, model.isDefault])).toEqual([
        ['gemini-3.8-flash', three, true], ['gemini-3.1-pro', four, false]
      ])
      expect(runtime).toHaveBeenCalledTimes(1)
      expect(probe).toHaveBeenCalledTimes(1)
      expect(await readdir(sessions)).toEqual([keepSessionId + '.db'])
      expect(await readFile(path.join(sessions, keepSessionId + '.db'), 'utf8')).toBe('existing session')
    } finally {
      runtime.mockRestore()
      probe.mockRestore()
      if (previousHome === undefined) delete process.env.GEMINI_HOME
      else process.env.GEMINI_HOME = previousHome
      await rm(root, { recursive: true, force: true })
    }
  })

  it('probes each model once without MCP or extra directories and keeps the opening default', () => {
    const driver = new AcpDriver(antigravityDialect, 'catalog', { cwd: '/project', extraDirs: ['/other'], resume: null, mcp: { command: 'node', args: ['mcp.js'] } }, true)
    const receive = (frame: unknown) => driver.apply({ dir: 'in', at: 0, frame })
    const take = () => {
      const frames = driver.due()
      expect(driver.due()).toEqual(frames)
      expect(frames).toHaveLength(1)
      const frame = Request.parse(frames[0])
      driver.apply({ dir: 'out', at: 0, frame })
      expect(driver.due()).toEqual([])
      return frame
    }
    receive({ id: take().id, result: { ...initialized, agentCapabilities: { sessionCapabilities: { additionalDirectories: true } } } })
    receive({ id: take().id, result: {} })
    const opening = take()
    expect(opening.method).toBe('session/new')
    expect(opening.params).toEqual({ cwd: '/project', mcpServers: [] })
    const models = ['gemini-3.8-flash', 'four', 'three', 'none', 'error', 'ack', 'four']
    const three = ['low', 'medium', 'high']
    const four = [...three, 'xhigh']
    receive({ id: opening.id, result: { sessionId: 'probe', ...configFor(models[0]!, three, 'default', models) } })
    for (const [model, levels] of [['four', four], ['three', three], ['none', null], ['error', null], ['ack', null]] as const) {
      expect(items(driver, 'state').at(-1)?.models ?? []).toEqual([])
      const probe = take()
      expect(probe.method).toBe('session/set_config_option')
      expect(probe.params).toEqual({ sessionId: 'probe', configId: 'model', value: model })
      receive(model === 'error' ? { id: probe.id, error: { code: -32602, message: 'unavailable' } } : { id: probe.id, result: model === 'ack' ? {} : configFor(model, levels ? [...levels] : null, 'default', [...new Set(models)]) })
    }
    expect(driver.due()).toEqual([])
    expect(driver.failure()).toBeNull()
    expect(items(driver, 'notice')).toEqual([])
    expect(items(driver, 'user')).toEqual([])
    expect(items(driver, 'state').at(-1)?.models.map((model) => [model.id, model.efforts, model.isDefault])).toEqual([
      ['gemini-3.8-flash', three, true], ['four', four, false], ['three', three, false], ['none', [], false], ['error', [], false], ['ack', [], false]
    ])
  })

  it('applies saved mode, model and its newly exposed effort in order and replays them', () => {
    const options = { cwd: '/project', extraDirs: [], resume: null, preferred: { permissionMode: 'acceptEdits' as const, model: 'gemini-3.1-pro', effort: 'xhigh' } }
    const { driver, receive, due, sent, records } = start(options)
    const mode = sent.at(-1)
    expect(mode?.params).toMatchObject({ configId: 'mode', value: 'auto_edit' })
    expect(driver.ready()).toBe(false)
    receive({ id: mode?.id, result: configFor('gemini-3.8-flash', ['low', 'medium', 'high'], 'auto_edit') })
    const model = due()[0]
    expect(model?.params).toMatchObject({ configId: 'model', value: 'gemini-3.1-pro' })
    receive({ id: model?.id, result: configFor('gemini-3.1-pro', ['low', 'medium', 'high', 'xhigh'], 'auto_edit') })
    const effort = due()[0]
    expect(effort?.params).toMatchObject({ configId: 'thinking_level', value: 'xhigh' })
    expect(driver.ready()).toBe(false)
    receive({ id: effort?.id, result: {} })
    expect(due()).toEqual([])
    expect(driver.ready()).toBe(true)
    expect(items(driver, 'state').at(-1)).toMatchObject(options.preferred)
    const replay = new AcpDriver(antigravityDialect, 'stage', options)
    records.forEach((record) => replay.apply(record))
    expect(replay.ready()).toBe(true)
    expect(replay.due()).toEqual([])
    expect(items(replay, 'state').at(-1)).toMatchObject(options.preferred)
  })

  it('retains earlier models’ efforts and clears levels omitted by a full model update', () => {
    const { driver, apply, receive } = start()
    const switchTo = (model: string, levels: string[] | null) => {
      const frame = Request.parse(driver.setOption('model', model)[0])
      apply({ dir: 'out', at: 10, frame })
      receive({ id: frame.id, result: configFor(model, levels) })
    }
    switchTo('gemini-3.1-pro', ['low', 'medium', 'high', 'xhigh'])
    expect(items(driver, 'state').at(-1)?.models.map((model) => model.efforts)).toEqual([['low', 'medium', 'high'], ['low', 'medium', 'high', 'xhigh']])
    receive({ method: 'session/update', params: { sessionId: opened.sessionId, update: { sessionUpdate: 'config_option_update', configOptions: [configFor('gemini-3.1-pro', null, 'auto_edit').configOptions.at(-1)] } } })
    expect(items(driver, 'state').at(-1)?.models[1]?.efforts).toEqual(['low', 'medium', 'high', 'xhigh'])
    receive({ method: 'session/update', params: { sessionId: opened.sessionId, update: { sessionUpdate: 'config_option_update', ...configFor('gemini-3.1-pro', null) } } })
    expect(items(driver, 'state').at(-1)?.effort).toBeNull()
    switchTo('gemini-3.8-flash', ['low', 'medium', 'high'])
    expect(items(driver, 'state').at(-1)?.models.map((model) => model.efforts)).toEqual([['low', 'medium', 'high'], []])
  })

  it('signs in with Google, then opens a session with Antumi’s MCP server', () => {
    const { driver, sent } = start({ mcp: { command: 'node', args: ['mcp.js'] } })
    expect(sent.map((frame) => frame.method)).toEqual(['initialize', 'authenticate', 'session/new'])
    expect(sent[1]?.params).toEqual({ methodId: 'oauth-personal' })
    expect(sent[2]?.params).toMatchObject({ cwd: '/project', mcpServers: [{ name: 'antumi', command: 'node', args: ['mcp.js'] }] })
    expect(driver.ready()).toBe(true)
    const state = items(driver, 'state').at(-1)
    expect(state?.models.map((model) => model.id)).toEqual(['gemini-3.8-flash', 'gemini-3.1-pro'])
    expect(state?.permissionMode).toBe('ask')
  })

  it('switches to Auto Edit for acceptEdits', () => {
    const { driver, receive, due, sent } = start({ preferred: { permissionMode: 'acceptEdits' } })
    const change = sent.at(-1)
    expect(change?.method).toBe('session/set_config_option')
    expect(change?.params).toMatchObject({ configId: 'mode', value: 'auto_edit' })
    receive({ id: change?.id, result: { configOptions: opened.configOptions.map((config) => config.id === 'mode' ? { ...config, currentValue: 'auto_edit' } : config) } })
    due()
    expect(driver.ready()).toBe(true)
    expect(items(driver, 'state').at(-1)?.permissionMode).toBe('acceptEdits')
  })

  it('locks read-only stages to default mode, auto-denies file writes, and leaves commands to permission approval', () => {
    const { driver, apply, receive, due } = start({ readOnly: true, allowBypass: true, preferred: { permissionMode: 'bypass' } })
    expect(driver.ready()).toBe(true)
    expect(driver.failure()).toBeNull()
    expect(items(driver, 'state').at(-1)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask'] })
    expect(() => driver.setOption('permissionMode', 'acceptEdits')).toThrow(/只读成员不能换模式/)

    apply({ dir: 'out', at: 10, frame: driver.send('inspect and coordinate').logged })
    const options = [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }]
    // Antigravity file write requests are automatically rejected in read-only mode.
    receive({ id: 11, method: 'session/request_permission', params: { sessionId: opened.sessionId, toolCall: { toolCallId: 'w1', title: 'Run write_to_file?', kind: 'edit', locations: [{ path: '/project/src/app.ts' }], rawInput: { TargetFile: '/project/src/app.ts' } }, options } })
    expect(due()).toEqual([{ jsonrpc: '2.0', id: 11, result: { outcome: { outcome: 'selected', optionId: 'no' } } }])
    expect(items(driver, 'approval')[0]).toMatchObject({ resolution: 'denied', detail: '只读模式，Antumi 已拒绝修改 /project/src/app.ts' })
    expect(driver.activity()).toBe('running')

    // Announced delete/move calls whose permission frame omits kind are also denied, falling back to reject_always.
    receive({ method: 'session/update', params: { sessionId: opened.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 'd1', title: 'Delete temp file', kind: 'delete', status: 'pending' } } })
    receive({ id: 13, method: 'session/request_permission', params: { sessionId: opened.sessionId, toolCall: { toolCallId: 'd1', title: 'Delete temp file' }, options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'never', name: 'Always reject', kind: 'reject_always' }] } })
    expect(due()).toEqual([{ jsonrpc: '2.0', id: 13, result: { outcome: { outcome: 'selected', optionId: 'never' } } }])
    expect(items(driver, 'approval').at(-1)).toMatchObject({ resolution: 'denied', detail: '只读模式，Antumi 已拒绝修改文件' })

    // Mid-turn mode drift out of default fails the stage and cancels the active turn.
    receive({ method: 'session/update', params: { sessionId: opened.sessionId, update: { sessionUpdate: 'current_mode_update', currentModeId: 'auto_edit' } } })
    expect(driver.failure()).toContain('离开了只读模式')
    expect(due()).toEqual([{ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: opened.sessionId } }])
    // Sent once, not again on every later pump.
    expect(due()).toEqual([])

    // Shell commands follow normal permission approval instead of being auto-denied.
    const cmdDriver = start({ readOnly: true })
    cmdDriver.apply({ dir: 'out', at: 10, frame: cmdDriver.driver.send('inspect').logged })
    cmdDriver.receive({ id: 12, method: 'session/request_permission', params: { sessionId: opened.sessionId, toolCall: { toolCallId: 'cmd1', title: 'git status', kind: 'execute', rawInput: { command_line: 'git status', working_dir: '/project' } }, options } })
    expect(cmdDriver.due()).toEqual([])
    expect(cmdDriver.driver.activity()).toBe('awaiting')
    expect(items(cmdDriver.driver, 'approval').at(-1)).toMatchObject({ title: 'git status', resolution: null })

    // Resuming an agy-cli session from plan mode into read-only switches back to default.
    const agyModeOptions = [
      { value: 'default', name: 'Default' },
      { value: 'accept-edits', name: 'Accept edits' },
      { value: 'auto', name: 'Auto' },
      { value: 'plan', name: 'Plan' }
    ]
    const resumed = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: 'planned', readOnly: true })
    const step = (result: unknown) => {
      const frame = Request.parse(resumed.due()[0])
      resumed.apply({ dir: 'out', at: 0, frame })
      resumed.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
      return frame
    }
    step(initialized)
    step({})
    expect(step({ sessionId: 'planned', configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'plan', options: agyModeOptions }] }).method).toBe('session/resume')
    const backToDefault = step({ configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: agyModeOptions }] })
    expect(backToDefault.method).toBe('session/set_config_option')
    expect(backToDefault.params).toMatchObject({ configId: 'mode', value: 'default' })
    expect(resumed.ready()).toBe(true)
    expect(items(resumed, 'state').at(-1)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask'] })

    // If mode reset fails silently and a trailing preferred model already matches, enforceLockedMode still catches it.
    const stuck = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: 'stuck', readOnly: true, preferred: { model: 'gemini-3.8-flash' } })
    const stuckStep = (result: unknown) => {
      const frame = Request.parse(stuck.due()[0])
      stuck.apply({ dir: 'out', at: 0, frame })
      stuck.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
      return frame
    }
    stuckStep(initialized)
    stuckStep({})
    stuckStep({ sessionId: 'stuck', configOptions: [
      { id: 'mode', name: 'Mode', category: 'mode', currentValue: 'auto', options: agyModeOptions },
      { id: 'model', name: 'Model', category: 'model', currentValue: 'gemini-3.8-flash', options: [{ value: 'gemini-3.8-flash', name: 'Flash' }] }
    ] })
    stuckStep({ configOptions: [
      { id: 'mode', name: 'Mode', category: 'mode', currentValue: 'auto', options: agyModeOptions },
      { id: 'model', name: 'Model', category: 'model', currentValue: 'gemini-3.8-flash', options: [{ value: 'gemini-3.8-flash', name: 'Flash' }] }
    ] })
    expect(stuck.ready()).toBe(false)
    expect(stuck.failure()).toContain('离开了只读模式')
  })

  it('names the other projects only on the wire of its first prompt', () => {
    const { driver } = start({ extraDirs: ['/other'] })
    const { wire, logged } = driver.send('hello')
    expect(JSON.stringify(wire)).toContain('- /other')
    expect(JSON.stringify(logged)).not.toContain('/other')
  })

  it('shows a command by its command line', () => {
    const { driver, apply, receive } = start()
    apply({ dir: 'out', at: 10, frame: driver.send('list the files').logged })
    receive({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: opened.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'ls -la', kind: 'execute', status: 'pending', rawInput: { command_line: 'ls -la', working_dir: '/project' } } } })
    receive({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: opened.sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', rawOutput: { combinedOutput: 'total 0', exitCode: 0 } } } })
    const tool = items(driver, 'tool').find((item) => item.id === 'tool:t1')
    expect(tool).toMatchObject({ name: 'commandExecution', title: 'ls -la', status: 'done', execution: { status: 'completed', exitCode: 0 } })
    expect(JSON.stringify(tool?.input)).toContain('ls -la')
  })
})


describe('agy CLI backend', () => {
  it('maps agy 1.5.17 native modes + process-flag bypass, preserves managed-acp YOLO and keeps unattended disabled', () => {
    expect(antigravityAgyCliDialect.modes).toEqual({ ask: 'default', acceptEdits: 'accept-edits', auto: 'auto', plan: 'plan' })
    expect(antigravityAgyCliDialect.processBypass).toBe(true)
    expect(antigravity.permissionModesFor?.('agy-cli')).toEqual(['ask', 'acceptEdits', 'auto', 'plan', 'bypass'])
    expect(antigravity.restartForModes?.('agy-cli')).toEqual(['bypass'])
    expect(antigravity.permissionModesFor?.('managed-acp')).toEqual(['ask', 'acceptEdits', 'bypass'])
    expect(antigravity.restartForModes?.('managed-acp')).toEqual([])
    expect(agentDescriptor('antigravity').capabilities).toMatchObject({ unattended: false, bypass: true, autoMode: true })
    expect(agentSupportsReadOnly('antigravity')).toBe(true)
    expect(dialectForBackend()).toBe(antigravityDialect)
    expect(dialectForBackend('agy-cli')).toBe(antigravityAgyCliDialect)
    expect(antigravityAgyCliDialect.preferResume).toBe(true)
    for (const message of ['conversation not found', 'invalid session', 'session abc not found', 'conversation does not exist']) expect(antigravityAgyCliDialect.isSessionLostError?.(message)).toBe(true)
    expect(antigravityAgyCliDialect.isSessionLostError?.('permission denied')).toBe(false)

    // Full agy 1.5.17 configOptions with allowBypass: exposes all 5 modes, switches 4 in-process,
    // and refuses in-place bypass switch (must restart process).
    const driver = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: 'saved', allowBypass: true, preferred: { permissionMode: 'auto' } })
    const answer = (result: unknown) => {
      const frame = Request.parse(driver.due()[0])
      driver.apply({ dir: 'out', at: 0, frame })
      driver.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
      return frame
    }
    answer(initialized)
    answer({})
    const agyModeOptions = [
      { value: 'default', name: 'Default' },
      { value: 'accept-edits', name: 'Accept edits' },
      { value: 'auto', name: 'Auto' },
      { value: 'plan', name: 'Plan' }
    ]
    expect(answer({ sessionId: 'saved', configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: agyModeOptions }] }).method).toBe('session/resume')
    const toAuto = answer({ configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'auto', options: agyModeOptions }] })
    expect(toAuto.method).toBe('session/set_config_option')
    expect(toAuto.params).toMatchObject({ configId: 'mode', value: 'auto' })
    expect(items(driver, 'state').at(-1)).toMatchObject({ permissionMode: 'auto', permissionModes: ['ask', 'acceptEdits', 'auto', 'plan', 'bypass'] })
    const toPlan = Request.parse(driver.setOption('permissionMode', 'plan')[0])
    expect(toPlan.params).toMatchObject({ configId: 'mode', value: 'plan' })
    driver.apply({ dir: 'out', at: 1, frame: toPlan })
    driver.apply({ dir: 'in', at: 2, frame: { id: toPlan.id, result: { configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'plan', options: agyModeOptions }] } } })
    expect(items(driver, 'state').at(-1)?.permissionMode).toBe('plan')
    expect(() => driver.setOption('permissionMode', 'bypass')).toThrow(/重启/)

    // Process-flag bypass stage: reports bypass even though wire reports default, skips set_config_option(mode),
    // and refuses in-place exit back to ask (must restart process without --dangerously-skip-permissions).
    const bypassDriver = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: 'saved', allowBypass: true, preferred: { permissionMode: 'bypass' } })
    const answerBypass = (result: unknown) => {
      const frame = Request.parse(bypassDriver.due()[0])
      bypassDriver.apply({ dir: 'out', at: 0, frame })
      bypassDriver.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
      return frame
    }
    answerBypass(initialized)
    answerBypass({})
    expect(answerBypass({ sessionId: 'saved', configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: agyModeOptions }] }).method).toBe('session/resume')
    expect(bypassDriver.due()).toEqual([])
    expect(bypassDriver.ready()).toBe(true)
    expect(items(bypassDriver, 'state').at(-1)).toMatchObject({ permissionMode: 'bypass', permissionModes: ['ask', 'acceptEdits', 'auto', 'plan', 'bypass'] })
    expect(() => bypassDriver.setOption('permissionMode', 'ask')).toThrow(/重启/)

    // Without allowBypass, bypass is never offered even on agy 1.5.17.
    const restricted = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: null, allowBypass: false })
    const answerRestricted = (result: unknown) => {
      const frame = Request.parse(restricted.due()[0])
      restricted.apply({ dir: 'out', at: 0, frame })
      restricted.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
      return frame
    }
    answerRestricted(initialized)
    answerRestricted({})
    answerRestricted({ sessionId: 'no-bypass', configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: agyModeOptions }] })
    expect(items(restricted, 'state').at(-1)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask', 'acceptEdits', 'auto', 'plan'] })

    // Older agy returning only 2 modes without allowBypass: dynamically lists only those 2.
    const older = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: null })
    const answerOlder = (result: unknown) => {
      const frame = Request.parse(older.due()[0])
      older.apply({ dir: 'out', at: 0, frame })
      older.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
      return frame
    }
    answerOlder(initialized)
    answerOlder({})
    answerOlder({ sessionId: 'old', configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: agyModeOptions.slice(0, 2) }] })
    expect(items(older, 'state').at(-1)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask', 'acceptEdits'] })
    expect(() => older.setOption('permissionMode', 'plan')).toThrow()

    // Standalone managed-acp keeps YOLO (bypass) visible and rejects agy-only modes.
    const managed = start()
    expect(items(managed.driver, 'state').at(-1)?.permissionModes).toEqual(['ask', 'acceptEdits', 'bypass'])
    expect(Request.parse(managed.driver.setOption('permissionMode', 'bypass')[0]).params).toMatchObject({ configId: 'mode', value: 'yolo' })
    expect(() => managed.driver.setOption('permissionMode', 'plan')).toThrow()
  })

  it('falls back from session/resume to session/load without duplicating replayed history, and marks lost when load also fails', () => {
    const agyModeOptions = [
      { value: 'default', name: 'Default' },
      { value: 'accept-edits', name: 'Accept edits' },
      { value: 'auto', name: 'Auto' },
      { value: 'plan', name: 'Plan' }
    ]
    const driver = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: 'valid-session', allowBypass: true })
    const sendDue = () => {
      const frame = Request.parse(driver.due()[0])
      driver.apply({ dir: 'out', at: 0, frame })
      return frame
    }
    const init = sendDue()
    driver.apply({ dir: 'in', at: 1, frame: { id: init.id, result: initialized } })
    const auth = sendDue()
    driver.apply({ dir: 'in', at: 2, frame: { id: auth.id, result: {} } })
    const resume = sendDue()
    expect(resume.method).toBe('session/resume')
    driver.apply({ dir: 'in', at: 3, frame: { id: resume.id, error: { code: -32603, message: 'Failed to read session; retry, or load it with session/load' } } })
    expect(driver.failure()).toBeNull()
    const load = sendDue()
    expect(load.method).toBe('session/load')
    expect(load.params).toMatchObject({ sessionId: 'valid-session' })
    // Replayed history updates during session/load must be dropped from both UI items and logged frames.
    const replayedMsg = { jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'valid-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'old reply' } } } }
    const replayedTool = { jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'valid-session', update: { sessionUpdate: 'tool_call', toolCallId: 'old-t1', title: 'ls', kind: 'execute', status: 'completed' } } }
    expect(driver.logged(replayedMsg)).toBeNull()
    expect(driver.logged(replayedTool)).toBeNull()
    driver.apply({ dir: 'in', at: 4, frame: replayedMsg })
    driver.apply({ dir: 'in', at: 5, frame: replayedTool })
    driver.apply({ dir: 'in', at: 6, frame: { id: load.id, result: { sessionId: 'valid-session', configOptions: [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: agyModeOptions }] } } })
    expect(driver.ready()).toBe(true)
    expect(driver.providerSessionId()).toBe('valid-session')
    expect(items(driver, 'assistant')).toEqual([])
    expect(items(driver, 'tool')).toEqual([])

    // When session/load ALSO fails with Failed to read session, driver marks sessionLost for clean Handoff recovery.
    const broken = new AcpDriver(antigravityAgyCliDialect, 'stage', { cwd: '/project', extraDirs: [], resume: 'missing-session' })
    const sendBroken = () => {
      const frame = Request.parse(broken.due()[0])
      broken.apply({ dir: 'out', at: 0, frame })
      return frame
    }
    broken.apply({ dir: 'in', at: 1, frame: { id: sendBroken().id, result: initialized } })
    broken.apply({ dir: 'in', at: 2, frame: { id: sendBroken().id, result: {} } })
    broken.apply({ dir: 'in', at: 3, frame: { id: sendBroken().id, error: { code: -32603, message: 'Failed to read session; retry, or load it with session/load' } } })
    const brokenLoad = sendBroken()
    expect(brokenLoad.method).toBe('session/load')
    broken.apply({ dir: 'in', at: 4, frame: { id: brokenLoad.id, error: { code: -32603, message: 'Failed to read session' } } })
    expect(broken.failure()).toContain('session/load')
    expect(broken.sessionLost()).toBe(true)
  })

  it('probes and cleans only the selected backend and selected account, including failure paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'antumi-agy-catalog-'))
    const home = path.join(root, 'account')
    const data = backendDataDir('agy-cli', home)
    const id = 'cli-probe'
    vi.stubEnv('GEMINI_HOME', root)
    setAntigravityRuntimeMode('agy-cli')
    const requireCli = vi.spyOn(backendRuntime, 'requireAgyCli').mockResolvedValue('/bin/agy')
    const probe = vi.spyOn(chatCatalog, 'probeChatCatalog').mockImplementation(async (driver, command) => {
      expect(command).toMatchObject({ command: '/bin/agy', args: ['acp', '--stdio', '--gemini-dir', home, '--app-data-dir', 'antigravity-cli-acp'], env: { GEMINI_HOME: home, AGY_CLI_FORCE_FILE_TOKEN_STORAGE: '1' } })
      expect(command.unsetEnv).toEqual(expect.arrayContaining(['GEMINI_API_KEY', 'GOOGLE_CLOUD_PROJECT']))
      expect(command.env).not.toHaveProperty('SSH_CONNECTION')
      for (const result of [initialized, {}, { ...opened, sessionId: id }]) {
        const frame = Request.parse(driver.due()[0])
        driver.apply({ dir: 'out', at: 0, frame })
        driver.apply({ dir: 'in', at: 0, frame: { id: frame.id, result } })
      }
      await mkdir(path.join(data, 'conversations'), { recursive: true })
      for (const suffix of ['.db', '.db-wal', '.db-shm', '.meta']) await writeFile(path.join(data, 'conversations', id + suffix), 'probe')
      await mkdir(path.join(data, 'brain', id), { recursive: true })
      await mkdir(path.join(data, 'annotations'), { recursive: true })
      await writeFile(path.join(data, 'annotations', id + '.pbtxt'), 'probe')
      throw new Error('probe failed')
    })
    try {
      await writePrivateJson(agyCliTokenFile(home), { token: { access_token: 'access', refresh_token: 'cli-token', expiry: '2099-01-01T00:00:00Z' } })
      const keep = path.join(backendDataDir('managed-acp', home), 'conversations')
      await mkdir(keep, { recursive: true })
      await writeFile(path.join(keep, id + '.db'), 'keep')
      await expect(antigravity.catalog?.(root, { id: 'account', home })).rejects.toThrow('probe failed')
      expect(await readdir(path.join(data, 'conversations'))).toEqual([])
      expect(await readdir(path.join(data, 'brain'))).toEqual([])
      expect(await readdir(path.join(data, 'annotations'))).toEqual([])
      expect(await readFile(path.join(keep, id + '.db'), 'utf8')).toBe('keep')
    } finally {
      requireCli.mockRestore()
      probe.mockRestore()
      vi.unstubAllEnvs()
      setAntigravityRuntimeMode('managed-acp')
      await rm(root, { recursive: true, force: true })
    }
  })

  it('scans both backends read-only and finds cwd in SQLite metadata without a .meta file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'antumi-agy-transcripts-'))
    const directories = antigravitySessionRoots({ GEMINI_HOME: root })
    const cwd = path.join(root, 'project with spaces')
    const bytes = (field: number, value: string | Uint8Array): Buffer => {
      const body = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
      const varint = (value: number): number[] => {
        const result: number[] = []
        do { result.push((value & 127) | (value > 127 ? 128 : 0)); value >>>= 7 } while (value)
        return result
      }
      return Buffer.concat([Buffer.from([...varint((field << 3) | 2), ...varint(body.length)]), body])
    }
    try {
      for (const [index, directory] of directories.entries()) {
        await mkdir(directory, { recursive: true })
        const db = new DatabaseSync(path.join(directory, 'session-' + index + '.db'))
        try {
          db.exec('CREATE TABLE steps (idx INTEGER, step_payload BLOB); CREATE TABLE trajectory_metadata_blob (id TEXT, data BLOB)')
          db.prepare('INSERT INTO steps VALUES (?, ?)').run(0, bytes(19, bytes(1, 'hello from history')))
          db.prepare('INSERT INTO trajectory_metadata_blob VALUES (?, ?)').run('main', bytes(1, bytes(2, pathToFileURL(cwd).href)))
        } finally { db.close() }
        if (index === 0) await writeFile(path.join(directory, 'session-0.meta'), JSON.stringify({ cwd }))
      }
      const source = antigravityTranscripts(() => directories)
      expect((await source.scan()).map(summary => [summary.sessionId, summary.cwd]).sort()).toEqual([['session-0', cwd], ['session-1', cwd]])
      expect(source.diagnostics?.()).toEqual([])
      expect(await readdir(directories[1]!)).toEqual(['session-1.db'])
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})


it('composes agy command and prepare with a single complete argument list and gates bypass flag on explicit allowBypass', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'antumi-agy-launch-'))
  const requireCli = vi.spyOn(backendRuntime, 'requireAgyCli').mockResolvedValue('/fake/agy')
  const requireInfo = vi.spyOn(backendRuntime, 'requireAgyCliInfo').mockResolvedValue({ path: '/fake/agy', version: '1.5.17', supportsAcp: true, supportsBypass: true })
  try {
    const launch: AgentLaunch = { backend: 'agy-cli', providerSessionId: null, resume: false, handoffPath: null, extraProjects: [], account: { id: 'test', env: { GEMINI_HOME: root } } }
    const cmd = antigravity.command(launch)
    const prepared = await antigravity.launch?.prepare({ sessionsRoot: root, conversationId: 'conversation', stageId: 'stage', planOnly: false }, undefined, launch)
    expect([...(cmd.args ?? []), ...(prepared?.args ?? [])]).toEqual(['acp', '--stdio', '--gemini-dir', root, '--app-data-dir', 'antigravity-cli-acp'])
    expect(prepared?.command).toBe('/fake/agy')
    expect(cmd.unsetEnv).toEqual(expect.arrayContaining(['GEMINI_API_KEY', 'GOOGLE_CLOUD_PROJECT']))
    expect({ ...cmd.env, ...prepared?.env }).not.toHaveProperty('SSH_CONNECTION')

    // Explicit allowBypass + preferred bypass passes --dangerously-skip-permissions.
    const bypassLaunch: AgentLaunch = { ...launch, allowBypass: true, preferred: { permissionMode: 'bypass' } }
    expect(antigravity.command(bypassLaunch).args).toEqual(['acp', '--stdio', '--gemini-dir', root, '--app-data-dir', 'antigravity-cli-acp', '--dangerously-skip-permissions'])
    expect(await antigravity.launch?.prepare({ sessionsRoot: root, conversationId: 'conversation', stageId: 'stage', planOnly: false }, undefined, bypassLaunch)).toMatchObject({ command: '/fake/agy' })
    // Never passes --dangerously-skip-permissions without allowBypass, or when planOnly/readOnly/lockdown.
    expect(antigravity.command({ ...launch, allowBypass: false, preferred: { permissionMode: 'bypass' } }).args).not.toContain('--dangerously-skip-permissions')
    expect(antigravity.command({ ...bypassLaunch, planOnly: { dirs: [root] } }).args).not.toContain('--dangerously-skip-permissions')
    expect(antigravity.command({ ...bypassLaunch, readOnly: { dirs: [root] } }).args).not.toContain('--dangerously-skip-permissions')
    expect(antigravity.command({ ...bypassLaunch, lockdown: { tools: [] } }).args).not.toContain('--dangerously-skip-permissions')
    // Older agy without --dangerously-skip-permissions fails cleanly in prepare.
    requireInfo.mockResolvedValueOnce({ path: '/fake/agy', version: '1.4.0', supportsAcp: true, supportsBypass: false })
    await expect(antigravity.launch?.prepare({ sessionsRoot: root, conversationId: 'conversation', stageId: 'stage', planOnly: false }, undefined, bypassLaunch)).rejects.toThrow(/--dangerously-skip-permissions/)

    const managed = antigravity.command({ ...launch, backend: 'managed-acp' })
    expect(managed.unsetEnv).toEqual(cmd.unsetEnv)
  } finally { requireCli.mockRestore(); requireInfo.mockRestore(); await rm(root, { recursive: true, force: true }) }
})

it('discovers active and archived agy accounts read-only while preserving backend isolation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'antumi-agy-archives-'))
  const own = path.join(root, 'own')
  const antumi = path.join(root, 'antumi')
  const removed = path.join(antumi, 'agent-accounts', 'antigravity', 'removed')
  const active = path.join(antumi, 'agent-accounts', 'antigravity', 'active')
  vi.stubEnv('GEMINI_HOME', own)
  vi.stubEnv('ANTUMI_HOME', antumi)
  const bytes = (field: number, value: string | Uint8Array): Buffer => {
    const body = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
    const tag = (field << 3) | 2
    return Buffer.concat([Buffer.from(tag < 128 ? [tag, body.length] : [(tag & 127) | 128, tag >>> 7, body.length]), body])
  }
  const createSession = async (directory: string, id: string) => {
    await mkdir(directory, { recursive: true })
    const db = new DatabaseSync(path.join(directory, id + '.db'))
    try {
      db.exec('CREATE TABLE steps (idx INTEGER, step_payload BLOB)')
      db.prepare('INSERT INTO steps VALUES (?, ?)').run(0, bytes(19, bytes(1, id)))
    } finally { db.close() }
    await writeFile(path.join(directory, id + '.meta'), JSON.stringify({ cwd: root }))
  }
  try {
    await createSession(path.join(backendDataDir('managed-acp'), 'conversations'), 'managed')
    await createSession(path.join(backendDataDir('agy-cli'), 'conversations'), 'default')
    await createSession(path.join(backendDataDir('agy-cli', active), 'conversations'), 'active')
    await createSession(path.join(backendDataDir('agy-cli', removed), 'conversations'), 'archived')
    await createSession(path.join(backendDataDir('managed-acp', active), 'conversations'), 'private-managed')
    await antigravityAccounts.beforeRemove?.(removed)
    await rm(removed, { recursive: true })
    const archive = path.join(backendDataDir('agy-cli'), 'archived-conversations', 'removed')
    const before = await readFile(path.join(archive, 'archived.db'))
    const roots = await discoverAntigravitySessionRoots()
    expect(roots).toContain(archive)
    expect(roots).toContain(path.join(backendDataDir('agy-cli', active), 'conversations'))
    const source = antigravityTranscripts()
    const summaries = await source.scan()
    expect(summaries.map(summary => summary.sessionId).sort()).toEqual(['active', 'archived', 'default', 'managed'])
    expect(summaries.find(summary => summary.sessionId === 'managed')).toMatchObject({ backend: 'managed-acp', account: 'default' })
    expect(summaries.find(summary => summary.sessionId === 'default')).toMatchObject({ backend: 'agy-cli', account: 'default' })
    expect(summaries.find(summary => summary.sessionId === 'active')).toMatchObject({ backend: 'agy-cli', account: 'active' })
    expect(summaries.find(summary => summary.sessionId === 'archived')).toMatchObject({ backend: 'agy-cli', nativeSessionId: null })
    expect(summaries.find(summary => summary.sessionId === 'archived')?.account).toBeUndefined()
    expect(source.diagnostics?.()).toEqual([])
    expect(await readFile(path.join(archive, 'archived.db'))).toEqual(before)
    expect(await readdir(path.join(backendDataDir('managed-acp'), 'conversations'))).toEqual(['managed.db', 'managed.meta'])
  } finally { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) }
})
