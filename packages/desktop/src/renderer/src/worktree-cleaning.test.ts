import { describe, expect, it } from 'vitest'
import { cleanOneByOne, type CleanProgress } from './worktree-cleaning'

describe('cleaning worktrees one by one', () => {
  it('cleans each path alone, saying which one is going and how each went', async () => {
    const asked: string[][] = []
    const seen: CleanProgress[] = []
    const done = await cleanOneByOne(['/a', '/b', '/c'], async (path) => {
      asked.push([path])
      if (path === '/b') return [{ path, removed: false, reason: 'worktree-dirty' }]
      if (path === '/c') return null
      return [{ path, removed: true, reason: null }]
    }, (progress) => seen.push(progress))
    expect(asked).toEqual([['/a'], ['/b'], ['/c']])
    expect(seen.map((progress) => progress.current)).toEqual(['/a', '/b', '/c', null])
    expect([...seen[1]?.removed ?? []]).toEqual(['/a'])
    expect(done).toEqual(seen.at(-1))
    expect([...done.removed]).toEqual(['/a'])
    expect([...done.failed]).toEqual([['/b', 'worktree-dirty'], ['/c', 'worktree-failed']])
    expect(done.total).toBe(3)
  })
})
