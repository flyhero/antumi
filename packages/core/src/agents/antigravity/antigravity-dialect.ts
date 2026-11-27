import { z } from 'zod'
import type { AcpDialect } from '../acp/acp-dialect'

const text = z.string().optional()
const Command = z.looseObject({ CommandLine: text, command_line: text, commandLine: text, Cwd: text, working_dir: text, workingDir: text, cwd: text })

// Google's Antigravity ACP server: standard ACP with its models and thinking levels in the session
// config. Sign-in is its Google login, which opens the browser the first time.
export const antigravityDialect: AcpDialect = {
  name: 'Antigravity',
  idPrefix: 'antigravity',
  modes: { ask: 'default', acceptEdits: 'auto_edit', bypass: 'yolo' },
  readOnlyMode: 'ask',
  authMethod: 'oauth-personal',
  // A command arrives as { command_line, working_dir }: shown as the command any agent runs.
  toolInput: (rawInput) => {
    const input = Command.safeParse(rawInput).data
    const command = input?.CommandLine ?? input?.command_line ?? input?.commandLine
    const cwd = input?.Cwd ?? input?.working_dir ?? input?.workingDir ?? input?.cwd
    return command === undefined ? rawInput : { command, ...(cwd === undefined ? {} : { cwd }) }
  },
  // Its session takes no additional directories.
  startNote: (options) => options.extraDirs.length ? `此会话还包含以下项目，请按绝对路径访问；命令分别指定各项目的工作目录：\n${options.extraDirs.map((dir) => `- ${dir}`).join('\n')}` : null
}

export const antigravityAgyCliDialect: AcpDialect = {
  name: 'Antigravity',
  idPrefix: 'antigravity',
  modes: { ask: 'default', acceptEdits: 'accept-edits', auto: 'auto', plan: 'plan' },
  readOnlyMode: 'ask',
  processBypass: true,
  preferResume: true,
  authMethod: 'oauth-personal',
  isSessionLostError: (message) => /conversation not found|invalid session|session.*not found|does not exist|failed to read session/i.test(message),
  toolInput: antigravityDialect.toolInput,
  startNote: antigravityDialect.startNote
}

export const dialectForBackend = (backend?: string | null): AcpDialect => backend === 'agy-cli' ? antigravityAgyCliDialect : antigravityDialect
