import { createHash } from 'node:crypto'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { linkShared, type SharedEntry } from '../../agent-account-home'
import { parseJson } from '../../usage-source'
import type { AccountSupport } from '../agent-adapter'

// The user's own folder, as Claude Code finds it without Antumi.
export function claudeDefaultHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

// Its global config: beside the folder by default, inside it once CLAUDE_CONFIG_DIR names one.
export function claudeGlobalConfig(home: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  if (home) return path.join(home, '.claude.json')
  return env.CLAUDE_CONFIG_DIR ? path.join(env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json')
}

const KEYCHAIN_SERVICE = 'Claude Code-credentials'

// Claude Code keeps an account's sign-in under a keychain item named after the exact text of its
// CLAUDE_CONFIG_DIR (2.1+): the first 8 hex digits of its sha256, after NFC.
export function claudeKeychainService(home: string | undefined): string {
  if (!home) return KEYCHAIN_SERVICE
  return `${KEYCHAIN_SERVICE}-${createHash('sha256').update(home.normalize('NFC')).digest('hex').slice(0, 8)}`
}

// History, so a session resumes on any account, and the user's own skills, commands and plugins.
// Not sessions/: Claude Code's register of its running processes, each folder its own.
const SHARED: readonly SharedEntry[] = [
  ...['projects', 'file-history', 'todos', 'plans', 'shell-snapshots', 'session-env', 'paste-cache', 'tasks', 'transcripts'].map((name) => ({ name, create: 'dir' as const })),
  { name: 'history.jsonl', create: 'file' },
  ...['skills', 'plugins', 'agents', 'commands', 'output-styles'].map((name) => ({ name }))
]

// What of the user's global config an account takes too: their MCP servers, and per project its
// own servers and trust. The sign-in and the account's caches stay its own.
const GlobalConfig = z.looseObject({
  mcpServers: z.record(z.string(), z.unknown()).optional(),
  hasCompletedOnboarding: z.boolean().optional(),
  projects: z.record(z.string(), z.looseObject({})).optional(),
  oauthAccount: z.looseObject({ emailAddress: z.string().optional() }).nullish()
})
const PROJECT_KEYS = ['mcpServers', 'enabledMcpjsonServers', 'disabledMcpjsonServers', 'hasTrustDialogAccepted'] as const

async function readConfig(file: string): Promise<z.infer<typeof GlobalConfig> | null> {
  const parsed = GlobalConfig.safeParse(parseJson(await readFile(file, 'utf8').catch(() => null)))
  return parsed.success ? parsed.data : null
}

export function mergedGlobalConfig(own: z.infer<typeof GlobalConfig> | null, account: z.infer<typeof GlobalConfig> | null): z.infer<typeof GlobalConfig> {
  const projects: Record<string, Record<string, unknown>> = { ...account?.projects }
  for (const [folder, settings] of Object.entries(own?.projects ?? {})) {
    const shared = Object.fromEntries(PROJECT_KEYS.flatMap((key) => (key in settings ? [[key, settings[key]]] : [])))
    if (Object.keys(shared).length > 0) projects[folder] = { ...projects[folder], ...shared }
  }
  return {
    ...account,
    hasCompletedOnboarding: true,
    ...(own?.mcpServers ? { mcpServers: own.mcpServers } : {}),
    ...(Object.keys(projects).length > 0 ? { projects } : {})
  }
}

// settings.json is copied rather than linked: Claude Code saves it by renaming a new file over it,
// which would leave a link a file of the account's own. Never creates the folder, so an account
// being removed stays gone.
export async function copyClaudeSettings(home: string): Promise<void> {
  await copyFile(path.join(claudeDefaultHome(), 'settings.json'), path.join(home, 'settings.json')).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') await rm(path.join(home, 'settings.json'), { force: true })
  })
}

// CLAUDE.md imports the user's, which a copy would load twice in a project under their home.
async function prepare(home: string): Promise<void> {
  const own = claudeDefaultHome()
  await linkShared(home, own, SHARED)
  await copyClaudeSettings(home)
  const memory = path.join(home, 'CLAUDE.md')
  const imported = `@${path.join(own, 'CLAUDE.md')}\n`
  if ((await readFile(memory, 'utf8').catch(() => null)) !== imported) await writeFile(memory, imported, { mode: 0o600 })
  const file = claudeGlobalConfig(home)
  const current = await readFile(file, 'utf8').catch(() => null)
  const next = JSON.stringify(mergedGlobalConfig(await readConfig(claudeGlobalConfig(undefined)), await readConfig(file)), null, 2)
  // Written only when it changes: an agent running on the account writes this file too.
  if (current === null || JSON.stringify(parseJson(current), null, 2) !== next) await writeFile(file, next, { mode: 0o600 })
}

async function identity(home: string | undefined): Promise<{ email: string | null }> {
  const config = await readConfig(claudeGlobalConfig(home))
  return { email: config?.oauthAccount?.emailAddress ?? null }
}

export const claudeAccounts: AccountSupport = {
  env: (home) => ({ CLAUDE_CONFIG_DIR: home }),
  prepare,
  identity,
  login: ['auth', 'login'],
  logout: ['auth', 'logout']
}
