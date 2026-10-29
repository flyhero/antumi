import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { McpEnvKey, McpHeaderName, McpServerName, type AgentKind, type McpImportCandidate, type McpImportItem, type McpServer, type McpServerInput, type McpTransport } from '@antumi/protocol'
import { planLaunch, readJsonIfExists } from '@antumi/protocol/node'
import type { ResolvedMcpServer } from './mcp-servers'
import { Rejection } from './rejection'
import { geminiHome } from './agents/gemini/gemini-cli'

// A server as an agent's own configuration has it, values and all: read again at import, never
// kept, never sent to a client.
export type FoundMcpServer = { source: AgentKind; name: string; transport: ResolvedMcpServer['transport'] | null; problem: string | null }

type Where = { env?: NodeJS.ProcessEnv; homedir?: string; codex?: () => Promise<string> }

// Claude Code's, Cursor's and Antigravity's: an mcpServers object, as each documents it.
const JsonEntry = z.looseObject({
  type: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).catch([]).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).catch({}).optional(),
  url: z.string().optional(),
  // Gemini's legacy name for a streamable HTTP endpoint.
  httpUrl: z.string().optional(),
  // Antigravity's name for url.
  serverUrl: z.string().optional(),
  disabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  bearerTokenEnvVar: z.string().optional(),
  headers: z.record(z.string(), z.string()).catch({}).optional()
})
const JsonConfig = z.looseObject({ mcpServers: z.record(z.string(), z.unknown()).catch({}).optional() })

function fromJson(source: AgentKind, name: string, raw: unknown): FoundMcpServer {
  const parsed = JsonEntry.safeParse(raw)
  if (!parsed.success) return { source, name, transport: null, problem: '读不懂这一项' }
  const entry = parsed.data
  if (entry.bearerTokenEnvVar) return { source, name, transport: null, problem: '令牌从环境变量读取，请在 Antumi 里手动添加' }
  if (entry.type === 'sse') return { source, name, transport: null, problem: 'Antumi 不支持 SSE 传输' }
  if (entry.command) return { source, name, transport: { type: 'stdio', command: entry.command, args: entry.args ?? [], cwd: entry.cwd ?? null, env: entry.env ?? {} }, problem: null }
  const url = entry.httpUrl ?? entry.url ?? entry.serverUrl
  if (url) return { source, name, transport: { type: 'http', url, headers: entry.headers ?? {} }, problem: null }
  return { source, name, transport: null, problem: '既没有命令也没有地址' }
}

async function readJsonServers(source: AgentKind, file: string): Promise<FoundMcpServer[]> {
  const parsed = JsonConfig.safeParse(await readJsonIfExists(file).catch(() => undefined))
  // What the user turned off is not in use.
  return Object.entries(parsed.data?.mcpServers ?? {}).filter(([, raw]) => {
    const entry = JsonEntry.safeParse(raw).data
    return entry?.disabled !== true && entry?.enabled !== false
  }).map(([name, raw]) => fromJson(source, name, raw))
}

// ZCode's: an mcp.servers object in its CLI settings, each turned off with enabled: false.
const ZCodeConfig = z.looseObject({ mcp: z.looseObject({ servers: z.record(z.string(), z.unknown()).catch({}).optional() }).optional() })

async function readZCodeServers(file: string): Promise<FoundMcpServer[]> {
  const parsed = ZCodeConfig.safeParse(await readJsonIfExists(file).catch(() => undefined))
  return Object.entries(parsed.data?.mcp?.servers ?? {})
    .filter(([, raw]) => z.looseObject({ enabled: z.boolean().optional() }).safeParse(raw).data?.enabled !== false)
    .map(([name, raw]) => fromJson('zcode', name, raw))
}

// Codex's, as its own CLI lists them: config.toml is TOML, and the CLI knows its overrides.
const CodexEntry = z.looseObject({
  name: z.string(),
  enabled: z.boolean().catch(true),
  transport: z.discriminatedUnion('type', [
    z.looseObject({ type: z.literal('stdio'), command: z.string(), args: z.array(z.string()).catch([]), env: z.record(z.string(), z.string()).nullish(), cwd: z.string().nullish() }),
    z.looseObject({ type: z.literal('streamable_http'), url: z.string(), http_headers: z.record(z.string(), z.string()).nullish(), bearer_token_env_var: z.string().nullish(), env_http_headers: z.record(z.string(), z.string()).nullish() })
  ]).nullable().catch(null)
})

function fromCodex(raw: unknown, codexHome: string): FoundMcpServer | null {
  const parsed = CodexEntry.safeParse(raw)
  if (!parsed.success) return null
  const { name, enabled, transport } = parsed.data
  // What the ChatGPT app and Codex's own plugins add are theirs to run, not the user's; what the
  // user turned off in Codex is not in use.
  if (!enabled || (transport?.type === 'stdio' && (transport.cwd?.startsWith(codexHome) || transport.env?.CODEX_HOME !== undefined))) return null
  if (!transport) return { source: 'codex', name, transport: null, problem: '读不懂这一项' }
  if (transport.type === 'stdio') return { source: 'codex', name, transport: { type: 'stdio', command: transport.command, args: transport.args, cwd: transport.cwd ?? null, env: transport.env ?? {} }, problem: null }
  // A token Codex reads from its own environment has no value here to take.
  if (transport.bearer_token_env_var || Object.keys(transport.env_http_headers ?? {}).length) {
    return { source: 'codex', name, transport: null, problem: '令牌从环境变量读取，请在 Antumi 里手动添加' }
  }
  return { source: 'codex', name, transport: { type: 'http', url: transport.url, headers: transport.http_headers ?? {} }, problem: null }
}

const runCodex = async () => {
  const launch = planLaunch('codex', ['mcp', 'list', '--json'], os.homedir(), process.env)
  const { stdout } = await promisify(execFile)(launch.file, launch.args, { env: launch.env, timeout: 15_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })
  return stdout
}

// Every server in the agents' own user-wide configuration. Never throws: an agent not
// installed, or a file it cannot read, has none to offer.
export async function findAgentMcpServers({ env = process.env, homedir = os.homedir(), codex = runCodex }: Where = {}): Promise<FoundMcpServer[]> {
  const claudeFile = path.join(env.CLAUDE_CONFIG_DIR || homedir, '.claude.json')
  const codexHome = env.CODEX_HOME || path.join(homedir, '.codex')
  const codexServers = codex().then((out) => {
    const listed: unknown = JSON.parse(out)
    return Array.isArray(listed) ? listed.flatMap((entry) => fromCodex(entry, codexHome) ?? []) : []
  }).catch(() => [])
  const found = await Promise.all([readJsonServers('claude', claudeFile), codexServers, readJsonServers('cursor', path.join(homedir, '.cursor', 'mcp.json')),
    readJsonServers('antigravity', path.join(env.GEMINI_HOME || path.join(homedir, '.gemini'), 'config', 'mcp_config.json')),
    readZCodeServers(env.ZCODE_CLI_SETTINGS_FILE?.trim() || path.join(homedir, '.zcode', 'cli', 'config.json')),
    readJsonServers('kimi', path.join(env.KIMI_CODE_HOME || path.join(homedir, '.kimi-code'), 'mcp.json')),
    readJsonServers('gemini', path.join(geminiHome(env, homedir), 'settings.json'))])
  return found.flat()
}

// A name Antumi takes: lowercase, digits, - and _, not Antumi's own.
export function suggestedMcpName(name: string): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+/, '').slice(0, 32).replace(/[-_]+$/, '')
  return McpServerName.safeParse(slug).success ? slug : null
}

// Keys an env or a header must have to be kept; a server with another is not taken in whole.
function badKeys(transport: ResolvedMcpServer['transport']): string | null {
  const keys = transport.type === 'stdio' ? Object.keys(transport.env) : Object.keys(transport.headers)
  const valid = transport.type === 'stdio' ? McpEnvKey : McpHeaderName
  const bad = keys.filter((key) => !valid.safeParse(key).success)
  return bad.length ? `${bad.join('、')} 不是有效的${transport.type === 'stdio' ? '环境变量名' : '请求头名'}` : null
}

// What the user is shown: names and keys, no value.
export function importCandidate(found: FoundMcpServer, taken: readonly McpServer[]): McpImportCandidate {
  const transport: McpTransport = !found.transport
    ? { type: 'stdio', command: '', args: [], cwd: null, envKeys: [] }
    : found.transport.type === 'stdio'
      ? { type: 'stdio', command: found.transport.command, args: found.transport.args, cwd: found.transport.cwd, envKeys: Object.keys(found.transport.env) }
      : { type: 'http', url: found.transport.url, headerKeys: Object.keys(found.transport.headers) }
  const suggested = suggestedMcpName(found.name)
  const free = suggested && !taken.some((server) => server.name === suggested) ? suggested : null
  const problem = found.problem ?? (found.transport ? badKeys(found.transport) : null) ?? (suggested ? null : '名字里没有能用的字母或数字')
  return { source: found.source, name: found.name, suggestedName: free, transport, problem }
}

// The edit that takes a found server in under the name the user chose.
export function importInput(found: FoundMcpServer, item: McpImportItem, agents: readonly AgentKind[]): McpServerInput {
  const transport = found.transport
  if (!transport || found.problem || badKeys(transport)) throw new Rejection('mcp-import-unsupported', `${found.name} 不能导入`)
  return {
    name: item.as,
    previousName: null,
    enabled: true,
    agents: [...agents],
    transport: transport.type === 'stdio'
      ? { type: 'stdio', command: transport.command, args: transport.args, cwd: transport.cwd, env: Object.entries(transport.env).map(([key, value]) => ({ key, value })) }
      : { type: 'http', url: transport.url, headers: Object.entries(transport.headers).map(([key, value]) => ({ key, value })) }
  }
}
