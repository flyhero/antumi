import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { x25519 } from '@noble/curves/ed25519.js'
import { blake2s } from '@noble/hashes/blake2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { randomBytes } from '@noble/hashes/utils.js'

// Noise (noiseprotocol.org, revision 34) for the phone link: XX, and XXpsk3 for pairing, over
// 25519, ChaChaPoly and BLAKE2s. Only what those two patterns need; checked against the
// cacophony test vectors (noise.test.ts). The primitives are noble's, so it runs unchanged in
// core's gateway and in React Native.

export const NOISE_MAX_MESSAGE = 65535
const DH_LEN = 32
const HASH_LEN = 32
const TAG_LEN = 16
// Below the spec's 2^64 - 1: a plain number counts exactly that far, on every engine (Hermes
// included), and a link reconnects long before.
const MAX_NONCE = Number.MAX_SAFE_INTEGER

export type NoiseKeyPair = { publicKey: Uint8Array; privateKey: Uint8Array }
export type NoisePattern = 'XX' | 'XXpsk3'

export class NoiseError extends Error {}

export function generateKeyPair(): NoiseKeyPair {
  const privateKey = randomBytes(32)
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) }
}

export function keyPairFromPrivate(privateKey: Uint8Array): NoiseKeyPair {
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function hkdf(chainingKey: Uint8Array, ikm: Uint8Array, outputs: 2 | 3): Uint8Array[] {
  const temp = hmac(blake2s, chainingKey, ikm)
  const first = hmac(blake2s, temp, Uint8Array.of(1))
  const second = hmac(blake2s, temp, concat(first, Uint8Array.of(2)))
  if (outputs === 2) return [first, second]
  return [first, second, hmac(blake2s, temp, concat(second, Uint8Array.of(3)))]
}

function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  try {
    return x25519.getSharedSecret(privateKey, publicKey)
  } catch {
    throw new NoiseError('invalid public key')
  }
}

// 32 bits of zeros, then the counter as 64 bits little-endian.
function nonce(n: number): Uint8Array {
  const out = new Uint8Array(12)
  const view = new DataView(out.buffer)
  view.setUint32(4, n % 0x1_0000_0000, true)
  view.setUint32(8, Math.floor(n / 0x1_0000_0000), true)
  return out
}

export class CipherState {
  private n = 0

  constructor(private key: Uint8Array | null = null) {}

  get hasKey(): boolean {
    return this.key !== null
  }

  initializeKey(key: Uint8Array): void {
    this.key = key
    this.n = 0
  }

  encrypt(plaintext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (!this.key) return plaintext
    // The last nonce is reserved; a link that got this far reconnects instead.
    if (this.n >= MAX_NONCE) throw new NoiseError('nonce exhausted')
    const out = chacha20poly1305(this.key, nonce(this.n), ad).encrypt(plaintext)
    this.n += 1
    return out
  }

  decrypt(ciphertext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (!this.key) return ciphertext
    if (this.n >= MAX_NONCE) throw new NoiseError('nonce exhausted')
    let out: Uint8Array
    try {
      out = chacha20poly1305(this.key, nonce(this.n), ad).decrypt(ciphertext)
    } catch {
      throw new NoiseError('message failed authentication')
    }
    this.n += 1
    return out
  }
}

class SymmetricState {
  readonly cipher = new CipherState()
  private ck: Uint8Array
  h: Uint8Array

  constructor(protocolName: string) {
    const name = new TextEncoder().encode(protocolName)
    this.h = name.length <= HASH_LEN ? concat(name, new Uint8Array(HASH_LEN - name.length)) : blake2s(name)
    this.ck = this.h
  }

  mixKey(ikm: Uint8Array): void {
    const [ck, key] = hkdf(this.ck, ikm, 2)
    this.ck = ck!
    this.cipher.initializeKey(key!)
  }

  mixHash(data: Uint8Array): void {
    this.h = blake2s(concat(this.h, data))
  }

  mixKeyAndHash(ikm: Uint8Array): void {
    const [ck, hash, key] = hkdf(this.ck, ikm, 3)
    this.ck = ck!
    this.mixHash(hash!)
    this.cipher.initializeKey(key!)
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const out = this.cipher.encrypt(plaintext, this.h)
    this.mixHash(out)
    return out
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const out = this.cipher.decrypt(ciphertext, this.h)
    this.mixHash(ciphertext)
    return out
  }

  split(): [CipherState, CipherState] {
    const [first, second] = hkdf(this.ck, new Uint8Array(0), 2)
    return [new CipherState(first!), new CipherState(second!)]
  }
}

type Token = 'e' | 's' | 'ee' | 'es' | 'se' | 'psk'

const PATTERNS: Record<NoisePattern, Token[][]> = {
  XX: [['e'], ['e', 'ee', 's', 'es'], ['s', 'se']],
  XXpsk3: [['e'], ['e', 'ee', 's', 'es'], ['s', 'se', 'psk']]
}

export type NoiseHandshakeOptions = {
  pattern: NoisePattern
  initiator: boolean
  prologue: Uint8Array
  staticKey: NoiseKeyPair
  // For XXpsk3: 32 bytes both sides hold before the handshake.
  psk?: Uint8Array
  // Fixed ephemeral keys, for the test vectors only.
  ephemeral?: NoiseKeyPair
}

export type NoiseTransport = { send: CipherState; receive: CipherState }

export class NoiseHandshake {
  private readonly symmetric: SymmetricState
  private readonly messages: Token[][]
  private readonly psk: Uint8Array | null
  private e: NoiseKeyPair | null = null
  private re: Uint8Array | null = null
  private rs: Uint8Array | null = null
  private index = 0
  private transport: NoiseTransport | null = null

  constructor(private readonly options: NoiseHandshakeOptions) {
    this.messages = PATTERNS[options.pattern]
    const usesPsk = options.pattern === 'XXpsk3'
    if (usesPsk && options.psk?.length !== 32) throw new NoiseError('XXpsk3 needs a 32-byte psk')
    this.psk = usesPsk ? options.psk! : null
    this.symmetric = new SymmetricState(`Noise_${options.pattern}_25519_ChaChaPoly_BLAKE2s`)
    this.symmetric.mixHash(options.prologue)
  }

  get complete(): boolean {
    return this.transport !== null
  }

  // The same on both sides once complete; what a pairing's confirmation code is taken from.
  get handshakeHash(): Uint8Array {
    return this.symmetric.h
  }

  get remoteStatic(): Uint8Array | null {
    return this.rs
  }

  // Whose turn it is: the initiator writes the even messages.
  get writing(): boolean {
    return (this.index % 2 === 0) === this.options.initiator
  }

  writeMessage(payload: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (this.complete || !this.writing) throw new NoiseError('not this side\'s turn to write')
    const parts: Uint8Array[] = []
    for (const token of this.messages[this.index]!) {
      if (token === 'e') {
        this.e = this.options.ephemeral ?? generateKeyPair()
        parts.push(this.e.publicKey)
        this.symmetric.mixHash(this.e.publicKey)
        if (this.psk) this.symmetric.mixKey(this.e.publicKey)
      } else if (token === 's') {
        parts.push(this.symmetric.encryptAndHash(this.options.staticKey.publicKey))
      } else {
        this.mixToken(token)
      }
    }
    parts.push(this.symmetric.encryptAndHash(payload))
    const message = concat(...parts)
    if (message.length > NOISE_MAX_MESSAGE) throw new NoiseError('handshake message too long')
    this.advance()
    return message
  }

  readMessage(message: Uint8Array): Uint8Array {
    if (this.complete || this.writing) throw new NoiseError('not this side\'s turn to read')
    if (message.length > NOISE_MAX_MESSAGE) throw new NoiseError('handshake message too long')
    let offset = 0
    const take = (length: number): Uint8Array => {
      if (offset + length > message.length) throw new NoiseError('handshake message too short')
      const out = message.subarray(offset, offset + length)
      offset += length
      return out
    }
    for (const token of this.messages[this.index]!) {
      if (token === 'e') {
        this.re = take(DH_LEN).slice()
        this.symmetric.mixHash(this.re)
        if (this.psk) this.symmetric.mixKey(this.re)
      } else if (token === 's') {
        this.rs = this.symmetric.decryptAndHash(take(this.symmetric.cipher.hasKey ? DH_LEN + TAG_LEN : DH_LEN)).slice()
      } else {
        this.mixToken(token)
      }
    }
    const payload = this.symmetric.decryptAndHash(message.subarray(offset))
    this.advance()
    return payload
  }

  // The two cipher states, once the last message is through: send and receive for this side.
  split(): NoiseTransport {
    if (!this.transport) throw new NoiseError('handshake not complete')
    return this.transport
  }

  private mixToken(token: Exclude<Token, 'e' | 's'>): void {
    const { initiator, staticKey } = this.options
    if (token === 'psk') {
      this.symmetric.mixKeyAndHash(this.psk!)
      return
    }
    const e = this.e
    const s = staticKey
    if (!e) throw new NoiseError('no ephemeral key yet')
    if (token === 'ee') this.symmetric.mixKey(dh(e.privateKey, this.need(this.re)))
    // es: the initiator's ephemeral with the responder's static; se the other way round.
    else if (token === 'es') this.symmetric.mixKey(initiator ? dh(e.privateKey, this.need(this.rs)) : dh(s.privateKey, this.need(this.re)))
    else this.symmetric.mixKey(initiator ? dh(s.privateKey, this.need(this.re)) : dh(e.privateKey, this.need(this.rs)))
  }

  private need(key: Uint8Array | null): Uint8Array {
    if (!key) throw new NoiseError('remote key missing')
    return key
  }

  private advance(): void {
    this.index += 1
    if (this.index === this.messages.length) {
      const [first, second] = this.symmetric.split()
      this.transport = this.options.initiator ? { send: first, receive: second } : { send: second, receive: first }
    }
  }
}
