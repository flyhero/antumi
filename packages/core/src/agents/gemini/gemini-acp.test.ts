import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isPlanApproval, type ChatItem } from '@antumi/protocol'
import { AcpDriver } from '../acp/acp-driver'
import type { ChatStageOptions } from '../../chat-driver'
import { geminiDialect } from './gemini-dialect'

const Frame = z.looseObject({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional(), params: z.unknown().optional(), result: z.unknown().optional() })
const Record = z.object({ dir: z.enum(['in', 'out']), at: z.number(), frame: Frame, ref: z.string().optional() })
const recording = (name: string) => readFileSync(new URL(`./fixtures/gemini-${name}.jsonl`, import.meta.url), 'utf8').trim().split('\n').map((line) => Record.parse(JSON.parse(line)))
const session = recording('session')
const plan = recording('plan')
const options: ChatStageOptions = { cwd: '/work', extraDirs: [], resume: null }
const items = <K extends ChatItem['kind']>(driver: AcpDriver, kind: K) => driver.items.list().filter((item): item is Extract<ChatItem, { kind: K }> => item.kind === kind)
const receive = (driver: AcpDriver, frame: unknown) => driver.apply({ dir: 'in', at: 100, frame })
const sent = (driver: AcpDriver, frame: unknown) => driver.apply({ dir: 'out', at: 101, frame })
const init = session.find((record) => record.dir === 'in' && record.frame.id === 'gemini-init')!.frame.result
const openedResult = session.find((record) => record.dir === 'in' && record.frame.id === 'gemini-session')!.frame.result
function opened(extra: Partial<ChatStageOptions> = {}) {
  const driver = new AcpDriver(geminiDialect, 'stage', { ...options, ...extra })
  driver.due().forEach((frame) => sent(driver, frame))
  receive(driver, { id: 'gemini-init', result: init })
  driver.due().forEach((frame) => sent(driver, frame))
  receive(driver, { id: 'gemini-session', result: openedResult })
  return driver
}
const update = (driver: AcpDriver, content: object) => receive(driver, { method: 'session/update', params: { sessionId: 'provider-session', update: content } })

describe('Gemini CLI ACP', () => {
  it('replays the official session, maps modes, tools and approvals, and counts cached input only once', () => {
    const driver = new AcpDriver(geminiDialect, 'stage', options)
    session.forEach((record) => driver.apply(record))
    expect(driver.failure()).toBeNull()
    expect(driver.ready()).toBe(true)
    expect(items(driver, 'assistant').map((item) => item.text)).toEqual(['Gemini ACP smoke OK'])
    expect(items(driver, 'user')).toHaveLength(1)
    expect(items(driver, 'tool')).toMatchObject([
      { name: 'commandExecution', input: 'printf antumi-gemini-smoke', status: 'done' },
      { name: 'fileChange', status: 'done', diffs: [{ path: '/work/smoke.txt' }] },
      { name: 'antumi.show_preview', output: 'Preview shown', status: 'done' }
    ])
    expect(items(driver, 'approval').every((item) => item.resolution === 'allowed')).toBe(true)
    expect(items(driver, 'turn')).toMatchObject([{ state: 'completed', usage: { input: 400, output: 100 }, metering: { reportedCostUsd: null, models: [{ input: 400, cacheRead: 120, output: 100, costUsd: null }] } }])
    expect(items(driver, 'state').at(-1)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask', 'acceptEdits', 'bypass', 'plan'], effort: null, context: { used: 120, window: 1048576 } })
  })

  it('consumes native text mode updates while idle and busy without adding them to the reply', () => {
    const driver = opened()
    update(driver, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '[MODE_UPDATE] plan' } })
    expect(items(driver, 'state').at(-1)?.permissionMode).toBe('plan')
    sent(driver, driver.send('hello').logged)
    update(driver, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '[MODE_UPDATE] default' } })
    expect(items(driver, 'assistant')).toEqual([])
    expect(items(driver, 'state').at(-1)?.permissionMode).toBe('ask')
    receive(driver, { id: 'gemini-prompt-1', result: { stopReason: 'end_turn' } })
    expect(driver.setOption('permissionMode', 'acceptEdits')).toMatchObject([{ method: 'session/set_mode', params: { modeId: 'autoEdit' } }])
    expect(() => driver.setOption('permissionMode', 'readOnly')).toThrow()
  })

  it('shows the full plan from a completed diff, and switches back to Default after its native approval', () => {
    const driver = new AcpDriver(geminiDialect, 'stage', options)
    plan.forEach((record) => driver.apply(record))
    const approval = items(driver, 'approval').find(isPlanApproval)
    expect(approval).toMatchObject({ tool: 'ExitPlanMode', detail: '# Plan\n\nImplement Gemini CLI.', runModes: ['ask'], resolution: 'allowed', mode: 'ask' })
    expect(items(driver, 'state').at(-1)?.permissionMode).toBe('ask')
    expect(items(driver, 'assistant').map((item) => item.text)).toEqual(['Gemini ACP smoke OK'])
  })

  it('preserves long plan text beyond displayed diff clipping and can deny a plan without reading disk', () => {
    const driver = opened()
    sent(driver, driver.send('plan').logged)
    const text = '# Plan\n' + 'a'.repeat(60_000)
    update(driver, { sessionUpdate: 'tool_call', toolCallId: 'write', kind: 'edit', status: 'completed', content: [{ type: 'diff', path: '/plans/a.md', oldText: '', newText: text }] })
    receive(driver, { id: 3, method: 'session/request_permission', params: { sessionId: 'provider-session', toolCall: { toolCallId: 'exit', title: 'Requesting plan approval for: /plans/a.md' }, options: [{ optionId: 'proceed_once', name: 'Allow', kind: 'allow_once' }, { optionId: 'cancel', name: 'Reject', kind: 'reject_once' }] } })
    const approval = items(driver, 'approval')[0]!
    expect(approval.detail).toBe(text)
    expect(driver.respond(approval.requestId, { decision: 'deny', message: 'Use SQLite' })).toMatchObject([{ result: { outcome: { outcome: 'cancelled' } } }])
    expect(() => driver.respond(approval.requestId, { decision: 'allow', mode: 'bypass' })).toThrow()
  })

  it('falls back to the plan path and refuses execution from a planning-only stage', () => {
    const driver = opened({ planOnly: true })
    for (const frame of driver.due()) { sent(driver, frame); receive(driver, { id: Frame.parse(frame).id, result: {} }) }
    sent(driver, driver.send('plan').logged)
    receive(driver, { id: 3, method: 'session/request_permission', params: { sessionId: 'provider-session', toolCall: { title: 'Requesting plan approval for: /plans/missing.md' }, options: [{ optionId: 'proceed_once', name: 'Allow', kind: 'allow_once' }, { optionId: 'cancel', name: 'Reject', kind: 'reject_once' }] } })
    const approval = items(driver, 'approval')[0]!
    expect(approval.detail).toContain('/plans/missing.md')
    expect(() => driver.respond(approval.requestId, { decision: 'allow' })).toThrow(expect.objectContaining({ reason: 'plan-only' }))
    expect(driver.respond(approval.requestId, { decision: 'deny', saved: true })).toContainEqual(expect.objectContaining({ method: 'session/cancel' }))
  })

  it('refuses reference edits whose only path is in locations, even when the permission omits it', () => {
    const driver = opened({ references: ['/refs'] })
    sent(driver, driver.send('edit').logged)
    update(driver, { sessionUpdate: 'tool_call', toolCallId: 'write', kind: 'edit', title: 'Write', locations: [{ path: '/refs/a.md' }] })
    receive(driver, { id: 8, method: 'session/request_permission', params: { sessionId: 'provider-session', toolCall: { toolCallId: 'write', title: 'Write' }, options: [{ optionId: 'proceed_once', name: 'Allow', kind: 'allow_once' }, { optionId: 'cancel', name: 'Reject', kind: 'reject_once' }] } })
    expect(driver.due()).toContainEqual(expect.objectContaining({ id: 8, result: { outcome: { outcome: 'selected', optionId: 'cancel' } } }))
    expect(items(driver, 'approval')[0]?.resolution).toBe('denied')
  })

  it('uses locations and native tool descriptions where Gemini omits rawInput', () => {
    expect(geminiDialect.toolInput?.(undefined, { kind: 'read', locations: [{ path: '/work/a.ts', line: 12 }] })).toEqual({ path: '/work/a.ts', line: 12 })
    expect(geminiDialect.toolInput?.(undefined, { title: 'Fetching content from: https://example.com' })).toEqual({ url: 'https://example.com' })
    expect(geminiDialect.toolInput?.(undefined, { title: 'Searching the web for: "ACP protocol"' })).toEqual({ query: 'ACP protocol' })
    const driver = opened({ extraDirs: ['/other'], mcp: { command: 'node', args: ['mcp.js'] } })
    expect(JSON.stringify(driver.send('hello').wire)).toContain('/other')
    expect(items(driver, 'state').at(-1)?.models.length).toBeGreaterThan(0)
    expect(driver.setOption('model', 'gemini-2.5-pro')).toMatchObject([{ method: 'session/set_model' }])
  })
})
