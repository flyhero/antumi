import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ChannelConnector, ConnectorEmit } from './channel-connector'
import { CONNECTORS, ChannelGateway } from './channel-gateway'
import type { ChannelGatewayToCore, GatewayChannel } from './channel-gateway-ipc'

const feishu: GatewayChannel = {
  id: 'a79bdde1-4438-45db-83a9-688cb67ffd13', platform: 'feishu',
  credentials: { appId: 'cli_test', appSecret: 'test' }
}
const wecom: GatewayChannel = {
  id: 'b1a70057-3310-451f-9162-32c5a382ff33', platform: 'wecom',
  credentials: { botId: 'bot', secret: 'test' }
}

function connector(overrides: Partial<ChannelConnector> = {}): ChannelConnector {
  return {
    accepted() {},
    stop() {},
    async fetch() {},
    async deliver() { return { ok: true, platformId: 'p1', retryAfterMs: null, error: null } },
    ...overrides
  }
}

const messages: ChannelGatewayToCore[] = []
const post = (channelId: string) => ({
  type: 'deliver' as const, outboxId: '3129f9d3-139b-450d-bea5-6cf85fb5e50b', channelId,
  op: 'post' as const, place: 'room', thread: null, target: null, text: 'answer', emoji: null
})

beforeEach(() => { messages.length = 0 })
afterEach(() => { vi.restoreAllMocks() })

it('replaces a connection when only follow-ups change and discards events from the old connection', () => {
  const listeners: ConnectorEmit[] = []
  const stop = vi.fn()
  const create = vi.fn((_channel: GatewayChannel, emit: ConnectorEmit) => {
    listeners.push(emit)
    return connector({ stop })
  })
  const gateway = new ChannelGateway((message) => messages.push(message), { ...CONNECTORS, feishu: create })
  gateway.handle({ type: 'channels', channels: [feishu] })
  gateway.handle({ type: 'channels', channels: [{ ...feishu, options: { followUps: false } }] })
  expect(create).toHaveBeenCalledTimes(1)
  gateway.handle({ type: 'channels', channels: [{ ...feishu, options: { followUps: true } }] })
  expect(create).toHaveBeenCalledTimes(2)
  expect(stop).toHaveBeenCalledTimes(1)
  expect(create.mock.calls[1]?.[0].options).toEqual({ followUps: true })
  listeners[0]?.({ type: 'state', channelId: feishu.id, state: 'failed', error: 'old connection' })
  listeners[1]?.({ type: 'state', channelId: feishu.id, state: 'connected', error: null })
  expect(messages).toEqual([
    { type: 'state', channelId: feishu.id, state: 'connecting', error: null },
    { type: 'state', channelId: feishu.id, state: 'connecting', error: null },
    { type: 'state', channelId: feishu.id, state: 'connected', error: null }
  ])
  gateway.stop()
})

it('finishes only outstanding image downloads when the connection is replaced', async () => {
  const requestId = '2d5b1f98-3115-4f7b-8b14-6e67682045eb'
  let emitFromOld: ConnectorEmit | undefined
  let finish = () => {}
  const download = new Promise<void>((resolve) => { finish = resolve })
  const gateway = new ChannelGateway((message) => messages.push(message), {
    ...CONNECTORS,
    feishu: (channel, emit) => {
      if (channel.options?.followUps) return connector()
      emitFromOld = emit
      return connector({ fetch: () => download })
    }
  })
  gateway.handle({ type: 'channels', channels: [feishu] })
  gateway.handle({ type: 'fetch', channelId: feishu.id, requestId, images: ['ready', 'partial'] })
  emitFromOld?.({ type: 'image', requestId, ref: 'ready', data: 'YQ==', done: true, error: null })
  emitFromOld?.({ type: 'image', requestId, ref: 'partial', data: 'Yg==', done: false, error: null })
  gateway.handle({ type: 'channels', channels: [{ ...feishu, options: { followUps: true } }] })
  expect(messages.filter((message) => message.type === 'image' && message.done)).toEqual([
    { type: 'image', requestId, ref: 'ready', data: 'YQ==', done: true, error: null },
    { type: 'image', requestId, ref: 'partial', data: '', done: true, error: 'image unavailable' }
  ])
  emitFromOld?.({ type: 'image', requestId, ref: 'partial', data: 'Yw==', done: true, error: null })
  finish()
  await download
  expect(messages.filter((message) => message.type === 'image')).toHaveLength(3)
  gateway.stop()
})

it('keeps other connectors usable after one fails to start or stop', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const start = vi.fn(() => { throw new Error('do not log this secret') })
  const failingStop = connector({ stop() { throw new Error('do not log this secret') } })
  const gateway = new ChannelGateway((message) => messages.push(message), {
    ...CONNECTORS,
    wecom: start,
    feishu: (channel) => channel.id === feishu.id ? connector() : failingStop
  })
  const removed = { ...feishu, id: '54bbd292-8588-4f0d-964c-d623a3237254' }
  gateway.handle({ type: 'channels', channels: [removed, wecom, feishu] })
  gateway.handle({ type: 'channels', channels: [wecom, feishu] })
  expect(start).toHaveBeenCalledTimes(1)
  expect(messages).toContainEqual({ type: 'state', channelId: wecom.id, state: 'failed', error: 'channel-connector-start-failed' })
  gateway.handle(post(feishu.id))
  await vi.waitFor(() => expect(messages).toContainEqual({ type: 'delivered', outboxId: post(feishu.id).outboxId, ok: true,
    platformId: 'p1', retryAfterMs: null, error: null }))
  expect(JSON.stringify(log.mock.calls)).not.toContain('do not log this secret')
  gateway.stop()
})

it('returns an image error on rejected downloads and marks an interrupted send unknown', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const broken = connector({
    async fetch() { throw new Error('image rejected') },
    deliver() { throw new Error('write interrupted') },
    async mcp() { throw new Error('platform tools unavailable') }
  })
  const gateway = new ChannelGateway((message) => messages.push(message), { ...CONNECTORS, wecom: () => broken })
  gateway.handle({ type: 'channels', channels: [wecom] })
  const requestId = 'a9d8eae1-1a57-4db7-9345-de0bf68106d0'
  gateway.handle({ type: 'fetch', channelId: wecom.id, requestId, images: ['image'] })
  gateway.handle(post(wecom.id))
  gateway.handle({ type: 'mcp', channelId: wecom.id, callId: requestId, method: 'tools/list', allowed: [], tool: null })
  await vi.waitFor(() => expect(messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'image', requestId, done: true, error: 'image unavailable' }),
    expect.objectContaining({ type: 'delivered', ok: false, failure: 'unknown' }),
    { type: 'platformAnswer', callId: requestId, ok: false, error: 'platform operation failed' }
  ])))
  gateway.stop()
})
