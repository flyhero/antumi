import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PROVIDER_KEY_ENV } from '../../provider-launch'
import type { AgentStage } from '../agent-adapter'
import { clearMcpReadyFile } from '../mcp-ready-file'
import { PI_FENCED_MODES, PI_MODE_COMMAND, PI_MODES, type PiMode } from './pi-modes'
import type { PiProviderModel } from './pi-models'

// An MCP server as Pi's registerMcpServer takes one: the shape of its mcp.json.
export type PiMcpServer = { command: string; args: string[]; env?: Record<string, string> } | { url: string }

// What the extension is told, through ANTUMI_PI in Pi's environment: one process's mode, servers
// and fences, so the file itself is the same for every start.
export type PiExtensionConfig = {
  mode: PiMode
  servers: Record<string, PiMcpServer>
  // Folders no edit or write may touch, in any mode.
  noEdit: string[]
  // Folders besides its own that acceptEdits lets it edit: the other projects, a vault it may write.
  workDirs: string[]
  // MCP tools, as Pi names them, that plan and readOnly still allow.
  readTools: string[]
  // A model provider to run on, without its key, which comes in PROVIDER_KEY_ENV.
  provider?: PiProvider
}

// A model provider as registerProvider takes one, but the key. bearer: the provider takes the key
// as a bearer token over Anthropic's API, which sends it as x-api-key.
export type PiProvider = { name: string; baseUrl: string; api: 'openai-completions' | 'openai-responses' | 'anthropic-messages'; bearer: boolean; headers: Record<string, string>; models: PiProviderModel[] }

export const PI_CONFIG_ENV = 'ANTUMI_PI'

// Pi's tools that only read; tool_search only loads other tools' descriptions.
const READ_TOOLS = ['read', 'grep', 'find', 'ls', 'tool_search']
// Commands that only read, as the first word of a command line with nothing chained or redirected.
const READ_COMMANDS = ['ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'rg', 'grep', 'tree', 'file', 'stat', 'which', 'du', 'df']
const GIT_READS = ['log', 'diff', 'show', 'status', 'blame', 'rev-parse', 'ls-files', 'grep', 'branch']

// Antumi's extension for Pi, which asks nothing itself: it brings Antumi's MCP servers in, as tools
// the model sees (Pi's default, codemode, hides them), and refuses in plan and readOnly what would
// change anything. Plain JavaScript Pi loads with --extension: no build step, no imports beyond
// Node's own.
export const PI_EXTENSION_SOURCE = `import path from 'node:path'

const config = JSON.parse(process.env.${PI_CONFIG_ENV} || '{}')
const MODES = new Set(${JSON.stringify(PI_MODES)})
const FENCED = new Set(${JSON.stringify(PI_FENCED_MODES)})
const READ_TOOLS = new Set(${JSON.stringify(READ_TOOLS)})
const READ_COMMANDS = new Set(${JSON.stringify(READ_COMMANDS)})
const GIT_READS = new Set(${JSON.stringify(GIT_READS)})
const FIND_ACTIONS = /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/
let mode = MODES.has(config.mode) ? config.mode : 'ask'

function readOnlyCommand(command) {
  if (typeof command !== 'string' || /[;&|<>\`$\\n\\\\]/.test(command)) return false
  const words = command.trim().split(/\\s+/)
  if (words[0] === 'git') return GIT_READS.has(words[1]) && (words[1] !== 'branch' || words.length === 2)
  if (words[0] === 'find') return !words.some((word) => FIND_ACTIONS.test(word))
  return READ_COMMANDS.has(words[0])
}

function inside(file, dir) {
  const relative = path.relative(dir, file)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function refusal(name, input) {
  const file = typeof input.path === 'string' ? path.resolve(process.cwd(), input.path) : null
  if ((name === 'edit' || name === 'write') && file && (config.noEdit || []).some((dir) => inside(file, dir))) {
    return input.path + ' 在只读文件夹里，不能修改（Antumi）'
  }
  if (mode === 'acceptEdits' && (name === 'edit' || name === 'write') && file && ![process.cwd(), ...(config.workDirs || [])].some((dir) => inside(file, dir))) {
    return input.path + ' 在项目外，自动模式下不能修改（Antumi）'
  }
  if (!FENCED.has(mode)) return null
  if (READ_TOOLS.has(name) || (config.readTools || []).includes(name)) return null
  if (name === 'bash' && readOnlyCommand(input.command)) return null
  const where = mode === 'plan' ? '规划模式' : '只读模式'
  const what = name === 'bash' ? '这条命令（只允许不带管道、重定向的只读命令）' : name
  return where + '下不能运行' + what + '：只读代码、搜索文件，不要修改任何东西（Antumi）'
}

// The provider's key goes to Pi's provider as it is, and out of the environment, so Pi's bash and
// the MCP servers it starts never see it. A key Pi would read as a command (!) is left to it to
// read from the environment. A leading $ is escaped as $$.
function registerProvider(pi, provider) {
  const key = process.env[${JSON.stringify(PROVIDER_KEY_ENV)}] || ''
  const command = key.startsWith('!')
  if (!command) delete process.env[${JSON.stringify(PROVIDER_KEY_ENV)}]
  const apiKey = command ? '$' + ${JSON.stringify(PROVIDER_KEY_ENV)} : key.startsWith('$') ? '$' + key : key
  pi.registerProvider(provider.name, {
    name: provider.name,
    baseUrl: provider.baseUrl,
    api: provider.api,
    apiKey,
    headers: { ...provider.headers, ...(provider.bearer ? { authorization: 'Bearer ' + key } : {}) },
    models: provider.models
  })
}

export default function antumi(pi) {
  if (config.provider) registerProvider(pi, config.provider)
  for (const [name, server] of Object.entries(config.servers || {})) {
    try {
      pi.registerMcpServer(name, { ...server, exposure: 'direct' })
    } catch (error) {
      console.error('antumi: MCP server ' + name + ' not registered: ' + (error && error.message ? error.message : error))
    }
  }
  pi.registerCommand(${JSON.stringify(PI_MODE_COMMAND)}, {
    description: 'Antumi: switch permission mode',
    handler: async (args) => {
      const next = String(args || '').trim()
      if (!MODES.has(next)) throw new Error('unknown mode: ' + next)
      mode = next
    }
  })
  pi.on('tool_call', async (event) => {
    const reason = refusal(event.toolName, event.input || event.args || {})
    return reason ? { block: true, reason } : undefined
  })
}
`

// Where one stage's start puts the extension: the conversation's own folder, beside its MCP ready file.
export function piExtensionFile(stage: Pick<AgentStage, 'sessionsRoot' | 'conversationId' | 'stageId'>): string {
  return path.join(stage.sessionsRoot, stage.conversationId, 'pi', `antumi-extension-${stage.stageId}.mjs`)
}

export async function writePiExtension(stage: Pick<AgentStage, 'sessionsRoot' | 'conversationId' | 'stageId'>): Promise<string> {
  const file = piExtensionFile(stage)
  // Makes the folder, private to the user, as the ready file's.
  await clearMcpReadyFile(file)
  await writeFile(file, PI_EXTENSION_SOURCE, { mode: 0o600 })
  return file
}
