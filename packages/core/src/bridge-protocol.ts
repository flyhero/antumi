// What the bridge (bridge-server.ts) and the gateway's link to it (bridge-link.ts) say to each other
// (docs/MOBILE.md). A computer keeps a control socket open; a phone asks for that computer by its
// bridge id; the bridge tells the computer, which opens a socket for that phone, and from then on
// the bridge passes each message across unchanged. Those messages are the phone link's Noise
// traffic, which the bridge cannot read.
//
// Without zod or @antumi/protocol: the bridge is bundled from this into a script pasted on a
// server, and must stay small.

// MOBILE_BRIDGE_DEFAULT_PORT in @antumi/protocol; a test keeps the two the same.
export const BRIDGE_DEFAULT_PORT = 7830

export const isBridgeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value)
export const isBridgeStream = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{16}$/.test(value)

export const bridgePaths = {
  computer: (id: string) => `/v1/computer/${id}`,
  phone: (id: string) => `/v1/phone/${id}`,
  accept: (id: string, stream: string) => `/v1/accept/${id}/${stream}`
}

// What the bridge tells a computer on its control socket. On `incoming`, a phone waits on `stream`;
// `from` is its address, for the gateway's failure limits only.
export type BridgeControl = { type: 'ready' } | { type: 'incoming'; stream: string; from: string }

function parsed(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null
  } catch {
    return null
  }
}

// The first message on each of a computer's sockets. The bridge keeps the secret's hash the first
// time it sees the id, and turns away any other secret for it after.
export function bridgeHelloSecret(text: string): string | null {
  const secret = parsed(text)?.secret
  return typeof secret === 'string' && secret.length >= 32 && secret.length <= 100 ? secret : null
}

export function bridgeControl(text: string): BridgeControl | null {
  const message = parsed(text)
  if (message?.type === 'ready') return { type: 'ready' }
  if (message?.type === 'incoming' && isBridgeStream(message.stream) && typeof message.from === 'string' && message.from.length <= 64) {
    return { type: 'incoming', stream: message.stream, from: message.from }
  }
  return null
}

// host or host:port, as the user gave it, to the bridge's base URL.
export function bridgeUrl(address: string): string {
  return /:\d+$/.test(address) ? `ws://${address}` : `ws://${address}:${BRIDGE_DEFAULT_PORT}`
}

export function bridgePhoneUrl(address: string, id: string): string {
  return `${bridgeUrl(address)}${bridgePaths.phone(id)}`
}
