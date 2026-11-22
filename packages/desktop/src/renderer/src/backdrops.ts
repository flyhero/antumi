// Experimental: a gradient the window's frame is drawn on, behind the sidebar and status bar, with
// the panes floating over it. Taken from Slack's themes; each is a [data-backdrop] block in
// styles.css. It sits beside the palette rather than replacing it.
export const BACKDROPS = ['sea-glass', 'funky-fresh'] as const
export type Backdrop = (typeof BACKDROPS)[number]

export const BACKDROP_LABEL: Record<Backdrop, string> = {
  'sea-glass': 'Sea Glass',
  'funky-fresh': 'Funky Fresh'
}
