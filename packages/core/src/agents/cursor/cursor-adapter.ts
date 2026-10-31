import { cursorTranscripts } from './cursor-transcripts'
import { parseCursorQuick } from '../../model-metering'
import { Rejection } from '../../rejection'
import type { AgentAdapter, AgentStage } from '../agent-adapter'
import { CURSOR_MODES, CursorAcp } from './cursor-acp'
import { cursorCatalog, cursorInstallation, detectCursorCli, requireCursorCli } from './cursor-cli'
import { cursorMcpReadyFile, cursorMcpServer, prepareCursorMcp, waitForCursorMcp } from './cursor-mcp'
import { readCursorUsage } from './cursor-usage'

const readyFile = (stage: AgentStage) => cursorMcpReadyFile(stage.sessionsRoot, stage.conversationId, stage.stageId)

export const cursor: AgentAdapter = {
  kind: 'cursor',
  transcripts: cursorTranscripts(),
  maintenance: { native: { roots: { darwin: ['.local/share/cursor-agent'], linux: ['.local/share/cursor-agent'], win32: ['AppData/Local/cursor-agent'] }, args: ['update'] } },
  createDriver: (stageId, options) => new CursorAcp(stageId, options),
  // Its ACP session takes no extra folders, but the CLI does, as workspace roots whose rules and
  // skills it loads: every release Antumi runs (2026.10.01 on) has --add-dir. The user's vault is
  // one where the stage may write it; the note on it rides on the first prompt (AcpDriver). So is
  // Antumi's skills bundle, whose .agents/skills it reads; that it could write there is harmless,
  // as Antumi builds bundles afresh.
  command: (launch) => ({ command: 'cursor-agent', args: [...[...launch.extraProjects, ...(launch.knowledgeBase?.write ? [launch.knowledgeBase.path] : []), ...(launch.skills ? [launch.skills.dir] : [])].flatMap((dir) => ['--add-dir', dir]), 'acp'] }),
  permissionModes: Object.keys(CURSOR_MODES),
  // Antumi sets the mode over ACP, so a stage always starts in one Cursor has.
  fallbackMode: 'ask',
  session: { preassignedId: false, folderBound: true, nativeFork: 'none' },
  // Its CLI starts cold and loads the session before it answers.
  startTimeoutMs: 60_000,
  mcpApproval: 'agent',
  catalog: cursorCatalog,
  detect: detectCursorCli,
  usage: readCursorUsage,
  installation: cursorInstallation,
  // Asking only: it reads nothing and changes nothing.
  quick: {
    parse: parseCursorQuick,
    command: async (prompt, model) => ({
      command: await requireCursorCli(),
      args: ['-p', ...(model ? ['--model', model] : []), '--output-format', 'json', '--mode', 'ask', '--trust', '--', prompt],
      stdin: null,
      output: 'stdout'
    })
  },
  launch: {
    // Antumi's MCP server reports, through a file, that Cursor connected to it.
    mcp: (server, stage) => cursorMcpServer(server, readyFile(stage), stage.planOnly),
    prepare: async (stage, mcp) => {
      const command = await requireCursorCli()
      if (!mcp) throw new Rejection('cursor-mcp-unavailable', 'Cursor 需要 Antumi MCP 配置')
      await prepareCursorMcp(readyFile(stage))
      return { command }
    },
    ready: (stage) => waitForCursorMcp(readyFile(stage))
  },
  turns: {
    serialized: true,
    stopAfterCancel: { cancelGraceMs: 2000, termGraceMs: 2000 },
    // Its first event has come after 20 seconds when the service is slow, so it is given longer
    // before it is stopped.
    firstFrameNoticeMs: 30_000,
    firstFrameTimeoutMs: 60_000,
    retryByRestart: true,
    denialAsMessage: true
  },
  optionsFromState: true,
  discovery: {
    commands: ['cursor-agent'],
    applications: {
      darwin: ['Cursor.app'],
      win32: ['cursor/Cursor.exe'],
      linux: ['cursor/cursor', 'Cursor/cursor', 'cursor', 'Cursor.AppImage']
    }
  }
}
