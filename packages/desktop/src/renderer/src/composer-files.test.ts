import { beforeEach, describe, expect, it } from 'vitest'
import { createRpcClient, type RpcConnection } from '@antumi/protocol'
import { placeTargets } from './chat-mentions'
import { holdPaste, keepHeldPastes, lostPastes, pastedLines } from './composer-files'
import { useCore } from './core-store'

const CONVERSATION = '0b5c3a1e-7f2d-4c8e-9a61-2d4f8e7c1b30'

// A core that answers an upload, keeping its text at a path named for the conversation, or fails it.
function connect(commit: 'keep' | 'fail') {
  const methods: string[] = []
  const client = createRpcClient((frame) => {
    const { id, method, params } = JSON.parse(frame)
    methods.push(method)
    const reply = method === 'attachments.begin' ? { result: { uploadId: 'u1' } }
      : method === 'attachments.append' ? { result: { ok: true } }
        : commit === 'keep' ? { result: { path: `/core/pasted/${params.conversationId}/pasted-1.txt` } }
          : { error: { code: -32000, message: 'disk full' } }
    queueMicrotask(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id, ...reply })))
  })
  const rpc: RpcConnection = { ...client, features: ['pasted-text'], close() {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, connection: 'connected' })
  return methods
}

beforeEach(() => useCore.setState(useCore.getInitialState(), true))

describe('pastedLines', () => {
  it('counts lines however they end, a last line break adding none', () => {
    expect(pastedLines('one')).toBe(1)
    expect(pastedLines('one\ntwo\n')).toBe(2)
    expect(pastedLines('one\r\ntwo\r\nthree')).toBe(3)
    expect(pastedLines('one\n\n')).toBe(2)
  })
})

describe("a draft's long paste", () => {
  const long = 'line\n'.repeat(1000)

  it('is held until the conversation is made, then kept for it where its mention was', async () => {
    const methods = connect('keep')
    const draft = placeTargets({ text: '看看 再说', mentions: [] }, 3, 3, [holdPaste(long)]).value
    expect(lostPastes(draft)).toBe(false)
    const kept = await keepHeldPastes(CONVERSATION, draft)
    expect(methods).toEqual(['attachments.begin', 'attachments.append', 'attachments.commitText'])
    expect(kept.text).toBe(draft.text)
    expect(kept.mentions).toEqual([{ ...draft.mentions[0], target: { kind: 'file', path: `/core/pasted/${CONVERSATION}/pasted-1.txt`, relative: null, pasted: { lines: 1000 } } }])
  })

  it('goes in as the text it was when core cannot keep it', async () => {
    connect('fail')
    const draft = placeTargets({ text: '看看', mentions: [] }, 2, 2, [holdPaste(long)]).value
    const kept = await keepHeldPastes(CONVERSATION, draft)
    expect(kept).toEqual({ text: `看看 ${long} `, mentions: [] })
    expect(useCore.getState().error).not.toBeNull()
  })

  it('is caught as lost once the app reopened without it', () => {
    const lost = { text: 'x', mentions: [{ start: 0, end: 1, target: { kind: 'file' as const, path: 'antumi-held-paste:gone', relative: null, pasted: { lines: 3 } } }] }
    expect(lostPastes(lost)).toBe(true)
  })
})
