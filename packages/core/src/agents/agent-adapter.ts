import type { AgentCliInstallation, AgentKind, ChatCatalog, ChatModel, ChatPermissionMode, EnvironmentCheck, KnowledgeBase } from '@antumi/protocol'
import type { AgentCommand, AgentMcpServer, McpServer } from '../agent-command'
import type { ChatDriver, ChatPreferences, ChatStageOptions } from '../chat-driver'
import type { ResetCreditUse, UsageSource } from '../usage-source'
import type { QuickAnswer } from '../model-metering'
import type { ProviderLaunch } from '../provider-launch'
import type { TranscriptSource } from '../agent-transcripts'

// What a chat stage's agent starts with, which its adapter turns into its own command line. The
// stream carries every message, the handoff prompt included: none goes in argv.
export type AgentLaunch = {
  instructions?: string
  providerSessionId: string | null
  resume: boolean
  handoffPath: string | null
  extraProjects: readonly string[]
  preferred?: ChatPreferences
  allowBypass?: boolean
  // Plans only, read-only in these folders: plan mode, their files never editable, no bypass.
  planOnly?: { dirs: readonly string[] }
  // Works read-only in these folders, in the mode it was given: their files never editable, no bypass.
  readOnly?: { dirs: readonly string[] }
  // Files the agent may read without asking, such as a task's images.
  readable?: readonly string[]
  // Folders it may read but never edit, whatever its mode: a task's reference projects. Not
  // working folders, as a read-only vault is not.
  references?: readonly string[]
  // Resume only through this message (its uuid), as a new session: a fork of the one resumed.
  forkAt?: string | null
  // Antumi's own tools for the agent (showing a file it wrote); none for an older setup.
  mcp?: McpServer
  // The user's MCP servers picked for this agent, beside Antumi's: never named antumi.
  userMcp?: readonly AgentMcpServer[]
  // Whether it may drive the user's own browser, for an agent that can; unset leaves its own default.
  userBrowser?: boolean
  // Whether Antumi's tools for the user's to-dos come along, and the note on when to use them; unset is on.
  todos?: boolean
  // The user's Obsidian vault: its own folder, never a project, so never fenced or given a
  // worktree. write is already false where the stage may not edit.
  knowledgeBase?: KnowledgeBase
  // A folder of Agent Skills built for this start (the skills library): its adapter hands it over
  // the way its CLI takes one, and one that cannot ignores it. Not a project: never fenced.
  skills?: { dir: string }
  // A model provider to run on in place of the agent's own account; preferred.model, if any, is
  // one of providerModels'.
  provider?: ProviderLaunch
  // The account to run on, other than the user's own: the variables pointing it at its folder.
  account?: { id: string; env: Record<string, string> }
}

// How an agent signs in to more than one account (its descriptor's capabilities.accounts): each in
// a folder of its own, which its process is pointed at. home: that folder; undefined, the user's.
export type AccountSupport = {
  env(home: string): Record<string, string>
  // Readies the folder for a start, sharing with the user's own what is not tied to the sign-in.
  prepare(home: string): Promise<void>
  identity(home: string | undefined): Promise<{ email: string | null }>
  // Its CLI's arguments to sign in, and out, in the folder its env names.
  login: readonly string[]
  logout: readonly string[]
}

export type AgentDetection = Omit<EnvironmentCheck, 'tool'>

// A one-off request: the prompt on stdin or in argv, and the answer on stdout or in a file.
export type QuickCommand = { command: string; args: string[]; stdin: string | null; output: 'stdout' | 'file'; env?: Record<string, string> }

// How long an agent is given to obey a cancel, then a TERM, before it is stopped harder.
export type CancelGrace = { cancelGraceMs: number; termGraceMs: number }

// The stage an adapter's launch steps act for.
export type AgentStage = { sessionsRoot: string; conversationId: string; stageId: string; planOnly: boolean }

// Everything core knows of one agent beyond its descriptor: how to start it, speak to it, find it
// and read its limits. Core asks the adapter rather than the agent's name, so an agent is added by
// writing one and registering it (agents/index.ts).
export interface AgentAdapter {
  readonly maintenance?: {
    packageName?: string
    packageArgs?: readonly string[]
    brew?: { name: string; cask: boolean }
    native?: { roots: Partial<Record<NodeJS.Platform, readonly string[]>>; args: readonly string[]; latestUrl?: string; tagPrefix?: string }
  }
  readonly kind: AgentKind
  createDriver(stageId: string, options: ChatStageOptions): ChatDriver
  command(launch: AgentLaunch): AgentCommand
  // Antumi's modes it can start in; a start asking another is refused before anything runs.
  readonly permissionModes: readonly string[]
  // The mode a stage starts in when the chosen one is not among its modes; without one, the CLI's
  // own default stands.
  readonly fallbackMode?: ChatPermissionMode
  readonly session: {
    // False where a provider's history cannot be loaded reliably: continue through a handoff.
    nativeResume?: boolean
    // Antumi names the session before launch, so one that died before its first prompt left an id
    // the agent never saved: only a session that recorded messages is resumed.
    preassignedId: boolean
    // Its sessions belong to the folder they ran in: moved elsewhere, it starts afresh from a handoff.
    folderBound: boolean
    // How it takes its own session over in a fork: at any turn (a fork point), only whole (so only
    // from the latest turn), or not at all. Where it cannot, the fork starts from a handoff.
    nativeFork: 'any' | 'latest' | 'none'
  }
  // How long its handshake may take, where the host's own wait is too short.
  readonly startTimeoutMs?: number
  // Who asks before Antumi's MCP tools run a terminal command: the agent itself, or Antumi in the chat.
  readonly mcpApproval: 'agent' | 'antumi'
  // A model provider's models under the ids it takes them by, for an agent that can run on one
  // (its descriptor's capabilities.modelProviders); its command then takes AgentLaunch.provider.
  providerModels?(provider: Pick<ProviderLaunch, 'providerId' | 'models' | 'defaultModel'>): ChatModel[]
  // The sessions it kept of its runs outside Antumi, which an imported conversation resumes.
  readonly transcripts?: TranscriptSource
  readonly usageTranscripts?: { format: 'claude' | 'codex'; home(home?: string): string }
  readonly warmup?: { probe: QuickCommand; args(printed: string): string[] }
  // Its models without a chat to read them from; without it, a probe of its chat protocol.
  catalog?(cwd: string): Promise<ChatCatalog | null>
  // How the environment check finds it; without it, its kind on PATH, asked for --version.
  detect?(pathEnv: string, platform: NodeJS.Platform): Promise<AgentDetection>
  signedIn?(home?: string): Promise<boolean>
  readonly usage?: UsageSource
  readonly accounts?: AccountSupport
  // Spends one of the usage resets its reading reports, without the agent's own app.
  readonly useResetCredit?: ResetCreditUse
  // The command that installs its CLI, offered when its application is found without the CLI.
  installation?(platform: NodeJS.Platform): AgentCliInstallation | null
  // Its installation is offered whenever it is missing, not only beside its application: Antumi
  // downloads what it runs itself, which no application of its maker's provides.
  readonly installWithoutApplication?: boolean
  // What discovery looks for besides its CLI: other executable names, and application bundles.
  readonly discovery?: { commands: readonly string[]; applications: Partial<Record<NodeJS.Platform, readonly string[]>> }
  // Steps around starting its process, for an agent its command line alone does not set up.
  readonly launch?: {
    // Antumi's MCP server as this agent is to start it.
    mcp(server: McpServer, stage: AgentStage): McpServer
    // Before the process starts, given the server it gets and the launch its command came from:
    // the executable to run in place of the command's, once that is known to be able to run,
    // arguments naming files the step wrote, and variables pointing at them. A file that must not
    // outlive the process goes in the stage's own private folder (stage-launch.ts), which core
    // removes once the process is gone.
    prepare(stage: AgentStage, mcp: McpServer | undefined, launch: AgentLaunch): Promise<{ command?: string; args?: readonly string[]; env?: Record<string, string> }>
    // After its handshake, before its first message.
    ready(stage: AgentStage): Promise<void>
  }
  // How its turns are handled beyond what its driver does.
  readonly turns?: {
    // Sends and retries wait for one another: its process cannot take them interleaved.
    serialized?: boolean
    // It may not obey a cancel: after one, its process is stopped, by TERM and then by force,
    // each after its grace.
    stopAfterCancel?: CancelGrace
    // A prompt with no event for this long is stopped, with a notice offering to retry it. Its
    // driver tells which frames start and belong to a turn (ChatDriver.turnSignal).
    firstFrameTimeoutMs?: number
    // Before that, after this long, the user is told and may stop it and retry at once.
    firstFrameNoticeMs?: number
    // A failed or stalled turn can be sent again from a fresh process.
    retryByRestart?: boolean
    // The message that goes with a denial reaches it only as a message of its own.
    denialAsMessage?: boolean
  }
  // Its model and effort are remembered as its state reports them after a switch, not as asked.
  readonly optionsFromState?: boolean
  // A one-off request with no tools and nothing kept, for a small job such as translating a reply
  // (on its descriptor's quickModels): the command, `outputFile` where its answer goes to a file.
  readonly quick?: {
    command(prompt: string, model: string | null, outputFile: string): QuickCommand | Promise<QuickCommand>
    parse(printed: string, model: string | null): QuickAnswer
  }
}
