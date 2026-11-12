import { blake2s } from '@noble/hashes/blake2.js'
import { NOISE_MAX_MESSAGE, NoiseError, type NoiseTransport } from './noise'

// One encrypted link between a phone and the gateway, after the handshake. A Noise message holds
// at most 64 KiB, and an RPC frame can be megabytes (a page of chat, an image chunk in base64), so
// each frame goes as chunks: one byte of flags (1 = last), a big-endian u32 sequence number, then
// up to CHUNK_BYTES of the frame's UTF-8. Chunks of one frame are sent back to back, so a link
// holds at most one frame half-received.

export const CHUNK_BYTES = 60 * 1024
export const MAX_FRAME_BYTES = 8 * 1024 * 1024
export const FRAME_TIMEOUT_MS = 30_000
const HEADER_BYTES = 5
const TAG_BYTES = 16

export type LinkSocket = { send(data: Uint8Array): void; close(): void }

export class MobileLink {
  private sent = 0
  private received = 0
  private parts: Uint8Array[] = []
  private size = 0
  private startedAt: number | null = null

  constructor(
    private readonly socket: LinkSocket,
    private readonly transport: NoiseTransport,
    private readonly now: () => number = Date.now
  ) {}

  send(text: string): void {
    const bytes = new TextEncoder().encode(text)
    if (bytes.length > MAX_FRAME_BYTES) throw new NoiseError('frame too large')
    let offset = 0
    do {
      const piece = bytes.subarray(offset, offset + CHUNK_BYTES)
      offset += piece.length
      const chunk = new Uint8Array(HEADER_BYTES + piece.length)
      chunk[0] = offset >= bytes.length ? 1 : 0
      new DataView(chunk.buffer).setUint32(1, this.sent++)
      chunk.set(piece, HEADER_BYTES)
      this.socket.send(this.transport.send.encrypt(chunk))
    } while (offset < bytes.length)
  }

  // A whole frame once its last chunk is in, else null. Throws on anything out of order, too
  // big or forged; the caller then closes the socket.
  receive(data: Uint8Array): string | null {
    if (data.length > NOISE_MAX_MESSAGE || data.length < HEADER_BYTES + TAG_BYTES) throw new NoiseError('bad chunk size')
    if (this.stale()) throw new NoiseError('frame took too long')
    const chunk = this.transport.receive.decrypt(data)
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    const flags = view.getUint8(0)
    if (view.getUint32(1) !== this.received++) throw new NoiseError('chunk out of order')
    const piece = chunk.subarray(HEADER_BYTES)
    this.size += piece.length
    if (this.size > MAX_FRAME_BYTES) throw new NoiseError('frame too large')
    if (this.startedAt === null) this.startedAt = this.now()
    this.parts.push(piece)
    if ((flags & 1) === 0) return null
    const whole = new Uint8Array(this.size)
    let offset = 0
    for (const part of this.parts) {
      whole.set(part, offset)
      offset += part.length
    }
    this.parts = []
    this.size = 0
    this.startedAt = null
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(whole)
    } catch {
      throw new NoiseError('frame is not UTF-8')
    }
  }

  // A frame begun and not finished in time; the gateway checks this on a timer too.
  stale(): boolean {
    return this.startedAt !== null && this.now() - this.startedAt > FRAME_TIMEOUT_MS
  }

  close(): void {
    this.socket.close()
  }
}

// The code a pairing shows on both screens, from the handshake hash: the same on both sides only
// when nobody sat between them.
export function pairingConfirmationCode(handshakeHash: Uint8Array): string {
  const digest = blake2s(new Uint8Array([...handshakeHash, ...new TextEncoder().encode('antumi-pair-code')]))
  const value = new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0)
  return String(value % 1_000_000).padStart(6, '0')
}

// A device's id, from its public key, so a phone cannot name itself as another.
export function mobileDeviceId(publicKey: Uint8Array): string {
  return Array.from(blake2s(publicKey).subarray(0, 10), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
