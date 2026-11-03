import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeAuthStatus, parseClaudeAuthStatus } from './claude-sign-in'
import { claudeSignedIn, readClaudeUsage } from './claude-usage'

let root: string
let bin: string
let calls: string

// A stand-in `claude` that logs each call's CLAUDE_CONFIG_DIR and cwd, then answers as told.
const fakeClaude = (body: string) => {
  const file = path.join(bin, 'claude')
  writeFileSync(file, `#!${process.execPath}\nrequire('fs').appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ dir: process.env.CLAUDE_CONFIG_DIR ?? null, cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n')\n${body}`, { mode: 0o755 })
}
const answers = (code: number, status: unknown) => fakeClaude(`process.stdout.write(${JSON.stringify(JSON.stringify(status))}); process.exit(${code})`)
const logged = () => existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'antumi-claude-sign-in-'))
  bin = path.join(root, 'bin')
  calls = path.join(root, 'calls.jsonl')
  mkdirSync(bin)
  vi.stubEnv('PATH', bin)
})
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) })

describe('parseClaudeAuthStatus', () => {
  it('trusts the answer only when the exit code agrees with it', () => {
    expect(parseClaudeAuthStatus(0, '{"loggedIn":true,"authMethod":"oauth_token"}')).toBe(true)
    expect(parseClaudeAuthStatus(1, '{"loggedIn":false,"authMethod":"none"}\n')).toBe(false)
    expect(parseClaudeAuthStatus(1, '{"loggedIn":true}')).toBeNull()
    expect(parseClaudeAuthStatus(2, '{"loggedIn":false}')).toBeNull()
    expect(parseClaudeAuthStatus(null, '')).toBeNull()
    expect(parseClaudeAuthStatus(1, 'error: unknown command auth')).toBeNull()
    expect(parseClaudeAuthStatus(0, '{"loggedIn":"yes"}')).toBeNull()
  })
})

describe('claudeAuthStatus', () => {
  it('asks the CLI from the home folder, under the account folder only for an account', async () => {
    answers(0, { loggedIn: true, authMethod: 'oauth_token' })
    const home = path.join(root, 'account')
    mkdirSync(home)
    expect(await claudeAuthStatus(home)).toBe(true)
    vi.stubEnv('CLAUDE_CONFIG_DIR', undefined)
    expect(await claudeAuthStatus()).toBe(true)
    expect(logged()).toEqual([
      { dir: home, cwd: os.homedir(), args: ['auth', 'status'] },
      { dir: null, cwd: os.homedir(), args: ['auth', 'status'] }
    ])
  })

  it('reads signed out from exit 1, and nothing from a CLI that cannot answer', async () => {
    const home = path.join(root, 'account')
    mkdirSync(home)
    answers(1, { loggedIn: false, authMethod: 'none' })
    expect(await claudeAuthStatus(home)).toBe(false)
    fakeClaude(`process.stderr.write('unknown command'); process.exit(1)`)
    expect(await claudeAuthStatus(home)).toBeNull()
    rmSync(path.join(bin, 'claude'))
    expect(await claudeAuthStatus(home)).toBeNull()
  })

  it('does not bring back the folder of an account being removed', async () => {
    answers(1, { loggedIn: false })
    const home = path.join(root, 'removed')
    expect(await claudeAuthStatus(home)).toBe(false)
    expect(existsSync(home)).toBe(false)
  })
})

describe('Claude sign-in without a subscription', () => {
  it('takes a subscription at its word, without the CLI', async () => {
    answers(1, { loggedIn: false })
    const home = path.join(root, 'account')
    mkdirSync(home)
    writeFileSync(path.join(home, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'token' } }))
    expect(await claudeSignedIn(home)).toBe(true)
    expect(logged()).toEqual([])
  })

  it('counts a key the CLI accepts as signed in, with no quota to read', async () => {
    const home = path.join(root, 'account')
    mkdirSync(home)
    answers(0, { loggedIn: true, authMethod: 'api_key' })
    expect(await claudeSignedIn(home)).toBe(true)
    expect(await readClaudeUsage(home)).toEqual({ signedIn: true, windows: [], plan: null })
    answers(1, { loggedIn: false })
    expect(await claudeSignedIn(home)).toBe(false)
    expect(await readClaudeUsage(home)).toEqual({ signedIn: false })
    fakeClaude('process.exit(3)')
    expect(await claudeSignedIn(home)).toBeNull()
    await expect(readClaudeUsage(home)).rejects.toThrow()
  })
})
