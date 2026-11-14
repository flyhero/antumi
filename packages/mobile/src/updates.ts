import * as Application from 'expo-application'
import * as Device from 'expo-device'
import { PROJECT_GITHUB_REPOSITORY } from '@antumi/protocol'
import { z } from 'zod'
import { create } from 'zustand'
import { releaseApk } from './release-apk'
import { loadUpdateCheck, saveUpdateCheck, type UpdateCheck } from './storage'

// The app is not in a store: a newer APK is a GitHub release tagged mobile-v<version>, one APK per
// architecture (release-apk.ts).

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
    const apk = releaseApk(release.assets, Device.supportedCpuArchitectures)
    if (!apk) continue
    const version = release.tag_name.slice('mobile-v'.length)
    return newer(version, currentVersion()) ? { version, url: apk.browser_download_url } : null
  }
  return null
}

const DAY_MS = 24 * 60 * 60 * 1000

// A newer version found, by the daily check or by hand, and the one whose banner the user closed.
export const useUpdate = create<{ found: Update | null; dismissed: string | null }>()(() => ({ found: null, dismissed: null }))

let saved: UpdateCheck = { checkedAt: 0, found: null, dismissed: null }

async function keep(change: Partial<UpdateCheck>): Promise<void> {
  saved = { ...saved, ...change }
  useUpdate.setState({ found: saved.found, dismissed: saved.dismissed })
  await saveUpdateCheck(saved).catch(() => {})
}

// On opening the app, at most once a day: GitHub lets an address ask 60 times an hour without
// signing in. A version found earlier stays shown until this one is as new; failing says nothing.
export async function checkDaily(now = Date.now()): Promise<void> {
  saved = await loadUpdateCheck()
  const found = saved.found && newer(saved.found.version, currentVersion()) ? saved.found : null
  await keep({ found })
  if (now - saved.checkedAt < DAY_MS) return
  try {
    await keep({ found: await checkForUpdate(), checkedAt: now })
  } catch {
    // Offline or rate limited: tried again next time the app opens.
  }
}

// By hand from settings: what it finds shows everywhere, as the daily check's does.
export async function checkNow(): Promise<Update | null> {
  const found = await checkForUpdate()
  await keep({ found, checkedAt: Date.now() })
  return found
}

// Closed, the banner stays away for this version; a newer one brings it back.
export function dismissUpdate(version: string): void {
  void keep({ dismissed: version })
}
