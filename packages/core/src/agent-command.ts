import { AGENT_CALL_TOOLS, BROWSER_BOOKMARKS_TOOL, browserToolName, HISTORY_TOOLS, historyToolName, MANAGEMENT_READ_TOOLS, SHOW_PREVIEW_TOOL, SQUAD_TOOL_NAMES, terminalToolName, TODO_TOOLS, todoToolName } from '@antumi/protocol'

// env is added to what the agent runs with, for an agent configured through its environment.
export type AgentCommand = { command: string; args: string[]; env?: Record<string, string> }

// An MCP server the agent starts over stdio.
// env is added to what the agent starts the server with.
export type McpServer = { command: string; args: string[]; env?: Record<string, string> }

// One of the user's MCP servers as an agent is given it: started through Antumi's launcher, which
// adds what is secret, or reached at its address where nothing is.
export type AgentMcpServer = { name: string } & ({ type: 'stdio'; command: string; args: string[]; env?: Record<string, string> } | { type: 'http'; url: string })

// The browser tools that only read: what the page shows, says in its console, or is waited on,
// and the user's bookmarks.
export const BROWSER_READ_TOOLS: readonly string[] = [...(['snapshot', 'screenshot', 'scroll', 'wait', 'console', 'tabs'] as const).map(browserToolName), BROWSER_BOOKMARKS_TOOL]

// Antumi's tools that ask nothing of the user: showing a file the agent wrote, reading the
// browser's page, reading or stopping a terminal the conversation opened itself, the user's
// history (there only where the user allows it), and the to-dos where they come along. Running a
// command in a terminal, or acting on a page, is left out.
export function antumiReadTools(todos: boolean): string[] {
  return [...Object.values(AGENT_CALL_TOOLS), ...Object.values(SQUAD_TOOL_NAMES), ...MANAGEMENT_READ_TOOLS, SHOW_PREVIEW_TOOL, ...BROWSER_READ_TOOLS, terminalToolName('read'), terminalToolName('stop'), ...HISTORY_TOOLS.map(historyToolName), ...(todos ? TODO_TOOLS.map(todoToolName) : [])]
}
