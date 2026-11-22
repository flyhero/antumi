import { translatedText, type PluginInfo, type PluginPage, type UiLocale } from '@antumi/protocol'

// A page a plugin ships, by its plugin's id and its own.
export type PluginPageRef = { plugin: string; page: string }

// The pages there are to open: those of the enabled plugins, in the order core lists them.
export function availablePluginPages(plugins: readonly PluginInfo[] | null): Array<PluginPageRef & { version: string; info: PluginPage }> {
  return (plugins ?? []).filter((plugin) => plugin.enabled).flatMap((plugin) => plugin.pages.map((info) => ({ plugin: plugin.id, page: info.id, version: plugin.version, info })))
}

export function findPluginPage(plugins: readonly PluginInfo[] | null, ref: PluginPageRef): (PluginPageRef & { version: string; info: PluginPage }) | null {
  return availablePluginPages(plugins).find((entry) => entry.plugin === ref.plugin && entry.page === ref.page) ?? null
}

export function pluginPageLabel(page: PluginPage, locale: UiLocale): string {
  return translatedText(page, locale).label || page.label
}

// Where a page keeps what it asked to between visits, on this computer.
export function pluginPageStateKey(ref: PluginPageRef): string {
  return `antumi.pluginPage:${ref.plugin}:${ref.page}`
}

// A page left stays loaded, hidden, for a while: coming back within it finds the page as it was.
// Past that, or past the few kept, it is unloaded and starts afresh from its saved state.
export const PLUGIN_PAGE_KEEP_MS = 10 * 60_000
export const PLUGIN_PAGES_KEPT = 3
export type KeptPluginPage = PluginPageRef & { leftAt: number | null }

const same = (a: PluginPageRef, b: PluginPageRef) => a.plugin === b.plugin && a.page === b.page

// The pages to keep now, most recent first: the open one (if any) with leftAt null.
export function keptPluginPages(kept: readonly KeptPluginPage[], open: PluginPageRef | null, now: number): KeptPluginPage[] {
  const left = kept.filter((entry) => !open || !same(entry, open)).map((entry) => entry.leftAt === null ? { ...entry, leftAt: now } : entry)
  const fresh = left.filter((entry) => entry.leftAt !== null && now - entry.leftAt < PLUGIN_PAGE_KEEP_MS)
  return [...(open ? [{ plugin: open.plugin, page: open.page, leftAt: null }] : []), ...fresh].slice(0, PLUGIN_PAGES_KEPT)
}

// When the next kept page runs out of time, if one will.
export function nextPluginPageExpiry(kept: readonly KeptPluginPage[]): number | null {
  const times = kept.flatMap((entry) => entry.leftAt === null ? [] : [entry.leftAt + PLUGIN_PAGE_KEEP_MS])
  return times.length ? Math.min(...times) : null
}
