import os from 'node:os'
import path from 'node:path'
import type { AgentAdapter } from '../agent-adapter'
import { ZCodeAppServer } from './zcode-app-server'
import { zcodeCatalog, zcodeInstallation, zcodeSignedIn } from './zcode-cli'
import { zcodeCommand } from './zcode-command'
import { ZCODE_MODES } from './zcode-modes'
import { zcodeTranscripts } from './zcode-transcripts'
import { readZCodeUsage } from './zcode-usage'
import { zcodeProviderLaunch, zcodeProviderModels } from './zcode-provider'

export const zcode: AgentAdapter = {
  kind: 'zcode',
  // Its own, winning a name, then the Agent Skills folder (adapters/src/skills/roots.ts in ZCode).
  globalSkillDirs: () => [path.join(os.homedir(), '.zcode', 'skills'), path.join(os.homedir(), '.agents', 'skills')],
  maintenance: { packageName: 'zcode-app-cli' },
  createDriver: (stageId, options) => new ZCodeAppServer(stageId, options),
  command: zcodeCommand,
  permissionModes: Object.keys(ZCODE_MODES),
  // Antumi names the mode of every session it makes or resumes, so a stage always runs in one of these.
  fallbackMode: 'ask',
  // A session belongs to its workspace folder. Its fork (forkAssistant) is its desktop's, at a row
  // Antumi has no name for: a fork starts from a handoff.
  session: { preassignedId: false, folderBound: true, nativeFork: 'none' },
  // A first start migrates its session database and starts its own plugins' MCP servers.
  startTimeoutMs: 60_000,
  // It asks before any MCP tool runs, Antumi's among them; the driver lets the read-only ones through.
  mcpApproval: 'agent',
  catalog: zcodeCatalog,
  transcripts: zcodeTranscripts(),
  signedIn: (home) => zcodeSignedIn(home),
  // The GLM Coding Plan's quota, where ZCode runs on a plan key.
  usage: (home) => readZCodeUsage(home),
  installation: zcodeInstallation,
  discovery: { commands: ['zcode'], applications: { darwin: ['ZCode.app'] } },
  providerModels: zcodeProviderModels,
  // On a model provider, its own data folder with that provider's file (zcode-provider.ts).
  launch: {
    mcp: (server) => server,
    prepare: async (stage, _mcp, launch) => (launch.provider ? zcodeProviderLaunch(stage, launch.provider) : {}),
    ready: async () => {}
  }
}
