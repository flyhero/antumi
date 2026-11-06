import type { LoginNotice, LoginPrompt, SourceIssue } from '../../protocol/src/source.js'
import type { SourceCommentOptions, SourceCommentPage } from '../../protocol/src/source-comments.js'
import type { PluginCredential, PluginResult } from '../../protocol/src/plugin.js'

export type SourceSettings = Readonly<Record<string, string>>
export type SourceCredential = PluginCredential
export type SourceIssueDetail = Omit<PluginResult<'fetch'>, 'images'> & { images?: readonly { name: string; bytes: Uint8Array }[] }
export type SourceFetchOptions = { images: boolean }
export type LoginSession = {
  prompt(prompt: LoginPrompt): Promise<string>
  notify(notice: LoginNotice): void
}

export type SourcePlugin = {
  readonly id: string
  comments?(settings: SourceSettings, credential: SourceCredential, key: string, signal: AbortSignal, options: SourceCommentOptions): Promise<SourceCommentPage>
  normalizeSettings(values: SourceSettings): Record<string, string> | Promise<Record<string, string>>
  normalizeKey?(key: string): string | Promise<string>
  envCredential?(env: Readonly<Record<string, string | undefined>>): SourceCredential | null
  login(session: LoginSession, settings: SourceSettings, signal: AbortSignal): Promise<{ credential: SourceCredential; account: string }>
  list(settings: SourceSettings, credential: SourceCredential, signal: AbortSignal): Promise<SourceIssue[]>
  // images false: Antumi wants the issue's text at once and asks for the images in a later call; a
  // plugin that honours it leaves them out and counts them in imagesDeferred. Absent means true.
  fetch(settings: SourceSettings, credential: SourceCredential, key: string, signal: AbortSignal, options?: SourceFetchOptions): Promise<SourceIssueDetail>
}
