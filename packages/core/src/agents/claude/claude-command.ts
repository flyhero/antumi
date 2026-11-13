import { RESERVED_MCP_SERVER_NAME } from '@antumi/protocol'
import { antumiReadTools, type AgentCommand } from '../../agent-command'
import { startNote } from '../../agent-prompt'
import type { AgentLaunch } from '../agent-adapter'
import { claudeModelId, claudeProviderEnv } from './claude-provider'
import { CLAUDE_MODE_NAMES } from './claude-stream'

// Claude splits these lists on commas, so a path with one in it is left out rather than garbled.
const usable = (paths: readonly string[]) => paths.filter((file) => !file.includes(','))

// An absolute path as Claude's permission rules match it, or null. Claude normalises a Windows path
// to POSIX form first (C:\Users becomes /c/Users); a network path it never pre-approves anyway.
export function claudeRulePath(file: string): string | null {
  if (file.startsWith('/')) return file
  const drive = /^([A-Za-z]):[\\/]/.exec(file)
  return drive ? `/${drive[1]?.toLowerCase()}/${file.slice(3).replaceAll('\\', '/')}` : null
}

// `//` starts an absolute path in Claude's permission rules.
const rulePaths = (paths: readonly string[]) => usable(paths).flatMap((each) => claudeRulePath(each) ?? [])

// Claude may read exactly these files without asking; nothing else in the attachment folder.
export function claudeReadRules(files: readonly string[]): string[] {
  return rulePaths(files).map((file) => `Read(/${file})`)
}

// Claude may edit nothing under these folders, whatever mode it is switched to. Its plan drafts go
// to ~/.claude/plans instead, so plan mode still works; an Edit rule covers every editing tool.
export function claudeEditDenials(dirs: readonly string[]): string[] {
  return rulePaths(dirs).map((dir) => `Edit(/${dir.replace(/\/$/, '')}/**)`)
}

// Read-only git lets the agent look at a dependency's branch without a prompt.
export const GIT_READ_TOOLS = ['Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git show:*)']
// A read-only worker reads wherever it needs to without asking, as Codex's read-only sandbox does: in
// its own folders its edits are denied, elsewhere they still ask, and so do commands that may write.
export const READ_ANYWHERE_TOOLS = ['Read', 'Glob', 'Grep']

// Claude Code in print mode, speaking stream-json both ways.
export function claudeCommand(launch: AgentLaunch): AgentCommand {
  const { providerSessionId, resume, handoffPath, extraProjects, preferred = {}, planOnly, readOnly, readable = [], references = [], mcp, userMcp = [], forkAt, userBrowser, knowledgeBase, skills, todos = true, provider } = launch
  // Folders it may read but never edit: a plan-only stage's, or a read-only worker's.
  const fenced = planOnly ?? readOnly
  const allowBypass = (launch.allowBypass ?? false) && !fenced
  // A remembered bypass needs the user's say-so for this start too. Asking goes by manual on
  // the command line, and is passed too, so Claude Code's own default mode cannot override it.
  const chosen = preferred.permissionMode && (preferred.permissionMode !== 'bypass' || allowBypass) ? preferred.permissionMode : undefined
  const allowed = planOnly ? 'plan' : chosen
  const wanted = allowed === 'ask' ? 'manual' : allowed ? CLAUDE_MODE_NAMES[allowed] : undefined
  const reads = [
    ...(handoffPath ? claudeReadRules([handoffPath]) : []),
    ...claudeReadRules(readable),
    // Planning around what dependencies left on their branches means reading git history.
    ...(fenced ? GIT_READ_TOOLS : []),
    ...(readOnly ? READ_ANYWHERE_TOOLS : []),
    // The vault it may not write is readable without asking, and without being a working
    // folder: as one, Claude would load the vault's own skills too.
    ...(knowledgeBase && !knowledgeBase.write ? claudeReadRules([`${knowledgeBase.path}/**`]) : []),
    // Reference projects likewise: read without asking, never a working folder.
    ...claudeReadRules(references.map((dir) => `${dir}/**`)),
    // Antumi's tools that only read ask nothing; opening and acting on a page go through Claude's
    // own confirmation, and running a terminal command is the agent's to ask about, under the mode
    // the user set. (Codex asks nothing for Antumi's MCP tools, so for it the site gate in core is
    // the only check.)
    ...(mcp ? antumiReadTools(todos).map((tool) => `mcp__${RESERVED_MCP_SERVER_NAME}__${tool}`) : [])
  ]
  const denials = claudeEditDenials([...(fenced?.dirs ?? []), ...references])
  const note = startNote({ knowledgeBase, instructions: launch.instructions, todos: Boolean(mcp) && todos })
  const servers = {
    ...(mcp ? { [RESERVED_MCP_SERVER_NAME]: { type: 'stdio', command: mcp.command, args: mcp.args, ...(mcp.env ? { env: mcp.env } : {}) } } : {}),
    ...Object.fromEntries(userMcp.map((server) => [server.name, server.type === 'stdio' ? { type: 'stdio', command: server.command, args: server.args, ...(server.env ? { env: server.env } : {}) } : { type: 'http', url: server.url }]))
  }
  // On a provider its default is named outright: Claude Code's own would be one of Anthropic's.
  const providerDefault = provider?.models.find((model) => model.id === provider.defaultModel)
  const model = preferred.model ?? (providerDefault ? claudeModelId(providerDefault) : undefined)
  // A provider is reached with a key, not an account: it takes the place of one.
  const env = provider ? claudeProviderEnv(provider) : launch.account?.env
  return { command: 'claude', ...(env ? { env } : {}), args: [
    '-p', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json',
    '--include-partial-messages', '--permission-prompt-tool', 'stdio',
    // Makes bypass a mode the user can switch to, without starting in it.
    ...(allowBypass ? ['--allow-dangerously-skip-permissions'] : []),
    ...(wanted ? ['--permission-mode', wanted] : []),
    ...(model ? ['--model', model] : []),
    ...(preferred.effort ? ['--effort', preferred.effort] : []),
    ...(resume && providerSessionId ? ['--resume', providerSessionId, ...(forkAt ? ['--resume-session-at', forkAt, '--fork-session'] : [])] : providerSessionId ? ['--session-id', providerSessionId] : []),
    ...extraProjects.flatMap((project) => ['--add-dir', project]),
    // A vault it may write is a working folder, edits in it going by the mode as a project's do.
    ...(knowledgeBase?.write ? ['--add-dir', knowledgeBase.path] : []),
    ...(note ? ['--append-system-prompt', note] : []),
    // Antumi's skills as a plugin: read, not a working folder.
    ...(skills ? ['--plugin-dir', skills.dir] : []),
    ...(denials.length ? ['--disallowedTools', denials.join(',')] : []),
    ...(reads.length ? ['--allowedTools', reads.join(',')] : []),
    // Beside the user's own MCP configuration, which Claude still loads: not --strict-mcp-config.
    ...(Object.keys(servers).length ? ['--mcp-config', JSON.stringify({ mcpServers: servers })] : []),
    // Claude in Chrome, either way, so Antumi's setting wins over Claude Code's own default.
    ...(userBrowser === undefined ? [] : [userBrowser ? '--chrome' : '--no-chrome'])
  ] }
}
