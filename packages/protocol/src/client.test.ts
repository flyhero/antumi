import { describe, expect, it } from 'vitest'
import { RpcError, createRpcClient } from './client'

describe('createRpcClient', () => {
  it('resolves results and rejects errors by request id', async () => {
    const sent: string[] = []
    const client = createRpcClient((frame) => sent.push(frame))

    const ok = client.call('tasks.delete', { id: 'a' })
    const failed = client.call('tasks.get', { id: 'b' })
    const [first, second] = sent.map((frame) => JSON.parse(frame))

    client.receive(
      JSON.stringify({
        jsonrpc: '2.0',
        id: second.id,
        error: { code: -32000, message: 'nope', data: { reason: 'task-not-found' } }
      })
    )
    client.receive(JSON.stringify({ jsonrpc: '2.0', id: first.id, result: { ok: true } }))

    await expect(ok).resolves.toEqual({ ok: true })
    await expect(failed).rejects.toMatchObject({ reason: 'task-not-found' })
    await expect(failed).rejects.toBeInstanceOf(RpcError)
  })

  it('ignores notifications it does not know about', () => {
    const client = createRpcClient(() => {})
    const seen: string[] = []
    client.on('tasks.deleted', ({ id }) => seen.push(id))

    client.receive(JSON.stringify({ jsonrpc: '2.0', method: 'future.thing', params: {} }))
    client.receive(JSON.stringify({ jsonrpc: '2.0', method: 'tasks.deleted', params: { id: 'x' } }))

    expect(seen).toEqual(['x'])
  })

  it('loads known agents from a newer core in both environment results and notifications', async () => {
    const sent: string[] = []
    const client = createRpcClient((frame) => sent.push(frame))
    const check = { tool: 'codex', status: 'ok', version: '1.0.0', path: '/bin/codex', signedIn: true }
    const environment = {
      checks: [check, { ...check, tool: 'future-agent' }],
      cliInstallations: [{ agent: 'future-agent', command: 'install future', shell: 'bash' }],
      searchPath: [], checkedAt: 0
    }
    const result = client.call('system.environment', {})
    const request = JSON.parse(sent[0]!)
    client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: environment }))
    const expected = { ...environment, checks: [check], cliInstallations: [] }
    await expect(result).resolves.toEqual(expected)
    const seen: unknown[] = []
    client.on('system.environmentChanged', ({ environment }) => seen.push(environment))
    client.receive(JSON.stringify({ jsonrpc: '2.0', method: 'system.environmentChanged', params: { environment } }))
    expect(seen).toEqual([expected])
  })
})
