import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appImageBlocked, replaceAppImage } from './app-image-swap'

describe('AppImage swap', () => {
  const dirs: string[] = []
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

  function folder(): string {
    const dir = mkdtempSync(join(tmpdir(), 'antumi-appimage-test-'))
    dirs.push(dir)
    return dir
  }

  it('puts the new AppImage under the running one\'s name, executable, leaving nothing beside it', async () => {
    const dir = folder()
    const appImage = join(dir, 'Antumi-1.0.0-x86_64.AppImage')
    const downloaded = join(folder(), 'Antumi-1.1.0-x86_64.AppImage')
    writeFileSync(appImage, 'old', { mode: 0o755 })
    writeFileSync(downloaded, 'new', { mode: 0o644 })
    await replaceAppImage(appImage, downloaded)
    expect(readFileSync(appImage, 'utf8')).toBe('new')
    expect(statSync(appImage).mode & 0o777).toBe(0o755)
    expect(readdirSync(dir)).toEqual(['Antumi-1.0.0-x86_64.AppImage'])
  })

  it('leaves the running AppImage alone when the download is missing', async () => {
    const dir = folder()
    const appImage = join(dir, 'Antumi.AppImage')
    writeFileSync(appImage, 'old')
    await expect(replaceAppImage(appImage, join(dir, 'missing.AppImage'))).rejects.toThrow()
    expect(readFileSync(appImage, 'utf8')).toBe('old')
    expect(readdirSync(dir)).toEqual(['Antumi.AppImage'])
  })

  it('updates only an AppImage in a folder it may write', async () => {
    expect(await appImageBlocked(undefined)).toBe('not-appimage')
    const dir = folder()
    writeFileSync(join(dir, 'Antumi.AppImage'), 'old')
    expect(await appImageBlocked(join(dir, 'Antumi.AppImage'))).toBeNull()
    const locked = join(dir, 'locked')
    mkdirSync(locked, { mode: 0o555 })
    expect(await appImageBlocked(join(locked, 'Antumi.AppImage'))).toBe('not-writable')
  })
})
