import {
  AGENT_CALL_TOOLS, BROWSER_HOST_TOOL, CODEX_IMAGE_GENERATION, MANAGEMENT_TOOLS, PULL_REQUEST_TOOLS, SQUAD_TOOL_NAMES,
  antumiToolName, browserToolKind, historyToolKind, isBrowserBookmarksTool, isPreviewTool, isTerminalRunTool, mcpToolParts, terminalToolKind, todoToolKind,
  type ChatItem
} from '@antumi/protocol'
import { fill, strings, t } from './i18n'

// Tool calls named as the computer's chat names them (desktop chat-tools.ts), in this app's words.

type Tool = Extract<ChatItem, { kind: 'tool' }>
type ToolName = keyof typeof strings.toolNames

// Both agents' own tool names; an unknown one shows as the agent named it.
const TOOL_NAMES: Record<string, ToolName> = {
  Bash: 'command', commandExecution: 'command', Monitor: 'monitor', Read: 'read', imageView: 'viewImage', [CODEX_IMAGE_GENERATION]: 'generateImage',
  Write: 'write', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'editNotebook', fileChange: 'modifyFiles', mcpToolCall: 'mcpTool',
  Grep: 'search', Glob: 'findFiles', WebFetch: 'readPage', WebSearch: 'searchWeb', webSearch: 'searchWeb', Task: 'subAgent', Agent: 'subAgent',
  spawnAgent: 'subAgent', TodoWrite: 'toDos', ExitPlanMode: 'plan', [BROWSER_HOST_TOOL]: 'openWebsite',
  // Cursor names a call only by its ACP kind.
  read: 'read', search: 'search', fetch: 'readPage', delete: 'deleteFile', move: 'moveFile', think: 'thinking'
}

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

// Antumi's own tools, by the key their words go under: the management tools by their own key, the
// others with their family in front (agentDispatch, squadRoster, pullRequestCreate).
const ANTUMI_TOOLS = new Map<string, string>([
  ...Object.entries(MANAGEMENT_TOOLS).map(([key, name]): [string, string] => [name, key]),
  ...Object.entries(AGENT_CALL_TOOLS).map(([key, name]): [string, string] => [name, `agent${capitalized(key)}`]),
  ...Object.entries(SQUAD_TOOL_NAMES).map(([key, name]): [string, string] => [name, `squad${capitalized(key)}`]),
  ...Object.entries(PULL_REQUEST_TOOLS).map(([key, name]): [string, string] => [name, `pullRequest${capitalized(key)}`])
])

function antumiLabel(name: string): string | null {
  const key = ANTUMI_TOOLS.get(antumiToolName(name) ?? '')
  const words: Record<string, string> = strings.antumiTools
  return key ? words[key] ?? null : null
}

export function toolLabel(name: string, display?: Tool['display']): string {
  const antumi = antumiLabel(name)
  if (antumi) return antumi
  const names = strings.toolNames
  if (isPreviewTool(name)) return names.preview
  if (isBrowserBookmarksTool(name)) return names.findBookmarks
  const todo = todoToolKind(name)
  if (todo) return todo === 'list' ? names.listToDos : todo === 'add' ? names.addToDo : names.completeToDo
  const history = historyToolKind(name)
  if (history) return history === 'list' ? names.viewRecords : names.readRecords
  if (isTerminalRunTool(name)) return names.runInTerminal
  const terminal = terminalToolKind(name)
  if (terminal) return terminal === 'read' ? names.readTerminal : terminal === 'stop' ? names.stopTerminal : names.runInTerminal
  const browser = browserToolKind(name)
  if (browser) return strings.browserTools[browser]
  const known = TOOL_NAMES[name]
  if (known) return names[known]
  const mcp = mcpToolParts(name, display)
  return mcp ? (mcp.server ? `${mcp.server} · ${mcp.name}` : mcp.name) : name
}

// What a run of calls did, as a person would say it: counted by kind, in the order each kind first
// came up.
const RUN_KIND: Record<string, 'read' | 'search' | 'command' | 'fetch'> = {
  Read: 'read', read: 'read', Grep: 'search', Glob: 'search', WebSearch: 'search', webSearch: 'search', search: 'search',
  Bash: 'command', commandExecution: 'command', WebFetch: 'fetch', fetch: 'fetch'
}
const RUN_WORDS = { read: 'runReadFiles', search: 'runSearched', command: 'runCommands', fetch: 'runPages', browser: 'runBrowser' } as const

export function runSummary(tools: readonly Pick<Tool, 'name' | 'display'>[]): string {
  const counts = new Map<string, { count: number; say: (count: number) => string }>()
  for (const tool of tools) {
    const known = RUN_KIND[tool.name] ?? (browserToolKind(tool.name) ? 'browser' : null)
    const kind = known ?? `tool:${tool.name}`
    const say = known ? (count: number) => t(RUN_WORDS[known], { count }) : (count: number) => fill(strings.runTimes, { label: toolLabel(tool.name, tool.display), count })
    counts.set(kind, { count: (counts.get(kind)?.count ?? 0) + 1, say })
  }
  return [...counts.values()].map(({ count, say }) => say(count)).join(strings.listSeparator)
}
