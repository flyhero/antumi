import { z } from 'zod'
import { SourceCommentState } from './source-comments'
import { TextTranslations } from './localization'
import { TaskImage } from './attachments'
import { AgentKind } from './agent'

// Where tasks can come from besides being written by hand: an issue tracker, reached through a
// source provider. A provider may be configured more than once (two Jira sites); each is an instance.

// Provider and instance ids end up in file keys and task records, so they stay plain.
export const SOURCE_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
export const SourceId = z.string().regex(SOURCE_ID_PATTERN)
export const DEFAULT_INSTANCE = 'default'

// Issue keys come from the tracker; core re-checks every one before it reaches a URL or branch name.
export const SOURCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/#-]{0,159}$/
export const SourceKey = z.string().regex(SOURCE_KEY_PATTERN)

export const MAX_ISSUE_TITLE_LENGTH = 200
export const MAX_SNAPSHOT_LENGTH = 50_000

export const TaskSource = z.object({
  provider: SourceId,
  instance: SourceId,
  // The provider's display name when the task was imported, so it still reads right if the provider goes away.
  name: z.string().max(64),
  key: SourceKey,
  // Captured separately from an editable task or conversation title.
  title: z.string().max(MAX_ISSUE_TITLE_LENGTH).optional(),
  url: z.string().max(2000)
})
export type TaskSource = z.infer<typeof TaskSource>

// The issue as the tracker had it: untrusted text, kept apart from the details the user writes.
export const SourceSnapshot = z.object({
  markdown: z.string().max(MAX_SNAPSHOT_LENGTH),
  fetchedAt: z.number(),
  imagesFetchedAt: z.number().optional(),
  commentState: SourceCommentState.optional(),
  // The issue's own images, stored by core; untrusted like the text.
  images: z.array(TaskImage).default([])
})
export type SourceSnapshot = z.infer<typeof SourceSnapshot>

const Choice = z.object({ value: z.string(), label: z.string(), translations: TextTranslations.optional() })

// A provider's non-secret settings (a site, a query), rendered by every client the same way.
export const SettingField = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/),
  type: z.enum(['text', 'url', 'textarea', 'select']),
  label: z.string(),
  translations: TextTranslations.optional(),
  placeholder: z.string().optional(),
  hint: z.string().optional(),
  required: z.boolean(),
  default: z.string().optional(),
  options: z.array(Choice).optional(),
  mono: z.boolean().optional(),
  // Changing it signs the instance out: a credential must not follow a typo to another host.
  bindsCredential: z.boolean().optional()
})
export type SettingField = z.infer<typeof SettingField>

// The whole vocabulary a sign-in flow has for talking to the user. A client that renders one flow
// renders them all, whether it is an API token, a password exchange or a device code.
export const LoginPrompt = z.object({
  kind: z.enum(['text', 'secret', 'select']),
  label: z.string(),
  translations: TextTranslations.optional(),
  hint: z.string().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.array(Choice).optional(),
  link: z.object({ url: z.string(), label: z.string(), translations: TextTranslations.optional() }).optional(),
  // Why the previous answer was not accepted.
  error: z.string().optional()
})
export type LoginPrompt = z.infer<typeof LoginPrompt>

export const LoginNotice = z.object({
  message: z.string(),
  translations: TextTranslations.optional(),
  url: z.string().optional(),
  code: z.string().optional()
})
export type LoginNotice = z.infer<typeof LoginNotice>

// What a client may know about a credential: never its value.
export const CredentialStatus = z.object({
  configured: z.boolean(),
  source: z.enum(['env', 'store']).nullable(),
  account: z.string().nullable()
})
export type CredentialStatus = z.infer<typeof CredentialStatus>

export const AutoInvestigationConfig = z.object({
  enabled: z.boolean().default(false),
  projectPaths: z.array(z.string().trim().min(1)).max(10).default([]),
  agent: AgentKind.nullable().default(null),
  model: z.string().min(1).max(200).optional(),
  effort: z.string().min(1).max(100).optional(),
  modelProvider: z.string().min(1).max(100).optional(),
  note: z.string().trim().max(100000).default(''),
  dailyLimit: z.number().int().min(1).max(100).default(10)
})
export type AutoInvestigationConfig = z.infer<typeof AutoInvestigationConfig>

export const AutoInvestigationStatus = z.enum(['queued', 'preparing', 'running', 'waiting-user', 'retry-wait', 'completed', 'failed', 'skipped', 'cancelled', 'handed-over'])
export const AutoInvestigationRun = z.object({
  id: z.string().uuid(), provider: SourceId, instance: SourceId, key: SourceKey,
  title: z.string(), url: z.string(), status: AutoInvestigationStatus,
  conversationId: z.string().uuid().nullable(),
  reason: z.string().nullable(), message: z.string().nullable(),
  attempts: z.number().int().nonnegative(), retryAt: z.number().nullable(),
  createdAt: z.number(), updatedAt: z.number(), startedAt: z.number().nullable(),
  canRetry: z.boolean()
})
export type AutoInvestigationRun = z.infer<typeof AutoInvestigationRun>
export const AutoInvestigationSummary = z.object({
  baselineReady: z.boolean(), today: z.number().int(), queued: z.number().int(),
  reason: z.string().nullable(), message: z.string().nullable(), resetsAt: z.number(),
  possiblyTruncated: z.boolean()
})
export type AutoInvestigationSummary = z.infer<typeof AutoInvestigationSummary>
export const AutoInvestigationInfo = z.object({ config: AutoInvestigationConfig, summary: AutoInvestigationSummary })
export type AutoInvestigationInfo = z.infer<typeof AutoInvestigationInfo>
export const AutoInvestigationPage = z.object({ items: z.array(AutoInvestigationRun), nextCursor: z.string().nullable() })

export const SourceInstanceInfo = z.object({
  instance: SourceId,
  enabled: z.boolean(),
  settings: z.record(z.string(), z.string()),
  credential: CredentialStatus,
  autoInvestigation: AutoInvestigationInfo.optional()
})
export type SourceInstanceInfo = z.infer<typeof SourceInstanceInfo>

export const SourceDescriptor = z.object({
  provider: SourceId,
  name: z.string(),
  settings: z.array(SettingField),
  instances: z.array(SourceInstanceInfo)
})
export type SourceDescriptor = z.infer<typeof SourceDescriptor>

export const ISSUE_STATUS_CATEGORIES = ['todo', 'doing', 'done', 'unknown'] as const

export const SourceIssue = z.object({
  key: SourceKey,
  title: z.string().max(MAX_ISSUE_TITLE_LENGTH),
  url: z.string().max(2000),
  status: z.string().max(100),
  statusCategory: z.enum(ISSUE_STATUS_CATEGORIES),
  type: z.string().max(100),
  priority: z.string().max(100).nullable(),
  updatedAt: z.number().nullable(),
  // The latest conversation opened to look into it, while that conversation is kept. Older cores
  // leave it out.
  conversationId: z.string().uuid().nullable().optional(),
  autoInvestigation: AutoInvestigationRun.optional()
})
export type SourceIssue = z.infer<typeof SourceIssue>

// Reading an issue does not attach it to a task or a conversation.
export const SourceIssuePreview = z.object({
  issue: SourceIssue,
  snapshot: SourceSnapshot,
  imagesDeferred: z.number().int().nonnegative(),
  commentsSupported: z.boolean()
})
export type SourceIssuePreview = z.infer<typeof SourceIssuePreview>

export const SOURCE_FAILURES = [
  'not-configured',
  'invalid-settings',
  'auth-failed',
  'forbidden',
  'bad-query',
  'not-found',
  'request-failed',
  'response-too-large',
  'login-cancelled',
  'login-timeout'
] as const
export const SourceFailure = z.enum(SOURCE_FAILURES)
export type SourceFailure = z.infer<typeof SourceFailure>

export const SourceProblem = z.object({ code: SourceFailure, message: z.string() })
export type SourceProblem = z.infer<typeof SourceProblem>

export const SourceInbox = z.object({
  provider: SourceId,
  instance: SourceId,
  // Enabled and signed in, so it is being synced.
  active: z.boolean(),
  // Matching issues no task was imported from and the user has not dismissed.
  items: z.array(SourceIssue),
  dismissed: z.array(SourceIssue),
  refreshedAt: z.number().nullable(),
  refreshing: z.boolean(),
  // The last refresh failed; `items` keeps what the one before it found.
  problem: SourceProblem.nullable(),
  autoInvestigation: AutoInvestigationInfo.optional()
})
export type SourceInbox = z.infer<typeof SourceInbox>

export function sourceLabel(source: Pick<TaskSource, 'name' | 'key'>): string {
  return `${source.name} ${source.key}`
}
