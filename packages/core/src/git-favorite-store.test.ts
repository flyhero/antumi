import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitFavoriteStore } from './git-favorite-store'
import { TaskStore } from './task-store'

describe('Git favorites', () => {
  let dir: string
  let tasks: TaskStore
  let favorites: GitFavoriteStore
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-git-favorites-'))
    file = path.join(dir, 'antumi.db')
    tasks = new TaskStore(file)
    favorites = new GitFavoriteStore(file)
  })
  afterEach(() => { favorites.close(); tasks.close(); rmSync(dir, { recursive: true, force: true }) })

  it('persists removed defaults and added favorites across a restart without affecting other repositories', () => {
    expect(favorites.list('/repo')).toEqual(new Set(['refs/heads/main', 'refs/heads/master']))
    favorites.set('/repo', 'refs/heads/main', false)
    favorites.set('/repo', 'refs/remotes/origin/main', true)
    favorites.set('/repo', 'refs/heads/feature/topic', true)
    favorites.close()
    favorites = new GitFavoriteStore(file)
    expect(favorites.list('/repo')).toEqual(new Set(['refs/heads/master', 'refs/remotes/origin/main', 'refs/heads/feature/topic']))
    expect(favorites.list('/other')).toEqual(new Set(['refs/heads/main', 'refs/heads/master']))
  })

  it('preserves an explicitly unmarked branch when renamed to a default name', () => {
    favorites.set('/repo', 'refs/heads/topic', false)
    favorites.rename('/repo', 'refs/heads/topic', 'refs/heads/main')
    expect(favorites.list('/repo').has('refs/heads/main')).toBe(false)
    favorites.rename('/repo', 'refs/heads/master', 'refs/heads/master')
    expect(favorites.list('/repo').has('refs/heads/master')).toBe(true)
  })
})
