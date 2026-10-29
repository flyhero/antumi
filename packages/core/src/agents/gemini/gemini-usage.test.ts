import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geminiHome } from './gemini-cli'
import { parseGeminiQuota, readGeminiOAuthClient, readGeminiUsage } from './gemini-usage'

const installed = vi.hoisted((): { command: string; home: string; auth: string | null; signedIn: boolean } => ({ command: '', home: '', auth: null, signedIn: false }))
vi.mock('./gemini-cli', () => ({ requireGemini: async () => installed.command, geminiHome: () => installed.home, geminiAuthType: async () => installed.auth, geminiSignedIn: async () => installed.signedIn }))
let root: string
let credentials: string
const quota = { buckets: [{ modelId: 'gemini-2.5-pro', remainingFraction: 0.75, resetTime: '2026-10-30T00:00:00Z' }, { modelId: 'gemini-3.8-flash', remainingFraction: 0.912 }, { modelId: 'unknown' }] }
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'antumi-gemini-usage-'))
  installed.home = path.join(root, '.gemini'); installed.auth = null; installed.signedIn = false
  vi.stubEnv('GEMINI_CLI_HOME', root)
  for (const key of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT_ID']) vi.stubEnv(key, '')
  await mkdir(geminiHome(), { recursive: true })
  credentials = path.join(geminiHome(), 'oauth_creds.json')
  installed.command = path.join(root, 'gemini.cmd')
  await writeFile(installed.command, '@echo off')
  const pkg = path.join(root, 'node_modules', '@google', 'gemini-cli')
  await mkdir(path.join(pkg, 'bundle'), { recursive: true })
  await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: '@google/gemini-cli' }))
  await writeFile(path.join(pkg, 'bundle', 'chunk-oauth.js'), 'var OAUTH_CLIENT_ID = "fixture-client"; var OAUTH_CLIENT_SECRET = "fixture-secret";')
})
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }) })
const signIn = async (data: object) => {
  installed.auth = 'oauth-personal'; installed.signedIn = true
  await writeFile(path.join(geminiHome(), 'settings.json'), JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
  await writeFile(credentials, JSON.stringify(data))
}

describe('Gemini quota', () => {
  it('reads daily per-model buckets, bounds percentages and rejects a malformed response', () => {
    expect(parseGeminiQuota(quota)).toEqual([
      { kind: 'daily', model: 'gemini-2.5-pro', usedPercent: 25, windowMinutes: 1440, resetsAt: Date.parse('2026-10-30T00:00:00Z') },
      { kind: 'daily', model: 'gemini-3.8-flash', usedPercent: 8.8, windowMinutes: 1440, resetsAt: null }
    ])
    expect(parseGeminiQuota({ buckets: [{ remainingFraction: 2 }, { remainingFraction: -1 }] }).map((window) => window.usedPercent)).toEqual([0, 100])
    expect(() => parseGeminiQuota({ error: 'oops' })).toThrow()
  })

  it('does not fetch quotas without OAuth, including API key and Vertex sign-ins', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await readGeminiUsage()).toEqual({ signedIn: false })
    vi.stubEnv('GEMINI_API_KEY', 'fixture-only')
    installed.auth = 'gemini-api-key'; installed.signedIn = true
    expect(await readGeminiUsage()).toEqual({ signedIn: true, windows: [], plan: null })
    await writeFile(path.join(geminiHome(), 'settings.json'), JSON.stringify({ security: { auth: { selectedType: 'vertex-ai' } } }))
    vi.stubEnv('GOOGLE_API_KEY', 'fixture-only')
    installed.auth = 'vertex-ai'
    expect(await readGeminiUsage()).toEqual({ signedIn: true, windows: [], plan: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('extracts the installed public OAuth client through an npm shim, without executing it', async () => {
    expect(await readGeminiOAuthClient(installed.command)).toEqual({ id: 'fixture-client', secret: 'fixture-secret' })
    await expect(readGeminiOAuthClient(path.join(root, 'missing'))).rejects.toThrow()
  })

  it('uses a fresh token and resolves the Code Assist project before reading quota', async () => {
    await signIn({ access_token: 'fresh', expiry_date: Date.now() + 3600000 })
    const fetch = vi.fn(async (url: string) => Response.json(url.endsWith(':loadCodeAssist') ? { cloudaicompanionProject: 'project-1', currentTier: { name: 'Free' } } : quota))
    vi.stubGlobal('fetch', fetch)
    expect(await readGeminiUsage()).toMatchObject({ signedIn: true, plan: 'Free', windows: [{ model: 'gemini-2.5-pro', usedPercent: 25 }, { model: 'gemini-3.8-flash' }] })
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota'])
  })

  it('refreshes expired tokens only in memory and reuses the refreshed token on the next poll', async () => {
    await signIn({ access_token: 'expired', expiry_date: 0, refresh_token: `refresh-${root}` })
    const before = await readFile(credentials, 'utf8')
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Response.json(url.endsWith('/token') ? { access_token: 'refreshed', expires_in: 3600 } : url.endsWith(':loadCodeAssist') ? { cloudaicompanionProject: { id: 'project-2' } } : quota)
    }))
    await readGeminiUsage()
    await readGeminiUsage()
    expect(calls.filter((call) => call.url.endsWith('/token'))).toHaveLength(1)
    expect(String(calls[0]!.init.body)).toContain('client_id=fixture-client')
    expect(new Headers(calls[1]!.init.headers).get('authorization')).toBe('Bearer refreshed')
    expect(calls[2]!.init.body).toBe('{"project":"project-2"}')
    expect(await readFile(credentials, 'utf8')).toBe(before)
  })

  it.each([400, 401])('reports a rejected refresh (%s) as auth-expired', async (status) => {
    await signIn({ refresh_token: `revoked-${root}` })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })))
    await expect(readGeminiUsage()).rejects.toMatchObject({ code: 'auth-expired' })
  })

  it('does not claim empty quotas on network failure or missing account onboarding', async () => {
    await signIn({ access_token: 'fresh', expiry_date: Date.now() + 3600000 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(readGeminiUsage()).rejects.toMatchObject({ code: 'request-failed' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})))
    await expect(readGeminiUsage()).rejects.toMatchObject({ code: 'request-failed' })
  })
})
