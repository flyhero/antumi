import type { ChatPermissionMode } from '@antumi/protocol'
import type { AcpModel } from './acp-schema'
import type { ChatStageOptions } from '../../chat-driver'

// What one agent adds to ACP, or names its own way. AcpDriver speaks the standard protocol and
// asks its dialect for the rest, so an agent that speaks ACP is a dialect, not a driver.
export interface AcpDialect {
  // How the user knows the agent, in what Antumi says of it.
  readonly name: string
  // Starts the id of every request Antumi sends. Logs keep the ids and replay matches on them, so
  // an agent's prefix never changes.
  readonly idPrefix: string
  // The session mode the agent offers for each of Antumi's permission modes it has.
  readonly modes: Partial<Record<ChatPermissionMode, string>>
  // A mode notification carried as an agent text chunk instead of current_mode_update.
  modeUpdate?(text: string): string | null
  // Some providers include cache reads in inputTokens rather than reporting them separately.
  readonly inputIncludesCache?: boolean
  // Extensions Antumi asks for in initialize (clientCapabilities._meta).
  readonly clientMeta?: Record<string, unknown>
  // A runtime extension that must be present before a session is opened.
  initializeError?(result: unknown): string | null
  startNote?(options: ChatStageOptions): string | null
  // Antumi's own MCP server reaches the agent on its command rather than in session/new: the agent
  // offers a server's tools as Antumi needs them only where its own config says so.
  readonly ownMcpOnCommand?: boolean
  // The auth method Antumi starts the agent with; an agent naming others is signed in elsewhere.
  readonly authMethod?: string
  // A request listing models with their reasoning levels, which the session config may leave out.
  readonly models?: { method: string; parse(result: unknown): AcpModel[] | null }
  // The tool a call runs, where its input or the name it gives (an extension) says more than its
  // kind: null leaves it to the kind.
  toolName?(rawInput: unknown, name: string | undefined, title?: string, toolCallId?: string): string | null
  // The input worth showing, where the agent wraps a call's arguments.
  toolInput?(rawInput: unknown, context: { kind?: string; title?: string; locations?: { path: string; line?: number }[] }): unknown
  // Some agents carry questions and plan reviews over the standard permission request.
  permissionPrompt?(request: unknown): { kind: 'question'; text: string } | { kind: 'plan'; text: string; runMode: ChatPermissionMode } | { kind: 'plan'; path: string; runMode: ChatPermissionMode } | null
  // The Task call a subagent announced on its parent's session runs for; without it, subagents
  // are left out of the chat.
  subagentCall?(update: unknown): string | null
  // Requests of its own: a question asked in passing, a plan to approve (accepted, it runs on in
  // the mode named), and requests Antumi just acknowledges.
  readonly requests?: { question?: string; plan?: { method: string; approvalTool?: string; runMode: ChatPermissionMode; runModeLabel: string; prompt: string }; acknowledged?: readonly string[] }
  // A transport error the agent wrote as the end of its reply: the reply without it, and what to say.
  providerError?(text: string): { rest: string; summary: string; detail: string } | null
}
