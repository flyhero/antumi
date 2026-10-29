import { localized, t } from './i18n'
import { BROWSER_HOST_TOOL, browserToolKind, isBrowserBookmarksTool, CODEX_IMAGE_GENERATION, historyToolKind, isPreviewTool, isTerminalRunTool, terminalToolKind, todoToolKind, type TodoToolKind, type BrowserToolKind, type ChatDiff, type ChatItem, type ChatToolStatus, type TerminalToolKind } from '@antumi/protocol'
import { browserOperation } from './browser-activity'
import { antumiToolPresentation } from './antumi-tool-presentation'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

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
  console: t('chatTools.console')
}))

// An agent's own terminals in the app's panel.
const TERMINAL_LABEL: Record<TerminalToolKind, string> = localized(() => ({ run: t('chatTools.runInTerminal'), read: t('chatTools.readTerminal'), stop: t('chatTools.stopTerminal') }))

type ToolDisplay = { name: string; server: string | null }

// An MCP tool as the agent names it for people ("Atlassian · Get issue"); where it says nothing, by
// its server and its own name read off mcp__<server>__<tool>, the claude.ai connector prefix left off.
const MCP_TOOL = /^mcp__(.+?)__(.+)$/
function mcpToolLabel(name: string, display: ToolDisplay | null | undefined): string | null {
  if (display) return display.server ? `${display.server} · ${display.name}` : display.name
  const match = MCP_TOOL.exec(name)
  if (!match?.[1] || !match[2]) return null
  return `${match[1].replace(/^claude_ai_/, '').replace(/_/g, ' ')} · ${match[2]}`
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

// A call that runs a shell command: Claude's Bash, and its Monitor, which watches one in the
// background; Codex's command execution.
export function isCommandTool(name: string): boolean {
  return name === 'Bash' || name === 'Monitor' || name === 'commandExecution'
}

type ToolExecution = Pick<ToolItem, 'name' | 'status' | 'execution'>

// A nonzero exit is a result, not proof that the command could not run.
export function toolDisplayStatus(tool: ToolExecution): ChatToolStatus {
  if (!isCommandTool(tool.name) || tool.status === 'running' || tool.status === 'denied' || tool.status === 'interrupted') return tool.status
  if (tool.execution) return tool.execution.status === 'completed' ? 'done' : 'failed'
  return tool.status
}

export function commandExitCode(tool: ToolExecution): number | null {
  return isCommandTool(tool.name) ? tool.execution?.exitCode ?? null : null
}

export function toolRunStatus(tools: readonly ToolExecution[]) {
  const statuses = tools.map(toolDisplayStatus)
  const failed = statuses.filter((status) => status === 'failed').length
  const denied = statuses.filter((status) => status === 'denied').length
  const interrupted = statuses.filter((status) => status === 'interrupted').length
  const status: ChatToolStatus = statuses.includes('running') ? 'running'
    : failed > 0 ? 'failed' : denied > 0 ? 'denied' : interrupted > 0 ? 'interrupted' : 'done'
  return { status, failed, denied, interrupted }
}

// Shell words that never name the program being run; the ones with an argument take it along.
const SHELL_NOISE = new Set(['env', 'exec', 'nice', 'nohup', 'set', 'sudo', 'time'])
const SHELL_NOISE_WITH_ARG = new Set(['.', 'cd', 'source'])
// Launchers whose next word, or a later path, is the real subject.
const SHELL_RUNNERS = new Set(['bash', 'bun', 'bunx', 'deno', 'node', 'npm', 'npx', 'pnpm', 'python', 'python3', 'run', 'sh', 'ts-node', 'tsx', 'uv', 'uvx', 'yarn', 'zsh'])

// The program a command runs, for a line that stands for the command: `cd repo && FOO=1 npx tsx
// scripts/report.ts | head` → `report.ts`. Env assignments, flags, noise and launchers are skipped.
export function commandKeyword(command: string): string {
  const words = command.split(/[\s;&|()]+/).filter(Boolean)
  let skip = false
  // A launcher given a script inline (node -e '…', python -c "…") is what runs: its script is no name.
  let runner: string | null = null
  for (const word of words) {
    if (skip) {
      skip = false
      continue
    }
    if (/^['"]/.test(word)) return runner ?? word.replace(/^['"]+|['"]+$/g, '')
    if (/^[A-Z_]\w*=/i.test(word)) continue
    if (/^[+-]/.test(word)) continue
    if (SHELL_NOISE_WITH_ARG.has(word)) {
      skip = true
      continue
    }
    if (SHELL_RUNNERS.has(word)) runner = word
    if (SHELL_NOISE.has(word) || SHELL_RUNNERS.has(word)) continue
    return /[\\/]/.test(word) ? (word.split(/[\\/]/).pop() || word) : word
  }
  return words[0] ?? command
}

// A call that hands work to a subagent of its own: Claude's Task (Agent in newer versions), or a
// Codex spawn.
export function isSubagent(name: string): boolean {
  return name === 'Task' || name === 'Agent' || name === 'spawnAgent'
}

// What a subagent was told, and what kind it is, from its call's input: JSON Antumi may have cut
// short, which then stays the prompt as it is.
export function subagentBrief(input: string | null): { kind: string | null; prompt: string | null } {
  if (!input) return { kind: null, prompt: null }
  try {
    const parsed: unknown = JSON.parse(input)
    if (parsed && typeof parsed === 'object') {
      const kind = 'subagent_type' in parsed && typeof parsed.subagent_type === 'string' ? parsed.subagent_type : null
      const prompt = 'prompt' in parsed && typeof parsed.prompt === 'string' ? parsed.prompt : null
      return { kind, prompt }
    }
  } catch {
    // Cut short: fall through to the text as it is.
  }
  return { kind: null, prompt: input }
}

// Lines added and removed across a call's diffs, from the patches themselves.
export function diffCounts(diffs: readonly Pick<ChatDiff, 'patch'>[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const diff of diffs) {
    for (const line of diff.patch.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added++
      else if (line.startsWith('-') && !line.startsWith('---')) removed++
    }
  }
  return { added, removed }
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

// A token count at a glance: 842, 2.3k, 42k, 1.2M.
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`
  return `${(count / 1_000_000).toFixed(1)}M`
}

export function workedFor(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  if (seconds < 60) return t('chatTools.s_98', { seconds: seconds })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 ? t('chatTools.mS', { minutes: minutes, value2: seconds % 60 }) : t('chatTools.min', { minutes: minutes })
  return minutes % 60 ? t('chatTools.hM', { value1: Math.floor(minutes / 60), value2: minutes % 60 }) : t('chatTools.h', { value1: Math.floor(minutes / 60) })
}
