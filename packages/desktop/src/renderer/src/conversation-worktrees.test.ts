import { describe, expect, it } from 'vitest'
import type { ManagedWorktree } from '@antumi/protocol'
import { cleanableOnceAway } from './conversation-worktrees'

const worktree = (name: string, overrides: Partial<ManagedWorktree> = {}): ManagedWorktree => ({
  path: `/antumi/worktrees/${name}/app`, repo: '/code/app', branch: `antumi/${name}`, taskId: null, planning: false,
  changes: 0, unmerged: null, alone: false, inUse: false, locked: false, touchedAt: 0, size: null, conversationId: 'c', ...overrides
})

describe('cleanableOnceAway', () => {
  it('offers the conversation\'s own worktrees that hold nothing, as they would stand once it is put away', () => {
    expect(cleanableOnceAway([
      worktree('mine'),
      // Its agent stops as it is archived.
      worktree('working', { inUse: true }),
      worktree('dirty', { changes: 2 }),
      worktree('alone', { alone: true }),
      worktree('other', { conversationId: 'd' }),
      worktree('task', { taskId: 't' }),
      worktree('call', { agentCall: { id: 'x', parentId: 'c', open: false } })
    ], 'c')).toEqual(['/antumi/worktrees/mine/app', '/antumi/worktrees/working/app'])
  })
})
