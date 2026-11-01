import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createRpcClient } from '@antumi/protocol'
import { useChat } from './chat-state'
import { holdChat } from './chat-watch'

// A client whose core answers a watch with an empty page, and remembers what it was asked.
function fakeRpc() {
  const calls: string[] = []
  const client = createRpcClient((frame) => {
    const { id, method } = z.object({ id: z.number(), method: z.string() }).parse(JSON.parse(frame))
    calls.push(method)
    const result = method === 'conversations.watchChat' ? { items: [], before: null } : { ok: true }
    queueMicrotask(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id, result })))
  })
  return { calls, call: client.call }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('holding a chat', () => {
  it('watches it once for every holder, and lets go only when the last one does', async () => {
    const rpc = fakeRpc()
    const first = holdChat(rpc, 'c1')
    const second = holdChat(rpc, 'c1')
    await settled()
    expect(rpc.calls).toEqual(['conversations.watchChat'])
    expect(useChat.getState().c1).toBeDefined()
    first()
    first()
    expect(rpc.calls).toEqual(['conversations.watchChat'])
    expect(useChat.getState().c1).toBeDefined()
    second()
    expect(rpc.calls).toEqual(['conversations.watchChat', 'conversations.unwatchChat'])
    expect(useChat.getState().c1).toBeUndefined()
  })

  it('keeps the page for a holder that came while the first fetch was out, though the first let go', async () => {
    const rpc = fakeRpc()
    const first = holdChat(rpc, 'c2')
    const second = holdChat(rpc, 'c2')
    first()
    await settled()
    expect(useChat.getState().c2).toBeDefined()
    second()
  })
})
