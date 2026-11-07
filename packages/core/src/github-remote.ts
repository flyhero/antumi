import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PullRequestRepo } from '@antumi/protocol'
import { gitOrNull } from './git-changes'

const execFileAsync = promisify(execFile)
const SSH_TIMEOUT_MS = 3_000

// The repository a remote URL names, in the forms git and GitHub hand out: ssh with a colon or a
// scheme, and https with or without a login in front. `host` is as written, which for ssh may be
// an alias from ~/.ssh/config (github-personal) standing for github.com.
const FORMS = [
  /^[^@/\s]+@(?<host>[^:/\s]+):(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/,
  /^ssh:\/\/(?:[^@/\s]+@)?(?<host>[^:/\s]+)(?::\d+)?\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/,
  /^https?:\/\/(?:[^@/\s]+@)?(?<host>[^:/\s]+)\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/i
]
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const NAME = /^[A-Za-z0-9._-]{1,100}$/
// A host ssh may be asked about: a plain name, never one that reads as an option.
const SSH_HOST = /^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/

export type ParsedRemote = { host: string; ssh: boolean; owner: string; name: string }

export function parseRemote(url: string): ParsedRemote | null {
  for (const [index, form] of FORMS.entries()) {
    const match = form.exec(url.trim())
    const { host, owner, name } = match?.groups ?? {}
    if (!host || !owner || !name) continue
    if (!OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null
    return { host: host.toLowerCase(), ssh: index < 2, owner, name }
  }
  return null
}

// The repository on github.com, when the URL names it there outright. An enterprise GitHub is
// not it: that would need its own API address and credential.
export function parseGitHubRemote(url: string): PullRequestRepo | null {
  const parsed = parseRemote(url)
  return parsed?.host === 'github.com' ? { host: 'github', owner: parsed.owner, name: parsed.name } : null
}

// The host an ssh alias stands for, as ssh itself would resolve it from the user's config.
export async function sshHostname(alias: string): Promise<string | null> {
  if (!SSH_HOST.test(alias)) return null
  try {
    const { stdout } = await execFileAsync('ssh', ['-G', alias], { timeout: SSH_TIMEOUT_MS, maxBuffer: 256 * 1024, windowsHide: true })
    return /^hostname (\S+)$/m.exec(stdout)?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

// What `remote` of the repo at `dir` points to, when that is github.com: the URL as configured,
// before any `url.<base>.insteadOf` rewrites it for fetching, which may point at a mirror. An ssh
// host alias counts when ssh resolves it to github.com, as people signed in to two accounts do.
export async function githubRemote(dir: string, remote = 'origin', resolveSsh: (alias: string) => Promise<string | null> = sshHostname): Promise<PullRequestRepo | null> {
  const url = await gitOrNull(dir, ['config', '--get', `remote.${remote}.url`])
  const parsed = url ? parseRemote(url) : null
  if (!parsed) return null
  const host = parsed.host === 'github.com' || !parsed.ssh ? parsed.host : await resolveSsh(parsed.host)
  return host === 'github.com' ? { host: 'github', owner: parsed.owner, name: parsed.name } : null
}
