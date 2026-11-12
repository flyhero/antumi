import { z } from 'zod'

// The phone link (docs/MOBILE.md). What core, desktop and the phone share about devices and
// pairing lives here, with zod only; the transport (Noise, framing, the phone's connector) is the
// ./mobile subpath, so the desktop renderer never loads it.

// Between the phone and the gateway, apart from PROTOCOL_VERSION: a phone app lags behind the
// core it talks to, so this only changes for what an older phone cannot read.
export const MOBILE_PROTOCOL_VERSION = 1
export const MOBILE_DEFAULT_PORT = 7820

// view reads; operate drives conversations as the desktop does, widening permissions included.
export const MobileAccess = z.enum(['view', 'operate'])
export type MobileAccess = z.infer<typeof MobileAccess>

export const MobilePlatform = z.enum(['android', 'ios', 'web', 'other']).catch('other')
export type MobilePlatform = z.infer<typeof MobilePlatform>

export const MobileDevice = z.object({
  // Taken from the device's public key, never from what it says of itself.
  id: z.string(),
  name: z.string(),
  platform: MobilePlatform,
  access: MobileAccess,
  pairedAt: z.number(),
  lastSeenAt: z.number().nullable(),
  online: z.boolean()
})
export type MobileDevice = z.infer<typeof MobileDevice>

// A pairing the desktop opened: its QR code until a phone completes the handshake, then the
// phone's name and the code both sides show, until the user answers.
export const MobilePairing = z.object({
  id: z.string(),
  uri: z.string(),
  expiresAt: z.number(),
  request: z.object({ name: z.string(), platform: MobilePlatform, code: z.string() }).nullable()
})
export type MobilePairing = z.infer<typeof MobilePairing>

export const MobileGatewayState = z.enum(['off', 'starting', 'running', 'failed'])
export type MobileGatewayState = z.infer<typeof MobileGatewayState>

export const MobileStatus = z.object({
  enabled: z.boolean(),
  port: z.number().int(),
  state: MobileGatewayState,
  error: z.string().nullable(),
  // Where a phone can reach this computer: private addresses, then Tailscale's name if any.
  addresses: z.array(z.string()),
  pairing: MobilePairing.nullable(),
  devices: z.array(MobileDevice),
  // An ntfy-style address the gateway posts short notices to; null for none.
  pushUrl: z.string().nullable()
})
export type MobileStatus = z.infer<typeof MobileStatus>

export const MobilePort = z.number().int().min(1024).max(65535)
export const MobilePushUrl = z.string().trim().url().max(500).refine((url) => /^https?:\/\//i.test(url), 'http or https only')

// What the QR code carries. psk is the one-time pairing secret; key the computer's public key,
// which the phone pins from then on. Binary fields are base64url.
export const MobilePairingCode = z.object({
  v: z.number().int(),
  name: z.string().max(200),
  key: z.string(),
  pairing: z.string(),
  psk: z.string(),
  port: z.number().int(),
  hosts: z.array(z.string()).max(16)
})
export type MobilePairingCode = z.infer<typeof MobilePairingCode>

const PAIR_PREFIX = 'antumi://pair?p='

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export const base64Url = { encode: toBase64Url, decode: fromBase64Url }

export function encodePairingCode(code: MobilePairingCode): string {
  return PAIR_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(code)))
}

// null for anything that is not a pairing code this version reads.
export function decodePairingCode(text: string): MobilePairingCode | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PAIR_PREFIX)) return null
  try {
    const parsed = MobilePairingCode.safeParse(JSON.parse(new TextDecoder().decode(fromBase64Url(trimmed.slice(PAIR_PREFIX.length)))))
    return parsed.success && parsed.data.v === MOBILE_PROTOCOL_VERSION ? parsed.data : null
  } catch {
    return null
  }
}

// What a phone said of itself in the handshake's last message; shown, never trusted.
export const MobileHello = z.object({
  name: z.string().trim().min(1).max(100).catch('Phone'),
  platform: MobilePlatform,
  app: z.string().max(50).catch('')
})
export type MobileHello = z.infer<typeof MobileHello>

// The cleartext first message on the socket, before Noise: it picks the pattern (pairing or a
// paired phone), and is bound into the handshake as the prologue, so it cannot be changed unseen.
export const MobileOpening = z.object({
  antumi: z.literal('mobile'),
  v: z.number().int(),
  mode: z.enum(['pair', 'connect']),
  pairing: z.string().max(100).optional()
})
export type MobileOpening = z.infer<typeof MobileOpening>

export function mobilePrologue(opening: MobileOpening): Uint8Array {
  return new TextEncoder().encode(`antumi-mobile/${opening.v}/${opening.mode}/${opening.pairing ?? ''}`)
}

// The gateway's own messages inside the encrypted link, apart from JSON-RPC frames.
export const MobileControl = z.union([
  z.object({ type: z.literal('pairing'), state: z.literal('confirming'), code: z.string() }),
  z.object({ type: z.literal('pairing'), state: z.literal('rejected'), reason: z.string() }),
  z.object({
    type: z.literal('welcome'),
    deviceId: z.string(),
    access: MobileAccess,
    computer: z.string(),
    serverVersion: z.string(),
    features: z.array(z.string()),
    home: z.object({ path: z.string(), windows: z.boolean() }).optional(),
    // Where the computer can be reached now, for the phone to keep: its addresses change.
    hosts: z.array(z.string()).max(16).optional()
  }),
  z.object({ type: z.literal('closing'), reason: z.enum(['revoked', 'shutdown', 'replaced', 'error']).catch('error') })
])
export type MobileControl = z.infer<typeof MobileControl>
