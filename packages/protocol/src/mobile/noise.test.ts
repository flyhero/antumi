import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateKeyPair, keyPairFromPrivate, NoiseError, NoiseHandshake, type NoisePattern } from './noise'

type Vector = {
  protocol_name: string
  init_prologue: string
  init_static: string
  init_ephemeral: string
  init_psks?: string[]
  resp_prologue: string
  resp_static: string
  resp_ephemeral: string
  resp_psks?: string[]
  handshake_hash: string
  messages: { payload: string; ciphertext: string }[]
}

const vectors: Vector[] = JSON.parse(readFileSync(new URL('./noise-vectors.json', import.meta.url), 'utf8')).vectors
const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))
const hex = (data: Uint8Array) => Buffer.from(data).toString('hex')

describe('Noise against the cacophony vectors', () => {
  it.each(vectors.map((vector) => [vector.protocol_name, vector] as const))('%s', (_name, vector) => {
    const pattern: NoisePattern = vector.protocol_name.includes('psk3') ? 'XXpsk3' : 'XX'
    const initiator = new NoiseHandshake({
      pattern, initiator: true, prologue: bytes(vector.init_prologue), staticKey: keyPairFromPrivate(bytes(vector.init_static)),
      ephemeral: keyPairFromPrivate(bytes(vector.init_ephemeral)), ...(vector.init_psks ? { psk: bytes(vector.init_psks[0]!) } : {})
    })
    const responder = new NoiseHandshake({
      pattern, initiator: false, prologue: bytes(vector.resp_prologue), staticKey: keyPairFromPrivate(bytes(vector.resp_static)),
      ephemeral: keyPairFromPrivate(bytes(vector.resp_ephemeral)), ...(vector.resp_psks ? { psk: bytes(vector.resp_psks[0]!) } : {})
    })
    vector.messages.slice(0, 3).forEach((message, index) => {
      const [writer, reader] = index % 2 === 0 ? [initiator, responder] : [responder, initiator]
      const sent = writer.writeMessage(bytes(message.payload))
      expect(hex(sent)).toBe(message.ciphertext)
      expect(hex(reader.readMessage(sent))).toBe(message.payload)
    })
    expect(hex(initiator.handshakeHash)).toBe(vector.handshake_hash)
    expect(hex(responder.handshakeHash)).toBe(vector.handshake_hash)
    expect(hex(responder.remoteStatic!)).toBe(hex(keyPairFromPrivate(bytes(vector.init_static)).publicKey))
    const i = initiator.split()
    const r = responder.split()
    // After the handshake the senders keep alternating, the responder first.
    vector.messages.slice(3).forEach((message, index) => {
      const [send, receive] = index % 2 === 0 ? [r.send, i.receive] : [i.send, r.receive]
      const sent = send.encrypt(bytes(message.payload))
      expect(hex(sent)).toBe(message.ciphertext)
      expect(hex(receive.decrypt(sent))).toBe(message.payload)
    })
  })
})

describe('Noise handshakes', () => {
  const prologue = new TextEncoder().encode('antumi-test')

  it('fails XXpsk3 when the two sides hold different keys', () => {
    const psk = new Uint8Array(32).fill(7)
    const initiator = new NoiseHandshake({ pattern: 'XXpsk3', initiator: true, prologue, staticKey: generateKeyPair(), psk })
    const responder = new NoiseHandshake({ pattern: 'XXpsk3', initiator: false, prologue, staticKey: generateKeyPair(), psk: new Uint8Array(32).fill(8) })
    responder.readMessage(initiator.writeMessage())
    initiator.readMessage(responder.writeMessage())
    expect(() => responder.readMessage(initiator.writeMessage())).toThrow(NoiseError)
  })

  it('fails when the prologues differ, so a version or mode cannot be swapped in transit', () => {
    const initiator = new NoiseHandshake({ pattern: 'XX', initiator: true, prologue, staticKey: generateKeyPair() })
    const responder = new NoiseHandshake({ pattern: 'XX', initiator: false, prologue: new TextEncoder().encode('antumi-other'), staticKey: generateKeyPair() })
    responder.readMessage(initiator.writeMessage())
    expect(() => initiator.readMessage(responder.writeMessage())).toThrow(NoiseError)
  })

  it('rejects a tampered transport message and keeps turns in order', () => {
    const a = new NoiseHandshake({ pattern: 'XX', initiator: true, prologue, staticKey: generateKeyPair() })
    const b = new NoiseHandshake({ pattern: 'XX', initiator: false, prologue, staticKey: generateKeyPair() })
    expect(() => b.writeMessage()).toThrow(NoiseError)
    b.readMessage(a.writeMessage())
    a.readMessage(b.writeMessage())
    b.readMessage(a.writeMessage())
    const sent = a.split().send.encrypt(new TextEncoder().encode('hello'))
    sent[0]! ^= 1
    expect(() => b.split().receive.decrypt(sent)).toThrow(NoiseError)
  })
})
