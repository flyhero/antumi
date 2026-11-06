import os from 'node:os'
import path from 'node:path'
import { parseCodexQuick } from '../../model-metering'
import { codexWarmupArgs } from './codex-warmup'
import type { AgentAdapter } from '../agent-adapter'
import { CODEX_MODES, CodexAppServer } from './codex-app-server'
import { codexAccounts, codexDefaultHome } from './codex-account'
import { codexCommand } from './codex-command'
import { codexProviderModels } from './codex-provider'
import { codexTranscripts } from './codex-transcripts'
import { hasCodexCredentials, readCodexUsage, useCodexResetCredit } from './codex-usage'

export const codex: AgentAdapter = {
  warmup: { probe: { command: 'codex', args: ['mcp', 'list', '--json'], stdin: null, output: 'stdout' }, args: codexWarmupArgs },
  usageTranscripts: { format: 'codex', home: (home) => home ?? codexDefaultHome() },
  kind: 'codex',
  maintenance: { packageName: '@openai/codex', brew: { name: 'codex', cask: true }, native: { roots: { darwin: ['.local/share/codex'], linux: ['.local/share/codex'], win32: ['AppData/Local/OpenAI/Codex'] }, args: ['update'], latestUrl: 'https://api.github.com/repos/openai/codex/releases/latest', tagPrefix: 'rust-v' } },
  createDriver: (stageId, options) => new CodexAppServer(stageId, options),
  command: codexCommand,
  providerModels: codexProviderModels,
  permissionModes: Object.keys(CODEX_MODES),
  // A thread is Codex's own, wherever the conversation's folder moved.
  session: { preassignedId: false, folderBound: false, nativeFork: 'any' },
  // Codex asks only before a tool it reads as acting on the outside world, which Antumi's own are
  // not marked as, so Antumi asks in the chat.
  mcpApproval: 'antumi',
  signedIn: hasCodexCredentials,
  usage: readCodexUsage,
  useResetCredit: useCodexResetCredit,
  accounts: codexAccounts,
  // Its own skills under its home (.system holds the ones it ships), the Agent Skills folder, and an
  // administrator's (capability_locations.rs in Codex).
  globalSkillDirs: (env) => [path.join(codexDefaultHome(env), 'skills'), path.join(os.homedir(), '.agents', 'skills'), '/etc/codex/skills'],
  transcripts: codexTranscripts(),
  // At low effort, read-only, and not kept in its history. Its progress goes to stdout too, so the
  // answer comes from a file.
  quick: {
    parse: parseCodexQuick,
    command: (prompt, model, outputFile) => ({
      command: 'codex',
      args: ['exec', '--json', ...(model ? ['-m', model] : []), '-c', 'model_reasoning_effort="low"', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-o', outputFile, '--', '-'],
      stdin: prompt,
      output: 'file'
    })
  }
}
