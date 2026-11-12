import { z } from 'zod'
import { MobileAccess, MobileHello } from '@antumi/protocol'

// What core and its gateway child say to each other over the IPC channel (gateway-main.ts). The
// gateway is core's own code, but its messages are parsed all the same.

export const GatewayDevice = z.object({ id: z.string(), publicKey: z.string(), access: MobileAccess })
export const GatewayPairing = z.object({ id: z.string(), psk: z.string(), expiresAt: z.number() })
export const PairingAnswer = z.union([z.object({ deviceId: z.string(), access: MobileAccess }), z.object({ rejected: z.string() })])

export const GatewayConfig = z.object({
  port: z.number().int(),
  privateKey: z.string(),
  coreUrl: z.string(),
  computerName: z.string()
})
export type GatewayConfig = z.infer<typeof GatewayConfig>

export const CoreToGateway = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), config: GatewayConfig }),
  z.object({ type: z.literal('devices'), devices: z.array(GatewayDevice) }),
  z.object({ type: z.literal('pairing'), pairing: GatewayPairing.nullable() }),
  z.object({ type: z.literal('answer'), pairingId: z.string(), answer: PairingAnswer }),
  z.object({ type: z.literal('revoke'), deviceId: z.string() }),
  z.object({ type: z.literal('hosts'), hosts: z.array(z.string()).max(16) })
])
export type CoreToGateway = z.infer<typeof CoreToGateway>

export const GatewayToCore = z.discriminatedUnion('type', [
  z.object({ type: z.literal('listening'), port: z.number().int() }),
  z.object({ type: z.literal('failed'), reason: z.enum(['port-in-use', 'error']), message: z.string() }),
  z.object({ type: z.literal('paired'), pairingId: z.string(), publicKey: z.string(), hello: MobileHello, code: z.string() })
])
export type GatewayToCore = z.infer<typeof GatewayToCore>
