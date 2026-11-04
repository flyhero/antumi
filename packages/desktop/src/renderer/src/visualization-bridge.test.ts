import { describe, expect, it } from 'vitest'
import { VisualizationMessage, visualizationState } from './visualization-bridge'

describe('visualization bridge messages', () => {
  it('accepts only known bounded messages and controls', () => {
    expect(VisualizationMessage.safeParse({ antumiVisualization: 'frame', kind: 'height', height: 200 }).success).toBe(true)
    for (const data of [{ kind: 'height', height: Infinity }, { kind: 'height', height: 10_001 }, { kind: 'readFile', path: '/secret' }, { kind: 'controls', panels: [{ id: 'one', label: '', controls: [{ id: 'one', type: 'command', value: 'rm', label: 'Run' }] }] }]) {
      expect(VisualizationMessage.safeParse({ antumiVisualization: 'frame', ...data }).success).toBe(false)
    }
  })

  it('keeps only small JSON widget snapshots', () => {
    const state = { modelContent: { choice: 'ring' }, privateContent: { value: 3 } }
    expect(visualizationState(state)).toEqual(state)
    expect(visualizationState('x'.repeat(16_385))).toBeNull()
    expect(visualizationState({ callback: () => {} })).toBeNull()
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    expect(visualizationState(cycle)).toBeNull()
  })
})
