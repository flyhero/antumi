import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { CONTEXT_COMPACTED, RESERVED_MCP_SERVER_NAME, type ApprovalChoice, type ChatDecision, type ChatImage, type ChatModel, type ChatOption, type ChatTodo, type ChatTurnActivity, type ChatTurnState } from '@antumi/protocol'
import { antumiReadTools } from '../../agent-command'
import { offeredCommand } from '../../agent-commands'
import { startNote } from '../../agent-prompt'
import { AntumiRequests } from '../../antumi-requests'
import { claudeGrants } from '../../approval-choices'
import { messageText, type ChatAnswer, type ChatDriver, type ChatImageFile, type ChatOutgoing, type ChatRecord, type ChatStageOptions, type StageMessage } from '../../chat-driver'
import { ChatItems, clip } from '../../chat-items'
import { ChatQueue } from '../../chat-queue'
import { StageState } from '../../chat-stage-state'
import { referencePathIn } from '../../reference-paths'
import { Rejection } from '../../rejection'
import { describeClaudeTool, inputDiffs, inputText } from '../claude/claude-stream'
import { antumiMode, isZCodeMode, ZCODE_MODES, type ZCodePermissionMode } from './zcode-modes'
import { CommandAck, DeltaOp, Frame, PermissionRequest, Row, SessionRead, RowChange, RowDelta, SessionState, Snapshot, StateUpdated, StorageState, SubagentRow, TextRow, ToolRow, TopicFrame, TurnHeaderRow, UserInputRequest, UserInputRow, WireFrame, type SessionConfig, type SessionSettings } from './zcode-schema'
import { WireAssembler } from './zcode-wire'

// Antumi's id among ZCode's clients, and the connection its subscriptions belong to.
const CLIENT_ID = 'antumi'
const CONNECTION_ID = 'antumi'
const ID = {
  create: 'zcode-create',
  resume: 'zcode-resume',
  subscribe: 'zcode-subscribe',
  read: 'zcode-read'
} as const
// ZCode's own tools whose calls show elsewhere: a question as its card, the checklist in the stage's
// state, the search for a deferred tool not at all.
const HIDDEN_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode', 'TodoWrite', 'TodoRead', 'ToolSearch'])
const PLAN_SAVED = '计划已保存到任务里，等它依赖的任务完成后再执行。现在不要实现，也不要再修改计划，回复一句确认即可。'
const REVISE_PLAN = '继续规划：请完善这个计划后再给我。'
const DECLINED = '用户拒绝了这次调用。'
const READ_ONLY_DENIAL = '此阶段只读，Antumi 已拒绝这次修改'
// The tools that change files: what a read-only stage refuses without asking. Commands still ask,
// as ZCode decides which are risky.
const EDIT_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const TODO = z.looseObject({ content: z.string(), status: z.string().catch('pending'), activeForm: z.string().nullish() })

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const record = (value: unknown): Record<string, unknown> => z.record(z.string(), z.unknown()).catch({}).parse(value)
const rpc = <P>(id: string, method: string, params: P) => ({ id, method, params })
const modelId = (provider: string, model: string) => `${provider}/${model}`

type Pending =
  | { kind: 'permission'; rawId: string | number; itemId: string; toolItemId: string; options: PermissionRequest['options']; tool: string }
  | { kind: 'question'; rawId: string | number; itemId: string }
  | { kind: 'plan'; rawId: string | number; itemId: string }
// A message sent and not yet shown by ZCode as a row, by the command that sent it (or, for one sent
// with images, the request).
type Sent = { ref: string; text: string; images: ChatImage[]; steer: boolean }
type Turn = {
  ref: string
  began: number
  // The turnHeader row ZCode keeps for it, once it does.
  rowId: number | null
  resumed: boolean
  reply: string
  // What the session had used when the turn began, to tell what the turn itself used.
  used: { input: number; output: number; cacheRead: number; cacheWrite: number }
  model: string | null
}

// Speaks ZCode Protocol to `zcode app-server --stdio`: commands go out through v4/command, the
// session comes back as a conversation topic (a snapshot, then deltas to its rows and its state),
// and ZCode asks before a tool runs with requests of its own. Everything it knows comes from
// apply(), so a stage rebuilt from its log ends up the same.
export class ZCodeAppServer implements ChatDriver {
  readonly items: ChatItems
  private readonly state: StageState
  private readonly antumi: AntumiRequests
  private readonly queue = new ChatQueue()
  private readonly assembler = new WireAssembler()
  // Our requests by id, until answered: the method, and for a command its type.
  private readonly requests = new Map<string, { method: string; command?: string }>()
  private readonly optionErrors = new Map<string, string>()
  // Answers owed to ZCode's requests, by its request id.
  private readonly owed = new Map<string, unknown>()
  // Initial switches a resumed session still needs to match what the conversation chose, sent one
  // at a time: a second sent on the same revision is refused as stale.
  private readonly initial = new Map<string, unknown>()
  private readonly initialTried = new Set<'mode' | 'model'>()
  // The revision the last of them was sent on, until the state it changed comes back.
  private initialRevision: number | null = null
  private initialSettled = false
  private readonly sentIds = new Set<string>()
  private readonly sent = new Map<string, Sent>()
  // A message sent with images (session/send), which names no command: the next user row is it.
  private sentWithImages: Sent | null = null
  private readonly pending = new Map<string, Pending>()
  // Tool calls the user denied, to show them as denied rather than cut short.
  private readonly denied = new Set<string>()
  private readonly rows = new Map<number, Row>()
  // User rows already shown: ZCode sends a row again whenever it touches it.
  private readonly userRows = new Set<number>()
  // Rows the resumed session already had: the conversation shows them from earlier stages.
  private baseline = 0
  // The frame a fragment completed, for the log to keep in its place.
  private readonly assembled = new Map<string, unknown>()
  private sessionId: string | null
  private persisted: boolean
  private snapshotRead = false
  private settingsRead = false
  private settings: SessionSettings | null = null
  private session: SessionState = {}
  private readOnlyChosen: boolean
  // The mode a plan waiting for approval is to run in, as the switch sent with its approval says.
  private planMode: ZCodePermissionMode | null = null
  private startError: string | null = null
  private lost = false
  private exited = false
  private stopping = false
  // ZCode said a turn runs since the last ended, so a phase that settles ends one without a row.
  private turnStarted = false
  private serial = 0
  private turns = 0
  private turn: Turn | null = null
  private messages: StageMessage[] = []

  constructor(stageId: string, private readonly options: ChatStageOptions, private readonly catalogOnly = false) {
    this.items = new ChatItems(stageId)
    this.state = new StageState(this.items)
    this.antumi = new AntumiRequests(this.items)
    this.sessionId = options.resume
    this.persisted = Boolean(options.resume)
    this.readOnlyChosen = Boolean(options.readOnly) || options.preferred?.permissionMode === 'readOnly'
  }

  apply(entry: ChatRecord): void {
    if (entry.dir === 'out' && entry.ref) this.items.beginDelivery(entry.ref)
    if (entry.dir === 'receipt' || entry.dir === 'undelivered') this.items.rememberDelivery(entry.ref, entry.dir === 'receipt' ? 'submitted' : 'undelivered', entry.at)
    if (entry.dir === 'out' && entry.ref && entry.references) this.items.rememberReferences(entry.ref, entry.references)
    switch (entry.dir) {
      case 'in': this.receive(entry.frame, entry.at); break
      case 'out': this.sentFrame(entry.frame, entry.at, entry.ref, entry.images ?? []); break
      case 'option':
        if (entry.option === 'permissionMode') this.readOnlyChosen = entry.value === 'readOnly' || Boolean(this.options.readOnly)
        break
      case 'queue': this.queue.apply(entry); break
      case 'note':
        this.items.notice(entry.level, entry.text, entry.at, {
          ...(entry.id !== undefined ? { id: entry.id } : {}),
          ...(entry.action !== undefined ? { action: entry.action } : {})
        })
        break
      case 'item': this.items.put(entry.item, entry.at); break
      case 'ask':
      case 'answer': this.antumi.apply(entry); break
      case 'exit': this.ended(entry.stderr, entry.at); break
      case 'reply': break
    }
    if (this.snapshotRead && this.settingsRead) this.checkInitial()
    this.publishOptions()
    this.state.set({ queued: this.queue.first, queue: this.queue.view, steerable: this.canSteer() })
    this.state.publish(entry.at)
  }

  due(): unknown[] {
    if (this.exited) return []
    const frames = [...this.owed.values()]
    if (this.startError) return frames
    const unsent = (frame: { id: string }) => !this.sentIds.has(frame.id)
    if (!this.sessionId) return [...frames, ...[this.createSession()].filter(unsent)]
    if (this.catalogOnly) return [...frames, ...[rpc(ID.read, 'session/read', { sessionId: this.sessionId })].filter(unsent)]
    if (this.options.resume && !this.sentIds.has(ID.resume)) return [...frames, this.resumeSession()]
    if (this.options.resume && this.requests.has(ID.resume)) return frames
    const opening = [
      rpc(ID.subscribe, 'v4/conversation/subscribe', { topic: `conversation/${this.sessionId}`, connectionId: CONNECTION_ID, clientMode: 'desktop-continuous', workspace: this.workspace() }),
      rpc(ID.read, 'session/read', { sessionId: this.sessionId })
    ].filter(unsent)
    if (opening.length) return [...frames, ...opening]
    if (!this.snapshotRead || !this.settingsRead) return frames
    return [...frames, ...[...this.initial.values()].filter((frame) => !this.sentIds.has(Frame.parse(frame).id?.toString() ?? ''))]
  }

  ready(): boolean { return this.snapshotRead && this.settingsRead && this.initialSettled && !this.startError && !this.exited }
  failure(): string | null { return this.startError ?? (this.exited && !this.snapshotRead ? 'ZCode 进程已退出' : null) }
  sessionLost(): boolean { return this.lost }
  activeTurnRef(): string | null { return this.turn?.ref ?? null }
  activity(): ChatTurnActivity { return this.pending.size || this.antumi.pending ? 'awaiting' : this.turn || this.changing() ? 'running' : 'idle' }
  providerSessionId(): string | null { return this.persisted ? this.sessionId : null }
  canSteer(): boolean { return Boolean(this.turn && this.turn.rowId !== null && !this.stopping) }
  queuedToSend() { return this.ready() && !this.turn && !this.changing() ? this.queue.next() : null }
  takeMessages(): StageMessage[] { const taken = this.messages; this.messages = []; return taken }

  explainFailure(stderr: string): string | null {
    if (/unknown (option|command)|app-server/i.test(stderr) && /usage/i.test(stderr)) return '这个 ZCode 版本不支持 app-server，请升级 ZCode'
    if (/no (model|provider)|model access|login/i.test(stderr)) return '没有可用的模型：在终端运行 zcode login，或在 ZCode 里配置模型服务商'
    return null
  }

  send(text: string, images: readonly ChatImageFile[] = []): ChatOutgoing {
    if (!this.ready() || !this.sessionId) throw new Rejection('chat-starting', 'ZCode 尚未就绪')
    if (this.turn) throw new Rejection('chat-busy', 'ZCode 正在处理上一条消息')
    if (this.changing()) throw new Rejection('chat-option-changing', '请等待 ZCode 确认配置变更')
    const note = this.turns === 0 ? startNote({ instructions: this.options.instructions, knowledgeBase: this.options.knowledgeBase, todos: Boolean(this.options.mcp) && this.options.todos !== false }) : null
    const wired = note ? `${note}\n\n${text}` : text
    if (images.length) {
      if (!this.currentModel()?.images) throw new Rejection('chat-images-unsupported', '当前 ZCode 模型不支持图片输入')
      // V4 takes images only as an upload of their bytes; the older session/send reads them from
      // their files, as ZCode's own desktop does for a local workspace.
      const attachments = images.map((image) => ({ kind: 'image', localPath: image.path, filename: path.basename(image.path), mimeType: image.mime }))
      const id = this.next('send')
      return { wire: rpc(id, 'session/send', { sessionId: this.sessionId, content: wired, attachments }), logged: rpc(id, 'session/send', { sessionId: this.sessionId, content: text, attachments }) }
    }
    const logged = this.command('sendText', { text })
    return { wire: { ...logged, params: { ...logged.params, payload: { text: wired } } }, logged }
  }

  // Into the running turn: ZCode takes it at the next point the model may hear it, or, where it
  // cannot, runs it as soon as the turn ends.
  steer(text: string, images: readonly ChatImageFile[] = []): ChatOutgoing {
    if (!this.canSteer()) throw new Rejection('chat-no-steer', '没有可以追加消息的回合')
    if (images.length) throw new Rejection('chat-images-unsupported', '向正在执行的回合追加消息时不能带图片')
    const frame = this.command('sendText', { text, requestedDelivery: 'guide' })
    return { wire: frame, logged: frame }
  }

  setOption(option: ChatOption, value: string): unknown[] {
    if (!this.ready()) throw new Rejection('chat-starting', 'ZCode 尚未就绪')
    if (this.changing()) throw new Rejection('chat-option-changing', '请等待 ZCode 确认上一项配置变更')
    return [this.change(option, value)]
  }

  private change(option: ChatOption, value: string, id?: string): { id: string; method: string; params: Record<string, unknown> } {
    if (option === 'permissionMode') {
      if (!this.permissionModes().includes(value) || !isZCodeMode(value)) throw new Rejection('chat-option-invalid', `ZCode 不支持 ${value}`)
      const target = ZCODE_MODES[value]
      return this.command('switchCollaborationMode', { mode: target.planEnabled ? 'plan' : target.mode }, { baseRevision: this.session.revision ?? 0 }, id)
    }
    const models = this.offered()
    const config = this.session.config ?? {}
    if (option === 'model') {
      const model = models.find((each) => each.id === value)
      if (!model) throw new Rejection('chat-option-invalid', `ZCode 没有提供模型 ${value}`)
      const [provider, ...rest] = value.split('/')
      const thought = config.thought && model.efforts.includes(config.thought) ? config.thought : model.efforts[0] ?? config.thought ?? 'disabled'
      return this.command('switchModelConfig', { provider, model: rest.join('/'), thought }, { baseRevision: this.session.revision ?? 0 }, id)
    }
    const current = models.find((each) => each.id === this.currentModelId())
    if (!current?.efforts.includes(value) || !config.provider || !config.model) throw new Rejection('chat-option-invalid', `当前模型不支持 effort: ${value}`)
    return this.command('switchModelConfig', { provider: config.provider, model: config.model, thought: value }, { baseRevision: this.session.revision ?? 0 }, id)
  }

  optionResult(frame: unknown): { pending: boolean; error: string | null } {
    const id = Frame.safeParse(frame).data?.id
    if (id === undefined) return { pending: false, error: null }
    return { pending: this.requests.has(String(id)), error: this.optionErrors.get(String(id)) ?? null }
  }

  private changing(): boolean {
    return [...this.requests.values()].some((request) => request.command === 'switchModelConfig' || request.command === 'switchCollaborationMode')
  }

  respond(requestId: string, answer: ChatAnswer): unknown[] {
    const pending = this.pending.get(requestId)
    if (!pending) throw new Rejection('chat-request-gone', '这个请求已结束')
    if (pending.kind === 'question') {
      const answers = answer.decision === 'deny' ? null : answer.answers ?? null
      if (!answers) return [{ id: pending.rawId, result: { action: 'decline', ...(answer.message ? { reason: answer.message } : {}) } }]
      return [{ id: pending.rawId, result: { action: 'accept', content: { answers: Object.fromEntries(Object.entries(answers).map(([question, labels]) => [question, labels.join(', ')])) } } }]
    }
    if (pending.kind === 'plan') {
      // A plan kept for later, or sent back, goes back as the user's words: ZCode keeps planning on them.
      if (answer.saved) return [{ id: pending.rawId, result: { action: 'accept', content: { answer: PLAN_SAVED } } }]
      if (answer.decision === 'deny') return [{ id: pending.rawId, result: { action: 'accept', content: { answer: answer.message ? `继续规划：${answer.message}` : REVISE_PLAN } } }]
      if (this.options.planOnly || this.options.readOnly) throw new Rejection('plan-only', '此阶段只能规划，请先保存计划')
      const mode = answer.mode ?? (answer.decision === 'allowForSession' ? 'acceptEdits' : 'ask')
      if (mode === 'plan' || !this.permissionModes().includes(mode) || !isZCodeMode(mode)) throw new Rejection('chat-option-invalid', `ZCode 不能在 ${mode} 模式执行计划`)
      // The plan runs on in the mode under the plan flag, which approving it clears.
      const target = ZCODE_MODES[mode]
      const switched = this.session.config?.mode === target.mode ? [] : [this.command('switchCollaborationMode', { mode: target.mode }, { baseRevision: this.session.revision ?? 0 })]
      return [...switched, { id: pending.rawId, result: { action: 'accept', content: { answer: 'approve' } } }]
    }
    const option = (answer.choice ? pending.options.find((each) => each.optionId === answer.choice) : undefined)
      ?? pending.options.find((each) => decisionOf(each.kind) === answer.decision)
    if (!option) throw new Rejection('chat-option-invalid', 'ZCode 没有这个选项')
    return [{ id: pending.rawId, result: decisionOf(option.kind) === 'deny' ? refusal(answer.message || DECLINED) : option.response ?? { decision: 'allow' } }]
  }

  interrupt(): unknown[] {
    if (!this.turn || !this.sessionId) throw new Rejection('chat-idle', '没有正在执行的回合')
    const cancels = [...this.pending.values()].map((pending) => ({ id: pending.rawId, result: pending.kind === 'permission' ? refusal('用户中止了这一轮') : { action: 'cancel' } }))
    return [...cancels, this.command('stop', {})]
  }

  logged(frame: unknown): unknown | null {
    const parsed = Frame.safeParse(frame)
    if (!parsed.success) return null
    const { id, method, params } = parsed.data
    if (method === undefined) {
      const request = id === undefined ? undefined : this.loggedRequest(String(id))
      // What is read of the bulky answers: none of a resumed session's messages, and of its
      // settings only the models and commands.
      if (request === 'session/resume') return { id, result: {} }
      if (request === 'session/read') {
        const read = SessionRead.safeParse(parsed.data.result).data
        return { id, result: { settings: read?.settings ?? {}, slashCommands: read?.slashCommands ?? [] } }
      }
      return frame
    }
    if (id !== undefined) return frame
    switch (method) {
      case 'v4/conversation/frame': {
        const wire = WireFrame.safeParse(params).data
        if (!wire?.topic.startsWith('conversation/')) return null
        const whole = wire.kind === 'complete' ? wire.frame : this.assembled.get(wire.logicalFrameId)
        this.assembled.delete(wire.logicalFrameId)
        const topic = TopicFrame.safeParse(whole).data
        if (!topic) return null
        if (topic.payload.kind === 'snapshot') return { method, params: { kind: 'complete', topic: wire.topic, logicalFrameId: wire.logicalFrameId, frame: topic } }
        // Streamed text is covered by the row it completes.
        const deltas = topic.payload.deltas.filter((delta) => DeltaOp.safeParse(delta).data?.op !== 'row.delta')
        if (!deltas.length) return null
        return { method, params: { kind: 'complete', topic: wire.topic, logicalFrameId: wire.logicalFrameId, frame: { ...topic, payload: { kind: 'deltas', deltas } } } }
      }
      case 'startup/storageState': {
        const phase = StorageState.safeParse(params).data?.phase
        return phase && /fail|error/i.test(phase) ? frame : null
      }
      default:
        return null
    }
  }

  private loggedRequest(id: string): string | undefined {
    if (id === ID.resume) return 'session/resume'
    if (id === ID.read) return 'session/read'
    return undefined
  }

  private next(kind: string): string { return `zcode-${kind}-${++this.serial}` }

  private command(type: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}, id = this.next(type)) {
    return rpc(id, 'v4/command', { commandId: randomUUID(), clientId: CLIENT_ID, sessionId: this.sessionId, type, payload, issuedAt: Date.now(), ...extra })
  }

  private workspace() {
    return { workspaceKey: this.options.cwd, workspacePath: this.options.cwd }
  }

  // The folders the session works in besides its own: the conversation's other projects, the
  // reference projects it reads (edits there are refused), and the user's vault.
  private directories(): string[] {
    return [...new Set([...this.options.extraDirs, ...(this.options.references ?? []), ...(this.options.knowledgeBase ? [this.options.knowledgeBase.path] : [])])]
  }

  private mcpServers(): unknown[] {
    const env = (vars: Record<string, string> | undefined) => Object.entries(vars ?? {}).map(([name, value]) => ({ name, value }))
    const mcp = this.options.mcp
    return [
      ...(mcp ? [{ name: RESERVED_MCP_SERVER_NAME, command: mcp.command, args: mcp.args, env: env(mcp.env) }] : []),
      ...(this.options.userMcp ?? []).map((server) => server.type === 'stdio'
        ? { name: server.name, command: server.command, args: server.args, env: env(server.env) }
        : { name: server.name, type: 'http', url: server.url, headers: [] })
    ]
  }

  private startMode(): ZCodePermissionMode {
    if (this.options.planOnly) return 'plan'
    if (this.options.readOnly) return 'readOnly'
    const preferred = this.options.preferred?.permissionMode
    return preferred && isZCodeMode(preferred) && this.permissionModes().includes(preferred) ? preferred : 'ask'
  }

  private createSession() {
    const mode = ZCODE_MODES[this.startMode()]
    const preferred = this.preferredModel()
    const frame = this.command('createSession', {
      workspaceId: this.options.cwd,
      ...(this.directories().length ? { additionalDirectories: this.directories() } : {}),
      // Always named: left out, ZCode starts a session in its workspace default, which is yolo.
      config: { mode: mode.mode, planEnabled: mode.planEnabled, ...(preferred ? { provider: preferred.provider, model: preferred.model } : {}), ...(this.options.preferred?.effort ? { thought: this.options.preferred.effort } : {}) },
      ...(this.catalogOnly ? {} : { mcpServers: this.mcpServers() })
    }, {}, ID.create)
    return frame
  }

  // MCP servers given when a session is made are gone once its process is: a resumed session gets
  // them again here, as ZCode's desktop gives them.
  private resumeSession() {
    return rpc(ID.resume, 'session/resume', { sessionId: this.sessionId, workspace: this.workspace(), ...(this.directories().length ? { additionalDirectories: this.directories() } : {}), mcpServers: this.mcpServers() })
  }

  private preferredModel(): { provider: string; model: string } | null {
    const chosen = this.options.preferred?.model ?? this.options.providerModels?.find((model) => model.isDefault)?.id ?? this.options.providerModels?.[0]?.id
    if (!chosen) return null
    const [provider, ...rest] = chosen.split('/')
    return provider && rest.length ? { provider, model: rest.join('/') } : null
  }

  // A resumed session runs as it last did; what the conversation chose since is switched to once.
  private checkInitial(): void {
    if (this.initialSettled || this.initial.size) return
    if (this.catalogOnly) { this.initialSettled = true; return }
    // A switch is judged on the state it changed, which comes with a newer revision.
    if (this.initialRevision !== null && (this.session.revision ?? 0) <= this.initialRevision) return
    const next = this.options.resume ? this.nextInitial() : null
    if (!next) { this.settle(); return }
    this.initialTried.add(next.step)
    this.initialRevision = this.session.revision ?? 0
    this.initial.set(`zcode-initial-${next.step}`, next.frame)
  }

  // What a resumed session still needs to run as the conversation chose: its mode, then its model
  // with the effort chosen for it.
  private nextInitial(): { step: 'mode' | 'model'; frame: unknown } | null {
    const config = this.session.config ?? {}
    const mode = this.startMode()
    if (!this.initialTried.has('mode') && antumiMode(config, this.readOnlyChosen) !== mode) return { step: 'mode', frame: this.change('permissionMode', mode, 'zcode-initial-mode') }
    const model = this.intendedModel()
    const effort = this.intendedEffort(model)
    if (this.initialTried.has('model') || !model || (model.id === this.currentModelId() && (!effort || effort === config.thought))) return null
    const [provider, ...rest] = model.id.split('/')
    const thought = effort ?? (config.thought && model.efforts.includes(config.thought) ? config.thought : model.efforts[0] ?? config.thought ?? 'disabled')
    return { step: 'model', frame: this.command('switchModelConfig', { provider, model: rest.join('/'), thought }, { baseRevision: this.session.revision ?? 0 }, 'zcode-initial-model') }
  }

  // The model the conversation chose, where the stage offers it; none chosen, the one it runs; on a
  // model provider, else the provider's default.
  private intendedModel(): ChatModel | null {
    const preferred = this.preferredModel()
    const offered = this.offered()
    const wanted = preferred ? modelId(preferred.provider, preferred.model) : this.currentModelId()
    return offered.find((model) => model.id === wanted) ?? (this.options.providerModels ? offered.find((model) => model.isDefault) ?? offered[0] ?? null : null)
  }

  private intendedEffort(model: ChatModel | null): string | null {
    const effort = this.options.preferred?.effort
    return effort && model?.efforts.includes(effort) ? effort : null
  }

  // Ready, once the session runs as chosen: in the chosen mode, as a stage may not run freer than
  // its user asked; and a stage on a model provider on the chosen one of its models, as ZCode falls
  // back to another (or to none) where the provider's will not load.
  private settle(): void {
    this.initialSettled = true
    if (this.catalogOnly) return
    const config = this.session.config ?? {}
    const mode = antumiMode(config, this.readOnlyChosen)
    if (mode !== this.startMode()) {
      this.startError = `ZCode 没能切到所选的权限模式（现在是 ${mode ?? config.mode ?? '未知'}）`
      return
    }
    if (!this.options.providerModels) return
    const current = this.currentModelId()
    const intended = this.intendedModel()
    if (!intended || intended.id !== current) this.startError = `ZCode 没有用上服务商的模型 ${intended?.id ?? ''}（现在是 ${current ?? '无'}），请检查服务商的地址和 Key`
  }

  private sentFrame(raw: unknown, at: number, ref: string | undefined, images: readonly ChatImage[]): void {
    const frame = Frame.safeParse(raw).data
    if (!frame || frame.id === undefined) return
    const id = String(frame.id)
    // An answer to one of ZCode's requests.
    if (frame.method === undefined) {
      this.owed.delete(id)
      this.answered(id, frame.result, at)
      return
    }
    this.sentIds.add(id)
    this.requests.set(id, { method: frame.method })
    if (frame.method === 'session/send') {
      const params = z.looseObject({ content: z.string().catch('') }).catch({ content: '' }).parse(frame.params)
      this.sentWithImages = { ref: ref ?? `zcode:${id}`, text: params.content, images: [...images], steer: false }
      this.open(this.sentWithImages, at)
      return
    }
    if (frame.method !== 'v4/command') return
    const command = z.looseObject({ commandId: z.string(), type: z.string(), payload: z.looseObject({ text: z.string().optional(), requestedDelivery: z.string().optional() }).catch({}) }).safeParse(frame.params).data
    if (!command) return
    this.requests.set(id, { method: frame.method, command: command.type })
    if (command.type === 'stop') { this.stopping = true; return }
    if (command.type === 'switchCollaborationMode' && [...this.pending.values()].some((pending) => pending.kind === 'plan')) {
      this.planMode = antumiMode({ mode: str(record(command.payload).mode) ?? undefined }, false)
    }
    if (command.type !== 'sendText') return
    const steer = command.payload.requestedDelivery === 'guide'
    const message: Sent = { ref: ref ?? `zcode:${command.commandId}`, text: command.payload.text ?? '', images: [...images], steer }
    this.sent.set(command.commandId, message)
    if (!steer) this.open(message, at)
  }

  private open(message: Sent, at: number): Turn {
    this.queue.sent(message.ref)
    this.turns++
    this.stopping = false
    const used = this.session.usage?.cumulative
    const turn: Turn = { ref: message.ref, began: at, rowId: null, resumed: false, reply: '', used: { input: used?.inputTokens ?? 0, output: used?.outputTokens ?? 0, cacheRead: used?.cacheReadTokens ?? 0, cacheWrite: used?.cacheWriteTokens ?? 0 }, model: this.currentModelId() }
    this.turn = turn
    this.state.set({ turnUsage: null })
    this.items.put({ id: `u:${message.ref}`, kind: 'user', text: message.text, images: message.images }, at)
    this.messages.push({ role: 'user', text: messageText(message.text, message.images), eventKey: `chat:${message.ref}:user`, complete: false })
    return turn
  }

  // Our answer to one of ZCode's requests: the card it answered shows how.
  private answered(id: string, result: unknown, at: number): void {
    const requestId = [...this.pending].find(([, pending]) => String(pending.rawId) === id)?.[0]
    if (!requestId) return
    const pending = this.pending.get(requestId)
    this.pending.delete(requestId)
    if (!pending) return
    const item = this.items.get(pending.itemId)
    if (pending.kind === 'question') {
      if (item?.kind !== 'question') return
      const answer = z.looseObject({ action: z.string(), content: z.looseObject({ answers: z.record(z.string(), z.string()).optional() }).optional() }).safeParse(result).data
      const answers = answer?.action === 'accept' && answer.content?.answers ? Object.fromEntries(Object.entries(answer.content.answers).map(([question, labels]) => [question, labels.split(', ')])) : null
      this.items.put({ ...item, answers, resolution: answers ? 'answered' : 'cancelled' }, at)
      return
    }
    if (item?.kind !== 'approval') return
    if (pending.kind === 'plan') {
      const answer = z.looseObject({ action: z.string(), content: z.looseObject({ answer: z.string().optional() }).optional() }).safeParse(result).data
      const approved = answer?.action === 'accept' && answer.content?.answer === 'approve'
      const cancelled = answer?.action === 'cancel'
      // Carried out in the mode switched to with it, else the one the session already had.
      const mode = approved ? this.planMode ?? antumiMode({ mode: this.session.config?.mode }, this.readOnlyChosen) : null
      this.planMode = null
      this.items.put({ ...item, resolution: approved ? (mode && mode !== 'ask' ? 'allowedForSession' : 'allowed') : cancelled ? 'cancelled' : 'denied', ...(mode ? { mode } : {}) }, at)
      return
    }
    // The answer is the chosen option's own response, or a refusal in the user's words.
    const answer = JSON.stringify(result)
    const allowed = z.looseObject({ decision: z.string() }).safeParse(result).data?.decision === 'allow'
    const option = pending.options.find((each) => JSON.stringify(each.response) === answer) ?? pending.options.find((each) => decisionOf(each.kind) === (allowed ? 'allow' : 'deny'))
    const decision = option ? decisionOf(option.kind) : 'deny'
    if (decision === 'deny') this.denied.add(pending.toolItemId)
    this.items.put({ ...item, resolution: decision === 'allow' ? 'allowed' : decision === 'allowForSession' ? 'allowedForSession' : this.stopping ? 'cancelled' : 'denied', chosen: option?.optionId ?? null }, at)
  }

  private receive(raw: unknown, at: number): void {
    const parsed = Frame.safeParse(raw)
    if (!parsed.success) return
    const frame = parsed.data
    if (frame.method === undefined) {
      if (frame.id !== undefined) this.response(String(frame.id), frame, at)
      return
    }
    if (frame.id !== undefined) { this.request(frame.id, frame.method, frame.params, at); return }
    switch (frame.method) {
      case 'v4/conversation/frame': return this.topicWire(frame.params, at)
      case 'startup/storageState': {
        const state = StorageState.safeParse(frame.params).data
        if (state && /fail|error/i.test(state.phase)) this.startError = 'ZCode 没能打开它的会话数据库'
        return
      }
    }
  }

  private response(id: string, frame: Frame, at: number): void {
    const request = this.requests.get(id)
    if (!request) return
    this.requests.delete(id)
    if (frame.error) {
      const message = frame.error.message ?? '未知错误'
      if (id === ID.resume) {
        if (/not (found|persisted|exist)|no such session|sessionNotFound/i.test(message)) this.lost = true
        this.startError = `ZCode 没能恢复会话：${message}`
        return
      }
      if (id === ID.subscribe) { this.startError = `ZCode 没能打开会话：${message}`; return }
      if (id === ID.read) { this.settingsRead = true; return }
      if (request.method === 'session/send') { this.failSent(message, at); return }
      return
    }
    if (id === ID.read) {
      const read = SessionRead.safeParse(frame.result).data
      this.settings = read?.settings ?? null
      this.settingsRead = true
      this.state.set({ commands: (read?.slashCommands ?? []).map((command) => offeredCommand(command.name, command.description, command.inputHint)) })
      if (this.catalogOnly) this.state.set({ models: this.offered() })
      return
    }
    if (request.method !== 'v4/command') return
    const ack = CommandAck.safeParse(frame.result).data
    const refused = !ack || ['rejected', 'failed', 'stale'].includes(ack.status)
    const reason = ack?.message ?? ack?.reasonCode ?? '未知原因'
    if (id === ID.create) {
      if (refused || !ack.result?.sessionId) { this.startError = `ZCode 没能新建会话：${reason}`; return }
      this.sessionId = ack.result.sessionId
      return
    }
    if (this.initial.has(id)) {
      this.initial.delete(id)
      // Nothing changed, so no newer revision comes: what follows need not wait for one.
      if (refused || ack?.status === 'noop' || ack?.status === 'duplicate') this.initialRevision = null
      if (refused && id === 'zcode-initial-model') {
        if (this.options.providerModels) { this.startError = `ZCode 没能切到服务商的模型：${reason}`; return }
        this.items.notice('warning', `ZCode 未采用保存的模型：${reason}`, at)
      }
      return
    }
    if (request.command === 'switchModelConfig' || request.command === 'switchCollaborationMode') {
      if (refused) this.optionErrors.set(id, reason)
      return
    }
    if (request.command === 'sendText' && refused) this.failSent(reason, at)
    if (request.command === 'stop' && refused) this.stopping = false
  }

  // A message ZCode would not take: the turn it opened ends there.
  private failSent(reason: string, at: number): void {
    if (this.turn && this.turn.rowId === null) this.finish('failed', `ZCode 没有接受这条消息：${reason}`, at)
  }

  private request(rawId: string | number, method: string, params: unknown, at: number): void {
    const id = String(rawId)
    switch (method) {
      case 'interaction/requestPermission': return this.permission(rawId, params, at)
      case 'interaction/requestUserInput': return this.userInput(rawId, params, at)
      case 'session/requestRuntimePreferences':
        this.owed.set(id, { id: rawId, result: { additionalDirectories: this.directories(), nativeSearchEnhancementsEnabled: false, toolSearchMode: 'off', memoryEnabled: false, askUserQuestionAutoResolutionEnabled: false } })
        return
      default:
        // Its desktop's own services (account headers, the browser it drives): not Antumi's to give.
        this.owed.set(id, { id: rawId, error: { code: -32601, message: `Antumi does not handle ${method}` } })
    }
  }

  private permission(rawId: string | number, raw: unknown, at: number): void {
    const request = PermissionRequest.safeParse(raw).data
    if (!request) { this.owed.set(String(rawId), { id: rawId, error: { code: -32602, message: 'unreadable permission request' } }); return }
    const input = record(request.input)
    const toolItemId = `tool:${request.toolCallId}`
    const itemId = `a:${request.requestId}`
    const allow = request.options.find((option) => option.kind === 'allow_once')
    // Antumi's own tools that ask nothing of the user go through as they would for any agent.
    const readTool = request.toolName.startsWith(`mcp__${RESERVED_MCP_SERVER_NAME}__`) && antumiReadTools(this.options.todos !== false).includes(request.toolName.slice(`mcp__${RESERVED_MCP_SERVER_NAME}__`.length))
    const fenced = referencePathIn([...(this.options.references ?? []), ...(this.options.knowledgeBase && !this.options.knowledgeBase.write ? [this.options.knowledgeBase.path] : [])], [str(input.file_path), str(input.path)].filter((each): each is string => each !== null))
    const readOnly = (this.options.planOnly || this.readOnlyChosen) && EDIT_TOOLS.has(request.toolName)
    const title = describeClaudeTool(request.toolName, input) || request.toolName
    if (readTool && allow?.response) { this.owed.set(String(rawId), { id: rawId, result: allow.response }); return }
    if (fenced || readOnly) {
      const reason = fenced ? `参考项目只读，Antumi 已拒绝修改 ${fenced}` : READ_ONLY_DENIAL
      this.items.put({ id: itemId, kind: 'approval', requestId: request.requestId, tool: request.toolName, title, detail: reason, toolItemId, decisions: ['allow', 'deny'], resolution: 'denied' }, at)
      this.denied.add(toolItemId)
      this.owed.set(String(rawId), { id: rawId, result: refusal(reason) })
      return
    }
    const choices = request.options.map((option): ApprovalChoice => ({
      id: option.optionId,
      label: option.name || option.label,
      decision: decisionOf(option.kind),
      grants: claudeGrants(option.response?.permissionUpdates ?? [], {}).map((grant) => ({ ...grant, scope: 'agent' }))
    }))
    this.items.put({
      id: itemId,
      kind: 'approval',
      requestId: request.requestId,
      tool: request.toolName,
      title,
      detail: inputText(request.toolName, input),
      toolItemId,
      decisions: [...new Set(choices.map((choice) => choice.decision))],
      choices,
      reason: request.reason || null,
      resolution: null
    }, at)
    this.pending.set(request.requestId, { kind: 'permission', rawId, itemId, toolItemId, options: request.options, tool: request.toolName })
  }

  private userInput(rawId: string | number, raw: unknown, at: number): void {
    const request = UserInputRequest.safeParse(raw).data
    if (!request) { this.owed.set(String(rawId), { id: rawId, result: { action: 'cancel' } }); return }
    const input = record(request.input)
    if (request.schema?.interaction === 'plan_approval' || request.toolName === 'ExitPlanMode') {
      const itemId = `a:${request.requestId}`
      this.items.put({ id: itemId, kind: 'approval', requestId: request.requestId, tool: 'ExitPlanMode', title: '计划', detail: str(input.plan), toolItemId: request.toolCallId ? `tool:${request.toolCallId}` : null, decisions: ['allow', 'allowForSession', 'deny'], resolution: null }, at)
      this.pending.set(request.requestId, { kind: 'plan', rawId, itemId })
      return
    }
    if (!request.questions.length) { this.owed.set(String(rawId), { id: rawId, result: { action: 'cancel' } }); return }
    const itemId = `q:${request.requestId}`
    this.items.put({
      id: itemId,
      kind: 'question',
      requestId: request.requestId,
      questions: request.questions.map((question) => ({
        id: question.question,
        header: question.header,
        question: question.question,
        options: question.options.map((option) => ({ label: option.label, description: option.description ?? null })),
        multiSelect: Boolean(question.multiSelect)
      })),
      answers: null,
      resolution: null
    }, at)
    this.pending.set(request.requestId, { kind: 'question', rawId, itemId })
  }

  private topicWire(params: unknown, at: number): void {
    const wire = WireFrame.safeParse(params).data
    if (!wire || wire.topic !== `conversation/${this.sessionId}`) return
    const whole = this.assembler.take(wire)
    if (whole === null) return
    if (wire.kind === 'fragment') this.assembled.set(wire.logicalFrameId, whole)
    const topic = TopicFrame.safeParse(whole).data
    if (!topic) return
    if (topic.payload.kind === 'snapshot') { this.snapshot(topic.payload.snapshot, at); return }
    for (const delta of topic.payload.deltas) this.delta(delta, at)
  }

  private snapshot(raw: unknown, at: number): void {
    const snapshot = Snapshot.safeParse(raw).data
    if (!snapshot) return
    const rows = (snapshot.rows?.window ?? []).flatMap((row) => { const parsed = Row.safeParse(row); return parsed.success ? [parsed.data] : [] })
    // The first look at a resumed session: what it already holds was shown by the stages before.
    if (!this.snapshotRead && this.options.resume) this.baseline = Math.max(0, ...rows.map((row) => row.rowId))
    this.snapshotRead = true
    this.session = { ...snapshot }
    this.stateChanged(at)
    for (const row of rows) this.row(row, at)
  }

  private delta(raw: unknown, at: number): void {
    switch (DeltaOp.safeParse(raw).data?.op) {
      case 'row.appended':
      case 'row.upserted': {
        const row = Row.safeParse(RowChange.safeParse(raw).data?.row)
        if (row.success) this.row(row.data, at)
        return
      }
      case 'row.delta': {
        const delta = RowDelta.safeParse(raw).data
        const text = TextRow.safeParse(delta ? this.rows.get(delta.rowId) : undefined).data
        if (!delta || !text || delta.rowId <= this.baseline) return
        this.rows.set(delta.rowId, { ...text, text: text.text + delta.append })
        this.items.append(`${text.kind === 'assistantText' ? 'assistant' : 'reasoning'}:${delta.rowId}`, delta.append)
        return
      }
      case 'state.updated': {
        const patch = StateUpdated.safeParse(raw).data?.patch
        if (!patch) return
        this.session = { ...this.session, ...patch }
        this.stateChanged(at)
      }
    }
  }

  // What the session's state says of the stage: its options and context, and a turn that ended with
  // no row of its own to say so (one ZCode ran itself, a /compact).
  private stateChanged(at: number): void {
    const window = this.session.usage?.contextWindow
    if (window) this.state.setContext({ used: window.usedTokens, window: window.maxTokens })
    const phase = this.session.control?.phase
    if (this.turn && this.turn.rowId === null && phase && /^completed|^error$/.test(phase) && this.turnStarted) this.finish(phaseState(phase), this.lastError(), at)
    if (phase === 'running' || phase === 'prewarming') this.turnStarted = true
  }

  private lastError(): string | null {
    return this.session.control?.lastError?.message ?? null
  }

  private row(row: Row, at: number): void {
    if (row.rowId <= this.baseline) return
    this.rows.set(row.rowId, row)
    const header = TurnHeaderRow.safeParse(row)
    if (header.success) return this.header(header.data, at)
    const user = UserInputRow.safeParse(row)
    if (user.success) return this.user(user.data, at)
    const text = TextRow.safeParse(row)
    if (text.success) {
      const kind = text.data.kind === 'assistantText' ? 'assistant' : 'reasoning'
      if (!text.data.text && text.data.state === 'streaming') { this.items.put({ id: `${kind}:${row.rowId}`, kind, text: '', streaming: true }, at); return }
      this.items.put({ id: `${kind}:${row.rowId}`, kind, text: text.data.text, streaming: text.data.state === 'streaming' }, at)
      if (kind === 'assistant' && this.turn && text.data.text.trim()) this.turn.reply = text.data.text
      return
    }
    const tool = ToolRow.safeParse(row)
    if (tool.success) return this.tool(tool.data, at)
    const subagent = SubagentRow.safeParse(row)
    if (subagent.success) {
      const status = subagent.data.status === 'running' ? 'running' : subagent.data.status === 'success' ? 'done' : subagent.data.status === 'cancelled' ? 'interrupted' : 'failed'
      this.items.put({ id: `tool:sub:${row.rowId}`, kind: 'tool', name: 'Agent', title: subagent.data.subagentType, input: null, status, output: subagent.data.summaryText ? clip(subagent.data.summaryText) : null, diffs: [] }, at)
      return
    }
    const marker = z.looseObject({ kind: z.literal('timelineMarker'), marker: z.looseObject({ type: z.string() }).optional(), type: z.string().optional() }).safeParse(row).data
    if (marker && (marker.marker?.type ?? marker.type) === 'compact') this.items.notice('info', CONTEXT_COMPACTED, at, { id: `compact:${row.rowId}` })
  }

  private header(row: z.infer<typeof TurnHeaderRow>, at: number): void {
    const message = row.sourceCommandId ? this.sent.get(row.sourceCommandId) : undefined
    if (row.state === 'running') {
      this.turnStarted = true
      if (this.turn && this.turn.rowId === null && (!message || message.ref === this.turn.ref)) { this.turn.rowId = row.rowId; return }
      if (this.turn) return
      // A turn ZCode started itself (background work reporting back), or a message sent into the
      // last turn that it ran on its own after all.
      if (message && row.sourceCommandId) {
        this.sent.set(row.sourceCommandId, { ...message, steer: false })
        this.open(message, at).rowId = row.rowId
        return
      }
      this.turns++
      const used = this.session.usage?.cumulative
      this.turn = { ref: `zcode:${row.rowId}`, began: row.startedAt ?? at, rowId: row.rowId, resumed: true, reply: '', used: { input: used?.inputTokens ?? 0, output: used?.outputTokens ?? 0, cacheRead: used?.cacheReadTokens ?? 0, cacheWrite: used?.cacheWriteTokens ?? 0 }, model: this.currentModelId() }
      return
    }
    // A row of an earlier turn comes again with others; only this turn's own ends it.
    if (this.turn && (this.turn.rowId === row.rowId || (this.turn.rowId === null && message?.ref === this.turn.ref))) {
      this.finish(headerState(row.state), row.state === 'failed' ? this.lastError() ?? 'ZCode 回合失败' : null, at, row)
    }
  }

  private user(row: z.infer<typeof UserInputRow>, at: number): void {
    if (this.userRows.has(row.rowId)) return
    this.userRows.add(row.rowId)
    const known = row.sourceCommandId ? this.sent.get(row.sourceCommandId) : undefined
    const message = known ?? (this.sentWithImages && row.origin === 'realUser' ? this.sentWithImages : undefined)
    if (message === this.sentWithImages) this.sentWithImages = null
    this.persisted = true
    if (message) {
      // Into a turn already running: shown once ZCode took it.
      if (message.steer) {
        this.queue.sent(message.ref)
        this.items.put({ id: `u:${message.ref}`, kind: 'user', text: message.text, images: message.images, steer: true }, at)
        this.messages.push({ role: 'user', text: messageText(message.text, message.images), eventKey: `chat:${message.ref}:user`, complete: false })
      }
      return
    }
    // A message from another of ZCode's clients, or one it wrote itself.
    if (row.origin !== 'realUser') return
    this.items.put({ id: `u:zcode:${row.rowId}`, kind: 'user', text: row.text, images: [], ...(this.turn && this.turn.rowId !== null ? { steer: true } : {}) }, at)
  }

  private tool(row: z.infer<typeof ToolRow>, at: number): void {
    const input = record(row.input ?? safeJson(row.inputText))
    if (row.toolName === 'TodoWrite') {
      const todos = z.array(TODO).catch([]).parse(input.todos).map((todo): ChatTodo => ({ content: todo.content, status: todo.status === 'completed' || todo.status === 'in_progress' ? todo.status : 'pending', activeForm: todo.activeForm ?? null }))
      this.state.setTodos(todos, this.turn?.ref ?? null, at)
    }
    if (HIDDEN_TOOLS.has(row.toolName)) return
    const id = `tool:${row.toolCallId}`
    const status = row.status === 'success' ? 'done'
      : row.status === 'error' ? (this.stopping ? 'interrupted' : 'failed')
        : row.status === 'cancelled' ? (this.denied.has(id) ? 'denied' : 'interrupted')
          : 'running'
    const output = row.output?.text ?? (row.status === 'error' ? row.error?.message ?? null : null)
    const display = row.output?.display?.kind === 'mcp_tool' && row.output.display.toolName ? { name: row.output.display.toolName, server: row.output.display.serverName ?? null } : null
    this.items.put({
      id,
      kind: 'tool',
      name: row.toolName,
      title: describeClaudeTool(row.toolName, input) || row.toolName,
      description: row.toolName === 'Bash' ? str(input.description) : null,
      input: inputText(row.toolName, input),
      status,
      output: output ? clip(output) : null,
      diffs: inputDiffs(row.toolName, { ...input, file_path: input.file_path ?? input.path }),
      ...(row.backgrounded ? { background: true } : {}),
      ...(display ? { display } : {}),
      ...(row.toolName === 'Bash' && (status === 'done' || status === 'failed') ? { execution: { status: status === 'done' ? 'completed' as const : 'failed' as const, exitCode: null } } : {})
    }, at)
  }

  private finish(state: ChatTurnState, error: string | null, at: number, header?: z.infer<typeof TurnHeaderRow>): void {
    const turn = this.turn
    if (!turn) return
    for (const item of this.items.list()) if ((item.kind === 'assistant' || item.kind === 'reasoning') && item.streaming) this.items.put({ ...item, streaming: false }, at)
    this.items.settleTools(state === 'failed' ? 'failed' : 'interrupted', at, true)
    const used = this.session.usage?.cumulative
    const input = Math.max(0, (used?.inputTokens ?? 0) - turn.used.input)
    const output = Math.max(0, (used?.outputTokens ?? 0) - turn.used.output)
    const cacheRead = Math.max(0, (used?.cacheReadTokens ?? 0) - turn.used.cacheRead)
    const cacheWrite = Math.max(0, (used?.cacheWriteTokens ?? 0) - turn.used.cacheWrite)
    const metered = input + output > 0
    this.items.put({
      id: `turn:${turn.ref}`,
      kind: 'turn',
      state,
      error,
      durationMs: header?.activeMs ?? (header?.endedAt && header.startedAt ? header.endedAt - header.startedAt : at - turn.began),
      ...(metered ? {
        usage: { input: input + cacheRead + cacheWrite, output },
        // ZCode prices nothing; on a model provider or its own plan alike, only tokens are known.
        metering: { models: [{ model: turn.model, input: input + cacheRead + cacheWrite, output, cacheRead, cacheWrite, cacheWrite1h: null, costUsd: null }], calls: null, callsEstimated: false, reportedCostUsd: null }
      } : {}),
      ...(turn.resumed ? { resumed: true } : {})
    }, at)
    if (turn.reply) this.messages.push({ role: 'assistant', text: turn.reply, eventKey: `chat:${turn.ref}:assistant`, complete: state === 'completed' })
    this.queue.turnEnded(state)
    this.state.endTurn()
    this.state.set({ turnUsage: null })
    this.stopping = false
    this.turnStarted = false
    this.turn = null
  }

  private ended(stderr: string, at: number): void {
    this.exited = true
    this.antumi.cancelAll(at)
    for (const [requestId, pending] of this.pending) {
      const item = this.items.get(pending.itemId)
      if (item?.kind === 'approval') this.items.put({ ...item, resolution: 'cancelled' }, at)
      if (item?.kind === 'question') this.items.put({ ...item, resolution: 'cancelled' }, at)
      this.pending.delete(requestId)
    }
    this.finish(this.stopping ? 'interrupted' : 'failed', this.startError ?? (stderr.trim() || 'ZCode 进程已退出'), at)
  }

  private permissionModes(): string[] {
    if (this.options.planOnly) return ['plan']
    if (this.options.readOnly) return ['readOnly']
    return ['ask', 'acceptEdits', 'plan', 'auto', 'readOnly', ...(this.options.allowBypass ? ['bypass'] : [])]
  }

  private currentModelId(): string | null {
    const config: SessionConfig = this.session.config ?? {}
    if (config.provider && config.model) return modelId(config.provider, config.model)
    const current = this.settings?.model?.current
    return current ? modelId(current.providerId, current.modelId) : null
  }

  private currentModel(): { images: boolean } | null {
    const id = this.currentModelId()
    const model = this.settings?.model?.available.find((each) => modelId(each.ref.providerId, each.ref.modelId) === id)
    return model ? { images: Boolean(model.properties?.inputFormat?.supportsImage) } : null
  }

  // The models it offers: a model provider's in place of ZCode's own, which has the user's too.
  private offered(): ChatModel[] {
    if (this.options.providerModels) return [...this.options.providerModels]
    const current = this.currentModelId()
    return (this.settings?.model?.available ?? []).map((model) => {
      const id = modelId(model.ref.providerId, model.ref.modelId)
      return {
        id,
        label: model.providerLabel ? `${model.providerLabel} · ${model.label ?? model.ref.modelId}` : model.label ?? model.ref.modelId,
        description: null,
        efforts: (model.reasoning?.levels ?? []).map((level) => level.value),
        isDefault: id === current,
        // Its guarded mode asks only where there is risk, whatever the model.
        autoMode: true
      }
    })
  }

  private publishOptions(): void {
    if (this.catalogOnly) return
    const config = this.session.config ?? {}
    this.state.set({
      permissionMode: this.snapshotRead ? antumiMode(config, this.readOnlyChosen) : null,
      permissionModes: this.permissionModes(),
      model: this.currentModelId(),
      models: this.offered(),
      effort: config.thought ?? this.settings?.thoughtLevel?.current ?? null
    })
  }
}

// ZCode reads a refusal's reason as the user's words to the model.
function refusal(reason: string) {
  return { decision: 'deny', reason }
}

function decisionOf(kind: string): ChatDecision {
  if (kind === 'deny') return 'deny'
  return kind === 'allow_always' || kind === 'allowAlways' ? 'allowForSession' : 'allow'
}

function headerState(state: string): ChatTurnState {
  if (state === 'completedSuccess') return 'completed'
  if (state === 'completedInterrupted') return 'interrupted'
  return 'failed'
}

function phaseState(phase: string): ChatTurnState {
  if (phase === 'completedSuccess') return 'completed'
  if (phase === 'completedInterrupted') return 'interrupted'
  return 'failed'
}

function safeJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

