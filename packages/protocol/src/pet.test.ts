import { describe, expect, it } from 'vitest'
import { PET_FILES, petAssetFiles, PetManifest, PetResourceData, PetTyping } from './pet'
import manifest from '../../desktop/src/renderer/src/assets/pets/clay-manifest.json'

describe('optional pet typing animation', () => {
  it('requires both images and their rig together, leaving legacy packs valid', () => {
    expect(petAssetFiles(PetManifest.parse(manifest))).toEqual([...PET_FILES, 'typing.webp', 'typing-base.webp'])
    const assets = { 'poses.webp': manifest.assets['poses.webp'], 'walk.webp': manifest.assets['walk.webp'], 'face.webp': manifest.assets['face.webp'] }
    const legacy = { ...manifest, assets, rig: { ...manifest.rig, typing: undefined } }
    expect(petAssetFiles(PetManifest.parse(legacy))).toEqual([...PET_FILES])
    expect(PetManifest.safeParse({ ...manifest, assets }).success).toBe(false)
    expect(PetManifest.safeParse({ ...legacy, assets: manifest.assets }).success).toBe(false)
    expect(PetManifest.safeParse({ ...manifest, assets: { ...manifest.assets, 'typing-base.webp': undefined } }).success).toBe(false)
    const encoded = { 'poses.webp': 'YQ==', 'walk.webp': 'YQ==', 'face.webp': 'YQ==', 'typing.webp': 'YQ==', 'typing-base.webp': 'YQ==' }
    expect(PetResourceData.safeParse({ manifest, assets: encoded }).success).toBe(true)
    expect(PetResourceData.safeParse({ manifest, assets: { ...encoded, 'typing-base.webp': undefined } }).success).toBe(false)
    expect(PetResourceData.safeParse({ manifest: legacy, assets: encoded }).success).toBe(false)
  })

  it('bounds animation geometry, duration and clip syntax', () => {
    const rig = manifest.rig.typing
    expect(PetTyping.safeParse(rig).success).toBe(true)
    expect(PetTyping.safeParse({ ...rig, scale: undefined }).success).toBe(true)
    for (const patch of [{ scale: 0 }, { scale: 2.1 }, { cycleMs: 0 }, { cycleMs: 100_000 }, { offsetY: 300 }, { near: { ...rig.near, pivot: { x: -1, y: 0 } } }, { far: { ...rig.far, lift: 90 } }, { near: { ...rig.near, clip: '<script>alert(1)</script>' } }]) {
      expect(PetTyping.safeParse({ ...rig, ...patch }).success).toBe(false)
    }
  })
})
