// The ant's face, head on and in pixels, for where the whole figure (AntSkin.tsx) would be too
// much: the island at rest. Drawn on a 16-unit grid with hard edges, so at 22px it reads as a
// sprite rather than a blur. The same tokens colour it, so it is the palette's own ant; the eyes
// blink by swapping two frames in CSS.
export function AntHead({ asleep = false }: { asleep?: boolean }) {
  return (
    <svg className="ant-head-mark" viewBox="0 0 16 16" aria-hidden="true" data-asleep={asleep}>
      <g className="ant-head-antenna">
        <rect x="3" y="1" width="1" height="1" />
        <rect x="4" y="2" width="1" height="1" />
        <rect x="12" y="1" width="1" height="1" />
        <rect x="11" y="2" width="1" height="1" />
      </g>
      <g className="ant-head-shell">
        <rect x="5" y="3" width="6" height="1" />
        <rect x="4" y="4" width="8" height="1" />
        <rect x="3" y="5" width="10" height="7" />
        <rect x="4" y="12" width="8" height="1" />
        <rect x="5" y="13" width="6" height="1" />
      </g>
      <g className="ant-head-eyes-open">
        <rect className="ant-head-eye" x="5" y="7" width="2" height="2" />
        <rect className="ant-head-eye" x="9" y="7" width="2" height="2" />
        <rect className="ant-head-pupil" x="6" y="8" width="1" height="1" />
        <rect className="ant-head-pupil" x="10" y="8" width="1" height="1" />
      </g>
      <g className="ant-head-eyes-shut">
        <rect className="ant-head-pupil" x="5" y="8" width="2" height="1" />
        <rect className="ant-head-pupil" x="9" y="8" width="2" height="1" />
      </g>
      <rect className="ant-head-pupil" x="7" y="11" width="2" height="1" />
    </svg>
  )
}

// What the ant feels, in the same pixels beside it, turning with the day: the sun in the morning,
// a star through the afternoon, a heart in the evening, and at night its sleep.
export type AntMood = 'sun' | 'star' | 'heart' | 'sleep'

export function antMood(hour: number): AntMood {
  if (hour >= 5 && hour < 11) return 'sun'
  if (hour < 18) return 'star'
  if (hour < 23) return 'heart'
  return 'sleep'
}

const MOOD_PIXELS: Record<AntMood, readonly (readonly [x: number, y: number, w: number, h?: number])[]> = {
  sun: [[6, 6, 4, 4], [7, 3, 2, 1], [7, 12, 2, 1], [3, 7, 1, 2], [12, 7, 1, 2], [4, 4, 1], [11, 4, 1], [4, 11, 1], [11, 11, 1]],
  star: [[7, 3, 2], [7, 4, 2], [6, 5, 4], [3, 6, 10], [4, 7, 8], [5, 8, 6], [5, 9, 6], [4, 10, 3], [9, 10, 3], [3, 11, 3], [10, 11, 3]],
  heart: [[4, 4, 3], [9, 4, 3], [3, 5, 10], [3, 6, 10], [3, 7, 10], [4, 8, 8], [5, 9, 6], [6, 10, 4], [7, 11, 2]],
  sleep: [[3, 5, 6], [7, 6, 1], [6, 7, 1], [5, 8, 1], [4, 9, 1], [3, 10, 6], [10, 2, 4], [12, 3, 1], [11, 4, 1], [10, 5, 4]]
}

export function AntMoodMark({ mood }: { mood: AntMood }) {
  return (
    <svg className="ant-mood-mark" viewBox="0 0 16 16" aria-hidden="true" data-mood={mood}>
      {MOOD_PIXELS[mood].map(([x, y, w, h = 1]) => <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} />)}
    </svg>
  )
}
