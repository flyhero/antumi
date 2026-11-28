import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign, type KeyObject } from 'node:crypto'
import { z } from 'zod'
import { base64Url } from '@antumi/protocol'

// Web Push as a UnifiedPush distributor takes it: the payload encrypted to the phone's keys
// (RFC 8291, aes128gcm), and the request signed with this computer's VAPID key (RFC 8292), which
// the phone registered with so that only this computer may push to its endpoint.

const RECORD_SIZE = 4096

// For tests only: the sender's key pair and salt, which are random otherwise.
export type WebPushFixed = { senderPrivateKey: Uint8Array; salt: Uint8Array }

export function encryptWebPush(payload: Uint8Array, p256dh: string, auth: string, fixed?: WebPushFixed): Buffer {
  const receiver = Buffer.from(base64Url.decode(p256dh))
  const sender = createECDH('prime256v1')
  if (fixed) sender.setPrivateKey(Buffer.from(fixed.senderPrivateKey))
  else sender.generateKeys()
  const senderPublic = sender.getPublicKey()
  const secret = sender.computeSecret(receiver)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiver, senderPublic])
  const ikm = Buffer.from(hkdfSync('sha256', secret, Buffer.from(base64Url.decode(auth)), keyInfo, 32))
  const salt = fixed ? Buffer.from(fixed.salt) : randomBytes(16)
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  // One record, ended by the last-record delimiter.
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(senderPublic.length, 20)
  return Buffer.concat([header, senderPublic, body])
}

export type VapidKey = { privateKey: KeyObject; publicKey: string }

export function generateVapidKey(): object {
  return generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' })
}

const PrivateJwk = z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), d: z.string(), x: z.string(), y: z.string() })

// null for anything but a P-256 private key as a JWK.
export function vapidKeyFromJwk(jwk: unknown): VapidKey | null {
  const parsed = PrivateJwk.safeParse(jwk)
  if (!parsed.success) return null
  try {
    const privateKey = createPrivateKey({ key: parsed.data, format: 'jwk' })
    const point = new Uint8Array([4, ...base64Url.decode(parsed.data.x), ...base64Url.decode(parsed.data.y)])
    return { privateKey, publicKey: base64Url.encode(point) }
  } catch {
    return null
  }
}

// The Authorization header for a push to this endpoint, valid for 12 hours.
export function vapidAuthorization(endpoint: string, key: VapidKey, now: number): string {
  const encode = (value: object) => base64Url.encode(new TextEncoder().encode(JSON.stringify(value)))
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: 'https://github.com/flyhero/antumi' }
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode(claims)}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: key.privateKey, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${unsigned}.${base64Url.encode(signature)}, k=${key.publicKey}`
}
