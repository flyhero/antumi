import { dshTranscripts } from './dsh-transcripts'
import { DSH_MODES } from '@antumi/protocol'
import type { AgentAdapter } from '../agent-adapter'
import { AcpDriver } from '../acp/acp-driver'
import { dshDialect } from './dsh-dialect'
import { dshCommand, dshProviderModels } from './dsh-command'
import { detectDsh, dshCatalog, dshInstallation, prepareDsh } from './dsh-cli'

export const dsh: AgentAdapter = {
  kind: 'dsh',
  transcripts: dshTranscripts(),
  createDriver: (stageId, options) => new AcpDriver(dshDialect, stageId, options),
  command: dshCommand,
  providerModels: dshProviderModels,
  permissionModes: DSH_MODES,
  fallbackMode: 'ask',
  session: { preassignedId: false, folderBound: true, nativeFork: 'none' },
  startTimeoutMs: 60_000,
  mcpApproval: 'antumi',
  catalog: dshCatalog,
  detect: detectDsh,
  installation: dshInstallation,
  launch: { mcp: (server, stage) => ({ ...server, args: [...server.args, ...(stage.planOnly ? ['--plan-only'] : [])] }), prepare: prepareDsh, ready: async () => {} },
  turns: { serialized: true, stopAfterCancel: { cancelGraceMs: 3000, termGraceMs: 2000 }, retryByRestart: true, denialAsMessage: true },
  optionsFromState: true,
  discovery: { commands: ['dsh'], applications: { darwin: ['DeepSeek Harness.app', 'DSH Desktop.app'] } }
}
