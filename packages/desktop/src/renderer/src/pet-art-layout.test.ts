import { describe, expect, it } from 'vitest'
import { PET_ART_LAYOUT, PET_FRAME_SIZE, petWalkLayout } from './pet-art-layout'
import { PET_STYLES } from './pet-preferences'

describe('pet artwork alignment', () => {
  for (const style of PET_STYLES) {
    it(`keeps ${style}'s neck and feet in the standing positions at every supported size`, () => {
      const source = PET_ART_LAYOUT[style]
      for (const [frame, neck] of source.walkNecks.entries()) {
        const placement = petWalkLayout(source, frame)
        for (const size of [60, 80, 120, 192]) {
          const scale = size / PET_FRAME_SIZE
          expect((neck.x + placement.x) * scale).toBeCloseTo(source.idleNeck.x * scale)
          expect((neck.y * placement.scaleY + placement.y) * scale).toBeCloseTo(source.idleNeck.y * scale)
          expect((source.walkFloor * placement.scaleY + placement.y) * scale).toBeCloseTo(source.idleFloor * scale)
        }
      }
    })
  }
})
