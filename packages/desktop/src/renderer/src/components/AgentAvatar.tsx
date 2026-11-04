import { createAvatar } from '@dicebear/core'
import * as bottts from '@dicebear/bottts'
import type { AgentKind } from '@antumi/protocol'
import { useCore } from '../core-store'
import { AgentIcon } from './icons'

// The soft grounds a face is drawn on, one picked by its seed. They are part of the drawing, as the
// robot's own colours are, baked into its SVG; the interface's tokens cannot reach inside an image.
const TINTS = ['fde8e0', 'fdf1d6', 'e3f1e4', 'dfeefb', 'ece6fb', 'f6e3ef']
const drawn = new Map<string, string>()

// A saved agent's face: DiceBear's bottts robot seeded by the profile's id, so a rename keeps it and
// nothing is stored for it.
export function avatarUri(id: string): string {
  let uri = drawn.get(id)
  if (!uri) {
    uri = createAvatar(bottts, { seed: id, radius: 20, scale: 90, backgroundColor: TINTS, backgroundType: ['solid'] }).toDataUri()
    drawn.set(id, uri)
  }
  return uri
}

// An <img>, so one face's SVG ids never meet another's in the page.
export function AgentAvatar({ id }: { id: string }) {
  return <img className="agent-avatar" src={avatarUri(id)} alt="" draggable={false} />
}

// The face of an agent the user saved; a direct call runs as a stand-in profile with a fresh id
// each time, which has no face of its own, so it keeps its agent's logo.
export function ProfileAvatar({ profile }: { profile: { id: string; agent: AgentKind } }) {
  const saved = useCore((s) => Boolean(s.agentProfiles[profile.id]))
  return saved ? <AgentAvatar id={profile.id} /> : <AgentIcon agent={profile.agent} />
}
