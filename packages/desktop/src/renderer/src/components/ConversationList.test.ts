import { describe, expect, it } from 'vitest'
import { metaProjects } from './ConversationList'

describe('metaProjects', () => {
  it('leaves the primary project to its heading, naming only the others it reaches', () => {
    expect(metaProjects(['/code/antumi', '/code/orca', '/code/multica'], true)).toBe('+orca、multica')
    expect(metaProjects(['/code/antumi'], true)).toBeNull()
    expect(metaProjects([], true)).toBeNull()
    expect(metaProjects(['/code/antumi', '/code/orca'], false)).toBe('antumi、orca')
    expect(metaProjects([], false)).toBe('无项目')
  })
})
