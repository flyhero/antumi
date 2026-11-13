import { localized, t } from './i18n'
import { BROWSER_HOST_TOOL, browserToolKind, isBrowserBookmarksTool, CODEX_IMAGE_GENERATION, historyToolKind, isCommandTool, isPreviewTool, isTerminalRunTool, mcpToolParts, terminalToolKind, todoToolKind, type TodoToolKind, type BrowserToolKind, type ChatItem, type TerminalToolKind } from '@antumi/protocol'
import { browserOperation } from './browser-activity'
import { antumiToolPresentation } from './antumi-tool-presentation'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

// Shared with the phone, which shows calls the same way.
export { commandExitCode, commandKeyword, diffCounts, formatTokens, isCommandTool, isSubagent, subagentBrief, toolDisplayStatus, toolRunStatus } from '@antumi/protocol'

// Both agents' tool names, in words; an unknown one shows as the agent named it.
const TOOL_LABEL: Record<string, string> = localized(() => ({
  Bash: t('chatTools.command'),
  commandExecution: t('chatTools.command'),
  Monitor: t('chatTools.monitor'),
  Read: t('chatTools.read'),
  imageView: t('chatTools.viewImage'),
  [CODEX_IMAGE_GENERATION]: t('chatTools.generateImage'),
  Write: t('chatTools.write'),
  Edit: t('chatTools.edit'),
  MultiEdit: t('chatTools.edit'),
  NotebookEdit: t('chatTools.editNotebook'),
  fileChange: t('chatTools.modifyFiles'),
  // Codex asking before an MCP server's tool, the card titled server.tool.
  mcpToolCall: t('chatTools.mcpTool'),
  Grep: t('chatTools.search'),
  Glob: t('chatTools.findFiles'),
  WebFetch: t('chatTools.readPage'),
  WebSearch: t('chatTools.searchWeb'),
  webSearch: t('chatTools.searchWeb'),
  Task: t('chatTools.subAgent'),
  Agent: t('chatTools.subAgent'),
  spawnAgent: t('chatTools.subAgent'),
  TodoWrite: t('chatTools.toDos'),
  ExitPlanMode: t('chatTools.plan'),
  // Antumi's own question about a site its browser is to open, shown among the approvals.
  [BROWSER_HOST_TOOL]: t('chatTools.openWebsite'),
  // Cursor names a call only by its ACP kind.
  read: t('chatTools.read'),
  search: t('chatTools.search'),
  fetch: t('chatTools.readPage'),
  delete: t('chatTools.deleteFile'),
  move: t('chatTools.moveFile'),
  think: t('chatTools.thinking')
}))

// Antumi's browser tools, in words.
const BROWSER_LABEL: Record<BrowserToolKind, string> = localized(() => ({
  navigate: t('chatTools.openPage'),
  snapshot: t('chatTools.pageSnapshot'),
  screenshot: t('chatTools.screenshot'),
  click: t('chatTools.click'),
  type: t('chatTools.type'),
  press: t('chatTools.pressKey'),
  hover: t('chatTools.hover'),
  scroll: t('chatTools.scroll'),
  select: t('chatTools.select'),
  wait: t('chatTools.wait'),
  tabs: t('chatTools.tabs'),
  console: t('chatTools.console'),
  upload: t('chatTools.upload'),
  downloads: t('chatTools.downloads')
}))

// An agent's own terminals in the app's panel.
const TERMINAL_LABEL: Record<TerminalToolKind, string> = localized(() => ({ run: t('chatTools.runInTerminal'), read: t('chatTools.readTerminal'), stop: t('chatTools.stopTerminal') }))

type ToolDisplay = { name: string; server: string | null }

function mcpToolLabel(name: string, display: ToolDisplay | null | undefined): string | null {
  const mcp = mcpToolParts(name, display)
  return mcp ? (mcp.server ? `${mcp.server} · ${mcp.name}` : mcp.name) : null
}

const TODO_LABEL: Record<TodoToolKind, string> = localized(() => ({ list: t('chatTools.listToDos'), add: t('chatTools.addToDo'), check: t('chatTools.completeToDo') }))

export function toolLabel(name: string, display?: ToolDisplay | null): string {
  const antumi = antumiToolPresentation(name)
  if (antumi) return t(antumi.label)
  if (isPreviewTool(name)) return t('chatTools.preview')
  if (isBrowserBookmarksTool(name)) return t('chatTools.findBookmarks')
  const todo = todoToolKind(name)
  if (todo) return TODO_LABEL[todo]
  const history = historyToolKind(name)
  if (history) return history === 'list' ? t('chatTools.viewAntumiRecords') : t('chatTools.readAntumiRecords')
  if (isTerminalRunTool(name)) return TERMINAL_LABEL.run
  const terminal = terminalToolKind(name)
  if (terminal) return TERMINAL_LABEL[terminal]
  const browser = browserToolKind(name)
  if (browser) return BROWSER_LABEL[browser]
  return TOOL_LABEL[name] ?? mcpToolLabel(name, display) ?? name
}

export type ToolIconKind = 'read' | 'edit' | 'terminal' | 'search' | 'browser' | 'browser-control' | 'image' | 'agent' | 'list' | 'tool'

const TOOL_ICONS: Record<string, ToolIconKind> = {
  Read: 'read', Write: 'edit', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', fileChange: 'edit',
  Bash: 'terminal', commandExecution: 'terminal', Monitor: 'terminal',
  Grep: 'search', Glob: 'search', WebSearch: 'search', webSearch: 'search',
  WebFetch: 'browser', [BROWSER_HOST_TOOL]: 'browser', imageView: 'image', [CODEX_IMAGE_GENERATION]: 'image',
  Task: 'agent', Agent: 'agent', spawnAgent: 'agent', TodoWrite: 'list', ExitPlanMode: 'list',
  read: 'read', search: 'search', fetch: 'browser', delete: 'edit', move: 'edit'
}

export function toolIconKind(name: string, display?: ToolDisplay | null): ToolIconKind {
  const antumi = antumiToolPresentation(name)
  if (antumi) return antumi.icon
  if (isTerminalRunTool(name) || terminalToolKind(name)) return 'terminal'
  if (browserToolKind(name) === 'screenshot' || isPreviewTool(name)) return 'image'
  if (browserOperation(name, display) !== null) return 'browser-control'
  const history = historyToolKind(name)
  if (history) return history === 'list' ? 'list' : 'read'
  if (todoToolKind(name) || isBrowserBookmarksTool(name)) return 'list'
  return TOOL_ICONS[name] ?? 'tool'
}

// What a call's input is written in, for colouring it: a shell command, a plan, or the JSON of
// any other tool's arguments; null leaves it plain.
export type ToolInputLanguage = 'bash' | 'markdown' | 'json'

export function toolInputLanguage(name: string, input: string): ToolInputLanguage | null {
  if (isCommandTool(name)) return 'bash'
  if (name === 'ExitPlanMode') return 'markdown'
  return /^\s*[[{]/.test(input) ? 'json' : null
}

// What a run of calls did, in the words a person would use: counted by kind, in the order each kind
// first came up.
const TOOL_KIND: Record<string, { kind: string; say: (count: number) => string }> = {
  Read: { kind: 'read', say: (count) => t('chatTools.readFiles', { count: count }) },
  Grep: { kind: 'search', say: (count) => t('chatTools.searchedTimes', { count: count }) },
  Glob: { kind: 'search', say: (count) => t('chatTools.searchedTimes', { count: count }) },
  WebSearch: { kind: 'search', say: (count) => t('chatTools.searchedTimes', { count: count }) },
  webSearch: { kind: 'search', say: (count) => t('chatTools.searchedTimes', { count: count }) },
  Bash: { kind: 'command', say: (count) => t('chatTools.ranCommands', { count: count }) },
  commandExecution: { kind: 'command', say: (count) => t('chatTools.ranCommands', { count: count }) },
  WebFetch: { kind: 'fetch', say: (count) => t('chatTools.readPages', { count: count }) },
  read: { kind: 'read', say: (count) => t('chatTools.readFiles', { count: count }) },
  search: { kind: 'search', say: (count) => t('chatTools.searchedTimes', { count: count }) },
  fetch: { kind: 'fetch', say: (count) => t('chatTools.readPages', { count: count }) }
}

// A burst of clicks, typing and waiting reads as one thing done in the browser.
const BROWSER_RUN = { kind: 'browser', say: (count: number) => t('chatTools.usedBrowserTimes', { count: count }) }

export function runSummary(tools: readonly Pick<ToolItem, 'name' | 'display'>[]): string {
  const counts = new Map<string, { count: number; say: (count: number) => string }>()
  for (const tool of tools) {
    const known = TOOL_KIND[tool.name] ?? (browserOperation(tool.name, tool.display) !== null ? BROWSER_RUN : undefined)
    const kind = known?.kind ?? `tool:${tool.name}`
    const say = known?.say ?? ((count: number) => t('chatTools.times', { value1: toolLabel(tool.name, tool.display), count: count }))
    const current = counts.get(kind)
    counts.set(kind, { count: (current?.count ?? 0) + 1, say })
  }
  return [...counts.values()].map(({ count, say }) => say(count)).join('，')
}

// While a run goes it reads as the call under way, when that call says what it does in words;
// otherwise, and once it is done, as the count of what it did.
export function runHeadline(tools: readonly Pick<ToolItem, 'name' | 'status' | 'description'>[]): { text: string; described: boolean } {
  const described = tools.find((tool) => tool.status === 'running')?.description
  return described ? { text: described, described: true } : { text: runSummary(tools), described: false }
}

// How long a turn worked, as a person says it.
// How long a thought took: most last seconds, so tenths matter under a minute; minutes after.
export function thoughtFor(durationMs: number): string {
  return durationMs < 60_000 ? t('chatTools.s', { value1: Math.max(0.1, durationMs / 1000).toFixed(1) }) : workedFor(durationMs)
}

// How long a call has run, at a glance: tenths of a second under a minute, then minutes.
export function elapsedText(ms: number): string {
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : workedFor(ms)
}

export function workedFor(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  if (seconds < 60) return t('chatTools.s_98', { seconds: seconds })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 ? t('chatTools.mS', { minutes: minutes, value2: seconds % 60 }) : t('chatTools.min', { minutes: minutes })
  return minutes % 60 ? t('chatTools.hM', { value1: Math.floor(minutes / 60), value2: minutes % 60 }) : t('chatTools.h', { value1: Math.floor(minutes / 60) })
}
