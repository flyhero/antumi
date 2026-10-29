import path from 'node:path'

export type BrowserPlaces = { platform: NodeJS.Platform; home: string; env: NodeJS.ProcessEnv }

export const CHROMIUM_BROWSERS: ReadonlyArray<{
  id: string
  name: string
  applications: readonly string[]
  dirs: Partial<Record<NodeJS.Platform, string>>
  searchHomepage: string | null
}> = [
  { id: 'chrome', name: 'Google Chrome', applications: ['googlechrome', 'chrome'], dirs: { darwin: 'Google/Chrome', win32: 'Google/Chrome/User Data', linux: 'google-chrome' }, searchHomepage: 'https://www.google.com/' },
  { id: 'edge', name: 'Microsoft Edge', applications: ['microsoftedge', 'msedge'], dirs: { darwin: 'Microsoft Edge', win32: 'Microsoft/Edge/User Data', linux: 'microsoft-edge' }, searchHomepage: 'https://www.bing.com/' },
  { id: 'brave', name: 'Brave', applications: ['brave', 'bravebrowser'], dirs: { darwin: 'BraveSoftware/Brave-Browser', win32: 'BraveSoftware/Brave-Browser/User Data', linux: 'BraveSoftware/Brave-Browser' }, searchHomepage: 'https://search.brave.com/' },
  { id: 'arc', name: 'Arc', applications: ['arc'], dirs: { darwin: 'Arc/User Data' }, searchHomepage: null },
  { id: 'vivaldi', name: 'Vivaldi', applications: ['vivaldi', 'vivaldistable'], dirs: { darwin: 'Vivaldi', win32: 'Vivaldi/User Data', linux: 'vivaldi' }, searchHomepage: null },
  { id: 'chromium', name: 'Chromium', applications: ['chromium', 'chromiumbrowser'], dirs: { darwin: 'Chromium', win32: 'Chromium/User Data', linux: 'chromium' }, searchHomepage: 'https://www.google.com/' }
]

export function browserDataRoot({ platform, home, env }: BrowserPlaces): string | null {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support')
  if (platform === 'win32') return env.LOCALAPPDATA ?? null
  if (platform === 'linux') return env.XDG_CONFIG_HOME ?? path.join(home, '.config')
  return null
}

export function browserApplicationId(application: string): string {
  return application.toLowerCase().replace(/\.(?:desktop|app)$/, '').replace(/[^a-z0-9]/g, '')
}

export function validBrowserProfileDir(dir: string): boolean {
  return dir !== '' && !dir.includes('..') && !/[\\/]/.test(dir)
}
