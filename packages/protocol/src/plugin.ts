import { z } from 'zod'
import { SourceCommentOptions, SourceCommentPage, SourceCommentState } from './source-comments'
import { MAX_ATTACHMENT_BYTES, MAX_TASK_IMAGES } from './attachments'
import { LoginNotice, LoginPrompt, SettingField, SourceId, SourceIssue, SourceProblem } from './source'

export const PLUGIN_PROTOCOL_VERSION = 1
export const PluginId = z.string().max(120).regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
export const PluginVersion = z.string().max(80).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/)
export const PluginSource = z.object({ id: SourceId, name: z.string().min(1).max(64), settings: z.array(SettingField).max(32), commentSync: z.literal(1).optional() })
export const PluginManifest = z.object({
  id: PluginId,
  version: PluginVersion,
  engines: z.object({ antumi: z.string().min(1).max(100) }),
  contributes: z.object({ sources: z.array(PluginSource).min(1).max(16) }),
  entry: z.object({ runtime: z.literal('node'), main: z.string().min(1).max(240) }),
  env: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(32).default([])
})

export type PluginManifest = z.infer<typeof PluginManifest>
const ReleaseTagPrefix = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
export const PluginInstallSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local'), path: z.string().min(1).max(4096) }),
  z.object({ kind: z.literal('github'), repository: z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/), tag: z.string().min(1).max(128).optional(), tagPrefix: ReleaseTagPrefix.optional(), asset: z.string().min(1).max(200).optional() })
])
export type PluginInstallSource = z.infer<typeof PluginInstallSource>
export const PluginInfo = z.object({
  id: PluginId, version: PluginVersion, enabled: z.boolean(),
  sources: z.array(PluginSource), versions: z.array(PluginVersion),
  origin: z.union([PluginInstallSource, z.object({ kind: z.literal('bundled') })]),
  problem: z.string().nullable()
})
export type PluginInfo = z.infer<typeof PluginInfo>
export const RecommendedPlugin = z.object({
  id: PluginId, name: z.string().min(1).max(64),
  repository: PluginInstallSource.options[1].shape.repository,
  tagPrefix: ReleaseTagPrefix.optional(),
  asset: PluginInstallSource.options[1].shape.asset,
  previousRepositories: z.array(PluginInstallSource.options[1].shape.repository).optional(),
  description: z.string().max(500), descriptionEn: z.string().max(500)
})
export type RecommendedPlugin = z.infer<typeof RecommendedPlugin>

export const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024
const imageSize = (value: string) => value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0)
const SourceImage = z.object({
  name: z.string().max(4096),
  base64: z.string().max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4)
    .refine((value) => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value) && imageSize(value) <= MAX_ATTACHMENT_BYTES)
})
const SourceImages = z.array(SourceImage).max(MAX_TASK_IMAGES)
  .refine((images) => images.reduce((size, image) => size + imageSize(image.base64), 0) <= MAX_SOURCE_IMAGE_BYTES)

export const PluginCredential = z.object({ kind: z.string().max(32), payload: z.record(z.string(), z.string()) })
export type PluginCredential = z.infer<typeof PluginCredential>
const Settings = z.record(z.string(), z.string())
export const pluginMethods = {
  handshake: { params: z.object({ protocolVersion: z.number().int() }), result: z.object({ protocolVersion: z.literal(PLUGIN_PROTOCOL_VERSION), id: PluginId, version: PluginVersion, sources: z.array(SourceId) }) },
  normalizeSettings: { params: z.object({ source: SourceId, settings: Settings }), result: Settings },
  normalizeKey: { params: z.object({ source: SourceId, key: z.string() }), result: z.string() },
  envCredential: { params: z.object({ source: SourceId }), result: PluginCredential.nullable() },
  login: { params: z.object({ source: SourceId, settings: Settings }), result: z.object({ credential: PluginCredential, account: z.string().max(200) }) },
  list: { params: z.object({ source: SourceId, settings: Settings, credential: PluginCredential }), result: z.array(SourceIssue).max(200) },
  // images false: the issue's text alone, its images fetched by a later call; a plugin that leaves
  // them out says how many in imagesDeferred. Older plugins ignore it and send the images anyway.
  comments: { params: SourceCommentOptions.extend({ source: SourceId, settings: Settings, credential: PluginCredential, key: z.string() }), result: SourceCommentPage },
  // One image a comment names (SourceComment.images), asked for only when the comment goes to an agent.
  image: { params: z.object({ source: SourceId, settings: Settings, credential: PluginCredential, key: z.string(), id: z.string().min(1).max(500) }), result: SourceImage },
  fetch: {
    params: z.object({ source: SourceId, settings: Settings, credential: PluginCredential, key: z.string(), images: z.boolean().optional() }),
    result: SourceIssue.extend({ markdown: z.string().max(50_000), images: SourceImages.optional(), imagesDeferred: z.number().int().nonnegative().max(1000).optional(), commentState: SourceCommentState.optional() })
  }
} as const
export type PluginMethod = keyof typeof pluginMethods
type PluginSchemas = { [M in PluginMethod]: { params: z.ZodType<z.output<(typeof pluginMethods)[M]['params']>>; result: z.ZodType<z.output<(typeof pluginMethods)[M]['result']>> } }
export const pluginSchemas: PluginSchemas = pluginMethods
export type PluginParams<M extends PluginMethod> = z.output<(typeof pluginMethods)[M]['params']>
export type PluginResult<M extends PluginMethod> = z.output<(typeof pluginMethods)[M]['result']>
export const PluginCall = z.object({
  type: z.literal('call'), id: z.string(),
  method: z.enum(['handshake', 'normalizeSettings', 'normalizeKey', 'envCredential', 'login', 'list', 'fetch', 'comments', 'image']),
  params: z.unknown()
})
export const PluginAnswer = z.object({ type: z.literal('answer'), id: z.string(), value: z.string() })
export const PluginMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('result'), id: z.string(), result: z.unknown() }),
  z.object({ type: z.literal('error'), id: z.string(), error: SourceProblem }),
  z.object({ type: z.literal('prompt'), id: z.string(), prompt: LoginPrompt }),
  z.object({ type: z.literal('notify'), notice: LoginNotice })
])
