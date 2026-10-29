import { z } from 'zod'
import { browserActions, BrowserCaptureOptions, BrowserConsole, BrowserNavigateTo, BrowserNavigationOutcome, BrowserPageContext, BrowserScreenshotOptions, BrowserStatus, BrowserTab, BrowserTabId, BrowserUrl, BrowserViewport } from '../browser'
import { BrowserDownload, BrowserDownloadAction, MAX_BROWSER_UPLOAD_BYTES, SnapshotRef } from '../browser'

// JSON-RPC-shaped lines over a loopback WebSocket between core and the browser host, which the
// desktop app runs in its main process. The app writes where to connect to the host file
// (paths.browserHostFile, owner-only) while it is up, and removes it as it quits.
export const BROWSER_HOST_PROTOCOL_VERSION = 3

export const BrowserHostEndpoint = z.object({
  port: z.number().int(),
  token: z.string().min(1),
  pid: z.number().int(),
  protocolVersion: z.number().int()
})
export type BrowserHostEndpoint = z.infer<typeof BrowserHostEndpoint>

export function browserHostUrl(endpoint: Pick<BrowserHostEndpoint, 'port' | 'token'>): string {
  return `ws://127.0.0.1:${endpoint.port}/?token=${encodeURIComponent(endpoint.token)}`
}

const TabRef = z.object({ tabId: BrowserTabId })
const Ok = z.object({ ok: z.literal(true) })
// The host's own view of a tab: what the user does with it is core's to know.
export const HostTab = BrowserTab.omit({ userDriving: true, agentActing: true })
export type HostTab = z.infer<typeof HostTab>
// An action's result: the tab and a fresh AI-mode aria snapshot of the page.
const ActionResult = z.object({ tab: HostTab, snapshot: z.string() })
// A host the gate has not cleared holds the navigation until core answers (host.resolve).
const NavigationResult = z.object({ tab: HostTab, outcome: BrowserNavigationOutcome, snapshot: z.string().nullable() })

export const browserHostMethods = {
  status: { params: z.object({}), result: BrowserStatus },
  'tabs.list': { params: z.object({}), result: z.object({ tabs: z.array(HostTab) }) },
  // Without a conversation, the tab is the user's own. A viewport holds the tab at that size.
  'tabs.open': { params: z.object({ conversationId: z.string().uuid().optional(), url: BrowserUrl.optional(), viewport: BrowserViewport.nullable().optional() }), result: NavigationResult },
  'tabs.close': { params: TabRef, result: Ok },
  'tabs.closeAll': { params: z.object({ conversationId: z.string().uuid() }), result: Ok },
  'tabs.share': { params: TabRef.extend({ conversationId: z.string().uuid().nullable() }), result: HostTab },
  capture: { params: TabRef.extend(BrowserCaptureOptions.shape), result: BrowserPageContext.omit({ image: true }).extend({ jpeg: z.string().optional() }).nullable() },
  'capture.cancel': { params: TabRef, result: Ok },
  devtools: { params: TabRef, result: Ok },
  navigate: { params: TabRef.extend({ to: BrowserNavigateTo, viewport: BrowserViewport.nullable().optional() }), result: NavigationResult },
  // Holds the tab at a size, or lets it follow the panel again (null).
  viewport: { params: TabRef.extend({ viewport: BrowserViewport.nullable() }), result: Ok },
  snapshot: { params: TabRef, result: ActionResult },
  // A JPEG of the viewport (or the page, or one element), base64; core reads its size as it stores it.
  screenshot: { params: TabRef.extend(BrowserScreenshotOptions.shape), result: z.object({ tab: HostTab, jpeg: z.string() }) },
  click: { params: TabRef.extend(browserActions.click.shape), result: ActionResult },
  type: { params: TabRef.extend(browserActions.type.shape), result: ActionResult },
  press: { params: TabRef.extend(browserActions.press.shape), result: ActionResult },
  hover: { params: TabRef.extend(browserActions.hover.shape), result: ActionResult },
  scroll: { params: TabRef.extend(browserActions.scroll.shape), result: ActionResult },
  select: { params: TabRef.extend(browserActions.select.shape), result: ActionResult },
  wait: { params: TabRef.extend(browserActions.wait.shape), result: ActionResult },
  console: { params: TabRef.extend({ sinceNavigation: z.boolean().optional(), requestId: z.string().max(80).optional() }), result: BrowserConsole },
  upload: { params: TabRef.extend({ ref: SnapshotRef, files: z.array(z.object({ name: z.string().min(1).max(255).regex(/^[^/\\\x00]+$/), mimeType: z.string().min(1).max(200), data: z.string().max(Math.ceil(MAX_BROWSER_UPLOAD_BYTES / 3) * 4) })).min(1).max(10) }), result: ActionResult },
  'downloads.list': { params: z.object({}), result: z.array(BrowserDownload) },
  'downloads.action': { params: z.object({ id: z.string().uuid(), action: BrowserDownloadAction }), result: Ok },
  // Core's answer to a hostCheck event.
  'host.resolve': { params: z.object({ checkId: z.string(), allow: z.boolean() }), result: Ok },
  shutdown: { params: z.object({}), result: Ok }
} as const

export type BrowserHostMethod = keyof typeof browserHostMethods
export type BrowserHostParams<M extends BrowserHostMethod> = z.input<(typeof browserHostMethods)[M]['params']>
export type BrowserHostParsedParams<M extends BrowserHostMethod> = z.output<(typeof browserHostMethods)[M]['params']>
export type BrowserHostResult<M extends BrowserHostMethod> = z.output<(typeof browserHostMethods)[M]['result']>

// Same generic-index narrowing as rpcSchemas.
export const browserHostSchemas: {
  [M in BrowserHostMethod]: {
    params: z.ZodType<BrowserHostParsedParams<M>>
    result: z.ZodType<BrowserHostResult<M>>
  }
} = browserHostMethods

export function isBrowserHostMethod(name: string): name is BrowserHostMethod {
  return Object.hasOwn(browserHostMethods, name)
}

export const BrowserHostRequest = z.object({ id: z.number(), method: z.string(), params: z.unknown() })

export const BrowserHostEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('downloads'), downloads: z.array(BrowserDownload) }),
  z.object({ event: z.literal('status'), status: BrowserStatus }),
  // Every tab the host has, after any change to one of them.
  z.object({ event: z.literal('tabs'), tabs: z.array(HostTab) }),
  // A top-level navigation to a host outside local development ones; held until host.resolve.
  z.object({ event: z.literal('hostCheck'), checkId: z.string(), tabId: BrowserTabId, conversationId: z.string().nullable(), host: z.string(), url: z.string() })
])
export type BrowserHostEvent = z.infer<typeof BrowserHostEvent>

// Error before result, for the same missing-key reason as RpcFrame.
export const BrowserHostInbound = z.union([
  BrowserHostEvent,
  z.object({ id: z.number(), error: z.object({ reason: z.string(), message: z.string() }) }),
  z.object({ id: z.number(), result: z.unknown() })
])
export type BrowserHostInbound = z.infer<typeof BrowserHostInbound>
