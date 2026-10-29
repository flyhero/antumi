import type { AgentAdapter } from '../agent-adapter'
import { AcpDriver } from '../acp/acp-driver'
import { clearMcpReadyFile, mcpReadyFile, mcpReadyWithin, mcpServerReporting } from '../mcp-ready-file'
import { Rejection } from '../../rejection'
import { geminiDialect } from './gemini-dialect'
import { detectGemini, geminiCatalog, geminiInstallation, geminiSignedIn, requireGemini } from './gemini-cli'
import { readGeminiUsage } from './gemini-usage'

const readyFile = (stage: Parameters<typeof mcpReadyFile>[0]) => mcpReadyFile(stage, 'gemini')

export const gemini: AgentAdapter = {
  kind: 'gemini', maintenance: { packageName: '@google/gemini-cli' },
  createDriver: (stageId, options) => new AcpDriver(geminiDialect, stageId, options),
  command: (launch) => ({ command: 'gemini', args: ['--acp', '--skip-trust', ...[...new Set([...launch.extraProjects, ...(launch.references ?? []), ...(launch.knowledgeBase ? [launch.knowledgeBase.path] : [])])].flatMap((dir) => ['--include-directories', dir])] }),
  permissionModes: Object.keys(geminiDialect.modes), fallbackMode: 'ask',
  // Gemini 0.66.0 streams history after acknowledging load, with no end marker (#29707).
  session: { preassignedId: false, folderBound: true, nativeFork: 'none', nativeResume: false },
  startTimeoutMs: 60_000, mcpApproval: 'antumi',
  catalog: geminiCatalog, detect: detectGemini, signedIn: geminiSignedIn, usage: readGeminiUsage,
  installation: geminiInstallation, installWithoutApplication: true,
  launch: {
    mcp: (server, stage) => {
      // Gemini strips Electron's Node flag from MCP environments. Its npm CLI requires Node,
      // which can run the bundled MCP entry directly on every platform.
      const { ELECTRON_RUN_AS_NODE, ...env } = server.env ?? {}
      return mcpServerReporting({ ...server, ...(ELECTRON_RUN_AS_NODE ? { command: 'node', env } : {}) }, readyFile(stage), stage.planOnly, true)
    },
    prepare: async (stage) => {
      const command = await requireGemini()
      if (!await geminiSignedIn()) throw new Rejection('gemini-sign-in-required', '请先在终端运行 gemini 登录 Google 账号，或设置 GEMINI_API_KEY')
      await clearMcpReadyFile(readyFile(stage))
      return { command }
    },
    ready: async (stage) => {
      if (!await mcpReadyWithin(readyFile(stage), 15_000)) throw new Rejection('gemini-mcp-unavailable', 'Gemini CLI 未能加载 Antumi MCP，请检查 Node.js 和 Gemini 配置后重试')
    }
  },
  turns: { serialized: true, stopAfterCancel: { cancelGraceMs: 3000, termGraceMs: 2000 }, retryByRestart: true, denialAsMessage: true },
  optionsFromState: true, discovery: { commands: ['gemini'], applications: {} }
}
