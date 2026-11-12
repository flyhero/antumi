import { describe, expect, it } from 'vitest'
import { withUnsupportedItems } from './connector'
import { CHUNK_BYTES, FRAME_TIMEOUT_MS, MobileLink, mobileDeviceId, pairingConfirmationCode } from './link'
import { generateKeyPair, NoiseError, NoiseHandshake } from './noise'

function pairOfLinks(now: () => number = Date.now) {
  const prologue = new Uint8Array(0)
  const a = new NoiseHandshake({ pattern: 'XX', initiator: true, prologue, staticKey: generateKeyPair() })
  const b = new NoiseHandshake({ pattern: 'XX', initiator: false, prologue, staticKey: generateKeyPair() })
  b.readMessage(a.writeMessage())
  a.readMessage(b.writeMessage())
  b.readMessage(a.writeMessage())
  const wire: Uint8Array[] = []
  const sender = new MobileLink({ send: (data) => wire.push(data), close() {} }, a.split(), now)
  const receiver = new MobileLink({ send() {}, close() {} }, b.split(), now)
  return { sender, receiver, wire, hashes: [a.handshakeHash, b.handshakeHash] }
}

describe('MobileLink', () => {
  it('carries a frame many chunks long, whole and in one piece', () => {
    const { sender, receiver, wire } = pairOfLinks()
    const text = JSON.stringify({ data: '会'.repeat(CHUNK_BYTES) })
    sender.send(text)
    expect(wire.length).toBeGreaterThan(2)
    const out = wire.map((chunk) => receiver.receive(chunk))
    expect(out.slice(0, -1).every((part) => part === null)).toBe(true)
    expect(out.at(-1)).toBe(text)
  })

  it('refuses chunks out of order, replayed or forged', () => {
    const replay = pairOfLinks()
    replay.sender.send('one')
    replay.sender.send('two')
    expect(() => replay.receiver.receive(replay.wire[1]!)).toThrow(NoiseError)
    const again = pairOfLinks()
    again.sender.send('one')
    again.receiver.receive(again.wire[0]!)
    expect(() => again.receiver.receive(again.wire[0]!)).toThrow(NoiseError)
  })

  it('gives up on a frame left half sent', () => {
    let clock = 0
    const { sender, receiver, wire } = pairOfLinks(() => clock)
    sender.send('x'.repeat(CHUNK_BYTES * 2))
    receiver.receive(wire[0]!)
    clock += FRAME_TIMEOUT_MS + 1
    expect(receiver.stale()).toBe(true)
    expect(() => receiver.receive(wire[1]!)).toThrow(NoiseError)
  })

  it('shows both sides the same confirmation code, and names a device by its key', () => {
    const { hashes } = pairOfLinks()
    expect(pairingConfirmationCode(hashes[0]!)).toMatch(/^\d{6}$/)
    expect(pairingConfirmationCode(hashes[0]!)).toBe(pairingConfirmationCode(hashes[1]!))
    const key = generateKeyPair().publicKey
    expect(mobileDeviceId(key)).toBe(mobileDeviceId(key))
    expect(mobileDeviceId(key)).not.toBe(mobileDeviceId(generateKeyPair().publicKey))
  })
})

describe('withUnsupportedItems', () => {
  const base = { id: 'n1', stageId: 's1', revision: 1, at: 5 }
  it('turns an item this version cannot read into a notice in its place', () => {
    const page = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { items: [{ ...base, kind: 'hologram', depth: 3 }, { ...base, id: 'a', kind: 'assistant', text: 'hi', streaming: false }], before: null } })
    expect(JSON.parse(withUnsupportedItems(page, 'see the computer')).result.items).toEqual([
      { ...base, kind: 'notice', level: 'info', text: 'see the computer' },
      { ...base, id: 'a', kind: 'assistant', text: 'hi', streaming: false }
    ])
    const note = JSON.stringify({ jsonrpc: '2.0', method: 'conversations.chatItems', params: { conversationId: 'c', items: [{ ...base, kind: 'hologram' }] } })
    expect(JSON.parse(withUnsupportedItems(note, 'x')).params.items[0]).toMatchObject({ kind: 'notice', text: 'x' })
  })

  it('leaves other frames alone', () => {
    const frame = JSON.stringify({ jsonrpc: '2.0', id: 2, result: { ok: true } })
    expect(withUnsupportedItems(frame, 'x')).toBe(frame)
  })
})
