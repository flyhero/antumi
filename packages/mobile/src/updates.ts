import * as Application from 'expo-application'
import { PROJECT_GITHUB_REPOSITORY } from '@antumi/protocol'
import { z } from 'zod'

// The app is not in a store: a newer APK is a GitHub release tagged mobile-v<version>.

const Release = z.object({
  tag_name: z.string(),
  draft: z.boolean().catch(false),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })).catch([])
})

export type Update = { version: string; url: string }

function newer(a: string, b: string): boolean {
  const parse = (version: string) => version.split(/[.-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0)
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

export function currentVersion(): string {
  return Application.nativeApplicationVersion ?? '0.0.0'
}

// null when this is the newest; throws when GitHub cannot be asked.
export async function checkForUpdate(): Promise<Update | null> {
  const response = await fetch(`https://api.github.com/repos/${PROJECT_GITHUB_REPOSITORY}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const releases = z.array(Release).parse(await response.json())
  for (const release of releases) {
    if (release.draft || !release.tag_name.startsWith('mobile-v')) continue
    const apk = release.assets.find((asset) => asset.name.endsWith('.apk'))
    if (!apk) continue
    const version = release.tag_name.slice('mobile-v'.length)
    return newer(version, currentVersion()) ? { version, url: apk.browser_download_url } : null
  }
  return null
}
