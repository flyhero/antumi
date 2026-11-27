import { z } from 'zod'
import { AgentKind } from './agent'
import { TaskLaunchOptions } from './chat'
import { MAX_TASK_REPOS } from './task-limits'

// An agent on a chat platform (docs/CHANNELS.md): colleagues ask it questions there, and it answers
// from the projects it is given, locked down. What core and the desktop share about it, zod only.

export const CHANNEL_PLATFORMS = ['slack', 'feishu', 'lark', 'dingtalk'] as const
export const ChannelPlatform = z.enum(CHANNEL_PLATFORMS)
export type ChannelPlatform = z.infer<typeof ChannelPlatform>

export const ChannelState = z.enum(['off', 'connecting', 'connected', 'failed'])
export type ChannelState = z.infer<typeof ChannelState>

// A user, a chat or a workspace as its platform names it: opaque to core.
const PlatformId = z.string().trim().min(1).max(200)

export const CHANNEL_DEFAULTS = { dailyPerUser: 20, dailyTotal: 200, maxConcurrent: 2, turnTimeoutSec: 300 } as const

// Its tasks on the platform's cards (docs/CHANNEL-LOOP.md): start, the owner starts one there with
// this agent and model (null: started in Antumi only); review, who may accept it or send it back
// there (null: accepted in Antumi only). Running it as the owner always takes the owner's click.
export const TaskCardStart = TaskLaunchOptions.pick({ model: true, effort: true, modelProvider: true }).extend({ agent: AgentKind })
export type TaskCardStart = z.infer<typeof TaskCardStart>
export const TaskCardReview = z.enum(['owner', 'ownerOrAsker'])
export type TaskCardReview = z.infer<typeof TaskCardReview>
export const TaskCards = z.object({ start: TaskCardStart.nullable(), review: TaskCardReview.nullable() })
export type TaskCards = z.infer<typeof TaskCards>

// Where a document the bot creates goes (docs/CHANNEL-LOOP.md): under a wiki node (its link or
// token), at a wiki space's root, or in a folder. The agent cannot pick another place.
export const DocLocation = z.object({ kind: z.enum(['wikiNode', 'wikiSpace', 'folder']), value: z.string().trim().min(1).max(500) })
export type DocLocation = z.infer<typeof DocLocation>
export const DocAccess = z.enum(['edit', 'view', 'none'])
export type DocAccess = z.infer<typeof DocAccess>
// Pictures taken from one question; the rest are left out and the answer says so.
export const MAX_CHANNEL_IMAGES = 4
// However long the agent's instructions let an answer run, no more than this is posted.
export const MAX_CHANNEL_ANSWER_CHARS = 12_000

// What the user sets. Who may ask is closed until named: no user, no place.
export const ChannelFields = z.object({
  profileId: z.string().uuid(),
  platform: ChannelPlatform,
  enabled: z.boolean().default(true),
  // The only folders its answers may read from: git repos among the recent projects.
  projectPaths: z.array(z.string().trim().min(1)).max(MAX_TASK_REPOS).default([]),
  allowedUsers: z.array(PlatformId).max(500).default([]),
  // Group chats it answers in when mentioned.
  allowedPlaces: z.array(PlatformId).max(200).default([]),
  // Whether an allowed user may also ask it in a direct message.
  allowDirect: z.boolean().default(false),
  // Only collecting work; never permission to start it.
  allowTaskCreation: z.boolean().optional(),
  // A task collected here is followed back in the thread it came from: started, handed in, done.
  // Absent is off, so a channel saved before this keeps posting what it did.
  reportTasks: z.boolean().optional(),
  // The owner on the platform: whose click on a card counts as the owner's (and their stand-ins').
  ownerUsers: z.array(PlatformId).max(20).optional(),
  // Absent or null: no cards, progress as plain posts.
  taskCards: TaskCards.nullable().optional(),
  // The platform's own tools the agent may use as the bot, by their names there (create-doc). Absent or none: no such tool.
  platformTools: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  docLocation: DocLocation.nullable().optional(),
  // What the asker may do with a document the bot created for them. Absent: edit.
  docAccess: DocAccess.optional(),
  // In a thread the bot answered and only the asker has spoken in, the asker goes on without
  // mentioning it. Needs the platform to deliver every group message. Absent: off.
  followUps: z.boolean().optional(),
  dailyPerUser: z.number().int().min(1).max(500).default(CHANNEL_DEFAULTS.dailyPerUser),
  dailyTotal: z.number().int().min(1).max(10_000).default(CHANNEL_DEFAULTS.dailyTotal),
  maxConcurrent: z.number().int().min(1).max(5).default(CHANNEL_DEFAULTS.maxConcurrent),
  turnTimeoutSec: z.number().int().min(30).max(1800).default(CHANNEL_DEFAULTS.turnTimeoutSec)
})
export type ChannelFields = z.infer<typeof ChannelFields>

// A credential's name on its platform's descriptor (channel-platforms.ts).
export const ChannelCredentialKey = z.enum(['appToken', 'botToken', 'appId', 'appSecret'])
export type ChannelCredentialKey = z.infer<typeof ChannelCredentialKey>

// As clients see one: which credentials are stored, never their values.
export const Channel = ChannelFields.extend({
  id: z.string().uuid(),
  stored: z.array(ChannelCredentialKey),
  // The workspace it is connected to and the bot it is there, as the platform said on connecting.
  tenant: z.string().nullable(),
  tenantName: z.string().nullable(),
  botUserId: z.string().nullable(),
  state: ChannelState,
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Channel = z.infer<typeof Channel>

// Saving one: without an id, a new one. A credential left out or null keeps what is stored.
export const ChannelInput = ChannelFields.extend({
  id: z.string().uuid().optional(),
  credentials: z.partialRecord(ChannelCredentialKey, z.string().trim().min(1).max(500).nullable()).optional()
})
export type ChannelInput = z.input<typeof ChannelInput>

// refused: turned away before any agent ran (refusal says why: 'acl', 'quota'). timeout: stopped
// for running too long.
export const ChannelRequestState = z.enum(['queued', 'running', 'answered', 'failed', 'refused', 'timeout'])
export type ChannelRequestState = z.infer<typeof ChannelRequestState>

// One question asked of it, kept as its record: who, where, what came of it.
export const ChannelRequest = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  asker: z.string(),
  place: z.string(),
  direct: z.boolean(),
  text: z.string(),
  images: z.number().int().nonnegative(),
  state: ChannelRequestState,
  refusal: z.string().nullable(),
  // The owner's diagnostic, never posted to the platform. Older cores leave it out.
  error: z.string().nullable().optional(),
  // The rejection behind it when core named one (daemon-outdated), for a client to explain.
  errorReason: z.string().nullable().optional(),
  // Whether something that looked like a secret was taken out of its answer.
  redacted: z.boolean(),
  conversationId: z.string().uuid().nullable(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  totalTokens: z.number().nullable(),
  toolCalls: z.number().int().nonnegative()
})
export type ChannelRequest = z.infer<typeof ChannelRequest>

// Whether this computer can answer from a chat platform at all: a daemon from before the clean
// start it needs fails every question until it is restarted. pid is that daemon's, to end it by.
export const ChannelReadiness = z.object({ daemon: z.enum(['ready', 'outdated', 'unavailable']), pid: z.number().int().nullable() })
export type ChannelReadiness = z.infer<typeof ChannelReadiness>

// Every tool call goes through core, including task collection and refused calls. write: it may
// have changed something on the platform (a platform tool's write). Older cores leave it out.
export const ChannelToolCall = z.object({ tool: z.string(), target: z.string(), bytes: z.number().int().nonnegative(), at: z.number(), write: z.boolean().optional() })

// A tool as a locked-down agent's MCP server lists it: the registry's, and the platform's ones its channel gives.
export const ChannelToolSpec = z.object({ name: z.string(), description: z.string(), inputSchema: z.record(z.string(), z.unknown()), readOnly: z.boolean() })
export type ChannelToolSpec = z.infer<typeof ChannelToolSpec>
export type ChannelToolCall = z.infer<typeof ChannelToolCall>

// On a conversation opened for a platform's asker: it is locked down, and only core speaks in it.
export const ConversationChannel = z.object({ channelId: z.string().uuid(), platform: ChannelPlatform, asker: z.string(), place: z.string() })
export type ConversationChannel = z.infer<typeof ConversationChannel>

// Captured by core, independently of the agent's summary and the editable task details.
export const TaskChannelSource = z.object({
  channelId: z.string().uuid(),
  requestId: z.string().uuid(),
  conversationId: z.string().uuid(),
  platform: ChannelPlatform,
  tenant: z.string(),
  asker: z.string(),
  place: z.string(),
  messageId: z.string(),
  // Where the answer to it went, which the task's progress goes under too: the thread, and whether
  // the chat was a direct one. Tasks from before have neither, and go under the message itself.
  thread: z.string().nullable().optional(),
  direct: z.boolean().optional(),
  text: z.string(),
  createdAt: z.number()
})
export type TaskChannelSource = z.infer<typeof TaskChannelSource>

// A task from a chat platform, followed back in its thread (docs/CHANNEL-LOOP.md): one post per
// move. created: collected, its card posted (cards only) · start: it began · rework: it went on
// after review · review: handed in, with its summary · done: accepted · closed: done without
// running · abandoned: cancelled.
export const ChannelTaskStage = z.enum(['created', 'start', 'rework', 'review', 'done', 'closed', 'abandoned'])
export type ChannelTaskStage = z.infer<typeof ChannelTaskStage>
// pending: not yet worked out · queued: in the outbox · sent · skipped: not posted, reason says why ·
// failed: the platform would not take it.
export const ChannelTaskReportState = z.enum(['pending', 'queued', 'sent', 'skipped', 'failed'])
export type ChannelTaskReportState = z.infer<typeof ChannelTaskReportState>
export const ChannelTaskReport = z.object({
  id: z.string().uuid(),
  taskId: z.string(),
  channelId: z.string().uuid(),
  stage: ChannelTaskStage,
  state: ChannelTaskReportState,
  reason: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type ChannelTaskReport = z.infer<typeof ChannelTaskReport>

// Why the asker sent a task back on its card, waiting for the owner to go on with it. used: when it
// was handed to the task's agent, null while it waits.
export const MAX_TASK_FEEDBACK = 500
export const ChannelTaskFeedback = z.object({
  id: z.string().uuid(),
  taskId: z.string(),
  channelId: z.string().uuid(),
  author: z.string(),
  text: z.string().max(MAX_TASK_FEEDBACK),
  createdAt: z.number(),
  usedAt: z.number().nullable()
})
export type ChannelTaskFeedback = z.infer<typeof ChannelTaskFeedback>
