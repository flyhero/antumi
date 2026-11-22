import { useEffect, useState } from 'react'
import { useCore } from '../core-store'
import { findPluginPage, keptPluginPages, nextPluginPageExpiry, type KeptPluginPage, type PluginPageRef } from '../plugin-pages'
import { PluginPageView } from './PluginPageView'

// The plugin pages loaded now: the open one shown, the ones left recently hidden but running, so
// coming back to one finds it as it was. They live outside the main pane's switch, which would
// unload them on every move.
export function PluginPageStack({ open }: { open: PluginPageRef | null }) {
  const plugins = useCore((s) => s.plugins)
  const openKey = open ? `${open.plugin}/${open.page}` : null
  const [kept, setKept] = useState<KeptPluginPage[]>(() => keptPluginPages([], open, Date.now()))
  // Updated while rendering, not after: the page opened must not miss a frame.
  const [keptFor, setKeptFor] = useState(openKey)
  if (keptFor !== openKey) {
    setKeptFor(openKey)
    setKept(keptPluginPages(kept, open, Date.now()))
  }

  const expiry = nextPluginPageExpiry(kept)
  useEffect(() => {
    if (expiry === null) return
    const timer = setTimeout(() => setKept((previous) => keptPluginPages(previous, open, Date.now())), Math.max(0, expiry - Date.now()))
    return () => clearTimeout(timer)
  }, [expiry, openKey])

  return <>
    {kept.filter((entry) => findPluginPage(plugins, entry)).map((entry) => (
      <PluginPageView key={`${entry.plugin}/${entry.page}`} plugin={entry.plugin} page={entry.page} visible={entry.leftAt === null} />
    ))}
  </>
}
