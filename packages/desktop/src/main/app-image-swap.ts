import { constants } from 'node:fs'
import { access, chmod, copyFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

// Where a new AppImage waits, beside the one it replaces: a rename within one folder is atomic.
export function stagedAppImage(appImage: string): string {
  return join(dirname(appImage), `.${basename(appImage)}.update`)
}

// Why the AppImage cannot replace itself, or null when it can. An app installed from the deb has
// no $APPIMAGE: its package manager owns it. One in a folder the user may not write needs root.
export async function appImageBlocked(appImage: string | undefined): Promise<string | null> {
  if (!appImage) return 'not-appimage'
  try {
    await access(dirname(appImage), constants.W_OK)
    return null
  } catch {
    return 'not-writable'
  }
}

// Puts the downloaded AppImage in place of the running one under the same name, so launchers and
// shortcuts that point at it start the new version. The running one keeps the old file open.
export async function replaceAppImage(appImage: string, downloaded: string): Promise<void> {
  const staged = stagedAppImage(appImage)
  await rm(staged, { force: true })
  try {
    await copyFile(downloaded, staged)
    await chmod(staged, 0o755)
    await rename(staged, appImage)
  } catch (error) {
    await rm(staged, { force: true }).catch(() => {})
    throw error
  }
}
