import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createRpcClient, type RpcConnection } from '@antumi/protocol'
import { agentToolsOverCore } from './mcp-agent-tools'
import { createMcpHandler } from './mcp-server'

describe('agent delegation MCP', () => {
  it('exposes scoped delegation in a read-only caller and rejects invalid arguments', async () => {
    const client = createRpcClient(() => {})
    const rpc: RpcConnection = { ...client, features: ['agent-profiles'], close: () => {}, closed: new Promise(() => {}) }
    const withCore = async <T>(action: (connection: RpcConnection) => Promise<T>) => action(rpc)
    const agents = agentToolsOverCore(withCore, '00000001-0000-4000-8000-000000000000')
    const handler = createMcpHandler({ planOnly: true, preview: async () => {}, agents })
    const listed = await handler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(JSON.stringify(listed)).toContain('antumi_agent_dispatch')
    expect((await agents.find((tool) => tool.spec.name === 'antumi_agent_dispatch')!.run({ profileId: 'invalid' })).isError).toBe(true)
    const withoutDelegation = createMcpHandler({ planOnly: true, preview: async () => {} })
    expect(JSON.stringify(await withoutDelegation(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })))).not.toContain('antumi_agent_dispatch')
  })
  it('lists profiles and ready agents with their quota and dispatches to one by agent', async () => {
    const Frame = z.object({ id: z.number(), method: z.string(), params: z.unknown() })
    const sent: { method: string; params: unknown }[] = []
    const profile = { id: '00000002-0000-4000-8000-000000000000', name: 'Reviewer', description: 'Reviews', instructions: '', agent: 'claude', model: null, effort: null, modelProvider: null, capability: 'readOnly', skills: null, mcpServers: null, callableProfiles: [], archivedAt: null, createdAt: 0, updatedAt: 0 }
    const resetsAt = new Date(2026, 10, 1, 3, 0).getTime()
    const answers: Record<string, unknown> = {
      'agentCalls.targets': [
        { profileId: profile.id, name: 'Reviewer', description: 'Reviews', agent: 'claude', capability: 'readOnly', readOnly: true,
          quota: { state: 'exhausted', window: { kind: 'session', model: null, usedPercent: 100, windowMinutes: 300, resetsAt }, stale: false } },
        { profileId: null, name: 'Codex', description: '', agent: 'codex', capability: null, readOnly: true, quota: { state: 'provider', window: null, stale: false } }
      ],
      'agentCalls.dispatch': { id: '00000003-0000-4000-8000-000000000000', parentId: '00000001-0000-4000-8000-000000000000', conversationId: '00000004-0000-4000-8000-000000000000',
        profile: { ...profile, name: 'Codex', agent: 'codex', capability: 'develop' }, instruction: 'Fix the test', ref: 'fix-1', permissionMode: 'ask', readOnly: false,
        state: 'queued', result: null, error: null, delivered: false, createdAt: 0, updatedAt: 0 }
    }
    const client = createRpcClient((text) => {
      const frame = Frame.parse(JSON.parse(text))
      sent.push(frame)
      queueMicrotask(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: answers[frame.method] })))
    })
    const rpc: RpcConnection = { ...client, features: ['agent-profiles', 'direct-agent-calls'], close: () => {}, closed: new Promise(() => {}) }
    const agents = agentToolsOverCore(async (action) => action(rpc), '00000001-0000-4000-8000-000000000000')
    const run = (name: string, input: Record<string, unknown>) => agents.find((tool) => tool.spec.name === name)!.run(input)
    expect(JSON.parse((await run('antumi_agent_list', {})).content[0]!.text)).toEqual([
      { id: profile.id, name: 'Reviewer', description: 'Reviews', agent: 'claude', capability: 'readOnly',
        quota: { state: 'exhausted', window: 'session', usedPercent: 100, resetsAt: new Date(resetsAt).toLocaleString('zh-CN', { hour12: false }) } },
      { name: 'Codex', agent: 'codex', readOnly: true, quota: { state: 'provider' } }
    ])
    expect((await run('antumi_agent_dispatch', { agent: 'codex', capability: 'develop', instruction: 'Fix the test', ref: 'fix-1' })).isError).toBe(false)
    expect(sent.at(-1)).toMatchObject({ method: 'agentCalls.dispatch', params: { agent: 'codex', capability: 'develop', instruction: 'Fix the test', ref: 'fix-1' } })
  })
})
