import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { githubRemote, parseGitHubRemote, parseRemote } from './github-remote'

describe('githubRemote', () => {
  const repoWith = (url: string) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-remote-'))
    execFileSync('git', ['init', '-q', dir])
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', url])
    return dir
  }

  it('takes an ssh alias that resolves to github.com, as two accounts are set up', async () => {
    const dir = repoWith('git@github-personal:flyhero/antumi.git')
    try {
      expect(await githubRemote(dir, 'origin', async (alias) => (alias === 'github-personal' ? 'github.com' : null))).toEqual({ host: 'github', owner: 'flyhero', name: 'antumi' })
      expect(await githubRemote(dir, 'origin', async () => 'gitlab.com')).toBeNull()
      expect(await githubRemote(dir, 'origin', async () => null)).toBeNull()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('never asks ssh about an https host', async () => {
    const dir = repoWith('https://github.example.com/flyhero/antumi.git')
    try {
      expect(await githubRemote(dir, 'origin', async () => { throw new Error('asked') })).toBeNull()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('parseRemote', () => {
  it('keeps the host as written, and whether it is ssh', () => {
    expect(parseRemote('git@github-personal:flyhero/antumi.git')).toEqual({ host: 'github-personal', ssh: true, owner: 'flyhero', name: 'antumi' })
    expect(parseRemote('ssh://git@work-gh:22/o/r')).toEqual({ host: 'work-gh', ssh: true, owner: 'o', name: 'r' })
    expect(parseRemote('https://github.com/o/r')).toEqual({ host: 'github.com', ssh: false, owner: 'o', name: 'r' })
  })
})

describe('parseGitHubRemote', () => {
  it('reads the forms git and GitHub hand out', () => {
    const repo = { host: 'github', owner: 'flyhero', name: 'antumi' }
    for (const url of [
      'git@github.com:flyhero/antumi.git',
      'git@github.com:flyhero/antumi',
      'ssh://git@github.com/flyhero/antumi.git',
      'ssh://git@github.com:22/flyhero/antumi',
      'https://github.com/flyhero/antumi.git',
      'https://github.com/flyhero/antumi',
      'https://github.com/flyhero/antumi/',
      'https://user@github.com/flyhero/antumi.git',
      'HTTPS://GitHub.com/flyhero/antumi\n'
    ]) expect(parseGitHubRemote(url), url).toEqual(repo)
  })

  it('keeps dots and dashes in names', () => {
    expect(parseGitHubRemote('git@github.com:my-org/my.repo-2.git')).toEqual({ host: 'github', owner: 'my-org', name: 'my.repo-2' })
  })

  it('is not any other host, nor a malformed path', () => {
    for (const url of [
      'git@gitlab.com:flyhero/antumi.git',
      'https://github.example.com/flyhero/antumi.git',
      'https://github.com/flyhero',
      'https://github.com/flyhero/antumi/extra',
      'git@github.com:flyhero/..',
      'git@github.com:-bad/antumi',
      '/Users/me/antumi',
      ''
    ]) expect(parseGitHubRemote(url), url).toBeNull()
  })
})
