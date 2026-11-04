import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { keptLeftovers } from './worktree-leftovers'

describe('keptLeftovers', () => {
  let repo: string
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' })

  beforeEach(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'antumi-leftovers-'))
    git('init', '-q', '-b', 'main')
    mkdirSync(path.join(repo, '.antumi'))
    writeFileSync(path.join(repo, '.antumi', 'project.json'), JSON.stringify({ copy: ['.env', 'config/local/'] }))
    writeFileSync(path.join(repo, '.gitignore'), '.env\nconfig/local/\nnode_modules/\n*.log\nnotes/\nscratch.db\n')
    git('add', '.')
    git('commit', '-q', '-m', 'init')
  })
  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  it('leaves out what setup copies or an install or build makes again, and names the rest', async () => {
    expect(await keptLeftovers(repo, repo)).toEqual([])
    for (const dir of ['config/local', 'node_modules/x', 'packages/a/node_modules', 'notes']) mkdirSync(path.join(repo, dir), { recursive: true })
    for (const file of ['.env', 'config/local/a.json', 'node_modules/x/i.js', 'packages/a/node_modules/j.js', 'debug.log', 'notes/todo.md', 'scratch.db']) writeFileSync(path.join(repo, file), 'x')
    expect((await keptLeftovers(repo, repo))?.sort()).toEqual(['notes/', 'scratch.db'])
    // Without the project's list, what it copies counts as the user's own.
    expect(await keptLeftovers(repo, null)).toContain('.env')
  })

  it('cannot say outside git', async () => {
    const plain = mkdtempSync(path.join(os.tmpdir(), 'antumi-plain-'))
    try {
      expect(await keptLeftovers(plain, null)).toBeNull()
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
