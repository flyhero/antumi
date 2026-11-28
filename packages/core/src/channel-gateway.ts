import type { ChannelPlatform } from '@antumi/protocol'
import type { ChannelConnector, ConnectorEmit, ConnectorFactory } from './channel-connector'
import type { CoreToChannelGateway, GatewayChannel } from './channel-gateway-ipc'
import { dingtalkConnector } from './channel-dingtalk'
import { feishuConnector, larkConnector } from './channel-feishu'
import { slackConnector } from './channel-slack'
import { wecomConnector } from './channel-wecom'

// How each platform is reached. A platform is added by its connector here; a missing one fails typecheck.
export const CONNECTORS = { slack: slackConnector, feishu: feishuConnector, lark: larkConnector, dingtalk: dingtalkConnector, wecom: wecomConnector } satisfies Record<ChannelPlatform, ConnectorFactory>

// The platforms' connections, one per channel, as core names them. It holds no rule and nothing of
// core's: what comes in goes to core as it is, and only what core says is posted.
export class ChannelGateway {
  private readonly live = new Map<string, { said: string; connector: ChannelConnector }>()

  constructor(private readonly emit: ConnectorEmit, private readonly connectors: Record<ChannelPlatform, ConnectorFactory> = CONNECTORS) {}

  handle(message: CoreToChannelGateway): void {
    switch (message.type) {
      case 'channels':
        return this.apply(message.channels)
      case 'accepted':
        return this.live.get(message.channelId)?.connector.accepted(message.eventKey)
      case 'fetch': {
        const connector = this.live.get(message.channelId)?.connector
        if (connector) return void connector.fetch(message.requestId, message.images)
        for (const ref of message.images) this.emit({ type: 'image', requestId: message.requestId, ref, data: '', done: true, error: 'not connected' })
        return
      }
      case 'actionReply':
        return this.live.get(message.channelId)?.connector.reply?.(message.eventKey, message.toast)
      case 'mcp':
      case 'grant': {
        const connector = this.live.get(message.channelId)?.connector
        const { callId } = message
        const asked = !connector ? null : message.type === 'mcp' ? connector.mcp?.(message) : connector.grant?.(message)
        const answer = asked ?? Promise.resolve({ ok: false, error: connector ? 'unsupported' : 'not connected' })
        return void answer.catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : 'failed' }))
          .then((done) => this.emit({ type: 'platformAnswer', callId, ...done }))
      }
      case 'deliver': {
        const { type: _type, ...job } = message
        const connector = this.live.get(job.channelId)?.connector
        const answer = connector ? connector.deliver(job) : Promise.resolve({ ok: false, platformId: null, retryAfterMs: null, error: 'not connected', failure: 'retry' as const })
        return void answer.catch(() => ({ ok: false, platformId: null, retryAfterMs: null, error: 'delivery interrupted', failure: 'unknown' as const })).then((done) => this.emit({ type: 'delivered', outboxId: job.outboxId, ...done }))
      }
    }
  }

  // Opens what is new, reopens what changed, closes what is gone; one unchanged keeps its connection.
  private apply(channels: readonly GatewayChannel[]): void {
    const wanted = new Map(channels.map((channel) => [channel.id, channel]))
    for (const [id, { connector }] of this.live) {
      if (wanted.has(id)) continue
      connector.stop()
      this.live.delete(id)
    }
    for (const channel of channels) {
      const said = JSON.stringify([channel.platform, channel.credentials])
      const current = this.live.get(channel.id)
      if (current?.said === said) continue
      current?.connector.stop()
      this.emit({ type: 'state', channelId: channel.id, state: 'connecting', error: null })
      this.live.set(channel.id, { said, connector: this.connectors[channel.platform](channel, this.emit) })
    }
  }

  stop(): void {
    for (const { connector } of this.live.values()) connector.stop()
    this.live.clear()
  }
}
