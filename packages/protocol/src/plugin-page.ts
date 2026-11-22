import { z } from 'zod'
import { UiLocale } from './localization'
import { PluginPageMethod } from './plugin'

// What a plugin's page and the desktop framing it say to each other over postMessage. The page is
// the plugin's own code in a sandboxed frame: it reaches nothing but this bridge, and every message
// carries the token the desktop gave the frame in its URL fragment.
export const PLUGIN_PAGE_SCHEME = 'antumi-plugin'
export const MAX_PLUGIN_PAGE_STATE = 32 * 1024
// Room for a picture a page hands its backend to upload, compressed to a few megabytes first.
export const MAX_PLUGIN_PAGE_PARAMS = 3 * 1024 * 1024

// The app's look, for a page to match: the colour scheme and the design tokens by their CSS names.
export const PluginPageTheme = z.object({ scheme: z.enum(['light', 'dark']), variables: z.record(z.string().max(64), z.string().max(500)) })
export type PluginPageTheme = z.infer<typeof PluginPageTheme>

const Token = z.object({ antumiPluginPage: z.string() })
export const PluginPageFrameMessage = z.intersection(Token, z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  // To the plugin's own backend; answered by a response with the same id.
  z.object({ kind: z.literal('call'), id: z.number().int(), method: PluginPageMethod, params: z.unknown() }),
  // A link the user followed, for the app's browser: http and https alone.
  z.object({ kind: z.literal('open'), url: z.string().max(4096) }),
  // The little the page keeps between visits; replaces what it kept before.
  z.object({ kind: z.literal('state'), value: z.unknown() }),
  // A key chord pressed inside the frame, where the app cannot hear it, so its shortcuts still work.
  z.object({ kind: z.literal('key'), key: z.string().max(32), code: z.string().max(32), meta: z.boolean(), ctrl: z.boolean(), alt: z.boolean(), shift: z.boolean() }),
  // Back to the conversations.
  z.object({ kind: z.literal('leave') })
]))
export type PluginPageFrameMessage = z.infer<typeof PluginPageFrameMessage>

export const PluginPageHostMessage = z.intersection(Token, z.discriminatedUnion('kind', [
  // The answer to ready.
  z.object({ kind: z.literal('init'), theme: PluginPageTheme, state: z.unknown(), locale: UiLocale }),
  z.object({ kind: z.literal('theme'), theme: PluginPageTheme }),
  // Whether the page is on screen. A page the user left may stay loaded but hidden for a while;
  // it is told, and the SDK reports it through document.visibilityState.
  z.object({ kind: z.literal('visibility'), visible: z.boolean() }),
  z.object({ kind: z.literal('response'), id: z.number().int(), result: z.unknown().optional(), error: z.string().max(2000).optional() })
]))
export type PluginPageHostMessage = z.infer<typeof PluginPageHostMessage>

// What a page asked to keep, if it is JSON within the limit.
export function pluginPageState(raw: unknown): unknown {
  try {
    const text = JSON.stringify(raw)
    // Bytes, as the SDK counts them: a page's text is rarely ASCII.
    if (!text || new TextEncoder().encode(text).length > MAX_PLUGIN_PAGE_STATE) return null
    const parsed = z.json().safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch { return null }
}
