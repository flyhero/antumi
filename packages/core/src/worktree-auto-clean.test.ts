import { describe, expect, it } from 'vitest'
import { WorktreeAutoClean } from './worktree-auto-clean'

const DAY = 24 * 60 * 60_000

describe('WorktreeAutoClean', () => {
  it('cleans what has lain idle the days the user allows, nothing while off, and counts what went', async () => {
    let days: number | null = null
    const asked: number[] = []
    const cleaned: string[][] = []
    const auto = new WorktreeAutoClean(
      () => days,
      async (before) => { asked.push(before); return ['/w/a', '/w/b'] },
      async (paths) => { cleaned.push([...paths]); return [{ path: '/w/a', removed: true, reason: null }, { path: '/w/b', removed: false, reason: 'worktree-dirty' }] },
      () => 10 * DAY
    )
    expect(await auto.sweep()).toBe(0)
    expect(asked).toEqual([])
    days = 7
    expect(await auto.sweep()).toBe(1)
    expect(asked).toEqual([3 * DAY])
    expect(cleaned).toEqual([['/w/a', '/w/b']])
  })

  it('survives a sweep that fails, for the next one to try again', async () => {
    const auto = new WorktreeAutoClean(() => 1, async () => { throw new Error('git gone') }, async () => [])
    const logged = console.error
    console.error = () => {}
    try {
      expect(await auto.sweep()).toBe(0)
    } finally {
      console.error = logged
    }
  })
})
