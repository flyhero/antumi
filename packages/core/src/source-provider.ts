import type { SourceCommentState, SourceCommentOptions, SourceCommentPage } from '@antumi/protocol'
import type { LoginNotice, LoginPrompt, SettingField, SourceIssue } from '@antumi/protocol'

// The seam a task source plugs into. Core owns everything around it (settings and credential
// storage, polling, the inbox, turning issues into tasks); a provider only talks to its tracker.
// Everything a provider returns is checked again by core before it is used.

export type SourceSettings = Readonly<Record<string, string>>

// Provider-defined authentication, stored per instance; interpreted only by that provider's integrations.
export type SourceCredential = { kind: string; payload: Readonly<Record<string, string>> }

// All a sign-in flow may do with the user. Clients render these, never provider-made UI.
export type LoginSession = {
  prompt(prompt: LoginPrompt): Promise<string>
  notify(notice: LoginNotice): void
}

export type SourceIssueDetail = SourceIssue & {
  // The issue's own text, converted by the provider; it reaches agents only as untrusted data.
  markdown: string
  commentState?: SourceCommentState
  // The issue's images as fetched; core checks each one and stores what passes.
  images?: readonly { name: string; bytes: Uint8Array }[]
  // Images left out because they were not asked for yet (fetch's images: false).
  imagesDeferred?: number
}

export type SourceProvider = {
  readonly id: string
  readonly name: string
  readonly commentSync?: 1
  comments?(settings: SourceSettings, credential: SourceCredential, key: string, signal: AbortSignal, options: SourceCommentOptions): Promise<SourceCommentPage>
  readonly settings: readonly SettingField[]
  // Checks and canonicalizes settings before they are saved; throws SourceError('invalid-settings').
  normalizeSettings(values: SourceSettings): Record<string, string> | Promise<Record<string, string>>
  // Lets users type a key loosely (lower case, spaces); core validates the result.
  normalizeKey?(key: string): string | Promise<string>
  // A credential from the environment, for machines without a UI; applies to the default instance.
  envCredential?(env: NodeJS.ProcessEnv): SourceCredential | null
  // Asks the user through `session` and returns only a credential it has verified.
  login(
    session: LoginSession,
    settings: SourceSettings,
    signal: AbortSignal
  ): Promise<{ credential: SourceCredential; account: string }>
  list(settings: SourceSettings, credential: SourceCredential, signal: AbortSignal): Promise<SourceIssue[]>
  // images false: the text alone, the images left to a later call, if the provider can; one that
  // cannot sends them anyway.
  fetch(settings: SourceSettings, credential: SourceCredential, key: string, signal: AbortSignal, options?: { images: boolean }): Promise<SourceIssueDetail>
}
