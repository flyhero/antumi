import { z } from 'zod'
import { CHAT_PERMISSION_MODES, ChatPermissionMode, RESERVED_MCP_SERVER_NAME, takeImageMarkers, type ChatReference, type ChatImage, type ChatItem, type ChatModel, type ChatOption, type ChatTurnActivity, type ChatTurnState } from '@antumi/protocol'
import { ChatItems, clip } from '../../chat-items'
import { StageState } from '../../chat-stage-state'
import { ChatQueue } from '../../chat-queue'
import { AntumiRequests } from '../../antumi-requests'
import { markKeptImages, keepImageBlocks, stripImageBytes } from '../../image-frames'
import { messageText, type ChatAnswer, type ChatDriver, type ChatImageFile, type ChatOutgoing, type ChatRecord, type ChatStageOptions, type StageMessage, type TurnSignal } from '../../chat-driver'
import { Rejection } from '../../rejection'
import { referencePathIn } from '../../reference-paths'
import { startNote } from '../../agent-prompt'
import { withoutCost } from '../../model-metering'
import type { AcpDialect } from './acp-dialect'
import { AcpConfig, valuesOf, type AcpOptionValue } from './acp-schema'

// ACP lists a server's env as name and value pairs.
const acpEnv = (env: Record<string, string> = {}) => Object.entries(env).map(([name, value]) => ({ name, value }))

const Id = z.union([z.string(), z.number()])
const Frame = z.looseObject({ jsonrpc: z.literal('2.0').optional(), id: Id.optional(), method: z.string().optional(), params: z.unknown().optional(), result: z.unknown().optional(), error: z.looseObject({ code: z.number(), message: z.string(), data: z.unknown().optional() }).optional() })
type Frame = z.infer<typeof Frame>
const Configs = z.looseObject({ configOptions: z.array(AcpConfig).optional() })
const Opened = Configs.extend({
  sessionId: z.string().optional(),
  modes: z.looseObject({ currentModeId: z.string(), availableModes: z.array(z.looseObject({ id: z.string(), name: z.string(), description: z.string().nullish() })) }).optional(),
  models: z.looseObject({ currentModelId: z.string(), availableModels: z.array(z.looseObject({ modelId: z.string(), name: z.string(), description: z.string().nullish() })) }).optional()
})
const Initialized = z.looseObject({
  protocolVersion: z.union([z.literal(1), z.literal('1')]),
  agentCapabilities: z.looseObject({ loadSession: z.boolean().optional(), promptCapabilities: z.looseObject({ image: z.boolean().optional() }).optional(), sessionCapabilities: z.looseObject({ resume: z.looseObject({}).optional(), additionalDirectories: z.union([z.boolean(), z.looseObject({})]).optional(), fork: z.unknown().optional() }).optional() }).optional(),
  authMethods: z.array(z.looseObject({ id: z.string() })).optional()
})
const Content = z.looseObject({ type: z.string(), text: z.string().optional(), data: z.string().optional() })
const Update = z.looseObject({
  sessionUpdate: z.string(), content: z.unknown().optional(), toolCallId: z.string().optional(), name: z.string().optional(), title: z.string().optional(), kind: z.string().optional(),
  status: z.string().optional(), rawInput: z.unknown().optional(), rawOutput: z.unknown().optional(), locations: z.array(z.looseObject({ path: z.string() })).optional(),
  entries: z.array(z.looseObject({ content: z.string(), status: z.string() })).optional(), currentModeId: z.string().optional(), configOptions: z.array(AcpConfig).optional(),
  availableCommands: z.array(z.looseObject({ name: z.string(), description: z.string(), input: z.looseObject({ hint: z.string().optional() }).nullish() })).optional()
})
const Permission = z.looseObject({ toolCall: Update.omit({ sessionUpdate: true }), options: z.array(z.looseObject({ optionId: z.string(), name: z.string(), kind: z.enum(['allow_once', 'allow_always', 'reject_once', 'reject_always']) })).min(1) })
const Questions = z.looseObject({ title: z.string().optional(), toolCallId: z.string(), questions: z.array(z.looseObject({ id: z.string(), prompt: z.string(), allowMultiple: z.boolean().optional(), options: z.array(z.looseObject({ id: z.string(), label: z.string() })).catch([]) })).min(1) })
const Plan = z.looseObject({ toolCallId: z.string(), plan: z.string(), name: z.string().optional(), overview: z.string().optional() })
const Prompt = z.looseObject({ sessionId: z.string(), prompt: z.array(Content) })
// What a turn used, where the agent says (ACP's PromptResponse.usage): input apart from what the
// cache served, so Antumi adds it back, and reasoning apart from the reply.
const TurnTokens = z.looseObject({
  inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
  thoughtTokens: z.number().int().nonnegative().nullish(), cachedReadTokens: z.number().int().nonnegative().nullish(), cachedWriteTokens: z.number().int().nonnegative().nullish()
})
// The session's cost so far, in a usage_update: a running total, so a turn's is the difference.
const SessionCost = z.looseObject({ cost: z.looseObject({ amount: z.number().nonnegative(), currency: z.string() }).nullish() })
const keyOf = (id: string | number) => `${typeof id}:${id}`

// The files a request would write, as ACP names them: its diffs, its locations, its input's path.
// Only an edit, a delete or a move writes; a command's own effects cannot be told from it.
function writtenPaths(tool: z.infer<typeof Permission>['toolCall']): string[] {
  const diffs = z.array(z.looseObject({ type: z.string(), path: z.string().optional() })).safeParse(tool.content).data?.flatMap((entry) => (entry.type === 'diff' && entry.path ? [entry.path] : [])) ?? []
  if (!['edit', 'delete', 'move'].includes(String(tool.kind)) && diffs.length === 0) return []
  const input = z.looseObject({ path: z.string().optional(), filePath: z.string().optional(), file_path: z.string().optional() }).safeParse(tool.rawInput).data
  return [...diffs, ...(tool.locations ?? []).map((location) => location.path), ...[input?.path, input?.filePath, input?.file_path].filter((each) => each !== undefined)]
}
// The requests that open the session a stage works in.
const RESTORING: ReadonlySet<string> = new Set(['session/load', 'session/resume'])
const OPENING: ReadonlySet<string> = new Set(['session/new', ...RESTORING, 'session/fork'])
const rpc = (id: string | number, method: string, params: unknown) => ({ jsonrpc: '2.0', id, method, params })
const result = (id: string | number, body: unknown) => ({ jsonrpc: '2.0', id, result: body })
// A subagent the agent forwards (an extension, AcpDialect.subagentCall): announced on its parent's
// session with the Task call it runs for, and ended there; a subagent's own subagents name no call.
const SubagentSpawned = z.looseObject({ subagentSessionId: z.string() })
const SubagentState = z.looseObject({ subagentSessionId: z.string(), state: z.string() })
type Subagent = { card: string; text: string; said: string }
const PermissionOutcome = z.looseObject({ outcome: z.looseObject({ outcome: z.string(), optionId: z.string().optional() }) })
type Pending = { rawId: string | number; itemId: string; kind: 'permission' | 'permissionQuestion' | 'question' | 'plan'; options?: z.infer<typeof Permission>['options']; planRunMode?: ChatPermissionMode }
type Request = { method: string; params: unknown }
type ThoughtLevel = { id: string; name: string; values: AcpOptionValue[] }

// Speaks the Agent Client Protocol for any agent, asking its dialect for what the agent adds.
// Every transition comes from a log record, including outbound frames. Reattaching to a live
// daemon process therefore restores pending requests without repeating the handshake.

// A call's input as its card shows it, as Claude's and Codex's are: a command as the command it
// runs, not the JSON around it; a call whose input is only the file its title names, as nothing.
function shownInput(name: string, input: unknown): string | null {
  const fields = z.looseObject({ command: z.string().optional(), path: z.string().optional() }).safeParse(input).data
  if (name === 'commandExecution' && fields?.command) return clip(fields.command)
  if (fields?.path && Object.keys(fields).length === 1) return null
  return clip(JSON.stringify(input))
}
export class AcpDriver implements ChatDriver {
  readonly items: ChatItems
  private readonly state: StageState
  private readonly antumi: AntumiRequests
  private readonly queue = new ChatQueue()
  private readonly requests = new Map<string, Request>()
  private readonly optionErrors = new Map<string, string>()
  private readonly pending = new Map<string, Pending>()
  private readonly owed = new Map<string, unknown>()
  private readonly initial = new Map<string, unknown>()
  private initialChoices: Array<{ option: ChatOption; value: string }> = []
  private readonly kept = new Map<string, unknown>()
  private initialized = false
  private authenticated = false
  private initSent = false
  private authSent = false
  private sessionSent = false
  private modelsSent = false
  private modelsRead = false
  private models: ChatModel[] = []
  // Reasoning is per model and often absent from the session snapshot. The catalog names the option.
  private readonly thoughts = new Map<string, ThoughtLevel>()
  private setup = false
  private auth = false
  private load = false
  private resumeMethod = 'session/load'
  private images = false
  private directories = false
  private forks = false
  private session: string | null = null
  private exited = false
  private startError: string | null = null
  // The session to resume is not there to load: Cursor keeps one only once a turn has got somewhere.
  private lost = false
  private config: AcpConfig[] = []
  private modern = new Set<string>()
  private serial = 0
  private turns = 0
  private stopping = false
  private turn: { id: string; ref: string; began: number; text: string; block: string | null; blocks: number } | null = null
  private messages: StageMessage[] = []
  private execution: { text: string; images: ChatImage[]; ref: string; references?: ChatReference[] } | null = null
  private subagents = new Map<string, Subagent>()
  // The session's cost in dollars as last reported; null until a report, but 0 for a session this
  // stage opened new. turnCost is what it stood at as the running turn began.
  private sessionCost: number | null = null
  private turnCost: number | null = null

  constructor(private readonly dialect: AcpDialect, private readonly stageId: string, private readonly options: ChatStageOptions, private readonly catalogOnly = false) {
    this.items = new ChatItems(stageId)
    this.state = new StageState(this.items)
    this.antumi = new AntumiRequests(this.items)
    // Without a model listing of its own, the session config is all there is to read.
    this.modelsRead = !dialect.models
  }

  private get name(): string { return this.dialect.name }
  private id(name: string): string { return `${this.dialect.idPrefix}-${name}` }
  private antumiMode(mode: string): ChatPermissionMode | null { return CHAT_PERMISSION_MODES.find((antumi) => this.dialect.modes[antumi] === mode) ?? null }
  private nativeMode(mode: string): string {
    const known = ChatPermissionMode.safeParse(mode)
    return (known.success ? this.dialect.modes[known.data] : undefined) ?? mode
  }
  private hasMode(mode: string): boolean {
    const known = ChatPermissionMode.safeParse(mode)
    return known.success && this.dialect.modes[known.data] !== undefined
  }
  private toolName(update: Pick<z.infer<typeof Update>, 'kind' | 'rawInput' | 'name' | 'title'>, old: string | undefined): string {
    return this.dialect.toolName?.(update.rawInput, update.name, update.title) ?? (update.kind === 'execute' ? 'commandExecution' : update.kind === 'edit' ? 'fileChange' : old ?? update.kind ?? 'tool')
  }
  // The agent's own requests Antumi answers by asking the user.
  private asked(method: string | undefined): boolean {
    const requests = this.dialect.requests
    return method === 'session/request_permission' || (method !== undefined && (method === requests?.question || method === requests?.plan?.method))
  }

  apply(record: ChatRecord): void {
    if (record.dir === 'out' && record.ref && record.references) this.items.rememberReferences(record.ref, record.references)
    if (record.dir === 'in' || record.dir === 'out') {
      const parsed = Frame.safeParse(record.frame)
      if (parsed.success) {
        if (record.dir === 'in') this.receive(parsed.data, record.at)
        else this.sent(parsed.data, record.at, record.ref, record.images ?? [])
      }
    } else if (record.dir === 'queue') {
      if (record.text === null && record.ref === this.execution?.ref) this.execution = null
      this.queue.apply(record)
    } else if (record.dir === 'note') this.items.notice(record.level, record.text, record.at, {
      ...(record.id !== undefined ? { id: record.id } : {}),
      ...(record.action !== undefined ? { action: record.action } : {})
    })
    else if (record.dir === 'ask' || record.dir === 'answer') this.antumi.apply(record)
    else if (record.dir === 'item') this.items.put(record.item, record.at)
    else if (record.dir === 'exit') {
      this.exited = true
      this.antumi.cancelAll(record.at)
      this.cancelPending(record.at)
      this.finish(this.stopping ? 'interrupted' : 'failed', this.startError ?? (record.stderr.trim() || `${this.name} 进程已退出`), record.at)
    }
    this.state.set({ queued: this.queue.first, queue: this.queue.view, steerable: false })
    this.state.publish(record.at)
  }

  due(): unknown[] {
    if (this.exited) return []
    const frames = [...this.owed.values()]
    if (this.startError) return frames
    if (!this.initSent) return [...frames, rpc(this.id('init'), 'initialize', { protocolVersion: 1, clientInfo: { name: 'antumi', version: '1' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, ...(this.dialect.clientMeta ? { _meta: this.dialect.clientMeta } : {}) } })]
    if (!this.initialized) return frames
    if (this.auth && !this.authenticated) return this.authSent ? frames : [...frames, rpc(this.id('auth'), 'authenticate', { methodId: this.dialect.authMethod })]
    const listing = this.dialect.models
    const models = this.modelsSent || !listing ? [] : [rpc(this.id('models'), listing.method, {})]
    if (this.catalogOnly) return this.modelsRead ? frames : [...frames, ...models]
    if (!this.sessionSent) {
      // A fork takes the session over whole: core asks for one only where that is the fork point.
      const forking = Boolean(this.options.resume && this.options.fork)
      if (forking && !this.forks) { this.startError = `此 ${this.name} CLI 不支持分叉会话，请升级`; return frames }
      if (this.options.resume && !forking && !this.load) { this.startError = `此 ${this.name} CLI 不支持恢复会话，请升级`; return frames }
      const mcp = this.options.mcp
      return [...frames, rpc(this.id('session'), forking ? 'session/fork' : this.options.resume ? this.resumeMethod : 'session/new', {
        cwd: this.options.cwd,
        ...(this.options.resume ? { sessionId: this.options.resume } : {}),
        // Only where the agent says it takes them; one that does not is given them otherwise, as
        // Cursor is on its command line, and reads them by their paths either way.
        ...(this.roots().length && this.directories ? { additionalDirectories: this.roots() } : {}),
        mcpServers: [
          ...(mcp && !this.dialect.ownMcpOnCommand ? [{ name: RESERVED_MCP_SERVER_NAME, command: mcp.command, args: mcp.args, env: acpEnv(mcp.env) }] : []),
          ...(this.options.userMcp ?? []).map((server) => server.type === 'stdio'
            ? { name: server.name, command: server.command, args: server.args, env: acpEnv(server.env) }
            : { type: 'http', name: server.name, url: server.url, headers: [] })
        ]
      })]
    }
    // Asked once the session is open, the catalog takes about a second; asked first, it also
    // waits out the CLI's own startup. The saved choices wait for it: it names reasoning levels.
    if (!this.setup) return frames
    if (!this.modelsRead) return [...frames, ...models]
    return [...frames, ...this.initial.values()].filter((frame) => {
      const id = Frame.safeParse(frame).data?.id
      return id === undefined || !this.requests.has(keyOf(id))
    })
  }

  turnSignal(frame: unknown, dir: 'in' | 'out'): TurnSignal | null {
    const parsed = Frame.safeParse(frame)
    if (!parsed.success) return null
    const { method, id } = parsed.data
    if (dir === 'out') return method === 'session/prompt' ? 'prompt' : method && RESTORING.has(method) ? 'session-load' : method === 'session/new' || method === 'session/fork' ? 'session-new' : method === 'session/cancel' ? 'cancel' : null
    // Updates, the agent's own requests, and the answer to the prompt itself.
    return method === 'session/update' || (method !== undefined && id !== undefined) || (id !== undefined && String(id).startsWith(this.id('prompt-'))) ? 'turn' : null
  }

  ready(): boolean { return this.session !== null && this.setup && this.modelsRead && this.initial.size === 0 && !this.startError && !this.exited }
  failure(): string | null { return this.startError ?? (this.exited && !this.session ? `${this.name} 进程已退出` : null) }
  sessionLost(): boolean { return this.lost }
  activeTurnRef(): string | null { return this.turn?.ref ?? null }

  activity(): ChatTurnActivity { return this.pending.size || this.antumi.pending ? 'awaiting' : this.turn || this.changing() ? 'running' : 'idle' }
  providerSessionId(): string | null { return this.session }
  canSteer(): boolean { return false }
  steer(): ChatOutgoing { throw new Rejection('chat-no-steer', `${this.name} ACP 不支持向正在执行的回合追加消息`) }
  queuedToSend() { return this.ready() && !this.turn && !this.changing() ? this.execution ?? this.queue.next() : null }
  takeMessages(): StageMessage[] { const taken = this.messages; this.messages = []; return taken }

  send(text: string, images: readonly ChatImageFile[] = []): ChatOutgoing {
    if (!this.ready()) throw new Rejection('chat-starting', `${this.name} 尚未就绪`)
    if (this.turn) throw new Rejection('chat-busy', `${this.name} 正在处理上一条消息`)
    if (this.changing()) throw new Rejection('chat-option-changing', `请等待 ${this.name} 确认配置变更`)
    if (images.length && !this.images) throw new Rejection('chat-images-unsupported', `此 ${this.name} CLI 不支持图片输入`)
    const base = { sessionId: this.session, prompt: [{ type: 'text', text }] }
    const logged = rpc(this.id(`prompt-${this.turns + 1}`), 'session/prompt', base)
    // ACP has no system prompt, so the start note goes ahead of the process's first prompt, and
    // only on the wire: the chat, its search and its handoffs show the message alone.
    const start = this.turns === 0 ? [startNote({ instructions: this.options.instructions, knowledgeBase: this.options.knowledgeBase, todos: Boolean(this.options.mcp) && this.options.todos !== false }), this.dialect.startNote?.(this.options)].filter(Boolean).join('\n\n') : null
    const note = start ? `${start}\n\n` : ''
    const wire = rpc(this.id(`prompt-${this.turns + 1}`), 'session/prompt', { ...base, prompt: [{ type: 'text', text: `${note}${text}` }, ...images.map((image) => ({ type: 'image', mimeType: image.mime, data: Buffer.from(image.read()).toString('base64') }))] })
    return { wire, logged }
  }

  // The folders the session works in besides its own: the conversation's other projects, and the
  // user's vault where the stage may write it.
  private roots(): string[] {
    return [...this.options.extraDirs, ...(this.options.knowledgeBase?.write ? [this.options.knowledgeBase.path] : [])]
  }

  setOption(option: ChatOption, value: string): unknown[] {
    if (!this.ready()) throw new Rejection('chat-starting', `${this.name} 尚未就绪`)
    if (this.turn) throw new Rejection('chat-busy', '请在回合结束后切换模式或模型')
    if (this.changing()) throw new Rejection('chat-option-changing', `请等待 ${this.name} 确认上一项配置变更`)
    return [this.change(option, value, this.id(`config-${this.serial + 1}`))]
  }

  private changing(): boolean {
    return [...this.requests.values()].some((request) => ['session/set_config_option', 'session/set_mode', 'session/set_model'].includes(request.method))
  }

  optionResult(frame: unknown): { pending: boolean; error: string | null } {
    const id = Frame.safeParse(frame).data?.id
    return id === undefined ? { pending: false, error: null } : { pending: this.requests.has(keyOf(id)), error: this.optionErrors.get(keyOf(id)) ?? null }
  }

  private change(option: ChatOption, value: string, id: string): unknown {
    if (option === 'permissionMode' && this.options.planOnly && value !== 'plan') throw new Rejection('plan-only', '此阶段只能规划')
    if (option === 'permissionMode' && this.options.readOnly && value !== 'readOnly') throw new Rejection('plan-only', '只读成员不能换模式')
    if (option === 'effort') return this.changeEffort(value, id)
    const category = option === 'permissionMode' ? 'mode' : 'model'
    const config = this.config.find((entry) => entry.category === category)
    const wanted = option === 'permissionMode' ? this.nativeMode(value) : value
    const offered = config && (category === 'model' ? this.offered(valuesOf(config)) : valuesOf(config))
    if (!config || !offered?.some((entry) => entry.value === wanted)) throw new Rejection('chat-option-invalid', `${this.name} 没有提供 ${option}: ${value}`)
    if (option === 'permissionMode' && !this.hasMode(value)) throw new Rejection('chat-option-invalid', `${this.name} 不支持 ${value}`)
    if (this.modern.has(category)) return rpc(id, 'session/set_config_option', { sessionId: this.session, configId: config.id, value: wanted })
    return rpc(id, category === 'mode' ? 'session/set_mode' : 'session/set_model', { sessionId: this.session, ...(category === 'mode' ? { modeId: wanted } : { modelId: wanted }) })
  }

  // The session lists a level only after one is set. Until then the catalog's id is what the CLI accepts.
  private changeEffort(value: string, id: string): unknown {
    const modelId = this.config.find((entry) => entry.category === 'model')?.currentValue
    const live = this.config.find((entry) => entry.category === 'thought_level')
    const catalog = modelId ? this.thoughts.get(modelId) : undefined
    const configId = live?.id ?? catalog?.id
    const allowed = live ? valuesOf(live) : catalog?.values ?? []
    if (!configId || !allowed.some((entry) => entry.value === value)) throw new Rejection('chat-option-invalid', `${this.name} 没有提供 effort: ${value}`)
    return rpc(id, 'session/set_config_option', { sessionId: this.session, configId, value })
  }

  private modelChange(request: Request): boolean {
    if (request.method === 'session/set_model') return true
    if (request.method !== 'session/set_config_option') return false
    const configId = z.looseObject({ configId: z.string().optional() }).safeParse(request.params).data?.configId
    return configId !== undefined && configId === this.config.find((entry) => entry.category === 'model')?.id
  }

  respond(requestId: string, answer: ChatAnswer): unknown[] {
    const pending = this.pending.get(requestId)
    if (!pending) throw new Rejection('chat-request-gone', '这个请求已结束')
    if (pending.kind === 'permissionQuestion') {
      if (answer.decision === 'deny') return [result(pending.rawId, { outcome: { outcome: 'cancelled' } })]
      const selected = answer.answers?.question
      const option = selected?.length === 1 ? pending.options?.find((option) => option.optionId === selected[0] && option.kind === 'allow_once') : undefined
      if (!option) throw new Rejection('chat-option-invalid', '请选择提供的一个回答')
      return [result(pending.rawId, { outcome: { outcome: 'selected', optionId: option.optionId } })]
    }
    if (pending.kind === 'permission') {
      if (pending.planRunMode) {
        if (answer.saved) return this.cancelFrames()
        if (answer.decision !== 'deny' && (this.options.planOnly || this.options.readOnly)) throw new Rejection('plan-only', '此阶段只能规划，请先保存计划')
        if (answer.decision !== 'deny' && answer.mode && answer.mode !== pending.planRunMode) throw new Rejection('chat-option-invalid', `${this.name} 的计划只能在 ${pending.planRunMode} 模式执行`)
      }
      // A bare decision, as the overview's quick buttons send, takes the agent's option of that kind.
      const bare = answer.decision === 'allow' || (pending.planRunMode && answer.decision === 'allowForSession') ? 'allow_once' : answer.decision === 'allowForSession' ? 'allow_always' : null
      const selected = pending.options?.find((option) => answer.choice ? option.optionId === answer.choice : option.kind === bare)
      if (answer.choice && !selected) throw new Rejection('chat-option-invalid', `${this.name} 未提供这个审批选项`)
      if (!selected && answer.decision !== 'deny') throw new Rejection('chat-option-invalid', `请选择 ${this.name} 提供的具体审批选项`)
      return [result(pending.rawId, { outcome: selected ? { outcome: 'selected', optionId: selected.optionId } : { outcome: 'cancelled' } })]
    }
    if (pending.kind === 'question') {
      const answers = Object.entries(answer.answers ?? {}).map(([questionId, selectedOptionIds]) => ({ questionId, selectedOptionIds }))
      return [result(pending.rawId, { outcome: answer.decision === 'deny' ? { outcome: 'cancelled' } : { outcome: 'answered', answers } })]
    }
    if (answer.saved) return this.cancelFrames()
    if (answer.decision === 'deny') return [result(pending.rawId, { outcome: { outcome: 'rejected' } })]
    if (this.options.planOnly || this.options.readOnly) throw new Rejection('plan-only', '此阶段只能规划，请先保存计划')
    const plan = this.dialect.requests?.plan
    const runMode = plan?.runMode ?? 'ask'
    if (answer.mode && answer.mode !== runMode) throw new Rejection('chat-option-invalid', `${this.name} 的计划只能在 ${plan?.runModeLabel ?? runMode} 模式执行`)
    return [this.change('permissionMode', runMode, this.id(`plan-mode-${encodeURIComponent(requestId)}`))]
  }

  interrupt(): unknown[] {
    if (!this.turn) throw new Rejection('chat-idle', '没有正在执行的回合')
    return this.cancelFrames()
  }

  private cancelFrames(): unknown[] {
    return [...[...this.pending.values()].map((pending) => result(pending.rawId, { outcome: { outcome: 'cancelled' } })), { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: this.session } }]
  }

  logged(frame: unknown): unknown | null {
    const parsed = Frame.safeParse(frame)
    if (!parsed.success) return null
    const id = parsed.data.id
    // Of a subagent's session, only what its card shows: its words, its calls, its own subagents.
    const subagent = parsed.data.method === 'session/update' ? z.looseObject({ sessionId: z.string(), update: Update }).safeParse(parsed.data.params).data : undefined
    if (subagent && subagent.sessionId !== this.session && this.subagents.has(subagent.sessionId) && !['agent_message_chunk', 'tool_call', 'subagent_spawned'].includes(subagent.update.sessionUpdate)) return null
    const kept = id === undefined ? this.kept.get(JSON.stringify(frame)) : undefined
    this.kept.delete(JSON.stringify(frame))
    // ACP has no final full-text message: every delta is needed for recovery.
    return stripImageBytes(kept ?? frame)
  }

  private sent(frame: Frame, at: number, ref: string | undefined, images: readonly ChatImage[]): void {
    if (frame.method) {
      if (frame.id !== undefined) {
        this.requests.set(keyOf(frame.id), { method: frame.method, params: frame.params })
        this.serial++
      }
      if (frame.method === 'initialize') this.initSent = true
      else if (frame.method === 'authenticate') this.authSent = true
      else if (frame.method === this.dialect.models?.method) this.modelsSent = true
      else if (OPENING.has(frame.method)) this.sessionSent = true
      else if (frame.method === 'session/cancel') { this.stopping = true; this.execution = null }
      else if (frame.method === 'session/prompt' && frame.id !== undefined) {
        const prompt = Prompt.safeParse(frame.params)
        if (!prompt.success) return
        const text = prompt.data.prompt.map((part) => part.text ?? '').join('')
        const eventRef = ref ?? `${this.dialect.idPrefix}:${++this.turns}`
        if (ref) this.turns++
        this.queue.sent(ref)
        if (ref === this.execution?.ref) this.execution = null
        this.stopping = false
        this.turn = { id: keyOf(frame.id), ref: eventRef, began: at, text: '', block: null, blocks: 0 }
        this.turnCost = this.sessionCost
        this.items.put({ id: `u:${eventRef}`, kind: 'user', text, images: [...images] }, at)
        this.messages.push({ role: 'user', text: messageText(text, images), eventKey: `chat:${eventRef}:user`, complete: false })
      }
      return
    }
    if (frame.id === undefined) return
    const id = keyOf(frame.id)
    this.owed.delete(id)
    const pending = this.pending.get(id)
    if (!pending) return
    const outcome = PermissionOutcome.safeParse(frame.result).data?.outcome
    const item = this.items.get(pending.itemId)
    if (item?.kind === 'approval') {
      const choice = pending.options?.find((option) => option.optionId === outcome?.optionId)
      const resolution = outcome?.outcome === 'accepted' || choice?.kind === 'allow_once' ? 'allowed' : choice?.kind === 'allow_always' ? 'allowedForSession' : outcome?.outcome === 'cancelled' ? 'cancelled' : 'denied'
      this.items.put({ ...item, resolution, chosen: outcome?.optionId ?? null, ...(pending.planRunMode && resolution === 'allowed' ? { mode: pending.planRunMode } : outcome?.outcome === 'accepted' ? { mode: 'ask' as const } : {}) }, at)
      // CreatePlan acceptance creates an artifact and ends the planning turn. Execution needs
      // its own prompt; deriving it from the logged acceptance also survives a core restart.
      const plan = this.dialect.requests?.plan
      if (pending.kind === 'plan' && plan && outcome?.outcome === 'accepted') this.execution = { text: plan.prompt, images: [], ref: `${this.id('plan')}:${this.stageId}:${id}` }
    } else if (item?.kind === 'question') {
      if (pending.kind === 'permissionQuestion') {
        const selected = pending.options?.find((option) => option.optionId === outcome?.optionId && option.kind === 'allow_once')
        this.items.put({ ...item, answers: selected ? { question: [selected.optionId] } : null, resolution: selected ? 'answered' : 'cancelled' }, at)
        this.pending.delete(id)
        return
      }
      const answered = z.looseObject({ outcome: z.looseObject({ answers: z.array(z.looseObject({ questionId: z.string(), selectedOptionIds: z.array(z.string()) })) }) }).safeParse(frame.result)
      const answers = answered.success ? Object.fromEntries(answered.data.outcome.answers.map((answer) => [answer.questionId, answer.selectedOptionIds])) : null
      this.items.put({ ...item, answers, resolution: answers ? 'answered' : 'cancelled' }, at)
    }
    this.pending.delete(id)
  }

  private receive(frame: Frame, at: number): void {
    if (frame.method && frame.id !== undefined) { this.reverse(frame, at); return }
    if (frame.method === 'session/update') {
      const update = z.looseObject({ sessionId: z.string(), update: Update }).safeParse(frame.params)
      if (!update.success) return
      if (this.session && update.data.sessionId !== this.session) {
        const subagent = this.subagents.get(update.data.sessionId)
        if (subagent && this.turn) this.subagentUpdate(subagent, update.data.update, at)
        return
      }
      this.update(update.data.update, frame, at)
      return
    }
    if (frame.id === undefined) return
    const id = keyOf(frame.id)
    const request = this.requests.get(id)
    if (!request) return
    this.requests.delete(id)
    this.initial.delete(id)
    if (request.method === this.dialect.models?.method) {
      this.modelsRead = true
      const listed = this.dialect.models.parse(frame.result)
      if (listed) this.readModels(listed)
      if (this.catalogOnly) this.state.set({ models: this.models })
      else if (this.setup) {
        this.nextInitial(at)
        this.publishConfig()
      }
      return
    }
    if (frame.error) {
      if (['session/set_config_option', 'session/set_mode', 'session/set_model'].includes(request.method)) this.optionErrors.set(id, frame.error.message)
      if (request.method === 'session/prompt') this.finish(this.stopping ? 'interrupted' : 'failed', frame.error.message, at)
      else if (!this.setup || String(frame.id).startsWith(this.id('initial-')) || OPENING.has(request.method)) {
        const detail = errorDetail(frame.error.data)
        this.startError = `${request.method}: ${detail ?? frame.error.message}`
        this.lost = RESTORING.has(request.method) && /not found|not resumable|unknown sessionid/i.test(detail ?? frame.error.message)
      }
      else this.items.notice('error', frame.error.message, at)
      return
    }
    if (request.method === 'initialize') {
      const init = Initialized.safeParse(frame.result)
      if (!init.success) { this.startError = `${this.name} ACP 协议版本不兼容，请升级 CLI`; return }
      const extensionError = this.dialect.initializeError?.(frame.result)
      if (extensionError) { this.startError = extensionError; return }
      this.initialized = true
      const resume = Boolean(init.data.agentCapabilities?.sessionCapabilities?.resume)
      this.load = resume || (init.data.agentCapabilities?.loadSession ?? false)
      this.resumeMethod = init.data.agentCapabilities?.loadSession ? 'session/load' : 'session/resume'
      this.images = init.data.agentCapabilities?.promptCapabilities?.image ?? false
      // Early agents said true; the protocol now names the capability with an object.
      this.directories = Boolean(init.data.agentCapabilities?.sessionCapabilities?.additionalDirectories)
      this.forks = Boolean(init.data.agentCapabilities?.sessionCapabilities?.fork)
      const auth = init.data.authMethods ?? []
      const wanted = this.dialect.authMethod
      this.auth = wanted !== undefined && auth.some((method) => method.id === wanted)
      if (wanted && auth.length && !this.auth) this.startError = `${this.name} 没有提供 ${wanted} 认证方式，请在终端登录后重试`
    } else if (request.method === 'authenticate') this.authenticated = true
    else if (OPENING.has(request.method)) {
      const opened = Opened.safeParse(frame.result ?? {})
      if (!opened.success) { this.startError = `${this.name} 返回了无效的会话信息`; return }
      // A loaded session goes on under its id; a new or forked one is named in the answer.
      this.session = opened.data.sessionId ?? (RESTORING.has(request.method) ? this.options.resume : null)
      if (request.method === 'session/new') this.sessionCost = 0
      if (!this.session) { this.startError = `${this.name} 没有返回会话 ID`; return }
      this.catalog(opened.data)
      this.setup = true
      const preferred = { ...this.options.preferred, ...(this.options.planOnly ? { permissionMode: 'plan' } : this.options.readOnly ? { permissionMode: 'readOnly' } : {}) }
      this.initialChoices = (['permissionMode', 'model', 'effort'] as const).flatMap((option) => preferred[option] ? [{ option, value: preferred[option] }] : [])
      // A log from before the catalog came second has it already.
      if (this.modelsRead) this.nextInitial(at)
    } else if (request.method === 'session/prompt') {
      const stop = z.looseObject({ stopReason: z.string().optional() }).safeParse(frame.result).data?.stopReason
      // Some CLI releases report provider failures as a text chunk followed by end_turn, after any
      // reply they already wrote. The raw line is not the answer.
      const provider = this.peelProviderError(at)
      const ref = this.turn?.ref ?? null
      const error = stop === 'refusal' ? `${this.name} 拒绝了请求` : provider?.summary ?? null
      this.finish(this.stopping || stop === 'cancelled' ? 'interrupted' : error ? 'failed' : 'completed', error, at, this.turnMetering(frame.result))
      if (provider && ref) {
        this.items.notice('warning', provider.detail, at, {
          id: `${this.id('provider')}:${ref}`,
          action: { kind: 'retryTurn', userItemId: `u:${ref}` }
        })
      }
    } else {
      const parsed = Configs.safeParse(frame.result)
      if (parsed.data?.configOptions) this.catalog(parsed.data, this.modelChange(request))
      else this.acknowledgeConfig(request)
      const planMode = this.id('plan-mode-')
      if (String(frame.id).startsWith(planMode)) {
        const planId = decodeURIComponent(String(frame.id).slice(planMode.length))
        const pending = this.pending.get(planId)
        if (pending?.kind === 'plan' && this.state.current.permissionMode === (this.dialect.requests?.plan?.runMode ?? 'ask')) this.owed.set(planId, result(pending.rawId, { outcome: { outcome: 'accepted' } }))
      }
      if (String(frame.id).startsWith(this.id('initial-'))) this.nextInitial(at)
    }
  }

  private nextInitial(at: number): void {
    while (this.initialChoices.length) {
      const choice = this.initialChoices.shift()
      if (!choice) return
      const { option, value } = choice
      // A resumed session keeps what it last ran with; setting it again costs a round trip.
      if (this.current(option) === (option === 'permissionMode' ? this.nativeMode(value) : value)) continue
      try {
        const requestId = this.id(`initial-${option}`)
        this.initial.set(keyOf(requestId), this.change(option, value, requestId))
        return
      } catch (error) {
        // On a provider, any other model would be the agent's own account's.
        if (option === 'permissionMode' || (option === 'model' && this.options.providerModels)) this.startError = error instanceof Error ? error.message : `${this.name} 不支持所选${option === 'model' ? '模型' : '模式'}`
        else this.items.notice('warning', `${this.name} 未采用保存的 ${option}: ${value}`, at)
      }
    }
  }

  private current(option: ChatOption): string | null {
    const category = option === 'permissionMode' ? 'mode' : option === 'model' ? 'model' : 'thought_level'
    return this.config.find((entry) => entry.category === category)?.currentValue ?? null
  }

  private readModels(models: { value: string; name: string; configOptions: AcpConfig[] }[]): void {
    this.thoughts.clear()
    this.models = models.map((model) => {
      const thought = model.configOptions.find((config) => config.category === 'thought_level')
      const values = thought ? valuesOf(thought) : []
      if (thought && values.length) this.thoughts.set(model.value, { id: thought.id, name: thought.name, values })
      return { id: model.value, label: model.name, description: null, efforts: values.map((entry) => entry.value), isDefault: false }
    })
  }

  // A model switch answers with the whole config. A level the new model lacks is left out, and the
  // previous model's level must not stay selected. A one-option update is not that answer.
  private catalog(opened: z.infer<typeof Opened>, dropThought = false): void {
    const config = opened.configOptions ?? []
    if (dropThought && !config.some((entry) => entry.category === 'thought_level')) {
      this.config = this.config.filter((entry) => entry.category !== 'thought_level')
    }
    this.modern = new Set([...this.modern, ...config.flatMap((entry) => entry.category ? [entry.category] : [])])
    const modes = opened.modes
    const models = opened.models
    const legacy: AcpConfig[] = [
      ...(modes ? [{ id: 'mode', name: 'Mode', category: 'mode', currentValue: modes.currentModeId, options: modes.availableModes.map((mode) => ({ value: mode.id, name: mode.name, description: mode.description })) }] : []),
      ...(models ? [{ id: 'model', name: 'Model', category: 'model', currentValue: models.currentModelId, options: models.availableModels.map((model) => ({ value: model.modelId, name: model.name, description: model.description })) }] : [])
    ]
    const next = [...config, ...legacy.filter((entry) => !config.some((one) => one.category === entry.category))]
    this.config = [...this.config.filter((entry) => !next.some((one) => one.id === entry.id || one.category === entry.category)), ...next]
    this.publishConfig()
  }

  // An ack that only echoes the request still has to show the level just chosen.
  private acknowledgeConfig(request: Request): void {
    const value = z.looseObject({ configId: z.string().optional(), value: z.string().optional(), modeId: z.string().optional(), modelId: z.string().optional() }).safeParse(request.params).data
    const category = request.method === 'session/set_mode' ? 'mode' : request.method === 'session/set_model' ? 'model' : null
    const nextValue = value?.value ?? value?.modeId ?? value?.modelId
    const dropping = this.modelChange(request)
    let config = this.config.map((entry) => entry.id === value?.configId || (category && entry.category === category) ? { ...entry, currentValue: nextValue ?? entry.currentValue } : entry)
    if (dropping) config = config.filter((entry) => entry.category !== 'thought_level')
    const configId = value?.configId
    if (configId && nextValue && !config.some((entry) => entry.id === configId)) {
      const thought = this.thoughts.get(config.find((entry) => entry.category === 'model')?.currentValue ?? '')
      if (thought?.id === configId) {
        config = [...config, { id: thought.id, name: thought.name, category: 'thought_level', currentValue: nextValue, options: thought.values }]
        this.modern.add('thought_level')
      }
    }
    this.config = config
    this.publishConfig()
  }

  private publishConfig(): void {
    const mode = this.config.find((entry) => entry.category === 'mode')
    const model = this.config.find((entry) => entry.category === 'model')
    const effort = this.config.find((entry) => entry.category === 'thought_level')
    this.state.set({
      permissionMode: mode ? this.antumiMode(mode.currentValue) : null,
      permissionModes: mode ? valuesOf(mode).flatMap((entry) => { const mapped = this.antumiMode(entry.value); return mapped && (!this.options.planOnly || mapped === 'plan') && (!this.options.readOnly || mapped === 'readOnly') ? [mapped] : [] }) : [],
      model: model?.currentValue ?? null,
      models: model ? this.offered(valuesOf(model)).map((entry) => ({ id: entry.value, label: entry.name, description: entry.description ?? null, efforts: this.models.find((one) => one.id === entry.value)?.efforts ?? (entry.value === model.currentValue && effort ? valuesOf(effort).map((one) => one.value) : []), isDefault: entry.value === model.currentValue })) : [],
      effort: effort?.currentValue ?? null
    })
    if (this.options.planOnly && mode && mode.currentValue !== 'plan' && this.setup && !this.initial.size && !this.initialChoices.length) this.startError = `${this.name} 离开了仅规划模式`
  }

  // On a provider, only its models: the agent also lists every other one it knows, which would run
  // on some other account.
  private offered(values: AcpOptionValue[]): AcpOptionValue[] {
    const provided = this.options.providerModels
    if (!provided) return values
    return values.flatMap((entry) => {
      const model = provided.find((one) => one.id === entry.value)
      return model ? [{ ...entry, name: model.label }] : []
    })
  }

  private update(update: z.infer<typeof Update>, frame: Frame, at: number): void {
    if (update.sessionUpdate === 'usage_update') {
      const usage = z.object({ used: z.number().int().nonnegative(), size: z.number().int().positive() }).safeParse(update)
      if (usage.success) this.state.setContext({ used: usage.data.used, window: usage.data.size })
      const cost = SessionCost.safeParse(update).data?.cost
      if (cost?.currency === 'USD') this.sessionCost = cost.amount
      return
    }

    if (update.sessionUpdate === 'config_option_update' && update.configOptions) { this.catalog({ configOptions: update.configOptions }); return }
    if (update.sessionUpdate === 'current_mode_update' && update.currentModeId) {
      this.config = this.config.map((entry) => entry.category === 'mode' ? { ...entry, currentValue: update.currentModeId ?? entry.currentValue } : entry)
      this.publishConfig(); return
    }
    if (update.sessionUpdate === 'available_commands_update') {
      this.state.set({ commands: (update.availableCommands ?? []).map((command) => ({ name: command.name, description: command.description, argumentHint: command.input?.hint ?? null })) }); return
    }
    // session/load can replay the entire provider history before its response.
    if (!this.turn) return
    if (update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'agent_thought_chunk') {
      const text = Content.safeParse(update.content).data?.text ?? ''
      const kind = update.sessionUpdate === 'agent_message_chunk' ? 'assistant' : 'reasoning'
      const previous = this.turn.block ? this.items.get(this.turn.block) : undefined
      if (!previous || previous.kind !== kind) {
        if (previous?.kind === 'assistant' || previous?.kind === 'reasoning') this.items.put({ ...previous, streaming: false }, at)
        const id = `${kind}:${this.turn.ref}:${++this.turn.blocks}`
        this.items.put({ id, kind, text, streaming: true }, at)
        this.turn.block = id
      } else this.items.append(previous.id, text)
      if (kind === 'assistant') this.turn.text += text
    } else if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') this.tool(update, frame, at)
    else if (update.sessionUpdate === 'subagent_spawned') this.spawned(update, null)
    else if (update.sessionUpdate === 'subagent_state_update') {
      const subagent = this.subagents.get(SubagentState.safeParse(update).data?.subagentSessionId ?? '')
      if (subagent) this.report(subagent, at)
    } else if (update.sessionUpdate === 'plan') this.state.setTodos((update.entries ?? []).map((entry) => ({ content: entry.content, status: entry.status === 'completed' ? 'completed' : entry.status === 'in_progress' ? 'in_progress' : 'pending', activeForm: null })), this.turn.ref, at)
  }

  private tool(update: z.infer<typeof Update>, frame: Frame | null, at: number): void {
    if (!update.toolCallId) return
    const block = this.turn?.block ? this.items.get(this.turn.block) : null
    if (block?.kind === 'assistant' || block?.kind === 'reasoning') this.items.put({ ...block, streaming: false }, at)
    if (this.turn) this.turn.block = null
    const id = `tool:${update.toolCallId}`
    const previous = this.items.get(id)
    const old = previous?.kind === 'tool' ? previous : null
    const content = z.array(z.looseObject({ type: z.string(), content: z.unknown().optional(), path: z.string().optional(), oldText: z.string().nullish(), newText: z.string().optional() })).safeParse(update.content).data ?? []
    const blocks = content.flatMap((entry) => entry.type === 'content' ? [entry.content] : [])
    const images = this.options.keepImage ? keepImageBlocks(blocks, this.options.keepImage) : []
    if (images.length && frame) {
      const marked = markKeptImages(blocks, images)
      let index = 0
      const params = z.looseObject({ sessionId: z.string(), update: Update }).parse(frame.params)
      this.kept.set(JSON.stringify(frame), { ...frame, params: { ...params, update: { ...update, content: content.map((entry) => entry.type === 'content' ? { ...entry, content: marked[index++] } : entry) } } })
    }
    const output = takeImageMarkers(blocks.map((block) => Content.safeParse(block).data?.text ?? '').filter(Boolean).join('\n'))
    const raw = z.looseObject({ command: z.string().optional(), path: z.string().optional() }).safeParse(update.rawInput).data
    const input = this.dialect.toolInput ? this.dialect.toolInput(update.rawInput) : update.rawInput
    const name = this.toolName(update, old?.name)
    // A subagent's later updates send its brief back as { prompt: null } and close with its time,
    // not its report, which the agent keeps to the parent agent.
    const subagent = name === 'Task'
    const task = subagent ? z.looseObject({ description: z.string().optional() }).safeParse(update.rawInput).data : undefined
    const timing = subagent ? z.looseObject({ durationMs: z.number() }).safeParse(update.rawOutput).data : undefined
    const status = update.status === 'completed' ? 'done' : update.status === 'failed' ? 'failed' : old?.status ?? 'running'
    const exitCode = z.looseObject({ exitCode: z.number().int().nullish() }).safeParse(update.rawOutput).data?.exitCode ?? null
    this.items.put({
      id, kind: 'tool', name, title: raw?.command ?? raw?.path ?? task?.description ?? update.title ?? old?.title ?? name,
      input: input === undefined || (subagent && old) ? old?.input ?? null : shownInput(name, input), status,
      output: output.text ? clip(output.text) : update.rawOutput !== undefined && !subagent ? clip(typeof update.rawOutput === 'string' ? update.rawOutput : JSON.stringify(update.rawOutput)) : old?.output ?? null,
      ...(timing ? { metrics: { tools: old?.metrics?.tools ?? 0, tokens: 0, durationMs: timing.durationMs } } : old?.metrics ? { metrics: old.metrics } : {}),
      diffs: content.some((entry) => entry.type === 'diff') ? content.flatMap((entry) => entry.type === 'diff' && entry.path ? [{ path: entry.path, change: entry.oldText == null ? 'add' as const : 'update' as const, patch: clip(`--- ${entry.path}\n+++ ${entry.path}\n@@\n${(entry.oldText ?? '').split('\n').map((line) => `-${line}`).join('\n')}\n${(entry.newText ?? '').split('\n').map((line) => `+${line}`).join('\n')}`, 50_000) }] : []) : old?.diffs ?? [],
      ...(images.length || output.images.length ? { images: [...images, ...output.images] } : old?.images ? { images: old.images } : {}),
      ...(name === 'commandExecution' && (status === 'done' || status === 'failed') ? { execution: { status: status === 'done' ? 'completed' as const : 'failed' as const, exitCode } } : old?.execution ? { execution: old.execution } : {})
    }, at)
  }

  private spawned(update: z.infer<typeof Update>, parent: Subagent | null): void {
    const spawned = SubagentSpawned.safeParse(update).data
    const call = this.dialect.subagentCall?.(update) ?? null
    const card = parent?.card ?? (call ? `tool:${call}` : null)
    if (spawned && card) this.subagents.set(spawned.subagentSessionId, { card, text: '', said: '' })
  }

  // A subagent's own steps stay out of the chat, as Claude's and Codex's do: its card counts its
  // calls and reports its last words, which are what the agent hands back to the parent agent.
  private subagentUpdate(subagent: Subagent, update: z.infer<typeof Update>, at: number): void {
    if (update.sessionUpdate === 'agent_message_chunk') subagent.text += Content.safeParse(update.content).data?.text ?? ''
    else if (update.sessionUpdate === 'subagent_spawned') this.spawned(update, subagent)
    else if (update.sessionUpdate === 'tool_call') {
      if (subagent.text.trim()) subagent.said = subagent.text
      subagent.text = ''
      const card = this.items.get(subagent.card)
      if (card?.kind === 'tool') this.items.put({ ...card, metrics: { tools: (card.metrics?.tools ?? 0) + 1, tokens: 0, durationMs: card.metrics?.durationMs ?? 0 } }, at)
    }
  }

  private report(subagent: Subagent, at: number): void {
    const card = this.items.get(subagent.card)
    const report = (subagent.text.trim() ? subagent.text : subagent.said).trim()
    if (card?.kind === 'tool' && report) this.items.put({ ...card, output: clip(report) }, at)
  }

  private reverse(frame: Frame, at: number): void {
    if (frame.id === undefined) return
    const id = keyOf(frame.id)
    if (this.pending.has(id) || this.owed.has(id)) return
    // Word of something the chat already shows (Cursor's that a subagent ended, which its Task
    // call's own update carries).
    if (frame.method && this.dialect.requests?.acknowledged?.includes(frame.method)) {
      this.owed.set(id, result(frame.id, {})); return
    }
    if (!this.asked(frame.method)) {
      this.owed.set(id, { jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: 'Antumi does not handle this request' } })
      return
    }
    const scope = z.looseObject({ sessionId: z.string().optional() }).safeParse(frame.params).data?.sessionId
    if (!this.turn || (scope && scope !== this.session && !this.subagents.has(scope))) {
      this.owed.set(id, result(frame.id, { outcome: { outcome: 'cancelled' } })); return
    }
    const requests = this.dialect.requests
    if (frame.method === 'session/request_permission') {
      const request = Permission.safeParse(frame.params)
      if (request.success) {
        const itemId = `a:${id}`
        const tool = request.data.toolCall
        const prompt = this.dialect.permissionPrompt?.(frame.params)
        if (prompt?.kind === 'question') {
          this.pending.set(id, { rawId: frame.id, itemId, kind: 'permissionQuestion', options: request.data.options })
          this.items.put({ id: itemId, kind: 'question', requestId: id, questions: [{ id: 'question', header: '', question: prompt.text, options: request.data.options.filter((option) => option.kind === 'allow_once').map((option) => ({ id: option.optionId, label: option.name, description: null })), multiSelect: false }], answers: null, resolution: null }, at)
          return
        }
        // A subagent's call reaches Antumi only as this request, never with its result: a card made
        // from it would run until the turn ends. Its approval stands alone, as Claude's does.
        const announced = tool.toolCallId !== undefined && this.items.get(`tool:${tool.toolCallId}`)?.kind === 'tool'
        if (announced) this.tool({ ...tool, sessionUpdate: 'tool_call' }, null, at)
        const toolItem = tool.toolCallId ? this.items.get(`tool:${tool.toolCallId}`) : null
        const name = prompt?.kind === 'plan' ? 'ExitPlanMode' : toolItem?.kind === 'tool' ? toolItem.name : this.toolName(tool, undefined)
        // An edit of a reference project is refused here, whoever would have answered it.
        // Kimi's permission frame may omit the path its preceding tool_call already named.
        const announcedWrites = toolItem?.kind === 'tool' && toolItem.name === 'fileChange' ? toolItem.diffs.map((diff) => diff.path) : []
        if (toolItem?.kind === 'tool' && toolItem.name === 'fileChange' && toolItem.input) {
          let input: unknown
          try { input = JSON.parse(toolItem.input) } catch { /* A non-JSON input carries no file fields. */ }
          announcedWrites.push(...writtenPaths({ kind: 'edit', rawInput: input }))
        }
        const fenced = referencePathIn(this.options.references ?? [], [...writtenPaths(tool), ...announcedWrites])
        if (fenced) {
          const reject = request.data.options.find((option) => option.kind === 'reject_once')
          this.owed.set(id, result(frame.id, { outcome: reject ? { outcome: 'selected', optionId: reject.optionId } : { outcome: 'cancelled' } }))
          this.items.put({ id: itemId, kind: 'approval', requestId: id, tool: name, title: tool.title ?? fenced, detail: `参考项目只读，Antumi 已拒绝修改 ${fenced}`, toolItemId: tool.toolCallId ? `tool:${tool.toolCallId}` : null, decisions: ['allow', 'deny'], resolution: 'denied' }, at)
          return
        }
        this.pending.set(id, { rawId: frame.id, itemId, kind: 'permission', options: request.data.options, ...(prompt?.kind === 'plan' ? { planRunMode: prompt.runMode } : {}) })
        // The agent's reason for asking, as Cursor's "Not in allowlist: rg".
        const reason = z.array(z.looseObject({ content: z.unknown().optional() })).safeParse(tool.content).data?.map((entry) => Content.safeParse(entry.content).data?.text ?? '').find(Boolean)
        const detail = prompt?.text ?? (announced ? (tool.rawInput === undefined ? reason ?? null : clip(JSON.stringify(tool.rawInput))) : reason ? `子 Agent 的请求：${reason}` : '子 Agent 的请求')
        // A command quoted in backticks (as Cursor does); the bare command is what the request line names.
        const title = tool.title?.match(/^`([\s\S]+)`$/)?.[1] ?? tool.title ?? `${this.name} 工具调用`
        this.items.put({ id: itemId, kind: 'approval', requestId: id, tool: name, title, detail, toolItemId: tool.toolCallId ? `tool:${tool.toolCallId}` : null, decisions: ['allow', 'deny'], choices: request.data.options.map((option) => ({ id: option.optionId, label: option.name, decision: option.kind === 'allow_once' ? 'allow' : option.kind === 'allow_always' ? 'allowForSession' : 'deny', grants: option.kind.endsWith('_always') ? [{ kind: 'other', values: [option.name], scope: 'agent', behavior: option.kind === 'reject_always' ? 'deny' : 'allow' }] : [] })), ...(prompt?.kind === 'plan' ? { runModes: [prompt.runMode] } : {}), resolution: null }, at)
        return
      }
    } else if (requests?.question !== undefined && frame.method === requests.question) {
      const request = Questions.safeParse(frame.params)
      if (request.success) {
        const itemId = `q:${id}`
        this.pending.set(id, { rawId: frame.id, itemId, kind: 'question' })
        this.items.put({ id: itemId, kind: 'question', requestId: id, questions: request.data.questions.map((question) => ({ id: question.id, header: request.data.title ?? '', question: question.prompt, options: question.options.map((option) => ({ ...option, description: null })), multiSelect: question.allowMultiple ?? false })), answers: null, resolution: null }, at)
        return
      }
    } else if (requests?.plan && frame.method === requests.plan.method) {
      const request = Plan.safeParse(frame.params)
      if (request.success) {
        const itemId = `a:${id}`
        this.pending.set(id, { rawId: frame.id, itemId, kind: 'plan' })
        this.items.put({ id: itemId, kind: 'approval', requestId: id, tool: requests.plan.approvalTool ?? requests.plan.method, title: request.data.name ?? `${this.name} 计划`, detail: request.data.plan, toolItemId: null, decisions: ['allow', 'deny'], resolution: null }, at)
        return
      }
    }
    this.owed.set(id, { jsonrpc: '2.0', id: frame.id, error: { code: this.asked(frame.method) ? -32602 : -32601, message: 'Antumi does not handle this request or its parameters' } })
  }

  private cancelPending(at: number): void {
    for (const pending of this.pending.values()) {
      const item = this.items.get(pending.itemId)
      if (item?.kind === 'approval' || item?.kind === 'question') this.items.put({ ...item, resolution: 'cancelled' }, at)
    }
    this.pending.clear()
  }

  // Drops a trailing transport error from the reply, so the turn can say what happened.
  private peelProviderError(at: number): { summary: string; detail: string } | null {
    const turn = this.turn
    const peel = this.dialect.providerError
    if (!turn || !peel) return null
    const found = peel(turn.text)
    if (!found) return null
    turn.text = found.rest
    const items = this.items.list()
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index]
      if (item?.kind !== 'assistant') continue
      const piece = peel(item.text)
      if (!piece) continue
      this.items.put({ ...item, text: piece.rest, streaming: false }, at)
      break
    }
    return found
  }

  // A turn's tokens and cost, as its answer and the session's running cost tell them; nothing where
  // the agent reports neither (Cursor's CLI so far). The cost needs the total from before the turn.
  private turnMetering(result: unknown): Pick<Extract<ChatItem, { kind: 'turn' }>, 'usage' | 'metering'> {
    const used = this.reportedMetering(result)
    return used.metering && this.options.providerModels ? { ...used, metering: withoutCost(used.metering) } : used
  }

  private reportedMetering(result: unknown): Pick<Extract<ChatItem, { kind: 'turn' }>, 'usage' | 'metering'> {
    const tokens = TurnTokens.safeParse(z.looseObject({ usage: z.unknown() }).safeParse(result).data?.usage).data
    // To the micro-dollar: a difference of two totals leaves float dust (0.15000000000000002).
    const costUsd = this.sessionCost !== null && this.turnCost !== null ? Math.max(0, Math.round((this.sessionCost - this.turnCost) * 1e6) / 1e6) : null
    if (!tokens) return costUsd ? { metering: { models: [], calls: null, callsEstimated: false, reportedCostUsd: costUsd } } : {}
    const cacheRead = tokens.cachedReadTokens ?? null
    const cacheWrite = tokens.cachedWriteTokens ?? null
    const input = tokens.inputTokens + (cacheRead ?? 0) + (cacheWrite ?? 0)
    const output = tokens.outputTokens + (tokens.thoughtTokens ?? 0)
    const model = this.config.find((entry) => entry.category === 'model')?.currentValue ?? null
    return {
      usage: { input, output },
      metering: { models: [{ model, input, output, cacheRead, cacheWrite, cacheWrite1h: null, costUsd }], calls: null, callsEstimated: false, reportedCostUsd: costUsd }
    }
  }

  private finish(state: ChatTurnState, error: string | null, at: number, used: Pick<Extract<ChatItem, { kind: 'turn' }>, 'usage' | 'metering'> = {}): void {
    const turn = this.turn
    if (!turn) return
    if (state !== 'completed') this.execution = null
    this.cancelPending(at)
    for (const item of this.items.list()) if ((item.kind === 'assistant' || item.kind === 'reasoning') && item.streaming) this.items.put({ ...item, streaming: false }, at)
    this.items.settleTools(state === 'failed' ? 'failed' : 'interrupted', at)
    this.items.put({ id: `turn:${turn.ref}`, kind: 'turn', state, error, durationMs: at - turn.began, ...used }, at)
    if (turn.text) this.messages.push({ role: 'assistant', text: turn.text, eventKey: `chat:${turn.ref}:assistant`, complete: state === 'completed' })
    this.queue.turnEnded(state)
    this.state.endTurn()
    this.turn = null
  }
}

// What an error says beyond its JSON-RPC title ("Invalid params"): Cursor puts the reason in data.message.
function errorDetail(data: unknown): string | null {
  const message = z.looseObject({ message: z.string() }).safeParse(data).data?.message.trim()
  return message || null
}
