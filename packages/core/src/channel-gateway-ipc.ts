import { z } from 'zod'
import { ChannelPlatform, ChannelState } from '@antumi/protocol'

// What passes between core and its channel gateway, over the Node IPC channel core forked it
// with. The gateway holds the platforms' connections and nothing of core's: no token, no RPC. It
// hands events in and posts what it is told to; every rule is core's (docs/CHANNELS.md).

// To a platform, where a message is: the chat (place), the thread in it, the message. Each is the
// platform's own string, which core stores and hands back without reading.
const Ref = z.string().min(1).max(500)

export const GatewayChannel = z.object({ id: z.string().uuid(), platform: ChannelPlatform, credentials: z.record(z.string(), z.string()) })
export type GatewayChannel = z.infer<typeof GatewayChannel>

export const ChannelDelivery = z.object({
  outboxId: z.string().uuid(),
  channelId: z.string().uuid(),
  // react: an emoji on target · post: text in place, under thread where there is one
  op: z.enum(['react', 'post']),
  place: Ref,
  thread: Ref.nullable(),
  target: Ref.nullable(),
  text: z.string().nullable(),
  emoji: z.string().nullable(),
  // A user to notify with the post, named by core: the asker a task's progress is for.
  mention: Ref.nullable().optional()
})
export type ChannelDelivery = z.infer<typeof ChannelDelivery>

export const CoreToChannelGateway = z.discriminatedUnion('type', [
  // Every channel to hold a connection for, whole each time: the gateway opens, replaces and closes to match.
  z.object({ type: z.literal('channels'), channels: z.array(GatewayChannel) }),
  // The event is on disk: the platform may be told it arrived.
  z.object({ type: z.literal('accepted'), channelId: z.string().uuid(), eventKey: Ref }),
  // Pictures of a question that passed every check; none is fetched before.
  z.object({ type: z.literal('fetch'), requestId: z.string().uuid(), channelId: z.string().uuid(), images: z.array(Ref).max(16) }),
  z.object({ type: z.literal('deliver') }).extend(ChannelDelivery.shape)
])
export type CoreToChannelGateway = z.infer<typeof CoreToChannelGateway>

export const ChannelEventImage = z.object({ ref: Ref, name: z.string().max(300), mime: z.string().max(100), bytes: z.number().int().nonnegative() })
export type ChannelEventImage = z.infer<typeof ChannelEventImage>

// A message for the bot as its platform delivered it: a mention in a group chat, or a direct one.
export const ChannelEvent = z.object({
  channelId: z.string().uuid(),
  // The platform's id of the delivery, the same when it is delivered again.
  eventKey: Ref,
  kind: z.enum(['mention', 'direct']),
  tenant: Ref,
  place: Ref,
  // The thread it was written in, or null at the top of the chat.
  thread: Ref.nullable(),
  messageId: Ref,
  user: Ref,
  // Written by a bot (this one included), or an edit or deletion rather than a new message.
  ignorable: z.boolean(),
  text: z.string().max(40_000),
  images: z.array(ChannelEventImage).max(32),
  // Files that are not pictures, which are never fetched.
  otherFiles: z.number().int().nonnegative()
})
export type ChannelEvent = z.infer<typeof ChannelEvent>

export const ChannelGatewayToCore = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state'), channelId: z.string().uuid(), state: ChannelState, error: z.string().nullable(), tenant: z.string().nullable().optional(), tenantName: z.string().nullable().optional(), botUserId: z.string().nullable().optional() }),
  z.object({ type: z.literal('event') }).extend(ChannelEvent.shape),
  // A fetched picture in pieces, in order; done on the last, error instead where it could not be had.
  z.object({ type: z.literal('image'), requestId: z.string().uuid(), ref: Ref, data: z.string(), done: z.boolean(), error: z.string().nullable() }),
  z.object({ type: z.literal('delivered'), outboxId: z.string().uuid(), ok: z.boolean(), platformId: z.string().nullable(), retryAfterMs: z.number().int().nonnegative().nullable(), error: z.string().nullable() })
])
export type ChannelGatewayToCore = z.infer<typeof ChannelGatewayToCore>
