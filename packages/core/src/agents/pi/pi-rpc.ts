import { z } from 'zod'
import { browserToolKind, CONTEXT_COMPACTED, takeImageMarkers, type ChatDiff, type ChatImage, type ChatItem, type ChatModel, type ChatOption, type ChatTurnActivity, type ChatTurnState, type ModelTokens } from '@antumi/protocol'
import { offeredCommand } from '../../agent-commands'
import { AntumiRequests } from '../../antumi-requests'
import { describeBrowserTool, showBrowserInput } from '../../browser-tools'
import { addedPatch, editPatch } from '../../chat-diff'
import { withoutCost } from '../../model-metering'
import { messageText, type ChatAnswer, type ChatDriver, type ChatImageFile, type ChatOutgoing, type ChatRecord, type ChatStageOptions, type StageMessage } from '../../chat-driver'
import { ChatItems, clip } from '../../chat-items'
import { ChatQueue } from '../../chat-queue'
import { StageState } from '../../chat-stage-state'
import { keepImageBlocks, markKeptImages, stripImageBytes } from '../../image-frames'
import { Rejection } from '../../rejection'
import { piStartMode } from './pi-command'
import { parsePiModelId, PiModel, piModelId, piModels } from './pi-models'
import { isPiMode, PI_MODE_COMMAND, type PiMode } from './pi-modes'

const MAX_PATCH = 50_000

// A command Antumi sends, and Pi's answer to it, which echoes its id.
const Command = z.looseObject({ id: z.string().optional(), type: z.string(), message: z.string().optional(), streamingBehavior: z.string().optional(), provider: z.string().optional(), modelId: z.string().optional(), level: z.string().optional() })
type Command = z.infer<typeof Command>
const Response = z.looseObject({ type: z.literal('response'), id: z.string().optional(), command: z.string(), success: z.boolean(), data: z.unknown().optional(), error: z.string().optional() })
const Event = z.looseObject({ type: z.string() })
const State = z.looseObject({ model: PiModel.nullish(), thinkingLevel: z.string().nullish(), sessionFile: z.string().nullish(), messageCount: z.number().optional() })
const Models = z.looseObject({ models: z.array(PiModel) })
const Commands = z.looseObject({ commands: z.array(z.looseObject({ name: z.string(), description: z.string().nullish(), source: z.string().nullish() })) })
const Disposition = z.looseObject({ disposition: z.string() })
const Usage = z.looseObject({ input: z.number().catch(0), output: z.number().catch(0), cacheRead: z.number().catch(0), cacheWrite: z.number().catch(0), cost: z.looseObject({ total: z.number().catch(0) }).optional() })
type Usage = z.infer<typeof Usage>
const Block = z.looseObject({ type: z.string(), text: z.string().optional(), thinking: z.string().optional() })
const Message = z.looseObject({
  role: z.string(),
  content: z.union([z.string(), z.array(Block)]).optional(),
  stopReason: z.string().optional(),
  errorMessage: z.string().optional(),
  diagnostics: z.array(z.looseObject({ error: z.looseObject({ message: z.string() }).optional() })).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  usage: Usage.optional()
})
const MessageEvent = z.looseObject({ message: Message })
const MessageUpdate = z.looseObject({ assistantMessageEvent: z.looseObject({ type: z.string(), contentIndex: z.number().optional(), delta: z.string().optional() }), usage: Usage.optional() })
const ToolEvent = z.looseObject({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  partialResult: z.looseObject({ content: z.array(z.unknown()).optional() }).optional(),
  // structuredContent is bash's exit and output, read's text (a string), or an MCP tool's own.
  result: z.looseObject({ content: z.array(z.unknown()).optional(), structuredContent: z.unknown().optional(), details: z.unknown().optional() }).optional(),
  isError: z.boolean().optional()
})
const UiRequest = z.looseObject({ id: z.string(), method: z.string(), message: z.string().optional(), notifyType: z.string().optional() })
const TextBlock = z.looseObject({ type: z.literal('text'), text: z.string() })

// Dialogs an extension opens wait for an answer; Antumi shows none of them, so each is put aside.
const DIALOGS: ReadonlySet<string> = new Set(['select', 'confirm', 'input', 'editor'])
// What Antumi itself asks: the state, the models and the commands, before the stage is ready.
const HANDSHAKE = { state: 'pi-state', models: 'pi-models', commands: 'pi-commands' } as const
const PLAN_SAVED = '计划已保存到任务里，等它依赖的任务完成后再执行。现在不要实现，也不要再修改计划，回复一句确认即可。'
const PLAN_RUN = '按这个计划开始执行。'
// Pi has no plan mode of its own: the model is told it plans, ahead of each message in plan mode,
// and Antumi's extension refuses what would change anything.
const PLAN_NOTE = '（Antumi 规划模式：只读代码、搜索文件，不要修改任何东西；在回复里给出完整的计划，用户确认后才会执行。）'

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const text = (blocks: readonly unknown[]) => blocks.flatMap((block) => { const parsed = TextBlock.safeParse(block); return parsed.success ? [parsed.data.text] : [] }).join('\n')

type Metered = { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }
type Turn = {
  ref: string
  began: number
  // The prompt's request id, so its answer can end a turn that never started.
  request: string | null
  mode: PiMode
  messages: number
  // The last assistant message that said anything: the reply, and in plan mode the plan.
  reply: string
  error: string | null
  models: Map<string, Metered>
  calls: number
}
type Steer = { text: string; images: ChatImage[]; ref: string | undefined }

// Pi's tools as the chat labels them: a command, a file read, edited or written, a search.
function toolName(name: string): string {
  switch (name) {
    case 'bash':
    case 'powershell':
      return 'commandExecution'
    case 'read':
      return 'Read'
    case 'edit':
      return 'Edit'
    case 'write':
      return 'Write'
    case 'grep':
      return 'Grep'
    case 'find':
    case 'ls':
      return 'Glob'
    default:
      return name
  }
}

function toolTitle(name: string, args: Record<string, unknown>): string {
  const browser = browserToolKind(name)
  if (browser) return describeBrowserTool(browser, args)
  const command = str(args.command)
  if (command) return command.split('\n')[0] ?? command
  if (name === 'grep') return [str(args.pattern), str(args.path)].filter(Boolean).join(' · ')
  if (name === 'find') return [str(args.pattern), str(args.path)].filter(Boolean).join(' · ')
  return str(args.path) ?? str(args.pattern) ?? name
}

function toolInput(name: string, args: Record<string, unknown>): string | null {
  if (name === 'bash' || name === 'powershell') return str(args.command) ? clip(String(args.command)) : null
  if (['read', 'edit', 'write', 'grep', 'find', 'ls'].includes(name)) return null
  const browser = browserToolKind(name)
  if (browser && !showBrowserInput(browser)) return null
  return Object.keys(args).length ? clip(JSON.stringify(args, null, 2), 4000) : null
}

// What an edit or a write changes, from its arguments: Pi's edit replaces oldText with newText, or
// each of edits[] in turn.
function toolDiffs(name: string, args: Record<string, unknown>): ChatDiff[] {
  const path = str(args.path)
  if (!path) return []
  if (name === 'write') return [{ path, change: 'add', patch: clip(addedPatch(str(args.content) ?? ''), MAX_PATCH) }]
  if (name !== 'edit') return []
  const edits = z.array(z.looseObject({ oldText: z.string().catch(''), newText: z.string().catch('') })).safeParse(args.edits).data
    ?? [{ oldText: str(args.oldText) ?? '', newText: str(args.newText) ?? '' }]
  return [{ path, change: 'update', patch: clip(edits.map((edit) => editPatch(edit.oldText, edit.newText)).join('\n'), MAX_PATCH) }]
}

// The diff Pi's edit reports once applied (details.patch, unified, with line numbers and context):
// better than one made from its arguments. Its ---/+++ header goes; the chat names the file itself.
function appliedDiff(name: string, path: string | null, details: unknown): ChatDiff | null {
  const patch = z.looseObject({ patch: z.string() }).safeParse(details).data?.patch
  if (name !== 'edit' || !patch || !path) return null
  const body = patch.split('\n').filter((line) => !line.startsWith('--- ') && !line.startsWith('+++ ')).join('\n').replace(/\n$/, '')
  return { path, change: 'update', patch: clip(body, MAX_PATCH) }
}

// Speaks Pi's RPC mode: commands on stdin, answers and events on stdout, one JSON object a line.
// Everything it knows comes from apply(), so a stage rebuilt from its log ends up the same.
export class PiRpc implements ChatDriver {
  readonly items: ChatItems
  private readonly state: StageState
  private readonly antumi: AntumiRequests
  private readonly queue = new ChatQueue()
  // Commands sent and not yet answered, by id.
  private readonly requests = new Map<string, Command>()
  private readonly optionErrors = new Map<string, string>()
  private readonly owed = new Map<string, unknown>()
  private readonly initial = new Map<string, unknown>()
  private initialChoices: Array<{ option: 'model' | 'effort'; value: string }> = []
  private readonly kept = new Map<string, unknown>()
  private readonly sentIds = new Set<string>()
  private readonly steering = new Map<string, Steer>()
  // Plans waiting for the user, by request id, until a message answers them.
  private readonly plans = new Map<string, string>()
  private stateRead = false
  private modelsRead = false
  private models: PiModel[] = []
  private model: PiModel | null = null
  private effort: string | null = null
  private sessionFile: string | null = null
  // Pi writes its session file once the first message is in it: only then is there one to resume.
  private persisted = false
  private mode: PiMode
  private exited = false
  private startError: string | null = null
  private lost = false
  private serial = 0
  private turns = 0
  private stopping = false
  private turn: Turn | null = null
  private messages: StageMessage[] = []

  constructor(private readonly stageId: string, private readonly options: ChatStageOptions, private readonly catalogOnly = false) {
    this.items = new ChatItems(stageId)
    this.state = new StageState(this.items)
    this.antumi = new AntumiRequests(this.items)
    this.mode = piStartMode(options)
  }

  apply(record: ChatRecord): void {
    if (record.dir === 'out' && record.ref && record.references) this.items.rememberReferences(record.ref, record.references)
    if (record.dir === 'in') this.receive(record.frame, record.at)
    else if (record.dir === 'out') this.sent(record.frame, record.at, record.ref, record.images ?? [])
    else if (record.dir === 'queue') this.queue.apply(record)
    else if (record.dir === 'note') this.items.notice(record.level, record.text, record.at, {
      ...(record.id !== undefined ? { id: record.id } : {}),
      ...(record.action !== undefined ? { action: record.action } : {})
    })
    else if (record.dir === 'item') this.items.put(record.item, record.at)
    else if (record.dir === 'ask') this.antumi.apply(record)
    else if (record.dir === 'answer') {
      // A plan put aside (see waitingPlans); any other answer is to Antumi's own question.
      if (this.plans.has(record.requestId)) this.resolvePlan(record.requestId, record.resolution, null, record.at)
      else this.antumi.apply(record)
    } else if (record.dir === 'exit') {
      this.exited = true
      this.antumi.cancelAll(record.at)
      if (!this.ready() && this.options.resume && /session/i.test(record.stderr) && /not found|no such|does not exist|ENOENT/i.test(record.stderr)) this.lost = true
      this.finish(this.stopping ? 'interrupted' : 'failed', this.startError ?? (record.stderr.trim() || 'Pi 进程已退出'), record.at)
      for (const requestId of [...this.plans.keys()]) this.resolvePlan(requestId, 'cancelled', null, record.at)
    }
    this.publishOptions()
    this.state.set({ queued: this.queue.first, queue: this.queue.view, steerable: this.canSteer() })
    this.state.publish(record.at)
  }

  due(): unknown[] {
    if (this.exited) return []
    const frames = [...this.owed.values()]
    if (this.startError) return frames
    const handshake = [
      ...(this.sentIds.has(HANDSHAKE.state) ? [] : [{ id: HANDSHAKE.state, type: 'get_state' }]),
      ...(this.sentIds.has(HANDSHAKE.models) ? [] : [{ id: HANDSHAKE.models, type: 'get_available_models' }]),
      ...(this.catalogOnly || this.sentIds.has(HANDSHAKE.commands) ? [] : [{ id: HANDSHAKE.commands, type: 'get_commands' }])
    ]
    if (handshake.length) return [...frames, ...handshake]
    if (this.catalogOnly || !this.stateRead || !this.modelsRead) return frames
    return [...frames, ...[...this.initial].filter(([id]) => !this.sentIds.has(id)).map(([, frame]) => frame)]
  }

  ready(): boolean { return this.stateRead && this.modelsRead && this.initial.size === 0 && this.initialChoices.length === 0 && !this.startError && !this.exited }
  failure(): string | null { return this.startError ?? (this.exited && !this.stateRead ? 'Pi 进程已退出' : null) }
  sessionLost(): boolean { return this.lost }
  activeTurnRef(): string | null { return this.turn?.ref ?? null }
  activity(): ChatTurnActivity { return this.antumi.pending || (!this.turn && this.plans.size) ? 'awaiting' : this.turn || this.changing() ? 'running' : 'idle' }
  providerSessionId(): string | null { return this.persisted ? this.sessionFile : null }
  canSteer(): boolean { return Boolean(this.turn) && !this.stopping }
  queuedToSend() { return this.ready() && !this.turn && !this.changing() ? this.queue.next() : null }
  takeMessages(): StageMessage[] { const taken = this.messages; this.messages = []; return taken }
  waitingPlans(): string[] { return this.turn ? [] : [...this.plans.keys()] }

  explainFailure(stderr: string): string | null {
    if (/No API key found/i.test(stderr)) return '没有可用的模型：在终端运行 pi，用 /login 登录模型服务商，或设置服务商的 API key'
    if (/unknown (option|flag)|--mode/i.test(stderr)) return `这个 Pi 版本不支持 Antumi 的启动参数，请升级 Pi`
    return null
  }

  send(text: string, images: readonly ChatImageFile[] = []): ChatOutgoing {
    if (!this.ready()) throw new Rejection('chat-starting', 'Pi 尚未就绪')
    if (this.turn) throw new Rejection('chat-busy', 'Pi 正在处理上一条消息')
    if (this.changing()) throw new Rejection('chat-option-changing', '请等待 Pi 确认配置变更')
    return this.prompt(this.next('prompt'), text, images)
  }

  // Into the running turn: Pi takes it after the tools now running, before its next model call.
  steer(text: string, images: readonly ChatImageFile[] = []): ChatOutgoing {
    if (!this.canSteer()) throw new Rejection('chat-no-steer', '没有可以追加消息的回合')
    return this.prompt(this.next('steer'), text, images, 'steer')
  }

  private prompt(id: string, message: string, images: readonly ChatImageFile[], streamingBehavior?: 'steer'): ChatOutgoing {
    if (images.length && !this.model?.input?.includes('image')) throw new Rejection('chat-images-unsupported', '当前 Pi 模型不支持图片输入')
    const logged = { id, type: 'prompt', message, ...(streamingBehavior ? { streamingBehavior } : {}) }
    const note = this.mode === 'plan' && !streamingBehavior ? `${PLAN_NOTE}\n\n` : ''
    const wire = { ...logged, message: `${note}${message}`, ...(images.length ? { images: images.map((image) => ({ type: 'image', data: Buffer.from(image.read()).toString('base64'), mimeType: image.mime })) } : {}) }
    return { wire, logged }
  }

  private next(kind: string): string { return `pi-${kind}-${this.serial + 1}` }

  setOption(option: ChatOption, value: string): unknown[] {
    if (!this.ready()) throw new Rejection('chat-starting', 'Pi 尚未就绪')
    if (this.turn) throw new Rejection('chat-busy', '请在回合结束后切换模式或模型')
    if (this.changing()) throw new Rejection('chat-option-changing', '请等待 Pi 确认上一项配置变更')
    return [this.change(option, value, this.next('option'))]
  }

  private change(option: ChatOption, value: string, id: string): unknown {
    if (option === 'permissionMode') {
      if (this.options.planOnly && value !== 'plan') throw new Rejection('plan-only', '此阶段只能规划')
      if (this.options.readOnly && value !== 'readOnly') throw new Rejection('plan-only', '只读成员不能换模式')
      if (!this.permissionModes().includes(value)) throw new Rejection('chat-option-invalid', `Pi 不支持 ${value}`)
      return { id, type: 'prompt', message: `/${PI_MODE_COMMAND} ${value}` }
    }
    if (option === 'model') {
      const parsed = parsePiModelId(value)
      if (!parsed || !this.offered().some((model) => model.id === value)) throw new Rejection('chat-option-invalid', `Pi 没有提供模型 ${value}`)
      return { id, type: 'set_model', provider: parsed.provider, modelId: parsed.modelId }
    }
    const current = this.offered().find((model) => model.id === (this.model ? piModelId(this.model) : null))
    if (!current?.efforts.includes(value)) throw new Rejection('chat-option-invalid', `当前模型不支持 effort: ${value}`)
    return { id, type: 'set_thinking_level', level: value }
  }

  private changing(): boolean {
    return [...this.requests.values()].some((request) => request.type === 'set_model' || request.type === 'set_thinking_level' || modeCommand(request) !== null)
  }

  optionResult(frame: unknown): { pending: boolean; error: string | null } {
    const id = Command.safeParse(frame).data?.id
    return id === undefined ? { pending: false, error: null } : { pending: this.requests.has(id), error: this.optionErrors.get(id) ?? null }
  }

  respond(requestId: string, answer: ChatAnswer): unknown[] {
    if (!this.plans.has(requestId)) throw new Rejection('chat-request-gone', '这个请求已结束')
    if (this.turn) throw new Rejection('chat-busy', 'Pi 正在处理上一条消息')
    // Keeping it for later, or sending it back, is one more turn in plan mode; carrying it out is
    // the next turn, in the mode picked for it.
    if (answer.saved) return [this.prompt(this.next('prompt'), PLAN_SAVED, []).wire]
    if (answer.decision === 'deny') return [this.prompt(this.next('prompt'), answer.message ? `继续规划：${answer.message}` : '继续规划：请完善这个计划后再给我。', []).wire]
    if (this.options.planOnly || this.options.readOnly) throw new Rejection('plan-only', '此阶段只能规划，请先保存计划')
    const mode = answer.mode ?? (answer.decision === 'allowForSession' ? 'acceptEdits' : 'ask')
    if (mode === 'plan' || !this.permissionModes().includes(mode)) throw new Rejection('chat-option-invalid', `Pi 不能在 ${mode} 模式执行计划`)
    const switched = { id: this.next('option'), type: 'prompt', message: `/${PI_MODE_COMMAND} ${mode}` }
    const run = { id: `pi-prompt-${this.serial + 2}`, type: 'prompt', message: PLAN_RUN }
    return [switched, run]
  }

  interrupt(): unknown[] {
    if (!this.turn) throw new Rejection('chat-idle', '没有正在执行的回合')
    return [{ id: this.next('abort'), type: 'abort' }]
  }

  logged(frame: unknown): unknown | null {
    const event = Event.safeParse(frame).data
    if (!event) return null
    const kept = this.kept.get(JSON.stringify(frame))
    this.kept.delete(JSON.stringify(frame))
    switch (event.type) {
      // Covered by the frames that complete them, or nothing the chat shows.
      case 'message_update':
      case 'tool_execution_update':
      case 'queue_update':
      case 'agent_start':
      case 'turn_start':
      case 'turn_end':
      case 'agent_end':
      case 'session_info_changed':
      case 'compaction_start':
      case 'auto_retry_start':
        return null
      // An assistant message's start numbers its blocks; the message itself comes with its end.
      case 'message_start':
        return MessageEvent.safeParse(frame).data?.message.role === 'assistant' ? { type: 'message_start', message: { role: 'assistant' } } : null
      case 'message_end': {
        const message = MessageEvent.safeParse(frame).data?.message
        // The system prompt and every tool result: the tools' own events carry what the chat shows.
        if (!message || (message.role !== 'assistant' && message.role !== 'user')) return null
        return { type: 'message_end', message: { ...message, content: typeof message.content === 'string' ? message.content : (message.content ?? []).map(({ type, text, thinking }) => ({ type, ...(text !== undefined ? { text } : {}), ...(thinking !== undefined ? { thinking } : {}) })) } }
      }
      case 'extension_ui_request': {
        const method = UiRequest.safeParse(frame).data?.method
        return method && (DIALOGS.has(method) || method === 'notify') ? frame : null
      }
      case 'response': {
        const response = Response.safeParse(frame).data
        // What is read of the bulky answers; the rest go as they are.
        if (response?.command === 'get_messages' || response?.command === 'get_session_stats') return null
        return stripImageBytes(kept ?? frame)
      }
      default:
        return stripImageBytes(kept ?? frame)
    }
  }

  private sent(raw: unknown, at: number, ref: string | undefined, images: readonly ChatImage[]): void {
    const parsed = Command.safeParse(raw)
    if (!parsed.success) return
    const frame = parsed.data
    if (frame.type === 'extension_ui_response' && frame.id) { this.owed.delete(frame.id); return }
    if (!frame.id) return
    this.sentIds.add(frame.id)
    this.requests.set(frame.id, frame)
    this.serial++
    if (frame.type === 'abort') { this.stopping = true; return }
    if (frame.type !== 'prompt') return
    const mode = modeCommand(frame)
    if (mode) { this.mode = mode; return }
    const message = frame.message ?? ''
    if (frame.streamingBehavior === 'steer') { this.steering.set(frame.id, { text: message, images: [...images], ref }); return }
    const eventRef = ref ?? `pi:${this.turns + 1}`
    this.turns++
    this.queue.sent(ref)
    this.answerPlans(at)
    this.open(eventRef, frame.id, message, images, at)
  }

  private open(ref: string, request: string | null, message: string, images: readonly ChatImage[], at: number): void {
    this.stopping = false
    this.turn = { ref, began: at, request, mode: this.mode, messages: 0, reply: '', error: null, models: new Map(), calls: 0 }
    this.state.set({ turnUsage: null })
    this.items.put({ id: `u:${ref}`, kind: 'user', text: message, images: [...images] }, at)
    this.messages.push({ role: 'user', text: messageText(message, images), eventKey: `chat:${ref}:user`, complete: false })
  }

  // A message answers the plans waiting by the mode it goes in: plan keeps planning, any other
  // carries them out.
  private answerPlans(at: number): void {
    const resolution = this.mode === 'plan' ? 'denied' : this.mode === 'ask' ? 'allowed' : 'allowedForSession'
    for (const requestId of [...this.plans.keys()]) this.resolvePlan(requestId, resolution, this.mode === 'plan' ? null : this.mode, at)
  }

  private resolvePlan(requestId: string, resolution: 'allowed' | 'allowedForSession' | 'denied' | 'cancelled', mode: PiMode | null, at: number): void {
    const itemId = this.plans.get(requestId)
    this.plans.delete(requestId)
    const item = itemId ? this.items.get(itemId) : undefined
    if (item?.kind === 'approval') this.items.put({ ...item, resolution, ...(mode ? { mode } : {}) }, at)
  }

  private receive(raw: unknown, at: number): void {
    const response = Response.safeParse(raw)
    if (response.success) { this.answered(response.data, at); return }
    const event = Event.safeParse(raw).data
    if (!event) return
    switch (event.type) {
      case 'message_start': {
        const message = MessageEvent.safeParse(raw).data?.message
        if (message?.role === 'assistant' && this.turn) this.turn.messages++
        return
      }
      case 'message_update': return this.streamed(raw, at)
      case 'message_end': return this.messageEnd(raw, at)
      case 'tool_execution_start':
      case 'tool_execution_update':
      case 'tool_execution_end': return this.tool(event.type, raw, at)
      case 'auto_retry_start': {
        const retry = z.looseObject({ attempt: z.number(), maxAttempts: z.number() }).safeParse(raw).data
        this.state.set({ activity: retry ? `请求失败，重试中（${retry.attempt}/${retry.maxAttempts}）` : '请求失败，重试中' })
        return
      }
      case 'auto_retry_end': {
        const retry = z.looseObject({ success: z.boolean(), finalError: z.string().optional() }).safeParse(raw).data
        this.state.set({ activity: null })
        if (this.turn && retry) this.turn.error = retry.success ? null : retry.finalError ?? this.turn.error
        return
      }
      case 'compaction_start':
        this.state.set({ activity: '正在压缩上下文' })
        return
      case 'compaction_end': {
        this.state.set({ activity: null })
        if (!z.looseObject({ aborted: z.literal(true) }).safeParse(raw).success) this.items.notice('info', CONTEXT_COMPACTED, at)
        return
      }
      case 'thinking_level_changed': {
        const level = z.looseObject({ level: z.string() }).safeParse(raw).data?.level
        if (level) this.effort = level
        return
      }
      case 'agent_settled': {
        const turn = this.turn
        if (!turn) return
        const state = this.stopping ? 'interrupted' : turn.error ? 'failed' : 'completed'
        this.finish(state, state === 'failed' ? turn.error : null, at)
        if (state === 'completed' && turn.mode === 'plan' && turn.reply.trim()) this.offerPlan(turn, at)
        return
      }
      case 'extension_ui_request': {
        const request = UiRequest.safeParse(raw).data
        if (!request) return
        if (DIALOGS.has(request.method)) this.owed.set(request.id, { type: 'extension_ui_response', id: request.id, cancelled: true })
        else if (request.method === 'notify' && request.message) this.items.notice(request.notifyType === 'error' ? 'error' : request.notifyType === 'warning' ? 'warning' : 'info', request.message, at)
        return
      }
      case 'extension_error': {
        const error = z.looseObject({ error: z.string() }).safeParse(raw).data?.error
        if (error) this.items.notice('warning', `Pi 扩展出错：${error}`, at)
        return
      }
    }
  }

  private answered(response: z.infer<typeof Response>, at: number): void {
    const id = response.id
    const request = id ? this.requests.get(id) : undefined
    if (!id || !request) return
    this.requests.delete(id)
    const initial = this.initial.has(id)
    this.initial.delete(id)
    if (!response.success) {
      const error = response.error ?? `Pi 拒绝了 ${response.command}`
      if (id === HANDSHAKE.state || id === HANDSHAKE.models) { this.startError = `Pi ${response.command}: ${error}`; return }
      if (id === HANDSHAKE.commands) return
      if (initial && request.type === 'set_model' && this.onProviderModel('model')) { this.startError = `Pi 没能切到服务商的模型：${error}`; return }
      if (initial) { this.items.notice('warning', `Pi 未采用保存的${request.type === 'set_model' ? '模型' : ' effort'}：${error}`, at); this.nextInitial(at); return }
      const mode = modeCommand(request)
      if (mode) {
        this.optionErrors.set(id, error)
        this.items.notice('error', `Pi 没能切换到 ${mode}：${error}`, at)
        return
      }
      if (request.type === 'set_model' || request.type === 'set_thinking_level') { this.optionErrors.set(id, error); return }
      if (request.type === 'prompt') {
        const steer = this.steering.get(id)
        if (steer) { this.steered(id, error, at); return }
        if (this.turn?.request === id) this.finish(this.stopping ? 'interrupted' : 'failed', this.explainFailure(error) ?? error, at)
      }
      return
    }
    switch (request.type) {
      case 'get_state': {
        const state = State.safeParse(response.data).data
        this.stateRead = true
        this.sessionFile = state?.sessionFile ?? null
        // A resumed session has its file already. Pi opens a file that is gone as a new, empty
        // session rather than failing (1.3.0): that is a session lost, to start afresh from a handoff.
        if (this.options.resume) {
          this.persisted = true
          if (state?.messageCount === 0) {
            this.lost = true
            this.startError = 'Pi 的会话文件已不存在'
            return
          }
        }
        this.model = state?.model && state.model.provider !== 'unknown' ? state.model : null
        this.effort = state?.thinkingLevel ?? null
        if (this.model?.contextWindow) this.state.setContext({ used: this.state.current.context?.used ?? 0, window: this.model.contextWindow })
        this.afterHandshake(at)
        return
      }
      case 'get_available_models':
        this.models = Models.safeParse(response.data).data?.models ?? []
        this.modelsRead = true
        if (this.catalogOnly) this.state.set({ models: piModels(this.models, this.model ? piModelId(this.model) : null) })
        this.afterHandshake(at)
        return
      case 'get_commands': {
        const commands = Commands.safeParse(response.data).data?.commands ?? []
        this.state.set({ commands: commands.filter((command) => command.name !== PI_MODE_COMMAND).map((command) => offeredCommand(command.name, command.description, null)) })
        return
      }
      case 'set_model': {
        const model = PiModel.safeParse(response.data).data ?? this.models.find((each) => each.provider === request.provider && each.id === request.modelId) ?? null
        if (model) this.model = model
        if (initial) this.nextInitial(at)
        return
      }
      case 'set_thinking_level':
        if (request.level) this.effort = request.level
        if (initial) this.nextInitial(at)
        return
      case 'prompt': {
        const disposition = Disposition.safeParse(response.data).data?.disposition
        if (modeCommand(request)) return
        const steer = this.steering.get(id)
        if (steer) { this.steered(id, null, at, disposition === 'started'); return }
        // A command Pi ran itself, without the model: the turn is over.
        if (disposition === 'handled' && this.turn?.request === id) this.finish('completed', null, at)
        return
      }
    }
  }

  // Pi's answer to a message sent into the turn: taken, it shows as the user's; refused, it waits
  // for the turn's end, saying why. One that came as the run ended starts the next.
  private steered(id: string, error: string | null, at: number, started = false): void {
    const message = this.steering.get(id)
    if (!message) return
    this.steering.delete(id)
    if (error) {
      if (message.ref) this.queue.add(message.text, message.ref, message.images)
      this.items.notice('info', `没能插进正在进行的这一轮（${error}），已排到回合结束后发送`, at)
      return
    }
    const ref = message.ref ?? `pi:${++this.turns}`
    this.queue.sent(message.ref)
    if (started && !this.turn) { this.open(ref, id, message.text, message.images, at); return }
    this.items.put({ id: `u:${ref}`, kind: 'user', text: message.text, images: message.images, steer: true }, at)
    this.messages.push({ role: 'user', text: messageText(message.text, message.images), eventKey: `chat:${ref}:user`, complete: false })
  }

  // The state and the models are in: the remembered model and effort follow, where they differ.
  private afterHandshake(at: number): void {
    if (!this.stateRead || !this.modelsRead || this.catalogOnly) return
    if (!this.model && this.models.length === 0) {
      this.startError = '没有可用的模型：在终端运行 pi，用 /login 登录模型服务商，或设置服务商的 API key'
      return
    }
    const preferred = this.options.preferred ?? {}
    // On a model provider it starts on one of the provider's models, whatever Pi's own default is.
    const model = preferred.model ?? this.options.providerModels?.find((each) => each.isDefault)?.id ?? this.options.providerModels?.[0]?.id
    this.initialChoices = [
      ...(model ? [{ option: 'model' as const, value: model }] : []),
      ...(preferred.effort ? [{ option: 'effort' as const, value: preferred.effort }] : [])
    ]
    this.nextInitial(at)
  }

  private nextInitial(at: number): void {
    while (this.initialChoices.length) {
      const choice = this.initialChoices.shift()
      if (!choice) return
      const current = choice.option === 'model' ? (this.model ? piModelId(this.model) : null) : this.effort
      // A resumed session keeps what it last ran with; setting it again costs a round trip.
      if (current === choice.value) continue
      try {
        const id = `pi-initial-${choice.option}`
        this.initial.set(id, this.change(choice.option, choice.value, id))
        return
      } catch {
        if (this.onProviderModel(choice.option)) { this.startError = `Pi 没有提供服务商的模型 ${choice.value}`; return }
        this.items.notice('warning', `Pi 未采用保存的 ${choice.option === 'model' ? '模型' : 'effort'}: ${choice.value}`, at)
      }
    }
  }

  private permissionModes(): string[] {
    if (this.options.planOnly) return ['plan']
    if (this.options.readOnly) return ['readOnly']
    return ['ask', 'acceptEdits', 'plan', 'readOnly', ...(this.options.allowBypass ? ['bypass'] : [])]
  }

  // The models it offers: a model provider's in place of Pi's own list, which has the user's too.
  private offered(): ChatModel[] {
    return this.options.providerModels ? [...this.options.providerModels] : piModels(this.models, this.model ? piModelId(this.model) : null)
  }

  // A stage on a model provider never runs on another model: one it cannot take fails the start.
  private onProviderModel(option: 'model' | 'effort'): boolean {
    return option === 'model' && this.options.providerModels !== undefined
  }

  private publishOptions(): void {
    if (this.catalogOnly) return
    this.state.set({
      permissionMode: this.mode,
      permissionModes: this.permissionModes(),
      model: this.model ? piModelId(this.model) : null,
      models: this.offered(),
      effort: this.effort
    })
  }

  private streamed(raw: unknown, at: number): void {
    const turn = this.turn
    const update = MessageUpdate.safeParse(raw).data
    if (!turn || !update) return
    const event = update.assistantMessageEvent
    if (event.type === 'text_delta' || event.type === 'thinking_delta') {
      const kind = event.type === 'text_delta' ? 'assistant' : 'reasoning'
      const id = `${kind}:${turn.ref}:${turn.messages}:${event.contentIndex ?? 0}`
      if (this.items.get(id)) this.items.append(id, event.delta ?? '')
      else this.items.put({ id, kind, text: event.delta ?? '', streaming: true }, at)
    }
    if (update.usage) {
      const done = [...turn.models.values()].reduce((sum, used) => ({ input: sum.input + used.input + used.cacheRead + used.cacheWrite, output: sum.output + used.output }), { input: 0, output: 0 })
      this.state.set({ turnUsage: { input: done.input + update.usage.input + update.usage.cacheRead + update.usage.cacheWrite, output: done.output + update.usage.output } })
    }
  }

  private messageEnd(raw: unknown, at: number): void {
    const message = MessageEvent.safeParse(raw).data?.message
    const turn = this.turn
    if (!message) return
    // Pi keeps the session once a message is in it.
    if (message.role === 'user') { this.persisted = true; return }
    if (message.role !== 'assistant' || !turn) return
    const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content ?? []
    let reply = ''
    blocks.forEach((block, index) => {
      const kind = block.type === 'text' ? 'assistant' : block.type === 'thinking' ? 'reasoning' : null
      const body = block.type === 'text' ? block.text : block.thinking
      if (!kind || !body?.trim()) return
      this.items.put({ id: `${kind}:${turn.ref}:${turn.messages}:${index}`, kind, text: body, streaming: false }, at)
      if (kind === 'assistant') reply += body
    })
    if (reply.trim()) turn.reply = reply
    if (message.stopReason === 'error' && !this.stopping) turn.error = message.errorMessage ?? message.diagnostics?.find((entry) => entry.error)?.error?.message ?? 'Pi 请求失败'
    const usage = message.usage
    if (usage) {
      const model = message.provider && message.model ? `${message.provider}/${message.model}` : this.model ? piModelId(this.model) : 'unknown'
      const sum = turn.models.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
      turn.models.set(model, { input: sum.input + usage.input, output: sum.output + usage.output, cacheRead: sum.cacheRead + usage.cacheRead, cacheWrite: sum.cacheWrite + usage.cacheWrite, cost: sum.cost + (usage.cost?.total ?? 0) })
      turn.calls++
      const used = usage.input + usage.cacheRead + usage.cacheWrite + usage.output
      if (used > 0) this.state.setContext({ used, window: this.model?.contextWindow ?? this.state.current.context?.window ?? null })
    }
  }

  private tool(type: string, raw: unknown, at: number): void {
    const event = ToolEvent.safeParse(raw).data
    if (!event || !this.turn) return
    const id = `tool:${event.toolCallId}`
    const previous = this.items.get(id)
    const old = previous?.kind === 'tool' ? previous : null
    const args = event.args ?? {}
    const name = toolName(event.toolName)
    const ended = type === 'tool_execution_end'
    const blocks = ended ? event.result?.content ?? [] : event.partialResult?.content ?? []
    // A screenshot comes back as an image block: kept in the store, its marker in the log.
    const images = ended && this.options.keepImage ? keepImageBlocks(blocks, this.options.keepImage) : []
    if (images.length) this.kept.set(JSON.stringify(raw), { ...z.looseObject({}).parse(raw), result: { ...event.result, content: markKeptImages(blocks, images) } })
    const output = takeImageMarkers(text(blocks))
    const status = ended ? (event.isError ? (this.stopping ? 'interrupted' : 'failed') : 'done') : 'running'
    const exited = /exited with code (\d+)/.exec(output.text)?.[1]
    const exitCode = z.looseObject({ exit_code: z.number().int() }).safeParse(event.result?.structuredContent).data?.exit_code ?? (exited === undefined ? null : Number(exited))
    // Its end carries no arguments: the file is the one its start named.
    const applied = ended && !event.isError ? appliedDiff(event.toolName, str(args.path) ?? old?.diffs[0]?.path ?? null, event.result?.details) : null
    this.items.put({
      id, kind: 'tool', name,
      title: old?.title ?? toolTitle(event.toolName, args),
      input: old ? old.input : toolInput(event.toolName, args),
      status,
      output: output.text ? clip(output.text) : old?.output ?? null,
      diffs: applied ? [applied] : old?.diffs.length ? old.diffs : toolDiffs(event.toolName, args),
      ...(images.length || output.images.length ? { images: [...images, ...output.images] } : old?.images ? { images: old.images } : {}),
      ...(name === 'commandExecution' && ended ? { execution: { status: event.isError ? 'failed' as const : 'completed' as const, exitCode } } : {})
    }, at)
  }

  private offerPlan(turn: Turn, at: number): void {
    const requestId = `plan:${turn.ref}`
    const itemId = `a:${requestId}`
    this.items.put({ id: itemId, kind: 'approval', requestId, tool: 'plan', title: '计划', detail: turn.reply, toolItemId: null, decisions: ['allow', 'allowForSession', 'deny'], resolution: null }, at)
    this.plans.set(requestId, itemId)
  }

  private metering(turn: Turn): Pick<Extract<ChatItem, { kind: 'turn' }>, 'usage' | 'metering'> {
    if (!turn.models.size) return {}
    const models: ModelTokens[] = [...turn.models].map(([model, used]) => ({
      model,
      // Input with what the cache served and took, as Antumi counts it.
      input: used.input + used.cacheRead + used.cacheWrite,
      output: used.output,
      cacheRead: used.cacheRead,
      cacheWrite: used.cacheWrite,
      cacheWrite1h: null,
      costUsd: Math.round(used.cost * 1e6) / 1e6
    }))
    const cost = Math.round(models.reduce((sum, model) => sum + (model.costUsd ?? 0), 0) * 1e6) / 1e6
    return {
      usage: { input: models.reduce((sum, model) => sum + model.input, 0), output: models.reduce((sum, model) => sum + model.output, 0) },
      // On a model provider, Pi's price is the model's list price, not what the provider charges.
      metering: this.options.providerModels ? withoutCost({ models, calls: turn.calls, callsEstimated: false, reportedCostUsd: cost }) : { models, calls: turn.calls, callsEstimated: false, reportedCostUsd: cost }
    }
  }

  private finish(state: ChatTurnState, error: string | null, at: number): void {
    const turn = this.turn
    if (!turn) return
    for (const item of this.items.list()) if ((item.kind === 'assistant' || item.kind === 'reasoning') && item.streaming) this.items.put({ ...item, streaming: false }, at)
    this.items.settleTools(state === 'failed' ? 'failed' : 'interrupted', at)
    this.items.put({ id: `turn:${turn.ref}`, kind: 'turn', state, error, durationMs: at - turn.began, ...this.metering(turn) }, at)
    if (turn.reply) this.messages.push({ role: 'assistant', text: turn.reply, eventKey: `chat:${turn.ref}:assistant`, complete: state === 'completed' })
    this.queue.turnEnded(state)
    this.state.endTurn()
    this.state.set({ turnUsage: null })
    this.stopping = false
    this.turn = null
  }
}

// The mode a command switches Pi to, for Antumi's /antumi-mode; null for any other command.
function modeCommand(command: Command): PiMode | null {
  if (command.type !== 'prompt' || !command.message?.startsWith(`/${PI_MODE_COMMAND} `)) return null
  const mode = command.message.slice(PI_MODE_COMMAND.length + 2).trim()
  return isPiMode(mode) ? mode : null
}
