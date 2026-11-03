import { parseClaudeQuick } from '../../model-metering'
import type { AgentAdapter } from '../agent-adapter'
import { claudeAccounts, claudeDefaultHome } from './claude-account'
import { claudeCommand } from './claude-command'
import { claudeProviderModels } from './claude-provider'
import { CLAUDE_MODE_NAMES, ClaudeStream } from './claude-stream'
import { claudeTranscripts } from './claude-transcripts'
import { claudeSignedIn, readClaudeUsage } from './claude-usage'

export const claude: AgentAdapter = {
  usageTranscripts: { format: 'claude', home: (home) => home ?? claudeDefaultHome() },
  kind: 'claude',
  maintenance: { packageName: '@anthropic-ai/claude-code', brew: { name: 'claude-code', cask: true }, native: { roots: { darwin: ['.local/share/claude', '.claude/bin'], linux: ['.local/share/claude', '.claude/bin'] }, args: ['update'] } },
  createDriver: (stageId, options) => new ClaudeStream(stageId, options),
  command: claudeCommand,
  providerModels: claudeProviderModels,
  permissionModes: Object.keys(CLAUDE_MODE_NAMES),
  session: { preassignedId: true, folderBound: true, nativeFork: 'any' },
  // Claude Code asks for MCP tools itself, under whatever mode the user set.
  mcpApproval: 'agent',
  signedIn: claudeSignedIn,
  usage: readClaudeUsage,
  accounts: claudeAccounts,
  transcripts: claudeTranscripts(),
  // Haiku, with no tools, no MCP servers, no skills, and no session left for --resume.
  quick: {
    parse: parseClaudeQuick,
    command: (prompt, model) => ({
      command: 'claude',
      args: ['-p', ...(model ? ['--model', model] : []), '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'],
      stdin: prompt,
      output: 'stdout'
    })
  }
}
