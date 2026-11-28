import type { ChannelPlatform } from '@antumi/protocol'
import { deliveryFailed, type ChannelConnector, type ConnectorEmit, type ConnectorFactory } from './channel-connector'
import type { CoreToChannelGateway, GatewayChannel } from './channel-gateway-ipc'
import { dingtalkConnector } from './channel-dingtalk'
import { feishuConnector, larkConnector } from './channel-feishu'
import { slackConnector } from './channel-slack'
import { wecomConnector } from './channel-wecom'

// How each platform is reached. A platform is added by its connector here; a missing one fails typecheck.
export const CONNECTORS = { slack: slackConnector, feishu: feishuConnector, lark: larkConnector, dingtalk: dingtalkConnector, wecom: wecomConnector } satisfies Record<ChannelPlatform, ConnectorFactory>

type Connection = { config: string; connector?: ChannelConnector; downloads: Map<string, Set<string>> }

function connectionConfig(channel: GatewayChannel): string {
  const options = { followUps: false, ...channel.options }
  return JSON.stringify([channel.platform, Object.entries(channel.credentials).sort(), Object.entries(options).sort()])
}

// The platforms' connections, one per channel, as core names them.
export class ChannelGateway {
  private readonly live = new Map<string, Connection>()

  constructor(private readonly emit: ConnectorEmit, private readonly connectors: Record<ChannelPlatform, ConnectorFactory> = CONNECTORS) {}

  handle(message: CoreToChannelGateway): void {
    if (message.type === 'channels') return this.apply(message.channels)
    const connection = this.live.get(message.channelId)
    const connector = connection?.connector
    switch (message.type) {
      case 'accepted':
        if (connector) void this.call(message.channelId, 'accepted', () => connector.accepted(message.eventKey))
        return
      case 'fetch': {
        if (!connection || !connector) return this.failImages(message.requestId, message.images)
        const waiting = new Set(message.images)
        connection.downloads.set(message.requestId, waiting)
        return void this.call(message.channelId, 'fetch', () => connector.fetch(message.requestId, message.images))
          .then(() => {
            if (connection.downloads.get(message.requestId) !== waiting) return
            connection.downloads.delete(message.requestId)
            this.failImages(message.requestId, waiting)
          })
      }
      case 'actionReply':
        if (connector) void this.call(message.channelId, 'actionReply', () => connector.reply?.(message.eventKey, message.toast))
        return
      case 'mcp':
      case 'grant': {
        const answer = this.call(message.channelId, message.type, async () => {
          if (!connector) return { ok: false, error: 'not connected' }
          const asked = message.type === 'mcp' ? connector.mcp?.(message) : connector.grant?.(message)
          return asked ?? { ok: false, error: 'unsupported' }
        }, () => ({ ok: false, error: 'platform operation failed' }))
        return void answer.then((done) => this.emit({ type: 'platformAnswer', callId: message.callId, ...done }))
      }
      case 'deliver': {
        const { type: _type, ...job } = message
        const answer = this.call(job.channelId, 'deliver',
          () => connector ? connector.deliver(job) : deliveryFailed('retry', 'channel-delivery-offline'),
          () => deliveryFailed('unknown', 'channel-delivery-unconfirmed'))
        return void answer.then((done) => this.emit({ type: 'delivered', outboxId: job.outboxId, ...done }))
      }
    }
  }

  private call<T>(channelId: string, operation: string, invoke: () => T | Promise<T>, fallback: () => T): Promise<T>
  private call(channelId: string, operation: string, invoke: () => void | Promise<void>): Promise<void>
  private async call<T>(channelId: string, operation: string, invoke: () => T | Promise<T>, fallback?: () => T): Promise<T | undefined> {
    try {
      return await invoke()
    } catch {
      this.warn(channelId, operation)
      return fallback?.()
    }
  }

  private warn(channelId: string, operation: string): void {
    // SDK errors may include credentials or message contents.
    console.error(`[channel-gateway] ${operation} failed for ${channelId}`)
  }

  private failImages(requestId: string, refs: Iterable<string>): void {
    for (const ref of refs) this.emit({ type: 'image', requestId, ref, data: '', done: true, error: 'image unavailable' })
  }

  private close(id: string): void {
    const current = this.live.get(id)
    this.live.delete(id)
    if (!current) return
    for (const [requestId, refs] of current.downloads) this.failImages(requestId, refs)
    current.downloads.clear()
    try {
      current.connector?.stop()
    } catch {
      this.warn(id, 'stop')
    }
  }

  private apply(channels: readonly GatewayChannel[]): void {
    const wanted = new Set(channels.map((channel) => channel.id))
    for (const id of this.live.keys()) if (!wanted.has(id)) this.close(id)
    for (const channel of channels) {
      const config = connectionConfig(channel)
      if (this.live.get(channel.id)?.config === config) continue
      this.close(channel.id)
      const connection: Connection = { config, downloads: new Map() }
      this.live.set(channel.id, connection)
      this.emit({ type: 'state', channelId: channel.id, state: 'connecting', error: null })
      try {
        connection.connector = this.connectors[channel.platform](channel, (message) => {
          if (this.live.get(channel.id) !== connection) return
          if (message.type === 'image') {
            const waiting = connection.downloads.get(message.requestId)
            if (!waiting?.has(message.ref)) return
            if (message.done || message.error !== null) waiting.delete(message.ref)
          }
          this.emit(message)
        })
      } catch {
        this.warn(channel.id, 'start')
        // Keep the failed config until it changes, so unrelated saves do not retry it.
        this.live.set(channel.id, { config, downloads: new Map() })
        this.emit({ type: 'state', channelId: channel.id, state: 'failed', error: 'channel-connector-start-failed' })
      }
    }
  }

  stop(): void {
    for (const id of this.live.keys()) this.close(id)
  }
}
