import { piTranscripts } from './pi-transcripts'
import { Rejection } from '../../rejection'
import type { AgentAdapter, AgentStage } from '../agent-adapter'
import { clearMcpReadyFile, mcpReadyFile, mcpReadyWithin, mcpServerReporting } from '../mcp-ready-file'
import { detectPi, piCatalog, piInstallation, requirePi } from './pi-cli'
import { piCommand } from './pi-command'
import { writePiExtension } from './pi-extension'
import { piProviderModels } from './pi-models'
import { PI_MODES } from './pi-modes'
import { PiRpc } from './pi-rpc'

const readyFile = (stage: AgentStage) => mcpReadyFile(stage, 'pi')
// Pi waits up to 10s for a server whose tools the model is to see; a slow one may take longer.
const MCP_WAIT_MS = 20_000

export const pi: AgentAdapter = {
  kind: 'pi',
  transcripts: piTranscripts(),
  maintenance: { packageName: '@earendil-works/pi-coding-agent', packageArgs: ['--ignore-scripts'], native: { roots: { darwin: ['.local/share/pi'], linux: ['.local/share/pi'], win32: ['AppData/Local/pi'] }, args: ['update', '--self'], latestUrl: 'https://registry.npmjs.org/@earendil-works/pi-coding-agent/latest' } },
  createDriver: (stageId, options) => new PiRpc(stageId, options),
  command: piCommand,
  providerModels: piProviderModels,
  permissionModes: PI_MODES,
  fallbackMode: 'ask',
  // A session is a file under the folder it ran in, and goes back there when resumed: moved
  // elsewhere, a conversation starts afresh. --fork copies a session whole, with no point to stop at.
  session: { preassignedId: false, folderBound: true, nativeFork: 'latest' },
  // It loads its extensions and starts its MCP servers before it answers.
  startTimeoutMs: 60_000,
  // Pi asks nothing, Antumi's terminal tools included, so Antumi asks in the chat.
  mcpApproval: 'antumi',
  catalog: piCatalog,
  detect: detectPi,
  installation: piInstallation,
  // Antumi's MCP server and modes come with its extension, which this start writes. The server
  // reports once Pi has listed its tools, which the first message waits for.
  launch: {
    mcp: (server, stage) => mcpServerReporting(server, readyFile(stage), stage.planOnly, true),
    prepare: async (stage) => {
      const command = await requirePi()
      await clearMcpReadyFile(readyFile(stage))
      return { command, args: ['--extension', await writePiExtension(stage)] }
    },
    ready: async (stage) => {
      if (!await mcpReadyWithin(readyFile(stage), MCP_WAIT_MS)) throw new Rejection('pi-mcp-unavailable', 'Pi 未能加载 Antumi MCP，请检查 Pi 版本（需要 0.99 以上）后重试')
    }
  },
  optionsFromState: true,
  discovery: { commands: ['pi'], applications: {} }
}
