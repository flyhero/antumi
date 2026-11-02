import { describe, expect, it } from 'vitest'
import { conflictExcerpt, describeGitAction, gitProblemPrompt } from './git-handoff'

describe('git hand-off', () => {
  it('names an action as git would', () => {
    expect(describeGitAction({ kind: 'merge', ref: 'refs/remotes/origin/feature' })).toBe('merge origin/feature')
    expect(describeGitAction({ kind: 'push', remote: 'origin', name: 'main' })).toBe('push origin/main')
    expect(describeGitAction({ kind: 'update', ref: 'refs/heads/main', method: 'rebase' })).toBe('update main (rebase)')
    expect(describeGitAction({ kind: 'fetch' })).toBe('fetch')
  })

  it('keeps each conflicted hunk with a little context, and only those', () => {
    const text = ['a', 'b', 'c', 'd', '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> feature', 'e', 'f', 'g', 'h', 'i', '<<<<<<< HEAD', 'x', '=======', 'y', '>>>>>>> feature', 'z'].join('\n')
    const { lines, cut } = conflictExcerpt(text)
    expect(cut).toBe(false)
    expect(lines).toEqual(['c', 'd', '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> feature', 'e', 'f', '…', 'h', 'i', '<<<<<<< HEAD', 'x', '=======', 'y', '>>>>>>> feature', 'z'])
  })

  it('cuts an excerpt at its limit and says so', () => {
    const text = ['<<<<<<< HEAD', ...Array.from({ length: 20 }, (_, n) => `line ${n}`), '>>>>>>> feature'].join('\n')
    const { lines, cut } = conflictExcerpt(text, 5)
    expect(lines).toHaveLength(5)
    expect(cut).toBe(true)
  })

  it('writes the directory, branch, git output and conflicting code into the message', () => {
    const failed = gitProblemPrompt({ operation: 'push origin/main', message: '! [rejected] main -> main (fetch first)', conflicts: [] }, { directory: '/repo', branch: 'main' }, [])
    expect(failed).toContain('/repo')
    expect(failed).toContain('git push origin/main')
    expect(failed).toContain('! [rejected] main -> main (fetch first)')

    const conflicted = gitProblemPrompt({ operation: 'merge feature', message: null, conflicts: ['src/a.ts'] }, { directory: '/repo', branch: 'main' }, [{ file: 'src/a.ts', lines: ['<<<<<<< HEAD', 'ours'], cut: true }])
    expect(conflicted).toContain('- src/a.ts')
    expect(conflicted).toContain('`src/a.ts`')
    expect(conflicted).toContain('<<<<<<< HEAD\nours')
  })
})
