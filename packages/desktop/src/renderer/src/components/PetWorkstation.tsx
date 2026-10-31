import { useId } from 'react'
import type { CSSProperties } from 'react'
import type { PetTyping } from '@antumi/protocol'
import type { PetTypingImages } from '../pet-resource-cache'

// The clean plate reveals the keys as each original arm lifts; feet and laptop stay fixed.
export function PetWorkstation({ images, rig }: { images: PetTypingImages; rig: PetTyping }) {
  const id = useId()
  const armStyle = (arm: PetTyping['near']): CSSProperties & { '--pet-typing-angle': string } => ({ transformOrigin: `${arm.pivot.x}px ${arm.pivot.y}px`, '--pet-typing-angle': `${-arm.lift}deg` })
  const timing: CSSProperties & { '--pet-typing-cycle': string } = { '--pet-typing-cycle': `${rig.cycleMs}ms`, transform: `scale(${rig.scale ?? 1})` }
  return <span className="pet-workstation" style={timing} aria-hidden="true">
    <img className="pet-workstation-base" src={images.base} alt="" draggable={false} style={{ transform: `translateY(${rig.offsetY / 256 * 100}%)` }} />
    <svg className="pet-typing-arms" viewBox="0 0 256 256" focusable="false">
    <defs>
      <clipPath id={`${id}-near`}><path d={rig.near.clip} /></clipPath>
      <clipPath id={`${id}-far`}><path d={rig.far.clip} /></clipPath>
    </defs>
    <g transform={`translate(0 ${rig.offsetY})`}>
      <g className="pet-typing-arm pet-typing-far" style={armStyle(rig.far)}><image href={images.image} width="256" height="256" clipPath={`url(#${id}-far)`} /></g>
      <g className="pet-typing-arm pet-typing-near" style={armStyle(rig.near)}><image href={images.image} width="256" height="256" clipPath={`url(#${id}-near)`} /></g>
    </g>
    </svg>
  </span>
}
