import { describe, expect, it } from 'vitest'
import { SourceDescriptor } from '@antumi/protocol'
import { inboxLocked, sidebarShows } from './sidebar-entries'

const preferences = { sidebarInbox: false, sidebarRoutines: true, sidebarGit: false, sidebarDiscussions: true }

describe('sidebar entries', () => {
  it('shows what the user left on, and the inbox by itself once a plugin brings a source', () => {
    expect(sidebarShows('routines', preferences, null)).toBe(true)
    expect(sidebarShows('git', preferences, null)).toBe(false)
    expect(sidebarShows('inbox', preferences, [])).toBe(false)
    expect(sidebarShows('inbox', { ...preferences, sidebarInbox: true }, [])).toBe(true)
    const source = SourceDescriptor.parse({ provider: 'github', name: 'GitHub', settings: [], instances: [] })
    expect(inboxLocked(null)).toBe(false)
    expect(inboxLocked([source])).toBe(true)
    expect(sidebarShows('inbox', preferences, [source])).toBe(true)
  })
})
