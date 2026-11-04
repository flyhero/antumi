import icons from 'lucide/dist/umd/lucide.min.js?raw'
import runtime from './visualization-runtime.js?raw'
import styles from './visualization-runtime.css?raw'
import { VISUALIZATION_POLICY as policy } from '../../shared/visualization-policy'

function script(text: string): string {
  return `<script>${text.replace(/<\/script/gi, '<\\/script')}</script>`
}

export type VisualizationTheme = { scheme: 'light' | 'dark'; variables: Record<string, string> }

export function visualizationTheme(element: HTMLElement): VisualizationTheme {
  const computed = getComputedStyle(element)
  const colors: Record<string, string> = {}
  // Resolve light-dark() through a real property before passing tokens across the sandbox.
  const probe = document.createElement('span')
  element.append(probe)
  for (const [name, token] of Object.entries({ background: '--surface', foreground: '--text', card: '--surface', 'card-foreground': '--text', muted: '--fill', 'muted-foreground': '--text-muted', primary: '--text', 'primary-foreground': '--surface', secondary: '--fill-2', 'secondary-foreground': '--text', accent: '--accent-bg', 'accent-foreground': '--accent', destructive: '--danger', border: '--border-2', input: '--border-2', ring: '--focus', blue: '--info', orange: '--warning', green: '--status-done', red: '--danger', purple: '--graph-4', yellow: '--warning' })) {
    probe.style.color = `var(${token})`
    colors[`--${name}`] = getComputedStyle(probe).color
  }
  probe.remove()
  return { scheme: computed.colorScheme === 'dark' || computed.colorScheme.includes('dark') && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', variables: { ...colors, '--font-family': computed.fontFamily, '--font-size-base': '14px', '--viz-series-1': colors['--blue'] ?? '', '--viz-series-2': colors['--orange'] ?? '', '--viz-series-3': colors['--green'] ?? '', '--viz-series-4': colors['--purple'] ?? '', '--viz-series-5': colors['--red'] ?? '', '--viz-series-6': colors['--yellow'] ?? '' } }
}

export function visualizationDocument(fragment: string, bridgeId: string, theme: VisualizationTheme, state: unknown): string {
  const parsed = new DOMParser().parseFromString(fragment, 'text/html')
  parsed.querySelectorAll('base, meta[http-equiv="refresh" i]').forEach((element) => element.remove())
  const config = JSON.stringify({ bridgeId, theme, state }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  return `<!doctype html><html lang="${document.documentElement.lang || 'en'}" style="color-scheme:${theme.scheme}"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><script type="application/json" id="antumi-visualization-config">${config}</script>${script(icons)}${script(runtime)}${parsed.head.innerHTML}</head><body>${parsed.body.innerHTML}</body></html>`
}
