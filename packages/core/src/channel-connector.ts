import type { ChannelDelivery, ChannelGatewayToCore, CoreToChannelGateway, GatewayChannel } from './channel-gateway-ipc'

export type Delivered = { ok: boolean; platformId: string | null; retryAfterMs: number | null; error: string | null }

// One channel's connection to its platform, inside the gateway (docs/CHANNELS.md, 扩展点). It
// turns the platform's messages into events and posts what it is told to; it decides nothing.
export interface ChannelConnector {
  // Core has the event on disk: the platform may now be told it arrived. Until then it is not, so
  // one core never took is delivered again.
  accepted(eventKey: string): void
  deliver(job: ChannelDelivery): Promise<Delivered>
  // Fetches the pictures of a question core let through, and emits each in pieces.
  fetch(requestId: string, refs: readonly string[]): Promise<void>
  // Core's answer to a click it was handed: told to the clicker, where the platform has cards.
  reply?(eventKey: string, toast: Extract<CoreToChannelGateway, { type: 'actionReply' }>['toast']): void
  stop(): void
}

export type ConnectorEmit = (message: ChannelGatewayToCore) => void
export type ConnectorFactory = (channel: GatewayChannel, emit: ConnectorEmit) => ChannelConnector
