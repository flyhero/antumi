import { describe, expect, it } from 'vitest'
import { releaseApk } from './release-apk'

const asset = (name: string) => ({ name, browser_download_url: `https://example.test/${name}` })
const split = [asset('Antumi-0.2.0-android-armeabi-v7a.apk'), asset('Antumi-0.2.0-android-arm64-v8a.apk'), asset('checksums.txt')]

describe('the APK a phone updates to', () => {
  it('takes the phone’s own architecture, in the order the phone prefers', () => {
    expect(releaseApk(split, ['arm64-v8a', 'armeabi-v7a', 'armeabi'])?.name).toBe('Antumi-0.2.0-android-arm64-v8a.apk')
    expect(releaseApk(split, ['armeabi-v7a', 'armeabi'])?.name).toBe('Antumi-0.2.0-android-armeabi-v7a.apk')
  })

  it('assumes 64-bit ARM when the phone does not say', () => {
    expect(releaseApk(split, null)?.name).toBe('Antumi-0.2.0-android-arm64-v8a.apk')
  })

  it('falls back to an APK carrying every architecture, and finds none for a phone no APK fits', () => {
    expect(releaseApk([...split, asset('Antumi-0.2.0-android.apk')], ['x86_64'])?.name).toBe('Antumi-0.2.0-android.apk')
    expect(releaseApk(split, ['x86_64'])).toBeNull()
  })
})
