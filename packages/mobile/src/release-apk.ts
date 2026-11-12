// Which of a release's APKs a phone installs. A release carries one per architecture,
// Antumi-<version>-android-<abi>.apk; the phone's own come first in `abis`, the order Android lists
// them in, so its first match is the one it runs best. An APK naming no architecture carries them
// all and fits any phone.

const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86']

export function releaseApk<Asset extends { name: string }>(assets: readonly Asset[], abis: readonly string[] | null): Asset | null {
  const apks = assets.filter((asset) => asset.name.endsWith('.apk'))
  const abiOf = (asset: Asset) => ABIS.find((abi) => asset.name.endsWith(`-${abi}.apk`)) ?? null
  // Unknown, it is most likely a 64-bit ARM phone.
  for (const abi of abis ?? ['arm64-v8a']) {
    const own = apks.find((asset) => abiOf(asset) === abi)
    if (own) return own
  }
  return apks.find((asset) => abiOf(asset) === null) ?? null
}
