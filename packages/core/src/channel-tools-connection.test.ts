import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, connectRpc, coreUrl, rpcSchemas, type RpcMethod } from '@antumi/protocol'
import { channelMcpHandler } from './mcp-channel-tools'
import { Rejection } from './rejection'
import { holdToChannelTools, ownsChannelTools, startRpcServer, type RpcHandlers, type RpcServer } from './rpc-server'

const OWN = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

// The connection Antumi's MCP server opens for a locked-down conversation, against core's real server.
describe('a channel-tools connection', () => {
  let server: RpcServer
  let url: string
  let called: string[]

  beforeEach(async () => {
    called = []
    const implemented: Partial<RpcHandlers> = {
      'system.hello': ({ client }, connection) => {
        if (client?.kind === 'channel-tools') holdToChannelTools(connection, client.conversationId)
        return { protocolVersion: PROTOCOL_VERSION, serverVersion: 'test', features: ['channels'] }
      },
      'conversations.list': () => { called.push('conversations.list'); return [] },
      'channelTools.call': ({ conversationId, tool }, connection) => {
        if (!ownsChannelTools(connection, conversationId)) throw new Rejection('channel-tools-only')
        called.push(`${tool} for ${conversationId}`)
        return { text: 'ok', isError: false }
      },
      'channelTools.list': ({ conversationId }, connection) => {
        if (!ownsChannelTools(connection, conversationId)) throw new Rejection('channel-tools-only')
        called.push(`list for ${conversationId}`)
        return []
      }
    }
    const missing = () => { throw new Rejection('not-in-test') }
    // Tests only: every other method refuses.
    server = await startRpcServer({ port: 0, token: 't', handlers: Object.fromEntries((Object.keys(rpcSchemas) as RpcMethod[]).map((method) => [method, implemented[method] ?? missing])) as RpcHandlers })
    url = coreUrl({ port: server.port, token: 't' })
  })
  afterEach(() => server.close())

  it('runs its own conversation\'s tools and nothing else of core', async () => {
    const rpc = await connectRpc(url, { kind: 'channel-tools', conversationId: OWN })
    expect(await rpc.call('channelTools.call', { conversationId: OWN, tool: 'project_read', arguments: { path: 'a' } })).toEqual({ text: 'ok', isError: false })
    await expect(rpc.call('channelTools.call', { conversationId: OTHER, tool: 'project_read' })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    expect(await rpc.call('channelTools.list', { conversationId: OWN })).toEqual([])
    await expect(rpc.call('channelTools.list', { conversationId: OTHER })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    await expect(rpc.call('conversations.list', {})).rejects.toMatchObject({ reason: 'channel-tools-only' })
    await expect(rpc.call('files.read', { path: '/etc/passwd' })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    await expect(rpc.call('tasks.create', { title: 'arbitrary task', repos: ['/private'] })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    await expect(rpc.call('tasks.start', { id: 'arbitrary' })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    await expect(rpc.call('squadCalls.dispatch', { id: OWN, squadId: OTHER, instruction: 'escape', ref: 'escape' })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    // Saying hello again does not give back what the first one gave up.
    await expect(rpc.call('system.hello', { protocolVersion: PROTOCOL_VERSION })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    expect(called).toEqual([`project_read for ${OWN}`, `list for ${OWN}`])
    rpc.close()
  })

  it('is told nothing of what happens in core', async () => {
    const rpc = await connectRpc(url, { kind: 'channel-tools', conversationId: OWN })
    const heard: unknown[] = []
    rpc.on('git.changed', (params) => heard.push(params))
    server.broadcast('git.changed', {})
    await rpc.call('channelTools.call', { conversationId: OWN, tool: 'project_list' })
    expect(heard).toEqual([])
    rpc.close()
  })

  it('lets no ordinary client call a conversation\'s tools', async () => {
    const rpc = await connectRpc(url)
    await expect(rpc.call('channelTools.call', { conversationId: OWN, tool: 'project_read' })).rejects.toMatchObject({ reason: 'channel-tools-only' })
    expect(await rpc.call('conversations.list', {})).toEqual([])
    rpc.close()
  })
})

describe('the MCP server of a locked-down conversation', () => {
  const ask = async (handle: ReturnType<typeof channelMcpHandler>, method: string, params?: unknown) => (await handle(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })))?.result ?? null

  it('lists only registered tools, including task collection', async () => {
    const handle = channelMcpHandler(async () => ({ text: '', isError: false }))
    const listed = await ask(handle, 'tools/list')
    expect((listed as { tools: { name: string }[] }).tools.map((tool) => tool.name)).toEqual(['project_list', 'project_search', 'project_read', 'task_create'])
  })

  it('hands a call to core and its answer back, and calls nothing it does not list', async () => {
    const calls: unknown[] = []
    const handle = channelMcpHandler(async (tool, args) => { calls.push([tool, args]); return { text: '1\tline', isError: false } })
    expect(await ask(handle, 'tools/call', { name: 'project_read', arguments: { path: 'app/a.ts' } })).toEqual({ content: [{ type: 'text', text: '1\tline' }], isError: false })
    expect(await handle(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'terminal_run', arguments: { command: 'id' } } }))).toMatchObject({ error: { code: -32602 } })
    expect(calls).toEqual([['project_read', { path: 'app/a.ts' }]])
  })

  it('lists what core says the conversation has now, calls only those, and falls back to its own when core cannot say', async () => {
    let tools = [{ name: 'project_read', description: '读', inputSchema: { type: 'object' }, readOnly: true }, { name: 'lark_create_doc', description: '建', inputSchema: { type: 'object' }, readOnly: false }]
    const calls: string[] = []
    const handle = channelMcpHandler(async (tool) => { calls.push(tool); return { text: 'ok', isError: false } }, undefined, async () => tools)
    expect(await ask(handle, 'tools/list')).toEqual({ tools: [
      { name: 'project_read', description: '读', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
      { name: 'lark_create_doc', description: '建', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false } }
    ] })
    expect(await ask(handle, 'tools/call', { name: 'lark_create_doc', arguments: {} })).toMatchObject({ isError: false })
    tools = tools.slice(0, 1)
    await ask(handle, 'tools/list')
    expect(await handle(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lark_create_doc' } }))).toMatchObject({ error: { code: -32602 } })
    expect(calls).toEqual(['lark_create_doc'])
    const offline = channelMcpHandler(async () => ({ text: '', isError: false }), undefined, async () => { throw new Error('core is down') })
    expect((await ask(offline, 'tools/list') as { tools: { name: string }[] }).tools.map((tool) => tool.name)).toEqual(['project_list', 'project_search', 'project_read', 'task_create'])
  })

  it('answers a failed call as the tool rather than dying', async () => {
    const handle = channelMcpHandler(async () => { throw new Error('core is down') })
    expect(await ask(handle, 'tools/call', { name: 'project_list' })).toEqual({ content: [{ type: 'text', text: '工具调用失败' }], isError: true })
  })
})
