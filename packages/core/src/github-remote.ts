import type { PullRequestRepo } from '@antumi/protocol'
import { gitOrNull } from './git-changes'

// The repository a remote URL names on github.com, in the forms git and GitHub hand out: ssh with
// a colon or a scheme, and https with or without a login in front. Any other host is not it, an
// enterprise GitHub included: that would need its own API address and credential.
const FORMS = [
  /^git@github\.com:(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/,
  /^ssh:\/\/git@github\.com(?::\d+)?\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/,
  /^https?:\/\/(?:[^@/]+@)?github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/i
]
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const NAME = /^[A-Za-z0-9._-]{1,100}$/

export function parseGitHubRemote(url: string): PullRequestRepo | null {
  for (const form of FORMS) {
    const match = form.exec(url.trim())
    const owner = match?.groups?.owner
    const name = match?.groups?.name
    if (!owner || !name) continue
    if (!OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null
    return { host: 'github', owner, name }
  }
  return null
}

// What `remote` of the repo at `dir` points to, when that is github.com.
export async function githubRemote(dir: string, remote = 'origin'): Promise<PullRequestRepo | null> {
  const url = await gitOrNull(dir, ['remote', 'get-url', remote])
  return url ? parseGitHubRemote(url) : null
}
