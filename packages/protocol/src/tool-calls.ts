import type { ChatDiff, ChatItem, ChatToolStatus } from './chat'

// What a client reads off an agent's tool calls to show them, whatever words it shows them in.

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

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

// An MCP tool as the agent names it for people ("Atlassian", "Get issue"); where it says nothing, by
// its server and its own name read off mcp__<server>__<tool>, the claude.ai connector prefix left off.
const MCP_TOOL = /^mcp__(.+?)__(.+)$/
export function mcpToolParts(name: string, display: ToolItem['display']): { server: string | null; name: string } | null {
  if (display) return { server: display.server, name: display.name }
  const match = MCP_TOOL.exec(name)
  if (!match?.[1] || !match[2]) return null
  return { server: match[1].replace(/^claude_ai_/, '').replace(/_/g, ' '), name: match[2] }
}

// A token count at a glance: 842, 2.3k, 42k, 1.2M.
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`
  return `${(count / 1_000_000).toFixed(1)}M`
}
