import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectGemini, geminiCatalog, geminiCompatible, geminiHome, geminiInstallation, geminiSignedIn } from './gemini-cli'
import { gemini } from './gemini-adapter'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'antumi-gemini-cli-'))
  vi.stubEnv('GEMINI_CLI_HOME', root)
  for (const name of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION']) vi.stubEnv(name, '')
  await mkdir(geminiHome(), { recursive: true })
})
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })
const settings = (selectedType: string) => writeFile(path.join(geminiHome(), 'settings.json'), JSON.stringify({ security: { auth: { selectedType } } }))

describe('Gemini CLI', () => {
  it('requires the verified ACP release', () => {
    for (const version of [null, 'invalid', '0.65.9', '0.66.0-preview.0']) expect(geminiCompatible(version)).toBe(false)
    for (const version of ['0.66.0', '0.67.0', '1.0.0']) expect(geminiCompatible(version)).toBe(true)
  })

  it.skipIf(process.platform === 'win32')('distinguishes missing, obsolete, unresponsive and compatible commands', async () => {
    const executable = (body: string) => writeFile(path.join(root, 'gemini'), `#!${process.execPath}\n${body}`, { mode: 0o755 })
    expect(await detectGemini(root, process.platform)).toMatchObject({ status: 'missing' })
    await executable("console.log('0.65.0')")
    expect(await detectGemini(root, process.platform)).toMatchObject({ problem: 'incompatible-version' })
    await executable('process.exit(1)')
    expect(await detectGemini(root, process.platform)).toMatchObject({ problem: 'probe-failed' })
    await executable("console.log('0.66.0-preview.0')")
    expect(await detectGemini(root, process.platform)).toMatchObject({ problem: 'incompatible-version', version: '0.66.0-preview.0' })
    await executable("console.log('0.66.0')")
    expect(await detectGemini(root, process.platform)).toMatchObject({ status: 'ok', version: '0.66.0', signedIn: false })
  })

  it('honours the relocated CLI home and does not probe a catalog or open OAuth when signed out', async () => {
    expect(geminiHome()).toBe(path.join(root, '.gemini'))
    expect(await geminiSignedIn()).toBe(false)
    vi.stubEnv('GOOGLE_GEMINI_BASE_URL', 'http://localhost:1234')
    expect(await geminiSignedIn()).toBe(false)
    expect(await geminiCatalog(root)).toBeNull()
    vi.stubEnv('GEMINI_API_KEY', 'test-only')
    expect(await geminiSignedIn()).toBe(true)
    await settings('oauth-personal')
    expect(await geminiSignedIn()).toBe(false)
    await writeFile(path.join(geminiHome(), 'oauth_creds.json'), '{}')
    expect(await geminiSignedIn()).toBe(true)
    await settings('vertex-ai')
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/credentials.json')
    expect(await geminiSignedIn()).toBe(true)
  })

  it('uses argv for directories with shell characters, supports installation and continues by handoff', () => {
    const command = gemini.command({ providerSessionId: 'old', resume: true, handoffPath: '/handoff.md', extraProjects: ['/other project;$(echo nope)'], references: ['/ref'], knowledgeBase: { path: '/vault', write: false } })
    expect(command).toEqual({ command: 'gemini', args: ['--acp', '--skip-trust', '--include-directories', '/other project;$(echo nope)', '--include-directories', '/ref', '--include-directories', '/vault'] })
    expect(gemini.session).toMatchObject({ nativeResume: false, nativeFork: 'none' })
    expect(geminiInstallation('win32').shell).toBe('powershell')
    expect(geminiInstallation('darwin').command).toBe('npm install -g @google/gemini-cli@latest')
  })

  it('runs a packaged MCP entry with Node instead of a flag Gemini strips from its environment', () => {
    const server = gemini.launch!.mcp({ command: '/Applications/Antumi.app/Contents/MacOS/Antumi', args: ['/app/mcp.mjs'], env: { ELECTRON_RUN_AS_NODE: '1', SCOPE: 'chat' } }, { sessionsRoot: root, conversationId: 'c', stageId: 's', planOnly: true })
    expect(server).toMatchObject({ command: 'node', env: { SCOPE: 'chat' }, args: expect.arrayContaining(['/app/mcp.mjs', '--ready-on-list', '--plan-only']) })
    expect(server.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
  })
})
