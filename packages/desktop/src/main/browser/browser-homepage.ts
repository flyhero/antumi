import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { browserApplicationId, browserDataRoot, CHROMIUM_BROWSERS, validBrowserProfileDir, type BrowserPlaces } from './browser-profiles'

const run = promisify(execFile)
const MAX_FILE_BYTES = 32 * 1024 * 1024

async function readSmall(file: string): Promise<string | null> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return null
  return readFile(file, 'utf8').catch(() => null)
}

async function readJson(file: string): Promise<unknown> {
  const raw = await readSmall(file)
  try { return raw === null ? null : JSON.parse(raw) } catch { return null }
}

// Browser-internal and extension pages belong to their browser, never to Antumi's Chromium.
function pageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 4096 || /[{}]/.test(raw)) return null
  if (raw.trim() === 'about:blank') return 'about:blank'
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

const ProfileState = z.object({ profile: z.object({ last_used: z.string().optional() }).optional() })
const SearchEngine = z.object({ new_tab_url: z.string().optional(), url: z.string().optional() })
const Preferences = z.object({
  homepage: z.string().optional(),
  homepage_is_newtabpage: z.boolean().optional(),
  newtab_page_location_override: z.string().optional(),
  default_search_provider_data: z.object({ template_url_data: SearchEngine.optional() }).optional()
})

function searchHomepage(template: string | undefined): string | null {
  if (!template) return null
  try {
    const url = new URL(template.replaceAll('{google:baseURL}', 'https://www.google.com/'))
    return pageUrl(`${url.origin}/`)
  } catch { return null }
}

async function chromiumHomepage(userData: string, fallback: string | null): Promise<string | null> {
  const state = ProfileState.safeParse(await readJson(path.join(userData, 'Local State')))
  const profile = state.success ? state.data.profile?.last_used ?? 'Default' : 'Default'
  if (!validBrowserProfileDir(profile)) return null
  const [ordinary, secure] = await Promise.all(['Preferences', 'Secure Preferences'].map(async (file) => Preferences.safeParse(await readJson(path.join(userData, profile, file)))))
  if (!ordinary?.success && !secure?.success) return null
  // Chromium can keep protected homepage preferences in Secure Preferences.
  const prefs = { ...(ordinary?.success ? ordinary.data : {}), ...(secure?.success ? secure.data : {}) }
  const newTab = pageUrl(prefs.newtab_page_location_override)
  if (newTab) return newTab
  if (prefs.homepage_is_newtabpage !== true) {
    const homepage = pageUrl(prefs.homepage)
    if (homepage) return homepage
  }
  const engine = prefs.default_search_provider_data?.template_url_data
  return pageUrl(engine?.new_tab_url) ?? searchHomepage(engine?.url) ?? fallback
}

function iniSections(raw: string): Array<{ name: string; values: Record<string, string> }> {
  const sections: Array<{ name: string; values: Record<string, string> }> = []
  let current: Record<string, string> | null = null
  for (const line of raw.split(/\r?\n/).map((line) => line.trim())) {
    if (line.startsWith('[') && line.endsWith(']')) { current = {}; sections.push({ name: line.slice(1, -1), values: current }) }
    else if (current && !line.startsWith(';') && !line.startsWith('#')) {
      const separator = line.indexOf('=')
      if (separator > 0) current[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
    }
  }
  return sections
}

async function firefoxHomepage(places: BrowserPlaces): Promise<string | null> {
  const root = places.platform === 'darwin' ? path.join(places.home, 'Library', 'Application Support', 'Firefox')
    : places.platform === 'win32' ? places.env.APPDATA ? path.join(places.env.APPDATA, 'Mozilla', 'Firefox') : null
    : places.platform === 'linux' ? path.join(places.home, '.mozilla', 'firefox') : null
  if (!root) return null
  const raw = await readSmall(path.join(root, 'profiles.ini'))
  if (!raw) return null
  const sections = iniSections(raw)
  const installed = sections.find((section) => section.name.startsWith('Install') && section.values.Default)?.values.Default
  const profiles = sections.filter((section) => section.name.startsWith('Profile')).map((section) => section.values)
  const selected = profiles.find((section) => section.Default === '1' && section.Path) ?? profiles.find((section) => section.Path)
  const relative = installed ?? selected?.Path
  if (!relative) return null
  const absolute = !installed && selected?.IsRelative === '0'
  if (absolute && !path.isAbsolute(relative)) return null
  if (!absolute && (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..'))) return null
  const profile = absolute ? relative : path.join(root, relative)
  const prefs = await readSmall(path.join(profile, 'prefs.js'))
  if (!prefs) return null
  // prefs.js is data. Parse its string literal; never execute the file.
  const matches = [...prefs.matchAll(/^user_pref\("browser\.startup\.homepage",\s*("(?:[^"\\]|\\.)*")\s*\);\s*$/gm)]
  const literal = matches.at(-1)?.[1]
  if (!literal) return null
  try {
    const value: unknown = JSON.parse(literal)
    return typeof value === 'string' ? pageUrl(value.split('|')[0]) : null
  } catch { return null }
}

async function safariHomepage(places: BrowserPlaces): Promise<string | null> {
  if (places.platform !== 'darwin') return null
  for (const folder of ['Library/Containers/com.apple.Safari/Data/Library/Preferences', 'Library/Preferences']) {
    const file = path.join(places.home, folder, 'com.apple.Safari.plist')
    if (!(await stat(file).catch(() => null))?.isFile()) continue
    const result = await run('/usr/bin/plutil', ['-extract', 'HomePage', 'raw', '-o', '-', file], { timeout: 1500, maxBuffer: 8192 }).catch(() => null)
    const url = pageUrl(result?.stdout.trim())
    if (url) return url
  }
  return null
}

// Read only the default browser's active profile, not every browser installed on the machine.
export async function defaultBrowserHomepage(application: string, places: BrowserPlaces): Promise<string | null> {
  const id = browserApplicationId(application)
  if (id === 'safari') return safariHomepage(places)
  if (id === 'firefox' || id === 'mozillafirefox') return firefoxHomepage(places)
  const browser = CHROMIUM_BROWSERS.find((browser) => browser.applications.includes(id))
  const root = browserDataRoot(places)
  const dir = browser?.dirs[places.platform]
  return browser && root && dir ? chromiumHomepage(path.join(root, dir), browser.searchHomepage) : null
}
