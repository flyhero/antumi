import { describe, expect, it } from 'vitest'
import { overlaps } from './pet-path'
import type { Perch } from './pet-perches'
import { planPeek, visiblePeekHead } from './pet-peek'

const stage = { left: 0, top: 0, right: 1000, bottom: 700 }
const head = { bounds: { left: 20, top: 10, right: 95, bottom: 70 }, neck: { x: 55, y: 70 } }
const wall = (x: number, inward: number): Perch => ({ id: 'divider', kind: 'wall', from: { x, y: 30 }, to: { x, y: 650 }, inward })

describe('divider peeking', () => {
  for (const [x, facing] of [[240, 1], [760, -1]] as const) {
    it(`hides the whole head behind the line, then exposes it toward ${facing > 0 ? 'right' : 'left'}`, () => {
      const plan = planPeek(wall(x, facing), head, 120, 120, stage, [], .5)
      expect(plan).not.toBeNull()
      if (!plan) return
      expect(visiblePeekHead(plan, plan.hidden)).toBeNull()
      const visible = visiblePeekHead(plan, plan.shown)
      expect(visible).not.toBeNull()
      expect(facing > 0 ? visible?.left : visible?.right).toBe(x)
      expect(plan.shown.x + facing * (head.neck.x - 60)).toBe(x)
    })
  }

  it('uses real walls and refuses viewport edges, short dividers or a side without room', () => {
    expect(planPeek({ ...wall(240, 1), kind: 'edge' }, head, 120, 120, stage, [], .5)).toBeNull()
    expect(planPeek({ ...wall(240, 1), to: { x: 240, y: 60 } }, head, 120, 120, stage, [], .5)).toBeNull()
    expect(planPeek(wall(2, -1), head, 120, 120, stage, [], .5)).toBeNull()
  })

  it('avoids input, selection and native-browser areas on the visible side', () => {
    const first = planPeek(wall(240, 1), head, 120, 120, stage, [], .5)
    expect(first).not.toBeNull()
    if (!first) return
    const occupied = visiblePeekHead(first, first.shown)
    expect(occupied).not.toBeNull()
    if (!occupied) return
    const next = planPeek(wall(240, 1), head, 120, 120, stage, [occupied], .5)
    expect(next).not.toBeNull()
    if (next) expect(overlaps(visiblePeekHead(next, next.shown) ?? stage, occupied)).toBe(false)
    expect(planPeek(wall(240, 1), head, 120, 120, stage, [{ left: 240, right: 1000, top: 0, bottom: 700 }], .5)).toBeNull()
  })

  it('does not count the hidden body as an obstruction', () => {
    expect(planPeek(wall(240, 1), head, 120, 120, stage, [{ left: 0, right: 240, top: 0, bottom: 700 }], .5)).not.toBeNull()
  })

  it('fits the head and preserves the neck anchor across supported pet sizes', () => {
    for (const size of [60, 80, 120, 192]) {
      const scale = size / 120
      const scaled = { bounds: { left: 20 * scale, top: 10 * scale, right: 95 * scale, bottom: 70 * scale }, neck: { x: 55 * scale, y: 70 * scale } }
      const plan = planPeek(wall(240, 1), scaled, size, size, stage, [], .5)
      expect(plan).not.toBeNull()
      if (!plan) continue
      const visible = visiblePeekHead(plan, plan.shown)
      expect(visible?.top).toBeGreaterThan(30)
      expect(visible?.bottom).toBeLessThan(650)
      expect(plan.shown.x + scaled.neck.x - size / 2).toBeCloseTo(240)
    }
  })
})
