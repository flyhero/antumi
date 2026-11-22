import { z } from 'zod'

const SiteId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)
const SitePath = z.string().min(1).max(4096).refine((value) => value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value))
const SiteOrigin = z.string().max(300).refine((value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password } catch { return false }
})
export const PluginBrowserSite = z.object({
  id: SiteId,
  origin: SiteOrigin,
  requestOrigins: z.array(SiteOrigin).max(8).optional(),
  loginPath: SitePath
})
export type PluginBrowserSite = z.infer<typeof PluginBrowserSite>
export const PluginBrowserRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), site: SiteId }),
  z.object({ action: z.literal('status'), site: SiteId }),
  z.object({ action: z.literal('disconnect'), site: SiteId }),
  z.object({
    action: z.literal('request'), site: SiteId, path: SitePath,
    origin: SiteOrigin.optional(),
    timeoutMs: z.number().int().min(1000).max(40_000).optional(),
    method: z.enum(['GET', 'POST']).default('GET'),
    headers: z.record(z.string().max(80), z.string().max(4096)).default({}),
    // base64: the body is bytes (an upload's multipart form), decoded by the host before sending.
    // Needs a core that declares browser-binary; an older one would send the text as it is.
    bodyEncoding: z.enum(['text', 'base64']).optional(),
    body: z.string().max(4 * 1024 * 1024).optional()
  }).refine((request) => request.bodyEncoding !== 'base64' || /^[A-Za-z0-9+/]*={0,2}$/.test(request.body ?? ''), { message: 'base64 正文格式不对', path: ['body'] })
])
export type PluginBrowserRequest = z.input<typeof PluginBrowserRequest>
export const PluginBrowserResponse = z.object({ status: z.number().int(), headers: z.record(z.string(), z.string()), body: z.string().max(4 * 1024 * 1024) })
export type PluginBrowserResponse = z.infer<typeof PluginBrowserResponse>
export const PluginBrowserResult = z.object({ connected: z.boolean(), tabId: z.string().optional(), response: PluginBrowserResponse.optional() })
export type PluginBrowserResult = z.infer<typeof PluginBrowserResult>
