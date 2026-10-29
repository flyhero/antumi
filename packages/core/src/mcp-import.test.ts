import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CredentialStore } from './credential-store'
import { findAgentMcpServers, importCandidate, suggestedMcpName } from './mcp-import'
import { McpServerStore } from './mcp-servers'

let home: string
beforeEach(() => { home = mkdtempSync(path.join(os.tmpdir(), 'antumi-mcp-import-')) })
afterEach(() => rmSync(home, { recursive: true, force: true }))

const codexList = (home: string) => JSON.stringify([
  { name: 'linear', enabled: true, transport: { type: 'streamable_http', url: 'https://mcp.linear.app/mcp', http_headers: { Authorization: 'Bearer lin' }, bearer_token_env_var: null, env_http_headers: null } },
  { name: 'sentry', enabled: true, transport: { type: 'streamable_http', url: 'https://mcp.sentry.dev/mcp', http_headers: null, bearer_token_env_var: 'SENTRY_TOKEN', env_http_headers: null } },
  { name: 'code-review', enabled: false, transport: { type: 'stdio', command: '/bin/sh', args: [], env: null, cwd: path.join(home, '.codex', 'plugins', 'cache', 'x') } },
  { name: 'node_repl', enabled: true, transport: { type: 'stdio', command: 'node', args: [], env: { CODEX_HOME: '/x' }, cwd: null } }
])

describe('the agents\' own MCP servers', () => {
  it('reads Gemini settings from its relocated CLI home, leaving disabled and SSE servers unavailable', async () => {
    const cliHome = path.join(home, 'custom-gemini')
    mkdirSync(path.join(cliHome, '.gemini'), { recursive: true })
    writeFileSync(path.join(cliHome, '.gemini', 'settings.json'), JSON.stringify({ mcpServers: {
      local: { command: 'node', args: ['server.js'], env: { KEY: 'fixture-only' } },
      legacyHttp: { httpUrl: 'https://example.com/mcp' },
      off: { command: 'off', disabled: true },
      streaming: { type: 'sse', url: 'https://example.com/events' }
    } }))
    const found = await findAgentMcpServers({ env: { GEMINI_CLI_HOME: cliHome }, homedir: home, codex: async () => '[]' })
    expect(found).toEqual([
      { source: 'gemini', name: 'local', transport: { type: 'stdio', command: 'node', args: ['server.js'], cwd: null, env: { KEY: 'fixture-only' } }, problem: null },
      { source: 'gemini', name: 'legacyHttp', transport: { type: 'http', url: 'https://example.com/mcp', headers: {} }, problem: null },
      { source: 'gemini', name: 'streaming', transport: null, problem: 'Antumi 不支持 SSE 传输' }
    ])
    expect(await findAgentMcpServers({ env: {}, homedir: home, codex: async () => '[]' })).toEqual([])
  })
  it('reads Kimi Code’s mcp.json from its configured home without importing disabled servers', async () => {
    const kimiHome = path.join(home, 'custom-kimi')
    mkdirSync(kimiHome)
    writeFileSync(path.join(kimiHome, 'mcp.json'), JSON.stringify({ mcpServers: {
      docs: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer test-only' } },
      local: { command: 'node', args: ['server.js'], env: { KEY: 'test-only' } },
      off: { command: 'off', enabled: false },
      oldOff: { command: 'off', disabled: true },
      token: { type: 'http', url: 'https://example.com/private', bearerTokenEnvVar: 'MY_TOKEN' }
    } }))
    expect(await findAgentMcpServers({ env: { KIMI_CODE_HOME: kimiHome }, homedir: home, codex: async () => '[]' })).toEqual([
      { source: 'kimi', name: 'docs', transport: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer test-only' } }, problem: null },
      { source: 'kimi', name: 'local', transport: { type: 'stdio', command: 'node', args: ['server.js'], cwd: null, env: { KEY: 'test-only' } }, problem: null },
      { source: 'kimi', name: 'token', transport: null, problem: '令牌从环境变量读取，请在 Antumi 里手动添加' }
    ])
    expect(await findAgentMcpServers({ env: {}, homedir: home, codex: async () => '[]' })).toEqual([])
  })

  it('reads Claude\'s, Codex\'s and Cursor\'s, values and all, leaving what the apps bundle', async () => {
    writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: {
      github: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'ghp' } },
      Old: { type: 'sse', url: 'https://old.example.com/sse' }
    } }))
    mkdirSync(path.join(home, '.cursor'))
    writeFileSync(path.join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { 'Context7.Docs': { url: 'https://mcp.context7.com/mcp' } } }))
    const found = await findAgentMcpServers({ env: {}, homedir: home, codex: async () => codexList(home) })
    expect(found).toEqual([
      { source: 'claude', name: 'github', transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], cwd: null, env: { GITHUB_TOKEN: 'ghp' } }, problem: null },
      { source: 'claude', name: 'Old', transport: null, problem: 'Antumi 不支持 SSE 传输' },
      { source: 'codex', name: 'linear', transport: { type: 'http', url: 'https://mcp.linear.app/mcp', headers: { Authorization: 'Bearer lin' } }, problem: null },
      { source: 'codex', name: 'sentry', transport: null, problem: '令牌从环境变量读取，请在 Antumi 里手动添加' },
      { source: 'cursor', name: 'Context7.Docs', transport: { type: 'http', url: 'https://mcp.context7.com/mcp', headers: {} }, problem: null }
    ])
  })

  it('reads Antigravity\'s, whose address is serverUrl, leaving what the user turned off', async () => {
    mkdirSync(path.join(home, '.gemini', 'config'), { recursive: true })
    writeFileSync(path.join(home, '.gemini', 'config', 'mcp_config.json'), JSON.stringify({ mcpServers: {
      docs: { serverUrl: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer x' } },
      fs: { command: 'npx', args: ['-y', 'fs-server'] },
      off: { command: 'off', disabled: true }
    } }))
    expect(await findAgentMcpServers({ env: {}, homedir: home, codex: async () => '[]' })).toEqual([
      { source: 'antigravity', name: 'docs', transport: { type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer x' } }, problem: null },
      { source: 'antigravity', name: 'fs', transport: { type: 'stdio', command: 'npx', args: ['-y', 'fs-server'], cwd: null, env: {} }, problem: null }
    ])
  })

  it('reads ZCode\'s mcp.servers, leaving what the user turned off', async () => {
    mkdirSync(path.join(home, '.zcode', 'cli'), { recursive: true })
    writeFileSync(path.join(home, '.zcode', 'cli', 'config.json'), JSON.stringify({ features: { mcp: true }, mcp: { servers: {
      fs: { type: 'stdio', command: 'node', args: ['/srv/fs.mjs'], env: { ROOT: '/data' }, enabled: true, timeoutMs: 30000 },
      docs: { type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer z' } },
      off: { type: 'stdio', command: 'off', enabled: false }
    } } }))
    expect(await findAgentMcpServers({ env: {}, homedir: home, codex: async () => '[]' })).toEqual([
      { source: 'zcode', name: 'fs', transport: { type: 'stdio', command: 'node', args: ['/srv/fs.mjs'], cwd: null, env: { ROOT: '/data' } }, problem: null },
      { source: 'zcode', name: 'docs', transport: { type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer z' } }, problem: null }
    ])
  })

  it('finds none where nothing is installed', async () => {
    expect(await findAgentMcpServers({ env: {}, homedir: home, codex: async () => { throw new Error('codex: not found') } })).toEqual([])
  })

  it('shows keys, never values, and a name Antumi can take', () => {
    const candidate = importCandidate({ source: 'cursor', name: 'Context7.Docs', transport: { type: 'http', url: 'https://mcp.context7.com/mcp', headers: { Authorization: 'Bearer x' } }, problem: null }, [])
    expect(candidate).toEqual({ source: 'cursor', name: 'Context7.Docs', suggestedName: 'context7-docs', transport: { type: 'http', url: 'https://mcp.context7.com/mcp', headerKeys: ['Authorization'] }, problem: null })
    expect(suggestedMcpName('antumi')).toBeNull()
    expect(suggestedMcpName('我的')).toBeNull()
  })

  it('takes a server in with its values, for the agents the user picked', async () => {
    const credentials = new CredentialStore(path.join(home, 'credentials.json'))
    const found = async () => findAgentMcpServers({ env: {}, homedir: home, codex: async () => codexList(home) })
    const store = new McpServerStore(path.join(home, 'mcp-servers.json'), credentials, () => {}, found)
    const [saved] = await store.import([{ source: 'codex', name: 'linear', as: 'linear' }], ['claude', 'cursor'])
    expect(saved).toMatchObject({ name: 'linear', agents: ['claude', 'cursor'], transport: { type: 'http', headerKeys: ['Authorization'] } })
    expect(store.resolve('linear')?.transport).toMatchObject({ headers: { Authorization: 'Bearer lin' } })
    expect((await store.importable()).find((each) => each.name === 'linear')?.suggestedName).toBeNull()
    await expect(store.import([{ source: 'codex', name: 'sentry', as: 'sentry' }], ['claude'])).rejects.toMatchObject({ reason: 'mcp-import-unsupported' })
  })
})
