import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { PI_CONFIG_ENV, PI_EXTENSION_SOURCE, type PiExtensionConfig } from './pi-extension'

type Handler = (event: { toolName: string; input: Record<string, unknown> }) => Promise<{ block: true; reason: string } | undefined>
type Command = { handler: (args: string) => Promise<void> }

const dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-pi-extension-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let loads = 0

// The extension as Pi loads it, with the config of one start, into a stand-in for Pi's API.
async function load(config: PiExtensionConfig) {
  const file = path.join(dir, `extension-${++loads}.mjs`)
  writeFileSync(file, PI_EXTENSION_SOURCE)
  process.env[PI_CONFIG_ENV] = JSON.stringify(config)
  const extension: { default: (pi: unknown) => void } = await import(pathToFileURL(file).href)
  const servers: Array<[string, unknown]> = []
  const providers: Array<[string, unknown]> = []
  const commands = new Map<string, Command>()
  let toolCall: Handler = async () => undefined
  extension.default({
    registerMcpServer: (name: string, server: unknown) => servers.push([name, server]),
    registerProvider: (name: string, provider: unknown) => providers.push([name, provider]),
    registerCommand: (name: string, command: Command) => commands.set(name, command),
    on: (event: string, handler: Handler) => { if (event === 'tool_call') toolCall = handler }
  })
  const blocked = async (toolName: string, input: Record<string, unknown> = {}) => (await toolCall({ toolName, input }))?.reason ?? null
  return { servers, providers, commands, blocked }
}

const CONFIG: PiExtensionConfig = { mode: 'ask', servers: {}, noEdit: [], workDirs: [], readTools: ['mcp__antumi__show_preview'] }

const PROVIDER = { name: 'antumi-glm', baseUrl: 'https://open.bigmodel.cn/api/anthropic', api: 'anthropic-messages' as const, bearer: true, headers: {}, models: [] }
const KEY = 'ANTUMI_MODEL_PROVIDER_KEY'

describe('Antumi extension for Pi', () => {
  it('registers the model provider with its key, then takes the key out of the environment Pi starts tools in', async () => {
    process.env[KEY] = 'sk-secret'
    const { providers } = await load({ ...CONFIG, provider: PROVIDER })
    expect(providers).toEqual([['antumi-glm', { name: 'antumi-glm', baseUrl: 'https://open.bigmodel.cn/api/anthropic', api: 'anthropic-messages', apiKey: 'sk-secret', headers: { authorization: 'Bearer sk-secret' }, models: [] }]])
    expect(process.env[KEY]).toBeUndefined()
  })

  it('keeps a key Pi would read as a variable or a command its own', async () => {
    process.env[KEY] = '$dollar'
    expect((await load({ ...CONFIG, provider: { ...PROVIDER, bearer: false } })).providers[0]?.[1]).toMatchObject({ apiKey: '$$dollar' })
    process.env[KEY] = '!bang'
    expect((await load({ ...CONFIG, provider: { ...PROVIDER, bearer: false } })).providers[0]?.[1]).toMatchObject({ apiKey: '$ANTUMI_MODEL_PROVIDER_KEY' })
    expect(process.env[KEY]).toBe('!bang')
    delete process.env[KEY]
  })

  it('brings Antumi MCP servers in as tools the model sees', async () => {
    const { servers } = await load({ ...CONFIG, servers: { antumi: { command: 'node', args: ['mcp.mjs'] }, docs: { url: 'https://docs.example/mcp' } } })
    expect(servers).toEqual([['antumi', { command: 'node', args: ['mcp.mjs'], exposure: 'direct' }], ['docs', { url: 'https://docs.example/mcp', exposure: 'direct' }]])
  })

  it('lets everything through by default, but edits in a read-only folder', async () => {
    const { blocked } = await load({ ...CONFIG, noEdit: ['/vault'] })
    expect(await blocked('bash', { command: 'rm -rf build' })).toBeNull()
    expect(await blocked('write', { path: 'src/a.ts' })).toBeNull()
    expect(await blocked('edit', { path: '/vault/note.md' })).toMatch(/只读文件夹/)
    expect(await blocked('write', { path: '/vault-other/note.md' })).toBeNull()
  })

  it('edits only in its folders in the automatic mode, and runs any command', async () => {
    const { blocked } = await load({ ...CONFIG, mode: 'acceptEdits', workDirs: ['/work/other'] })
    expect(await blocked('edit', { path: 'src/a.ts' })).toBeNull()
    expect(await blocked('write', { path: path.join(process.cwd(), 'b.ts') })).toBeNull()
    expect(await blocked('write', { path: '/work/other/c.ts' })).toBeNull()
    expect(await blocked('write', { path: '/etc/hosts' })).toMatch(/项目外/)
    expect(await blocked('edit', { path: '../outside.ts' })).toMatch(/项目外/)
    expect(await blocked('bash', { command: 'rm -rf build' })).toBeNull()
  })

  it('refuses in plan mode what would change anything', async () => {
    const { blocked } = await load({ ...CONFIG, mode: 'plan' })
    for (const tool of ['read', 'grep', 'find', 'ls', 'mcp__antumi__show_preview']) expect(await blocked(tool, { path: 'a' })).toBeNull()
    for (const command of ['git log --oneline', 'rg TODO src', 'ls -la', 'find . -name "*.ts"']) expect(await blocked('bash', { command })).toBeNull()
    for (const command of ['rm a', 'git commit -m x', 'cat a > b', 'ls; rm a', 'find . -delete', 'echo $(rm a)', 'git branch new']) expect(await blocked('bash', { command })).toMatch(/规划模式/)
    expect(await blocked('edit', { path: 'a' })).toMatch(/规划模式/)
    expect(await blocked('mcp__antumi__terminal_run', { command: 'ls' })).toMatch(/规划模式/)
  })

  it('switches mode by its command, which takes only Antumi modes', async () => {
    const { commands, blocked } = await load(CONFIG)
    const command = commands.get('antumi-mode')
    await command?.handler('readOnly')
    expect(await blocked('write', { path: 'a' })).toMatch(/只读模式/)
    await expect(command?.handler('yolo') ?? Promise.resolve()).rejects.toThrow(/unknown mode/)
    await command?.handler(' bypass ')
    expect(await blocked('write', { path: 'a' })).toBeNull()
  })
})
