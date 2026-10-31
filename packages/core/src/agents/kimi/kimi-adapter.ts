import { kimiTranscripts } from './kimi-transcripts'
import type { AgentAdapter } from '../agent-adapter'
import { AcpDriver } from '../acp/acp-driver'
import { kimiDialect } from './kimi-dialect'
import { detectKimi, kimiCatalog, kimiInstallation, requireKimi } from './kimi-cli'

export const kimi: AgentAdapter = {
  kind: 'kimi',
  transcripts: kimiTranscripts(),
  maintenance: { packageName: '@moonshot-ai/kimi-code' },
  createDriver: (stageId, options) => new AcpDriver(kimiDialect, stageId, options),
  command: () => ({ command: 'kimi', args: ['acp'] }),
  permissionModes: Object.keys(kimiDialect.modes),
  fallbackMode: 'ask',
  // Kimi's native fork keeps the source MCP servers, including its old Antumi conversation.
  // A handoff instead gives the fork its own tools and authorization scope.
  session: { preassignedId: false, folderBound: true, nativeFork: 'none' },
  startTimeoutMs: 60_000,
  // Auto and YOLO can approve MCP calls themselves; Antumi keeps its terminal approval policy.
  mcpApproval: 'antumi',
  catalog: kimiCatalog,
  detect: detectKimi,
  installation: kimiInstallation,
  installWithoutApplication: true,
  launch: {
    mcp: (server) => server,
    prepare: async () => ({ command: await requireKimi() }),
    ready: async () => {}
  },
  turns: { serialized: true, stopAfterCancel: { cancelGraceMs: 3000, termGraceMs: 2000 }, retryByRestart: true, denialAsMessage: true },
  optionsFromState: true,
  discovery: { commands: ['kimi'], applications: {} }
}
