import { describe, expect, it } from 'vitest'
import { petPointerFacing, petPointerLook, petPointerNear } from './pet-gaze'

describe('pet mouse gaze', () => {
  it('only senses pointers in a nearby circle, keeping a minimum reach for small pets', () => {
    const center = { x: 400, y: 500 }
    for (const [width, radius] of [[60, 160], [80, 160], [120, 240], [192, 384]] as const) {
      expect(petPointerNear({ x: center.x + radius - 1, y: center.y }, center, width)).toBe(true)
      expect(petPointerNear({ x: center.x, y: center.y - radius - 1 }, center, width)).toBe(false)
      expect(petPointerNear({ x: center.x + radius, y: center.y + radius }, center, width)).toBe(false)
    }
  })

  it('uses an outer boundary to avoid restarting gaze around the range edge', () => {
    const center = { x: 400, y: 500 }, pointer = { x: 660, y: 500 }
    expect(petPointerNear(pointer, center, 120)).toBe(false)
    expect(petPointerNear(pointer, center, 120, true)).toBe(true)
    expect(petPointerNear({ x: 689, y: 500 }, center, 120, true)).toBe(false)
  })

  it('can notice a stationary pointer when the pet moves into range', () => {
    const pointer = { x: 800, y: 400 }
    expect(petPointerNear(pointer, { x: 400, y: 400 }, 120)).toBe(false)
    expect(petPointerNear(pointer, { x: 600, y: 400 }, 120)).toBe(true)
    expect(petPointerNear(pointer, { x: 1100, y: 400 }, 120, true)).toBe(false)
  })

  it('follows the same local direction on either wall and facing either way', () => {
    const origin = { x: 70, y: 48 }, width = 120, height = 120
    for (const angle of [0, -90, 90, 45]) {
      const a = Math.cos(angle * Math.PI / 180), b = Math.sin(angle * Math.PI / 180)
      const frame = { a, b, c: -b, d: a, e: 300, f: 400 }
      for (const facing of [1, -1] as const) {
        const x = (origin.x - width / 2 + 80) * facing, y = origin.y - height - 80
        const look = petPointerLook({ x: frame.e + a * x - b * y, y: frame.f + b * x + a * y }, frame, origin, width, height, facing)
        expect(look.x).toBeGreaterThan(.4)
        expect(look.y).toBeGreaterThan(.4)
        expect(look.x).toBeCloseTo(look.y)
      }
    }
  })

  it('settles at the face and stays bounded for distant pointers', () => {
    const frame = { a: 1, b: 0, c: 0, d: 1, e: 200, f: 300 }
    expect(petPointerLook({ x: 210, y: 228 }, frame, { x: 70, y: 48 }, 120, 120, 1)).toEqual({ x: 0, y: -0 })
    const far = petPointerLook({ x: -1e6, y: 1e6 }, frame, { x: 70, y: 48 }, 120, 120, 1)
    expect(far).toEqual({ x: -1, y: -1 })
  })

  it('turns toward a pointer behind the body and holds its facing near the middle', () => {
    for (const width of [60, 80, 120, 192]) {
      for (const facing of [1, -1] as const) {
        const frame = { a: 1, b: 0, c: 0, d: 1, e: 400, f: 500 }
        expect(petPointerFacing({ x: 400 - width * facing, y: 0 }, frame, width, facing)).toBe(-facing)
        expect(petPointerFacing({ x: 400 + width * facing, y: 0 }, frame, width, facing)).toBe(facing)
        for (const x of [-.29, 0, .29]) {
          expect(petPointerFacing({ x: 400 + width * x, y: 0 }, frame, width, facing)).toBe(facing)
        }
      }
    }
  })

  it('does not flip back just because the face origin moves after mirroring', () => {
    const frame = { a: 1, b: 0, c: 0, d: 1, e: 400, f: 500 }
    const target = { x: 350, y: 420 }
    const turned = petPointerFacing(target, frame, 120, 1)
    expect(turned).toBe(-1)
    expect(petPointerFacing(target, frame, 120, turned)).toBe(turned)
  })
})
