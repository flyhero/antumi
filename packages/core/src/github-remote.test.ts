import { describe, expect, it } from 'vitest'
import { parseGitHubRemote } from './github-remote'

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
